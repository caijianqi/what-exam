# -*- coding: utf-8 -*-
"""题库校验：题号连续性、选项完整性、答案覆盖率、解析覆盖率、图片引用。"""

import json
import os
import re
import collections

OUT = r"D:\project\what-exam\pipeline\out"
IMG_DIR = os.path.join(OUT, "images")

MODULES = {"SL": ("数量关系", 120), "PD": ("判断推理", 130),
           "YY": ("言语理解与表达", 130), "ZL": ("资料分析", 120)}

data = json.load(open(os.path.join(OUT, "questions.raw.json"), encoding="utf-8"))
print("总题数:", len(data))

imgs_on_disk = set(os.listdir(IMG_DIR))
used_imgs = set()
problems = collections.defaultdict(list)

by_mod = collections.defaultdict(list)
for q in data:
    by_mod[q["module"]].append(q)

for mod, qs in by_mod.items():
    name, total = MODULES[mod]
    print("=" * 66)
    print(f"[{name}] {len(qs)}/{total}")
    nos = [q["no"] for q in qs]
    # 连续性
    expect = list(range(1, total + 1))
    if nos != expect:
        missing = sorted(set(expect) - set(nos))
        dup = [k for k, v in collections.Counter(nos).items() if v > 1]
        extra = sorted(set(nos) - set(expect))
        if missing: problems[mod].append(f"缺题号: {missing[:20]}")
        if dup:     problems[mod].append(f"重复题号: {dup[:20]}")
        if extra:   problems[mod].append(f"多余题号: {extra[:20]}")
    for q in qs:
        qid = q["id"]
        has_imgs = bool(q["stemImages"] or q["optionImages"])
        # 图形选项题：选项是图形（文本为空），以图为答案载体
        graphic_opt = (len(q["options"]) == 4 and all(not o["text"] for o in q["options"])
                       and has_imgs)
        if not graphic_opt and (not q["options"] or len(q["options"]) < 4):
            problems[mod].append(f"{qid}: 选项不足({len(q['options'])})")
        if not q["answer"]:
            problems[mod].append(f"{qid}: 缺答案")
        elif not graphic_opt and q["answer"] not in [o["key"] for o in q["options"]]:
            problems[mod].append(f"{qid}: 答案{q['answer']}不在选项中")
        if not q["analysis"] or len(q["analysis"]) < 6:
            problems[mod].append(f"{qid}: 解析缺失/过短")
        if not q["stem"] and not q["stemImages"]:
            problems[mod].append(f"{qid}: 题干为空")
        # 选项文本合法性
        if not graphic_opt:
            for o in q["options"]:
                t = o["text"]
                if not t:
                    problems[mod].append(f"{qid}: 选项{o['key']}为空")
                elif re.match(r"^[ABCD]\s*[\.．、]", t):
                    problems[mod].append(f"{qid}: 选项{o['key']}残留标签前缀: {t[:20]}")
        for o in q["options"]:
            if o.get("image"):
                used_imgs.add(o["image"])
        if q.get("optionImage"):
            used_imgs.add(q["optionImage"])
        for img in q["stemImages"] + q["optionImages"]:
            used_imgs.add(img)
            if img not in imgs_on_disk:
                problems[mod].append(f"{qid}: 图片缺失 {img}")
        if q["material"]:
            mc = q["material"]["content"]
            if not any(c["t"] == "text" and c["v"].strip() for c in mc) and \
               not any(c["t"] == "img" for c in mc):
                problems[mod].append(f"{qid}: 材料为空")
            for c in mc:
                if c["t"] == "img":
                    used_imgs.add(c["v"])
                    if c["v"] not in imgs_on_disk:
                        problems[mod].append(f"{qid}: 材料图缺失 {c['v']}")
    # 选项长度合理性（有答案的题选项应长度相近）
    print(f"  题号: {nos[0]}..{nos[-1]}  答案覆盖: {sum(1 for q in qs if q['answer'])}/{len(qs)}")
    print(f"  选项齐4: {sum(1 for q in qs if len(q['options'])==4)}/{len(qs)}")
    print(f"  有解析: {sum(1 for q in qs if q['analysis'])}/{len(qs)}")
    print(f"  含图题: {sum(1 for q in qs if q['stemImages'] or q['optionImages'])}/{len(qs)}")
    # 材料分布
    mats = [q["material"]["group"] for q in qs if q["material"]]
    if mats:
        print(f"  带材料: {len(mats)} 题, 材料组数: {len(set(mats))}")
        mimg = {c["v"] for q in qs if q["material"]
                for c in q["material"]["content"] if c["t"] == "img"}
        print(f"  材料图: {len(mimg)} 张, 无图材料组: "
              f"{[g for g in sorted(set(mats), key=str) if not any(q['material'] and q['material']['group'] == g and any(c['t']=='img' for c in q['material']['content']) for q in qs)]}")

orphan = imgs_on_disk - used_imgs - {"_ignore"}
if orphan:
    print("\n[未引用图片]", len(orphan), sorted(orphan)[:10])

print("\n" + "=" * 66)
if problems:
    print("问题清单:")
    for mod, plist in problems.items():
        print(f"[{mod}] {len(plist)} 个")
        for p in plist[:30]:
            print("   ", p)
else:
    print("全部校验通过 ✓")

# 保存问题清单
with open(os.path.join(OUT, "problems.json"), "w", encoding="utf-8") as f:
    json.dump({k: v for k, v in problems.items()}, f, ensure_ascii=False, indent=1)
