#!/usr/bin/env python3
"""TD_STATS — the ten-stat spine (combat track R2). Verifies: stat creation (10 stats, 1..1000,
bell-curved, deterministic by seed); the FEEL-WORDS-ONLY law (the player surface never leaks a
number); Lucky's +/-10% human-bounded thumb (supernatural overflow rides on top); the derived-effect
registry; and the growth-by-deeds scaffold (realized on rest, emits words not numbers). Pure, no DOM.

Run:  python tests/run_stats.py
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
var S=TD_STATS, RNG=TD_RNG;
try{
  // ---- creation: 10 stats, 1..1000 ----
  var st=S.create(RNG.make(12345));
  ok('exactly TEN stats, Str renamed to MIGHT, GRIT present', S.STATS.length===10 && S.STATS.indexOf('might')>=0 && S.STATS.indexOf('grit')>=0 && S.STATS.indexOf('str')<0, S.STATS.join(','));
  ok('every stat created in the internal 1..1000 range', S.STATS.every(function(k){return st[k]>=1&&st[k]<=1000;}), JSON.stringify(st));
  // bell-curve sanity: mean near 500 over many rolls
  var sum=0,nn=0,lo=1000,hi=0,r2=RNG.make(7);
  for(var i=0;i<400;i++){var b=S.create(r2);S.STATS.forEach(function(k){sum+=b[k];nn++;if(b[k]<lo)lo=b[k];if(b[k]>hi)hi=b[k];});}
  var mean=sum/nn; ok('bell-curved around ~500 (Richter human range)', mean>430&&mean<570&&lo<200&&hi>800, "mean="+Math.round(mean)+" span "+lo+".."+hi);

  // ---- FEEL-WORDS ONLY: the player surface NEVER leaks a number ----
  var surf=S.surface(st), js=JSON.stringify(surf);
  ok('surface() returns a feel-WORD per stat', surf.length===10 && surf.every(function(e){return typeof e.word==='string'&&e.word.length>0;}), surf.map(function(e){return e.word;}).join(','));
  ok('NO NUMBER LEAKS: the player surface contains no digit (Disco Elysium law)', !/[0-9]/.test(js), js.slice(0,80));
  // feel-word monotonic across tiers (low value -> first band, high -> last)
  ok('feel-word tracks the value (feeble at floor, titanic at ceiling)', S.feel('might',1)==='feeble' && S.feel('might',1000)==='titanic' && S.feel('might',1)!==S.feel('might',1000));
  ok('crossed() emits a WORD on a tier crossing, null within a tier', typeof S.crossed('might',100,900)==='string' && S.crossed('might',100,120)===null);

  // ---- LUCKY: +/-10% human bound; overflow rides on top ----
  var okBound=true,extremes=[];
  for(var l=1;l<=1000;l+=1){ var t=S.luckyThumb({lucky:l}); if(t<-0.1000001||t>0.1000001)okBound=false; }
  ok('LUCKY thumb stays within +/-10% across the whole human range', okBound, "lucky1="+S.luckyThumb({lucky:1}).toFixed(3)+" lucky1000="+S.luckyThumb({lucky:1000}).toFixed(3));
  ok('LUCKY ~0 at the human midpoint, signed at the tails', Math.abs(S.luckyThumb({lucky:500}))<0.001 && S.luckyThumb({lucky:1000})>0.09 && S.luckyThumb({lucky:1})<-0.09);
  ok('supernatural OVERFLOW can exceed the human +/-10% (rides on top)', S.luckyThumb({lucky:1000},0.15)>0.10);

  // ---- FIX: feel-words RE-CENTERED — an AVERAGE character reads AVERAGE, not a compliment deck ----
  var FLATTER={}, NEUTRAL={};
  S.STATS.forEach(function(k){ var f=S.FEEL[k]; FLATTER[f[4]]=1; FLATTER[f[5]]=1; NEUTRAL[f[2]]=1; NEUTRAL[f[3]]=1; });
  var rB=RNG.make(4242), bsum=0, bn=0, flatHits=0, midHits=0, total=0, sampleWords=null;
  for(var i=0;i<300;i++){ var bc=S.createBase(rB), sw=S.surface(bc);
    if(!sampleWords) sampleWords=sw.map(function(e){return e.stat+':'+e.word;}).join(' ');
    sw.forEach(function(e,j){ var k=S.STATS[j]; bsum+=bc[k]; bn++; total++; if(FLATTER[e.word])flatHits++; if(NEUTRAL[e.word])midHits++; }); }
  var bmean=bsum/bn;
  ok('base VALUES unchanged: roll still centered (mean ~501)', bmean>480&&bmean<520, 'mean='+Math.round(bmean));
  // the canonical AVERAGE character: every stat exactly at the mean -> every word must be NEUTRAL (no compliment)
  var meanCh={}; S.STATS.forEach(function(k){ meanCh[k]=500; }); var meanSurf=S.surface(meanCh);
  var meanFlat=meanSurf.filter(function(e){return FLATTER[e.word];});
  ok('a mean (~500) character reads ALL-neutral — no flattering word anywhere', meanFlat.length===0, meanSurf.map(function(e){return e.word;}).join(','));
  ok('the middle bands dominate the average read (>=99% neutral; only rare tail rolls flatter)', midHits/total>0.99 && flatHits/total<0.01, Math.round(100*midHits/total)+'% neutral, '+flatHits+'/'+total+' tail-flatter');
  ok('a base surface reads middling, not a deck of compliments', /middling|even/.test(sampleWords), sampleWords);

  // ---- DERIVED registry (internal numbers; never shown) ----
  var d=S.derive(st);
  ok('derived registry yields the combat inputs (might/dex/con/grit/per/intuition...)', typeof d.damageBonus==='number'&&typeof d.accuracy==='number'&&typeof d.evasion==='number'&&typeof d.hpMax==='number'&&typeof d.mindResist==='number'&&typeof d.perceive==='number'&&typeof d.interpret==='number');
  ok('derived: higher Might -> more damage bonus (monotone, stub)', S.DERIVED.damageBonus({might:900})>S.DERIVED.damageBonus({might:300}));

  // ---- GROWTH-BY-DEEDS (scaffold; realized on rest; words not numbers) ----
  var g={might:300}, prog=S.newProgress(); S.recordDeed(prog,'might',5); S.recordDeed(prog,'might',5);
  var before=g.might, words=S.realizeOnRest(g,prog);
  ok('deeds realize on REST: the stat grows (capped), no XP bar', g.might>before, before+"->"+g.might);
  ok('growth emits feel-WORDS, never numbers', Array.isArray(words) && words.every(function(w){return typeof w.word==='string';}));

  // ---- determinism ----
  ok('determinism: same seed -> identical stat block', JSON.stringify(S.create(RNG.make(99)))===JSON.stringify(S.create(RNG.make(99))) && JSON.stringify(S.create(RNG.make(99)))!==JSON.stringify(S.create(RNG.make(100))));

  o.textContent=R.join('\n')+'\nSUMMARY '+(R.length-fails)+'/'+R.length; document.title="STATS fail="+fails;
}catch(e){o.textContent="HARNESS_ERROR "+(e&&e.stack?e.stack:e);document.title="STATS harness_error";}})();</script>
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
             "<script>\n" + open(os.path.join(ENGINE, "stats.js"), encoding="utf-8").read() + "\n</script>", REP]
    runner = os.path.join(TMP, "stats_runner.html"); open(runner, "w", encoding="utf-8").write("\n".join(parts))
    ud = tempfile.mkdtemp(prefix="td_stats_")
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
