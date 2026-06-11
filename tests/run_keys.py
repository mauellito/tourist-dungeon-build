#!/usr/bin/env python3
"""End-to-end SIMULATED-KEYPRESS test of the shipped engine/play-map.html.

Tests the game the way the operator plays it: it serves the repo over http,
loads the REAL play-map.html in an iframe, and dispatches real KeyboardEvents
into it, asserting:
  - diagonal movement works (one letter key moves both axes),
  - doors do NOT open on contact (bump reveals; Enter commits),
  - a full walked playthrough: bump a building -> Enter enters its interior ->
    counter buys a ticket -> leave -> gate (bump no descend) -> Enter descends ->
    dungeon door (bump no traverse) -> Enter traverses.

Run:  python tests/run_keys.py
"""
import functools
import html
import http.server
import os
import re
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMPDIR = os.path.join(ROOT, "tests", ".tmp")
PORT = 8754
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
  function ok(n,c){ R.push((c?'PASS ':'FAIL ')+n); }
  function view(){ return win.__TD_VIEW(); }
  var KEYS={up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',ul:'q',ur:'e',dl:'z',dr:'c',enter:'Enter'};
  function press(d){ doc.dispatchEvent(new win.KeyboardEvent('keydown',{key:KEYS[d],bubbles:true,cancelable:true})); }
  var DV={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0],ul:[-1,-1],ur:[1,-1],dl:[-1,1],dr:[1,1]};
  function walkable(v,x,y){ if(y<0||x<0||y>=v.grid.length||x>=v.grid[0].length)return false; if(v.grid[y][x]!=='.')return false;
    var k=x+','+y; if(v.doors&&v.doors[k])return false; if(v.features&&v.features[k])return false; return true; }
  function dirOf(dx,dy){ for(var d in DV){ if(DV[d][0]===dx&&DV[d][1]===dy)return d; } return null; }
  function bfs(v,sx,sy,tx,ty){ var q=[[sx,sy]],seen={},prev={}; seen[sx+','+sy]=1;
    while(q.length){ var c=q.shift(); if(c[0]===tx&&c[1]===ty){ var path=[],k=tx+','+ty;
        while(k!==sx+','+sy){ var p=prev[k]; path.unshift(p.dir); k=p.from; } return path; }
      for(var d in DV){ var nx=c[0]+DV[d][0],ny=c[1]+DV[d][1],kk=nx+','+ny;
        if(!seen[kk]&&walkable(v,nx,ny)){ seen[kk]=1; prev[kk]={from:c[0]+','+c[1],dir:d}; q.push([nx,ny]); } } }
    return null; }
  function goAdjacent(tx,ty){ var v=view(),p=v.player;
    for(var d in DV){ var ax=tx+DV[d][0],ay=ty+DV[d][1]; if(walkable(v,ax,ay)){ var path=bfs(v,p.x,p.y,ax,ay);
      if(path){ path.forEach(press); return dirOf(tx-ax,ty-ay); } } }
    return null; }
  try {
    var p0=view().player; press('ur'); var p1=view().player;
    ok('diagonal key moves both axes (ur -> x+1,y-1)', p1.x===p0.x+1 && p1.y===p0.y-1);

    var bd=goAdjacent(8,7);
    press(bd); var vb=view();
    ok('bumping a building does NOT enter it (still town)', vb.phase==='town');
    ok('the bump reveals an Enter prompt', /Enter/.test(vb.lastEvent||''));
    press('enter'); var vin=view();
    ok('Enter enters the Kiosk interior', vin.phase==='interior' && /Kiosk/.test(vin.title));

    var cd=goAdjacent(20,5); press(cd);
    ok('the counter buys a Standard ticket', view().ticket==='standard');

    var ed=goAdjacent(20,14); press(ed); press('enter');
    ok('leaving the interior returns to the harbour', view().phase==='town');

    var gd=goAdjacent(32,14); press(gd);
    ok('bumping the dungeon gate does not descend on contact', view().phase==='town');
    press('enter');
    ok('Enter at the gate (ticket in hand) descends into the dungeon', view().phase==='dungeon');

    var vd=view(); var dk=Object.keys(vd.doors)[0].split(',');
    var dd=goAdjacent(+dk[0],+dk[1]); var nb=view().node; press(dd);
    ok('bumping a dungeon door does NOT traverse', view().node===nb);
    press('enter');
    ok('Enter traverses the dungeon door', view().node!==nb);
  } catch(e){ R.push('HARNESS_ERROR '+(e&&e.stack?e.stack:e)); }
  var fails=R.filter(function(x){return x.indexOf('FAIL')===0||x.indexOf('HARNESS')===0;}).length;
  document.getElementById('out').textContent=R.join('\n')+'\nSUMMARY '+(R.length-fails)+'/'+R.length;
  document.title='TD_KEYS pass='+(R.length-fails)+' fail='+fails;
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
    with open(os.path.join(TMPDIR, "keys_wrap.html"), "w", encoding="utf-8") as f:
        f.write(WRAP)

    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), handler)
    httpd.daemon_threads = True
    th = threading.Thread(target=httpd.serve_forever, daemon=True)
    th.start()
    try:
        user_data = tempfile.mkdtemp(prefix="td_keys_")
        url = "http://127.0.0.1:{}/tests/.tmp/keys_wrap.html".format(PORT)
        cmd = [chrome, "--headless", "--disable-gpu", "--no-sandbox", "--user-data-dir=" + user_data,
               "--virtual-time-budget=4000", "--dump-dom", url]
        try:
            proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=120)
        finally:
            shutil.rmtree(user_data, ignore_errors=True)
    finally:
        httpd.shutdown()

    dom = proc.stdout.decode("utf-8", "replace")
    title = (re.search(r"<title>(.*?)</title>", dom, re.DOTALL) or [None, ""])[1]
    m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.DOTALL)
    report = html.unescape(m.group(1)) if m else "(no output)\n" + dom[:1500]
    print(report)
    print("-" * 60)
    fm = re.search(r"fail=(\d+)", title)
    if "harness_error" in title or not fm:
        print("RESULT: HARNESS ERROR (title=%r)" % title)
        return 2
    fails = int(fm.group(1))
    pm = re.search(r"pass=(\d+)", title)
    print("RESULT: {} passed, {} failed (real keypresses on the shipped page)".format(int(pm.group(1)) if pm else 0, fails))
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
