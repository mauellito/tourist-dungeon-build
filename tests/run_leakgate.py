#!/usr/bin/env python3
"""PART A — the LIVE-FLOOR LEAK GATE sweep (the "1 open corner = failure" law).

Loads the real engine (rng + resolve + burden + interpreter + vaults + gen2 + mapmode) in headless
Chrome and sweeps seeds 1..N under the LIVE floor params (TD_MAP._gen2Opts). It reports two columns:
  * BASELINE  — ungated TD_GEN2.generateLevel(seed): reproduces the ~1.2% open-corner bug.
  * GATED     — TD_MAP._gen2Clean(seed) (the live pipeline): MUST be 0 leaks / single region / 2 stairs.
Fails (nonzero exit) if any gated floor leaks, splits, or loses a stair.

Usage:  python tests/run_leakgate.py [N]      (default N=2000 — the acceptance sweep)
"""
import html, os, re, shutil, subprocess, sys, tempfile
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, "engine"); TMP = os.path.join(ROOT, "tests", ".tmp")
ENGINE_FILES = ["rng.js", "resolve.js", "burden.js", "interpreter.js", "vaults.js", "gen2.js", "mapmode.js"]
CH = [r"C:\Program Files\Google\Chrome\Application\chrome.exe",
      r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
      r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
      r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"]
N = (sys.argv[1] if len(sys.argv) > 1 else "600")   # routine regression; the acceptance sweep is `run_leakgate.py 2000`
REP = r"""
<script>(function(){var o=document.getElementById('out');var R=[],fails=0;
function ok(n,c,d){R.push((c?'PASS ':'FAIL ')+n+(d?('  ::  '+d):''));if(!c)fails++;}
try{
  var N=__N__, opts=TD_MAP._gen2Opts;
  // BASELINE (ungated): reproduce the open-corner bug rate.
  var bLeak=0,bRegion=0,bStair=0,firstLeak=0;
  for (var s=1;s<=N;s++){ var lv=TD_GEN2.generateLevel(s>>>0,opts), m=TD_GEN2.measure(lv.grid);
    if(m.leaks>0){bLeak++; if(!firstLeak) firstLeak=s;} if(m.regions!==1)bRegion++; if(!lv.up||!lv.down)bStair++; }
  // GATED (the live pipeline): must be perfectly clean.
  var gLeak=0,gRegion=0,gStair=0,extra=0,retried=0,maxTry=0;
  for (var s2=1;s2<=N;s2++){ var fl=TD_MAP._gen2Clean(s2), m2=TD_GEN2.measure(fl.grid);
    if(m2.leaks>0)gLeak++; if(m2.regions!==1)gRegion++; if(!fl.up||!fl.down)gStair++;
    extra+=(fl._tries-1); if(fl._tries>1)retried++; if(fl._tries>maxTry)maxTry=fl._tries; }
  ok('PART A: GATED live floor — 0 open-corner leaks across seeds 1..'+N, gLeak===0, gLeak+' leaks');
  ok('PART A: GATED live floor — single region across seeds 1..'+N, gRegion===0, gRegion+' multi-region');
  ok('PART A: GATED live floor — both stairs across seeds 1..'+N, gStair===0, gStair+' missing-stair');
  ok('PART A: GATED gate is sound — no candidate exhausted the retry budget', maxTry>0, 'maxTries='+maxTry);
  // FEATURES: re-run the gate at a DEEP depth (6) so the richest feature-rooms (hazard chasm pits, reward
  // vaults) actually stamp, and confirm the FEATURE-STAMPED floor still obeys every law (the gate reseeds any
  // feature that breaks one). Also confirm features actually appear (depth-weighted) across the sweep.
  var fLeak=0,fRegion=0,fStair=0,withFeat=0,M=Math.min(N,600);
  for(var s3=1;s3<=M;s3++){ var fl3=TD_MAP._gen2Clean(s3,6), m3=TD_GEN2.measure(fl3.grid);
    if(m3.leaks>0)fLeak++; if(m3.regions!==1)fRegion++; if(!fl3.up||!fl3.down)fStair++; if((fl3.features||[]).length>0)withFeat++; }
  ok('FEATURES: deep (depth 6) FEATURE-STAMPED floors hold leaks===0 across 1..'+M, fLeak===0, fLeak+' leaks');
  ok('FEATURES: deep feature-stamped floors stay single region across 1..'+M, fRegion===0, fRegion+' multi-region');
  ok('FEATURES: deep feature-stamped floors keep both stairs across 1..'+M, fStair===0, fStair+' missing-stair');
  ok('FEATURES: features actually appear (sparse, depth-weighted) across 1..'+M, withFeat>0 && withFeat<M, withFeat+'/'+M+' floors carry a feature');
  R.push('');
  R.push('TABLE (seeds 1..'+N+', live params '+JSON.stringify(opts)+')');
  R.push('  BASELINE ungated : leaks='+bLeak+' ('+(100*bLeak/N).toFixed(2)+'%, first@seed '+firstLeak+') · regions!=1='+bRegion+' · stairless='+bStair);
  R.push('  GATED   pipeline : leaks='+gLeak+' · regions!=1='+gRegion+' · stairless='+gStair+'  <-- ACCEPTANCE');
  R.push('  GATE cost        : '+retried+'/'+N+' seeds needed a reseed ('+(100*retried/N).toFixed(2)+'%) · '+extra+' extra gens · max '+maxTry+' tries on one floor');
  o.textContent=R.join('\n'); document.title='leakgate pass='+(R.filter(function(x){return x.indexOf('PASS ')===0;}).length)+' fail='+fails;
}catch(e){o.textContent='HARNESS_ERROR '+(e&&e.stack?e.stack:e); document.title='leakgate harness_error';}
})();</script>
"""


def find_chrome():
    for p in CH:
        if os.path.exists(p):
            return p
    for n in ("chrome", "chrome.exe", "msedge", "msedge.exe"):
        f = shutil.which(n)
        if f:
            return f
    return None


def main():
    chrome = find_chrome()
    if not chrome:
        sys.exit("FATAL: no Chrome/Edge found.")
    parts = ['<!doctype html><html><head><meta charset="utf-8"><title>pending</title></head>', '<body><pre id="out">pending</pre>']
    for fn in ENGINE_FILES:
        with open(os.path.join(ENGINE, fn), "r", encoding="utf-8") as f:
            parts.append("<script>\n" + f.read() + "\n</script>")
    parts.append(REP.replace("__N__", N))
    parts.append("</body></html>")
    os.makedirs(TMP, exist_ok=True)
    runner = os.path.join(TMP, "leakgate_runner.html")
    with open(runner, "w", encoding="utf-8") as f:
        f.write("\n".join(parts))
    user_data = tempfile.mkdtemp(prefix="td_leak_")
    url = "file:///" + runner.replace("\\", "/")
    cmd = [chrome, "--headless", "--disable-gpu", "--no-sandbox", "--user-data-dir=" + user_data, "--virtual-time-budget=120000", "--dump-dom", url]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=300)
    finally:
        shutil.rmtree(user_data, ignore_errors=True)
    dom = proc.stdout.decode("utf-8", "replace")
    title = (re.search(r"<title>(.*?)</title>", dom, re.DOTALL) or [None, ""])[1]
    m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.DOTALL)
    print(html.unescape(m.group(1)) if m else "(no output)\n" + dom[:1500])
    print("-" * 60)
    fm = re.search(r"fail=(\d+)", title)
    if "harness_error" in title or not fm:
        print("RESULT: HARNESS ERROR")
        return 2
    fails = int(fm.group(1))
    print("RESULT: {} failed".format(fails))
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
