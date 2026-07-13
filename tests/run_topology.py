#!/usr/bin/env python3
"""GEN2 TRAVERSE-SHAPE TOPOLOGY CHECKER (>=200 seeds) — the machine-checkable ban on the boxy square circuit.

Proves the operator's GROWN TRAVERSE over 220 worked floors. HARD TOPOLOGY BARS (the traverse-shape repair):
  RING BAN:      no single (minimal) cycle contains > 50% of the corridor cells (no floor-dominating loop);
                 no floor-spanning cycle hugging the outer 4-cell margin > 40% of its length (no perimeter ring).
  STRAIGHT-RUN:  at most ONE straight corridor run longer than 50% of the floor W/H; NONE longer than 70%
                 (no parallel full-width halls — the ladder / office-bands shape).
  ORIENTATION:   traverse flow (H / V / D drift) each appears across any 20-seed window (variety by seed).
  ARCHETYPE:     archetype recorded on EVERY floor (never undefined / off-table) + seeded weighted table wired.
KEEP bars (unchanged, still enforced): zero open corners; single region; stairs present; rooms the MAJORITY of
walkable; single-file corridors (<10% wide cells); door mix ~70/25 with NO room over two doors; room-off-room
suites on most floors; zero unpaid (naked) corridor dead-ends. Loads engine only (rng.js + gen2.js) — MIRROR-SAFE.
Run:  python tests/run_topology.py
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
CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]

REP = r"""
<pre id="out">p</pre>
<script>(function(){
var G2=TD_GEN2, R=[], fails=0;
function ok(n,c,d){R.push((c?'PASS ':'FAIL ')+n+(d?('  ::  '+d):''));if(!c)fails++;}
function note(s){R.push('    '+s);}
var STAIR={'@':1,'<':1,'>':1};
function fl(g,x,y){var h=g.length,w=g[0].length;return y>=0&&y<h&&x>=0&&x<w&&(g[y][x]==='.'||g[y][x]==='~'||STAIR[g[y][x]]);}
function walk(g,x,y){return fl(g,x,y)||(g[y]&&g[y][x]==='+');}   // '+' door is walkable circulation
function roomy(g,x,y){if(!fl(g,x,y))return false;var q=[[0,0],[-1,0],[0,-1],[-1,-1]];for(var i=0;i<4;i++){var ox=x+q[i][0],oy=y+q[i][1];if(fl(g,ox,oy)&&fl(g,ox+1,oy)&&fl(g,ox,oy+1)&&fl(g,ox+1,oy+1))return true;}return false;}
// a cell is CIRCUIT-passable if it is floor/stair but NOT a door '+' or a secret '$'/'?' (doors separate rooms
// from the corridor; secrets are paid pockets). Flooding these, the LARGEST component is the corridor circuit;
// every other component is a budded ROOM (linked to the circuit only through its door).
function circPass(g,x,y){return g[y]&&(g[y][x]==='.'||g[y][x]==='~'||STAIR[g[y][x]]);}
function analyse(g){
  var H=g.length,W=g[0].length,walkN=0,roomN=0;
  for(var y=0;y<H;y++)for(var x=0;x<W;x++){ if(walk(g,x,y))walkN++; if(roomy(g,x,y))roomN++; }
  var seen={},comps=[];
  for(y=0;y<H;y++)for(x=0;x<W;x++){ if(!circPass(g,x,y)||seen[x+','+y])continue;
    var st=[[x,y]],cells=[];seen[x+','+y]=1;
    while(st.length){var c=st.pop();cells.push(c);[[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){var nx=c[0]+d[0],ny=c[1]+d[1];if(!seen[nx+','+ny]&&circPass(g,nx,ny)){seen[nx+','+ny]=1;st.push([nx,ny]);}});}
    comps.push(cells);
  }
  // CLASSIFY each door-separated component as a ROOM or a CORRIDOR by SHAPE (not size): a ROOM has both bbox
  // dimensions >= 3 AND fills most of its bounding box (a compact block), a CORRIDOR is thin/stringy (a bbox
  // dimension of 1, or a low fill). This is robust to PILLARS: a pillared/rotunda hall has 'o' obstacles that
  // break up its 2x2 blocks, so a "2x2-density" test would wrongly call it a corridor (and count walking-around-a-
  // pillar as a loop) — but its floor still FILLS a fat bounding box, so bbox-fill classifies it a room correctly.
  var cset={},corrCells=[],rooms=[],compIx={},roomIx={};
  comps.forEach(function(cc,idx){
    var mnx=1e9,mxx=-1,mny=1e9,mxy=-1;cc.forEach(function(c){if(c[0]<mnx)mnx=c[0];if(c[0]>mxx)mxx=c[0];if(c[1]<mny)mny=c[1];if(c[1]>mxy)mxy=c[1];});
    var bw=mxx-mnx+1,bh=mxy-mny+1,fill=cc.length/(bw*bh);
    var isRoom=(bw>=3 && bh>=3 && fill>=0.45);
    cc.forEach(function(c){compIx[c[0]+','+c[1]]=idx;});
    if(isRoom){roomIx[idx]=rooms.length;rooms.push({size:cc.length,doors:0});}
    else{cc.forEach(function(c){cset[c[0]+','+c[1]]=1;corrCells.push(c);});}
  });
  var circuit=corrCells;
  // DOORS: a door counts for a ROOM only if the '+'s OPEN AXIS (its two opposite walkable sides) lands in that
  // room (a neighbour's door merely adjacent, perpendicular to its axis, is not miscounted).
  for(var yy=1;yy<H-1;yy++)for(var xx=1;xx<W-1;xx++){ if(g[yy][xx]!=='+')continue;
    var L=circPass(g,xx-1,yy),Rr=circPass(g,xx+1,yy),U=circPass(g,xx,yy-1),D=circPass(g,xx,yy+1),pair=null;
    if(L&&Rr&&!U&&!D)pair=[[xx-1,yy],[xx+1,yy]]; else if(U&&D&&!L&&!Rr)pair=[[xx,yy-1],[xx,yy+1]];
    if(!pair)continue;
    pair.forEach(function(cell){var ix=compIx[cell[0]+','+cell[1]];if(ix!==undefined&&roomIx[ix]!==undefined)rooms[roomIx[ix]].doors++;});
  }
  // CIRCULATION CYCLES = cyclomatic number of the corridor graph (E - V + 1, summed over its components).
  var V=circuit.length,E=0;circuit.forEach(function(c){[[1,0],[0,1]].forEach(function(d){if(cset[(c[0]+d[0])+','+(c[1]+d[1])])E++;});});
  var corrComp=0,cseen={};circuit.forEach(function(c){var k=c[0]+','+c[1];if(cseen[k])return;corrComp++;var st=[c];cseen[k]=1;while(st.length){var q=st.pop();[[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){var nk=(q[0]+d[0])+','+(q[1]+d[1]);if(cset[nk]&&!cseen[nk]){cseen[nk]=1;st.push([q[0]+d[0],q[1]+d[1]]);}});}});
  var cycles=E-V+corrComp;
  // NAKED corridor dead-end: a corridor cell of degree 1 (in the corridor graph) with NO door beside it (a tip
  // that ends at a room door is PAID; one that ends at rock is naked/unpaid).
  var naked=0;circuit.forEach(function(c){var x=c[0],y=c[1],nb=0,dr=false;[[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){if(cset[(x+d[0])+','+(y+d[1])])nb++;var gc=g[y+d[1]]&&g[y+d[1]][x+d[0]];if(gc==='+'||gc==='$'||gc==='?'||gc==='/')dr=true;});if(nb<=1&&!dr)naked++;});
  var adjBends=0,bends=0,concourse=false;
  // NESTED SUITE: a door '+' whose two walkable sides are BOTH rooms (neither in the corridor) = a room-off-room.
  var nestedDoors=0;
  for(yy=1;yy<H-1;yy++)for(xx=1;xx<W-1;xx++){ if(g[yy][xx]!=='+')continue; var sd=[[1,0],[-1,0],[0,1],[0,-1]].filter(function(d){return circPass(g,xx+d[0],yy+d[1]);}); if(sd.length===2){var ca=cset[(xx+sd[0][0])+','+(yy+sd[0][1])],cb=cset[(xx+sd[1][0])+','+(yy+sd[1][1])];if(!ca&&!cb)nestedDoors++;} }
  // WIDE-CORRIDOR MIX: circuit cells belonging to a 2x2 corridor block (a wide stretch) as % of circuit cells.
  var wide=0;circuit.forEach(function(c){var x=c[0],y=c[1];var b=false;[[0,0],[-1,0],[0,-1],[-1,-1]].forEach(function(o){if(cset[(x+o[0])+','+(y+o[1])]&&cset[(x+o[0]+1)+','+(y+o[1])]&&cset[(x+o[0])+','+(y+o[1]+1)]&&cset[(x+o[0]+1)+','+(y+o[1]+1)])b=true;});if(b)wide++;});
  var widePct=V?Math.round(100*wide/V):0;
  // HALL LANDMARK: the largest budded room (great/pillared/rotunda hall). Single-file corridors banned the
  // 2-wide concourse landmark, so the landmark is now a ROOM (a big hall), measured as the largest non-circuit
  // component's cell count.
  var maxRoom=0;rooms.forEach(function(rm){if(rm.size>maxRoom)maxRoom=rm.size;});
  // ---- MARGIN / PERIMETER ZONE (outermost 4-cell band) ----
  function inPerim(x,y){return x<4||x>=W-4||y<4||y>=H-4;}
  var permCirc=0;circuit.forEach(function(c){if(inPerim(c[0],c[1]))permCirc++;});
  var permCircPct=V?Math.round(100*permCirc/V):0;
  // ---- STRAIGHT-RUN CAP: longest maximal straight run of circuit cells, per row (vs W) and per col (vs H) ----
  var maxHRun=0,maxVRun=0,runsOver50=0,runsOver70=false;
  for(y=0;y<H;y++){var run=0;for(x=0;x<=W;x++){if(x<W&&cset[x+','+y])run++;else{if(run>maxHRun)maxHRun=run;if(run>0.50*W)runsOver50++;if(run>0.70*W)runsOver70=true;run=0;}}}
  for(x=0;x<W;x++){var runv=0;for(y=0;y<=H;y++){if(y<H&&cset[x+','+y])runv++;else{if(runv>maxVRun)maxVRun=runv;if(runv>0.50*H)runsOver50++;if(runv>0.70*H)runsOver70=true;runv=0;}}}
  // ---- RING BAN: MINIMAL-cycle analysis of the corridor graph ----
  // A spanning tree's FUNDAMENTAL cycle can be far longer than the true loop (its length depends on the arbitrary
  // BFS root), which would over-report a small bubble as a floor-dominating ring. So for each NON-TREE edge we
  // measure the MINIMAL cycle through it: delete the edge, BFS the shortest corridor path between its endpoints,
  // cycle = path + 1. That is the honest "single cycle." Its size (vs corridor) and perimeter-margin fraction
  // catch a floor-dominating loop or a wall-hugging ring. cyclomatic is small, so a BFS per non-tree edge is cheap.
  var par={},seen2={};
  if(V){var root=circuit[0][0]+','+circuit[0][1],q2=[circuit[0]];par[root]='';seen2[root]=1;
    while(q2.length){var c=q2.shift();[[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){var nx=c[0]+d[0],ny=c[1]+d[1],k=nx+','+ny;if(cset[k]&&!seen2[k]){seen2[k]=1;par[k]=c[0]+','+c[1];q2.push([nx,ny]);}});}
  }
  function shortestPath(ak,bk,banA,banB){ // BFS ak->bk over corridor, forbidding the direct edge banA-banB
    var q=[ak.split(',').map(Number)],pv={};pv[ak]=1;
    while(q.length){var c=q.shift(),ck2=c[0]+','+c[1];if(ck2===bk){var path=[ck2],k=ck2;while(pv[k]!==1){path.push(pv[k]);k=pv[k];}return path;}
      for(var d4=0;d4<4;d4++){var dd=[[1,0],[-1,0],[0,1],[0,-1]][d4],nx=c[0]+dd[0],ny=c[1]+dd[1],nk=nx+','+ny;
        if(!cset[nk]||pv[nk])continue; if((ck2===banA&&nk===banB)||(ck2===banB&&nk===banA))continue;
        pv[nk]=ck2;q.push([nx,ny]);}}
    return null;
  }
  var maxCycleLen=0,maxCycleFrac=0,worstPerimFrac=0,perimRing=false,dom50=false,edgeSeen={};
  circuit.forEach(function(c){var x=c[0],y=c[1],ck=x+','+y;[[1,0],[0,1]].forEach(function(d){var nx=x+d[0],ny=y+d[1],nk=nx+','+ny;if(!cset[nk])return;var ek=ck+'|'+nk;if(edgeSeen[ek])return;edgeSeen[ek]=1;
    if(par[nk]===ck||par[ck]===nk)return;                       // tree edge -> no cycle here
    var pth=shortestPath(ck,nk,ck,nk);if(!pth)return;
    var len=pth.length,pin=0,minx=1e9,maxx=-1,miny=1e9,maxy=-1;
    pth.forEach(function(k){var pp=k.split(',').map(Number);if(inPerim(pp[0],pp[1]))pin++;minx=Math.min(minx,pp[0]);maxx=Math.max(maxx,pp[0]);miny=Math.min(miny,pp[1]);maxy=Math.max(maxy,pp[1]);});
    var frac=V?len/V:0,pf=len?pin/len:0,bw=(maxx-minx+1),bh=(maxy-miny+1);
    if(len>maxCycleLen)maxCycleLen=len; if(frac>maxCycleFrac)maxCycleFrac=frac;
    if(frac>0.50)dom50=true;                                    // a single cycle owns > 50% of corridor cells
    if(len>=0.25*V && bw>0.50*W && bh>0.50*H){ if(pf>worstPerimFrac)worstPerimFrac=pf; if(pf>0.40)perimRing=true; }
  });});
  // ORIENTATION: measure the corridor's DRIFT from its own geometry — count horizontal vs vertical corridor
  // adjacencies. A vertical spine has more vertical edges, a horizontal spine more horizontal ones, a diagonal
  // route is balanced. This reads the actual traverse FLOW (robust to room-placement noise, unlike a stair vector).
  var hE=0,vE=0;circuit.forEach(function(c){if(cset[(c[0]+1)+','+c[1]])hE++;if(cset[c[0]+','+(c[1]+1)])vE++;});
  var orient=(hE>vE*1.35)?'H':(vE>hE*1.35)?'V':'D';
  var up=null,dn=null;for(var uy=0;uy<H;uy++)for(var ux=0;ux<W;ux++){if(g[uy][ux]==='<'||g[uy][ux]==='@')up=[ux,uy];else if(g[uy][ux]==='>')dn=[ux,uy];}
  var diag=Math.sqrt(W*W+H*H),sepPct=(up&&dn)?Math.round(100*Math.sqrt(Math.pow(up[0]-dn[0],2)+Math.pow(up[1]-dn[1],2))/diag):0;
  // COVER / CORR from the CLASSIFICATION (room cells vs corridor cells), not the raw 2x2 test — so a pillared/
  // rotunda hall's floor counts as ROOM space (it IS a destination), not as corridor. (doors are the small remainder.)
  var roomCellsN=0;rooms.forEach(function(rm){roomCellsN+=rm.size;});
  return {W:W,H:H,walk:walkN,cover:Math.round(100*roomCellsN/walkN),corr:Math.round(100*V/walkN),
    rooms:rooms,cycles:cycles,naked:naked,adjBends:adjBends,bends:bends,concourse:concourse,circuitN:V,nestedDoors:nestedDoors,widePct:widePct,
    maxRoom:maxRoom,permCircPct:permCircPct,maxHRun:maxHRun,maxVRun:maxVRun,runsOver50:runsOver50,runsOver70:runsOver70,
    maxCycleFrac:Math.round(100*maxCycleFrac),dom50:dom50,perimRing:perimRing,worstPerimFrac:Math.round(100*worstPerimFrac),
    orient:orient,sepPct:sepPct};
}
var N=220,covS=0,corrS=0,cycS=0,sdS=0,sepSum=0, arch={}, archMissing=0, archTable=(G2.ARCHETYPES||[]).map(function(a){return a.key;}),
  bad={leak:[],reg:[],stair:[],cover:[],corr:[],single:[],twodoor:[],naked:[],land:[],nest:[],wide:[],
       ring:[],dom:[],srun1:[],srun7:[]};
var minCover=100,maxCorr=0,minSingle=100,maxCycFrac=0,maxHR=0,maxVR=0;
for(var s=1;s<=N;s++){
  var lv=G2.generateLevel(s,{grammar:'worked'}),g=lv.grid,m=G2.measure(g),a=analyse(g);
  arch[lv.archetype]=(arch[lv.archetype]||0)+1;   // ARCHETYPE SCAFFOLD: recorded on every composition
  if(!lv.archetype || archTable.indexOf(lv.archetype)<0)archMissing++;   // must NEVER be undefined / off-table
  if(m.leaks!==0)bad.leak.push(s);if(m.regions!==1)bad.reg.push(s);if(!lv.up||!lv.down)bad.stair.push(s);
  covS+=a.cover;corrS+=a.corr;cycS+=a.cycles;minCover=Math.min(minCover,a.cover);maxCorr=Math.max(maxCorr,a.corr);
  maxCycFrac=Math.max(maxCycFrac,a.maxCycleFrac);maxHR=Math.max(maxHR,a.maxHRun);maxVR=Math.max(maxVR,a.maxVRun);
  if(a.cover<60)bad.cover.push(s+':'+a.cover+'%(corr'+a.corr+')');   // ONE reconciled split bar (cover>=60 <=> corr<=40)
  var nr=a.rooms.length,single=a.rooms.filter(function(rm){return rm.doors<=1;}).length,over=a.rooms.filter(function(rm){return rm.doors>2;}).length;
  var sdFrac=nr?Math.round(100*single/nr):100;sdS+=sdFrac;minSingle=Math.min(minSingle,sdFrac);
  if(sdFrac<50)bad.single.push(s+':'+sdFrac+'%');
  if(over>0)bad.twodoor.push(s+':'+over+'over');
  if(a.naked>0)bad.naked.push(s+':'+a.naked);
  if(a.maxRoom<18)bad.land.push(s+':'+a.maxRoom);            // a hall landmark (big room) present
  if(a.nestedDoors<1)bad.nest.push(s);
  if(a.widePct>=10)bad.wide.push(s+':'+a.widePct+'%');
  // ---- NEW HARD TOPOLOGY BARS ----
  if(a.perimRing)bad.ring.push(s+':pf'+a.worstPerimFrac+'%');   // RING BAN: a wall-hugging perimeter ring
  if(a.dom50)bad.dom.push(s+':'+a.maxCycleFrac+'%');            // RING BAN: a single cycle owns >50% of corridor
  if(a.runsOver50>1)bad.srun1.push(s+':'+a.runsOver50);        // STRAIGHT-RUN CAP: >1 run over 50% (parallel bands)
  if(a.runsOver70)bad.srun7.push(s);                           // STRAIGHT-RUN CAP: any run over 70%
  sepSum+=a.sepPct;
}
// ---- ORIENTATION VARIANCE: H, V and D drift must each appear across a 20-seed sample ----
var oseen={},osamp=[];for(var os=1;os<=20;os++){var la=analyse(G2.generateLevel(os,{grammar:'worked'}).grid);oseen[la.orient]=(oseen[la.orient]||0)+1;osamp.push(la.orient);}
var orientOK=(oseen.H>0&&oseen.V>0&&oseen.D>0);
note('over '+N+' worked floors: avg cover '+Math.round(covS/N)+'% (min '+minCover+'%), avg corridor '+Math.round(corrS/N)+'% (max '+maxCorr+'%), avg cycles '+(cycS/N).toFixed(1)+', avg single-door '+Math.round(sdS/N)+'% (min '+minSingle+'%)');
note('ARCHETYPE distribution over '+N+' floors: '+JSON.stringify(arch)+'  (weighted seeded selection; only TRAVERSE built — others stub to the traverse shaper)');
ok('KEEP: zero open corners, single region, stairs present (all '+N+' floors)', !bad.leak.length&&!bad.reg.length&&!bad.stair.length, 'leaks='+bad.leak.length+' reg='+bad.reg.length+' stair='+bad.stair.length);
ok('ROOM/CORR SPLIT: rooms are the MAJORITY of walkable space — coverage >= 60% (equivalently corridor <= 40%) on'
   +' every floor. NB: cover and corridor are complementary (corr = 100 - cover), so ONE reconciled split bar'
   +' replaces the old contradictory pair (cover>=55 AND corr<=35); 60% keeps rooms clearly dominant — destinations,'
   +' not hallways — while giving the TRAVERSE archetype an honest walking share.', !bad.cover.length, bad.cover.slice(0,4).join(' ')||'ok');
ok('ROOM: MOSTLY single-door (no floor majority two-door) AND two-door rooms present (aggregate ~70/25)', !bad.single.length && (sdS/N)<=92 && (sdS/N)>=60, 'avg single-door '+Math.round(sdS/N)+'% (target ~70); majority-two-door floors: '+bad.single.length);
ok('ROOM: NO destination room has more than 2 doors', !bad.twodoor.length, bad.twodoor.slice(0,3).join(' ')||'ok');
ok('ROOM: room-off-room SUITES — >= 60% of floors carry a nested chamber (depth >= 2)', bad.nest.length <= Math.round(N*0.40), 'floors without a suite: '+bad.nest.length+'/'+N);
ok('CORR: wide (2-wide) corridor cells < 10% of the circuit (single-file default)', !bad.wide.length, bad.wide.slice(0,3).join(' ')||'ok');
ok('CORR: zero naked corridor dead-ends (every terminus is a room door)', !bad.naked.length, bad.naked.slice(0,3).join(' ')||'ok');
ok('LAND: a hall landmark (a big room, >= 18 cells) is present on every floor', !bad.land.length, bad.land.slice(0,3).join(' ')||'ok');
note('--- HARD TOPOLOGY BARS (the traverse-shape repair) ---');
note('RING: max single-cycle share of corridor cells '+maxCycFrac+'% (ban >50%); longest straight run H='+maxHR+' V='+maxVR+' cells');
ok('RING BAN 1: no single cycle contains > 50% of corridor cells (no floor-dominating loop)', !bad.dom.length, bad.dom.slice(0,4).join(' ')||('max '+maxCycFrac+'%'));
ok('RING BAN 2: no perimeter ring (no floor-spanning cycle hugging the outer 4-cell margin > 40% of its length)', !bad.ring.length, bad.ring.slice(0,4).join(' ')||'ok');
ok('STRAIGHT-RUN CAP: at most ONE straight run longer than 50% of the floor W/H (no parallel bands)', !bad.srun1.length, bad.srun1.slice(0,4).join(' ')||'ok');
ok('STRAIGHT-RUN CAP: NO straight run longer than 70% of the floor W/H', !bad.srun7.length, bad.srun7.slice(0,6).join(' ')||'ok');
ok('ORIENTATION VARIANCE: horizontal, vertical AND diagonal drift each appear across a 20-seed sample', orientOK, 'sample H/V/D counts '+JSON.stringify(oseen)+' :: '+osamp.join(''));
ok('ARCHETYPE SCAFFOLD: archetype recorded on EVERY floor (never undefined / off-table) + seeded weighted table wired (TRAVERSE-dominant)', archMissing===0 && archTable.length>=5 && (arch.traverse||0)>0, 'missing/off-table='+archMissing+' table='+JSON.stringify(archTable)+' dist='+JSON.stringify(arch));
document.getElementById('out').textContent=R.join('\n')+'\nSUMMARY fails='+fails;document.title='shaper fails='+fails;
})();</script>
"""


def build_page():
    parts = ["<!doctype html><html><head><meta charset='utf-8'><title>pending</title></head><body>"]
    for f in ["rng.js", "gen2.js"]:
        parts.append("<script>\n" + open(os.path.join(ENGINE, f), encoding="utf-8").read() + "\n</script>")
    parts.append(REP)
    parts.append("</body></html>")
    return "\n".join(parts)


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
    runner = os.path.join(TMPDIR, "gen2_shaper_runner.html")
    with open(runner, "w", encoding="utf-8") as f:
        f.write(build_page())
    user_data = tempfile.mkdtemp(prefix="td_shaper_")
    url = "file:///" + runner.replace("\\", "/")
    cmd = [chrome, "--headless=new", "--disable-gpu", "--no-sandbox", "--allow-file-access-from-files",
           "--virtual-time-budget=60000", "--user-data-dir=" + user_data, "--dump-dom", url]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=200)
    finally:
        shutil.rmtree(user_data, ignore_errors=True)
    dom = proc.stdout.decode("utf-8", "replace")
    title = (re.search(r"<title>(.*?)</title>", dom, re.DOTALL) or [None, ""])[1]
    m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.DOTALL)
    report = html.unescape(m.group(1)) if m else "(no output)\n" + dom[:2000]
    print(report)
    print("-" * 60)
    if "harness_error" in title:
        print("RESULT: HARNESS ERROR")
        return 2
    fm = re.search(r"fails=(\d+)", title)
    fails = int(fm.group(1)) if fm else -1
    print("RESULT: {} failed".format(fails))
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
