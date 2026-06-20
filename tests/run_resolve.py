#!/usr/bin/env python3
"""TD_RESOLVE — the pure resolution core extracted in GATE 1. Verifies the combat math
(strike/applyDamage/ttk + the unchanged constants/creature stats) and that the smash-and-grab
resolution runs on EXPLICIT state objects so many independent runs coexist without interfering
(the property the headless balance sim depends on). Pure + deterministic — no DOM.

Run:  python tests/run_resolve.py
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
var T=TD_RESOLVE, C=T.COMBAT, SG=T.SG;
function bfs(S,sx,sy,tx,ty,noRubble){ var L=SG.layout,D={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
  var q=[[sx,sy]],seen={},prev={}; seen[sx+','+sy]=1;
  while(q.length){var c=q.shift(); if(c[0]===tx&&c[1]===ty){var p=[],k=tx+','+ty; while(k!==sx+','+sy){var pp=prev[k];p.unshift(pp.d);k=pp.f;} return p;}
    for(var dd in D){var nx=c[0]+D[dd][0],ny=c[1]+D[dd][1],kk=nx+','+ny,ch=L.baseTile(nx,ny);
      if(seen[kk]||ch==='#'||ch==='~')continue; if(noRubble&&SG.rubble(S,nx,ny))continue;
      seen[kk]=1;prev[kk]={f:c[0]+','+c[1],d:dd};q.push([nx,ny]);}}
  return null; }
function goTo(S,tx,ty){ var p=S.player,path=bfs(S,p.x,p.y,tx,ty)||[]; for(var i=0;i<path.length&&!SG.over(S);i++)SG.move(S,path[i]); return S.player.x===tx&&S.player.y===ty; }
function flee(S){ var path=bfs(S,S.player.x,S.player.y,SG.layout.EXIT.x,SG.layout.EXIT.y,true)||[]; for(var i=0;i<path.length&&!SG.over(S);i++)SG.move(S,path[i]); }
try{
  // ---- COMBAT: constants unchanged + the pure ops ----
  ok('COMBAT constants unchanged (PLAYER_DMG/FALL/STARVE/EXHAUST)', C.PLAYER_DMG===20&&C.FALL_DMG===25&&C.STARVE_HP===2&&C.EXHAUST_HP===1, [C.PLAYER_DMG,C.FALL_DMG,C.STARVE_HP,C.EXHAUST_HP].join(','));
  ok('CREATURE stats (Gate 1 R2: dmg calibrated 6/11/8, hp 30/45/26 unchanged)', C.CREATURES.wanderer.hp===30&&C.CREATURES.wanderer.dmg===6&&C.CREATURES.lurker.hp===45&&C.CREATURES.lurker.dmg===11&&C.CREATURES.chaser.hp===26&&C.CREATURES.chaser.dmg===8);
  ok('strike(): blow lands, floors at 0, flags the kill', T.strike(30,20).hp===10&&T.strike(30,20).killed===false&&T.strike(20,20).killed===true&&T.strike(10,20).hp===0&&T.strike(10,20).killed===true);
  ok('applyDamage(): player hp floored + death flag', T.applyDamage(100,25).hp===75&&T.applyDamage(100,25).dead===false&&T.applyDamage(20,25).hp===0&&T.applyDamage(20,25).dead===true);
  ok('ttk(): exact turns-to-kill at fixed damage', T.ttk(30,20)===2&&T.ttk(45,20)===3&&T.ttk(26,20)===2&&T.ttk(100,0)===Infinity);

  // ---- SG runs on explicit state: two runs are INDEPENDENT ----
  var S1=SG.newState(), S2=SG.newState(); S1.active=true; S2.active=true;
  goTo(S1, SG.layout.TREAS[0].x, SG.layout.TREAS[0].y); SG.get(S1);
  ok('independent runs: looting S1 does not touch S2', S1.load>0 && S2.load===0 && S1.score>0 && S2.score===0, "S1 load="+S1.load+" S2 load="+S2.load);

  // ---- SG resolution via the pure API: a light run escapes with a score ----
  var W=SG.newState(); W.active=true;
  var two=W.treas.slice().sort(function(a,b){return b.value-a.value;}).slice(0,2);
  goTo(W,two[0].x,two[0].y); SG.get(W); goTo(W,two[1].x,two[1].y); SG.get(W);
  goTo(W,W.arts[0].x,W.arts[0].y); SG.get(W);
  for(var i=0;i<40 && !SG.over(W);i++) flee(W);
  ok('pure SG: a light run ESCAPES with a score', W.escaped===true && W.score>0, "escaped="+W.escaped+" score="+W.score);

  // ---- SG resolution: a run that LOST TIME (a fight) is SWALLOWED by the collapse (post-calibration
  // the edge does not chase a clean sprinter; it catches you when a fight ate your head-start) ----
  var L=SG.newState(); L.active=true;
  goTo(L,L.arts[0].x,L.arts[0].y); SG.get(L);
  L.doorClosed += 7;                                          // simulate a fight's time-cost (as the sim does)
  for(var j=0;j<60 && !SG.over(L);j++) flee(L);
  ok('pure SG: a time-lost run is SWALLOWED by the collapse', L.dead===true && L.swallowed===true, "dead="+L.dead+" swallowed="+L.swallowed);

  // ---- determinism: same choices -> identical outcome ----
  function play(grabAll){ var S=SG.newState(); S.active=true;
    var ts=S.treas.slice().sort(function(a,b){return b.value-a.value;}); var n=grabAll?ts.length:2;
    for(var k=0;k<n;k++){ goTo(S,ts[k].x,ts[k].y); SG.get(S); }
    goTo(S,S.arts[0].x,S.arts[0].y); SG.get(S);
    for(var m=0;m<40 && !SG.over(S);m++) flee(S);
    return {escaped:S.escaped,dead:S.dead,swallowed:S.swallowed,score:S.score}; }
  ok('determinism: identical inputs -> identical result', JSON.stringify(play(false))===JSON.stringify(play(false)) && JSON.stringify(play(true))===JSON.stringify(play(true)));

  o.textContent=R.join('\n')+'\nSUMMARY '+(R.length-fails)+'/'+R.length; document.title="RES fail="+fails;
}catch(e){o.textContent="HARNESS_ERROR "+(e&&e.stack?e.stack:e);document.title="RES harness_error";}})();</script>
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
             "<script>\n" + open(os.path.join(ENGINE, "resolve.js"), encoding="utf-8").read() + "\n</script>", REP]
    runner = os.path.join(TMP, "resolve_runner.html"); open(runner, "w", encoding="utf-8").write("\n".join(parts))
    ud = tempfile.mkdtemp(prefix="td_res_")
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
