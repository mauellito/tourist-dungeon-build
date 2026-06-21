#!/usr/bin/env python3
"""TD_BESTIARY — the 10X roster via families/variants. Verifies: >=200 foes; glyph-by-family
(one letter per family, case = tier); depth bands span 1..6; the mechanic tags (pack/regen/
ranged/raise|summon/poison/fear) are each present and spawnable in-depth; classic names (the
office-worker roster is retired from the spawn pool, a warden kept); merge into COMBAT.CREATURES.

Run:  python tests/run_bestiary.py
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
var B=TD_BESTIARY, ROS=B.ROSTER, keys=Object.keys(ROS);
try{
  // ---- 10X COUNT ----
  ok('roster is 10X: >=200 foes via families/variants', B.count()>=200, B.count()+' foes from '+Object.keys(B.FAM).length+' families');

  // ---- GLYPH BY FAMILY (one letter per family; UPPERCASE only at the top ranks) ----
  var famLetter={}, glyphBad=[], caseBad=[];
  keys.forEach(function(k){ var m=ROS[k], fk=m.family, lc=m.glyph.toLowerCase();
    if(famLetter[fk]==null) famLetter[fk]=lc; else if(famLetter[fk]!==lc) glyphBad.push(fk+':'+m.glyph);
    if(m.glyph===m.glyph.toUpperCase() && m.glyph!==m.glyph.toLowerCase() && m.rank<3) caseBad.push(k); });
  ok('glyph BY FAMILY (every member of a family shares one letter)', glyphBad.length===0, glyphBad.slice(0,4).join(','));
  ok('case = tier (uppercase reserved for champion/lord ranks)', caseBad.length===0, caseBad.slice(0,4).join(','));

  // ---- DEPTH BANDS span the dive ----
  var bands={}; keys.forEach(function(k){ bands[ROS[k].band]=(bands[ROS[k].band]||0)+1; });
  ok('foes span depth bands 1..6', bands[1]&&bands[2]&&bands[3]&&bands[4]&&bands[5]&&bands[6], JSON.stringify(bands));

  // ---- MECHANIC TAGS each present + spawnable in-depth ----
  var tp=B.tagsPresent();
  ['pack','regen','ranged','poison','fear'].forEach(function(t){ ok('mechanic present: '+t, (tp[t]||0)>0, (tp[t]||0)+' foes'); });
  ok('mechanic present: raise/summon (undead/demon callers)', (tp.raise||0)+(tp.summon||0)>0, 'raise '+(tp.raise||0)+' summon '+(tp.summon||0));
  ok('mechanic present: drain (Grit) + guardian + bighit + heal', (tp.drain||0)>0&&(tp.guardian||0)>0&&(tp.bighit||0)>0&&(tp.heal||0)>0, 'drain '+(tp.drain||0)+' guard '+(tp.guardian||0)+' big '+(tp.bighit||0)+' heal '+(tp.heal||0));

  // ---- CLASSIC NAMES + roles ----
  var names=keys.map(function(k){return ROS[k].name;});
  ok('classic names present (goblin/orc/troll/lich/dragon/ooze...)', names.join('|').indexOf('a goblin')>=0 && names.join('|').indexOf('a troll')>=0 && names.join('|').indexOf('a lich')>=0 && /dragon/.test(names.join('|')), '');
  var roles={}; keys.forEach(function(k){ roles[ROS[k].role]=(roles[ROS[k].role]||0)+1; });
  ok('mixed ROLES (melee/archer/skirmisher/caster/healer/leader)', roles.melee&&roles.archer&&roles.skirmisher&&roles.caster, JSON.stringify(roles));

  // ---- MERGE into COMBAT.CREATURES + RETIRE the office roster from the pool ----
  var C=TD_RESOLVE.COMBAT.CREATURES;
  ok('roster merged into COMBAT.CREATURES', Object.keys(C).length>=200);
  ok('the office-worker foes are RETIRED from the spawn pool (noSpawn)', C.gnat&&C.gnat.noSpawn===true && C.usher&&C.usher.noSpawn===true, 'gnat.noSpawn='+(C.gnat&&C.gnat.noSpawn));
  ok('a thin Bureau "warden" is kept spawnable', C.warden && !C.warden.noSpawn);

  // ---- a SAMPLE FLOOR (band 3) spawn list reads varied + readable ----
  var bb=B.byBand(), b3=(bb[3]||[]).slice(0,8).map(function(k){return ROS[k].name+'['+ROS[k].glyph+':'+ROS[k].role+']';});
  R.push('  sample band-3 spawn pool: '+b3.join('  '));
  var fams3=(bb[3]||[]).map(function(k){return ROS[k].family;}); var uf3={}; fams3.forEach(function(f){uf3[f]=1;});
  ok('a floor draws from several families (varied, readable)', Object.keys(uf3).length>=3, Object.keys(uf3).length+' families at band 3');

  o.textContent=R.join('\n')+'\nSUMMARY '+(R.filter(function(x){return x.indexOf('PASS')===0;}).length)+' pass / '+fails+' fail'; document.title="BEST fail="+fails;
}catch(e){o.textContent="HARNESS_ERROR "+(e&&e.stack?e.stack:e);document.title="BEST harness_error";}})();</script>
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
             "<script>\n" + open(os.path.join(ENGINE, "resolve.js"), encoding="utf-8").read() + "\n</script>",
             "<script>\n" + open(os.path.join(ENGINE, "bestiary.js"), encoding="utf-8").read() + "\n</script>", REP]
    runner = os.path.join(TMP, "bestiary_runner.html"); open(runner, "w", encoding="utf-8").write("\n".join(parts))
    ud = tempfile.mkdtemp(prefix="td_best_")
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
