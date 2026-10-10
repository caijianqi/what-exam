# -*- coding: utf-8 -*-
"""
生成人工校对页 pipeline/out/review.html。

左：解析结果（材料 / 题干 / 图 / 选项 / 答案 / 解析）
右：可展开的原始 PDF 页截图，用于核对版式与裁图是否对齐。

用法：
    python pipeline/review.py
"""

import json
import os
import re

import fitz

SRC_DIR = r"C:\Users\caiji\Downloads\1"
OUT = r"D:\project\what-exam\pipeline\out"
PAGE_DIR = os.path.join(OUT, "pages")

SUBJECTS = [
    dict(key="quant", name="数量关系", prefix="SL"),
    dict(key="logic", name="判断推理", prefix="PD"),
    dict(key="verbal", name="言语理解与表达", prefix="YY"),
    dict(key="data", name="资料分析", prefix="ZL"),
]
DPI = 110

# ---------------------------------------------------------------- 可疑检测


def flags(q):
    f = []
    if not q["stem"] and not q["stemImages"]:
        f.append("题干为空")
    if len(q["options"]) != 4:
        f.append("选项%d个" % len(q["options"]))
    if not q["answer"]:
        f.append("缺答案")
    elif q["answer"] not in [o["key"] for o in q["options"]]:
        f.append("答案越界")
    if len(q["explanation"]) < 12:
        f.append("解析过短")
    if "免费交流" in q["stem"]:
        f.append("混入页眉")
    for o in q["options"]:
        t = o["text"]
        # 图形选项题（有整块选项图 / 各选项自带图 / 题干图即选项图）不算缺
        if (not t and not o.get("image") and not q.get("optionImage")
                and not q.get("graphicOptions")):
            f.append("选项%s空" % o["key"])
        # 只有「下一题题号」粘进来才算问题（小数如 1.1% / 64.19 不算）
        m = re.match(r"^(\d{1,3})\s*[\.．]\s*(\S.*)$", t) if t else None
        if m and int(m.group(1)) == q["no"] + 1 and len(m.group(2)) > 10:
            f.append("选项%s粘连题号" % o["key"])
        if re.match(r"^[A-D]\s*[\.．、]", t):
            f.append("选项%s残留标签" % o["key"])
    if len(q["stem"]) > 900:
        f.append("题干过长")
    return f


# ---------------------------------------------------------------- 页面渲染


def render_pages():
    os.makedirs(PAGE_DIR, exist_ok=True)
    n = 0
    for s in SUBJECTS:
        doc = fitz.open(os.path.join(SRC_DIR, s["name"] + "-题目.pdf"))
        for i in range(len(doc)):
            dst = os.path.join(PAGE_DIR, "%s-%03d.png" % (s["key"], i + 1))
            if not os.path.exists(dst):
                doc[i].get_pixmap(dpi=DPI).save(dst)
                n += 1
        doc.close()
    print("页面截图:", len(os.listdir(PAGE_DIR)), "张（新增 %d）" % n)


# ---------------------------------------------------------------- HTML

HTML = """<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>行测题库校对页</title>
<style>
:root{--bg:#f5f6f8;--card:#fff;--line:#e3e6ea;--txt:#1f2328;--dim:#6b7280;
--ok:#0a7d3c;--warn:#b45309;--bad:#c0392b;--acc:#2563eb;--accbg:#eef4ff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--txt);
font:14px/1.7 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
header{position:sticky;top:0;z-index:9;background:#fff;border-bottom:1px solid var(--line);
padding:10px 14px;display:flex;flex-wrap:wrap;gap:10px;align-items:center}
header h1{font-size:15px;margin:0 12px 0 0;font-weight:600}
.tab{padding:4px 12px;border:1px solid var(--line);border-radius:14px;cursor:pointer;
background:#fff;user-select:none;font-size:13px}
.tab.on{background:var(--accbg);border-color:var(--acc);color:var(--acc)}
label{font-size:12px;color:var(--dim);display:inline-flex;gap:4px;align-items:center}
input[type=search]{padding:4px 8px;border:1px solid var(--line);border-radius:6px;width:120px}
#stat{margin-left:auto;font-size:12px;color:var(--dim)}
main{padding:14px;max-width:900px;margin:0 auto}
.q{background:var(--card);border:1px solid var(--line);border-radius:10px;
padding:12px 14px;margin-bottom:12px}
.q .hd{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px}
.q .id{font-weight:600;font-size:15px}
.q .tag{font-size:11px;padding:1px 7px;border-radius:10px;background:#f1f3f5;color:var(--dim)}
.q .tag.sub{background:#eef4ff;color:var(--acc)}
.q .flag{font-size:11px;padding:1px 7px;border-radius:10px;background:#fdecea;color:var(--bad)}
.q .spacer{margin-left:auto;display:flex;gap:6px}
.btn{font-size:11px;padding:2px 9px;border:1px solid var(--line);border-radius:6px;
cursor:pointer;background:#fff;color:var(--dim)}
.btn:hover{border-color:var(--acc);color:var(--acc)}
.mat{border-left:3px solid #f0b429;background:#fffdf5;padding:8px 10px;
margin-bottom:10px;border-radius:0 6px 6px 0;font-size:13px}
.mat .t{font-size:11px;color:var(--warn);font-weight:600;margin-bottom:4px}
.stem{white-space:pre-wrap;margin:6px 0 10px}
img{max-width:100%;height:auto;display:block;margin:6px 0;border:1px solid var(--line);
border-radius:6px;background:#fff}
.opts{display:grid;grid-template-columns:1fr 1fr;gap:6px}
@media(max-width:560px){.opts{grid-template-columns:1fr}}
.opt{border:1px solid var(--line);border-radius:8px;padding:6px 10px;font-size:13px}
.opt .k{font-weight:600;margin-right:6px}
.opt.right{background:#e8f7ee;border-color:#8fd3a8}
.opt.right .k{color:var(--ok)}
.ans{margin-top:8px;font-size:13px}
.ans b{color:var(--ok)}
.exp{margin-top:6px;padding:8px 10px;background:#f7f8fa;border-radius:8px;
font-size:13px;color:#40464d;white-space:pre-wrap;display:none}
.exp.show{display:block}
.pg{display:none;margin-top:8px;padding:6px;background:#f0f2f5;border-radius:8px}
.pg.show{display:block}
.pg img{margin:0}
.hide{display:none!important}
</style></head><body>
<header>
  <h1>行测题库校对页</h1>
  <span class="tab on" data-mod="all">全部</span>
  <span class="tab" data-mod="shuliang">数量关系</span>
  <span class="tab" data-mod="panduan">判断推理</span>
  <span class="tab" data-mod="yanyu">言语理解</span>
  <span class="tab" data-mod="ziliao">资料分析</span>
  <label><input type="checkbox" id="fImg">含图</label>
  <label><input type="checkbox" id="fMat">带材料</label>
  <label><input type="checkbox" id="fBad">只看可疑</label>
  <label><input type="checkbox" id="fAllExp" checked>展开解析</label>
  <input type="search" id="q" placeholder="题号/关键字">
  <span id="stat"></span>
</header>
<main id="list"></main>
<script id="data" type="application/json">__DATA__</script>
<script>
const D = JSON.parse(document.getElementById('data').textContent);
const PAGES = D.pages, IMG = 'images/';
let mod = 'all';
const list = document.getElementById('list');
const stat = document.getElementById('stat');

function imgTag(p){ return '<img loading="lazy" src="'+p+'">'; }

function card(q){
  const imgs = q.stemImages.concat(q.optionImage?[q.optionImage]:[])
    .concat(q.options.filter(o=>o.image).map(o=>o.image));
  let h = '<div class="q" data-mod="'+q.module+'" data-img="'+(imgs.length?1:0)
        + '" data-mat="'+(q.materialId?1:0)+'" data-bad="'+(q.f.length?1:0)
        + '" data-txt="'+q.id+' '+q.stem+'">';
  h += '<div class="hd"><span class="id">'+q.id+'</span>'
     + '<span class="tag">'+q.no+' 题</span>'
     + '<span class="tag sub">'+q.subType+'</span>';
  q.f.forEach(x=>h+='<span class="flag">'+x+'</span>');
  h += '<span class="spacer"><span class="btn pgbtn">原PDF页 '+q.srcPage+'</span></span></div>';

  if(q.material){
    h += '<div class="mat"><div class="t">材料 '+q.material.title+'</div>';
    q.material.content.forEach(c=>{
      h += c.t==='text' ? '<div>'+esc(c.v)+'</div>' : imgTag(IMG+basename(c.v));
    });
    h += '</div>';
  }
  if(q.stem) h += '<div class="stem">'+q.stem+'</div>';
  q.stemImages.forEach(p=>h+=imgTag(IMG+basename(p)));
  if(q.optionImage) h += '<div class="tag">选项合图</div>'+imgTag(IMG+basename(q.optionImage));

  h += '<div class="opts">';
  q.options.forEach(o=>{
    h += '<div class="opt'+(o.key===q.answer?' right':'')+'"><span class="k">'+o.key
       + '</span>'+(o.text?esc(o.text):'')+(o.image?imgTag(IMG+basename(o.image)):'');
    h += '</div>';
  });
  h += '</div>';
  h += '<div class="ans">答案 <b>'+(q.answer||'?')+'</b></div>';
  h += '<div class="exp'+(document.getElementById('fAllExp').checked?' show':'')
     + '">'+esc(q.explanation)+'</div>';
  h += '<div class="pg"><img loading="lazy" src="pages/'+PAGES[q.module]+'-'
     + String(q.srcPage).padStart(3,'0')+'.png"></div>';
  return h+'</div>';
}
function esc(s){return (s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
function basename(p){return p.split('/').pop();}

function render(){
  const kw = document.getElementById('q').value.trim().toLowerCase();
  const fi = document.getElementById('fImg').checked;
  const fm = document.getElementById('fMat').checked;
  const fb = document.getElementById('fBad').checked;
  let n = 0;
  let h = '';
  D.questions.forEach(q=>{
    if(mod!=='all' && q.module!==mod) return;
    if(fi && !q.imgN) return;
    if(fm && !q.materialId) return;
    if(fb && !q.f.length) return;
    if(kw && !(q.id+' '+q.stem+' '+q.explanation).toLowerCase().includes(kw)) return;
    n++; h += card(q);
  });
  list.innerHTML = h;
  stat.textContent = '显示 '+n+' / '+D.questions.length+' 题'
    + '（可疑 '+D.questions.filter(q=>q.f.length).length+'）';
}
list.addEventListener('click', e=>{
  const b = e.target.closest('.pgbtn');
  if(b){ b.closest('.q').querySelector('.pg').classList.toggle('show'); return; }
  const ex = e.target.closest('.exp');
  if(ex) ex.classList.toggle('show');
});
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('on'));
  t.classList.add('on'); mod = t.dataset.mod; render(); window.scrollTo(0,0);
});
['fImg','fMat','fBad','fAllExp'].forEach(id=>{
  document.getElementById(id).onchange = render;
});
document.getElementById('q').oninput = render;
render();
</script></body></html>
"""


def main():
    render_pages()
    bundle = json.load(open(os.path.join(r"D:\project\what-exam\public\data",
                                         "questions.json"), encoding="utf-8"))
    # 前端模块 key -> PDF 文件 key（页面截图文件名前缀）
    fkey = {"shuliang": "quant", "panduan": "logic", "yanyu": "verbal", "ziliao": "data"}

    qs = []
    for q in bundle["questions"]:
        imgs = (list(q["stemImages"]) + ([q["optionImage"]] if q.get("optionImage") else [])
                + [o["image"] for o in q["options"] if o.get("image")])
        mat = bundle["materials"].get(q["materialId"]) if q["materialId"] else None
        qs.append(dict(
            id=q["id"], module=q["module"], no=q["no"], subType=q["subType"],
            stem=q["stem"], stemImages=q["stemImages"],
            optionImage=q.get("optionImage"), graphicOptions=q.get("graphicOptions"),
            options=q["options"],
            answer=q["answer"], explanation=q["explanation"],
            material=mat, srcPage=q["srcPage"],
            imgN=len(imgs), f=flags(q),
        ))

    payload = dict(questions=qs, pages=fkey)
    html = HTML.replace("__DATA__", json.dumps(payload, ensure_ascii=False))
    dst = os.path.join(OUT, "review.html")
    with open(dst, "w", encoding="utf-8") as f:
        f.write(html)
    bad = sum(1 for q in qs if q["f"])
    print("校对页:", dst, "(%.1f MB)" % (len(html) / 1048576))
    print("题目:", len(qs), " 可疑:", bad)
    for q in qs:
        if q["f"]:
            print("   ", q["id"], q["f"])


if __name__ == "__main__":
    main()
