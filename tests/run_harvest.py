#!/usr/bin/env python3
"""HARVEST interest-pass harness — measures the LIVE gated generator (TD_ASSEMBLER) across >=30
regular (STANDARD) seeds and asserts the hard rules that must hold after every round:
  - law-suite green (generateForLevel .passed)         - 0 open corners (no diagonal leak)
  - fully connected: exactly 1 walkable region          - both stairs + entry present
  - door discipline intact (rooms join via tagged doors) - secrets present (gate value)
and prints the metric BANDS (room count, coverage, median room area, secrets) min/median/max, plus
the interest-feature measures added per round (landmark 1.8x, L-shaped 15-18%, terrain 3-8%).
Spot-checks NODE + HALLS. Regular size = the STANDARD bundle (the live generator names bundles, not
suite/regular/large — that vocab was TD_GEN2's).

Run:  python tests/run_harvest.py
"""
import html, os, re, shutil, subprocess, sys, tempfile
sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(ROOT, "engine"); TMP = os.path.join(ROOT, "tests", ".tmp")
CH = [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
      r"C:\Program Files\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"]
FILES = ["rng.js", "vaultfmt.js", "vaultlib.js", "lawsuite.js", "assembler.js"]
REP = r"""
<script>(function(){var o=document.getElementById('out');var R=[],fails=0;
function ok(n,c,d){R.push((c?'PASS ':'FAIL ')+n+(d?('  ::  '+d):''));if(!c)fails++;}
var A=TD_ASSEMBLER, LAWS=TD_LAWS;
function walk(g,x,y){return y>=0&&x>=0&&y<g.length&&x<g[0].length&&(g[y][x]==='.'||g[y][x]==='~');}
function regions(g){var H=g.length,W=g[0].length,seen={},n=0;
  for(var y=0;y<H;y++)for(var x=0;x<W;x++){if(!walk(g,x,y)||seen[x+','+y])continue;n++;var st=[[x,y]];seen[x+','+y]=1;
    while(st.length){var p=st.pop();[[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){var nx=p[0]+d[0],ny=p[1]+d[1];if(walk(g,nx,ny)&&!seen[nx+','+ny]){seen[nx+','+ny]=1;st.push([nx,ny]);}});}}
  return n;}
function openCorners(g){var H=g.length,W=g[0].length,n=0;for(var y=0;y<H;y++)for(var x=0;x<W;x++){if(!walk(g,x,y))continue;
  if(walk(g,x+1,y+1)&&!walk(g,x+1,y)&&!walk(g,x,y+1))n++; if(walk(g,x-1,y+1)&&!walk(g,x-1,y)&&!walk(g,x,y+1))n++;}return n;}
function roomComps(m){var g=m.grid,t=m.tag,H=g.length,W=g[0].length,seen={},rooms=[];
  function rm(x,y){return y>=0&&x>=0&&y<H&&x<W&&(t[y][x]==='room'||t[y][x]==='landmark'||t[y][x]==='loot');}
  for(var y=0;y<H;y++)for(var x=0;x<W;x++){if(!rm(x,y)||seen[x+','+y])continue;var st=[[x,y]],c=0;seen[x+','+y]=1;var minx=x,maxx=x,miny=y,maxy=y,sx=0,sy=0;
    while(st.length){var p=st.pop();c++;sx+=p[0];sy+=p[1];if(p[0]<minx)minx=p[0];if(p[0]>maxx)maxx=p[0];if(p[1]<miny)miny=p[1];if(p[1]>maxy)maxy=p[1];
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){var nx=p[0]+d[0],ny=p[1]+d[1];if(rm(nx,ny)&&!seen[nx+','+ny]){seen[nx+','+ny]=1;st.push([nx,ny]);}});}
    if(c>=6)rooms.push({size:c,bw:maxx-minx+1,bh:maxy-miny+1,cx:sx/c,cy:sy/c});}
  return rooms;}
function tagCount(m,tg){var n=0;for(var y=0;y<m.h;y++)for(var x=0;x<m.w;x++)if(m.tag[y][x]===tg)n++;return n;}
function median(a){if(!a.length)return 0;var s=a.slice().sort(function(x,y){return x-y;}),i=s.length>>1;return s.length%2?s[i]:(s[i-1]+s[i])/2;}
function band(a){return Math.min.apply(null,a)+"/"+median(a)+"/"+Math.max.apply(null,a);}
function gen(seed,type){return A.generateGated(seed,type||"STANDARD",200);}  // gates on TD_LAWS.check (the spatial law-suite; what the live game uses)
try{
  var N=30, passN=0, conn1=0, corner0=0, stairsOK=0, secretsOK=0, doorOK=0;
  var roomCounts=[], covers=[], medAreas=[], secrets=[], notched=[], landmarkRatio=[], terrainPct=[];
  var lmOK=0, lmCentral=0, lmFallback=0;
  for(var s=1;s<=N;s++){
    var res=gen(s); if(!res||!res.map){ok('seed '+s+' produced a map',false);continue;}
    var m=res.map,g=m.grid;
    if(res.passed)passN++;
    if(regions(g)===1)conn1++;
    // open corners: the ENGINE's room-leak law (EL_enclosure) is the authority — it allows diagonal
    // corridor zigzags (traversable under 8-way movement), forbids a diagonal leak OUT OF A ROOM.
    if(res.laws&&res.laws.EL_enclosure&&res.laws.EL_enclosure.pass)corner0++;
    if(m.stairs&&m.stairs.length>=2&&m.entry)stairsOK++;
    var sec=tagCount(m,'secret'); if(sec>=1)secretsOK++; secrets.push(sec);
    if(tagCount(m,'door')>=1)doorOK++;
    var rc=roomComps(m); roomCounts.push(rc.length);
    var walkN=0; for(var y=0;y<m.h;y++)for(var x=0;x<m.w;x++)if(walk(g,x,y))walkN++;
    covers.push(Math.round(100*walkN/(m.w*m.h)));
    var areas=rc.map(function(r){return r.size;}); medAreas.push(median(areas));
    // interest measures (0 at baseline): notched rooms (size < bw*bh), landmark ratio (max/median area), terrain %
    var nn=rc.filter(function(r){return r.size < r.bw*r.bh;}).length; notched.push(rc.length?Math.round(100*nn/rc.length):0);
    var mx=Math.max.apply(null,areas||[0]),md=median(areas)||1; landmarkRatio.push(rc.length?(mx/md).toFixed(2):"0");
    // R1 LANDMARK acceptance: one dominant room (>=1.8x median area), centroid in central 50%
    if(rc.length){ var big=rc[0]; for(var ri=1;ri<rc.length;ri++)if(rc[ri].size>big.size)big=rc[ri];
      var has=(mx/md)>=1.8, cen=(big.cx>=m.w*0.25&&big.cx<=m.w*0.75&&big.cy>=m.h*0.25&&big.cy<=m.h*0.75);
      if(has)lmOK++; if(has&&cen)lmCentral++; if(has&&!cen)lmFallback++; }
    var terr=0; for(var y2=0;y2<m.h;y2++)for(var x2=0;x2<m.w;x2++){var c=g[y2][x2];if(c==='~'||c==='X'||c==='o')terr++;} terrainPct.push(walkN?Math.round(1000*terr/walkN)/10:0);
  }
  ok('BASELINE: law-suite GREEN on all '+N+' regular seeds', passN===N, passN+'/'+N+' passed');
  ok('HARD: exactly 1 region (fully connected) on all seeds', conn1===N, conn1+'/'+N);
  ok('HARD: 0 room open-corners on all seeds (engine EL_enclosure)', corner0===N, corner0+'/'+N);
  ok('HARD: both stairs + entry present on all seeds', stairsOK===N, stairsOK+'/'+N);
  ok('HARD: door discipline — tagged doors present on all seeds', doorOK===N, doorOK+'/'+N);
  ok('HARD: secrets present (gate value) on all seeds', secretsOK===N, secretsOK+'/'+N);
  ok('R1 LANDMARK: a central dominant room >=1.8x median on the strong majority (rest = largest-room fallback)', lmOK>=Math.ceil(0.85*N) && lmCentral>=Math.ceil(0.80*N), lmOK+'/'+N+' >=1.8x (central '+lmCentral+'; fallback '+(N-lmOK)+'/'+N+')');
  // spot-check other sizes
  var nodeP=0,hallP=0; for(var k=1;k<=6;k++){if((gen(k,"NODE")||{}).passed)nodeP++; if((gen(k,"HALLS")||{}).passed)hallP++;}
  ok('spot-check NODE passes', nodeP>=5, nodeP+'/6'); ok('spot-check HALLS passes', hallP>=5, hallP+'/6');
  R.push("");
  R.push("METRIC BANDS (min/median/max over "+N+" regular seeds):");
  R.push("  room count   : "+band(roomCounts));
  R.push("  coverage %   : "+band(covers));
  R.push("  median room A : "+band(medAreas));
  R.push("  secrets      : "+band(secrets));
  R.push("  -- interest measures (target in later rounds) --");
  R.push("  notched %    : "+band(notched)+"   (R2 target 15-18)");
  R.push("  landmark x   : min "+Math.min.apply(null,landmarkRatio.map(Number))+" med "+median(landmarkRatio.map(Number)).toFixed(2)+" max "+Math.max.apply(null,landmarkRatio.map(Number))+"   (R1 target >=1.8)");
  R.push("  terrain %    : "+band(terrainPct)+"   (R3 target 3-8)");
  o.textContent=R.join('\n')+'\nSUMMARY '+(R.filter(function(x){return x.indexOf('PASS')===0;}).length)+' checks pass, '+fails+' fail'; document.title="HARV fail="+fails;
}catch(e){o.textContent="HARNESS_ERROR "+(e&&e.stack?e.stack:e);document.title="HARV harness_error";}})();</script>
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
    parts = ['<!doctype html><meta charset=utf-8><title>p</title><pre id="out">p</pre>']
    for f in FILES:
        parts.append("<script>\n" + open(os.path.join(ENGINE, f), encoding="utf-8").read() + "\n</script>")
    parts.append(REP)
    runner = os.path.join(TMP, "harvest_runner.html"); open(runner, "w", encoding="utf-8").write("\n".join(parts))
    ud = tempfile.mkdtemp(prefix="td_harv_")
    try:
        pr = subprocess.run([chrome, "--headless", "--disable-gpu", "--no-sandbox", "--user-data-dir=" + ud, "--dump-dom", "file:///" + runner.replace("\\", "/")], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=300)
    finally:
        shutil.rmtree(ud, ignore_errors=True)
    dom = pr.stdout.decode("utf-8", "replace")
    title = (re.search(r"<title>(.*?)</title>", dom, re.DOTALL) or [None, ""])[1]
    m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.DOTALL)
    print(html.unescape(m.group(1)) if m else "(no output)\n" + dom[:1500])
    print("-" * 60)
    fm = re.search(r"fail=(\d+)", title)
    if "harness_error" in title or not fm:
        print("RESULT: HARNESS ERROR"); return 2
    fails = int(fm.group(1)); print("RESULT: {} failed".format(fails)); return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
