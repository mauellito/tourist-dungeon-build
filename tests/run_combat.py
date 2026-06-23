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

  // ---- R1 WEAPON ROSTER: ~a dozen under 3 types; each verb measurably changes resolution ----
  var W=T.GEAR.WEAPONS, types={blade:0,impact:0,polearm:0};
  Object.keys(W).forEach(function(k){types[W[k].type]=(types[W[k].type]||0)+1;});
  ok('roster loads ~a dozen weapons across the 3 types', Object.keys(W).length>=10 && types.blade>=3 && types.impact>=3 && types.polearm>=3, Object.keys(W).length+" weapons "+JSON.stringify(types));
  ok('every weapon has name+type+base+acc+weight+bulk (name showable; numbers internal)', Object.keys(W).every(function(k){var w=W[k];return typeof w.name==='string'&&!!w.type&&typeof w.base==='number'&&typeof w.acc==='number'&&typeof w.weight==='number'&&typeof w.bulk==='number';}));
  ok('dagger: highest accuracy + lowest base + lightest + first-strike flag (initiative HOOK)', W.dagger.firstStrike===true && W.dagger.acc>=W.sabre.acc && W.dagger.base<=W.shortsword.base && W.dagger.weight<=W.mace.weight, "dagger acc="+W.dagger.acc+" base="+W.dagger.base);
  var df=T.fighter(st({dex:500}));
  ok('BLADE verb: weapon accuracy widens the gap (dagger out-hits a no-acc weapon, same Dex)', rate(T.fighter(st({dex:500}),W.dagger),df,600,5) > rate(T.fighter(st({dex:500}),nw),df,600,5), rate(T.fighter(st({dex:500}),W.dagger),df,600,5).toFixed(2)+" vs "+rate(T.fighter(st({dex:500}),nw),df,600,5).toFixed(2));
  var b16={name:"b16",type:"blade",base:W.warhammer.base,acc:0}, wh=T.fighter(st({might:600}),W.warhammer), eqBlade=T.fighter(st({might:600}),b16);   // equal-base blade tracks the warhammer base (Gate 2 R3 calibrated) so this isolates CRUSH
  ok('IMPACT verb: warhammer crushes robustness (more DAMAGE vs heavy armour than an EQUAL-base blade)', T.damage(wh,heavy,null).damage > T.damage(eqBlade,heavy,null).damage, "warhammer="+T.damage(wh,heavy,null).damage+" blade16="+T.damage(eqBlade,heavy,null).damage);
  var pf=T.fighter(st({dex:500}),W.pike);
  var pOpen=T.hit(pf,df,RNG.make(1),{opening:true}).p, pSteady=T.hit(pf,df,RNG.make(1)).p;
  ok('POLEARM verb: reach flag + opening strike raises the opening hit (full positioning a HOOK)', W.spear.reach===true && W.pike.reach===true && pOpen>pSteady, "open="+pOpen.toFixed(2)+" steady="+pSteady.toFixed(2));

  // ---- R2 ARMOR TIERS: one dial, 4 named tiers; the coupling IS the tradeoff ----
  ok('ARMOR: 4 named tiers off the dial (unarmoured / padded leather / mail / plate)', !!AR.unarmored && /leather/.test(AR.light.name) && /mail/.test(AR.medium.name) && /plate/.test(AR.heavy.name), [AR.unarmored.name,AR.light.name,AR.medium.name,AR.heavy.name].join(' / '));
  var atk=T.fighter(st({might:600,dex:600}),nw);
  var defLight=T.fighter(st({dex:500}),null,AR.light), defHeavy=T.fighter(st({dex:500}),null,AR.heavy);
  ok('ARMOR tradeoff: bulkier REDUCES damage more (plate < padded)', T.damage(atk,defHeavy,null).damage < T.damage(atk,defLight,null).damage, "plate="+T.damage(atk,defHeavy,null).damage+" padded="+T.damage(atk,defLight,null).damage);
  ok('ARMOR tradeoff: bulkier WORSENS evasion (plate easier to hit than padded)', rate(atk,defHeavy,600,7) > rate(atk,defLight,600,7), rate(atk,defHeavy,600,7).toFixed(2)+" vs "+rate(atk,defLight,600,7).toFixed(2));

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

  // ---- TACTICS STANCE: biases HIT ONLY (acc as attacker, eva as defender); NEVER damage ----
  ok('STANCE: five ordered stances Coward..Berserk, default Measured', T.STANCES.length===5 && T.STANCES.map(function(s){return s.key;}).join(',')==='coward,guarded,measured,pressing,berserk' && T.STANCE_DEFAULT==='measured');
  ok('STANCE: Measured is the neutral middle (no acc/eva bias)', T.stanceByKey('measured').acc===0 && T.stanceByKey('measured').eva===0);
  ok('STANCE: accuracy/evasion trade in OPPOSITE directions (honest trade)', T.stanceByKey('berserk').acc>0 && T.stanceByKey('berserk').eva<0 && T.stanceByKey('coward').acc<0 && T.stanceByKey('coward').eva>0);
  // attacker: Berserk lands MORE than Coward against the same defender (acc up toward Berserk)
  var swA={name:"s",base:10,type:"blade",acc:0};
  function aSt(key){var f=T.fighter(st({dex:500}),swA); f.stance=T.stanceByKey(key); return f;}
  var Dn=T.fighter(st({dex:500}),swA);
  var pBerA=T.hit(aSt('berserk'),Dn,RNG.make(1)).p, pMeasA=T.hit(aSt('measured'),Dn,RNG.make(1)).p, pCowA=T.hit(aSt('coward'),Dn,RNG.make(1)).p;
  ok('STANCE (attacker): Berserk lands more than Measured more than Coward', pBerA>pMeasA && pMeasA>pCowA, "coward/meas/berserk p "+pCowA.toFixed(2)+"/"+pMeasA.toFixed(2)+"/"+pBerA.toFixed(2));
  // defender: a Coward is HARDER to hit than a Berserk (own evasion up toward Coward)
  function dSt(key){var f=T.fighter(st({dex:500}),swA); f.stance=T.stanceByKey(key); return f;}
  var pVsCow=T.hit(Dn,dSt('coward'),RNG.make(1)).p, pVsBer=T.hit(Dn,dSt('berserk'),RNG.make(1)).p;
  ok('STANCE (defender): a Coward is harder to hit than a Berserk', pVsCow<pVsBer, "p vs coward/berserk "+pVsCow.toFixed(2)+"/"+pVsBer.toFixed(2));
  // DAMAGE is untouched by stance (the firewall)
  var dgA=T.fighter(st({might:600})); var dgD=T.fighter(st());
  var dmgMeas=T.damage(dgA,dgD,null).damage; dgA.stance=T.stanceByKey('berserk'); var dmgBer=T.damage(dgA,dgD,null).damage;
  ok('STANCE never touches DAMAGE (firewall)', dmgMeas===dmgBer, "meas="+dmgMeas+" berserk="+dmgBer);

  // ---- FOOTING (HUD): NET evasion feel-word folding Dex + burden + stance ONCE (no parallel maths) ----
  ok('FOOTING: five words Rooted..Slippery, returns a WORD with no digit', typeof T.footingReadout(T.fighter(st()))==='string' && !/[0-9]/.test(T.footingReadout(T.fighter(st()))));
  var nimbleF=T.fighter(st({dex:900})), heavyF=T.fighter(st({dex:900}),null,T.GEAR.ARMOR.heavy);
  var ix=function(w){return ["Rooted","Lumbering","Even","Nimble","Slippery"].indexOf(w);};
  ok('FOOTING: heavy armour encumbrance worsens footing (folds the EXISTING evasion effect, not a parallel one)', ix(T.footingReadout(heavyF))<ix(T.footingReadout(nimbleF)), T.footingReadout(heavyF)+" < "+T.footingReadout(nimbleF));
  var baseFt=T.fighter(st({dex:600})), cowFt=T.fighter(st({dex:600})); cowFt.stance=T.stanceByKey('coward');
  var berFt=T.fighter(st({dex:600})); berFt.stance=T.stanceByKey('berserk');
  ok('FOOTING: Coward stance shifts footing more evasive, Berserk less', ix(T.footingReadout(cowFt))>=ix(T.footingReadout(baseFt)) && ix(T.footingReadout(berFt))<=ix(T.footingReadout(baseFt)), T.footingReadout(cowFt)+" >= "+T.footingReadout(baseFt)+" >= "+T.footingReadout(berFt));
  ok('FOOTING folds burden via the SINGLE-SOURCE applyBurdenEvasion (same as the dungeon path)', typeof T.applyBurdenEvasion==='function' && T.applyBurdenEvasion(T.GEAR.ARMOR.light,'strained').encumbrance>T.GEAR.ARMOR.light.encumbrance);
  // PROTECTION reads the existing bulkReadout; HARD CHECK: tactics words carry NO digit/sign
  ok('PROTECTION: armour bulk readout word (Unhindered..Encased), no digit', /^(Unhindered|Cushioned|Shelled|Encased)$/.test(T.protectionReadout(T.fighter(st(),null,T.GEAR.ARMOR.heavy))));
  function clean(s){return !/[0-9]/.test(s) && !/[+\-]\d/.test(s);}   // no digit, no +N/-N modifier (a word hyphen like 'Self-Preserving' is fine)
  ok('HARD CHECK: no number or +/-N modifier in any displayed tactics text (stance name+readout, footing, protection)', T.STANCES.every(function(s){return clean(s.name)&&clean(s.readout);}) && clean(T.footingReadout(heavyF)) && clean(T.protectionReadout(heavyF)));

  // ---- determinism ----
  function seq(seed){var rng=RNG.make(seed),out=[];for(var i=0;i<8;i++){out.push(T.hit(A,D,rng).hit?1:0);out.push(T.damage(A,heavy,rng).damage);}return out.join(",");}
  ok('determinism: same seed -> identical hit+damage sequence', seq(42)===seq(42) && seq(42)!==seq(43));

  // ====== SECTION G — Bureau-voice armour tiers (verbatim) + the effective-robustness accessor ======
  var AR=T.GEAR.ARMOR;
  ok('G: four tiers carry the Bureau tier NAME', AR.unarmored.bureauTier==='Attire As Presented' && AR.light.bureauTier==="Visitor's Padding (Issued)" && AR.medium.bureauTier==='Protective Equipment, Sanctioned' && AR.heavy.bureauTier==='Regulation Plate (Ceremonial)');
  ok('G: verbatim WEAR lines', AR.unarmored.wear.indexOf('declines to endorse it')>=0 && AR.light.wear.indexOf('visitor specification')>=0 && AR.medium.wear.indexOf('discouraged from injury')>=0 && AR.heavy.wear.indexOf('furniture that walks')>=0);
  ok('G: verbatim EXAMINE lines', AR.unarmored.examine.indexOf('strongly-worded letter')>=0 && AR.heavy.examine.indexOf('fears nothing but the hammer')>=0);
  ok('G: verbatim STRUCK lines', AR.unarmored.struckFeel.indexOf('nothing between it and you')>=0 && AR.light.struckFeel.indexOf('eats the edge')>=0 && AR.medium.struckFeel.indexOf('skids off the shell')>=0 && AR.heavy.struckFeel.indexOf('rings the plate')>=0);
  ok('G: armourVoice(robustness) maps the effective dial to the right tier', T.GEAR.armourVoice(0)===AR.unarmored && T.GEAR.armourVoice(3)===AR.light && T.GEAR.armourVoice(6)===AR.medium && T.GEAR.armourVoice(10)===AR.heavy);

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
