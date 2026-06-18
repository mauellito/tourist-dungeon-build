#!/usr/bin/env python3
"""TD_SMASHGRAB [v5] — the DRAMA pass: a collapse that CHASES from behind + loot that SCORES.
On the grab the floor starts dropping from the grab point and a death-edge creeps up behind you
(caught = SWALLOWED), while the slab still seals the corridor ahead (sealed = SUMMARILY VOIDED) —
a true squeeze. Each $ has a value and a running score; weight still gates the sprint, so greed
gets you caught. Drives the module: collapse-edge advance, the two distinct deaths, score+weight
math, and the SFX cue hints the host plays.

Run:  python tests/run_smashgrab.py
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
var SG=TD_SMASHGRAB;
// BFS over the live map; noSlab treats the slab as a wall (funnel proof); noRubble avoids collapsed floor
function bfs(sx,sy,tx,ty,noSlab,noRubble){ var v=SG.view(),D={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]},sl=v.slab;
  var q=[[sx,sy]],seen={},prev={}; seen[sx+','+sy]=1;
  while(q.length){var c=q.shift(); if(c[0]===tx&&c[1]===ty){var p=[],k=tx+','+ty; while(k!==sx+','+sy){var pp=prev[k];p.unshift(pp.d);k=pp.f;} return p;}
    for(var dd in D){var nx=c[0]+D[dd][0],ny=c[1]+D[dd][1],kk=nx+','+ny,ch=v.base(nx,ny);
      if(seen[kk]||ch==='#'||ch==='~')continue; if(noSlab&&sl&&nx===sl.x&&ny===sl.y)continue; if(noRubble&&v.rubble(nx,ny))continue;
      seen[kk]=1;prev[kk]={f:c[0]+','+c[1],d:dd};q.push([nx,ny]);}}
  return null; }
function goTo(tx,ty){ var p=SG.view().player,path=bfs(p.x,p.y,tx,ty)||[]; for(var i=0;i<path.length&&!SG.over();i++)SG.move(path[i]); return SG.view().player.x===tx&&SG.view().player.y===ty; }
function flee(){ var v=SG.view(),path=bfs(v.player.x,v.player.y,v.exit.x,v.exit.y,false,true)||[],last=null; for(var i=0;i<path.length&&!SG.over();i++)last=SG.move(path[i]); return last; }
function man(ax,ay,bx,by){return Math.abs(ax-bx)+Math.abs(ay-by);}
function withTune(k,val,fn){ var old=SG.TUNE[k]; SG.TUNE[k]=val; try{ return fn(); } finally{ SG.TUNE[k]=old; } }
try{
  // ===== R1 layout: approach -> chamber(chasm) -> escape, the slab a true funnel =====
  var e=SG.enter(0), v=SG.view();
  ok('R1 enter telegraphs a rigged TELL', !!(e&&e.tell)&&/draft|rhyme|slab/i.test(e.tell));
  ok('R1 chamber: 2 artifacts, 4 valued treasure, an impassable chasm', v.arts.length===2 && v.treas.length>=3 && v.crevasse.length>=8, v.arts.length+'/'+v.treas.length+'/'+v.crevasse.length);
  ok('R1 approach + escape are genuine 1-wide corridors', v.base(v.entry.x,v.entry.y-1)==='#'&&v.base(v.entry.x,v.entry.y+1)==='#'&&v.base(v.exit.x-1,v.exit.y-1)==='#'&&v.base(v.exit.x-1,v.exit.y+1)==='#');
  var A=v.arts[0];
  ok('R1 chasm forces a DETOUR to the far-side artifact', bfs(v.entry.x,v.entry.y,A.x,A.y).length > man(v.entry.x,v.entry.y,A.x,A.y)+3);
  ok('R1 the slab is a TRUE FUNNEL (no route avoids it)', !!bfs(A.x,A.y,v.exit.x,v.exit.y) && bfs(A.x,A.y,v.exit.x,v.exit.y,true)===null);

  // ===== R1 COLLAPSE-CHASE: grab starts a death-edge advancing from behind =====
  SG.enter(1); v=SG.view();
  goTo(v.arts[0].x, v.arts[0].y); var ga=SG.get();
  ok('R1 grab trips the collapse (origin = grab point) + a grab sting', ga.ev && ga.ev.sfx==='grab' && SG.view().collapse.active && !!SG.view().collapse.origin, JSON.stringify(SG.view().collapse.origin));
  var f0=SG.view().collapse.frontier, vv1=SG.view(), step=bfs(vv1.player.x,vv1.player.y,vv1.exit.x,vv1.exit.y,false,true)||[], mv=null;
  for(var si=0; si<7 && si<step.length && !SG.over(); si++){ mv=SG.move(step[si]); }   // run a few steps toward the exit (clear floor)
  var f1=SG.view().collapse.frontier;
  ok('R1 the death-edge ADVANCES on a tick (after a head-start)', f1>f0, "frontier "+f0+" -> "+f1);
  ok('R1 floor behind the origin becomes impassable RUBBLE', SG.view().rubble(SG.view().collapse.origin.x, SG.view().collapse.origin.y)===true);
  ok('R1 moves emit step + grind + a proximity scale for juice', mv && mv.sfx==='step' && mv.grind===true && typeof mv.proximity==='number', mv?("prox="+mv.proximity):"no move");

  // ===== R1 SWALLOWED: the collapse catches a run that LOST TIME (post-calibration it does NOT chase a
  // clean sprinter — that is the demotion). Simulate a fight's time-cost (bump the tick clock, exactly
  // as the sim does) then flee: the death-edge overtakes -> SWALLOWED (crash), distinct from the slab. =====
  SG.enter(2); v=SG.view();
  goTo(SG.view().arts[0].x, SG.view().arts[0].y); SG.get();                 // grab -> trip the collapse
  SG._state().doorClosed += 7;                                            // a fight ate your head-start (the edge is now at your heels)
  var caught=null; for(var z=0;z<60 && !SG.over();z++){ var r=flee(); if(r&&r.dead)caught=r; if(SG.over())break; }
  var vs=SG.view();
  ok('R1 SWALLOWED: a time-lost run is caught from behind by the collapse (crash cue)', vs.dead===true && vs.swallowed===true && !vs.escaped && caught && caught.sfx==='crash', "dead="+vs.dead+" swallowed="+vs.swallowed);

  // ===== R2 LOOT THAT BITES: each $ scores; calibrated to FLAT values (greed-by-QUANTITY) =====
  SG.enter(3); v=SG.view();
  var vals=v.treas.map(function(t){return t.value;});
  ok('R2 every $ carries a positive VALUE (loot scores)', vals.every(function(x){return x>0;}), vals.join(','));
  ok('R2 values are FLAT (greed pays by carrying MORE, not better — calibration)', Math.max.apply(null,vals)===Math.min.apply(null,vals), vals.join(','));
  goTo(v.treas[0].x,v.treas[0].y); var gl=SG.get();
  ok('R2 grabbing $ adds its value to a running SCORE', gl.treasure && gl.value===v.treas[0].value && SG.view().score===gl.value, "score="+SG.view().score);

  // ===== R2 weight threshold: ONE treasure stays sprintable; the SECOND tips you over =====
  SG.enter(4); v=SG.view();
  goTo(v.treas[0].x,v.treas[0].y); SG.get();
  ok('R2 one treasure kept: scoring but still SPRINTABLE', SG.view().sprintable===true && SG.view().score>0, "load="+SG.view().load+" score="+SG.view().score);
  goTo(v.treas[1].x,v.treas[1].y); SG.get();
  ok('R2 a SECOND treasure tips you over the weight threshold (sprint lost)', SG.view().sprintable===false, "load="+SG.view().load);

  // ===== R2 WIN: a clean light run (one treasure) can ESCAPE with a score (chime) =====
  var won=false, wonScore=0, wonChime=false;
  for(var ws=0; ws<20 && !won; ws++){
    SG.enter(ws+30); var vw=SG.view();
    goTo(vw.treas[0].x,vw.treas[0].y); SG.get();                            // one treasure -> stays light
    goTo(SG.view().arts[0].x, SG.view().arts[0].y); SG.get();
    var esc=null; for(var w=0;w<60 && !SG.over();w++){ var r2=flee(); if(r2&&r2.escaped)esc=r2; if(SG.over())break; }
    if(SG.view().escaped){ won=true; wonScore=SG.view().score; wonChime=!!(esc&&esc.sfx==='chime'); }
  }
  ok('R2 WIN: a light (one-treasure) run can ESCAPE carrying a score (chime)', won && wonScore>0 && wonChime, "score="+wonScore);

  // ===== slab still kills independently: with the collapse held off, too-slow -> VOIDED (not swallowed) =====
  withTune('COLLAPSE_DELAY', 9999, function(){
    SG.enter(6); var vv=SG.view();
    goTo(vv.arts[0].x, vv.arts[0].y); SG.get();
    for(var s=0;s<40 && !SG.over();s++){ SG.move(s%2?'left':'right'); }   // dawdle near the chamber; never pass the slab
    var vd=SG.view();
    ok('SQUEEZE: outrun the collapse but dawdle -> the SLAB seals you in, VOIDED (not swallowed)', vd.dead===true && vd.swallowed===false && vd.sealed===true && !vd.passedSlab, "dead="+vd.dead+" swallowed="+vd.swallowed+" sealed="+vd.sealed);
  });

  // ===== R3 tunables surfaced =====
  ok('R3 tunables surfaced: collapse speed, slab speed, loot value, weight threshold, corridor length',
     typeof SG.TUNE.COLLAPSE_RATE==='number' && typeof SG.TUNE.COLLAPSE_DELAY==='number' && typeof SG.TUNE.ESCAPE_TURNS==='number'
       && typeof SG.TUNE.SPRINT_THRESHOLD==='number' && typeof SG.TUNE.WEIGHT_PER_TREASURE==='number' && SG.view().escapeLen>0,
     "rate="+SG.TUNE.COLLAPSE_RATE+" delay="+SG.TUNE.COLLAPSE_DELAY+" slab="+SG.TUNE.ESCAPE_TURNS+" thr="+SG.TUNE.SPRINT_THRESHOLD+" len="+SG.view().escapeLen);

  o.textContent=R.join('\n')+'\nSUMMARY '+(R.length-fails)+'/'+R.length; document.title="SG fail="+fails;
}catch(e){o.textContent="HARNESS_ERROR "+(e&&e.stack?e.stack:e);document.title="SG harness_error";}})();</script>
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
             "<script>\n" + open(os.path.join(ENGINE, "smashgrab.js"), encoding="utf-8").read() + "\n</script>", REP]
    runner = os.path.join(TMP, "smashgrab_runner.html"); open(runner, "w", encoding="utf-8").write("\n".join(parts))
    ud = tempfile.mkdtemp(prefix="td_sg_")
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
