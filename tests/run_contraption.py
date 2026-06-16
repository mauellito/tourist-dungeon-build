#!/usr/bin/env python3
"""Descent contraption invariant (hotfix): the descent is NEVER permanently sealed with no way in.
Across town seeds: whenever the descent gate is sealed, a reachable lever feature exists (path-dist
>= 3 from the mouth over walkable cells); if no lever was placed, the gate is fail-OPEN. And the
loop resolves: throw the lever -> the gate opens.

Run:  python tests/run_contraption.py
"""
import html, os, re, shutil, subprocess, sys, tempfile
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, "engine"); TMP = os.path.join(ROOT, "tests", ".tmp")
FILES = ["rng.js", "vaultfmt.js", "vaultlib.js", "lawsuite.js", "assembler.js", "checker.js", "vaults.js",
         "generator.js", "interpreter.js", "mapmode.js", "voices.js", "towngen.js", "townlaws.js",
         "towngen2.js", "townmap.js", "contraption.js", "game.js", "ui.js"]
CH = [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
      r"C:\Program Files\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"]
REP = r"""
<script>(function(){var o=document.getElementById('out');var R=[],fails=0;
function ok(n,c,d){R.push((c?'PASS ':'FAIL ')+n+(d?('  ::  '+d):''));if(!c)fails++;}
try{
  function walkBFS(t, sx, sy){ // 8-way reach over '.' floor; returns {key:dist}
    var seen={}, q=[[sx,sy,0]]; seen[sx+','+sy]=0; var D=[[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]];
    while(q.length){ var c=q.shift(); for(var i=0;i<8;i++){ var nx=c[0]+D[i][0],ny=c[1]+D[i][1],k=nx+','+ny;
      if(ny<0||ny>=t.H||nx<0||nx>=t.W||seen[k]!=null)continue; var row=t.grid[ny]; var g=Array.isArray(row)?row[nx]:row[nx];
      if(g!=='.')continue; seen[k]=c[2]+1; q.push([nx,ny,c[2]+1]); } } return seen; }
  var seeds=[1,2,3,7,11,23,99];
  seeds.forEach(function(sd){
    var sim=TD_GAME.create(TD_GEN.generate(sd),{session:{knowledge:new Set(),lives:0}});
    sim._character().ticket="standard";
    var t=sim._town();
    var mk=null; Object.keys(t.doors).forEach(function(k){ if(t.doors[k].to==="DUNGEON") mk=k; });
    if(!mk){ ok("seed "+sd+": dungeon mouth exists", false); return; }
    var mp=mk.split(',').map(Number);
    var lk=null; Object.keys(t.features).forEach(function(k){ if(t.features[k].act==="lever") lk=k; });
    var placed=TD_CONTRAPTION.placed();
    // gate result, ticketed + not armed
    var gr=t.doors[mk].gate(); var sealed=!!(gr && gr.block);
    // THE INVARIANT: if sealed, a reachable lever (dist>=3) must exist — never a soft-lock.
    var reach=walkBFS(t, mp[0], mp[1]);
    var leverReach = lk ? (reach[lk]!=null && reach[lk]>=3) : false;
    ok("seed "+sd+": NOT soft-locked (sealed => reachable lever exists)",
       (!sealed) || leverReach, "sealed="+sealed+" lever="+(lk||"none")+" dist="+(lk?reach[lk]:"-"));
    // placed flag agrees with a lever feature actually being present
    ok("seed "+sd+": placed flag matches a real lever feature", placed === !!lk, "placed="+placed+" lever="+!!lk);
    // fail-open: if no lever placed, the ticketed gate must be OPEN
    ok("seed "+sd+": fail-open when no lever (ticketed gate open)", placed || !sealed, "placed="+placed+" sealed="+sealed);
    // the loop resolves: throwing the lever opens the gate
    if(lk){
      TD_CONTRAPTION.pull(sim._turn ? sim._turn() : 0);
      var gr2=t.doors[mk].gate();
      ok("seed "+sd+": throwing the lever OPENS the descent", !(gr2 && gr2.block), "after pull");
      TD_CONTRAPTION.reset();
    }
  });
  o.textContent=R.join('\n')+'\nSUMMARY '+(R.length-fails)+'/'+R.length; document.title="C fail="+fails;
}catch(e){o.textContent="HARNESS_ERROR "+(e&&e.stack?e.stack:e);document.title="C harness_error";}})();</script>
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
    parts = ['<!doctype html><meta charset=utf-8><title>p</title><pre id=out>p</pre>']
    for fn in FILES:
        parts.append("<script>\n" + open(os.path.join(ENGINE, fn), encoding="utf-8").read() + "\n</script>")
    parts.append(REP)
    runner = os.path.join(TMP, "contraption_runner.html"); open(runner, "w", encoding="utf-8").write("\n".join(parts))
    ud = tempfile.mkdtemp(prefix="td_con_")
    try:
        pr = subprocess.run([chrome, "--headless", "--disable-gpu", "--no-sandbox", "--user-data-dir=" + ud, "--dump-dom", "file:///" + runner.replace("\\", "/")], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=180)
    finally:
        shutil.rmtree(ud, ignore_errors=True)
    dom = pr.stdout.decode("utf-8", "replace")
    title = (re.search(r"<title>(.*?)</title>", dom, re.DOTALL) or [None, ""])[1]
    m = re.search(r'<pre id=.?out.?>(.*?)</pre>', dom, re.DOTALL)
    print(html.unescape(m.group(1)) if m else "(no output)\n" + dom[:1200])
    print("-" * 60)
    fm = re.search(r"fail=(\d+)", title)
    if "harness_error" in title or not fm:
        print("RESULT: HARNESS ERROR"); return 2
    fails = int(fm.group(1)); print("RESULT: {} failed".format(fails)); return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
