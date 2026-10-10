# -*- coding: utf-8 -*-
"""
产出最终前端资产。

    pipeline/out/questions.raw.json  +  pipeline/out/images/*.png
        ──▶ public/data/questions.json
        ──▶ public/img/graph/*.png      题目图（题干图 / 选项图）
        ──▶ public/img/material/*.png   材料图（资料分析表格图表 / 篇章阅读插图）

同时做三件事：
  1. 模块前缀换成前端 key（SL→shuliang / PD→panduan / YY→yanyu / ZL→ziliao）
  2. 材料从「每题内嵌」抽成 materials 字典，题目只留 materialId
  3. 推断二级题型 subType（用于专项练习分组）
"""

import json
import os
import re
import shutil
import collections

OUT = r"D:\project\what-exam\pipeline\out"
IMG_IN = os.path.join(OUT, "images")
ROOT = r"D:\project\what-exam"
DATA_DIR = os.path.join(ROOT, "public", "data")
PUB_IMG = os.path.join(ROOT, "public", "img")
GRAPH_DIR = os.path.join(PUB_IMG, "graph")
MAT_DIR = os.path.join(PUB_IMG, "material")

# 提取前缀 -> 前端模块 key
MODKEY = {"SL": "shuliang", "PD": "panduan", "YY": "yanyu", "ZL": "ziliao"}
MODNAME = {"shuliang": "数量关系", "panduan": "判断推理",
           "yanyu": "言语理解与表达", "ziliao": "资料分析"}
ORDER = ["shuliang", "panduan", "yanyu", "ziliao"]

NUM_CHARS = re.compile(r"[0-9，。、（）()\[\]{}％%°/\.\-＋+－—…×÷\s]")


def subtype(q, mat_img_count):
    """推断二级题型。"""
    key = MODKEY[q["module"]]
    stem = re.sub(r"\s", "", q["stem"])
    opts = [o["text"] for o in q["options"]]

    if key == "shuliang":
        # 数字推理：题干几乎只有数字与分隔符
        core = NUM_CHARS.sub("", stem)
        return "数字推理" if len(core) <= 2 else "数学运算"

    if key == "panduan":
        if 62 <= q["no"] <= 91:
            return "图形推理"
        if len(stem) <= 24 and re.search(r"[：:]", stem):
            return "类比推理"
        if "定义" in stem or "是指" in stem[:50] or "指的是" in stem[:50]:
            return "定义判断"
        return "逻辑判断"

    if key == "yanyu":
        if q.get("material"):
            return "篇章阅读"
        if "①" in stem and ("排列" in stem or "连贯" in stem or "排序" in stem):
            return "语句排序"
        if ("_" in q["stem"] or "＿" in q["stem"] or "填入" in stem
                or "横线" in stem):
            return "逻辑填空"
        return "片段阅读"

    # 资料分析
    if q.get("material") is None:
        return "资料分析"
    if mat_img_count >= 1:
        return "综合型" if stem_or_mat_text(q) else "图表型"
    return "文字型"


def stem_or_mat_text(q):
    return any(c["t"] == "text" and c["v"].strip()
               for c in q["material"]["content"])


def main():
    raw = json.load(open(os.path.join(OUT, "questions.raw.json"), encoding="utf-8"))

    for d in (DATA_DIR, GRAPH_DIR, MAT_DIR):
        os.makedirs(d, exist_ok=True)
    for f in os.listdir(GRAPH_DIR):
        os.remove(os.path.join(GRAPH_DIR, f))
    for f in os.listdir(MAT_DIR):
        os.remove(os.path.join(MAT_DIR, f))

    def put(src_name, dest_dir, rel_prefix):
        src = os.path.join(IMG_IN, src_name)
        if not os.path.exists(src):
            return None
        dst = os.path.join(dest_dir, src_name)
        if not os.path.exists(dst):
            shutil.copy2(src, dst)
        return "%s/%s" % (rel_prefix, src_name)

    # ---------- 材料字典 ----------
    materials = {}
    mat_of = {}          # (module, group) -> materialId
    for q in raw:
        m = q.get("material")
        if not m:
            continue
        key = MODKEY[q["module"]]
        k = (q["module"], m["group"])
        if k in mat_of:
            continue
        mid = "%s-m%02d" % (key, len(materials) + 1)
        content = []
        for c in m["content"]:
            if c["t"] == "text":
                content.append(dict(t="text", v=c["v"]))
            else:
                p = put(c["v"], MAT_DIR, "img/material")
                if p:
                    content.append(dict(t="img", v=p))
        materials[mid] = dict(id=mid, module=key, title=m["group"], content=content)
        mat_of[k] = mid

    # ---------- 题目 ----------
    questions = []
    miss_img = []
    for q in raw:
        key = MODKEY[q["module"]]
        mid = mat_of.get((q["module"], q["material"]["group"])) if q.get("material") else None
        n_mat_img = sum(1 for c in materials[mid]["content"] if c["t"] == "img") if mid else 0

        stem_imgs = []
        for f in q["stemImages"]:
            p = put(f, GRAPH_DIR, "img/graph")
            if p:
                stem_imgs.append(p)
            else:
                miss_img.append((q["id"], f))

        options = []
        for o in q["options"]:
            img = None
            if o.get("image"):
                img = put(o["image"], GRAPH_DIR, "img/graph")
                if not img:
                    miss_img.append((q["id"], o["image"]))
            options.append(dict(key=o["key"], text=o["text"], image=img))

        # 选项整体是一张合图（分数选项、四选一折线图）：
        # 提取阶段 opt_expect 还是 0，图被归到了题干，这里还原成 optionImage
        option_image = None
        if q.get("optionImage"):
            option_image = put(q["optionImage"], GRAPH_DIR, "img/graph")
        elif options and all(not o["text"] for o in options) and len(stem_imgs) == 1:
            # 只有一张图且四个选项都无文本 => 这张就是「四选一合图」
            option_image = stem_imgs.pop()
        # 其余情况（多张图但无法一一对应）保留在 stemImages，前端按「选项见图」处理

        graphic_opts = bool(options) and all(not o["text"] for o in options) and bool(
            option_image or stem_imgs or any(o["image"] for o in options))

        questions.append(dict(
            id="%s-%03d" % (key, q["no"]),
            module=key,
            no=q["no"],
            subType=subtype(q, n_mat_img),
            stem=q["stem"],
            stemImages=stem_imgs,
            optionImage=option_image,
            graphicOptions=graphic_opts,
            options=options,
            answer=q["answer"],
            explanation=q["analysis"] or "",
            materialId=mid,
            srcPage=q.get("_page"),
        ))

    questions.sort(key=lambda x: (ORDER.index(x["module"]), x["no"]))

    bundle = dict(
        version=1,
        source="中公行测题库 PDF（4 册 500 题）",
        modules=[dict(key=k, name=MODNAME[k],
                      total=sum(1 for q in questions if q["module"] == k))
                 for k in ORDER],
        materials=materials,
        questions=questions,
    )

    path = os.path.join(DATA_DIR, "questions.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(bundle, f, ensure_ascii=False, separators=(",", ":"))

    # ---------- 报告 ----------
    print("题库:", len(questions), "->", path)
    print("JSON 大小: %.1f KB" % (os.path.getsize(path) / 1024))
    for k in ORDER:
        sub = collections.Counter(q["subType"] for q in questions if q["module"] == k)
        print("  [%s] %d 题  %s" % (MODNAME[k], sum(sub.values()),
                                    dict(sub.most_common())))
    print("材料:", len(materials), "组")
    print("图片: graph %d / material %d" % (len(os.listdir(GRAPH_DIR)),
                                            len(os.listdir(MAT_DIR))))
    if miss_img:
        print("!! 缺失图片:", miss_img[:10])


if __name__ == "__main__":
    main()
