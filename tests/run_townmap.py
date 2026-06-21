#!/usr/bin/env python3
"""TD_TOWNMAP — the FIXED authored town map with RANDOMIZED tenants.

Proves the defining model: the LAYOUT is fixed (same bones every seed), only the
ASSIGNMENT of businesses to building slots is dealt per seed, within district +
size constraints; fixed landmarks never move; the dungeon entrance is always
reachable from the gate. Runs in headless Chrome against the real engine module.

Run:  python tests/run_townmap.py
"""
import html
import os
import re
import shutil
import subprocess
import sys
import tempfile

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, "engine")
TMPDIR = os.path.join(ROOT, "tests", ".tmp")
ENGINE_FILES = ["townlaws.js", "townmap.js"]
CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]

REPORTER = r"""
<script>
(function(){
  var out = document.getElementById('out'); var R = [], fails = 0;
  function ok(n,c,d){ R.push((c?'PASS ':'FAIL ')+n+(d?('  ::  '+d):'')); if(!c)fails++; }
  try {
    var TM = TD_TOWNMAP, GL = TM.GLYPH;
    var a = TM.generate(1), b = TM.generate(2), a2 = TM.generate(1);
    ok('loads as the authored fixed map', a && a.source==='townmap' && a.w===TM.MAP.w && a.h===TM.MAP.h,
       a ? (a.w+'x'+a.h+' source='+a.source) : 'MISSING');

    // FIXED BONES: the glyph map is identical across many seeds
    var bonesA = a.grid.join('\n'), same = true;
    [2,3,7,11,42,1234,99999].forEach(function(s){ if(TM.generate(s).grid.join('\n')!==bonesA) same=false; });
    ok('bones IDENTICAL across all seeds (fixed authored map)', same);
    ok('deterministic per seed', JSON.stringify(a.fronts)===JSON.stringify(a2.fronts));

    // RANDOMIZED TENANTS: assignment turns over between seeds
    function tk(g){ return g.fronts.map(function(f){return f.x+','+f.y+':'+f.business;}).sort().join('|'); }
    ok('tenants TURN OVER across seeds', tk(a)!==tk(b), a.fronts.length+' fronts/seed');

    // CONSTRAINTS: vice only in red-light (bodega may also sit in market); warehouse
    // trades only in the warehouse; uniques at most one; uniques always present.
    var viol = [], seeds = [1,2,3,7,11,42,101,202,777,2024];
    var present = { bank:0, hotel:0, customs:0, agency:0 };   // GATE FIX — the Agency is a guaranteed anchor too
    var agencyRoleBad = 0;
    seeds.forEach(function(s){
      var g = TM.generate(s), uc = {};
      g.fronts.forEach(function(f){
        if (f.cat==='vice' && f.role!=='redlight' && f.business!=='bodega') viol.push('vice@'+f.role+'(s'+s+')');
        if ((f.business==='warehouse'||f.business==='chandlery'||f.business==='customs') && f.role!=='warehouse') viol.push(f.business+'@'+f.role);
        if (f.business==='agency' && f.role!=='civic' && f.role!=='market') agencyRoleBad++;   // R1: civic/market only
        uc[f.business]=(uc[f.business]||0)+1;
      });
      ['bank','hotel','customs','agency'].forEach(function(u){ if((uc[u]||0)>1) viol.push('dup-'+u+'='+uc[u]+'(s'+s+')'); if(uc[u]) present[u]++; });
    });
    ok('district + size constraints honoured (every seed)', viol.length===0, viol.slice(0,4).join(','));
    ok('anchor businesses ALWAYS present (bank, hotel, customs)',
       present.bank===seeds.length && present.hotel===seeds.length && present.customs===seeds.length,
       JSON.stringify(present)+' of '+seeds.length);
    // GATE FIX (R1) — the Tour Agency spawns EXACTLY ONCE every seed, in the civic/market district
    ok('the Tour Agency spawns exactly once EVERY seed (was unreachable)', present.agency===seeds.length, present.agency+' of '+seeds.length+' seeds');
    ok('the Agency front sits in the civic/market district', agencyRoleBad===0, agencyRoleBad+' off-district placements');

    // FRONT VALIDITY: each front sits on a building cell with a walkable street face
    function walkTag(t){ return t==='street'||t==='plaza'||t==='alley'||t==='pier'||t==='bridge'||t==='gate'||t==='dungeon'||t==='park'||t==='graveyard'||t==='landmark'||t==='notice'||t==='vendor'||t==='npc'||t==='kiosk'; }
    var badFront = 0;
    a.fronts.forEach(function(f){
      if (a.tag[f.y][f.x]!=='building') { badFront++; return; }
      var d4=[[0,-1],[0,1],[-1,0],[1,0]], faces=false;
      for(var i=0;i<4;i++){ var nx=f.x+d4[i][0], ny=f.y+d4[i][1]; if(ny>=0&&ny<a.h&&nx>=0&&nx<a.w&&walkTag(a.tag[ny][nx])) faces=true; }
      if(!faces) badFront++;
    });
    ok('every tenant front is a building face on a walkable street', badFront===0, badFront+' invalid fronts');

    // FIXED LANDMARKS present in the tag grid (park is advisory — an authored city may omit it)
    var have={}; for(var y=0;y<a.h;y++)for(var x=0;x<a.w;x++) have[a.tag[y][x]]=1;
    ok('fixed landmarks present (dungeon, gate, church, kiosk, bridge, pier, graveyard, water)',
       have.dungeon&&have.gate&&have.church&&have.kiosk&&have.bridge&&have.pier&&have.graveyard&&have.water);

    // CONTRAST GATE (TD_TOWNLAWS) over the installed city — the planned/grown city-ness check.
    // On an authored map the strict grown anti-grid is advisory (operator geometry is authoritative);
    // the declared planned/grown contrast and the planned order must hold.
    var TL = TD_TOWNLAWS.check(a), cl = TL.laws;
    ok('contrast gate: both planned + grown quarters present', cl.T_district_contrast.pass, cl.T_district_contrast.value);
    ok('contrast gate: planned quarters read ordered', cl.T_planned_order.pass, cl.T_planned_order.value);
    ok('contrast gate: grown anti-grid (advisory on authored)', cl.T16_antigrid.pass, cl.T16_antigrid.value);
    ok('contrast gate: grown crooked (advisory on authored)', cl.T_grown_crooked.pass, cl.T_grown_crooked.value);

    // REACHABILITY: the dungeon mouth is reachable from the gate over walkable tags
    var gate=null, dgn=null, kiosk=null;
    for(var y=0;y<a.h;y++)for(var x=0;x<a.w;x++){ var t=a.tag[y][x]; if(t==='gate')gate=[x,y]; if(t==='dungeon')dgn=[x,y]; if(t==='kiosk')kiosk=[x,y]; }
    function reach(sx,sy,tx,ty){ var q=[[sx,sy]],seen={}; seen[sx+','+sy]=1; var D=[[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]];
      while(q.length){ var c=q.shift(); if(c[0]===tx&&c[1]===ty)return true;
        for(var i=0;i<8;i++){ var nx=c[0]+D[i][0],ny=c[1]+D[i][1],k=nx+','+ny; if(seen[k])continue; if(ny<0||ny>=a.h||nx<0||nx>=a.w)continue; if(!walkTag(a.tag[ny][nx]))continue; seen[k]=1; q.push([nx,ny]); } }
      return false; }
    ok('the dungeon entrance is reachable from the city gate', gate&&dgn&&reach(gate[0],gate[1],dgn[0],dgn[1]),
       'gate='+gate+' dungeon='+dgn);
    ok('the admission kiosk is reachable from the gate (findable beside the mouth)',
       gate&&kiosk&&reach(gate[0],gate[1],kiosk[0],kiosk[1]), 'kiosk='+kiosk);

    out.textContent = R.join('\n') + '\nSUMMARY ' + (R.length-fails) + '/' + R.length;
    document.title = 'TOWNMAP fail=' + fails;
  } catch (e) { out.textContent = 'HARNESS_ERROR ' + (e&&e.stack?e.stack:e); document.title = 'TOWNMAP harness_error'; }
})();
</script>
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
    parts = ['<!doctype html><html><head><meta charset="utf-8"><title>pending</title></head>', '<body><pre id="out">pending</pre>']
    for fn in ENGINE_FILES:
        with open(os.path.join(ENGINE, fn), "r", encoding="utf-8") as f:
            parts.append("<script>\n" + f.read() + "\n</script>")
    parts.append(REPORTER)
    parts.append("</body></html>")
    os.makedirs(TMPDIR, exist_ok=True)
    runner = os.path.join(TMPDIR, "townmap_runner.html")
    with open(runner, "w", encoding="utf-8") as f:
        f.write("\n".join(parts))
    user_data = tempfile.mkdtemp(prefix="td_townmap_")
    url = "file:///" + runner.replace("\\", "/")
    cmd = [chrome, "--headless", "--disable-gpu", "--no-sandbox", "--user-data-dir=" + user_data, "--dump-dom", url]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=120)
    finally:
        shutil.rmtree(user_data, ignore_errors=True)
    dom = proc.stdout.decode("utf-8", "replace")
    title = (re.search(r"<title>(.*?)</title>", dom, re.DOTALL) or [None, ""])[1]
    m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.DOTALL)
    report = html.unescape(m.group(1)) if m else "(no output)\n" + dom[:1500]
    print(report)
    print("-" * 60)
    fm = re.search(r"fail=(\d+)", title)
    if "harness_error" in title or not fm:
        print("RESULT: HARNESS ERROR")
        return 2
    fails = int(fm.group(1))
    print("RESULT: {} failed".format(fails))
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
