#!/usr/bin/env python3
"""FRONT-DOOR SMOKE TEST (GATE FIX R5) — guards boot -> create -> descend so it can't silently break.

Loads the REAL shipped engine/play-map.html and, with real keypresses, asserts the whole entry loop:
  - a new game OPENS the creation flow up front (fails if creation is unreachable),
  - the town SPAWNED a Tour Agency front (fails if the Agency tenant is missing),
  - the staged flow completes through the ALLOCATE stat-pool stage and ISSUES a ticket,
  - with a ticket you can step through the dungeon gate and ONE floor generates (fails if descent is blocked).

This is the regression net for the master fix: remove the agency tenant, or the boot startIntake wiring,
or block descent, and this suite goes RED.

Run:  python tests/run_smoke.py
"""
import functools, html, http.server, os, re, shutil, socketserver, subprocess, sys, tempfile, threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMPDIR = os.path.join(ROOT, "tests", ".tmp")
CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]

WRAP = r"""<!doctype html><html><head><meta charset="utf-8"><title>pending</title></head>
<body><iframe id="f" src="/engine/play-map.html?seed=7" width="760" height="440"></iframe>
<pre id="out">pending</pre>
<script>
var F = document.getElementById('f');
F.onload = function(){
  var win = F.contentWindow, doc = win.document, R = [];
  function ok(n,c,d){ R.push((c?'PASS ':'FAIL ')+n+(d?('  ::  '+d):'')); }
  function view(){ return win.__TD_VIEW(); }
  function pk(k){ doc.dispatchEvent(new win.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true})); }
  var DV={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0],ul:[-1,-1],ur:[1,-1],dl:[-1,1],dr:[1,1]};
  var DIR={up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',ul:'y',ur:'u',dl:'b',dr:'n'};
  function press(d){ pk(DIR[d]); }
  function dirOf(dx,dy){ for(var d in DV){ if(DV[d][0]===dx&&DV[d][1]===dy)return d; } return null; }
  function walkable(v,x,y){ if(y<0||x<0||y>=v.grid.length||x>=v.grid[0].length)return false; if(v.grid[y][x]!=='.')return false;
    var k=x+','+y; if(v.doors&&v.doors[k])return false; if(v.features&&v.features[k])return false;
    if(v.plain&&v.plain[k]&&!v.plain[k].open)return false;
    if(v.creatures){ for(var i=0;i<v.creatures.length;i++){ if(v.creatures[i].x===x&&v.creatures[i].y===y)return false; } } return true; }
  function bfs(v,sx,sy,tx,ty){ var q=[[sx,sy]],seen={},prev={}; seen[sx+','+sy]=1;
    while(q.length){ var c=q.shift(); if(c[0]===tx&&c[1]===ty){ var path=[],k=tx+','+ty; while(k!==sx+','+sy){ var p=prev[k]; path.unshift(p.dir); k=p.from; } return path; }
      for(var d in DV){ var nx=c[0]+DV[d][0],ny=c[1]+DV[d][1],kk=nx+','+ny; if(!seen[kk]&&walkable(v,nx,ny)){ seen[kk]=1; prev[kk]={from:c[0]+','+c[1],dir:d}; q.push([nx,ny]); } } } return null; }
  function goAdjacent(tx,ty){ var v=view(),p=v.player; for(var d in DV){ var ax=tx+DV[d][0],ay=ty+DV[d][1]; if(walkable(v,ax,ay)){ var path=bfs(v,p.x,p.y,ax,ay); if(path){ path.forEach(press); return dirOf(tx-ax,ty-ay); } } } return null; }
  function findDoor(to){ var d=view().doors||{}; for(var k in d){ if(d[k].to===to){ var p=k.split(','); return [+p[0],+p[1]]; } } return null; }
  function clearMore(){ var n=0; while(doc.getElementById('more')&&doc.getElementById('more').classList.contains('show')&&n++<6) pk('Escape'); }
  try {
    // 1) creation opens up front
    ok('a new game OPENS the creation flow up front', !!(view().intake && view().intake.open && view().intake.stage==='welcome'));
    // 2) the Tour Agency actually SPAWNED in town (fails if the tenant is missing)
    var feats=view().features||{}, agencyFronts=0; for(var k in feats){ if(feats[k].business==='agency') agencyFronts++; }
    ok('the town spawned a Tour Agency front (R1)', agencyFronts>=1, agencyFronts+' agency fronts');
    // 3) complete the staged flow (Apply): welcome -> sign -> sex -> visa -> allocate(spend) -> horoscope -> admitted
    pk('1');                                  // welcome -> Apply
    ok('Apply enters the staged flow (birth sign)', view().intake && view().intake.stage==='sign');
    pk('Enter'); pk('Enter'); pk('Enter');    // sign -> sex -> visa -> allocate
    ok('the ALLOCATE stat-pool stage is reachable', view().intake && view().intake.stage==='allocate');
    pk('ArrowRight');                         // spend from the pool
    ok('the stat pool spends (budget falls below full)', view().intake.budget < 1);
    pk('Enter'); pk('Enter');                 // allocate -> horoscope -> admitted
    ok('completing the flow ISSUES a ticket', !!(( !view().intake || !view().intake.open) && view().ticket));
    clearMore();
    // 4) with a ticket, walk to the dungeon gate and descend -> one floor generates
    win.__TD_SIM()._clearActors();            // de-flake the walked route
    var mouth=findDoor('DUNGEON');
    ok('the dungeon gate exists in town', !!mouth);
    if(mouth){ var bd=goAdjacent(mouth[0],mouth[1]); if(bd){ press(bd); pk('Enter'); clearMore(); } }
    var dv=view(), floor=0; if(dv.grid){ for(var y=0;y<dv.grid.length;y++){ for(var x=0;x<dv.grid[y].length;x++){ if(dv.grid[y][x]==='.') floor++; } } }
    ok('stepping through the gate DESCENDS into the dungeon', dv.phase==='dungeon', 'phase='+dv.phase);
    ok('one dungeon floor is generated (walkable cells present)', floor>20, floor+' floor cells');
  } catch(e){ R.push('HARNESS_ERROR '+(e&&e.stack?e.stack:e)); }
  var fails=R.filter(function(x){return x.indexOf('FAIL')===0||x.indexOf('HARNESS')===0;}).length;
  document.getElementById('out').textContent=R.join('\n')+'\nSUMMARY '+(R.length-fails)+'/'+R.length;
  document.title='TD_SMOKE pass='+(R.length-fails)+' fail='+fails;
};
</script></body></html>
"""


def find_chrome():
    for p in CHROME_CANDIDATES:
        if os.path.exists(p):
            return p
    for n in ("chrome", "chrome.exe", "msedge", "msedge.exe"):
        f = shutil.which(n)
        if f:
            return f
    return None


def main():
    chrome = find_chrome()
    if not chrome:
        sys.exit("FATAL: no Chrome/Edge found.")
    os.makedirs(TMPDIR, exist_ok=True)
    with open(os.path.join(TMPDIR, "smoke_wrap.html"), "w", encoding="utf-8") as f:
        f.write(WRAP)
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    bound_port = httpd.server_address[1]; httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        user_data = tempfile.mkdtemp(prefix="td_smoke_")
        url = "http://127.0.0.1:{}/tests/.tmp/smoke_wrap.html".format(bound_port)
        cmd = [chrome, "--headless", "--disable-gpu", "--no-sandbox", "--user-data-dir=" + user_data, "--virtual-time-budget=4000", "--dump-dom", url]
        try:
            proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=120)
        finally:
            shutil.rmtree(user_data, ignore_errors=True)
    finally:
        httpd.shutdown()
    dom = proc.stdout.decode("utf-8", "replace")
    title = (re.search(r"<title>(.*?)</title>", dom, re.DOTALL) or [None, ""])[1]
    m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.DOTALL)
    print(html.unescape(m.group(1)) if m else "(no output)\n" + dom[:1500])
    print("-" * 60)
    fm = re.search(r"fail=(\d+)", title)
    if "harness_error" in title or not fm:
        print("RESULT: HARNESS ERROR (title=%r)" % title); return 2
    fails = int(fm.group(1)); pm = re.search(r"pass=(\d+)", title)
    print("RESULT: {} passed, {} failed (front-door smoke)".format(int(pm.group(1)) if pm else 0, fails))
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
