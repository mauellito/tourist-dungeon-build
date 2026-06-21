#!/usr/bin/env python3
"""Juice INTEGRATION check — confirms the combat/feel hooks actually fire on the LIVE play-map
path (game event -> play-map fireFeel -> TD_FEEL.apply), not just in the TD_FEEL unit tests.
Drives the shipped engine/play-map.html in an iframe with real keypresses:
  descend (town->dungeon) -> shimmer + float:descend
  bump-attack a survivor   -> shake + flash + a hit float
  kill a creature          -> float:kill
  take damage              -> vignette (+ player-hit float)
Hooks are read from the live debug overlay's feel.lastHooks. If a hook fails here, there is a
plumbing gap between the game event and TD_FEEL.apply.

Run:  python tests/run_juice.py
"""
import functools, html, http.server, os, re, shutil, socketserver, subprocess, sys, tempfile, threading
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMPDIR = os.path.join(ROOT, "tests", ".tmp")
CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]
WRAP = r"""<!doctype html><html><head><meta charset="utf-8"><title>pending</title></head>
<body><iframe id="f" src="/engine/play-map.html?seed=7" width="760" height="440"></iframe>
<pre id="out">pending</pre>
<script>
var F=document.getElementById('f');
F.onload=function(){
  var win=F.contentWindow, doc=win.document, R=[];
  function ok(n,c,d){ R.push((c?'PASS ':'FAIL ')+n+(d?('  ::  '+d):'')); }
  function view(){ return win.__TD_VIEW(); }
  function pk(k){ doc.dispatchEvent(new win.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true})); }
  var DIR={up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',ul:'y',ur:'u',dl:'b',dr:'n'};
  function press(d){ pk(DIR[d]); }
  var DV={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0],ul:[-1,-1],ur:[1,-1],dl:[-1,1],dr:[1,1]};
  function walkable(v,x,y){ if(y<0||x<0||y>=v.grid.length||x>=v.grid[0].length)return false; if(v.grid[y][x]!=='.')return false;
    var k=x+','+y; if(v.doors&&v.doors[k])return false; if(v.features&&v.features[k])return false;
    if(v.plain&&v.plain[k]&&!v.plain[k].open)return false;
    if(v.creatures){for(var i=0;i<v.creatures.length;i++)if(v.creatures[i].x===x&&v.creatures[i].y===y)return false;} return true; }
  function dirOf(dx,dy){ for(var d in DV)if(DV[d][0]===dx&&DV[d][1]===dy)return d; return null; }
  function bfs(v,sx,sy,tx,ty){ var q=[[sx,sy]],seen={},prev={}; seen[sx+','+sy]=1;
    while(q.length){ var c=q.shift(); if(c[0]===tx&&c[1]===ty){ var path=[],k=tx+','+ty;
      while(k!==sx+','+sy){ var p=prev[k]; path.unshift(p.dir); k=p.from; } return path; }
      for(var d in DV){ var nx=c[0]+DV[d][0],ny=c[1]+DV[d][1],kk=nx+','+ny;
        if(!seen[kk]&&walkable(v,nx,ny)){ seen[kk]=1; prev[kk]={from:c[0]+','+c[1],dir:d}; q.push([nx,ny]); } } } return null; }
  function goAdjacent(tx,ty){ var v=view(),p=v.player;
    for(var d in DV){ var ax=tx+DV[d][0],ay=ty+DV[d][1]; if(walkable(v,ax,ay)){ var path=bfs(v,p.x,p.y,ax,ay);
      if(path){ path.forEach(press); return dirOf(tx-ax,ty-ay); } } } return null; }
  function find(act){ var f=view().features||{}; for(var k in f){ if(f[k].act===act){ var p=k.split(','); return [+p[0],+p[1]]; } } return null; }
  function findDoor(to){ var d=view().doors||{}; for(var k in d){ if(d[k].to===to){ var p=k.split(','); return [+p[0],+p[1]]; } } return null; }
  function clearMore(){ var n=0; while(doc.getElementById('more')&&doc.getElementById('more').classList.contains('show')&&n++<6) pk('Escape'); }
  function hooks(){ try{ return (JSON.parse(doc.getElementById('debugBody').textContent||'{}').feel||{}).lastHooks||[]; }catch(e){ return []; } }
  function hasHook(arr,pre){ return arr.some(function(h){ return h.indexOf(pre)===0; }); }
  function adjFloor(){ var v=view(),p=v.player,D=[['right',1,0],['left',-1,0],['up',0,-1],['down',0,1],['ul',-1,-1],['ur',1,-1],['dl',-1,1],['dr',1,1]];
    for(var i=0;i<8;i++){ var nx=p.x+D[i][1],ny=p.y+D[i][2],k=nx+','+ny; if(v.grid[ny]&&v.grid[ny][nx]==='.'&&!(v.doors&&v.doors[k])&&!(v.creatures||[]).some(function(c){return c.x===nx&&c.y===ny;})) return {dir:D[i][0],x:nx,y:ny}; } return null; }
  try {
    // GATE FIX — a new game opens the creation flow up front; dismiss it (Escape) to the random boot
    var gI=0; while(view().intake && view().intake.open && gI++<8){ pk('Escape'); }
    pk('~');   // open the debug overlay so feel.lastHooks is readable after each action

    // ---- DESCEND (town -> dungeon): buy ticket, walk to the mouth, descend (clean, no contraption) ----
    var ki=find('kiosk'); var kd=goAdjacent(ki[0],ki[1]); press(kd); pk('Enter');     // buy a Standard ticket
    var mo=findDoor('DUNGEON'); var md=goAdjacent(mo[0],mo[1]); press(md); pk('Enter'); clearMore();   // descend
    ok('LIVE: reached the dungeon', view().phase==='dungeon', 'phase='+view().phase);
    var dh=hooks();
    ok('LIVE descend fires shimmer + float:descend', hasHook(dh,'shimmer:descend') && hasHook(dh,'float:descend'), dh.join(','));

    var DUN=win.__TD_SIM()._dungeon();
    function spawnAdj(spec){ DUN._setCreatures([]); var a=adjFloor(); if(!a) return null; DUN._meters().hp=100; spec.x=a.x; spec.y=a.y; DUN._setCreatures([spec]); return a; }
    // ---- BUMP-ATTACK (survivor): shake + flash + a hit float ----
    var a1=spawnAdj({kind:'lurker',hp:80,maxHp:80,dmg:4,name:'a clerk',glyph:'L'});
    ok('a clear adjacent cell was available for combat', !!a1, a1?'':'(boxed in)');
    if(a1){ press(a1.dir); clearMore(); var bh=hooks();
      ok('LIVE bump-attack fires shake + flash + a hit float',
         hasHook(bh,'shake') && hasHook(bh,'flash') && (hasHook(bh,'float:solid-hit')||hasHook(bh,'float:glancing-hit')||hasHook(bh,'float:kill')||hasHook(bh,'float:crit')), bh.join(',')); }

    // ---- KILL: float:kill ----
    var a2=spawnAdj({kind:'lurker',hp:1,maxHp:1,dmg:1,name:'a temp',glyph:'L'});
    if(a2){ press(a2.dir); clearMore(); var kh=hooks();
      ok('LIVE kill fires float:kill (heavier than a hit)', hasHook(kh,'float:kill')||hasHook(kh,'float:crit'), kh.join(',')); }

    // ---- TAKE DAMAGE: vignette (+ player-hit) — spawn an adjacent attacker and let it strike ----
    var a3=spawnAdj({kind:'lurker',hp:200,maxHp:200,dmg:8,name:'a bruiser',glyph:'B'});
    if(a3){ var dmgHooks=[]; for(var w=0;w<4;w++){ pk('.'); clearMore(); var hh=hooks(); if(hasHook(hh,'vignette')){ dmgHooks=hh; break; } dmgHooks=hh; }
      ok('LIVE take-damage fires vignette', hasHook(dmgHooks,'vignette'), dmgHooks.join(',')); }
  } catch(e){ R.push('HARNESS_ERROR '+(e&&e.stack?e.stack:e)); }
  var fails=R.filter(function(x){return x.indexOf('FAIL')===0||x.indexOf('HARNESS')===0;}).length;
  doc.defaultView; document.getElementById('out').textContent=R.join('\n')+'\nSUMMARY '+(R.length-fails)+'/'+R.length;
  document.title='TD_JUICE pass='+(R.length-fails)+' fail='+fails;
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
    with open(os.path.join(TMPDIR, "juice_wrap.html"), "w", encoding="utf-8") as f:
        f.write(WRAP)
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    bound_port = httpd.server_address[1]
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        user_data = tempfile.mkdtemp(prefix="td_juice_")
        url = "http://127.0.0.1:{}/tests/.tmp/juice_wrap.html".format(bound_port)
        cmd = [chrome, "--headless", "--disable-gpu", "--no-sandbox", "--user-data-dir=" + user_data, "--virtual-time-budget=5000", "--dump-dom", url]
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
    print("RESULT: {} passed, {} failed (live juice integration)".format(int(pm.group(1)) if pm else 0, fails))
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
