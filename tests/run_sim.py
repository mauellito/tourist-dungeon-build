#!/usr/bin/env python3
"""Run the headless balance sim (tests/sim.js) on THIS machine — which has no Node — by loading the
pure engine modules + sim.js in headless Chrome. Prints the per-policy distribution and checks
determinism (same seed -> identical run). The same sim.js also runs under Node as `node tests/sim.js`.

Usage:  python tests/run_sim.py [N] [seed]      (defaults: N=1000, seed=1234)
"""
import html, os, re, shutil, subprocess, sys, tempfile
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, "engine"); TESTS = os.path.join(ROOT, "tests"); TMP = os.path.join(ROOT, "tests", ".tmp")
CH = [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
      r"C:\Program Files\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"]
N = (sys.argv[1] if len(sys.argv) > 1 else "1000")
SEED = (sys.argv[2] if len(sys.argv) > 2 else "1234")
REP = r"""
<script>(function(){var o=document.getElementById('out');var R=[],fails=0;
function ok(n,c,d){R.push((c?'PASS ':'FAIL ')+n+(d?('  ::  '+d):''));if(!c)fails++;}
try{
  var N=__N__, SEED=__SEED__;
  var res=TD_SIM.runAll({N:N, seed:SEED});
  var report=TD_SIM.format(res);
  // structural sanity
  ok('three bracketed policies run', TD_SIM.POLICIES.length===3 && !!res.policies.greedy && !!res.policies.cautious && !!res.policies.random);
  ['greedy','cautious','random'].forEach(function(p){ var r=res.policies[p];
    ok(p+': win-rate is a fraction in [0,1]', r.winRate>=0&&r.winRate<=1, p+' '+(r.winRate*100).toFixed(1)+'%');
    ok(p+': death causes sum to the deaths', (r.death.collapse+r.death.slab+r.death.combat)===(r.N-r.wins));
  });
  // CALIBRATION REGRESSION (post-Gate-1): lock the greed tradeoff + anti-degeneracy so the loop
  // can't silently re-degenerate. Fixed seed/N => deterministic guard. (Targets: greed pays + costs;
  // no single death-cause dominates.)
  var P=res.policies;
  ok('REGRESSION: greed WINS LESS than cautious (cost of greed)', P.greedy.winRate < P.cautious.winRate, (P.greedy.winRate*100).toFixed(1)+"% < "+(P.cautious.winRate*100).toFixed(1)+"%");
  ok('REGRESSION: greed BANKS MORE than cautious (greed pays)', P.greedy.lootPerLife > P.cautious.lootPerLife, "$"+P.greedy.lootPerLife.toFixed(1)+" > $"+P.cautious.lootPerLife.toFixed(1));
  ok('REGRESSION: greed loot/life >= 1.25x cautious (tradeoff real)', P.greedy.lootPerLife >= 1.25*P.cautious.lootPerLife, (P.greedy.lootPerLife/(P.cautious.lootPerLife||1)).toFixed(2)+"x");
  ['greedy','cautious','random'].forEach(function(p){var r=P[p],d=(r.N-r.wins)||1,mx=Math.max(r.death.collapse,r.death.slab,r.death.combat)/d;
    ok('REGRESSION: '+p+' has NO single death-cause > 60%', mx<=0.60, (mx*100).toFixed(1)+"% top cause");});
  // DETERMINISM: same seed -> byte-identical aggregate (and a different seed differs)
  var a=JSON.stringify(TD_SIM.runAll({N:200,seed:99})), b=JSON.stringify(TD_SIM.runAll({N:200,seed:99}));
  ok('determinism: same seed -> identical run', a===b);
  ok('a different seed gives a different stream', a!==JSON.stringify(TD_SIM.runAll({N:200,seed:100})));

  // ===== NEW COMBAT MODEL (two-function + gear + encumbrance) — MEASURE only =====
  var cres=TD_SIM.runCombat({N:N, seed:SEED}), creport=TD_SIM.formatCombat(cres);
  ok('combat model: 3 policies run through real TD_RESOLVE hit/damage + TD_BURDEN', !!cres.policies.greedy&&!!cres.policies.cautious&&!!cres.policies.random);
  ['greedy','cautious','random'].forEach(function(p){var r=cres.policies[p];
    ok('combat '+p+': win-rate is a fraction in [0,1]', r.winRate>=0&&r.winRate<=1, p+' '+(r.winRate*100).toFixed(1)+'%');
    ok('combat '+p+': combat-deaths = N - wins', r.death.combat===(r.N-r.wins));});
  ok('combat model determinism: same seed -> identical run', JSON.stringify(TD_SIM.runCombat({N:200,seed:77}))===JSON.stringify(TD_SIM.runCombat({N:200,seed:77})));
  // COMBAT CLOSE-OUT (win-band RETIRED; density FINAL at 0.0041). The bar is now VALUE comparability of the
  // two strategic routes across the gen2 +-20% size spread, NOT a single survival %. EV per route = survival
  // x loot|win (== lootPerLife). Both must be VIABLE (neither a trap nor trivial). If one route dominates on
  // value it is FLAGGED for a QB ruling — NOT auto-tuned — so this lock allows the current reality and only
  // catches degeneracy/catastrophic drift. (Measured: combat EV ~1.8x avoid; combat trades survival for loot.)
  var vrep=TD_SIM.valueReport({N:Math.min(N,400), seeds:[1,2,3,4,5,6]}), vreport=TD_SIM.formatValue(vrep);   // PER-ROUTE VALUE report (printed below)
  var aRes=TD_SIM.runCombat({N:N,seed:SEED,route:'avoid'});
  var cG=cres.policies.greedy, aG=aRes.policies.greedy, evRatio=aG.ev?(cG.ev/aG.ev):0;
  ok('CLOSE-OUT: BOTH routes viable (neither a trap nor trivial)', cG.winRate>=0.30&&cG.winRate<=0.70 && aG.winRate>=0.65&&aG.winRate<=0.98 && cG.ev>0 && aG.ev>0, "combat surv "+(cG.winRate*100).toFixed(0)+"% / avoid surv "+(aG.winRate*100).toFixed(0)+"%");
  ok('CLOSE-OUT: value EV ratio combat:avoid in a sane range (FLAG: combat ~1.8x dominant -> QB ruling, not auto-tuned)', evRatio>=1.2&&evRatio<=2.6, "EV combat $"+cG.ev.toFixed(0)+" : avoid $"+aG.ev.toFixed(0)+" = "+evRatio.toFixed(2)+"x");
  ok('CLOSE-OUT: combat trades survival for loot (lower survival, higher loot|win than avoid)', cG.winRate<aG.winRate && cG.lootGivenWin>aG.lootGivenWin, "surv c<a "+(cG.winRate<aG.winRate)+", loot|win c>a "+(cG.lootGivenWin>aG.lootGivenWin));

  o.textContent=report+"\n\n"+creport+"\n\n"+vreport+"\n\n"+R.join('\n')+'\nSUMMARY '+(R.length-fails)+'/'+R.length; document.title="SIM fail="+fails;
}catch(e){o.textContent="HARNESS_ERROR "+(e&&e.stack?e.stack:e);document.title="SIM harness_error";}})();</script>
""".replace("__N__", N).replace("__SEED__", SEED)


def find_chrome():
    for p in CH:
        if os.path.exists(p):
            return p
    return None


def main():
    chrome = find_chrome()
    if not chrome:
        sys.exit("no chrome")
    os.makedirs(TMP, exist_ok=True)
    parts = ['<!doctype html><meta charset=utf-8><title>p</title><pre id="out">p</pre>',
             "<script>\n" + open(os.path.join(ENGINE, "rng.js"), encoding="utf-8").read() + "\n</script>",
             "<script>\n" + open(os.path.join(ENGINE, "stats.js"), encoding="utf-8").read() + "\n</script>",
             "<script>\n" + open(os.path.join(ENGINE, "resolve.js"), encoding="utf-8").read() + "\n</script>",
             "<script>\n" + open(os.path.join(ENGINE, "burden.js"), encoding="utf-8").read() + "\n</script>",
             # CALIBRATION R0: the sim now sources its floor model from the LIVE generator (gen2) and the
             # live spawn densities (TD_MAP) — load them so TD_GEN2 + TD_MAP densities are available.
             "<script>\n" + open(os.path.join(ENGINE, "gen2.js"), encoding="utf-8").read() + "\n</script>",
             "<script>\n" + open(os.path.join(ENGINE, "mapmode.js"), encoding="utf-8").read() + "\n</script>",
             "<script>\n" + open(os.path.join(TESTS, "sim.js"), encoding="utf-8").read() + "\n</script>", REP]
    runner = os.path.join(TMP, "sim_runner.html"); open(runner, "w", encoding="utf-8").write("\n".join(parts))
    ud = tempfile.mkdtemp(prefix="td_sim_")
    try:
        pr = subprocess.run([chrome, "--headless", "--disable-gpu", "--no-sandbox", "--user-data-dir=" + ud, "--dump-dom", "file:///" + runner.replace("\\", "/")], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=180)
    finally:
        shutil.rmtree(ud, ignore_errors=True)
    dom = pr.stdout.decode("utf-8", "replace")
    title = (re.search(r"<title>(.*?)</title>", dom, re.DOTALL) or [None, ""])[1]
    m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.DOTALL)
    print(html.unescape(m.group(1)) if m else "(no output)\n" + dom[:1200])
    print("-" * 60)
    fm = re.search(r"fail=(\d+)", title)
    if "harness_error" in title or not fm:
        print("RESULT: HARNESS ERROR"); return 2
    fails = int(fm.group(1)); print("RESULT: {} failed".format(fails)); return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
