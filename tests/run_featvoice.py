#!/usr/bin/env python3
"""ARCHITECTURAL FEATURES R3 — feature examine lines + the hazard pre-commit senses telegraph (honest seen/OBJ). Drives TD_MAP controllers at depth 6, finds each feature type, and checks the verbatim Bureau voice fires."""
import html, os, re, shutil, subprocess, sys, tempfile
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, "engine"); TMP = os.path.join(ROOT, "tests", ".tmp")
CH = [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
      r"C:\Program Files\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"]
FILES = ["rng.js","resolve.js","stats.js","burden.js","interpreter.js","vaults.js","gen2.js","mapmode.js","generator.js","ui.js"]
REP = r"""
<script>(function(){var o=document.getElementById('out');var R=[],fails=0;
function ok(n,c,d){R.push((c?'PASS ':'FAIL ')+n+(d?('  ::  '+d):''));if(!c)fails++;}
function world(seed){return {start:"a",year_length:365,arrival_day:1,meta:{seed:seed},nodes:{a:{level:6,title:"Deep"}},edges:[],signals:{}};}
function msgs(sim){return (sim.view().messages||[]).map(function(m){return m.text;});}
try{
  // find seeds whose level-6 start floor carries each feature type, then drive the voice
  var want={reward:0,hazard:0,bureau:0,arena:0}, got={};
  for(var s=1;s<=120 && (!got.reward||!got.hazard||!got.bureau||!got.arena);s++){
    var sim=TD_MAP.create(world(s),{creatures:false}); var fr=sim._featureRooms();
    if(!fr.length) continue;
    var f=fr[0]; if(got[f.type]) continue; got[f.type]=true;
    // EXAMINE: drop the player inside the feature rect, emit, expect the examine line
    sim._setPlayer(f.x, f.y); sim._emitFeatureTells();
    var EX={reward:"the Office sealed and forgot",hazard:"Condemned. Bureau-permitted to no one",bureau:"Lost Property",arena:"assembly hall"};
    var m=msgs(sim);
    ok('EXAMINE fires for '+f.type, m.some(function(t){return t.indexOf(EX[f.type])>=0;}), m[m.length-1]||'(none)');
    if(f.type==='hazard'){
      // a FRESH hazard controller: stand ADJACENT (before commit), emit -> senses tell BEFORE entering
      var sim2=TD_MAP.create(world(s),{creatures:false}); var h=sim2._featureRooms()[0];
      sim2._setPlayer(h.x-1, h.y); sim2._emitFeatureTells();
      var sm=msgs(sim2);
      ok('HAZARD senses TELEGRAPH fires BEFORE commit (adjacent)', sm.some(function(t){return t.indexOf("reads wrong underfoot")>=0;}), sm[sm.length-1]||'(none)');
      // and it is on the SENSES channel, seen/OBJ (honest)
      var rec=(sim2.view().messages||[]).filter(function(m){return m.text.indexOf("reads wrong")>=0;})[0];
      ok('HAZARD tell is SENSES/seen/OBJ (honest)', rec&&rec.ch==='senses'&&rec.obj==='OBJ', rec?JSON.stringify({ch:rec.ch,obj:rec.obj}):'(none)');
    }
  }
  ok('all four feature types found + examined across the seed sweep', got.reward&&got.hazard&&got.bureau&&got.arena, JSON.stringify(got));
  o.textContent=R.join('\n')+'\nSUMMARY '+(R.length-fails)+'/'+R.length; document.title='fv fail='+fails;
}catch(e){o.textContent='ERR '+(e&&e.stack?e.stack:e); document.title='fv harness_error';}
})();</script>
"""
def chrome():
    for p in CH:
        if os.path.exists(p): return p
    for n in ("chrome","chrome.exe","msedge","msedge.exe"):
        f=shutil.which(n)
        if f: return f
    sys.exit("no chrome")
parts=['<!doctype html><meta charset="utf-8"><title>pending</title><pre id="out">pending</pre>']
for fn in FILES: parts.append("<script>\n"+open(os.path.join(ENGINE,fn),encoding="utf-8").read()+"\n</script>")
parts.append(REP)
os.makedirs(TMP,exist_ok=True)
runner=os.path.join(TMP,"featvoice_runner.html"); open(runner,"w",encoding="utf-8").write("\n".join(parts))
ud=tempfile.mkdtemp(prefix="td_fv_")
try:
    p=subprocess.run([chrome(),"--headless","--disable-gpu","--no-sandbox","--user-data-dir="+ud,"--virtual-time-budget=60000","--dump-dom","file:///"+runner.replace("\\","/")],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=180)
finally:
    shutil.rmtree(ud,ignore_errors=True)
dom=p.stdout.decode("utf-8","replace")
m=re.search(r'<pre id="out">(.*?)</pre>',dom,re.DOTALL)
print(html.unescape(m.group(1)) if m else "(no output)\n"+dom[:1000])
print("-"*60)
title=(re.search(r"<title>(.*?)</title>", dom, re.DOTALL) or [None,""])[1]
fm=re.search(r"fail=(\d+)", title)
if "harness_error" in title or not fm:
    print("RESULT: HARNESS ERROR"); sys.exit(2)
fails=int(fm.group(1)); print("RESULT: %d failed (feature voice + telegraph)" % fails); sys.exit(0 if fails==0 else 1)
