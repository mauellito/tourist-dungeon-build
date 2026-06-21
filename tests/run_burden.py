#!/usr/bin/env python3
"""TD_BURDEN — pure encumbrance + coin-weight (combat track). Verifies: the canon bands at
50/75/100% of cap (Unencumbered/Laden/Strained/Overloaded); carry cap from Might; coins at 25/lb
(denomination-blind) adding to carried weight; gold-vs-copper weight-efficiency (equal weight ->
all-gold is the lightest way to hold a value); the BULK dimension (light-but-huge fails on bulk);
feel-word surfacing with NO number leak; determinism. Pure, no DOM, no controller wiring.

Run:  python tests/run_burden.py
"""
import html, os, re, shutil, subprocess, sys, tempfile
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, "engine"); TMP = os.path.join(ROOT, "tests", ".tmp")
CH = [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
      r"C:\Program Files\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"]
REP = r"""
<script>(function(){var o=document.getElementById('out');var R=[],fails=0;
function ok(n,c,d){R.push((c?'PASS ':'FAIL ')+n+(d?('  ::  '+d):''));if(!c)fails++;}
var B=TD_BURDEN, S=TD_STATS;
function st(ov){var b={might:500,dex:500,con:500,int:500,per:500,lucky:500,intuition:500,appearance:500,charm:500,grit:500};for(var k in (ov||{}))b[k]=ov[k];return b;}
function items(totalW,totalBulk){return [{weight:totalW,bulk:totalBulk||0}];}
try{
  var cap=B.carryCap(st());   // Might 500 -> ~100 lbs (canon: 100 lbs at the human midpoint)
  ok('carry cap derives from Might (~100 lbs at the midpoint)', cap>=90&&cap<=110, "cap="+cap);
  ok('higher Might -> higher carry cap', B.carryCap(st({might:1000}))>B.carryCap(st({might:500})), B.carryCap(st({might:1000}))+">"+B.carryCap(st({might:500})));

  // ---- BANDS at 50/75/100% of cap ----
  function bandAt(fracOfCap){ return B.compute(st(), items(cap*fracOfCap)).band.key; }
  ok('band 40% cap -> Unencumbered', bandAt(0.40)==='unencumbered');
  ok('band 60% cap -> Laden', bandAt(0.60)==='laden');
  ok('band 85% cap -> Strained', bandAt(0.85)==='strained');
  ok('band 110% cap -> Overloaded', bandAt(1.10)==='overloaded');
  ok('the four canon bands exist with descending speed', B.BANDS.length===4 && B.BANDS[0].speed>B.BANDS[3].speed);

  // ---- COINS: 25/lb, denomination-blind ----
  ok('coins weigh 25 per pound', Math.abs(B.coinWeight(25)-1)<1e-9 && Math.abs(B.coinWeight(250)-10)<1e-9, "25->"+B.coinWeight(25)+" 250->"+B.coinWeight(250));
  ok('a purse adds its coin weight to carried weight', Math.abs(B.carriedWeight([{weight:10}],{copper:50})-(10+2))<1e-9, "10lb+50cu="+B.carriedWeight([{weight:10}],{copper:50}));
  ok('coin weight is denomination-BLIND (50 copper weighs the same as 50 gold)', B.purseWeight({copper:50})===B.purseWeight({gold:50}));

  // ---- GOLD vs COPPER efficiency: equal VALUE, all-gold is lightest ----
  var val=10000;   // value in copper-equivalents
  var allCopper={copper:val}, allSilver={silver:val/10}, allGold={gold:val/100};
  ok('same value held three ways -> same VALUE', B.purseValue(allCopper)===val && B.purseValue(allSilver)===val && B.purseValue(allGold)===val, "val="+val);
  ok('GOLD is the lightest wealth (all-gold << all-copper for equal value)', B.purseWeight(allGold)<B.purseWeight(allSilver) && B.purseWeight(allSilver)<B.purseWeight(allCopper), "gold="+B.purseWeight(allGold)+" silver="+B.purseWeight(allSilver)+" copper="+B.purseWeight(allCopper));

  // ---- BULK: light-but-huge fails on the bulk dimension ----
  var huge=B.compute(st(), [{weight:1,bulk:B.BULK_CAP*1.2}]);   // almost no weight, over bulk cap
  ok('BULK dimension: light-but-huge -> Overloaded via bulk (not weight)', huge.band.key==='overloaded' && huge.limiting==='bulk', "limiting="+huge.limiting);

  // ---- FEEL-WORD surfacing: band word only, NO number leak ----
  var word=B.surface(st(), items(cap*0.85));
  ok('surface() returns the band FEEL-WORD (no number leaks)', word==='Strained' && !/[0-9]/.test(word), word);

  // ---- GATE 3: WEIGHT READOUT — the coin is the in-world MASS unit (25/lb), 1 stone = 350 coins = 14 lb ----
  ok('massCoins: 1 lb -> 25 coins of mass', B.massCoins(1)===25, "1lb="+B.massCoins(1));
  ok('massCoins: 14 lb -> 350 coins (= 1 stone)', B.massCoins(14)===350 && B.COINS_PER_STONE===350, "14lb="+B.massCoins(14));
  ok('itemMassCoins reads it.weight via the SAME rule', B.itemMassCoins({weight:1})===25 && B.itemMassCoins({weight:0})===0);
  ok('massLabel: under a stone -> bare coins ("25")', B.massLabel(25)==='25', B.massLabel(25));
  ok('massLabel: exactly a stone -> "1 stone"', B.massLabel(350)==='1 stone', B.massLabel(350));
  ok('massLabel: leads with STONE + coin remainder ("4 stone, 25")', B.massLabel(4*350+25)==='4 stone, 25', B.massLabel(4*350+25));
  // the purse weighs itself by the same rule: N coins weigh N/25 lb -> massCoins == N (the purse reads its own count)
  ok('the purse weighs itself by the same rule (100 coins -> mass 100)', B.massCoins(B.purseWeight({copper:100}))===100, "->"+B.massCoins(B.purseWeight({copper:100})));
  // per-item AND running-total from ONE derivation (massCoins); total is the authoritative carried figure
  var totLb=B.carriedWeight([{weight:14},{weight:1}],{copper:25});   // 14 + 1 + 1(=25cu) = 16 lb
  ok('running total derives from the same massCoins rule (16 lb -> 400 = 1 stone, 50)', B.massLabel(B.massCoins(totLb))==='1 stone, 50', B.massLabel(B.massCoins(totLb)));
  ok('mass figures are NUMERIC (object mass is allowed digits, unlike the band word)', /[0-9]/.test(B.massLabel(25)));

  // ---- determinism ----
  ok('determinism: same inputs -> identical result', JSON.stringify(B.compute(st(),items(60),{gold:7}))===JSON.stringify(B.compute(st(),items(60),{gold:7})));

  o.textContent=R.join('\n')+'\nSUMMARY '+(R.length-fails)+'/'+R.length; document.title="BURDEN fail="+fails;
}catch(e){o.textContent="HARNESS_ERROR "+(e&&e.stack?e.stack:e);document.title="BURDEN harness_error";}})();</script>
"""


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
             "<script>\n" + open(os.path.join(ENGINE, "stats.js"), encoding="utf-8").read() + "\n</script>",
             "<script>\n" + open(os.path.join(ENGINE, "burden.js"), encoding="utf-8").read() + "\n</script>", REP]
    runner = os.path.join(TMP, "burden_runner.html"); open(runner, "w", encoding="utf-8").write("\n".join(parts))
    ud = tempfile.mkdtemp(prefix="td_burden_")
    try:
        pr = subprocess.run([chrome, "--headless", "--disable-gpu", "--no-sandbox", "--user-data-dir=" + ud, "--dump-dom", "file:///" + runner.replace("\\", "/")], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=120)
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
