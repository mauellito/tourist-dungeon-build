#!/usr/bin/env python3
"""TD_SMASHGRAB [v3] — the throwaway §24 fun-test: loot (weight) -> grab an artifact across an
IMPASSABLE chasm (route around) -> SPRINT out ahead of a closing SLAB DOOR. Drives the
self-contained module: chasm blocks + forces a detour + is where the un-taken artifact falls;
treasure adds weight and gates SPRINT; a light run escapes, a greedy/heavy run is VOIDED.

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
function bfs(sx,sy,tx,ty){ var v=SG.view(),D={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
  var q=[[sx,sy]],seen={},prev={}; seen[sx+','+sy]=1;
  while(q.length){var c=q.shift(); if(c[0]===tx&&c[1]===ty){var p=[],k=tx+','+ty; while(k!==sx+','+sy){var pp=prev[k];p.unshift(pp.d);k=pp.f;} return p;}
    for(var dd in D){var nx=c[0]+D[dd][0],ny=c[1]+D[dd][1],kk=nx+','+ny,ch=v.base(nx,ny); if(!seen[kk]&&ch!=='#'&&ch!=='~'){seen[kk]=1;prev[kk]={f:c[0]+','+c[1],d:dd};q.push([nx,ny]);}}}
  return null; }
function goTo(tx,ty){ var p=SG.view().player,path=bfs(p.x,p.y,tx,ty); if(!path)return false; for(var i=0;i<path.length&&!SG.over();i++)SG.move(path[i]); return true; }
function man(ax,ay,bx,by){return Math.abs(ax-bx)+Math.abs(ay-by);}
try{
  // ---- R1: enter + TELL; chasm splits the vault; the artifact is far-side (routed, not straight) ----
  var e=SG.enter(0), v=SG.view();
  ok('R1 enter telegraphs a rigged TELL (voice channel)', !!(e&&e.tell)&&/draft|rhyme|hollow/i.test(e.tell), e?e.tell:'(none)');
  ok('R1 two artifacts on the FAR side + an impassable chasm present', v.arts.length===2 && v.crevasse.length>=8, v.arts.length+' arts, '+v.crevasse.length+' chasm');
  var A=v.arts[0], pth=bfs(v.entry.x,v.entry.y,A.x,A.y);
  ok('R1 the chasm forces a DETOUR to the artifact (path >> straight line)', pth && pth.length > man(v.entry.x,v.entry.y,A.x,A.y)+3, pth?('path='+pth.length+' vs straight='+man(v.entry.x,v.entry.y,A.x,A.y)):'no route');
  // chasm blocks movement directly: walk up the entry column until a chasm cell, then it refuses
  var blocked=false; for(var s=0;s<12;s++){ var pp=SG.view().player; var r=SG.move('up'); if(!r.moved){ if(SG.view().base(pp.x,pp.y-1)==='~') blocked=true; break; } }
  ok('R1 the chasm BLOCKS movement (cannot cross, only see across)', blocked);

  // ---- R2: treasure = weight; looting does NOT trip; over threshold disables SPRINT ----
  SG.enter(1); v=SG.view();
  ok('R2 3-4 treasure pickups are scattered', v.treas.length>=3, v.treas.length+' treasure');
  goTo(v.treas[0].x, v.treas[0].y); var g1=SG.get();
  ok('R2 looting treasure adds LOAD and does NOT trip the collapse', g1.got && g1.treasure && SG.view().load>0 && !SG.view().tripped, "load="+SG.view().load+" tripped="+SG.view().tripped);
  // grab enough treasure to exceed the sprint threshold
  var tv=SG.view(); for(var i=1;i<tv.treas.length;i++){ goTo(tv.treas[i].x,tv.treas[i].y); SG.get(); }
  ok('R2 over the weight threshold, SPRINT is disabled (readout yes/no)', SG.view().load>SG.TUNE.SPRINT_THRESHOLD && SG.view().sprintable===false, "load="+SG.view().load+" sprint="+SG.view().sprintable);

  // ---- R3 + WIN: a LIGHT run — route to an artifact, grab (trip), sprint back, ESCAPE ----
  SG.enter(2); v=SG.view();
  goTo(v.arts[0].x, v.arts[0].y);
  var ga=SG.get();
  ok('R3 grabbing an artifact TRIPS the slab door (chase, not bare clock)', ga.got && ga.artifact && ga.ev && ga.ev.tremor && SG.view().tripped && SG.view().doorRemaining>0, "doorRem="+SG.view().doorRemaining);
  var other=SG.view().arts.filter(function(a){return a.id!==ga.carried.id;})[0];
  var inChasm = SG.view().crevasse.some(function(c){return c.x===other.x&&c.y===other.y;});
  ok('R3 the un-taken artifact FELL INTO THE CHASM (visible, recoverable)', other.fallen===true && inChasm, "fallen="+other.fallen+" inChasm="+inChasm);
  ok('R3 recovery is stubbed (pending at depth)', !!SG.view().fallenPending && SG.view().fallenPending.depth>=1, JSON.stringify(SG.view().fallenPending));
  ok('R3 one-carry: cannot grab a second artifact', (function(){var r=SG.get();return !r.got;})());
  goTo(SG.view().exit.x, SG.view().exit.y);
  ok('R3 WIN: a light, unburdened sprint reaches > before the slab seals (ESCAPE)', SG.view().escaped===true && !SG.view().dead, "escaped="+SG.view().escaped+" doorRem="+SG.view().doorRemaining);

  // ---- R3 + LOSE: a GREEDY run — grab all treasure (no sprint), grab artifact, get crushed ----
  SG.enter(3); v=SG.view();
  v.treas.forEach(function(t){ goTo(t.x,t.y); SG.get(); });
  ok('LOSE setup: over-loaded, SPRINT disabled', SG.view().sprintable===false, "load="+SG.view().load);
  goTo(SG.view().arts[0].x, SG.view().arts[0].y); SG.get();
  goTo(SG.view().exit.x, SG.view().exit.y);
  var vd=SG.view();
  ok('R3 LOSE: greed/weight gets you SUMMARILY VOIDED (slab seals first)', vd.dead===true && !vd.escaped, "dead="+vd.dead+" escaped="+vd.escaped+" doorRem="+vd.doorRemaining);

  // ---- R4: tunables surfaced ----
  ok('R4 tunables surfaced (escape/weight/threshold/tremor)', typeof SG.TUNE.ESCAPE_TURNS==='number' && typeof SG.TUNE.WEIGHT_PER_TREASURE==='number' && typeof SG.TUNE.SPRINT_THRESHOLD==='number' && !!SG.TUNE.TREMOR,
     "N="+SG.TUNE.ESCAPE_TURNS+" wpt="+SG.TUNE.WEIGHT_PER_TREASURE+" thr="+SG.TUNE.SPRINT_THRESHOLD);

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
