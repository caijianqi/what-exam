# -*- coding: utf-8 -*-
"""
行测题库解析管线 v3 —— 从 PDF 提取结构化题目。

核心思路：
  * 不信任 PDF block 的文本顺序，把每页 span 按几何位置聚类成「视觉行」
    （同一 y 的 spans 合成一行、行内按 x 排序），用行流 + 图片流重建阅读顺序。
    这样 2x2 选项网格、双列排版、跨栏粘连都能正确处理。
  * 题号行要求 x0 缩进（首行缩进 86pt 左右），避免把 "12.5万亿元" 之类小数行误判为题号。
  * 上下标/分数：span 字号大于正文字号且基线偏上/偏下 => <sup>/<sub>。
  * 资料分析材料区（含表格图形位图）独立成组，挂到随后的题目上。

用法：
    python pipeline/extract.py            # 全量
    python pipeline/extract.py data       # 单模块

产出：pipeline/out/questions.raw.json + images/*.png + _debug_<module>.txt
"""

import fitz
import json
import os
import re
import sys
import collections

SRC_DIR = r"C:\Users\caiji\Downloads\1"
BASE = r"D:\project\what-exam\pipeline"
OUT_DIR = os.path.join(BASE, "out")
IMG_DIR = os.path.join(OUT_DIR, "images")

DPI = 200
CJK = r"\u4e00-\u9fff"
HEADER_WORDS = {"内部资料 免费交流", "内部资料免费交流"}
MODULE_TITLES = {"数量关系", "判断推理", "言语理解与表达", "资料分析"}

SUBJECTS = [
    dict(key="quant", name="数量关系", prefix="SL", total=120),
    dict(key="logic", name="判断推理", prefix="PD", total=130),
    dict(key="verbal", name="言语理解与表达", prefix="YY", total=130),
    dict(key="data", name="资料分析", prefix="ZL", total=120),
]

Q_HEAD = re.compile(r"^(\d{1,3})\s*[\.．]\s?(.*)$", re.S)
MAT_HEAD = re.compile(r"^([一二三四五六七八九十]{1,3})\s*、\s*根据以下资料")
# 篇章阅读（言语理解与表达尾部）：「阅读以下文段，回答问题：」+ 长材料，
# 供后续若干题共用。该标记常与上一题的最后一个选项粘在同一视觉行，需先切分。
PASS_MARK = re.compile(r"阅读以下(?:文段|材料|文字|文章)\s*[，,、]?\s*回答(?:下列)?(?:各)?问题\s*[：:]")
# 选项标签：排除题干中的字母列举（「A、B 两地」「A、B、C 和」），
# 但不误杀图形选项标签行「B. B C. C」（内容是孤立字母）
# atomic group (?>...) 防止 \s* 回溯绕过环视
OPT_HEAD = re.compile(
    r"(?<![0-9A-Za-z\u4e00-\u9fff])([ABCD])(?>\s*[\.．、]\s*)"
    r"(?!(?>[B-D]\s*[\u4e00-\u9fff]))"
    r"(?!(?>[B-D][、，]))")
# 无点标签（个别排版丢点，如「A ②、④」）：仅在行首合法，且内容不以汉字开头
OPT_HEAD_SP = re.compile(
    r"(?<![0-9A-Za-z\u4e00-\u9fff])([ABCD])\s+(?=[^\u4e00-\u9fff])(?![B-D])")
ANS_HEAD = re.compile(r"^(\d{1,3})\s*[\.．]\s*【答案】\s*([A-Da-d])\s*[。．、]?\s*(.*)$", re.M)
SHORT_RE = re.compile(r"^[\d\s，。?？．\.%°/+\-*/=()（）∶:]+$")
GRAPHIC_STEM = re.compile(r"从所给选项中")

# ------------------------------------------------------------------ 文本工具

RANGE = r"[" + CJK + r"，。、；：？！）】》”’%℃]"
CJK_WS = re.compile(RANGE + r"\s+" + r"(?=" + RANGE + r")")
WS_RUN = re.compile(r"[ \t\u3000]{2,}")
TAG_SPLIT = re.compile(r"(<sup>.*?</sup>|<sub>.*?</sub>)")


def clean(s: str) -> str:
    s = s.replace("\u3000", " ").replace("\xa0", " ")
    parts = TAG_SPLIT.split(s)
    out = []
    for p in parts:
        if p.startswith("<sup>") or p.startswith("<sub>"):
            out.append(p)
        else:
            p = re.sub(r"[\n\r]+", "", p)
            p = re.sub(r"(?<=[^>]) {2,}(?=[^<])", " ", p)
            out.append(p)
    res = "".join(out)
    res = re.sub(r"\s+(</(sup|sub)>)", r"\2", res)
    res = re.sub(r"(<(sup|sub)>)\s+", r"\1", res)
    return re.sub(r"[ \t]{2,}", " ", res).strip()


def clean_plain(s: str) -> str:
    s = s.replace("\u3000", " ").replace("\xa0", " ")
    s = re.sub(r"[\n\r]+", "", s)
    s = CJK_WS.sub("", s)
    # 标点前不留空格（PDF 分 span 产生的 "A 、 B" -> "A、B"）
    s = re.sub(r"\s+([、，。；：？！）】》”’%])", r"\1", s)
    s = re.sub(r"([（《“‘【])\s+", r"\1", s)
    return WS_RUN.sub(" ", s).strip()


def is_short_fragment(t: str) -> bool:
    t = t.strip()
    return bool(t) and len(t) <= 10 and bool(SHORT_RE.match(t))


# ------------------------------------------------------------------ 行流构建


def page_lines(doc, pno):
    """把一页的 span 聚类成视觉行。返回 [(rect, text, spans)]，按 (y,x) 排序。"""
    page = doc[pno]
    ph = page.rect.height
    spans = []
    d = page.get_text("dict")
    for blk in d.get("blocks", []):
        if blk.get("type", 0) != 0:
            continue
        for ln in blk.get("lines", []):
            for sp in ln.get("spans", []):
                if sp.get("text") and sp["text"].strip():
                    spans.append(sp)

    # y 聚类（容差 4pt）
    spans.sort(key=lambda s: ((s["bbox"][1] + s["bbox"][3]) / 2, s["bbox"][0]))
    rows, cur, cur_y = [], [], None
    for sp in spans:
        yc = (sp["bbox"][1] + sp["bbox"][3]) / 2
        if cur_y is None or abs(yc - cur_y) <= 4.0:
            cur.append(sp)
            cur_y = yc if cur_y is None else (cur_y + yc) / 2
        else:
            rows.append(cur)
            cur, cur_y = [sp], yc
    if cur:
        rows.append(cur)

    lines = []
    for row in rows:
        row.sort(key=lambda s: s["bbox"][0])
        x0 = min(s["bbox"][0] for s in row)
        y0 = min(s["bbox"][1] for s in row)
        x1 = max(s["bbox"][2] for s in row)
        y1 = max(s["bbox"][3] for s in row)
        text = clean_plain(" ".join(s["text"] for s in row))
        if not text:
            continue
        yc = (y0 + y1) / 2
        tns = text.replace(" ", "")
        if "免费交流" in tns and len(tns) < 14:
            continue
        if yc < 95 and (text in MODULE_TITLES or re.fullmatch(r"\d{1,3}", text)):
            continue
        if re.fullmatch(r"\d{1,3}", text) and (yc > ph - 130 or yc < 80):
            continue
        if text in MODULE_TITLES and (x1 - x0) < 220:
            continue
        lines.append((fitz.Rect(x0, y0, x1, y1), text, row))

    lines.sort(key=lambda L: (round(L[0].y0 / 4), L[0].x0))
    return lines


def page_images(doc, pno):
    page = doc[pno]
    pw, ph = page.rect.width, page.rect.height
    out = []
    for ii in page.get_image_info():
        x0, y0, x1, y1 = ii["bbox"]
        w, h = x1 - x0, y1 - y0
        # 宽扁的表格位图（如「表 某高校…调查数据」h≈52）不能按 60 阈值丢掉
        if w < 60 or h < 30:
            continue
        # 整页背景/水印图（覆盖整个正文区）
        if w > 350 and h > 480:
            continue
        if w * h > pw * ph * 0.6:
            continue
        out.append(fitz.Rect(x0, y0, x1, y1))
    return out


def page_vector_regions(doc, pno, min_gap=18):
    """收集页面矢量绘图（图形推理的矢量图），聚类成区域。"""
    page = doc[pno]
    rects = []
    try:
        drs = page.get_drawings()
    except Exception:
        return []
    for drw in drs:
        r = drw["rect"]
        if r is None or r.is_empty:
            continue
        if r.y1 < 105:                       # 页眉
            continue
        if r.width < 4 and r.height < 4:     # 微点
            continue
        if r.width > 380 and r.height < 6:   # 分隔长横线
            continue
        if r.width < 25 and r.height < 25:   # 零散小笔画不单独成区
            rects.append(fitz.Rect(r))
            continue
        rects.append(fitz.Rect(r))
    if not rects:
        return []
    # 聚类合并
    changed = True
    while changed:
        changed = False
        out = []
        for r in rects:
            merged = False
            for i, o in enumerate(out):
                ex = fitz.Rect(o.x0 - min_gap, o.y0 - min_gap, o.x1 + min_gap, o.y1 + min_gap)
                if ex.intersects(r):
                    out[i] = o | r
                    merged = True
                    changed = True
                    break
            if not merged:
                out.append(fitz.Rect(r))
        rects = out
    # 过滤：只留像"图"的区域（宽高足够）
    res = []
    for r in rects:
        w, h = r.width, r.height
        if w >= 90 and h >= 60 and not (w > 350 and h > 480):
            res.append(r)
    return res


def crop(doc, pno, rect, dest):
    page = doc[pno]
    clip = fitz.Rect(rect.x0 - 2, rect.y0 - 2, rect.x1 + 2, rect.y1 + 2) & page.rect
    if clip.is_empty or clip.width < 4 or clip.height < 4:
        return None
    pix = page.get_pixmap(clip=clip, dpi=DPI)
    pix.save(dest)
    return dest


def spans_to_html(spans):
    """span 列表 -> 受限 HTML（sup/sub）。输入需已按行/列排序。"""
    spans = [s for s in spans if s["text"].strip()]
    if not spans:
        return ""
    sizes = collections.Counter(round(s["size"], 1) for s in spans)
    base_size = sizes.most_common(1)[0][0]

    rows, cur, cur_y = [], [], None
    for sp in spans:
        yc = (sp["bbox"][1] + sp["bbox"][3]) / 2
        if cur_y is None or abs(yc - cur_y) <= 3.0:
            cur.append(sp)
            cur_y = yc if cur_y is None else cur_y
        else:
            rows.append((cur_y, cur))
            cur, cur_y = [sp], yc
    if cur:
        rows.append((cur_y, cur))

    main = max(rows, key=lambda r: sum(len(s["text"]) for s in r[1]))
    base_y = sum((s["bbox"][1] + s["bbox"][3]) / 2 for s in main[1]) / len(main[1])

    buf = []
    for _, row in rows:
        for sp in sorted(row, key=lambda s: s["bbox"][0]):
            txt, yc, size = sp["text"], (sp["bbox"][1] + sp["bbox"][3]) / 2, round(sp["size"], 1)
            if size > base_size + 0.6 and len(txt.strip()) <= 6:
                if yc < base_y - 1.5:
                    buf.append("<sup>%s</sup>" % txt.strip())
                    continue
                if yc > base_y + 3.0:
                    buf.append("<sub>%s</sub>" % txt.strip())
                    continue
            buf.append(txt)
    return clean("".join(buf))


# ------------------------------------------------------------------ 答案解析


def parse_answers(doc):
    buf = ""
    for i in range(len(doc)):
        buf += doc[i].get_text("text") + "\n"
    starts = [(m.start(), int(m.group(1)), m.group(2).upper())
              for m in ANS_HEAD.finditer(buf)]
    answers = {}
    for i, (pos, no, ans) in enumerate(starts):
        end = starts[i + 1][0] if i + 1 < len(starts) else len(buf)
        body = buf[pos:end]
        mm = ANS_HEAD.search(body)
        if mm:
            # 只切掉「N.【答案】X」头部，保留解析正文（mm.end() 会吃掉首行）
            body = body[mm.end(2):]
        body = re.sub(r"^\s*[。．、]?\s*解析\s*[：:]\s*", "", body)
        body = clean_plain(body)
        if no in answers:
            answers[no]["analysis"] += " " + body
        else:
            answers[no] = dict(answer=ans, analysis=body)
    return answers


# ------------------------------------------------------------------ 主提取


def extract_module(subj, do_images=True):
    name, prefix = subj["name"], subj["prefix"]
    doc = fitz.open(os.path.join(SRC_DIR, name + "-题目.pdf"))
    ans_doc = fitz.open(os.path.join(SRC_DIR, name + "-答案.pdf"))
    answers = parse_answers(ans_doc)

    # 行流 + 图片流合并（按 页/y/x）；图片 key 右移 8pt：
    # 贴近题号行上方的图（bbox 含空白边）应归属题号之后的题
    stream = []
    for pi in range(len(doc)):
        for rect, text, row in page_lines(doc, pi):
            stream.append(("line", pi, rect, text, row))
        for rect in page_images(doc, pi):
            stream.append(("img", pi, rect, None, None))
        # 矢量图区域：
        #  * logic  —— 图形推理的矢量绘制图
        #  * data   —— 用矢量网格线画的表格（无位图，单元格文字会被行流打散，需整块裁图）
        if subj["key"] in ("logic", "data"):
            for vrect in page_vector_regions(doc, pi):
                # 与已有位图重叠的跳过
                if any(vrect.intersects(r) and (vrect & r).get_area() > 0.5 * min(vrect.get_area(), r.get_area())
                       for r in page_images(doc, pi)):
                    continue
                stream.append(("img" if subj["key"] == "logic" else "vimg", pi, vrect, None, None))
    stream.sort(key=lambda e: (e[1], round((e[2].y0 + (8 if e[0] == "img" else 0)) / 4), e[2].x0))
    print(f"  [{subj['key']}] 页={len(doc)} 行流={len(stream)} 答案={len(answers)}")

    questions, materials = [], {}
    cur, mat, last_group = None, None, None
    n_pass = 0
    img_seq = collections.Counter()

    def close_q():
        nonlocal cur
        if cur is not None:
            questions.append(cur)
            cur = None

    def gapfill_cur(boundary_pno, boundary_y):
        """当前题的选项区是「空标签行 + 字形图」（图无法定位）时，
        把最后一行到边界之间的空隙整块裁成选项图。"""
        if cur is None:
            return
        if any(it["kind"] == "img" for it in cur["raw"]):
            return
        lines = [it for it in cur["raw"] if it["kind"] == "line"]
        if not lines:
            return
        if not any(re.match(r"^[A-D]\s*[\.．]\s*[A-D]\s*[\.．]", it["text"]) for it in lines):
            return
        # 裁图起点：第一个空标签行之前的最后一行底部（标签可能嵌在图中间）
        first_label = next(i for i, it in enumerate(lines)
                           if re.match(r"^[A-D]\s*[\.．]\s*[A-D]\s*[\.．]", it["text"]))
        pre = lines[:first_label]
        pno = (pre[-1] if pre else lines[first_label])["pno"]
        if pre:
            y0 = pre[-1]["rect"].y1 + 2
        else:
            y0 = lines[first_label]["rect"].y0 - 2
        if pno == boundary_pno:
            y1 = boundary_y - 2
        else:
            y1 = doc[pno].rect.height - 55
        if y1 - y0 < 30:
            return
        img_seq["fig"] += 1
        fn = "%s-fig-%03d.png" % (prefix, img_seq["fig"])
        grect = fitz.Rect(65, y0, 462, y1)
        if do_images and crop(doc, pno, grect, os.path.join(IMG_DIR, fn)):
            cur["raw"].append(dict(kind="img", pno=pno, rect=grect, _file=fn))

    for kind, pno, rect, text, row in stream:
        if kind in ("img", "vimg"):
            if mat is not None:
                mat["imgs"].append((pno, rect))
                # 材料区图片（表格/柱状图/饼图）按出现顺序插入材料内容流
                mat["content"].append(dict(t="img", pno=pno, rect=rect,
                                           _vtab=(kind == "vimg")))
            elif cur is not None and kind == "img":
                cur["raw"].append(dict(kind="img", pno=pno, rect=rect))
            continue

        # ---- 篇章阅读标记：可能粘在上一题最后一个选项后面
        pm = PASS_MARK.search(text)
        if pm:
            head = text[:pm.start()].strip()
            if head and cur is not None:
                cur["raw"].append(dict(kind="line", pno=pno, rect=rect, text=head,
                                       short=is_short_fragment(head)))
            gapfill_cur(pno, rect.y0)
            close_q()
            n_pass += 1
            mat = dict(group="篇章%d" % n_pass, lines=[], imgs=[], content=[],
                       suppress=[], sticky=True)
            materials[len(materials)] = mat
            last_group = len(materials) - 1
            first = pm.group(0) + (" " + text[pm.end():].strip() if text[pm.end():].strip() else "")
            mat["lines"].append(first)
            mat["content"].append(dict(t="text", v=first))
            continue

        m = MAT_HEAD.match(text)
        if m:
            gapfill_cur(pno, rect.y0)
            close_q()
            mat = dict(group=m.group(1), lines=[], imgs=[], content=[], suppress=[])
            materials[len(materials)] = mat
            last_group = len(materials) - 1
            continue

        if mat is not None and not Q_HEAD.match(text):
            # 落在矢量表格区域内的单元格文字：阅读顺序不可靠，交给整块裁图
            mat["lines"].append(text)
            # 记下几何，供「矢量表格整块裁图」后处理剔除单元格文字
            mat["content"].append(dict(t="text", v=text, _pno=pno,
                                       _y0=rect.y0, _y1=rect.y1))
            continue

        qm = Q_HEAD.match(text)
        if qm and rect.x0 > 80:            # 题号行必须首行缩进
            no = int(qm.group(1))
            ok = cur is None or no == cur["no"] + 1
            if ok:
                gapfill_cur(pno, rect.y0)
                close_q()
                mat = None                 # 题目开始 => 材料区结束
                cur = dict(no=no, raw=[], mat_group=last_group,
                           first_opt=None, short_blocks=[])
                body = qm.group(2).strip()
                if body:
                    cur["raw"].append(dict(kind="line", pno=pno, rect=rect, text=body, short=is_short_fragment(body)))
                continue
        if cur is None:
            continue
        cur["raw"].append(dict(kind="line", pno=pno, rect=rect, text=text,
                               short=is_short_fragment(text)))

    gapfill_cur(-1, 0)
    close_q()

    # ---- 材料区图片裁剪（资料分析表格/图表、篇章阅读插图）
    mseq = collections.Counter()
    for g, m in materials.items():
        content = m["content"]
        # 矢量网格表格：单元格文字的阅读顺序不可靠，改为「整块裁图」，
        # 并剔除裁图范围内（可跨页）的文字行
        vt_at = next(((i, c) for i, c in enumerate(content)
                      if c.get("t") == "img" and c.get("_vtab")), None)
        if vt_at:
            k, vt = vt_at
            key = (vt["pno"], vt["rect"].y0 - 4)
            dropped, kept = [], []
            for i, c in enumerate(content):
                if c.get("t") == "text" and (c.get("_pno", -1), c.get("_y0", 0)) >= key:
                    dropped.append(c)
                elif c.get("t") == "img" and c.get("_vtab"):
                    continue
                else:
                    kept.append((i, c))
            regions = [(vt["pno"], vt["rect"].y0 - 2,
                        max(vt["rect"].y1, doc[vt["pno"]].rect.height - 55))]
            bypg = collections.defaultdict(list)
            for c in dropped:
                bypg[c["_pno"]].append(c)
            for pg in sorted(bypg):
                if pg <= vt["pno"]:
                    continue
                regions.append((pg, 68, max(c["_y1"] for c in bypg[pg]) + 4))
            imgs = []
            for pg, y0, y1 in regions:
                mseq[g] += 1
                fn = "%s-mat%02d-%02d.png" % (prefix, g + 1, mseq[g])
                if do_images and crop(doc, pg, fitz.Rect(58, y0, 466, y1),
                                      os.path.join(IMG_DIR, fn)):
                    imgs.append(dict(t="img", v=fn))
            # 插到原 vtab 所在的位置（保留「说明文字在图前」的阅读顺序）
            pos = sum(1 for i, _ in kept if i < k)
            kept = [c for _, c in kept]
            kept[pos:pos] = imgs
            content = kept

        new_content = []
        for c in content:
            if c.get("t") != "img":
                c.pop("_pno", None)
                c.pop("_y0", None)
                c.pop("_y1", None)
                new_content.append(c)
                continue
            if c.get("v"):                  # 已裁剪（矢量表格展开图）
                new_content.append(dict(t="img", v=c["v"]))
                continue
            mseq[g] += 1
            fn = "%s-mat%02d-%02d.png" % (prefix, g + 1, mseq[g])
            if do_images and crop(doc, c["pno"], c["rect"], os.path.join(IMG_DIR, fn)):
                new_content.append(dict(t="img", v=fn))
        m["content"] = new_content
        m["text"] = "\n".join(c["v"] for c in new_content if c["t"] == "text").strip()
        m["nimg"] = mseq[g]
    print(f"  [{subj['key']}] 切出 {len(questions)} 题 / 材料 {len(materials)} 组"
          f" / 材料图 {sum(mseq.values())}")

    # ---- 判断推理图形推理（62-91）兜底：无图也无空标签行的题，
    # 把「题干行→下一题号行/页底」的空隙整块裁图
    # （该区间的部分图形由字体字形绘制，既非位图也非 path 矢量，只能按版面空隙裁）
    if subj["key"] == "logic":
        for idx, q in enumerate(questions):
            if not (62 <= q["no"] <= 91):
                continue
            if any(it["kind"] == "img" for it in q["raw"]):
                continue
            first = next((it for it in q["raw"] if it["kind"] == "line"), None)
            if not first:
                continue
            pno = first["pno"]
            y0 = first["rect"].y1 + 2
            nxt = questions[idx + 1] if idx + 1 < len(questions) else None
            nfirst = next((it for it in nxt["raw"] if it["kind"] == "line"), None) if nxt else None
            if nfirst and nfirst["pno"] == pno:
                y1 = nfirst["rect"].y0 - 2
            else:
                y1 = doc[pno].rect.height - 55
            if y1 - y0 < 50:
                continue
            img_seq["fig"] += 1
            fn = "%s-fig-%03d.png" % (prefix, img_seq["fig"])
            grect = fitz.Rect(65, y0, 462, y1)
            if do_images and crop(doc, pno, grect, os.path.join(IMG_DIR, fn)):
                q["raw"].insert(1, dict(kind="img", pno=pno, rect=grect, _file=fn))

    out = []
    for q in questions:
        out.append(structure(doc, q, prefix, answers, materials, img_seq, do_images))
    return out, materials


# ------------------------------------------------------------------ 结构化


def structure(doc, q, prefix, answers, materials, img_seq, do_images):
    qid = "%s-%03d" % (prefix, q["no"])
    stem_lines = []                     # [(pno, rect, text)]
    stem_rects = []                     # 已裁剪 stem 图的 (pno, rect)
    opt_rows = collections.defaultdict(list)    # key -> [(pno, rect, rawtext, s, e)]
    opt_expect = 0
    short_blocks = []
    stem_images, opt_images = [], []
    first_opt_y = None                  # (pno, y0)
    frac_cropped = False

    # ---- 预处理：紧凑碎片簇（分数选项/分数题干）裁为图片
    items = q["raw"]
    merged, i = [], 0
    while i < len(items):
        it = items[i]
        if it["kind"] != "line":
            merged.append(it)
            i += 1
            continue
        cluster = [it]
        j = i
        while (j + 1 < len(items) and items[j + 1]["kind"] == "line"
               and items[j + 1]["pno"] == it["pno"]
               and 0 < items[j + 1]["rect"].y0 - cluster[-1]["rect"].y0 < 12):
            j += 1
            cluster.append(items[j])
        if len(cluster) >= 2 and (sum(1 for c in cluster if c.get("short")) >= 1
                                  or len(cluster) >= 3):
            pno = cluster[0]["pno"]
            x0 = min(c["rect"].x0 for c in cluster)
            x1 = max(c["rect"].x1 for c in cluster)
            y0 = min(c["rect"].y0 for c in cluster)
            y1 = max(c["rect"].y1 for c in cluster)
            rect = fitz.Rect(min(x0, 65), y0 - 2, max(x1, 460), y1 + 2)
            merged.append(dict(kind="img", pno=pno, rect=rect, _frac=True))
            frac_cropped = True
            i = j + 1
        else:
            merged.append(it)
            i += 1
    q["raw"] = merged

    for item in q["raw"]:
        if item["kind"] == "img":
            slot = "opt" if opt_expect >= 4 else "stem"
            if item.get("_file"):
                fn = item["_file"]
                (stem_images if slot == "stem" else opt_images).append(fn)
                if slot == "stem":
                    stem_rects.append((item["pno"], item["rect"]))
                continue
            img_seq[slot] += 1
            fn = "%s-%s-%03d.png" % (prefix, "s" if slot == "stem" else "o", img_seq[slot])
            if do_images and crop(doc, item["pno"], item["rect"], os.path.join(IMG_DIR, fn)):
                (stem_images if slot == "stem" else opt_images).append(fn)
                stem_rects.append((item["pno"], item["rect"]))
            continue

        pno, rect, text = item["pno"], item["rect"], item["text"]
        if item.get("short") and opt_expect == 0:
            short_blocks.append((pno, rect, text))
            continue

        hits = [(m.group(1), m.start(), m.end()) for m in OPT_HEAD.finditer(text)]
        if opt_expect == 0:
            # 无点标签（「A ②、④」）仅当出现在行首时视为选项
            hits += [(m.group(1), m.start(), m.end())
                     for m in OPT_HEAD_SP.finditer(text) if m.start() == 0
                     and not any(h[1] == m.start() for h in hits)]
            hits.sort(key=lambda h: h[1])
            # 选项区开始的标志：首个选项标签必须顶行首；
            # 行中间的「A、B、C」只是题干列举，不算选项区
            if not any(h[1] == 0 for h in hits):
                hits = []
        seq = []
        for ch, s, e in hits:
            idx = "ABCD".index(ch)
            if idx == opt_expect:
                seq.append((ch, s, e))
                opt_expect += 1
            elif idx < opt_expect:
                break
        if seq:
            if first_opt_y is None:
                first_opt_y = (pno, rect.y0)
            for i, (ch, s, e) in enumerate(seq):
                end = seq[i + 1][1] if i + 1 < len(seq) else len(text)
                opt_rows[ch].append((pno, rect, text, e, end))
            continue

        if opt_expect >= 1:
            # 选项区内的续行 -> 接到最后一个已收选项
            last = "ABCD"[opt_expect - 1]
            if opt_rows:
                opt_rows[last].append((pno, rect, text, 0, len(text)))
            continue

        stem_lines.append((pno, rect, text))

    # ---- stem 文本
    stem_html = "\n".join(t for _, _, t in stem_lines if t).strip()

    # ---- 图形区渲染（题干区含多个孤立小块：矢量图形题）
    fig_files = []
    if len(short_blocks) >= 2:
        by_page = collections.defaultdict(list)
        for pno, rect, t in short_blocks:
            by_page[pno].append(rect)
        prev_y = {}   # 每页最后一个常规 stem 行的 y1
        for pno, rect, t in stem_lines:
            prev_y[pno] = max(prev_y.get(pno, 0), rect.y1)
        for pno, rects in by_page.items():
            y0 = min(r.y0 for r in rects)
            y1 = max(r.y1 for r in rects)
            # 向上扩到最后一个常规行底部，向下扩到第一个选项行顶部
            if pno in prev_y and prev_y[pno] <= y0:
                y0 = prev_y[pno]
            if first_opt_y and first_opt_y[0] == pno and first_opt_y[1] >= y1:
                y1 = first_opt_y[1]
            y0 = max(y0 - 2, 70)
            y1 = min(y1 + 2, doc[pno].rect.height - 55)
            img_seq["fig"] += 1
            fn = "%s-fig-%03d.png" % (prefix, img_seq["fig"])
            if do_images and crop(doc, pno, fitz.Rect(65, y0, 462, y1), os.path.join(IMG_DIR, fn)):
                fig_files.append(fn)
        # 从 stem 文本里剔除短块
        sb = set((p, round(r.y0, 1)) for p, r, _ in short_blocks)
        stem_lines = [(p, r, t) for p, r, t in stem_lines
                      if (p, round(r.y0, 1)) not in sb]
        stem_html = "\n".join(t for _, _, t in stem_lines if t).strip()

    # ---- 选项文本（用行内切片 + 整行 spans 渲染）
    options = []
    for ch in "ABCD":
        rows = opt_rows.get(ch)
        if not rows:
            continue
        parts = []
        for pno, rect, text, s, e in rows:
            sub = text[s:e].strip()
            if not sub:
                continue
            parts.append(clean_plain(sub))
        options.append(dict(key=ch, text=" ".join(parts).strip()))

    # ---- 图形选项题后处理：
    #  选项为图形（折线图/饼状图/图形推理/分数碎片图）时，标签收得到但文本为空。
    #  4 张独立图（2x2 网格）=> 按标签位置就近配图；单张合成大图 => 整图留题干。
    GRAPHIC_HINT = re.compile(r"从所给选项中|从所给的四个选项中|折线图|饼状图|饼图|哪个图形|图形能反映|示意图|折叠而成")
    stem_flat = re.sub(r"\s", "", stem_html)
    # 标签行内容为「A B.B C.C D.D」之类纯标签串 => 视为图形选项
    def _opt_is_label(o):
        t2 = re.sub(r"\s+", "", o["text"]).replace("．", ".")
        t3 = t2.replace(".", "")
        return t3 == "" or (re.fullmatch(r"[A-D]+", t3) is not None and len(t3) >= 4)
    graphic_opt = (options and len(options) >= 2 and all(_opt_is_label(o) for o in options)) or \
                  (not options and (GRAPHIC_HINT.search(stem_flat) or frac_cropped))
    if graphic_opt and len(options) < 4:
        options = [dict(key=ch, text="", image=None) for ch in "ABCD"]
    # 判断推理图形推理区间兜底（题干模板固定，选项为图）
    if prefix == "PD" and 62 <= q["no"] <= 91 and len(options) < 4:
        options = [dict(key=ch, text="", image=None) for ch in "ABCD"]
        graphic_opt = True

    if options and all(not o["text"] for o in options) and len(stem_rects) >= 4:
        # 按标签与图中心的距离配对
        pairs = {}     # ch -> index in stem_rects
        used = set()
        for ch in "ABCD":
            rows = opt_rows.get(ch)
            if not rows:
                continue
            lp = rows[0][0], rows[0][1]
            lx = (lp[1].x0 + lp[1].x1) / 2
            ly = (lp[1].y0 + lp[1].y1) / 2
            best, bd = None, 1e9
            for i, (ipno, irect) in enumerate(stem_rects):
                if i in used or ipno != lp[0]:
                    continue
                cx = (irect.x0 + irect.x1) / 2
                cy = (irect.y0 + irect.y1) / 2
                d = ((cx - lx) ** 2 + (cy - ly) ** 2) ** 0.5
                if d < bd:
                    bd, best = d, i
            if best is not None and bd < 160:
                pairs[ch] = best
                used.add(best)
        if len(pairs) >= 3:
            new_stem, new_opts = [], []
            for i, (ipno, irect) in enumerate(stem_rects):
                ch = next((c for c, j in pairs.items() if j == i), None)
                if ch:
                    new_opts.append((ch, stem_images[i]))
                else:
                    new_stem.append(stem_images[i])
            stem_images = new_stem + fig_files
            for o in options:
                o["image"] = next((f for c, f in new_opts if c == o["key"]), None)

    # ---- 兜底：选项整体是分数/根式/折线图，既读不出文本也配不齐图
    #      => 把整块题目区裁成一张「选项合图」，前端按图作答
    block_image = None
    has_block = any(it["kind"] == "img" and it.get("_file") for it in q["raw"])
    if (options and all(not o["text"] for o in options)
            and not all(o.get("image") for o in options)
            and not has_block):
        ls = [it for it in q["raw"] if it["kind"] == "line"]
        if ls:
            # 碎片被裁成图后已不是 line，band 必须把图一起算进去
            pno = ls[0]["pno"]
            its = [it for it in q["raw"] if it["pno"] == pno]
            y0 = min(it["rect"].y0 for it in its) - 3
            y1 = max(it["rect"].y1 for it in its) + 3
            if y1 - y0 >= 30:
                img_seq["fig"] += 1
                fn = "%s-fig-%03d.png" % (prefix, img_seq["fig"])
                if do_images and crop(doc, pno, fitz.Rect(65, y0, 462, y1),
                                      os.path.join(IMG_DIR, fn)):
                    block_image = fn
                    options = [dict(key=ch, text="", image=None) for ch in "ABCD"]
                    # 题干只剩残片（如 "， 4， 2， 5，（）"）时不展示，避免误导
                    if re.match(r"^[，、．。\s]", stem_html) or len(stem_html) < 8:
                        stem_html = ""

    ans = answers.get(q["no"], {})
    mat = materials.get(q["mat_group"]) if q.get("mat_group") is not None else None

    return dict(
        id=qid,
        module=prefix,
        no=q["no"],
        stem=stem_html,
        stemImages=stem_images + fig_files,
        optionImage=block_image,
        options=options,
        optionImages=opt_images,
        answer=ans.get("answer"),
        analysis=ans.get("analysis"),
        material=(dict(group=mat["group"], content=mat["content"]) if mat else None),
        _page=(q["raw"][0]["pno"] + 1) if q["raw"] else None,
    )


# ------------------------------------------------------------------ 入口


def main():
    os.makedirs(IMG_DIR, exist_ok=True)
    only = sys.argv[1] if len(sys.argv) > 1 else None
    allq = []
    for subj in SUBJECTS:
        if only and subj["key"] != only:
            continue
        print("=" * 70)
        qs, mats = extract_module(subj)
        allq.extend(qs)
        dbg = os.path.join(OUT_DIR, "_debug_%s.txt" % subj["key"])
        with open(dbg, "w", encoding="utf-8") as f:
            for q in qs:
                f.write("[%s] ans=%s opts=%s simg=%d oimg=%d page=%s\n" % (
                    q["id"], q["answer"], "".join(o["key"] for o in q["options"]),
                    len(q["stemImages"]), len(q["optionImages"]), q.get("_page")))
                f.write("  stem: %s\n" % q["stem"].replace("\n", " ⏎ ")[:220])
                for o in q["options"]:
                    f.write("   %s. %s\n" % (o["key"], o["text"][:90]))

    path = os.path.join(OUT_DIR, "questions.raw.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(allq, f, ensure_ascii=False, indent=1)
    print("=" * 70)
    print("总题数:", len(allq), "->", path)


if __name__ == "__main__":
    main()
