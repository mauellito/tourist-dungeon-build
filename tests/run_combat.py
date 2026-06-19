#!/usr/bin/env python3
"""TD_RESOLVE two-function combat (combat track R3). Verifies HIT (accuracy vs evasion, gap-scaled,
Lucky's +/-10% thumb) is SEPARATE from DAMAGE (Might + weapon - armor robustness, deterministic, rare
crit, de-minimis when armour eats it); THE READ (Per perceives = OBJ honest; Intuition interprets =
SUBJ, can mislead) surfaced as feel-words with no number leak; and determinism (same seed -> same run).
ALL NUMBERS PLACEHOLDER. Pure, no DOM.

Run:  python tests/run_combat.py
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
var T=TD_RESOLVE, RNG=TD_RNG;
function st(ov){var b={might:500,dex:500,con:500,int:500,per:500,lucky:500,intuition:500,appearance:500,charm:500,grit:500};for(var k in (ov||{}))b[k]=ov[k];return b;}
function rate(att,def,n,seed){var rng=RNG.make(seed),h=0;for(var i=0;i<n;i++)if(T.hit(att,def,rng).hit)h++;return h/n;}
try{
  // ---- HIT and DAMAGE are SEPARATE functions ----
  var A=T.fighter(st({dex:700,might:700})), D=T.fighter(st({dex:500}));
  var h=T.hit(A,D,RNG.make(1)), dm=T.damage(A,D,RNG.make(1));
  ok('HIT and DAMAGE are separate (hit->connect/miss, damage->amount)', typeof h.hit==='boolean' && typeof dm.damage==='number');

  // ---- GAP-SCALING: clear gap reliable, close gap swingy ----  (neutral-acc weapon isolates the Dex gap)
  var nw={name:"n",base:10,type:"blade",acc:0};
  var strong=T.fighter(st({dex:1000}),nw), weakD=T.fighter(st({dex:1}),nw), evenA=T.fighter(st({dex:500}),nw), evenD=T.fighter(st({dex:500}),nw);
  var rHigh=rate(strong,weakD,600,11), rEven=rate(evenA,evenD,600,11), rLow=rate(weakD,strong,600,11);
  ok('gap-scaling: a clear accuracy gap is RELIABLE (high hit-rate)', rHigh>0.85, rHigh.toFixed(2));
  ok('gap-scaling: an even matchup is SWINGY (~50%)', rEven>0.40&&rEven<0.60, rEven.toFixed(2));
  ok('gap-scaling: a clear DISADVANTAGE rarely connects', rLow<0.15, rLow.toFixed(2));

  // ---- LUCKY: shifts the hit chance by at most its +/-10% thumb ----
  var lucky=T.fighter(st({dex:500,lucky:1000}),nw), unluck=T.fighter(st({dex:500,lucky:1}),nw), neutralD=T.fighter(st({dex:500}),nw);
  var pLucky=T.hit(lucky,neutralD,RNG.make(1)).p, pNeut=T.hit(evenA,neutralD,RNG.make(1)).p, pUn=T.hit(unluck,neutralD,RNG.make(1)).p;
  ok('LUCKY moves the hit chance by no more than its +/-10% thumb', Math.abs(pLucky-pNeut)<=0.1001 && Math.abs(pNeut-pUn)<=0.1001 && pLucky>pNeut && pUn<pNeut, "p un/neut/lucky "+pUn.toFixed(2)+"/"+pNeut.toFixed(2)+"/"+pLucky.toFixed(2));

  // ---- DAMAGE: Might+weapon-armor, deterministic; armour reduces; de-minimis floor; rare crit ----
  var mighty=T.fighter(st({might:1000})), feeble=T.fighter(st({might:1}));
  var bare=T.fighter(st()), heavy=T.fighter(st(),null,T.GEAR.ARMOR.heavy);
  var dBare=T.damage(mighty,bare,null).damage, dHeavy=T.damage(mighty,heavy,null).damage;
  ok('DAMAGE: heavier armour robustness reduces the blow', dBare>dHeavy, "bare="+dBare+" heavy="+dHeavy);
  var weakHit=T.damage(feeble,heavy,null);
  ok('DAMAGE: a hit still lands for DE MINIMIS when armour eats it', weakHit.damage>=1 && weakHit.deMinimis===true, "dmg="+weakHit.damage);
  ok('DAMAGE base is deterministic (no rng -> same number every call)', T.damage(mighty,bare,null).damage===T.damage(mighty,bare,null).damage);
  var crits=0; for(var i=0;i<2000;i++) if(T.damage(mighty,bare,RNG.make(i)).crit) crits++;
  ok('DAMAGE: crit is a RARE spike (~a few %)', crits>0 && crits/2000<0.15, (100*crits/2000).toFixed(1)+"% crit");

  // ---- WEAPON TYPES (canon-reconcile): 3 gross types + verbs; Impact crushes armour robustness ----
  ok('three gross weapon TYPES with verbs (Blades/Impact/Polearms)', !!T.GEAR.WEAPON_TYPES.blade && !!T.GEAR.WEAPON_TYPES.impact && !!T.GEAR.WEAPON_TYPES.polearm && T.GEAR.WEAPON_TYPES.impact.verb==='crush', Object.keys(T.GEAR.WEAPON_TYPES).join(','));
  var blade=T.fighter(st({might:600}),{name:"b",base:14,type:"blade"}), impact=T.fighter(st({might:600}),{name:"m",base:14,type:"impact",crush:0.5});
  var dB=T.damage(blade,heavy,null).damage, dI=T.damage(impact,heavy,null).damage;
  ok('Impact CRUSHES armour robustness (more DAMAGE than an equal-base blade vs heavy armour)', dI>dB, "blade="+dB+" impact="+dI);
  var AR=T.GEAR.ARMOR;
  ok('ARMOR dial light<->bulky (3-4 named tiers): bulkier = more robustness + more encumbrance', AR.none.robustness<AR.light.robustness&&AR.light.robustness<AR.medium.robustness&&AR.medium.robustness<AR.heavy.robustness&&AR.none.encumbrance<AR.heavy.encumbrance, Object.keys(AR).join(','));

  // ---- THE READ: feel-words only, OBJ honest, SUBJ can mislead ----
  var obsHi=T.fighter(st({per:1000,intuition:1000})), obsLo=T.fighter(st({per:200,intuition:120}));
  var tgt=T.fighter(st({might:900,dex:900}));
  var rd=T.read(obsHi,tgt,RNG.make(3)), js=JSON.stringify(rd);
  ok('THE READ: surfaced as feel-WORDS (seen=OBJ, sense=SUBJ), no number leaks', typeof rd.seen.word==='string'&&typeof rd.sense.word==='string'&&!/[0-9]/.test(js), js.slice(0,90));
  ok('THE READ: high Per is HONEST + precise (OBJ matches the true threat, not vague)', rd.seen.obj==='OBJ' && rd.seen.vague===false);
  // low Per: still honest (vague-not-false) -> seen word equals the high-Per (true) word
  var rdLoPer=T.read(T.fighter(st({per:200,intuition:1000})),tgt,RNG.make(3));
  ok('THE READ: low Per is VAGUE but never FALSE (same true band, hedged)', rdLoPer.seen.word===rd.seen.word && rdLoPer.seen.vague===true);
  // low Intuition: SUBJ can MISLEAD -> over samples, sometimes unreliable (drifts off the true band)
  var mis=0; for(var s=0;s<200;s++){ var r=T.read(obsLo,tgt,RNG.make(s)); if(!r.sense.reliable) mis++; }
  ok('THE READ: low Intuition CAN MISLEAD (SUBJ drifts off-true sometimes)', mis>0, mis+"/200 misread");
  var sure=0; for(var s2=0;s2<200;s2++){ var r2=T.read(obsHi,tgt,RNG.make(s2)); if(r2.sense.reliable) sure++; }
  ok('THE READ: high Intuition is reliable (SUBJ matches truth)', sure===200, sure+"/200 reliable");

  // ---- determinism ----
  function seq(seed){var rng=RNG.make(seed),out=[];for(var i=0;i<8;i++){out.push(T.hit(A,D,rng).hit?1:0);out.push(T.damage(A,heavy,rng).damage);}return out.join(",");}
  ok('determinism: same seed -> identical hit+damage sequence', seq(42)===seq(42) && seq(42)!==seq(43));

  o.textContent=R.join('\n')+'\nSUMMARY '+(R.length-fails)+'/'+R.length; document.title="COMBAT fail="+fails;
}catch(e){o.textContent="HARNESS_ERROR "+(e&&e.stack?e.stack:e);document.title="COMBAT harness_error";}})();</script>
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
             "<script>\n" + open(os.path.join(ENGINE, "rng.js"), encoding="utf-8").read() + "\n</script>",
             "<script>\n" + open(os.path.join(ENGINE, "stats.js"), encoding="utf-8").read() + "\n</script>",
             "<script>\n" + open(os.path.join(ENGINE, "resolve.js"), encoding="utf-8").read() + "\n</script>", REP]
    runner = os.path.join(TMP, "combat_runner.html"); open(runner, "w", encoding="utf-8").write("\n".join(parts))
    ud = tempfile.mkdtemp(prefix="td_cbt_")
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
