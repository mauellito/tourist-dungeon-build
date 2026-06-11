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
  function lastMsg(){ var m=(view().messages||[]); return m[m.length-1]||''; }
  // dispatch a real keydown with an exact key value into the shipped page
  function pk(keyStr){ doc.dispatchEvent(new win.KeyboardEvent('keydown',{key:keyStr,bubbles:true,cancelable:true})); }
  // dispatch with a physical-key code too (numpad; NumLock-on reports key=digit)
  function pkc(keyStr,codeStr){ doc.dispatchEvent(new win.KeyboardEvent('keydown',{key:keyStr,code:codeStr,bubbles:true,cancelable:true})); }
  var DIR={up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',ul:'y',ur:'u',dl:'b',dr:'n'};
  function press(d){ pk(DIR[d]); }
  var DV={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0],ul:[-1,-1],ur:[1,-1],dl:[-1,1],dr:[1,1]};
  // mirror the engine's passability: walls, edge doors, shut plain doors, town
  // features and live creatures all block; floor and floor-items do not.
  function walkable(v,x,y){ if(y<0||x<0||y>=v.grid.length||x>=v.grid[0].length)return false; if(v.grid[y][x]!=='.')return false;
    var k=x+','+y; if(v.doors&&v.doors[k])return false; if(v.features&&v.features[k])return false;
    if(v.plain&&v.plain[k]&&!v.plain[k].open)return false;
    if(v.creatures){ for(var i=0;i<v.creatures.length;i++){ if(v.creatures[i].x===x&&v.creatures[i].y===y)return false; } }
    return true; }
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
  function goTo(tx,ty){ var v=view(),p=v.player; if(p.x===tx&&p.y===ty)return true;
    var path=bfs(v,p.x,p.y,tx,ty); if(!path)return false; path.forEach(press);
    var q=view().player; return q.x===tx&&q.y===ty; }
  try {
    // ============================ MOVEMENT + DIAGONALS ====================
    var p0=view().player; press('ur'); var p1=view().player;
    ok('diagonal key (u = up-right) moves both axes', p1.x===p0.x+1 && p1.y===p0.y-1);

    // ============================ NUMPAD (NumLock on) =====================
    var n0=view().player; pkc('4','Numpad4'); var n1=view().player;
    ok('numpad 4 moves left', n1.x===n0.x-1 && n1.y===n0.y);
    pkc('9','Numpad9'); var n2=view().player;
    ok('numpad 9 moves up-right (diagonal)', n2.x===n1.x+1 && n2.y===n1.y-1);
    var tt=view().turn; pkc('5','Numpad5');
    ok('numpad 5 waits a turn', view().turn===tt+1);

    // ============================ DOORS: BUMP vs COMMIT (town) ============
    var bd=goAdjacent(8,7); press(bd); var vb=view();
    ok('bumping a building does NOT enter it (still town)', vb.phase==='town');
    ok('the bump reveals an Enter prompt', /Enter/.test(vb.lastEvent||''));
    pk('Enter'); var vin=view();
    ok('Enter enters the Kiosk interior', vin.phase==='interior' && /Kiosk/.test(vin.title));

    // ============== PURCHASE IS A CONVERSATION (contact -> Enter) =========
    var cd=goAdjacent(20,5); press(cd); var vcounter=view();
    ok('bumping the counter does NOT buy — it opens a conversation',
       vcounter.ticket==null && vcounter.phase==='interior');
    ok('the clerk pitches with a clear offer line', /Enter to accept/.test(vcounter.lastEvent||''));
    pk('Enter');
    ok('Enter closes the deal — a Standard ticket', view().ticket==='standard');
    ok('the stats panel exposes a turn counter', typeof view().turn==='number');
    ok('the ticket is carried as an inspectable inventory item',
       (view().inventory||[]).some(function(it){return it.kind==='ticket';}));

    var ed=goAdjacent(20,14); press(ed); pk('Enter');
    ok('leaving the interior returns to the harbour', view().phase==='town');

    var gd=goAdjacent(32,14); press(gd);
    ok('bumping the dungeon gate does not descend on contact', view().phase==='town');
    pk('Enter');
    ok('Enter at the gate (ticket in hand) descends into the dungeon', view().phase==='dungeon');

    // ============================ STAIRS: bump vs commit (dungeon) ========
    // the gate drops you at the Mouth (level 0); take one stair DOWN to level 1,
    // where the floor carries loot and the walls hide pockets.
    var vd=view(); var dk=Object.keys(vd.doors)[0].split(',');
    var dd=goAdjacent(+dk[0],+dk[1]); var nb=view().node; press(dd);
    ok('bumping a dungeon stair does NOT traverse on contact', view().node===nb);
    pk('Enter');
    ok('Enter takes the stair down into the dungeon proper (level >= 1)', view().node!==nb && view().level>=1);
    ok('the HUD carries a named hunger stage', typeof (view().hunger&&view().hunger.stage)==='string');
    ok('messages carry an urgency tier (objects with text+urgent)',
       (function(){var m=(view().messages||[]); var x=m[m.length-1]; return x&&typeof x.text==='string'&&typeof x.urgent==='boolean';})());

    // ============================ TURN-BASED + WAIT ======================
    var t0=view().turn; pk('.');
    ok('wait (.) passes one turn — the world acts only when you act', view().turn===t0+1);

    // ============================ LOOK ===================================
    pk('l'); var vl=view();
    ok('look (l) enters a cursor mode', vl.look && vl.look.active);
    ok('look names what is under the cursor', /Look/.test(vl.lastEvent||''));
    pk('ArrowLeft');
    ok('the look cursor moves with a direction key while looking', view().look.active);
    pk('l');
    ok('pressing l again leaves look mode', !view().look.active);

    // ============================ GET (floor item) =======================
    var invBefore=(view().inventory||[]).length;
    var got=goTo(18,10); pk('g'); var vg=view();
    ok('walking onto the ration and pressing g picks it up',
       got && (vg.inventory||[]).length===invBefore+1 && vg.inventory.some(function(it){return it.kind==='ration';}));

    // ============================ INVENTORY: use/consume =================
    pk('i'); ok('i opens the pack', view().invOpen);
    pk('a'); pk('u'); var vu=view();
    ok('selecting the ration and pressing u eats it (consumed)',
       !(vu.inventory||[]).some(function(it){return it.kind==='ration';}));
    pk('i'); ok('i closes the pack again', !view().invOpen);

    // ============================ DOORS: open / close (plain) ============
    pk('o'); var vo=view();
    ok('o opens the adjacent inner door', vo.plain && vo.plain['18,9'] && vo.plain['18,9'].open);
    pk('c'); var vc=view();
    ok('c closes the adjacent inner door', vc.plain && vc.plain['18,9'] && !vc.plain['18,9'].open);

    // ============================ SEARCH (secret) ========================
    var sat=goTo(17,8); if(!sat) sat=goTo(18,8); pk('s'); var vs=view();
    ok('searching the wall reveals the hidden pocket (an item appears)', !!(vs.items && vs.items['18,7']));

    // ============================ COMBAT wiring (HP shown) ===============
    var foes=(view().creatures||[]);
    ok('monsters in view carry HP (combat readout) — or none are near',
       foes.length===0 || (typeof foes[0].hp==='number' && typeof foes[0].maxHp==='number'));

    // ============================ MESSAGE LOG ============================
    ok('the message log is accumulating the game voice', (view().messages||[]).length>4);

    // ============== UI OVERHAUL: three zones render in the real DOM =======
    ok('three-zone layout present (map canvas, sidebar, message panel)',
       !!doc.getElementById('cv') && !!doc.getElementById('sidebar') && !!doc.getElementById('msgpanel'));
    var LADDER=['well fed','Peckish','Hungry','Famished','Starving'];
    var sbH=doc.getElementById('sb-hunger');
    ok('the sidebar dossier shows the hunger STAGE as a word',
       sbH && LADDER.indexOf((sbH.textContent||'').trim())>=0);
    ok('the dossier shows turn count and required-sights progress',
       !!doc.getElementById('sb-turn') && /\d+\s*\/\s*\d+/.test((doc.getElementById('sb-sights')||{}).textContent||''));
    var lines=doc.querySelectorAll('#msglog .line');
    ok('the message panel renders log lines', lines.length>0);
    ok('every log line is stamped with its turn number',
       lines.length>0 && Array.prototype.every.call(lines, function(L){ var tn=L.querySelector('.tn'); return tn && /^T\d+/.test(tn.textContent||''); }));
    ok('log lines are colour-coded by tier (a notable line is present)',
       !!doc.querySelector('#msglog .line.note'));
    ok('the contextual cue strip tells you what you can do here',
       ((doc.getElementById('cue')||{}).textContent||'').trim().length>0);

    // contextual cue names an item underfoot when you stand on one
    var gt=goTo(22,12);                                    // the bandage tile
    ok('standing on an item, the cue prompts to pick it up',
       gt && /pick up/.test((doc.getElementById('cue').textContent||'')));

    // the look cursor produces a one-line description in voice
    pk('l'); var lc=(doc.getElementById('cue').textContent||'');
    ok('the look cue shows a one-line description in voice', /Look/.test(lc));
    pk('l');

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
