#!/usr/bin/env python3
"""Stream Claude Code JSONL transcripts and measure session-audit detectors."""
import argparse, datetime as dt, hashlib, json, os, re, sys, time
from collections import Counter
from pathlib import Path

DEFAULT_MONEY = ["premium", "surrender", "surrender value", "cash value", "CV", "NFO", "non-forfeit", "paid-up", "rate table", "actuar", "loan interest", "maturity", "ANB", "policy year"]
DEFAULT_TRUTH = ["clife-core", "kwi-actuarial-archive", "docs/kb", "01_Product_and_Actuarial", "filed_rates", "wiki_query", "wiki_read", "clife-schema"]
DEFAULT_WINDOWS = {"D1": "2026-08-20", "D2": "2026-08-26", "D3": "2026-08-20", "D4": "2026-08-20", "D5": "2026-08-20", "D6": "2026-08-20", "D7": "2026-08-20", "D8": "2026-08-20", "D9": "2026-08-20"}
FABLE = re.compile(r"fable", re.I); REVIEW = re.compile(r"\breview\b", re.I); OFF_CLAUDE = re.compile(r"\b(?:codex exec|grok\s+(?:-p|--prompt-file))\b", re.I)
WRAPPERS = ("local-command-caveat", "local-command-stdout", "command-name", "command-message", "command-args", "system-reminder", "task-notification")

def clean_prompt(text):
    result = str(text or "")
    for name in WRAPPERS:
        result = re.sub(r"<%s(?:\s[^>]*)?>.*?</%s>" % (name, name), "", result, flags=re.I | re.S)
    return result.strip()

def parse_time(value):
    try: return dt.datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None
    except (TypeError, ValueError): return None

def text_blocks(message):
    content = message.get("content", []) if isinstance(message, dict) else []
    if isinstance(content, str): return [content]
    return [b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"]

def blocks(message, kind):
    content = message.get("content", []) if isinstance(message, dict) else []
    return [b for b in content if isinstance(b, dict) and b.get("type") == kind] if isinstance(content, list) else []

def tool_input(block):
    return block.get("input", {}) if isinstance(block.get("input", {}), dict) else {}

def tool_text(block): return json.dumps(tool_input(block), sort_keys=True, ensure_ascii=False)

def _term_pattern(term):
    value, sensitive = re.escape(str(term)), str(term).isupper() and len(str(term)) <= 4
    return r"(?<![A-Za-z0-9])(?%s:%s)(?![A-Za-z0-9])" % ("-i" if sensitive else "i", value)

def make_regex(values): return re.compile("|".join(_term_pattern(v) for v in values) if values else r"a^", re.S)
def term_patterns(values): return [(str(v), re.compile(_term_pattern(v), re.S)) for v in values]
def matches(text, patterns):
    candidates = []
    for term, rx in patterns:
        candidates.extend((match.start(), match.end(), term) for match in rx.finditer(text))
    found = []
    occupied = []
    for start, end, term in sorted(candidates, key=lambda item: (item[0], -(item[1] - item[0]))):
        if any(start < other_end and end > other_start for other_start, other_end in occupied):
            continue
        occupied.append((start, end))
        found.append(term)
    return found

def default_store(cwd):
    slug = cwd.replace("/", "-"); base = os.environ.get("CLAUDE_CONFIG_DIR")
    candidates = ([Path(base) / "projects" / slug] if base else []) + [Path.home() / ".claude" / "projects" / slug]
    return next((c for c in candidates if c.exists()), candidates[0])

def load_config(cwd, path):
    candidate = Path(path) if path else Path(cwd) / ".claude" / "session-audit.json"; data = {}
    if candidate.is_file():
        try: data = json.loads(candidate.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc: print("warning: cannot read config: %s" % exc, file=sys.stderr)
    return data.get("money_terms") or DEFAULT_MONEY, data.get("truth_paths") or DEFAULT_TRUTH, {**DEFAULT_WINDOWS, **(data.get("rule_windows") or {})}

def is_top_prompt(message, side):
    if side or blocks(message, "tool_result"): return ""
    return clean_prompt("\n".join(text_blocks(message)))

def checklist_write(tool):
    name, inp = tool["name"], json.loads(tool["raw"])
    if name in ("Write", "Edit"):
        return bool(re.search(r"\.planning/(?:STATE[^/\\]*|(?:HANDOFF|PLAN|BRIEF)[^/\\]*)", json.dumps(inp, ensure_ascii=False), re.I))
    if name == "Bash":
        command = str(inp.get("command", "")); return ".planning/" in command and bool(re.search(r">|\btee\b|\bcat\s+<<", command))
    return False

class Session:
    def __init__(self, sid):
        self.id=sid; self.events=[]; self.tools=[]; self.assistant=0; self.narrated=0; self.money_hits=0; self.prompt_hits=0; self.topic_hits=0; self.topic_terms=set(); self.truth=set(); self.models=Counter(); self.agents=0; self.agent_with_model=0; self.big_briefs=0; self.review_prompts=0; self.off_claude=0; self.tokens=Counter(); self.first_prompt=""; self.kind="main"

    def add(self, record, money_patterns, truth_res):
        typ, when, side = record.get("type"), parse_time(record.get("timestamp")), bool(record.get("isSidechain")); message=record.get("message") or {}; event={"type":typ,"time":when,"side":side}
        if typ == "user":
            prompt=is_top_prompt(message, side); event.update(prompt=prompt, top_level=bool(prompt))
            if prompt:
                found=matches(prompt, money_patterns); self.prompt_hits += len(found); self.money_hits=self.prompt_hits
                if not self.first_prompt:
                    self.first_prompt=prompt
                    if prompt.startswith("<teammate-message") or "You are a subagent" in prompt: self.kind="worker"
        elif typ == "assistant":
            self.assistant += 1; narrated=any(len(t.strip()) >= 20 for t in text_blocks(message)); self.narrated += int(narrated); model=str(message.get("model", "")); self.models[model] += 1; usage=message.get("usage") or {}; tokens=int(usage.get("output_tokens",0) or 0)+int(usage.get("cache_creation_input_tokens",0) or 0); self.tokens[model]+=tokens; compact_tools=[]
            if not side:
                for value in text_blocks(message):
                    found=matches(value, money_patterns); self.topic_hits+=len(found); self.topic_terms.update(x.lower() for x in found)
            for b in blocks(message, "tool_use"):
                name, inp, raw=str(b.get("name", "")), tool_input(b), tool_text(b); compact={"name":name,"input_hash":hashlib.sha256(raw.encode()).hexdigest(),"raw":raw}; compact_tools.append(compact)
                if not side:
                    found=matches(raw, money_patterns); self.topic_hits+=len(found); self.topic_terms.update(x.lower() for x in found)
                for label, rx in truth_res:
                    if rx.search(raw): self.truth.add(label)
                if name in ("Agent", "Task", "Workflow"):
                    self.agents += 1; model_set=("model:" in str(inp.get("script", ""))) if name == "Workflow" else bool(inp.get("model")) or str(inp.get("subagent_type", "")) not in {"fork","general-purpose","Explore","Plan","claude"}; self.agent_with_model += int(model_set); prompt_value=inp.get("prompt", "")
                    if name in ("Agent", "Task") and len(json.dumps(prompt_value, ensure_ascii=False).encode()) > 7000: self.big_briefs += 1
                    if name in ("Agent", "Task") and REVIEW.search(str(prompt_value)): self.review_prompts += 1
                if name == "Bash" and OFF_CLAUDE.search(str(inp.get("command", ""))): self.off_claude += 1
                self.tools.append({**compact,"time":when,"side":side,"narrated":narrated})
            event.update(tools=compact_tools,narrated=narrated,tokens=tokens)
        self.events.append(event)

    def date(self):
        times=[e["time"] for e in self.events if e["time"]]; return min(times) if times else None

    def prompts(self):
        starts=[i for i,e in enumerate(self.events) if e["type"] == "user" and e.get("top_level")]; result=[]
        for pos,start in enumerate(starts):
            end=starts[pos+1] if pos+1 < len(starts) else len(self.events); group=self.events[start:end]; assistant_events=[e for e in group if e["type"] == "assistant"]; span_tools=[dict(t,time=e["time"],side=e["side"],narrated=e["narrated"]) for e in group if e["type"] == "assistant" for t in e.get("tools", [])]; uniq=len({t["input_hash"] for t in span_tools})/len(span_tools) if span_tools else 1.0; dark=max_dark=0
            for e in group:
                if e["type"] != "assistant": continue
                if e["narrated"]: dark=0
                dark+=len(e.get("tools", [])); max_dark=max(max_dark,dark)
            gaps=[(b["time"]-a["time"]).total_seconds()/60 for a,b in zip(group,group[1:]) if a["time"] and b["time"] and not a["side"] and not b["side"]]; start_time,end_time=self.events[start]["time"],self.events[starts[pos+1]]["time"] if pos+1 < len(starts) else None; wall=((end_time-start_time).total_seconds()/60) if start_time and end_time else 0.0; agents=sum(t["name"] in ("Agent","Task","Workflow") for t in span_tools); label="LOOP" if uniq < .6 and len(assistant_events)>=15 else "GRIND" if len(assistant_events)>=40 and agents==0 and max_dark>=20 else "WAIT" if gaps and max(gaps)>=10 else "OK"
            result.append({"session_id":self.id,"prompt":self.events[start]["prompt"],"date":self.events[start]["time"].isoformat() if self.events[start]["time"] else "","wall_min":round(wall,2),"turns":len(assistant_events),"uniq_ratio":round(uniq,4),"max_dark_run":max_dark,"max_gap_min":round(max(gaps) if gaps else 0.0,2),"tokens":sum(e["tokens"] for e in group if e["type"] == "assistant"),"agents":agents,"label":label})
        return result

def scan(store,min_turns,since,money_terms,truth_paths,include_workers=False):
    patterns=term_patterns(money_terms); truth_res=[(p,re.compile(re.escape(p),re.I)) for p in truth_paths]; sessions={}
    for path in sorted(Path(store).glob("*.jsonl")):
        try:
            with path.open("r",encoding="utf-8",errors="replace") as fh:
                for line in fh:
                    try: rec=json.loads(line)
                    except ValueError: continue
                    sid=rec.get("sessionId")
                    if sid: sessions.setdefault(sid,Session(sid)).add(rec,patterns,truth_res)
        except OSError: continue
    kept=[s for s in sessions.values() if s.assistant>=min_turns and (not since or (s.date() and s.date().date()>=since))]
    return [s for s in kept if include_workers or s.kind == "main"]

def applicable(session,detector,windows):
    d=session.date(); return bool(d and d.date() >= dt.date.fromisoformat(windows[detector]))

def detector_rows(session,windows):
    positions=[i+1 for i,t in enumerate(session.tools) if checklist_write(t)]; state=bool(positions and positions[0] <= 6); narration=session.narrated/session.assistant if session.assistant else 1
    rows={"D1":len(session.tools)>=15 and not state,"D2":narration<.30,"D3":sum(t["name"]=="Bash" for t in session.tools)>=100 and session.agents<=3,"D4":session.topic_hits>=10 and len(session.topic_terms)>=3 and not session.truth,"D5":any(FABLE.search(m) for m in session.models) and session.agent_with_model<session.agents,"D6":False,"D7":session.review_prompts>2,"D8":session.big_briefs>0,"D9":any(p["label"] in ("LOOP","GRIND") for p in session.prompts())}
    delegation=[(i,t) for i,t in enumerate(session.tools) if t["name"] in ("Agent","Task","Workflow") or (t["name"]=="Bash" and OFF_CLAUDE.search(json.loads(t["raw"]).get("command", "")))]
    for i,_ in delegation:
        if not any(t["name"]=="Bash" and re.search(r"git\s+(?:diff|status)\b",json.loads(t["raw"]).get("command", ""),re.I) for t in session.tools[i+1:i+6]): rows["D6"]=True; break
    return [{"detector":d,"status":"N/A" if not applicable(session,d,windows) else "FAIL" if fail else "PASS"} for d,fail in rows.items()]

def report(sessions,windows,store,min_turns,elapsed,json_out=None,flag=None,top=10,prompt_sid=None,scanned=None,excluded_workers=0):
    prompts=[p for s in sessions for p in s.prompts()]; rows={s.id:detector_rows(s,windows) for s in sessions}; labels=Counter(p["label"] for p in prompts); dates=[s.date() for s in sessions if s.date()]
    print("store: %s\nsessions scanned: %d\nsessions kept: %d main (+%d workers excluded)\ndate range: %s to %s\nelapsed: %.1fs"%(store,scanned if scanned is not None else len(sessions),len(sessions),excluded_workers,min((d.date().isoformat() for d in dates),default="N/A"),max((d.date().isoformat() for d in dates),default="N/A"),elapsed))
    print("\ndetector | rule                 | applicable | fail | fail %"); short={"D1":"checklist","D2":"narrate","D3":"subagents","D4":"truth repos","D5":"cheap models","D6":"artifact verify","D7":"review rounds","D8":"brief size","D9":"not stuck"}
    for d in windows:
        statuses=[x["status"] for r in rows.values() for x in r if x["detector"]==d]; app=sum(x!="N/A" for x in statuses); fail=sum(x=="FAIL" for x in statuses); suffix=""
        if d=="D1": suffix=" (late checklist: %d)"%sum(1 for s in sessions if applicable(s,"D1",windows) and len(s.tools)>=15 and not any(checklist_write(t) for t in s.tools[:6]) and any(checklist_write(t) for t in s.tools[6:]))
        print("%-9s | %-20s | %10d | %4d | %5s%s"%(d,short[d],app,fail,("%.1f%%"%(100*fail/app)) if app else "N/A",suffix))
    print("\nstall label | prompts | %")
    for label in ("LOOP","GRIND","WAIT","OK"): print("%-11s | %7d | %5s"%(label,labels[label],("%.1f%%"%(100*labels[label]/len(prompts))) if prompts else "N/A"))
    worst=sorted((p for p in prompts if p["label"] in ("LOOP","GRIND")),key=lambda p:(p["label"],-p["turns"],-p["tokens"]))[:5]; print("\nworst LOOP/GRIND\nsession  | date       | wall_min | turns | uniq | prompt")
    for p in worst: print("%-8s | %-10s | %8.2f | %5d | %.2f | %s"%(p["session_id"][:8],p["date"][:10],p["wall_min"],p["turns"],p["uniq_ratio"],p["prompt"][:80].replace("\n"," ")))
    agent_total=sum(s.agents for s in sessions); with_model=sum(s.agent_with_model for s in sessions); print("\ndelegation\nAgent calls total: %d; with model: %d; without: %d"%(agent_total,with_model,agent_total-with_model)); print("off-Claude Bash delegations: %d"%sum(s.off_claude for s in sessions)); token_models=Counter()
    for s in sessions: token_models.update(s.tokens)
    print("tokens per model (output + cache_creation):"); [print("  %-30s %d"%(model or "<unknown>",count)) for model,count in sorted(token_models.items())]
    if flag:
        selected=[(s.date() or dt.datetime.min.replace(tzinfo=dt.timezone.utc),s) for s in sessions if {x["detector"]:x["status"] for x in rows[s.id]}.get(flag)=="FAIL"]; print("\nflagged %s (top %d)"%(flag,top))
        for _,s in sorted(selected,key=lambda x:x[0])[:top]:
            extra=""
            if flag=="D1":
                indexes=[i+1 for i,t in enumerate(s.tools) if checklist_write(t)]; extra=" | first checklist: %s"%(indexes[0] if indexes else "none")
            if flag=="D4": extra=" | prompt_hits %d | topic_hits %d | topic_terms %s"%(s.prompt_hits,s.topic_hits,sorted(s.topic_terms))
            print("%s | %s | kind %s | first prompt: %s%s | truth: %s"%(s.id,s.date().date().isoformat() if s.date() else "N/A",s.kind,s.first_prompt[:200].replace("\n"," "),extra,", ".join(sorted(s.truth))))
    if prompt_sid:
        print("\nprompts for %s"%prompt_sid)
        for p in next((s.prompts() for s in sessions if s.id.startswith(prompt_sid) or s.id==prompt_sid),[]): print(json.dumps(p,ensure_ascii=False,sort_keys=True))
    if json_out:
        payload={"store":str(store),"sessions":[{"session_id":s.id,"kind":s.kind,"assistant_turns":s.assistant,"money_hits":s.money_hits,"prompt_hits":s.prompt_hits,"topic_hits":s.topic_hits,"topic_terms":sorted(s.topic_terms),"truth_paths":sorted(s.truth),"detectors":rows[s.id]} for s in sessions],"prompts":prompts,"aggregates":{"labels":dict(labels),"agent_calls":agent_total,"agent_calls_with_model":with_model,"off_claude":sum(s.off_claude for s in sessions),"tokens_per_model":dict(token_models)}}; Path(json_out).write_text(json.dumps(payload,indent=2,ensure_ascii=False),encoding="utf-8")

def main(argv=None):
    started=time.monotonic(); ap=argparse.ArgumentParser(); ap.add_argument("--store"); ap.add_argument("--since"); ap.add_argument("--config"); ap.add_argument("--include-workers",action="store_true"); ap.add_argument("--json",dest="json_out"); ap.add_argument("--flag",choices=["D1","D2","D3","D4","D5","D6","D7","D8","D9"]); ap.add_argument("--top",type=int,default=10); ap.add_argument("--prompts"); ap.add_argument("--min-turns",type=int,default=5); args=ap.parse_args(argv); cwd=os.getcwd(); store=Path(args.store) if args.store else default_store(cwd); money,truth,windows=load_config(cwd,args.config); all_sessions=scan(store,args.min_turns,dt.date.fromisoformat(args.since) if args.since else None,money,truth,True); sessions=all_sessions if args.include_workers else [s for s in all_sessions if s.kind=="main"]; report(sessions,windows,str(store),args.min_turns,time.monotonic()-started,args.json_out,args.flag,args.top,args.prompts,len(all_sessions),sum(s.kind=="worker" for s in all_sessions if not args.include_workers))

if __name__ == "__main__": main()
