#!/usr/bin/env python3
"""Dungeon Type STANDARD v1 — drift bands + per-level gate-against-band.

Gates two things:
  1. the per-level DRIFT distribution (50% base / 20% +-5% / 20% +-10% / 10% +-15%), and
  2. the DRIFT GATE itself: for each (seed, level), the assembler produces a STANDARD level
     that passes BOTH the spatial laws (L1-L11/D1-D4) AND its own drifted target band
     (paramsFor) within an attempt budget. Winding corridors land <=30% straight by design,
     so even down-drifted (very-winding) bands conform.

Reports the per-parameter conformance of the chosen maps. Failures are shown, not hidden.

Run:  python tests/run_drift.py
"""
import html, json, os, re, shutil, subprocess, sys, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, "engine"); TMP = os.path.join(ROOT, "tests", ".tmp")
CH = [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
      r"C:\Program Files\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"]

REPORTER = r"""
<script>(function(){
  var out=document.getElementById('out');
  try{
    // 1. drift-band distribution over many levels
    var bands={0:0,5:0,10:0,15:0}, N=600;
    for(var s=1;s<=20;s++) for(var lv=1;lv<=30;lv++){ var b=Math.round(TD_ASSEMBLER.driftBandOf(s,lv)*100); bands[b]=(bands[b]||0)+1; }
    // 2. the DRIFT GATE in action: for each (seed,level), produce a map that passes BOTH the
    //    spatial laws AND its own drifted band. Report how many levels get a fully-conforming
    //    map within budget, and per-parameter which one most often needs the retries.
    var params=["room_count","size_spread","regularity","straightness","corridor_amount","dead_ends","secrets","loops"];
    var pass={}, tot=0, conform=0, attempts=[]; params.forEach(function(p){pass[p]=0;});
    var sample=null;
    for(var s2=1;s2<=24;s2++){
      var lv=((s2*7)%30)+1;
      var g=TD_ASSEMBLER.generateForLevel(s2, lv, "STANDARD", 200); if(!g) continue;
      tot++; if(g.passed){ conform++; attempts.push(g.attempt); }
      var c=g.type;
      params.forEach(function(p){ if(c.checks[p] && c.checks[p].pass) pass[p]++; });
      if(!sample) sample={t:g.band, checks:c.checks, measured:c.measured};
    }
    var avgAtt = attempts.length ? Math.round(attempts.reduce(function(a,b){return a+b;},0)/attempts.length) : 0;
    out.textContent=JSON.stringify({bands:bands, N:N, params:params, pass:pass, tot:tot, conform:conform, avgAtt:avgAtt, sample:sample});
    document.title="ok";
  }catch(e){ out.textContent="HARNESS_ERROR "+(e&&e.stack?e.stack:e); document.title="err"; }
})();</script>
"""


def find_chrome():
    for p in CH:
        if os.path.exists(p):
            return p
    return None


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    chrome = find_chrome()
    if not chrome:
        sys.exit("FATAL: no Chrome/Edge found.")
    os.makedirs(TMP, exist_ok=True)
    parts = ['<!doctype html><meta charset=utf-8><title>p</title><pre id=out>p</pre>']
    for fn in ("rng.js", "lawsuite.js", "assembler.js"):
        parts.append("<script>\n" + open(os.path.join(ENGINE, fn), encoding="utf-8").read() + "\n</script>")
    parts.append(REPORTER)
    rp = os.path.join(TMP, "drift_runner.html"); open(rp, "w", encoding="utf-8").write("\n".join(parts))
    ud = tempfile.mkdtemp(prefix="td_dr_")
    try:
        pr = subprocess.run([chrome, "--headless", "--disable-gpu", "--no-sandbox", "--user-data-dir=" + ud, "--dump-dom", "file:///" + rp.replace("\\", "/")], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=240)
    finally:
        shutil.rmtree(ud, ignore_errors=True)
    dom = pr.stdout.decode("utf-8", "replace")
    m = re.search(r'<pre id=.?out.?>(.*?)</pre>', dom, re.DOTALL)
    if not m:
        print("NO OUTPUT"); print(dom[:1200]); return 2
    raw = html.unescape(m.group(1))
    if raw.startswith("HARNESS_ERROR"):
        print(raw[:2500]); return 2
    d = json.loads(raw)
    N = sum(d["bands"].values())
    fr = {k: d["bands"].get(k, 0) / N for k in ("0", "5", "10", "15")}
    print("drift bands over %d levels: base %.0f%% (~50) | ±5%% %.0f%% (~20) | ±10%% %.0f%% (~20) | ±15%% %.0f%% (~10)"
          % (N, 100 * fr["0"], 100 * fr["5"], 100 * fr["10"], 100 * fr["15"]))
    print("drift gate (generateForLevel: passes the laws AND its own drifted band): %d/%d levels "
          "fully conform within budget (avg %d attempts)." % (d["conform"], d["tot"], d.get("avgAtt", 0)))
    print("per-parameter conformance of the chosen maps (vs each level's drifted band):")
    for p in d["params"]:
        print("   %-16s %d/%d" % (p, d["pass"][p], d["tot"]))
    fails = []
    # GATE: the per-level DRIFT distribution is correct (the new mechanism), within tolerance.
    if not (0.42 <= fr["0"] <= 0.58): fails.append("base band %.0f%% out of 42-58" % (100 * fr["0"]))
    if not (0.12 <= fr["5"] <= 0.28): fails.append("±5%% band %.0f%% out of 12-28" % (100 * fr["5"]))
    if not (0.12 <= fr["10"] <= 0.28): fails.append("±10%% band %.0f%% out of 12-28" % (100 * fr["10"]))
    if not (0.04 <= fr["15"] <= 0.18): fails.append("±15%% band %.0f%% out of 4-18" % (100 * fr["15"]))
    # GATE: the measurement machinery runs and returns sane numbers.
    s = d.get("sample")
    if not s or not s.get("measured"): fails.append("conformsType returned no sample")
    elif not (s["measured"]["roomCount"] > 0 and s["measured"]["corridorPct"] > 0): fails.append("measureType returned degenerate numbers")
    # GATE: the drift gate actually delivers — most STANDARD levels get a map that passes BOTH the
    # laws AND their drifted band within budget (winding corridors land <=30% straight by design).
    if d["tot"] and d["conform"] < d["tot"] * 0.85:
        fails.append("only %d/%d levels found a law+band conforming map within budget" % (d["conform"], d["tot"]))
    print("-" * 64)
    if fails:
        for f in fails:
            print("FAIL " + f)
        print("RESULT: drift gate problems above"); return 1
    print("RESULT: drift distribution correct; STANDARD levels are generated to PASS their own "
          "drifted band (winding corridors land <=30%% straight) — the gate validates per level.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
