"use strict";
// Tourist Dungeon engine — TD_GEN2: validated multi-grammar floor generator.
// generateLevel(seed,{size,grammar,skin}) -> {grid,w,h,up:{x,y},down:{x,y}}.
// worked grammar is production-quality; cave/spine/warren are rough drafts.
var TD_GEN2 = (function () {
// ---------- RNG ----------
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function ri(r,a,b){return a+Math.floor(r()*(b-a+1));}
// ---------- grid helpers ----------
function fill(W,H,ch){var g=[];for(var y=0;y<H;y++){var r=[];for(var x=0;x<W;x++)r.push(ch);g.push(r);}return g;}
function inb(G,x,y){return y>=0&&y<G.length&&x>=0&&x<G[0].length;}
var WALK={".":1,"+":1,"?":1,"$":1,"@":1,">":1,"<":1,"~":1};   // '<' (up-stair) IS walkable like '>' — without it measure() counted PHANTOM open corners at the up-stair (the live render walks it), making the leak gate reseed clean floors
function wk(G,x,y){return inb(G,x,y)&&!!WALK[G[y][x]];}

// ---------- WORKED ----------
function carveX(G,x0,x1,y){var s=x1>x0?1:-1;for(var x=x0;x!==x1+s;x+=s)if(inb(G,x,y)&&G[y][x]==='#')G[y][x]='.';}
function carveY(G,y0,y1,x){var s=y1>y0?1:-1;for(var y=y0;y!==y1+s;y+=s)if(inb(G,x,y)&&G[y][x]==='#')G[y][x]='.';}
// Seal every diagonal pinch (open corner): two floor cells touching only at a corner, with both shared
// orthogonal neighbours wall. Carving one of those neighbours to floor fills the pinch. A carve can birth a
// new pinch, so iterate to a FIXED POINT (raised cap — the winding-corridor logic creates more pinches than
// the old straight halls). ZERO open corners is a HARD guardrail, so this must converge to none.
function fixLeaks(G){
  var W=G[0].length,H=G.length;
  for(var iter=0;iter<40;iter++){var changed=false;
    for(var y=0;y<H-1;y++)for(var x=0;x<W;x++){
      if(x+1<W&&wk(G,x,y)&&wk(G,x+1,y+1)&&!wk(G,x+1,y)&&!wk(G,x,y+1)){G[y][x+1]='.';changed=true;}
      if(x-1>=0&&wk(G,x,y)&&wk(G,x-1,y+1)&&!wk(G,x-1,y)&&!wk(G,x,y+1)){G[y][x-1]='.';changed=true;}
    }
    if(!changed)break;
  }
}
function carveL(G,a,b,r){if(r()<0.5){carveX(G,a.cx,b.cx,a.cy);carveY(G,a.cy,b.cy,b.cx);}else{carveY(G,a.cy,b.cy,a.cx);carveX(G,a.cx,b.cx,b.cy);}}
function carveConnect(G,a,b,r){
  var ox0=Math.max(a.x,b.x),ox1=Math.min(a.x+a.w-1,b.x+b.w-1);
  var oy0=Math.max(a.y,b.y),oy1=Math.min(a.y+a.h-1,b.y+b.h-1),wide=r()<0.22;
  if(ox1>=ox0){var cx=ox1>ox0?ri(r,ox0,ox1):ox0;carveY(G,a.cy,b.cy,cx);if(wide&&cx+1<=ox1)carveY(G,a.cy,b.cy,cx+1);}
  else if(oy1>=oy0){var cy=oy1>oy0?ri(r,oy0,oy1):oy0;carveX(G,a.cx,b.cx,cy);if(wide&&cy+1<=oy1)carveX(G,a.cx,b.cx,cy+1);}
  else carveL(G,a,b,r);
}
// R1 — a WINDING corridor between two rooms: instead of one straight run or a single elbow, carve through
// 1-2 jittered waypoints so the hall bends and wanders (longer passages, more turns -> labyrinth feel).
// Each segment is an L (one bend); chained they read as a dog-legging corridor. fixLeaks() runs afterward
// (in generateLevel) so the extra diagonal pinches a winding hall creates are still sealed (zero open corners).
function windingConnect(G,a,b,r){
  var W=G[0].length,H=G.length,pts=[{cx:a.cx,cy:a.cy}],segs=ri(r,2,3);   // R2: 2-3 jittered waypoints -> more bends, longer halls
  for(var i=1;i<=segs;i++){
    var t=i/(segs+1);
    var mx=Math.round(a.cx+(b.cx-a.cx)*t)+ri(r,-8,8),my=Math.round(a.cy+(b.cy-a.cy)*t)+ri(r,-7,7);
    pts.push({cx:Math.max(1,Math.min(W-2,mx)),cy:Math.max(1,Math.min(H-2,my))});
  }
  pts.push({cx:b.cx,cy:b.cy});
  for(var p=0;p<pts.length-1;p++)carveL(G,pts[p],pts[p+1],r);
}
// R2 — DEAD-END SPURS: winding corridor branches that start on existing floor and wander out to a dead end.
// They add passage tiles (no rooms), deepening the maze. fixLeaks seals any pinches; ensureConnected keeps
// one region (a spur is attached to the floor it springs from). Count scales with floor area.
function carveSpurs(G,r){
  var W=G[0].length,H=G.length,floor=[];
  // would carving (x,y) to floor COMPLETE an all-floor 2x2? If so it reads as 'room', not corridor — skip,
  // so spurs stay strictly 1-wide tendrils (counted as passage, raising the hallway:room ratio).
  function makes2x2(x,y){for(var c=0;c<4;c++){var ox=(c&1)?-1:1,oy=(c&2)?-1:1;if(wk(G,x+ox,y)&&wk(G,x,y+oy)&&wk(G,x+ox,y+oy))return true;}return false;}
  for(var y=2;y<H-2;y++)for(var x=2;x<W-2;x++)if(G[y][x]==='.')floor.push([x,y]);
  if(!floor.length)return;
  var n=Math.round(W*H/68);   // moderate dead-end tendrils — maze depth without a 1-tile grind
  for(var s=0;s<n;s++){
    var st=floor[ri(r,0,floor.length-1)],cx=st[0],cy=st[1],len=ri(r,6,14),dir=ri(r,0,3);
    for(var k=0;k<len;k++){
      if(r()<0.45)dir=ri(r,0,3);                                  // wander
      var dx=(dir===2)?-1:(dir===3)?1:0, dy=(dir===0)?-1:(dir===1)?1:0;
      var nx=cx+dx,ny=cy+dy; if(nx<1||nx>W-2||ny<1||ny>H-2)break;
      if(G[ny][nx]==='#'){ if(makes2x2(nx,ny))break; G[ny][nx]='.'; }   // carve a 1-wide tendril; stop before it widens into a 2x2
      cx=nx; cy=ny;
    }
  }
}
function addPillars(G,rooms,r){
  rooms.forEach(function(rm){
    if(rm.w>=8&&rm.h>=6&&r()<0.55){
      for(var y=rm.y+2;y<rm.y+rm.h-2;y+=2)for(var x=rm.x+2;x<rm.x+rm.w-2;x+=2)if(G[y][x]==='.')G[y][x]='o';
    }
  });
}
function ensureConnected(G){
  var W=G[0].length,H=G.length;
  for(var iter=0;iter<300;iter++){
    var seen=fill(W,H,0),comps=[];
    for(var y=0;y<H;y++)for(var x=0;x<W;x++)if(wk(G,x,y)&&!seen[y][x]){var st=[[x,y]],c=[];seen[y][x]=1;while(st.length){var p=st.pop();c.push(p);[[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){var nx=p[0]+d[0],ny=p[1]+d[1];if(wk(G,nx,ny)&&!seen[ny][nx]){seen[ny][nx]=1;st.push([nx,ny]);}});}comps.push(c);}
    if(comps.length<=1)return;
    comps.sort(function(a,b){return b.length-a.length;});
    var main=comps[0],oth=comps[1],bp=null,sa=Math.max(1,(oth.length/50)|0),sb=Math.max(1,(main.length/50)|0);
    for(var i=0;i<oth.length;i+=sa){var o=oth[i];for(var j=0;j<main.length;j+=sb){var mn=main[j],dd=Math.abs(o[0]-mn[0])+Math.abs(o[1]-mn[1]);if(!bp||dd<bp.d)bp={d:dd,a:o,b:mn};}}
    if(!bp)return;carveX(G,bp.a[0],bp.b[0],bp.a[1]);carveY(G,bp.a[1],bp.b[1],bp.b[0]);
  }
}
// ARCHITECTURAL FEATURES (vaults-in-procedural): stamp ONE depth-selected, hand-authored feature into a
// spare room. LAW-SAFE BY CONSTRUCTION (the live leak gate re-measures and reseeds anything that still
// breaks): arena clears pillars; bureau/reward drop loot '$' (existing loot pipeline); hazard carves a
// RECTANGULAR central chasm pit kept >=2 from every wall so a walkable ring survives (single region) and a
// solid rect creates no floor-diagonal pinch. Records {type,rect,depth} flow out for telegraph/voice (R3).
function roomHas(rm,p){return p && p.x>=rm.x && p.x<rm.x+rm.w && p.y>=rm.y && p.y<rm.y+rm.h;}
function stampFeatureRoom(G,rm,r,type,depth){
  function setFloor(x,y,ch){if(G[y]&&G[y][x]==='.')G[y][x]=ch;}
  if(type==="arena"){ for(var y=rm.y+1;y<rm.y+rm.h-1;y++)for(var x=rm.x+1;x<rm.x+rm.w-1;x++)if(G[y][x]==='o')G[y][x]='.'; return; }
  if(type==="bureau"){ var n=1+ri(r,0,1); for(var k=0;k<n;k++)setFloor(rm.x+1+ri(r,0,Math.max(0,rm.w-3)), rm.y+1+ri(r,0,Math.max(0,rm.h-3)), '$'); return; }
  if(type==="hazard"){ for(var y=rm.y+2;y<=rm.y+rm.h-3;y++)for(var x=rm.x+2;x<=rm.x+rm.w-3;x++)setFloor(x,y,'X'); return; }   // central pit, walkable ring preserved
  if(type==="reward"){ var pile=Math.min(4,1+Math.floor(depth/2)); for(var k=0;k<pile;k++)setFloor(rm.cx-1+(k%2), rm.cy-1+((k/2)|0), '$'); return; }   // FLAG: count is a depth proxy; real depth-scaled VALUES await the loot ruling
}
function stampFeatures(G,rooms,r,depth,stairs){
  var feats=[]; depth=depth||1;
  if(rooms.length<3) return feats;
  if(r() > Math.min(0.9, 0.5+depth*0.06)) return feats;   // SPARSE: ~one per floor, depth-weighted; shallow floors often have none (contrast)
  var cand=[]; for(var i=1;i<rooms.length;i++){var rm=rooms[i]; if(rm.w>=5&&rm.h>=4 && !roomHas(rm,stairs.up) && !roomHas(rm,stairs.down)) cand.push(rm);}
  if(!cand.length) return feats;
  var rm=cand[ri(r,0,cand.length-1)];
  var pool=["bureau"];                                    // bureau (loot+flavor) fits any room; richer types need size + depth
  if(rm.w>=6&&rm.h>=5){ pool.push("arena"); if(depth>=3)pool.push("hazard"); if(depth>=5)pool.push("reward"); }
  var type=pool[ri(r,0,pool.length-1)];
  stampFeatureRoom(G,rm,r,type,depth);
  feats.push({type:type,x:rm.x,y:rm.y,w:rm.w,h:rm.h,cx:rm.cx,cy:rm.cy,depth:depth});
  return feats;
}
function genWorked(W,H,r,roomCount,skin){
  var G=fill(W,H,'#'),rooms=[],tries=roomCount*60;
  function dim(){var t=r();if(t<0.12)return[ri(r,8,11),ri(r,6,8)];if(t<0.5)return[ri(r,5,7),ri(r,4,5)];return[ri(r,4,5),ri(r,3,4)];}   // R2: smaller rooms (corridors carry the floor)
  (function(){var lw=Math.min(13,Math.max(9,(W*0.24)|0)),lh=Math.min(8,Math.max(6,(H*0.24)|0));
    var lx=((W-lw)>>1)+ri(r,-3,3),ly=((H-lh)>>1)+ri(r,-2,2);lx=Math.max(1,Math.min(W-lw-2,lx));ly=Math.max(1,Math.min(H-lh-2,ly));
    for(var yy=ly;yy<ly+lh;yy++)for(var xx=lx;xx<lx+lw;xx++)G[yy][xx]='.';
    rooms.push({x:lx,y:ly,w:lw,h:lh,cx:lx+(lw>>1),cy:ly+(lh>>1),landmark:true});})();
  while(rooms.length<roomCount&&tries-->0){
    var d=dim(),w=d[0],h=d[1],bestC=null;
    for(var attempt=0;attempt<8;attempt++){
      var x=ri(r,1,W-w-2),y=ri(r,1,H-h-2),ok=true;
      for(var yy=y-1;yy<=y+h&&ok;yy++)for(var xx=x-1;xx<=x+w&&ok;xx++){if(!inb(G,xx,yy)){ok=false;break;}if(G[yy][xx]!=='#')ok=false;}
      if(!ok)continue;
      var cx=x+(w>>1),cy=y+(h>>1),md=1e9;
      rooms.forEach(function(rm){var dd=Math.abs(rm.cx-cx)+Math.abs(rm.cy-cy);if(dd<md)md=dd;});
      if(!bestC||md>bestC.md)bestC={x:x,y:y,cx:cx,cy:cy,md:md};
    }
    if(!bestC)continue;
    for(var yy2=bestC.y;yy2<bestC.y+h;yy2++)for(var xx2=bestC.x;xx2<bestC.x+w;xx2++)G[yy2][xx2]='.';
    rooms.push({x:bestC.x,y:bestC.y,w:w,h:h,cx:bestC.cx,cy:bestC.cy});
  }
  rooms.forEach(function(rm){if(rm.landmark)return;if(rm.w>=6&&rm.h>=6&&r()<0.18){var cw=ri(r,2,(rm.w/2)|0),ch=ri(r,2,(rm.h/2)|0),corner=ri(r,0,3);var nx=(corner%2===0)?rm.x:rm.x+rm.w-cw,ny=(corner<2)?rm.y:rm.y+rm.h-ch;for(var yy=ny;yy<ny+ch;yy++)for(var xx=nx;xx<nx+cw;xx++)G[yy][xx]='#';}});
  if(rooms.length){
    var conn=[0],rest=[];for(var i=1;i<rooms.length;i++)rest.push(i);
    while(rest.length){var best=null;conn.forEach(function(ci){rest.forEach(function(ti){var a=rooms[ci],b=rooms[ti],dd=Math.abs(a.cx-b.cx)+Math.abs(a.cy-b.cy);if(!best||dd<best.d)best={d:dd,from:ci,to:ti};});});windingConnect(G,rooms[best.from],rooms[best.to],r);conn.push(best.to);rest.splice(rest.indexOf(best.to),1);}
    var loops=Math.max(1,Math.round(rooms.length*0.18)),made=0,lt=rooms.length*8;
    while(made<loops&&lt-->0){var a=ri(r,0,rooms.length-1),b=ri(r,0,rooms.length-1);if(a===b)continue;var A=rooms[a],B=rooms[b];var ox=Math.min(A.x+A.w-1,B.x+B.w-1)-Math.max(A.x,B.x),oy=Math.min(A.y+A.h-1,B.y+B.h-1)-Math.max(A.y,B.y),dd=Math.abs(A.cx-B.cx)+Math.abs(A.cy-B.cy);if((ox>=0||oy>=0)&&dd<Math.max(W,H)*0.5){carveConnect(G,A,B,r);made++;}}
  }
  var patch=(skin==='flooded')?'~':(skin==='ruin')?'o':'X';
  rooms.forEach(function(rm){if(rm.w>=6&&rm.h>=5&&r()<0.15){var px=rm.x+1+ri(r,0,Math.max(0,rm.w-4)),py=rm.y+1+ri(r,0,Math.max(0,rm.h-3));for(var yy=py;yy<py+2&&yy<rm.y+rm.h-1;yy++)for(var xx=px;xx<px+2&&xx<rm.x+rm.w-1;xx++)if(G[yy]&&G[yy][xx]==='.')G[yy][xx]=patch;}});
  carveSpurs(G,r);   // R2: dead-end corridor branches (maze depth) — attached to existing floor, sealed by fixLeaks, kept single-region by ensureConnected
  placeDoors(G,rooms);
  ensureConnected(G);
  if(rooms.length){G[rooms[0].cy][rooms[0].cx]='@';var far=rooms[0],fd=-1;rooms.forEach(function(rr){var dd=Math.abs(rr.cx-rooms[0].cx)+Math.abs(rr.cy-rooms[0].cy);if(dd>fd){fd=dd;far=rr;}});G[far.cy][far.cx]='>';}
  addPillars(G,rooms,r);
  return {grid:G, rooms:rooms};
}
function cleanDoors(G,r){
  var W=G[0].length,H=G.length,y,x;
  for(y=0;y<H;y++)for(x=0;x<W;x++){
    if(G[y][x]!=='+')continue;
    var L=wk(G,x-1,y),R=wk(G,x+1,y),U=wk(G,x,y-1),D=wk(G,x,y+1);
    if(!((L&&R&&!U&&!D)||(U&&D&&!L&&!R)))G[y][x]='.'; // not a 1-wide doorway -> open archway
  }
  for(y=0;y<H;y++)for(x=0;x<W;x++){
    if(G[y][x]==='+'&&((x+1<W&&G[y][x+1]==='+')||(y+1<H&&G[y+1][x]==='+')))G[y][x]='.';
  }
  if(r)for(y=0;y<H;y++)for(x=0;x<W;x++){
    if(G[y][x]==='+'&&r()<0.35)G[y][x]='.';
  }
}
function placeDoors(G,rooms){
  var W=G[0].length,H=G.length,mask=fill(W,H,0);
  rooms.forEach(function(rm){for(var y=rm.y;y<rm.y+rm.h;y++)for(var x=rm.x;x<rm.x+rm.w;x++)mask[y][x]=1;});
  for(var y=0;y<H;y++)for(var x=0;x<W;x++){if(G[y][x]==='.'&&!mask[y][x]){
    if((inb(G,x+1,y)&&mask[y][x+1])||(inb(G,x-1,y)&&mask[y][x-1])||(inb(G,x,y+1)&&mask[y+1][x])||(inb(G,x,y-1)&&mask[y-1][x]))G[y][x]='+';
  }}
}
function plantSecrets(G,rooms,r){
  if(!rooms.length)return;
  var pool=rooms.slice().sort(function(a,b){return a.w*a.h-b.w*b.h;}),placed=0;
  for(var i=0;i<pool.length&&placed<2;i++){var rm=pool[i],sx=rm.x+1,sy=rm.y+1;if(G[sy]&&G[sy][sx]==='.'){G[sy][sx]='$';placed++;}}
  carveSecretAlcove(G,rooms,r);if(r()<0.6)carveSecretAlcove(G,rooms,r);
}
function carveSecretAlcove(G,rooms,r){
  for(var t=0;t<60;t++){
    var rm=rooms[ri(r,0,rooms.length-1)],side=ri(r,0,3),wx,wy,ax,ay;
    if(side===0){wx=ri(r,rm.x,rm.x+rm.w-1);wy=rm.y-1;ax=wx;ay=rm.y-2;}
    else if(side===1){wx=ri(r,rm.x,rm.x+rm.w-1);wy=rm.y+rm.h;ax=wx;ay=rm.y+rm.h+1;}
    else if(side===2){wx=rm.x-1;wy=ri(r,rm.y,rm.y+rm.h-1);ax=rm.x-2;ay=wy;}
    else{wx=rm.x+rm.w;wy=ri(r,rm.y,rm.y+rm.h-1);ax=rm.x+rm.w+1;ay=wy;}
    if(!inb(G,ax,ay))continue;
    var inx=wx-(ax-wx),iny=wy-(ay-wy);
    if(G[wy]&&G[wy][wx]==='#'&&G[ay]&&G[ay][ax]==='#'&&inb(G,inx,iny)&&G[iny][inx]==='.'){
      var iso=true;[[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){var nx=ax+d[0],ny=ay+d[1];if(nx===wx&&ny===wy)return;if(!(inb(G,nx,ny)&&G[ny][nx]==='#'))iso=false;});
      if(iso){G[ay][ax]='$';G[wy][wx]='?';return true;}
    }
  }
  return false;
}

// ---------- CAVE ----------
function genCave(W,H,r){
  var G=fill(W,H,'#');
  for(var y=1;y<H-1;y++)for(var x=1;x<W-1;x++)G[y][x]=r()<0.45?'#':'.';
  for(var p=0;p<5;p++){var N=G.map(function(rr){return rr.slice();});
    for(y=1;y<H-1;y++)for(x=1;x<W-1;x++){var w=0;for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++)if((dx||dy)&&G[y+dy][x+dx]==='#')w++;N[y][x]=w>=5?'#':'.';}G=N;}
  keepLargest(G);placeEndsAndLoot(G,r,3);return G;
}
function keepLargest(G){
  var W=G[0].length,H=G.length,seen=fill(W,H,0),comps=[];
  for(var y=0;y<H;y++)for(var x=0;x<W;x++)if(G[y][x]==='.'&&!seen[y][x]){var st=[[x,y]],c=[];seen[y][x]=1;
    while(st.length){var p=st.pop();c.push(p);[[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){var nx=p[0]+d[0],ny=p[1]+d[1];if(inb(G,nx,ny)&&!seen[ny][nx]&&G[ny][nx]==='.'){seen[ny][nx]=1;st.push([nx,ny]);}});}comps.push(c);}
  comps.sort(function(a,b){return b.length-a.length;});
  for(var i=1;i<comps.length;i++)comps[i].forEach(function(p){G[p[1]][p[0]]='#';});
}

// ---------- SPINE ----------
function genSpine(W,H,r){
  var G=fill(W,H,'#'),cx=W>>1,y=1;
  while(y<H-1){G[y][cx]='.';if(r()<0.18&&cx>3&&cx<W-3){cx+=r()<0.5?1:-1;G[y][cx]='.';}y++;}
  for(y=3;y<H-3;y+=ri(r,3,5)){var tx=-1;for(var x=0;x<W;x++)if(G[y][x]==='.'){tx=x;break;}if(tx<0)continue;
    var side=r()<0.5?-1:1,len=ri(r,3,6),rx=tx;for(var k=0;k<len;k++){rx+=side;if(rx<2||rx>W-3)break;G[y][rx]='.';}
    var rw=ri(r,3,5),rh=ri(r,3,4),ox=side<0?rx-rw+1:rx,oy=y-(rh>>1);
    for(var yy=oy;yy<oy+rh;yy++)for(var xx=ox;xx<ox+rw;xx++)if(inb(G,xx,yy)&&G[yy][xx]==='#')G[yy][xx]='.';}
  for(x=0;x<W;x++)if(G[1][x]==='.'){G[1][x]='@';break;}
  for(x=0;x<W;x++)if(G[H-2][x]==='.'){G[H-2][x]='>';break;}
  placeLootOnly(G,r,2);return G;
}

// ---------- WARREN ----------
function genWarren(W,H,r){
  var G=fill(W,H,'#'),leaves=[];
  (function split(x,y,w,h,depth){
    if(depth<=0||w<8||h<8){leaves.push({x:x,y:y,w:w,h:h});return;}
    var horiz=w<h?false:(h<w?true:r()<0.5);
    if(horiz){var c=ri(r,4,w-4);split(x,y,c,h,depth-1);split(x+c,y,w-c,h,depth-1);}
    else{var c2=ri(r,4,h-4);split(x,y,w,c2,depth-1);split(x,y+c2,w,h-c2,depth-1);}
  })(1,1,W-2,H-2,6);
  leaves.forEach(function(L){for(var y=L.y+1;y<L.y+L.h-1;y++)for(var x=L.x+1;x<L.x+L.w-1;x++)if(inb(G,x,y))G[y][x]='.';});
  // punch doors through 1- and 2-thick walls between rooms (mesh)
  for(var y=1;y<H-1;y++)for(var x=1;x<W-1;x++){if(G[y][x]!=='#')continue;
    if(G[y][x-1]==='.'&&G[y][x+1]==='.'&&r()<0.5){G[y][x]='+';continue;}
    if(G[y-1][x]==='.'&&G[y+1][x]==='.'&&r()<0.5){G[y][x]='+';continue;}
    if(G[y][x-1]==='.'&&G[y][x+1]==='#'&&inb(G,x+2,y)&&G[y][x+2]==='.'&&r()<0.35){G[y][x]='+';G[y][x+1]='+';continue;}
    if(G[y-1][x]==='.'&&G[y+1][x]==='#'&&inb(G,x,y+2)&&G[y+2][x]==='.'&&r()<0.35){G[y][x]='+';G[y+1][x]='+';continue;}
  }
  ensureConnected(G);
  placeEndsAndLoot(G,r,3);return G;
}

// ---------- shared placement ----------
function floors(G){var a=[];for(var y=0;y<G.length;y++)for(var x=0;x<G[0].length;x++)if(G[y][x]==='.')a.push([x,y]);return a;}
function placeEndsAndLoot(G,r,nLoot){
  var f=floors(G);if(f.length<2)return;
  var a=f[ri(r,0,f.length-1)],far=a,fd=-1;f.forEach(function(p){var d=Math.abs(p[0]-a[0])+Math.abs(p[1]-a[1]);if(d>fd){fd=d;far=p;}});
  G[a[1]][a[0]]='@';G[far[1]][far[0]]='>';
  for(var i=0;i<nLoot;i++){var p=f[ri(r,0,f.length-1)];if(G[p[1]][p[0]]==='.')G[p[1]][p[0]]='$';}
}
function placeLootOnly(G,r,n){var f=floors(G);for(var i=0;i<n&&f.length;i++){var p=f[ri(r,0,f.length-1)];if(G[p[1]][p[0]]==='.')G[p[1]][p[0]]='$';}}

// ---------- skins ----------
function adjTo(G,x,y,ch){return (inb(G,x+1,y)&&G[y][x+1]===ch)||(inb(G,x-1,y)&&G[y][x-1]===ch)||(inb(G,x,y+1)&&G[y+1][x]===ch)||(inb(G,x,y-1)&&G[y-1][x]===ch);}
function applyRuin(G,r){var W=G[0].length,H=G.length;
  for(var y=1;y<H-1;y++)for(var x=1;x<W-1;x++){
    if(adjTo(G,x,y,'?')||adjTo(G,x,y,'$'))continue;
    if(G[y][x]==='#'&&r()<0.025){var nb=wk(G,x+1,y)||wk(G,x-1,y)||wk(G,x,y+1)||wk(G,x,y-1);if(nb)G[y][x]='.';}
    else if(G[y][x]==='.'&&r()<0.03){var wn=(wk(G,x+1,y)?1:0)+(wk(G,x-1,y)?1:0)+(wk(G,x,y+1)?1:0)+(wk(G,x,y-1)?1:0);if(wn>=3)G[y][x]='o';}
  }}
function plantSecretsFromDeadEnds(G,r,count){
  var W=G[0].length,H=G.length,tips=[],dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  function iso8(x,y,exX,exY){var d8=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];for(var k=0;k<8;k++){var nx=x+d8[k][0],ny=y+d8[k][1];if(nx===exX&&ny===exY)continue;if(!(inb(G,nx,ny)&&G[ny][nx]==='#'))return false;}return true;}
  for(var y=1;y<H-1;y++)for(var x=1;x<W-1;x++){if(G[y][x]!=='.')continue;var nb=[];dirs.forEach(function(d){if(wk(G,x+d[0],y+d[1]))nb.push([x+d[0],y+d[1]]);});if(nb.length===1&&iso8(x,y,nb[0][0],nb[0][1]))tips.push({x:x,y:y,n:nb[0]});}
  for(var i=tips.length-1;i>0;i--){var j=ri(r,0,i),t=tips[i];tips[i]=tips[j];tips[j]=t;}
  var placed=0;
  for(i=0;i<tips.length&&placed<count;i++){var tp=tips[i];if(G[tp.y][tp.x]==='.'&&G[tp.n[1]][tp.n[0]]==='.'){G[tp.y][tp.x]='$';G[tp.n[1]][tp.n[0]]='?';placed++;}}
  return placed;
}
function carveAlcoveAnywhere(G,r){
  var W=G[0].length,H=G.length,dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  for(var t=0;t<300;t++){var x=ri(r,2,W-3),y=ri(r,2,H-3);if(G[y][x]!=='.')continue;
    var d=dirs[ri(r,0,3)],wx=x+d[0],wy=y+d[1],ax=x+2*d[0],ay=y+2*d[1];if(!inb(G,ax,ay))continue;
    if(G[wy][wx]==='#'&&G[ay][ax]==='#'){var iso=true;var d8=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];d8.forEach(function(dd){var nx=ax+dd[0],ny=ay+dd[1];if(nx===wx&&ny===wy)return;if(!(inb(G,nx,ny)&&G[ny][nx]==="#"))iso=false;});if(iso){G[ay][ax]='$';G[wy][wx]='?';return true;}}}
  return false;
}
function applyFlood(G,r){var f=floors(G);for(var i=0;i<f.length;i++)if(r()<0.18)G[f[i][1]][f[i][0]]='~';}

// ---------- measurement ----------
function measure(G){
  var W=G[0].length,H=G.length,total=W*H,walk=0;
  function W2(x,y){return wk(G,x,y);}
  for(var y=0;y<H;y++)for(var x=0;x<W;x++)if(WALK[G[y][x]])walk++;
  // connectivity
  var seen=fill(W,H,0),comps=[];
  for(y=0;y<H;y++)for(x=0;x<W;x++)if(W2(x,y)&&!seen[y][x]){var st=[[x,y]],c=0;seen[y][x]=1;while(st.length){var p=st.pop();c++;[[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){var nx=p[0]+d[0],ny=p[1]+d[1];if(W2(nx,ny)&&!seen[ny][nx]){seen[ny][nx]=1;st.push([nx,ny]);}});}comps.push(c);}
  comps.sort(function(a,b){return b-a;});
  // rooms (2x2 areas)
  function roomy(x,y){if(!W2(x,y))return false;var q=[[0,0],[-1,0],[0,-1],[-1,-1]];for(var i=0;i<4;i++){var ox=x+q[i][0],oy=y+q[i][1];if(W2(ox,oy)&&W2(ox+1,oy)&&W2(ox,oy+1)&&W2(ox+1,oy+1))return true;}return false;}
  var rs=fill(W,H,0),rooms=[];
  for(y=0;y<H;y++)for(x=0;x<W;x++)if(roomy(x,y)&&!rs[y][x]){var st2=[[x,y]],sz=0;rs[y][x]=1;while(st2.length){var p=st2.pop();sz++;[[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){var nx=p[0]+d[0],ny=p[1]+d[1];if(inb(G,nx,ny)&&!rs[ny][nx]&&roomy(nx,ny)){rs[ny][nx]=1;st2.push([nx,ny]);}});}if(sz>=4)rooms.push(sz);}
  rooms.sort(function(a,b){return b-a;});
  // open corners
  var leaks=0;for(y=0;y<H;y++)for(x=0;x<W;x++){if(!W2(x,y))continue;if(W2(x+1,y+1)&&!W2(x+1,y)&&!W2(x,y+1))leaks++;if(W2(x-1,y+1)&&!W2(x-1,y)&&!W2(x,y+1))leaks++;}
  // footprint
  var mnx=W,mxx=-1,mny=H,mxy=-1;for(y=0;y<H;y++)for(x=0;x<W;x++)if(W2(x,y)){if(x<mnx)mnx=x;if(x>mxx)mxx=x;if(y<mny)mny=y;if(y>mxy)mxy=y;}
  var cover=mxx<0?0:Math.round(100*(mxx-mnx+1)*(mxy-mny+1)/total);
  // dead-ends + straightness
  var dead=0,st=0,bd=0;
  for(y=0;y<H;y++)for(x=0;x<W;x++){if(!W2(x,y))continue;var L=W2(x-1,y),R=W2(x+1,y),U=W2(x,y-1),D=W2(x,y+1),n=(L?1:0)+(R?1:0)+(U?1:0)+(D?1:0);if(n===1)dead++;if(n===2){if((L&&R)||(U&&D))st++;else bd++;}}
  // secrets gate value
  function noSec(x,y){return W2(x,y)&&G[y][x]!=='?';}
  var sseen=fill(W,H,0),scomps=[];
  for(y=0;y<H;y++)for(x=0;x<W;x++)if(noSec(x,y)&&!sseen[y][x]){var st3=[[x,y]],c3=[];sseen[y][x]=1;while(st3.length){var p=st3.pop();c3.push(p);[[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){var nx=p[0]+d[0],ny=p[1]+d[1];if(noSec(nx,ny)&&!sseen[ny][nx]){sseen[ny][nx]=1;st3.push([nx,ny]);}});}scomps.push(c3);}
  scomps.sort(function(a,b){return b.length-a.length;});
  var pockets=0,pocketLoot=0;
  scomps.forEach(function(c,i){if(i===0)return;var ts=false,hl=false;c.forEach(function(p){[[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){if(inb(G,p[0]+d[0],p[1]+d[1])&&G[p[1]+d[1]][p[0]+d[0]]==='?')ts=true;});if(G[p[1]][p[0]]==='$')hl=true;});if(ts){pockets++;if(hl)pocketLoot++;}});
  function cnt(ch){var k=0;for(var y=0;y<H;y++)for(var x=0;x<W;x++)if(G[y][x]===ch)k++;return k;}
  return {W:W,H:H,floorPct:Math.round(100*walk/total),regions:comps.length,rooms:rooms.length,roomSizes:rooms,
    leaks:leaks,cover:cover,dead:dead,straight:st+bd?Math.round(100*st/(st+bd)):0,
    doors:cnt('+'),secrets:cnt('?'),loot:cnt('$'),pockets:pockets,pocketLoot:pocketLoot};
}

// R1 (corridor bias): FEWER rooms per floor than before (28->18 at regular) so rooms are linked by real
// halls, not shared walls — raising the passage:room ratio toward a labyrinth.
// R2 (labyrinth): FEW rooms — most of the floor is corridor. Rooms are joined and threaded by long winding
// halls + dead-end spurs (carveSpurs), pushing the hallway:room tile ratio past ~0.4:1.
var SIZES={suite:{W:28,H:18,rooms:5},regular:{W:54,H:34,rooms:14},large:{W:68,H:42,rooms:20}};
function generateLevel(seed,opts){
  opts=opts||{};var size=opts.size||'regular',grammar=opts.grammar||'worked',skin=opts.skin||'stone';
  var sz=SIZES[size]||SIZES.regular,r=mulberry32((seed>>>0)||1),G;
  // R2 SIZE VARIATION: roll the floor dims within [-20%, native] (clamped to native; rooms scale with area)
  // so footprints visibly vary run to run. FLAG: clamped to <= native because the live viewport
  // (mapmode composeNodeGen2) reads a FIXED 54x34 frame — a larger grid would be truncated and break the
  // single-region guardrail, and "touch gen2.js only" is a HARD guardrail (no mapmode frame change). So the
  // variation is DOWNWARD from 54x34; true +20% upward needs an (out-of-scope) mapmode frame read.
  var W=sz.W,H=sz.H,rooms=sz.rooms;
  if(!opts.fixedSize){
    W=ri(r,Math.round(sz.W*0.8),Math.round(sz.W*1.2)); H=ri(r,Math.round(sz.H*0.8),Math.round(sz.H*1.2));   // TRUE +-20% around native (frame lifted: mapmode reads the real dims)
    rooms=Math.max(6,Math.round(sz.rooms*(W*H)/(sz.W*sz.H)));
  } else if(opts.maxSize){ W=Math.round(sz.W*1.2); H=Math.round(sz.H*1.2); rooms=Math.max(6,Math.round(sz.rooms*(W*H)/(sz.W*sz.H))); }   // sim worst case: the LARGEST floor (most foes)
  var rmList=null;
  if(grammar==='worked'){var wk2=genWorked(W,H,r,rooms,skin); G=wk2.grid; rmList=wk2.rooms;}
  else if(grammar==='cave')G=genCave(W,H,r);
  else if(grammar==='spine')G=genSpine(W,H,r);
  else G=genWarren(W,H,r);
  if(skin==='ruin')applyRuin(G,r);if(skin==='flooded')applyFlood(G,r);
  ensureConnected(G);if(typeof cleanDoors==='function')cleanDoors(G,r);
  var got=plantSecretsFromDeadEnds(G,r,2);if(got<1)carveAlcoveAnywhere(G,r);
  fixLeaks(G);   // AFTER the corridor logic AND the secret/alcove carving (both add floor) -> seals every pinch; stairs below add no new walkable, so they can't reopen one (and fixLeaks must precede them: it would overwrite a '<' which is non-WALK)
  var up=null,down=null,y,x;
  for(y=0;y<H;y++)for(x=0;x<W;x++){if(G[y][x]==='@'){G[y][x]='<';up={x:x,y:y};}else if(G[y][x]==='>')down={x:x,y:y};}
  if(!up){for(y=0;y<H&&!up;y++)for(x=0;x<W;x++)if(G[y][x]==='.'){G[y][x]='<';up={x:x,y:y};break;}}
  if(!down&&up){var bd=-1;for(y=0;y<H;y++)for(x=0;x<W;x++)if(G[y][x]==='.'){var d=Math.abs(x-up.x)+Math.abs(y-up.y);if(d>bd){bd=d;down={x:x,y:y};}}if(down)G[down.y][down.x]='>';}
  // FEATURES stamped AFTER stairs (so they avoid '<'/'>') — depth-selected, sparse, law-safe. The live leak
  // gate (mapmode gen2Clean) re-measures the final grid and reseeds any feature that breaks leaks/regions/stairs.
  var features=(rmList && grammar==='worked') ? stampFeatures(G,rmList,r,opts.depth||1,{up:up,down:down}) : [];
  return {grid:G,w:W,h:H,up:up,down:down,features:features};
}
return { generateLevel: generateLevel, SIZES: SIZES, measure: measure };
})();
if (typeof module !== "undefined" && module.exports) module.exports = TD_GEN2;
