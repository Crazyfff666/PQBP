# -*- coding: utf-8 -*-
"""
build_data.py — 生成 4 个题库数据文件（统一 djtk 格式 + type 字段）
  data/djtkbank.js/.json  window.DJTK_BANK    党建模拟题（原 djtk，100 题，纯单选）
  data/tztzbank.js/.json  window.TZTZ_BANK    投资类业务模拟题（410 题，含多选/判断）
  data/ccsabank.js/.json  window.CCSA_BANK    CCSA 标准化人员资格考试（129 题，含多选/判断/简答）
  data/diankbank.js/.json window.DIANK_BANK   电力交易员（中级工）题库（790 题，单选/多选/判断）

统一格式：
  {
    meta:{title,version,total,types:[...],note},
    sections:[{id,name,short,count,manual?}],
    questions:[{id,type,section,no,stem,options:[{key,text}],answer(exact or [..]),explain}]
  }
  type: 'single' | 'multiple' | 'judge' | 'short'
  answer: 单选/判断为字符串(如 'A' 或 '正确')；多选为数组(['A','B'])；简答为文本。
"""
import json, os, re, sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # PQPB 站点根（build 的上一级）
ROOT = os.path.dirname(BASE)                                         # E:/ai-learning
DATA = os.path.join(BASE, "data")
os.makedirs(DATA, exist_ok=True)


def parse_shuati_content(content):
    """把 shuati 的 content（题干 + A/B/C/D 选项行）拆成 stem + options。
    返回 (stem, options[{key,text}])。题干首行去掉 'N题,' 前缀与 '(1.0分)' 尾部。"""
    lines = [ln for ln in content.split("\n") if ln.strip()]
    stem = None
    opts = []
    for ln in lines:
        ln = ln.strip()
        m = re.match(r"^([A-E])[.、]\s*(.*)$", ln)
        if m and stem is not None:
            opts.append({"key": m.group(1), "text": m.group(2).strip()})
        elif m and stem is None and len(opts) == 0:
            # 首行就是选项（少见）——仍当作选项
            opts.append({"key": m.group(1), "text": m.group(2).strip()})
        else:
            # 题干行
            s = re.sub(r"^\s*\d+\s*题\s*[,，]\s*", "", ln)   # 去掉 "N题,"
            s = re.sub(r"\s*\(\s*[\d.]+\s*分\s*\)\s*$", "", s)  # 去掉 "(1.0分)"
            if stem is None:
                stem = s
            else:
                stem += "\n" + s
    return (stem or ""), opts


def bank_sections(questions):
    """按出现顺序生成 sections，并回填 count / short。"""
    order, names = [], {}
    for q in questions:
        sid = q.get("section")
        if sid not in names:
            names[sid] = q.get("_secname", "未分类")
            order.append(sid)
    secs = []
    for i, sid in enumerate(order, 1):
        c = sum(1 for q in questions if q.get("section") == sid)
        secs.append({"id": sid, "name": names[sid], "short": q_short(names[sid], i), "count": c})
    return secs


def q_short(name, idx):
    n = name.strip()
    # 取一个简短标签：截断
    return n[:14] if len(n) > 14 else n


def types_of(questions):
    ts = []
    for q in questions:
        t = q.get("type", "single")
        if t not in ts:
            ts.append(t)
    return ts


def write_bank(gvar, meta, sections, questions):
    # 计算 sections count（用最终 questions）
    for s in sections:
        s["count"] = sum(1 for q in questions if q.get("section") == s["id"])
    meta["total"] = len(questions)
    meta["types"] = types_of(questions)
    obj = {"meta": meta, "sections": sections, "questions": questions}
    json_path = os.path.join(DATA, gvar + ".json")
    js_path = os.path.join(DATA, gvar + ".js")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
        f.write("\n")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write("// 由 build_data.py 自动生成，请勿手动编辑\n")
        f.write("window.%s = " % gvar)
        json.dump(obj, f, ensure_ascii=False)
        f.write(";\n")
    print("%-10s %-10s questions=%d types=%s" % (gvar.lower(), meta["title"], len(questions), ",".join(types_of(questions))))
    return len(questions)


# ----------------------------------------------------------------------
# 1) DJTK 党建模拟题（原 djtk questions.json，纯单选）— 从 _tmp_djtk 读取
# ----------------------------------------------------------------------
djtk = json.load(open(os.path.join(ROOT, "_tmp_djtk", "data", "questions.json"), encoding="utf-8"))
djtk_qs = []
for i, q in enumerate(djtk["questions"]):
    djtk_qs.append({
        "id": i + 1,
        "type": "single",
        "section": q["section"],
        "no": q.get("no", i + 1),
        "stem": q["stem"],
        "options": q["options"],
        "answer": q["answer"],
        "explain": q.get("explain") or "",
    })
djtk_secs = []
for s in djtk.get("sections", []):
    n = s["name"]
    djtk_secs.append({"id": s["id"], "name": n, "short": n[:14], "manual": ""})
write_bank(
    "DJTK_BANK",
    {"title": "D建模拟题", "version": "2026年8月", "note": "党建应知应会题库（100 题单选），答案取自原件标注。"},
    djtk_secs, djtk_qs,
)

# ----------------------------------------------------------------------
# 2) TZTZ 投资类业务模拟题（jinkai-quiz questions.json，含多选/判断）
# ----------------------------------------------------------------------
def load_jinkai(name, gvar, title, version, note, manual_default=""):
    j = json.load(open(os.path.join(ROOT, "jinkai-quiz", "site", "data", name + ".json"), encoding="utf-8"))
    qs = []
    dropped, coerced = 0, 0
    for i, q in enumerate(j["questions"]):
        optkeys = [o.get("key") for o in q.get("options", [])]
        rawtype = q.get("type", "single")
        ans = q.get("answer", "")
        # 题型修正：部分单选被误标为 single，但答案是 "ABCD" 紧凑串 + 多选项 → 实为多选
        if rawtype == "single" and isinstance(ans, str) and len(ans) >= 2 and \
                all(c in "ABCDE" for c in ans) and ans != "无":
            if sorted(set(ans)) == [c for c in sorted(set(ans))]:
                rawtype = "multiple"
                ans = list(ans)
                coerced += 1
        opt = q.get("options", [])
        opt = [{"key": o.get("key", "A"), "text": o.get("text", "")} for o in opt]
        # 仍不匹配且非简答的题才丢弃（如 C-14 答案"无（均为干扰项）"）
        if rawtype not in ("multiple", "short") and ans not in optkeys:
            dropped += 1
            print("  [drop] %s %s ans=%r" % (gvar, q.get("id"), ans[:30]))
            continue
        qs.append({
            "id": q.get("id", i + 1),
            "type": rawtype,
            "section": q.get("section"),
            "no": q.get("no", i + 1),
            "stem": q.get("stem", ""),
            "options": opt,
            "answer": ans,
            "explain": (q.get("explain") or q.get("explanation") or ""),
        })
    if dropped:
        print("  [drop] %s: %d 坏题被剔除" % (gvar, dropped))
    if coerced:
        print("  [coerce] %s: %d 道误标单选实为多选，已归正为 multiple" % (gvar, coerced))
    secs = []
    seen = {}
    for s in j.get("sections", []):
        sid = s.get("id")
        if sid in seen:
            continue
        seen[sid] = True
        manual = s.get("manual") or manual_default
        secs.append({"id": sid, "name": s.get("name", ""), "short": s.get("name", "")[:14], "manual": manual})
    write_bank(gvar, {"title": title, "version": version, "note": note,
                      "manuals": j.get("meta", {}).get("manuals", [])}, secs, qs)
    return qs

load_jinkai("questions", "TZTZ_BANK", "投资类业务模拟题", "2026-08-11",
            "投资业务管理手册（流程分册 + 评审分册）模拟题，公司名已脱敏为 A 公司。", "投资手册")

# ----------------------------------------------------------------------
# 3) CCSA 标准化人员资格考试（jinkai-quiz ccsa_questions.json）
# ----------------------------------------------------------------------
load_jinkai("ccsa_questions", "CCSA_BANK", "CCSA标准化人员资格考试题库", "2026-11-24",
            "基于 GB/T 1.1-2020、《标准化法》、通信行业标准整理；开卷核心参考为 GB/T 1.1-2020 全文。", "CCSA标准化考试")

# ----------------------------------------------------------------------
# 4) DIANK 电力交易员（shuati questions.json）
# ----------------------------------------------------------------------
sk = json.load(open(os.path.join(ROOT, "_tmp_shuati", "docs", "questions.json"), encoding="utf-8"))
diank_qs = []
for i, q in enumerate(sk["questions"]):
    stem, opts = parse_shuati_content(q["content"])
    qtype = q.get("question_type", "single")
    tmap = {"single": "single", "multi": "multiple", "judge": "judge"}
    t = tmap.get(qtype, "single")
    std = q.get("standard", "")
    if t == "multiple":
        ans = [c for c in sorted(set(std))] if std else []
    else:
        ans = std
    # section 分组：按题型分 3 段（单选 1-350 / 多选 351-550 / 判断 551-790）
    if t == "single":
        sec_id, sec_name, manual = 1, "单项选择题", "电力交易员"
    elif t == "multiple":
        sec_id, sec_name, manual = 2, "多项选择题", "电力交易员"
    else:
        sec_id, sec_name, manual = 3, "判断题", "电力交易员"
    diank_qs.append({
        "id": q.get("qid", i),
        "type": t,
        "section": sec_id,
        "no": q.get("question_number", i + 1),
        "stem": stem,
        "options": opts if t != "judge" else ([{"key": "A", "text": "正确（对）"}, {"key": "B", "text": "错误（错）"}] if not opts else opts),
        "answer": ans,
        "explain": q.get("explanation") or "",
    })
# 判断题的 standard 可能是 'A'/'B' 或 '对'/'错'；统一为 A=正确 B=错误
for q in diank_qs:
    if q["type"] == "judge":
        a = str(q["answer"]).strip().upper()
        if a in ("对", "A", "正确", "T", "TRUE", "1"):
            q["answer"] = "A"
        elif a in ("错", "B", "错误", "F", "FALSE", "0"):
            q["answer"] = "B"
        else:
            q["answer"] = "A"  # 未知按正确
        q["options"] = [{"key": "A", "text": "正确（对）"}, {"key": "B", "text": "错误（错）"}]

diank_secs = [
    {"id": 1, "name": "单项选择题", "short": "单选", "manual": "电力交易员"},
    {"id": 2, "name": "多项选择题", "short": "多选", "manual": "电力交易员"},
    {"id": 3, "name": "判断题", "short": "判断", "manual": "电力交易员"},
]
write_bank("DIANK_BANK", {"title": "电力交易员（中级工）题库", "version": "2025", "note":
                          "电力交易员中级工题库（单选 350 / 多选 200 / 判断 240），源自 xlsx 导出。"}, diank_secs, diank_qs)

print("\nAll banks written to", DATA)
print("removed djtk single-bank data:", os.path.exists(os.path.join(BASE, "data", "questions.js")))
