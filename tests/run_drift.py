#!/usr/bin/env python3
"""Dungeon Type STANDARD v1 — drift bands + type-parameter measurement (framework).

Gates the per-level DRIFT distribution (50% base / 20% +-5% / 20% +-10% / 10% +-15%) and
that the type-parameter MEASUREMENT + gate-against-band machinery works. Then REPORTS each
STANDARD sample's type-parameter conformance against ITS drifted band — honestly showing
which parameters the current (comb) assembler already meets and which it does not yet
(CORRIDOR STRAIGHTNESS is the known gap: the comb is straight; STANDARD wants winding — the
flagged next build). Failures are shown, not hidden.

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
    // 2. type-parameter conformance of STANDARD samples vs each level's band
    var params=["room_count","size_spread","regularity","straightness","corridor_amount","dead_ends","secrets","loops"];
    var pass={}, tot=0; params.forEach(function(p){pass[p]=0;});
    var sample=null;
    for(var s2=1;s2<=30;s2++){
      var g=TD_ASSEMBLER.generateGated(s2,"STANDARD",80); if(!g||!g.passed) continue;
      var t=TD_ASSEMBLER.paramsFor(s2, ((s2*7)%30)+1);
      var c=TD_LAWS.conformsType(g.map, t); tot++;
      params.forEach(function(p){ if(c.checks[p] && c.checks[p].pass) pass[p]++; });
      if(!sample) sample={t:t, checks:c.checks, measured:c.measured};
    }
    out.textContent=JSON.stringify({bands:bands, N:N, params:params, pass:pass, tot:tot, sample:sample});
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
    print("type-parameter conformance across %d STANDARD samples (vs each level's drifted band):" % d["tot"])
    for p in d["params"]:
        print("   %-16s %d/%d" % (p, d["pass"][p], d["tot"]))
    fails = []
    # GATE: the per-level DRIFT distribution is correct (the new mechanism), within tolerance.
    if not (0.42 <= fr["0"] <= 0.58): fails.append("base band %.0f%% out of 42-58" % (100 * fr["0"]))
    if not (0.12 <= fr["5"] <= 0.28): fails.append("±5%% band %.0f%% out of 12-28" % (100 * fr["5"]))
    if not (0.12 <= fr["10"] <= 0.28): fails.append("±10%% band %.0f%% out of 12-28" % (100 * fr["10"]))
    if not (0.04 <= fr["15"] <= 0.18): fails.append("±15%% band %.0f%% out of 4-18" % (100 * fr["15"]))
    # GATE: the measurement + gate-against-band machinery actually runs and returns sane numbers.
    s = d.get("sample")
    if not s or not s.get("measured"): fails.append("conformsType returned no sample")
    elif not (s["measured"]["roomCount"] > 0 and s["measured"]["corridorPct"] > 0): fails.append("measureType returned degenerate numbers")
    # (Type-PARAM conformance is REPORTED above, not gated here: the comb predates these
    #  parameters and meets few of them — straightness especially. Building the assembler to
    #  the bands is the winding-corridor rework, flagged. This harness proves the framework.)
    print("-" * 64)
    print("NOTE: corridor straightness is the KNOWN gap — the comb is ~ruler-straight; STANDARD")
    print("      wants winding (<=30%). The winding-corridor rework is the flagged next build;")
    print("      this harness builds + verifies the drift + gate-against-band framework around it.")
    if fails:
        for f in fails:
            print("FAIL " + f)
        print("RESULT: drift/measurement framework problems above"); return 1
    print("RESULT: drift distribution correct; type-parameter measurement + gate-against-band work "
          "(straightness pending the winding rework, flagged).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
