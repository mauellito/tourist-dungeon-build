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

// ============================ NEW WORKED SHAPER — rooms & corridors + ACCRETION ============================
// "Walking should be fun." Legible CHAMBERS placed by accretion (Brogue-style: attach a new room to an
// existing room's wall via a door site), skinned as TD's failing civic architecture. Rooms are first-class
// SHAPES with real walls + doorways. Single-region BY CONSTRUCTION (each room attaches to the cluster through
// exactly one door). Round 2 adds corridor discipline (a concourse, loops, paid dead-ends); Round 3 landmarks.
// Gate: ALLOW_LEGACY swaps back to the old winding-corridor shaper (loud debug floor on total failure).
var ALLOW_LEGACY = false;
function carveBox(G,x,y,w,h,ch){ for(var yy=y;yy<y+h;yy++)for(var xx=x;xx<x+w;xx++)if(inb(G,xx,yy))G[yy][xx]=ch; }
// the rect [x..x+w-1,y..y+h-1] plus a 1-cell wall border (minus the anchor side) must be all '#', and stay
// >=1 from the map edge. `skipSide`: 0=N 1=S 2=W 3=E (the side facing the anchor — its border may be the shared wall).
function boxClear(G,x,y,w,h){
  if(x<2||y<2||x+w>G[0].length-2||y+h>G.length-2)return false;
  for(var yy=y-1;yy<y+h+1;yy++)for(var xx=x-1;xx<x+w+1;xx++)if(!inb(G,xx,yy)||G[yy][xx]!=='#')return false;
  return true;
}
// SHAPE vocabulary — each returns bounding dims [w,h]. Node kinds map to shapes in generateLevel/mapmode.
function pickShape(r,budget){
  var t=r();
  if(budget.cave>0 && t<0.03){budget.cave--;return 'cave';}                 // RARE — the works failing (<=1/floor)
  if(t<0.16)return 'great';                                                  // great hall (large; >=2 exits)
  if(t<0.32)return 'pillared';                                               // pillared hall (interior columns — landmark)
  if(t<0.44)return 'rotunda';                                               // rotunda (rounded — corner-clipped + pillar ring)
  return 'rect';                                                             // the workhorse chamber
}
function shapeDims(r,shape){
  if(shape==='great')return [ri(r,9,12),ri(r,6,8)];
  if(shape==='pillared')return [ri(r,8,11),ri(r,6,8)];
  if(shape==='rotunda'){var d=ri(r,7,9);return [d,d];}
  if(shape==='cave')return [ri(r,6,9),ri(r,5,7)];
  return [ri(r,4,7),ri(r,4,6)];   // rect chamber (varied) — bigger than the legacy blobs, for room coverage
}
// paint a room's floor + interior TEXTURE. Footprint stays RECT (the zero-open-corner law forbids diagonal
// wall edges — a real octagon/cave outline would be sealed flat by fixLeaks, spawning stubs), so shapes read
// through INTERIOR texture: pillar columns (pillared), a circular pillar RING (rotunda), scattered rubble
// (cave). All 'o' pillars sit >=1 from the wall so no floor pinch -> zero open corners -> fixLeaks is a no-op.
function paintShape(G,rm,r){
  var x=rm.x,y=rm.y,w=rm.w,h=rm.h,cx=rm.cx,cy=rm.cy;
  carveBox(G,x,y,w,h,'.');
  // pillars sit >=1 from the wall AND keep the room-CENTRE cross clear (a stair/node lands at the centre and
  // must have walkable orthogonal neighbours — a pillar-ringed centre would wall the stair in).
  function pil(px,py){if(inb(G,px,py)&&G[py][px]==='.'&&px>x&&px<x+w-1&&py>y&&py<y+h-1&&(Math.abs(px-cx)>1||Math.abs(py-cy)>1))G[py][px]='o';}
  if(rm.shape==='rotunda'){                                    // a circular pillar RING (reads round in a rect hall)
    var rx=(w-1)/2-1, ry=(h-1)/2-1;
    for(var py=y+1;py<y+h-1;py++)for(var px=x+1;px<x+w-1;px++){var dx=(px-cx)/Math.max(1,rx),dy=(py-cy)/Math.max(1,ry),dd=dx*dx+dy*dy;if(dd>0.72&&dd<1.05)pil(px,py);}
    rm.landmark=true;
  } else if(rm.shape==='pillared'){                            // interior pillar columns (instant landmark)
    for(var qy=y+2;qy<y+h-2;qy+=2)for(var qx=x+2;qx<x+w-2;qx+=2)pil(qx,qy);
    rm.landmark=true;
  } else if(rm.shape==='cave'){                                // scattered rubble (the works failing)
    var n=ri(r,3,6);for(var b=0;b<n;b++)pil(x+1+ri(r,0,Math.max(0,w-3)),y+1+ri(r,0,Math.max(0,h-3)));
  }
}
// ---------- ARCHETYPE SCAFFOLD (Round A owed) — seeded weighted selection ----------
// The floor's macro-shape family. Only TRAVERSE is BUILT; the rest are STUBS that route back through the
// traverse shaper for now (so every floor is a valid traverse until the other shapers land). The weights are
// the operator's traverse-dominant distribution; the selection is seeded so a given seed yields a stable
// archetype and the mix is reproducible. comp.archetype is recorded on every composition (mapmode reads
// generateLevel().archetype).
var ARCHETYPES=[
  {key:'traverse', w:60, built:true},
  {key:'circuit',  w:15, built:false},
  {key:'labyrinth',w:12, built:false},
  {key:'warren',   w:8,  built:false},
  {key:'cavern',   w:5,  built:false}
];
function pickArchetype(r){
  var tot=0,i;for(i=0;i<ARCHETYPES.length;i++)tot+=ARCHETYPES[i].w;
  var roll=r()*tot,acc=0;
  for(i=0;i<ARCHETYPES.length;i++){acc+=ARCHETYPES[i].w;if(roll<acc)return ARCHETYPES[i].key;}
  return 'traverse';
}

// ---------- THE TRAVERSE SKELETON — a GROWN crooked route, NOT a grid ----------
// Scatter 4-7 waypoints across the floor (Poisson-ish), thread a CROOKED spanning route up -> waypoints ->
// down (short bounded segments, forced axis-alternation -> no long straight run, no parallel bands), then add
// 2-4 SHORTCUT links between non-adjacent waypoints for optionality (cycles). The traverse ORIENTATION varies
// by seed (horizontal / vertical / diagonal). No perimeter ring: waypoints live in the interior. Single-file.
function isFloorCell(G,x,y){return inb(G,x,y)&&G[y][x]==='.';}
// would setting (x,y)='.' COMPLETE a 2x2 all-floor block? (keeps corridors single-file, kills thick/parallel runs)
function makes2x2(G,x,y){
  function f(px,py){return (px===x&&py===y)||isFloorCell(G,px,py);}
  var offs=[[0,0],[-1,0],[0,-1],[-1,-1]];
  for(var i=0;i<4;i++){var ox=x+offs[i][0],oy=y+offs[i][1];if(f(ox,oy)&&f(ox+1,oy)&&f(ox,oy+1)&&f(ox+1,oy+1))return true;}
  return false;
}
// Thread a->b as a GROWN, single-file, jagged corridor: one cell at a time, biased toward the target, forced to
// JOG perpendicular after `cap` cells in one direction (so no long straight run EVEN when a,b share a row/col),
// and refusing steps that would thicken it into a 2x2 (so no parallel bands, no ladder). Returns the ordered
// cell list so callers can add LOCAL shortcuts. cap is small vs the floor -> runs stay well under 50%.
// stopAtTree: when set, capture the corridor cells that ALREADY exist at call time; the moment a freshly-carved
// cell touches one of them, STOP. Threading each waypoint to the growing network and stopping on FIRST contact
// makes the spine a strict TREE (one join per waypoint, never two) -> no floor-dominating loop can form.
function threadCrooked(G,a,b,r,stopAtTree){
  var W=G[0].length,H=G.length,x=a.x,y=a.y,guard=1500,dir=null,seg=0,path=[[x,y]];
  var cap=Math.max(2,Math.round(Math.min(W,H)*0.20));   // straight-run allowance per segment (jog breaks longer runs; a touch straighter -> shorter, less corridor)
  var pre=null;
  if(stopAtTree){pre={};for(var yy=0;yy<H;yy++)for(var xx=0;xx<W;xx++)if(G[yy][xx]==='.')pre[xx+','+yy]=1;delete pre[a.x+','+a.y];}
  function touches(){if(!pre)return false;var t=false;[[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){if(pre[(x+d[0])+','+(y+d[1])])t=true;});return t;}
  G[y][x]='.';
  var done=false;
  function step(ax,s){var nx=x+(ax==='x'?s:0),ny=y+(ax==='y'?s:0);if(!inb(G,nx,ny))return false;x=nx;y=ny;G[y][x]='.';path.push([x,y]);if(ax===dir)seg++;else{dir=ax;seg=1;}if(touches())done=true;return true;}
  function stepClean(ax,s){var nx=x+(ax==='x'?s:0),ny=y+(ax==='y'?s:0);if(inb(G,nx,ny)&&makes2x2(G,nx,ny))return false;return step(ax,s);}
  while(!done&&(x!==b.x||y!==b.y)&&guard-->0){
    var dx=b.x-x,dy=b.y-y;
    if(seg>=cap){                                                   // FORCED perpendicular jog -> breaks straight runs
      var perp=(dir==='x')?'y':'x', pd=(perp==='x')?dx:dy, sgn=pd!==0?(pd>0?1:-1):(r()<0.5?1:-1);
      if(stepClean(perp,sgn))continue; if(stepClean(perp,-sgn))continue;
    }
    var primary=(Math.abs(dx)>=Math.abs(dy))?'x':'y';
    if(dx===0)primary='y'; if(dy===0)primary='x';
    if(dx!==0&&dy!==0&&r()<0.30)primary=(primary==='x')?'y':'x';    // organic wander
    var ps=(primary==='x')?(dx>0?1:-1):(dy>0?1:-1);
    if(stepClean(primary,ps))continue;
    var other=(primary==='x')?'y':'x', od=(other==='x')?dx:dy;
    if(od!==0&&stepClean(other,od>0?1:-1))continue;                 // primary blocked -> other axis
    var moved=false;                                                // last resort: allow a thickening step
    [['x',dx],['y',dy]].forEach(function(pr){if(moved||pr[1]===0)return;if(step(pr[0],pr[1]>0?1:-1))moved=true;});
    if(!moved)break;
  }
  return path;
}
function carveRoute(G,r){
  var W=G[0].length,H=G.length,m=4;
  // ORIENTATION (varies by seed): 0 W->E (horizontal), 1 N->S (vertical), 2 NW->SE, 3 NE->SW (diagonals).
  // Waypoints PROGRESS along the axis with only bounded PERPENDICULAR jitter, so the traverse FLOW genuinely
  // matches the seeded axis (a vertical floor reads vertical even though the floor is wider than tall).
  var axis=ri(r,0,3);
  var A={x:m,y:m},B={x:W-1-m,y:H-1-m};                                   // default NW->SE
  if(axis===0){A={x:m,y:ri(r,m,H-1-m)};B={x:W-1-m,y:ri(r,m,H-1-m)};}     // W->E
  else if(axis===1){A={x:ri(r,m,W-1-m),y:m};B={x:ri(r,m,W-1-m),y:H-1-m};}// N->S
  else if(axis===3){A={x:m,y:H-1-m};B={x:W-1-m,y:m};}                    // NE->SW
  // waypoint COUNT scales with floor size: a small floor with 7 waypoints makes a proportionally long, winding
  // route (too much corridor); fewer waypoints keep the corridor share honest on small floors.
  var n=ri(r,4,Math.max(4,Math.min(7,Math.round(Math.min(W,H)/5)))), jit=Math.max(3,Math.round(Math.min(W,H)*0.16)), wps=[];
  for(var i=0;i<n;i++){
    var t=(i+(r()-0.5)*0.5)/(n-1);t=Math.max(0,Math.min(1,t));
    var bx=A.x+(B.x-A.x)*t, by=A.y+(B.y-A.y)*t;
    // jitter PERPENDICULAR to the travel: horizontal spine jitters y, vertical spine jitters x, diagonals both.
    if(axis===0)by+=(r()-0.5)*2*jit; else if(axis===1)bx+=(r()-0.5)*2*jit; else{bx+=(r()-0.5)*jit;by+=(r()-0.5)*jit;}
    var x=Math.max(m,Math.min(W-1-m,Math.round(bx))), y=Math.max(m,Math.min(H-1-m,Math.round(by)));
    wps.push({x:x,y:y});
  }
  while(wps.length<3){wps.push({x:ri(r,m,W-1-m),y:ri(r,m,H-1-m)});}
  // order the waypoints along the traverse axis (up -> down), then grow a TREE: each waypoint threads to the
  // NEAREST already-connected waypoint and stops on first contact with the network (one join each -> acyclic).
  var avv=[[1,0],[0,1],[1,1],[1,-1]][axis];
  wps.sort(function(p,q){return (avv[0]*p.x+avv[1]*p.y)-(avv[0]*q.x+avv[1]*q.y);});
  G[wps[0].y][wps[0].x]='.';
  // CHAIN the waypoints (wp[i] -> wp[i-1]) rather than to the nearest hub: a path-like spine keeps most waypoints
  // at degree 2 (few thick junctions), and stop-at-tree still guarantees acyclicity.
  for(i=1;i<wps.length;i++)threadCrooked(G,wps[i],wps[i-1],r,true);
  thinCorridors(G);   // pare the (loop-free) spine to single-file; shortcuts are added LATER (after rooms bud and
                      // dead-ends are culled) so their loop bound is measured against the FINAL corridor size.
  return {waypoints:wps, up:wps[0], down:wps[wps.length-1], axis:axis};
}
// SHORTCUTS = LOCAL loops of BOUNDED size, added on the FINAL corridor (after budding + cullDeadEnds, so the
// corridor size is settled). Pick a corridor cell p; find a cell q FAR in corridor-graph distance (the arc) but
// NEAR in space, and join them with a short, STRAIGHT/L, single-file chord that ABORTS rather than make a 2x2.
// The loop it closes = chord + arc; accepted ONLY if that is < 40% of the corridor -> never a floor-dominating
// loop, never a perimeter ring. Straight chord => length == span (no jog inflation).
function addShortcuts(G,r){
  var W=G[0].length,H=G.length,cap=Math.max(3,Math.round(Math.min(W,H)*0.20)),nShort=ri(r,2,4),made=0,tr=nShort*30,minArc=8;
  function corridorList(){var a=[];for(var yy=0;yy<H;yy++)for(var xx=0;xx<W;xx++)if(G[yy][xx]==='.')a.push([xx,yy]);return a;}
  function carveCleanChord(p,q){
    var orders=[['x','y'],['y','x']];
    for(var oi=0;oi<orders.length;oi++){
      var cx=p[0],cy=p[1],cells=[],ok=true;
      orders[oi].forEach(function(ax){var tgt=(ax==='x')?q[0]:q[1];while((ax==='x'?cx:cy)!==tgt){var s=(ax==='x')?(q[0]>cx?1:-1):(q[1]>cy?1:-1);if(ax==='x')cx+=s;else cy+=s;if(cx===q[0]&&cy===q[1])return;cells.push([cx,cy]);}});
      for(var i=0;i<cells.length&&ok;i++){var xx=cells[i][0],yy=cells[i][1];if(!inb(G,xx,yy)||G[yy][xx]!=='#'){ok=false;break;}}
      if(!ok)continue;
      var carved=[];for(i=0;i<cells.length;i++){var xx=cells[i][0],yy=cells[i][1];if(makes2x2(G,xx,yy)){ok=false;break;}G[yy][xx]='.';carved.push([xx,yy]);}
      if(ok)return true; carved.forEach(function(c){G[c[1]][c[0]]='#';});
    }
    return false;
  }
  var corrSize=corridorList().length;
  while(made<nShort && corrSize>=28 && tr-->0){
    var cl=corridorList();if(!cl.length)break;
    var p=cl[ri(r,0,cl.length-1)];
    var dist={},q0=[p];dist[p[0]+','+p[1]]=0;var head=0;
    while(head<q0.length){var c=q0[head++];var dc=dist[c[0]+','+c[1]];[[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){var nx=c[0]+d[0],ny=c[1]+d[1],k=nx+','+ny;if(G[ny]&&G[ny][nx]==='.'&&dist[k]===undefined){dist[k]=dc+1;q0.push([nx,ny]);}});}
    var best=null,bestg=-1;
    for(var qi=0;qi<cl.length;qi++){var qq=cl[qi],gd=dist[qq[0]+','+qq[1]];if(gd===undefined||gd<minArc)continue;var span=Math.abs(qq[0]-p[0])+Math.abs(qq[1]-p[1]);if(span<2||span>cap)continue;if((gd+span)>0.40*corrSize)continue;if(gd>bestg){bestg=gd;best=qq;}}
    if(!best||!carveCleanChord(p,best))continue;
    made++;
  }
}
// THIN every 2x2 corridor widening (junctions included) back to single-file: remove any corridor cell that is
// part of a 2x2 all-floor block WHEN its removal keeps the corridor connected (a flood proves it). 1-wide loops
// survive (they are never 2x2); only thick blobs get pared. Run BEFORE rooms bud, while corridors are the only
// floor, so it never touches room interiors.
function thinCorridors(G){
  var W=G[0].length,H=G.length;
  function inA(x,y){return x>=0&&x<W&&y>=0&&y<H;}
  function in2x2(x,y){for(var q=0;q<4;q++){var ax=x-[0,1,0,1][q],ay=y-[0,0,1,1][q];if(inA(ax,ay)&&inA(ax+1,ay+1)&&G[ay][ax]==='.'&&G[ay][ax+1]==='.'&&G[ay+1][ax]==='.'&&G[ay+1][ax+1]==='.')return true;}return false;}
  function floors(){var t=0;for(var y=0;y<H;y++)for(var x=0;x<W;x++)if(G[y][x]==='.')t++;return t;}
  function floodCount(){var sx=-1,sy=-1,y,x;for(y=0;y<H&&sx<0;y++)for(x=0;x<W;x++)if(G[y][x]==='.'){sx=x;sy=y;break;}if(sx<0)return 0;
    var seen={},st=[[sx,sy]],cnt=0;seen[sx+','+sy]=1;while(st.length){var c=st.pop();cnt++;[[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){var nx=c[0]+d[0],ny=c[1]+d[1],k=nx+','+ny;if(inA(nx,ny)&&G[ny][nx]==='.'&&!seen[k]){seen[k]=1;st.push([nx,ny]);}});}return cnt;}
  var fl=floors(),changed=true,pass=0;
  while(changed&&pass++<40){changed=false;
    for(var y=1;y<H-1;y++)for(var x=1;x<W-1;x++){
      if(G[y][x]!=='.'||!in2x2(x,y))continue;
      G[y][x]='#'; if(floodCount()===fl-1){fl--;changed=true;} else G[y][x]='.';
    }
  }
}
// prune any NAKED corridor dead-end (a 1-wide tip whose terminus is unpaid — no room door and no secret tell
// beside it); iterate to a fixed point. A tip that ends at a '+' door, a secret ('$'/'?'/'/'), or a stair is
// PAID and preserved. Safe to run after fixLeaks: removing a degree-1 tip can never open a corner (it only
// removes floor) and never disconnects the region (a leaf).
function cullDeadEnds(G){
  var W=G[0].length,H=G.length,changed=true,pass=0;
  while(changed&&pass++<40){changed=false;
    for(var y=1;y<H-1;y++)for(var x=1;x<W-1;x++){ if(G[y][x]!=='.')continue;
      var nb=0,paid=false;[[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){var c=G[y+d[1]][x+d[0]];if(c==='.'||c==='+'||c==='@'||c==='>'||c==='<'||c==='~')nb++;if(c==='+'||c==='$'||c==='?'||c==='/'||c==='>'||c==='<'||c==='@')paid=true;});
      if(nb<=1&&!paid){G[y][x]='#';changed=true;}
    }
  }
}

// ---------- ROUND 2: rooms BUD OFF the corridor (one door by default) ----------
// A room hangs off a corridor wall, extending AWAY into open rock, joined by EXACTLY ONE door -> a room is a
// DESTINATION you enter on purpose, not a hallway with furniture. dir points outward from the corridor.
function tryBud(G,cx,cy,dx,dy,shape,r){
  var d=shapeDims(r,shape),w=d[0],h=d[1],nx,ny,doorX=cx+dx,doorY=cy+dy;   // door = the wall cell just outside the corridor
  if(dx!==0){ // horizontal bud (east/west): room to the side of the corridor
    nx=(dx>0)?(cx+2):(cx-1-w); ny=cy-(h>>1);
  } else {    // vertical bud (north/south)
    ny=(dy>0)?(cy+2):(cy-1-h); nx=cx-(w>>1);
  }
  if(!boxClear(G,nx,ny,w,h))return null;
  // the door must sit in the wall BETWEEN the corridor cell and the room, aligned to a room floor cell.
  if(dx!==0){ doorY=cy; if(doorY<ny||doorY>ny+h-1)doorY=ny+(h>>1); }
  else { doorX=cx; if(doorX<nx||doorX>nx+w-1)doorX=nx+(w>>1); }
  var rm={x:nx,y:ny,w:w,h:h,cx:nx+(w>>1),cy:ny+(h>>1),shape:shape,doors:1};
  paintShape(G,rm,r);
  G[doorY][doorX]='+';
  return rm;
}
function genArch(W,H,r,roomTarget,skin,depth,archetype){
  var G=fill(W,H,'#'),rooms=[],budget={cave:1};
  var route=carveRoute(G,r);   // (carveRoute thins the spine to single-file internally, then adds bounded loops)
  // gather BUD SITES: a corridor '.' cell with a wall neighbour that opens onto rock (room space beyond).
  var sites=[];
  for(var y=1;y<H-1;y++)for(var x=1;x<W-1;x++){ if(G[y][x]!=='.')continue;
    [[0,-1],[0,1],[-1,0],[1,0]].forEach(function(dd){var dx=dd[0],dy=dd[1];var wx=x+dx,wy=y+dy,bx=x+2*dx,by=y+2*dy;if(inb(G,bx,by)&&G[wy][wx]==='#'&&G[by][bx]==='#')sites.push({x:x,y:y,dx:dx,dy:dy});});
  }
  for(var i=sites.length-1;i>0;i--){var j=ri(r,0,i),t=sites[i];sites[i]=sites[j];sites[j]=t;}
  // rooms bud off the route (varied shapes) — destinations along + off it. Target scales UP with corridor length
  // so a long winding route stays ROOM-dominant (keeps the corridor share honest), capped by available sites.
  var corrLen=0;for(y=0;y<H;y++)for(x=0;x<W;x++)if(G[y][x]==='.')corrLen++;
  var target=Math.max(8,roomTarget+2,Math.round(corrLen/4.5)), si=0, guard=sites.length*3;
  while(rooms.length<target && si<sites.length && guard-->0){
    var s=sites[si++];
    if(G[s.y][s.x]!=='.')continue;   // the site's corridor cell may have been consumed
    var rm=tryBud(G,s.x,s.y,s.dx,s.dy,pickShape(r,budget),r);
    if(rm)rooms.push(rm);
  }
  // TRAVERSE — the up + down stairs go in the room NEAREST the up-waypoint and the room NEAREST the down-
  // waypoint (the two ends of the crooked route, on OPPOSITE sides of the floor by the seeded orientation).
  function nearestRoom(pt){var best=1e9,br=null;rooms.forEach(function(rm){var d=Math.abs(rm.cx-pt.x)+Math.abs(rm.cy-pt.y);if(d<best){best=d;br=rm;}});return br;}
  var upRoom=nearestRoom(route.up), downRoom=nearestRoom(route.down);
  if(upRoom===downRoom){var dMax=-1;rooms.forEach(function(rm){if(rm===upRoom)return;var d=Math.abs(rm.cx-upRoom.cx)+Math.abs(rm.cy-upRoom.cy);if(d>dMax){dMax=d;downRoom=rm;}});}
  if(upRoom){upRoom.hub=true;upRoom.landmark=true;}
  // ROOMS OFF ROOMS (nested suites — an office behind an office, very Bureau): bud an INNER chamber off a
  // room's FAR wall (away from its door), joined by one more door. Depth up to 3. Inner rooms are destinations
  // + loot sites too. Try on a fraction of rooms so most floors carry at least one suite.
  function budInner(outer){
    var sides=[[0,-1],[0,1],[-1,0],[1,0]];
    for(var i=sides.length-1;i>0;i--){var j=ri(r,0,i),t=sides[i];sides[i]=sides[j];sides[j]=t;}
    for(var k=0;k<4;k++){
      var dx=sides[k][0],dy=sides[k][1];
      // a corridor cell just outside this wall means it's the door side (skip — inner rooms go into rock)
      var midx=outer.cx+dx*((outer.w>>1)+1),midy=outer.cy+dy*((outer.h>>1)+1);
      if(!inb(G,midx,midy)||G[midy][midx]!=='#')continue;
      var w=ri(r,3,5),h=ri(r,3,4),nx,ny,doorX,doorY;   // inner suite chambers are SMALL, so they fit behind the outer often
      if(dx!==0){nx=(dx>0)?(outer.x+outer.w+1):(outer.x-1-w);ny=outer.cy-(h>>1);doorX=(dx>0)?(outer.x+outer.w):(outer.x-1);doorY=outer.cy;}
      else{ny=(dy>0)?(outer.y+outer.h+1):(outer.y-1-h);nx=outer.cx-(w>>1);doorY=(dy>0)?(outer.y+outer.h):(outer.y-1);doorX=outer.cx;}
      if(!boxClear(G,nx,ny,w,h))continue;
      if(dx!==0){if(doorY<ny||doorY>ny+h-1)doorY=ny+(h>>1);}else{if(doorX<nx||doorX>nx+w-1)doorX=nx+(w>>1);}
      var inner={x:nx,y:ny,w:w,h:h,cx:nx+(w>>1),cy:ny+(h>>1),shape:'rect',doors:1,nested:(outer.nested||1)+1};
      paintShape(G,inner,r);G[doorY][doorX]='+';outer.doors=(outer.doors||1)+1;   // the outer room now has 2 doors (its corridor door + the inner passage) -> it reads as a suite, capped
      return inner;
    }
    return null;
  }
  // DOOR MIX via NESTING (the two-door rooms are the SUITE OUTERS — corridor door + nested passage — so the
  // 2-door cap is guaranteed BY CONSTRUCTION: a room budded off a corridor gets at most its corridor door + one
  // inner-suite door). Most rooms stay single-door; ~30% of eligible rooms open a suite -> ~25% two-door.
  var suites=0;
  rooms.slice().forEach(function(rm){
    if(rm===upRoom||rm===downRoom||(rm.nested||1)>=3||(rm.doors||1)>=2)return;
    if(r()<0.42){ var inner=budInner(rm); if(inner){rooms.push(inner);suites++; if(r()<0.30&&inner.nested<3){var i2=budInner(inner);if(i2)rooms.push(i2);}} }
  });
  cullDeadEnds(G);   // prune any naked corridor stub the route left (rooms + their doors are protected)
  addShortcuts(G,r); // NOW add the bounded optionality loops, sized against the SETTLED corridor (post-cull) so
                     // no shortcut loop can ever exceed the RING-BAN threshold
  // STAIRS AT ROOM CENTRES (KEEP): up '@' at the up-waypoint room, down '>' at the down-waypoint room.
  var uR=upRoom||rooms[0], dR=downRoom;
  if(!dR){var fd=-1;rooms.forEach(function(rr){if(rr===uR)return;var dd=Math.abs(rr.cx-uR.cx)+Math.abs(rr.cy-uR.cy);if(dd>fd){fd=dd;dR=rr;}});}
  if(uR)G[uR.cy][uR.cx]='@';
  if(dR&&dR!==uR)G[dR.cy][dR.cx]='>';
  return {grid:G,rooms:rooms,route:route,archetype:archetype||'traverse',upRoom:uR,downRoom:dR,suites:suites};
}

// TOPOLOGY VALIDATOR — the SAME hard bars the checker (tests/run_gen2_shaper.py) enforces, ported so a worked
// floor can VALIDATE ITSELF and a bad candidate can be rejected + reseeded (the generate-and-reject pattern, like
// the leak gate). Thresholds carry HEADROOM under the checker's so tiny measurement differences never leak a
// failing floor. Returns null (accept) or a short reason string (reject).
function _workedReject(G){
  var H=G.length,W=G[0].length,y,x;
  function cp(px,py){var c=G[py]&&G[py][px];return c==='.'||c==='~'||c==='<'||c==='>'||c==='@';}
  var seen={},comps=[];
  for(y=0;y<H;y++)for(x=0;x<W;x++){ if(!cp(x,y)||seen[x+','+y])continue; var st=[[x,y]],cs=[];seen[x+','+y]=1;
    while(st.length){var c=st.pop();cs.push(c);[[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){var nx=c[0]+d[0],ny=c[1]+d[1],k=nx+','+ny;if(cp(nx,ny)&&!seen[k]){seen[k]=1;st.push([nx,ny]);}});}
    comps.push(cs); }
  var cset={},corr=[],roomCells=0,maxRoom=0;
  comps.forEach(function(cc){var mnx=1e9,mxx=-1,mny=1e9,mxy=-1;cc.forEach(function(c){if(c[0]<mnx)mnx=c[0];if(c[0]>mxx)mxx=c[0];if(c[1]<mny)mny=c[1];if(c[1]>mxy)mxy=c[1];});
    var bw=mxx-mnx+1,bh=mxy-mny+1,fill=cc.length/(bw*bh);
    if(bw>=3&&bh>=3&&fill>=0.45){roomCells+=cc.length;if(cc.length>maxRoom)maxRoom=cc.length;}
    else cc.forEach(function(c){cset[c[0]+','+c[1]]=1;corr.push(c);}); });
  var walk=0;for(y=0;y<H;y++)for(x=0;x<W;x++){var c=G[y][x];if(c==='.'||c==='~'||c==='<'||c==='>'||c==='@'||c==='+')walk++;}
  var V=corr.length; if(!walk)return 'nowalk';
  if(Math.round(100*roomCells/walk)<63)return 'cover';                 // rooms dominate (checker: >=60)
  if(maxRoom<22)return 'land';                                         // a hall landmark (checker: >=18)
  var wide=0;corr.forEach(function(c){var xx=c[0],yy=c[1],b=false;[[0,0],[-1,0],[0,-1],[-1,-1]].forEach(function(o){if(cset[(xx+o[0])+','+(yy+o[1])]&&cset[(xx+o[0]+1)+','+(yy+o[1])]&&cset[(xx+o[0])+','+(yy+o[1]+1)]&&cset[(xx+o[0]+1)+','+(yy+o[1]+1)])b=true;});if(b)wide++;});
  if(V&&Math.round(100*wide/V)>6)return 'wide';                        // single-file (checker: <10%)
  var naked=0;corr.forEach(function(c){var xx=c[0],yy=c[1],nb=0,paid=false;[[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){if(cset[(xx+d[0])+','+(yy+d[1])])nb++;var gc=G[yy+d[1]]&&G[yy+d[1]][xx+d[0]];if(gc==='+'||gc==='$'||gc==='?'||gc==='/'||gc==='<'||gc==='>'||gc==='@')paid=true;});if(nb<=1&&!paid)naked++;});
  if(naked>0)return 'naked';
  var over50=0,over70=false;
  for(y=0;y<H;y++){var run=0;for(x=0;x<=W;x++){if(x<W&&cset[x+','+y])run++;else{if(run>0.50*W)over50++;if(run>0.70*W)over70=true;run=0;}}}
  for(x=0;x<W;x++){var rv=0;for(y=0;y<=H;y++){if(y<H&&cset[x+','+y])rv++;else{if(rv>0.50*H)over50++;if(rv>0.70*H)over70=true;rv=0;}}}
  if(over50>1||over70)return 'straightrun';
  // RING BAN — minimal cycle per non-tree edge (delete edge, shortest path + 1). Reject a floor-dominating loop
  // (>44% of corridor) or a floor-spanning wall-hugging perimeter ring.
  function inPerim(px,py){return px<4||px>=W-4||py<4||py>=H-4;}
  var par={},sp={};
  if(V){var root=corr[0][0]+','+corr[0][1],q2=[corr[0]];par[root]='';sp[root]=1;while(q2.length){var c=q2.shift();[[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){var nx=c[0]+d[0],ny=c[1]+d[1],k=nx+','+ny;if(cset[k]&&!sp[k]){sp[k]=1;par[k]=c[0]+','+c[1];q2.push([nx,ny]);}});}}
  function pathKeys(ak,bk){var q=[ak.split(',').map(Number)],pv={};pv[ak]=1;while(q.length){var c=q.shift(),ck=c[0]+','+c[1];if(ck===bk){var out=[ck],k=ck;while(pv[k]!==1){out.push(pv[k]);k=pv[k];}return out;}for(var d4=0;d4<4;d4++){var dd=[[1,0],[-1,0],[0,1],[0,-1]][d4],nx=c[0]+dd[0],ny=c[1]+dd[1],nk=nx+','+ny;if(!cset[nk]||pv[nk])continue;if((ck===ak&&nk===bk)||(ck===bk&&nk===ak))continue;pv[nk]=ck;q.push([nx,ny]);}}return null;}
  var edgeSeen={},bad=null;
  corr.forEach(function(c){if(bad)return;var xk=c[0]+','+c[1];[[1,0],[0,1]].forEach(function(d){if(bad)return;var nx=c[0]+d[0],ny=c[1]+d[1],nk=nx+','+ny;if(!cset[nk])return;var ek=xk+'|'+nk;if(edgeSeen[ek])return;edgeSeen[ek]=1;if(par[nk]===xk||par[xk]===nk)return;
    var pth=pathKeys(xk,nk);if(!pth)return;var len=pth.length;if(V&&len/V>0.44){bad='ring';return;}
    var pin=0,mnx=1e9,mxx=-1,mny=1e9,mxy=-1;pth.forEach(function(k){var pp=k.split(',');var px=+pp[0],py=+pp[1];if(inPerim(px,py))pin++;if(px<mnx)mnx=px;if(px>mxx)mxx=px;if(py<mny)mny=py;if(py>mxy)mxy=py;});
    if(len>=0.25*V&&(mxx-mnx+1)>0.50*W&&(mxy-mny+1)>0.50*H&&len&&pin/len>0.40){bad='perimring';} });});
  return bad;
}
function generateLevel(seed,opts){
  opts=opts||{};var size=opts.size||'regular',grammar=opts.grammar||'worked',skin=opts.skin||'stone';
  var sz=SIZES[size]||SIZES.regular;
  // SIZE VARIATION: roll the floor dims TRUE +-20% around native BOTH ways (regular -> ~43..65 x 27..41),
  // rooms scale with area, so footprints visibly vary run to run. The frame is LIFTED: mapmode's
  // composeNodeGen2 adopts the grid's actual dims (no fixed 54x34 read-frame), so larger floors render in
  // full. fixedSize pins native 54x34 (sim reference); maxSize forces the +20% extreme.
  // BUILD one candidate from a given rng; the worked grammar VALIDATES it (below) and reseeds a rejected floor.
  function build(r){
    var W=sz.W,H=sz.H,rooms=sz.rooms,G;
    if(!opts.fixedSize){
      W=ri(r,Math.round(sz.W*0.8),Math.round(sz.W*1.2)); H=ri(r,Math.round(sz.H*0.8),Math.round(sz.H*1.2));   // TRUE +-20% around native (frame lifted: mapmode reads the real dims)
      rooms=Math.max(6,Math.round(sz.rooms*(W*H)/(sz.W*sz.H)));
    } else if(opts.maxSize){ W=Math.round(sz.W*1.2); H=Math.round(sz.H*1.2); rooms=Math.max(6,Math.round(sz.rooms*(W*H)/(sz.W*sz.H))); }   // sim worst case: the LARGEST floor (most foes)
    var rmList=null,archetype='traverse';
    if(grammar==='worked'){archetype=pickArchetype(r); var wk2=ALLOW_LEGACY?genWorked(W,H,r,rooms,skin):genArch(W,H,r,rooms,skin,opts.depth||1,archetype); G=wk2.grid; rmList=wk2.rooms;}
    else if(grammar==='cave')G=genCave(W,H,r);
    else if(grammar==='spine')G=genSpine(W,H,r);
    else G=genWarren(W,H,r);
    if(skin==='ruin')applyRuin(G,r);if(skin==='flooded')applyFlood(G,r);
    ensureConnected(G);if(ALLOW_LEGACY&&typeof cleanDoors==='function')cleanDoors(G,r);   // the new shaper keeps its '+' doors (one per room); cleanDoors is legacy-only
    var got=plantSecretsFromDeadEnds(G,r,2);if(got<1)carveAlcoveAnywhere(G,r);
    fixLeaks(G);   // AFTER the corridor logic AND the secret/alcove carving (both add floor) -> seals every pinch; stairs below add no new walkable, so they can't reopen one (and fixLeaks must precede them: it would overwrite a '<' which is non-WALK)
    if(grammar==='worked'&&!ALLOW_LEGACY)cullDeadEnds(G);   // fixLeaks can leave a fresh 1-cell stub; prune any UNPAID tip it made (removing floor can't reopen a corner; secrets/doors/stairs are preserved)
    var up=null,down=null,y,x;
    for(y=0;y<H;y++)for(x=0;x<W;x++){if(G[y][x]==='@'){G[y][x]='<';up={x:x,y:y};}else if(G[y][x]==='>')down={x:x,y:y};}
    if(!up){for(y=0;y<H&&!up;y++)for(x=0;x<W;x++)if(G[y][x]==='.'){G[y][x]='<';up={x:x,y:y};break;}}
    if(!down&&up){var bd=-1;for(y=0;y<H;y++)for(x=0;x<W;x++)if(G[y][x]==='.'){var d=Math.abs(x-up.x)+Math.abs(y-up.y);if(d>bd){bd=d;down={x:x,y:y};}}if(down)G[down.y][down.x]='>';}
    // FEATURES stamped AFTER stairs (so they avoid '<'/'>') — depth-selected, sparse, law-safe. The live leak
    // gate (mapmode gen2Clean) re-measures the final grid and reseeds any feature that breaks leaks/regions/stairs.
    var features=(rmList && grammar==='worked') ? stampFeatures(G,rmList,r,opts.depth||1,{up:up,down:down}) : [];
    return {grid:G,w:W,h:H,up:up,down:down,features:features,archetype:archetype};
  }
  var base=(seed>>>0)||1;
  // worked grammar: generate-and-REJECT — try reseeds until the floor passes the topology bars (attempt 0 uses
  // the plain seed so the vast majority of floors are UNCHANGED; only the rare outlier gets a different draw).
  if(grammar==='worked'&&!ALLOW_LEGACY){
    var res=null,K=24;
    for(var att=0;att<K;att++){
      var rv=mulberry32(att===0?base:((base^((att*0x9E3779B1)>>>0))>>>0||1));
      res=build(rv);
      if(!_workedReject(res.grid)){res._tries=att+1;return res;}
    }
    res._tries=K;return res;   // exhausted (vanishingly rare): return the last candidate rather than nothing
  }
  return build(mulberry32(base));
}
return { generateLevel: generateLevel, SIZES: SIZES, measure: measure, ARCHETYPES: ARCHETYPES, _workedReject: _workedReject };
})();
if (typeof module !== "undefined" && module.exports) module.exports = TD_GEN2;
