#!/usr/bin/env python3
"""TD_SMASHGRAB [v4] — the throwaway §24 fun-test as CORRIDORS + a chase: a 1-wide APPROACH ->
a LOOT CHAMBER (treasure + two artifacts + an impassable chasm you route around) -> a 1-wide
ESCAPE corridor with a stone SLAB that grinds DOWN across it on the grab. Drives the module:
corridor shape, the slab is a true funnel (no route avoids it), looting = weight, a LIGHT run
passes under the slab and escapes, a GREEDY/heavy run is sealed in before it reaches the slab.
Also asserts the SFX cue HINTS the module emits (host plays them; we only check the hooks fire).

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
// BFS over the live map; opt.noSlab treats the slab cell as a wall (to prove the funnel)
function bfs(sx,sy,tx,ty,noSlab){ var v=SG.view(),D={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]},sl=v.slab;
  var q=[[sx,sy]],seen={},prev={}; seen[sx+','+sy]=1;
  while(q.length){var c=q.shift(); if(c[0]===tx&&c[1]===ty){var p=[],k=tx+','+ty; while(k!==sx+','+sy){var pp=prev[k];p.unshift(pp.d);k=pp.f;} return p;}
    for(var dd in D){var nx=c[0]+D[dd][0],ny=c[1]+D[dd][1],kk=nx+','+ny,ch=v.base(nx,ny);
      if(seen[kk]||ch==='#'||ch==='~')continue; if(noSlab&&sl&&nx===sl.x&&ny===sl.y)continue;
      seen[kk]=1;prev[kk]={f:c[0]+','+c[1],d:dd};q.push([nx,ny]);}}
  return null; }
function goTo(tx,ty){ var p=SG.view().player,path=bfs(p.x,p.y,tx,ty)||[]; for(var i=0;i<path.length&&!SG.over();i++)SG.move(path[i]); return SG.view().player.x===tx&&SG.view().player.y===ty; }
function man(ax,ay,bx,by){return Math.abs(ax-bx)+Math.abs(ay-by);}
try{
  // ===== R1: CORRIDOR LAYOUT — approach -> chamber (chasm) -> escape, all connected =====
  var e=SG.enter(0), v=SG.view();
  ok('R1 enter telegraphs a rigged TELL (voice channel)', !!(e&&e.tell)&&/draft|rhyme|slab/i.test(e.tell), e?e.tell:'(none)');
  ok('R1 chamber holds two artifacts, 4 treasure, and an impassable chasm', v.arts.length===2 && v.treas.length>=3 && v.crevasse.length>=8, v.arts.length+' arts / '+v.treas.length+' treasure / '+v.crevasse.length+' chasm');
  // the APPROACH is a 1-wide corridor: the entry's neighbours above and below are walls
  ok('R1 approach is a genuine 1-wide corridor', v.base(v.entry.x,v.entry.y-1)==='#' && v.base(v.entry.x,v.entry.y+1)==='#');
  // the ESCAPE is a 1-wide corridor too: the cell just inside the exit has walls above & below
  ok('R1 escape is a genuine 1-wide corridor', v.base(v.exit.x-1,v.exit.y-1)==='#' && v.base(v.exit.x-1,v.exit.y+1)==='#');
  // the chasm forces a DETOUR to the (far-side) artifact
  var A=v.arts[0], pth=bfs(v.entry.x,v.entry.y,A.x,A.y);
  ok('R1 the chasm forces a DETOUR to the artifact (route around, not straight)', pth && pth.length > man(v.entry.x,v.entry.y,A.x,A.y)+3, pth?('path='+pth.length+' vs straight='+man(v.entry.x,v.entry.y,A.x,A.y)):'no route');

  // ===== R2: THE SLAB IS A TRUE FUNNEL inside the escape corridor =====
  ok('R2 the slab sits inside the escape corridor, between chamber and exit', !!v.slab && v.slab.y===v.exit.y && v.slab.x<v.exit.x && v.slab.x>=19, JSON.stringify(v.slab));
  var pNorm=bfs(A.x,A.y,v.exit.x,v.exit.y), pNoSlab=bfs(A.x,A.y,v.exit.x,v.exit.y,true);
  ok('R2 there is NO route to the exit that avoids the slab (true funnel)', !!pNorm && pNoSlab===null, 'with-slab='+(pNorm?pNorm.length:'none')+' avoiding-slab='+(pNoSlab?pNoSlab.length:'none'));

  // ===== R2b: treasure = weight (loot does not trip; over threshold disables sprint) =====
  SG.enter(1); v=SG.view();
  goTo(v.treas[0].x, v.treas[0].y); var g1=SG.get();
  ok('R2 looting treasure adds LOAD, emits a loot cue, and does NOT trip', g1.got && g1.treasure && g1.sfx==='loot' && SG.view().load>0 && !SG.view().tripped, "load="+SG.view().load+" sfx="+g1.sfx);
  var tv=SG.view(); for(var i=1;i<tv.treas.length;i++){ goTo(tv.treas[i].x,tv.treas[i].y); SG.get(); }
  ok('R2 over the weight threshold, SPRINT is disabled', SG.view().load>SG.TUNE.SPRINT_THRESHOLD && SG.view().sprintable===false, "load="+SG.view().load);

  // ===== R3: grab trips the in-corridor slab; the other artifact falls; staged descent =====
  SG.enter(2); v=SG.view();
  goTo(v.arts[0].x, v.arts[0].y); var ga=SG.get();
  ok('R3 grabbing an artifact TRIPS the slab + emits a grab sting', ga.got && ga.artifact && ga.ev && ga.ev.tremor && ga.ev.sfx==='grab' && SG.view().tripped, "sfx="+(ga.ev&&ga.ev.sfx));
  var other=SG.view().arts.filter(function(a){return a.id!==ga.carried.id;})[0];
  var inChasm = SG.view().crevasse.some(function(c){return c.x===other.x&&c.y===other.y;});
  ok('R3 the un-taken artifact FELL INTO THE CHASM (visible, recoverable)', other.fallen===true && inChasm && !!SG.view().fallenPending, "fallen="+other.fallen+" inChasm="+inChasm);
  ok('R3 one-carry: cannot grab a second artifact', (function(){return !SG.get().got;})());
  var p0=SG.view().doorProgress; SG.move('left'); SG.move('right');
  ok('R3 the slab descends in STAGES as turns pass (progress climbs, < 1)', SG.view().doorProgress>p0 && SG.view().doorProgress<1, "progress "+p0.toFixed(2)+" -> "+SG.view().doorProgress.toFixed(2));
  var mv=SG.move('left'); ok('R3 each move emits a footstep + grind-while-descending hint', mv.sfx==='step' && mv.grind===true);

  // ===== R3 WIN: a LIGHT run passes UNDER the slab and escapes (chime) =====
  SG.enter(3); v=SG.view();
  goTo(v.arts[0].x, v.arts[0].y); SG.get();
  var path=bfs(SG.view().player.x,SG.view().player.y,v.exit.x,v.exit.y)||[], escSfx=null;
  for(var j=0;j<path.length&&!SG.over();j++){ var r=SG.move(path[j]); if(r.escaped)escSfx=r.sfx; }
  ok('R3 WIN: a light sprint passes under the slab and ESCAPES (chime)', SG.view().escaped===true && SG.view().passedSlab===true && escSfx==='chime', "escaped="+SG.view().escaped+" passed="+SG.view().passedSlab+" doorRem="+SG.view().doorRemaining);

  // ===== R3 LOSE: a GREEDY run is sealed in before it reaches the slab (slam) =====
  SG.enter(4); v=SG.view();
  v.treas.forEach(function(t){ goTo(t.x,t.y); SG.get(); });
  goTo(SG.view().arts[0].x, SG.view().arts[0].y); SG.get();
  var path2=bfs(SG.view().player.x,SG.view().player.y,v.exit.x,v.exit.y)||[], dSfx=null;
  for(var k=0;k<path2.length&&!SG.over();k++){ var r2=SG.move(path2[k]); if(r2.dead)dSfx=r2.sfx; }
  var vd=SG.view();
  ok('R3 LOSE: too heavy -> the slab seals first, SUMMARILY VOIDED (slam)', vd.dead===true && !vd.escaped && !vd.passedSlab && dSfx==='slam', "dead="+vd.dead+" passed="+vd.passedSlab+" sfx="+dSfx);
  ok('R3 LOSE: the slab descended fully and SEALED the corridor cell', vd.sealed===true && vd.doorProgress>=1 && SG.view().base(vd.slab.x,vd.slab.y)==='=', "sealed="+vd.sealed+" progress="+vd.doorProgress.toFixed(2));

  // ===== R4: tunables surfaced =====
  ok('R4 tunables surfaced (escape/weight/threshold/tremor + escape length)',
     typeof SG.TUNE.ESCAPE_TURNS==='number' && typeof SG.TUNE.WEIGHT_PER_TREASURE==='number' && typeof SG.TUNE.SPRINT_THRESHOLD==='number' && !!SG.TUNE.TREMOR && SG.view().escapeLen>0,
     "N="+SG.TUNE.ESCAPE_TURNS+" wpt="+SG.TUNE.WEIGHT_PER_TREASURE+" thr="+SG.TUNE.SPRINT_THRESHOLD+" len="+SG.view().escapeLen);

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
