// Tourist Dungeon — THE ASSEMBLER (Master Directive P2). Builds dungeon levels whose ROOMS
// ARE AUTHORED VAULTS (stamped from TD_VAULTLIB via the TD_VAULTFMT parser, variation chunks
// resolved) hung off a corridor spine — never blank rectangles.
//
//  - SPINE = a thin corridor lattice: a 1-row tooth above each band + flanking left/right
//    trunks. Circulation only; a tiny MINORITY of the floor.
//  - ROOMS are the BULK: each band is a row of AUTHORED VAULTS, selected by height tier +
//    weight and STAMPED (their walls/pillars/loot/irregular shapes are the room character),
//    placed adjacent (shared wall = spacing law), each wired to the tooth through a real door.
//
// Output (for TD_LAWS.check + the renderer):
//   { w, h, grid, tag, entry, stairs, rooms:[{name,...}], type, minRooms }
//
// LOAD ORDER (REQUIRED): rng.js, vaultfmt.js, vaultlib.js, lawsuite.js, assembler.js.
//   The assembler PARSES + STAMPS authored vaults, so it HARD-DEPENDS on TD_VAULTFMT and
//   TD_VAULTLIB. Without them generate() THROWS (it used to return null silently — which read
//   as "0/60, generates nothing" in a harness that forgot the deps). TD_LAWS is needed only by
//   the gated entry points (generateGated / generateForLevel).
// Classic script: assigns global TD_ASSEMBLER.
"use strict";

var TD_ASSEMBLER = (function () {

  // bandH (room height between teeth) is decoupled from room WIDTH so "large rooms" = wide,
  // not tall — bandH sets coverage, kept so L3 lands in 35-55%. Each band = a WINDING tooth
  // (2 rows: sr, sr+1) + gutter + bandH room rows + gutter, so sweepGap = bandH + 4.
  var BUNDLES = {
    STANDARD: { w: 49, h: 35, tiers: [5, 6, 7], loops: [3, 4], minRooms: 9, trunkW: 2 },
    WARREN:   { w: 47, h: 33, tiers: [5, 6, 7], loops: [3, 5], minRooms: 9, trunkW: 1 },
    HALLS:    { w: 53, h: 37, tiers: [6, 7], loops: [2, 3], minRooms: 6, trunkW: 2 },
    // NODE — a single dungeon GRAPH-NODE floor at the controller's 41x23 (smaller leaves so a
    // tight floor still scatters a few authored vaults). Used by TD_MAP.composeNode (Option A).
    NODE:     { w: 41, h: 23, tiers: [5, 6], loops: [1, 2], minRooms: 4, trunkW: 1, minW: 8, minH: 7, maxW: 12, maxH: 9 }
  };
  var D4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  // ---- TYPE STANDARD parameters + per-level DRIFT (Dungeon Type STANDARD v1). paramsFor
  // rolls a drift band per (seed, level) — 50% base / 20% ±5% / 20% ±10% / 10% ±15% — and
  // jitters each numeric knob within it, yielding the level's TARGET BAND. The gate validates
  // each level against THIS band (a +15% outlier is sanctioned, not a failure). ----
  var STANDARD_BASE = { roomMin: 10, roomMax: 20, sizeSpreadMax: 3, regularMax: 0.50, straightMax: 0.30, corridorMin: 0.20, deadEndsMin: 1, secretsMin: 3, loopsMin: 1 };
  function _h(a, b, c) { var h = (a >>> 0) ^ 0x9e3779b9; h = Math.imul(h ^ (b >>> 0), 16777619) >>> 0; h = Math.imul(h ^ ((c || 0) >>> 0), 16777619) >>> 0; return h >>> 0; }
  function driftBandOf(seed, level) { var r = (_h(seed, level, 7) % 1000) / 1000; return r < 0.5 ? 0 : (r < 0.7 ? 0.05 : (r < 0.9 ? 0.10 : 0.15)); }
  function paramsFor(seed, level) {
    var band = driftBandOf(seed, level), rng = TD_RNG.make(_h(seed, level, 13) || 1);
    function roll() { return (rng.next() * 2 - 1) * band; }                  // signed jitter in [-band, +band]
    function cl(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
    var B0 = STANDARD_BASE;
    return {
      drift: band,
      roomMin: B0.roomMin,                                                    // hard floor — never drifts below 10
      roomMax: Math.max(B0.roomMin, Math.round(B0.roomMax * (1 + roll()))),
      sizeSpreadMax: B0.sizeSpreadMax,
      regularMax: cl(B0.regularMax * (1 + roll()), 0.20, 0.80),
      straightMax: cl(B0.straightMax * (1 + roll()), 0.12, 0.50),
      corridorMin: cl(B0.corridorMin * (1 + roll()), 0.12, 0.35),
      deadEndsMin: B0.deadEndsMin,
      secretsMin: Math.max(1, Math.round(B0.secretsMin * (1 + roll()))),
      loopsMin: B0.loopsMin
    };
  }

  function generate(seed, typeName) {
    var B = BUNDLES[typeName] || BUNDLES.STANDARD;
    var rng = TD_RNG.make(((seed >>> 0) ^ 0x1a2b3c4d) || 1);
    var W = B.w, H = B.h, grid = [], tag = [];
    for (var y = 0; y < H; y++) { var gr = [], tr = []; for (var x = 0; x < W; x++) { gr.push("#"); tr.push("wall"); } grid.push(gr); tag.push(tr); }
    function inb(x, y) { return x >= 1 && y >= 1 && x < W - 1 && y < H - 1; }
    function walk(x, y) { return x >= 0 && y >= 0 && x < W && y < H && grid[y][x] !== "#"; }
    function setc(x, y, g, t) { grid[y][x] = g; tag[y][x] = t; }
    function carveC(x, y) { if (inb(x, y) && grid[y][x] === "#") setc(x, y, ".", "corridor"); }

    var corridorCells = [];
    function push(x, y) { corridorCells.push([x, y]); }

    // THE WIRE-IN: rooms ARE authored vaults. The assembler PARSES the vault library
    // (TD_VAULTLIB via TD_VAULTFMT) and STAMPS a selected vault into each room slot, resolving
    // its variation chunks — it never draws a blank rectangle. The spine (winding teeth + a thin
    // trunk) is circulation ONLY; the rooms' character (pillars, irregular walls, loot, secret
    // caches) comes entirely from the authored vaults.
    if (typeof TD_VAULTFMT === "undefined" || typeof TD_VAULTLIB === "undefined")
      throw new Error("TD_ASSEMBLER needs TD_VAULTFMT (vaultfmt.js) + TD_VAULTLIB (vaultlib.js) loaded BEFORE assembler.js. Load order: rng.js, vaultfmt.js, vaultlib.js, lawsuite.js, assembler.js.");
    var POOL = TD_VAULTLIB.all(), trunkW = B.trunkW || 2, TIERS = B.tiers || [5, 6, 7];

    // vault tag -> the assembler/law vocabulary. Walkable: room/door/stair/feature; else wall
    // (a pillar 'o' and a secret-cache '?' are authored rock inside the room — they render as #).
    function mapTag(t) {
      if (t === "floor" || t === "loot" || t === "landmark") return "room";   // $/G are floor here (room); their CONTENT is a runtime concern. Keeping them "room" preserves room connectivity, so a $/G in a pillared vault's middle row doesn't split its floor into doorless sub-regions (D1/L11).
      if (t === "water") return "feature";
      if (t === "door") return "door";
      if (t === "stair") return "stair";
      return "wall";                                                          // wall, pillar (o), secret cache (?) -> authored rock, renders as #
    }
    // a WINDING tooth in rows [sr, sr+1] running trunk-to-trunk: horizontal runs of <=3 then a
    // 1-cell vertical jog, so corridor straight-runs stay <=30% (no straight filing-cabinet lane).
    function windTooth(sr) {
      var up = sr, low = sr + 1, x = 1, row = up;
      carveC(x, row); push(x, row);
      while (x < W - 2) {
        var lim = Math.min(2, (W - 2) - x);
        for (var k = 0; k < lim; k++) { x++; carveC(x, row); push(x, row); }
        if (x < W - 2) { row = (row === up) ? low : up; carveC(x, row); push(x, row); }
      }
      carveC(W - 2, row); push(W - 2, row);
    }
    function weightedPick(cands) {
      var tot = 0, i; for (i = 0; i < cands.length; i++) tot += (cands[i].weight || 10);
      var r = rng.int(0, tot - 1), acc = 0;
      for (i = 0; i < cands.length; i++) { acc += (cands[i].weight || 10); if (r < acc) return cands[i]; }
      return cands[cands.length - 1];
    }
    function isSecretVault(v) { return v.tags && v.tags.indexOf("secret") >= 0; }
    // stamp a resolved vault at (ox, oy). asCache => a hidden CACHE: its interior is tagged
    // "feature" (not "room"), so a tiny secret vault is content behind a secret door, not a
    // room that would trip L8/L11. Returns the placed record (name + bbox + interior cells).
    function stampVault(v, ox, oy, pseed, asCache) {
      var r = TD_VAULTFMT.resolve(v, pseed), floor = [];
      for (var yy = 0; yy < r.h; yy++) for (var xx = 0; xx < r.w; xx++) {
        var gx = ox + xx, gy = oy + yy;
        if (!(gx >= 1 && gy >= 1 && gx < W - 1 && gy < H - 1)) continue;
        var mt = mapTag(r.tags[yy][xx]);
        if (asCache && mt === "room") mt = "feature";
        setc(gx, gy, r.grid[yy][xx], mt);
        if (mt === "room" || (asCache && mt === "feature")) floor.push([gx, gy]);
      }
      return { name: v.name, x0: ox, y0: oy, x1: ox + r.w - 1, y1: oy + r.h - 1, floor: floor, vault: v, cache: !!asCache };
    }
    // connect a CACHE up to the tooth via a SECRET door (telegraphed at runtime) above a feature
    // cell — the Secret Grammar / Purpose law: secret content reached only through a secret.
    function connectCache(p) {
      var bTop = p.y0, tRow = bTop - 1, dcol = -1, x;
      for (x = p.x0 + 1; x <= p.x1 - 1; x++) if (grid[bTop][x] === "#" && tag[bTop + 1] && tag[bTop + 1][x] === "feature") { setc(x, bTop, ".", "secret"); dcol = x; break; }
      if (dcol < 0) return false;
      if (grid[tRow][dcol] === "#") { setc(dcol, tRow, ".", "corridor"); push(dcol, tRow); }
      p.cx = dcol; p.cy = bTop + 1; return true;
    }
    // connect a stamped vault UP to the tooth directly above its top wall (tRow = p.y0 - 1). The
    // connect door must sit above a ROOM cell (so the room component owns a door onto a corridor,
    // D1) — never above a feature/pillar. Prefer an authored top-edge door; else punch one.
    function connectUp(p) {
      var bTop = p.y0, tRow = bTop - 1, dcol = -1, x;
      for (x = p.x0 + 1; x <= p.x1 - 1; x++) if (tag[bTop][x] === "door" && tag[bTop + 1] && tag[bTop + 1][x] === "room") { dcol = x; break; }
      if (dcol < 0) for (x = p.x0 + 1; x <= p.x1 - 1; x++) if (grid[bTop][x] === "#" && tag[bTop + 1] && tag[bTop + 1][x] === "room") { setc(x, bTop, ".", "door"); dcol = x; break; }
      if (dcol < 0) return false;                             // no room cell under the top wall (rejected upstream)
      if (grid[tRow][dcol] === "#") { setc(dcol, tRow, ".", "corridor"); push(dcol, tRow); }   // ensure the tooth meets the door
      p.cx = dcol; p.cy = bTop + 1; return true;
    }
    // seal every door that does NOT open onto walkable cells on both sides, so each surviving
    // door is a clean through-passage (L4). Run to a FIXPOINT over ALL doors: sealing a dangling
    // door can strand its neighbour door, so one pass is not enough. Connect doors survive (their
    // tooth-corridor side is never a door, so they stay through). Adjacent vaults whose facing
    // edge doors line up also stay open — a free authored room<->room link.
    function sealDoorsFixpoint() {
      var changed = true;
      while (changed) {
        changed = false;
        for (var y = 1; y < H - 1; y++) for (var x = 1; x < W - 1; x++) {
          if (tag[y][x] === "door") {
            // match L4 EXACTLY: a clean threshold = walkable on two OPPOSITE sides AND wall on the
            // other two. A junction-adjacent door (walkable on 3+ sides) is NOT clean -> seal it.
            var thru = (walk(x, y - 1) && walk(x, y + 1) && !walk(x - 1, y) && !walk(x + 1, y)) ||
                       (walk(x - 1, y) && walk(x + 1, y) && !walk(x, y - 1) && !walk(x, y + 1));
            if (!thru) { setc(x, y, "#", "wall"); changed = true; }
          }
        }
      }
    }

    // ---- BSP SCATTER + WINDING TUNNELS (Amendment 4). Partition the floor into IRREGULAR leaves
    // (random cuts => varied size & position), drop one authored vault in each leaf (jittered),
    // then wire the vaults with WINDING tunnels. No bands, no aligned rows (L16): varied rooms
    // scattered off winding corridors with honest rock between (the hand sheet). ----
    function roomAdj(x, y) { for (var i = 0; i < 4; i++) { var rr = tag[y + D4[i][1]]; var t = rr && rr[x + D4[i][0]]; if (t === "room" || t === "feature") return true; } return false; }
    // a corridor carved DIAGONALLY beside a room corner makes an 8-way "open corner" (a diagonal
    // step room->corridor bypassing the door — the Brogue rule). roomAdj already bars orthogonal
    // room adjacency, so a diagonal room neighbour always sits behind two walls = a leak: bar it too.
    var DG = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    function roomDiag(x, y) { for (var i = 0; i < 4; i++) { var rr = tag[y + DG[i][1]]; var t = rr && rr[x + DG[i][0]]; if (t === "room" || t === "feature") return true; } return false; }
    function canCarve(x, y) { return inb(x, y) && grid[y][x] === "#" && !roomAdj(x, y) && !roomDiag(x, y); }
    function corrNbrs(x, y) { var c = 0; for (var i = 0; i < 4; i++) { var rr = tag[y + D4[i][1]]; if (rr && rr[x + D4[i][0]] === "corridor") c++; } return c; }
    // straightOK: carving (x,y) must NOT complete a >=4 colinear corridor run (GLOBAL cap, across
    // paths) — this is what holds straightness <=30% no matter how corridors meet.
    function straightOK(x, y) {
      function rl(dx, dy) { var n = 1, a = x + dx, b = y + dy; while (tag[b] && tag[b][a] === "corridor") { n++; a += dx; b += dy; } a = x - dx; b = y - dy; while (tag[b] && tag[b][a] === "corridor") { n++; a -= dx; b -= dy; } return n; }
      return rl(1, 0) <= 3 && rl(0, 1) <= 3;
    }
    function carveOK(x, y) { return canCarve(x, y) && corrNbrs(x, y) <= 1 && straightOK(x, y); }   // thin + no >=4 run -> winding (for connect spines)
    function fillCarve(x, y) { return canCarve(x, y) && straightOK(x, y); }   // filler: denser allowed (chunk rock / raise walkable) but still no >=4 straight run

    var MINW = B.minW || 10, MINH = B.minH || 8, MAXW = B.maxW || 15, MAXH = B.maxH || 10, leaves = [];
    (function bsp(x0, y0, x1, y1, depth) {
      var w = x1 - x0 + 1, h = y1 - y0 + 1;
      var canLR = w >= 2 * MINW + 1, canTB = h >= 2 * MINH + 1, must = (w > MAXW || h > MAXH);
      if (!canLR && !canTB) { leaves.push({ x0: x0, y0: y0, x1: x1, y1: y1 }); return; }
      if (!must && depth >= 3 && rng.chance(0.20)) { leaves.push({ x0: x0, y0: y0, x1: x1, y1: y1 }); return; }
      var lr = (canLR && canTB) ? ((w / MAXW) >= (h / MAXH)) : canLR;
      if (lr) { var c1 = x0 + MINW + rng.int(0, w - 2 * MINW - 1); bsp(x0, y0, c1, y1, depth + 1); bsp(c1 + 1, y0, x1, y1, depth + 1); }
      else { var c2 = y0 + MINH + rng.int(0, h - 2 * MINH - 1); bsp(x0, y0, x1, c2, depth + 1); bsp(x0, c2 + 1, x1, y1, depth + 1); }
    })(1, 1, W - 2, H - 2, 0);

    // one authored vault per leaf, JITTERED within the leaf (random offset => varied positions, no
    // shared edge-lines, honest rock around it). Some leaves get a secret cache; pick varied sizes.
    var rooms = [], fpCount = {};                              // footprint (wxh) counts: cap each at 3 per floor (size_spread <=3)
    function fpKey(v) { return v.w + "x" + v.h; }
    for (var li = 0; li < leaves.length; li++) {
      var L = leaves[li], availW = (L.x1 - L.x0 + 1) - 2, availH = (L.y1 - L.y0 + 1) - 2;   // 1-cell margin per side => 2-cell carveable channel between leaves
      if (availW < 5 || availH < 4) continue;
      var wantCache = rng.chance(0.16);
      var fits = function (v) { return v.w <= availW && v.h <= availH && (fpCount[fpKey(v)] || 0) < 3; };   // cap 3 per footprint
      var cands = POOL.filter(function (v) { return (wantCache ? isSecretVault(v) : !isSecretVault(v)) && fits(v); });
      if (wantCache && !cands.length) { wantCache = false; cands = POOL.filter(function (v) { return !isSecretVault(v) && fits(v); }); }
      if (!cands.length) continue;
      // VARIETY for size-spread: among fitting vaults (footprint not yet maxed) pick from the
      // larger half (keeps coverage up for L3/L9 while spreading footprints so <=3 share a size).
      var v;
      if (wantCache) v = weightedPick(cands);
      else { cands.sort(function (a, b) { return (b.w * b.h) - (a.w * a.h); }); var half = Math.max(1, Math.ceil(cands.length / 2)); v = cands[rng.int(0, half - 1)]; }
      var ox = L.x0 + 1 + rng.int(0, availW - v.w), oy = L.y0 + 1 + rng.int(0, availH - v.h);
      fpCount[fpKey(v)] = (fpCount[fpKey(v)] || 0) + 1;
      rooms.push(stampVault(v, ox, oy, (seed >>> 0) + ox * 131 + oy * 17 + li + 1, wantCache));
    }
    if (rooms.length < Math.min(8, B.minRooms || 8)) return null;

    // each vault: one outward door (authored else punched over a room/feature cell) + its rock
    // APPROACH seeded as corridor — the network anchors.
    function ensureApproach(p) {
      for (var yy = p.y0; yy <= p.y1; yy++) for (var xx = p.x0; xx <= p.x1; xx++) {
        var tg = tag[yy][xx]; if (tg !== "door" && tg !== "secret") continue;
        var ax = xx, ay = yy; if (yy === p.y0) ay--; else if (yy === p.y1) ay++; else if (xx === p.x0) ax--; else if (xx === p.x1) ax++; else continue;
        if (inb(ax, ay) && grid[ay][ax] === "#") { setc(ax, ay, ".", "corridor"); push(ax, ay); p.cx = ax; p.cy = ay; return { x: ax, y: ay }; }
      }
      var want = p.cache ? "feature" : "room", dt = p.cache ? "secret" : "door", cand = [];
      for (var x2 = p.x0 + 1; x2 <= p.x1 - 1; x2++) { cand.push([x2, p.y0, x2, p.y0 - 1, x2, p.y0 + 1]); cand.push([x2, p.y1, x2, p.y1 + 1, x2, p.y1 - 1]); }
      for (var y2 = p.y0 + 1; y2 <= p.y1 - 1; y2++) { cand.push([p.x0, y2, p.x0 - 1, y2, p.x0 + 1, y2]); cand.push([p.x1, y2, p.x1 + 1, y2, p.x1 - 1, y2]); }
      for (var k = 0; k < cand.length; k++) { var T = cand[k];
        if (grid[T[1]][T[0]] === "#" && inb(T[2], T[3]) && grid[T[3]][T[2]] === "#" && tag[T[5]] && tag[T[5]][T[4]] === want) {
          setc(T[0], T[1], ".", dt); setc(T[2], T[3], ".", "corridor"); push(T[2], T[3]); p.cx = T[2]; p.cy = T[3]; return { x: T[2], y: T[3] };
        }
      }
      return null;
    }
    var anchors = [];
    for (var ci = 0; ci < rooms.length; ci++) { var a = ensureApproach(rooms[ci]); if (a) { a.room = rooms[ci]; anchors.push(a); } }
    if (anchors.length < 4) return null;

    // CONNECT (robust): grow ONE connected component. isConn marks cells already in it; each
    // anchor BFS-routes through carveable rock to a cell adjacent to a *connected* corridor (not
    // just any corridor — that's what caused islands / L7). After each join, re-flood to absorb the
    // newly-connected room. BFS is guaranteed if a carveable path exists.
    var isConn = []; for (var yc = 0; yc < H; yc++) { isConn.push([]); for (var xc = 0; xc < W; xc++) isConn[yc].push(false); }
    function floodConn(sx, sy) {
      if (grid[sy][sx] === "#" || isConn[sy][sx]) return;
      var q = [[sx, sy]], h2 = 0; isConn[sy][sx] = true;
      while (h2 < q.length) { var c = q[h2++]; for (var i = 0; i < 4; i++) { var nx = c[0] + D4[i][0], ny = c[1] + D4[i][1]; if (inb(nx, ny) && grid[ny][nx] !== "#" && !isConn[ny][nx]) { isConn[ny][nx] = true; q.push([nx, ny]); } } }
    }
    floodConn(anchors[0].x, anchors[0].y);
    // FALLBACK: randomized-DFS path to the connected set (guaranteed if a path exists). DFS with
    // shuffled neighbours WANDERS, so even the fallback corridor winds (not a straight BFS line).
    function bfsConnect(sx, sy) {
      if (isConn[sy][sx]) return true;
      var stack = [[sx, sy]], prev = {}, seen = {}; seen[sx + "," + sy] = 1; var found = null;
      while (stack.length) {
        var c = stack.pop();
        for (var i = 0; i < 4; i++) { var ax = c[0] + D4[i][0], ay = c[1] + D4[i][1]; if (inb(ax, ay) && grid[ay][ax] !== "#" && isConn[ay][ax]) { found = c; break; } }
        if (found) break;
        var dirs = [0, 1, 2, 3]; for (var s = 3; s > 0; s--) { var rr = rng.int(0, s), tm = dirs[s]; dirs[s] = dirs[rr]; dirs[rr] = tm; }
        for (var i = 0; i < 4; i++) { var d = dirs[i], nx = c[0] + D4[d][0], ny = c[1] + D4[d][1], kk = nx + "," + ny; if (!seen[kk] && carveOK(nx, ny)) { seen[kk] = 1; prev[kk] = c; stack.push([nx, ny]); } }
      }
      if (!found) return false;
      var cur = found; while (cur) { if (grid[cur[1]][cur[0]] === "#") { setc(cur[0], cur[1], ".", "corridor"); push(cur[0], cur[1]); } cur = prev[cur[0] + "," + cur[1]]; }
      return true;
    }
    // TURN-CAPPED ROUTER (primary): a state-search over (x, y, dir, run) that FORBIDS any straight
    // run longer than 3 — so a routed corridor can never contain a >=4 colinear run, i.e. it is
    // <=30% straight by construction. Guaranteed to find a path if one exists under the cap; the
    // DFS bfsConnect is the rare fallback for a channel too tight to wind.
    var MAXRUN = 2;   // cap routed straight moves at 2: with the pre-seeded approach cell that is at most a 3-run (the approach is not counted in the state run), so no >=4 colinear corridor forms
    function cappedConnect(sx, sy) {
      if (isConn[sy][sx]) return true;
      var q = [{ x: sx, y: sy, dir: -1, run: 0 }], head = 0, prev = {}, seen = {}, found = null;
      seen[sx + "," + sy + ",-1,0"] = 1;
      while (head < q.length) {
        var s = q[head++];
        for (var i = 0; i < 4; i++) { var ax = s.x + D4[i][0], ay = s.y + D4[i][1]; if (inb(ax, ay) && grid[ay][ax] !== "#" && isConn[ay][ax] && !(s.dir < 0 && ax === sx && ay === sy)) { found = s; break; } }
        if (found) break;
        var dirs = [0, 1, 2, 3]; for (var z = 3; z > 0; z--) { var rr = rng.int(0, z), tm = dirs[z]; dirs[z] = dirs[rr]; dirs[rr] = tm; }
        for (var k = 0; k < 4; k++) {
          var d = dirs[k], nrun = (d === s.dir) ? s.run + 1 : 1;
          if (nrun > MAXRUN) continue;                            // hard cap: never extend a straight run past 3
          var nx = s.x + D4[d][0], ny = s.y + D4[d][1];
          if (!carveOK(nx, ny)) continue;
          var key = nx + "," + ny + "," + d + "," + nrun;
          if (seen[key]) continue; seen[key] = 1;
          prev[key] = s; q.push({ x: nx, y: ny, dir: d, run: nrun });
        }
      }
      if (!found) return false;
      var cur = found;
      while (cur && cur.dir >= 0) { if (grid[cur.y][cur.x] === "#") { setc(cur.x, cur.y, ".", "corridor"); push(cur.x, cur.y); } cur = prev[cur.x + "," + cur.y + "," + cur.dir + "," + cur.run]; }
      return true;
    }
    function connectAnchor(sx, sy, tx, ty) {
      if (isConn[sy][sx]) return true;
      var ok = cappedConnect(sx, sy);                               // turn-capped only: guarantees <=3 straight runs (a failed connect just lowers pass-rate; generateGated retries)
      if (ok) floodConn(sx, sy);
      return ok;
    }
    var connA = [anchors[0]], pend = anchors.slice(1), guard2 = 0;
    while (pend.length && guard2++ < 600) {
      var a = pend.shift(), tx = connA[0].x, ty = connA[0].y, bd = 1e9;
      for (var j = 0; j < connA.length; j++) { var dd = Math.abs(a.x - connA[j].x) + Math.abs(a.y - connA[j].y); if (dd < bd) { bd = dd; tx = connA[j].x; ty = connA[j].y; } }
      connectAnchor(a.x, a.y, tx, ty); connA.push(a);
    }
    var entryCell = anchors[0];

    // FILLER: bring walkable up into the 28-50% band (L3) and CHUNK big rock blobs (L1 <=25%) by
    // carving WINDING dead-end corridors from the connected net into open rock — which also adds
    // the winding feel. Dead-ends get features in the D2 pass below.
    var area2 = W * H;
    function countWalk() { var n = 0; for (var y = 1; y < H - 1; y++) for (var x = 1; x < W - 1; x++) if (grid[y][x] !== "#") n++; return n; }
    function biggestRock() {
      var seen = {}, best = 0;
      function buried(x, y) { if (grid[y][x] !== "#") return false; for (var i = 0; i < 4; i++) if (grid[y + D4[i][1]][x + D4[i][0]] !== "#") return false; return true; }
      for (var y = 1; y < H - 1; y++) for (var x = 1; x < W - 1; x++) {
        if (seen[x + "," + y] || !buried(x, y)) continue;
        var q = [[x, y]], h3 = 0, sz = 0; seen[x + "," + y] = 1;
        while (h3 < q.length) { var c = q[h3++]; sz++; for (var i = 0; i < 4; i++) { var nx = c[0] + D4[i][0], ny = c[1] + D4[i][1]; if (nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && !seen[nx + "," + ny] && buried(nx, ny)) { seen[nx + "," + ny] = 1; q.push([nx, ny]); } } }
        if (sz > best) best = sz;
      }
      return best;
    }
    // the thin winding filler also raises corridor amount into the STANDARD band (>=~22%).
    function countCorr() { var n = 0; for (var y = 1; y < H - 1; y++) for (var x = 1; x < W - 1; x++) if (tag[y][x] === "corridor") n++; return n; }
    var fillGuard = 0;
    while (fillGuard++ < 260 && (countWalk() < area2 * 0.30 || biggestRock() > area2 * 0.22)) {
      var sx = -1, sy = -1;
      for (var tr = 0; tr < 60 && sx < 0; tr++) { var rx = rng.int(1, W - 2), ry = rng.int(1, H - 2); if (grid[ry][rx] !== "#" && tag[ry][rx] === "corridor" && isConn[ry][rx]) { for (var i = 0; i < 4; i++) if (carveOK(rx + D4[i][0], ry + D4[i][1])) { sx = rx; sy = ry; break; } } }
      if (sx < 0) break;
      var x = sx, y = sy, run = 0, lastd = -1, len = 8 + rng.int(0, 14);
      for (var st = 0; st < len; st++) {
        var dirs = [0, 1, 2, 3]; for (var s = 3; s > 0; s--) { var r4 = rng.int(0, s), tm = dirs[s]; dirs[s] = dirs[r4]; dirs[r4] = tm; }
        var moved = false;
        for (var i = 0; i < 4; i++) { var d = dirs[i]; if (run >= 3 && d === lastd) continue; var nx = x + D4[d][0], ny = y + D4[d][1]; if (carveOK(nx, ny)) { setc(nx, ny, ".", "corridor"); push(nx, ny); isConn[ny][nx] = true; run = (d === lastd) ? run + 1 : 1; lastd = d; x = nx; y = ny; moved = true; break; } }
        if (!moved) break;
      }
    }
    // ---- SECRET DOORS: hidden second entrances (telegraphed at runtime by a TD_VAULTS.TELL).
    // Punch a wall that has a room on one side and a corridor on the other -> a secret shortcut
    // (a real loop). Secret caches already contribute; top up to >=4 so the STANDARD secrets
    // parameter (>=3, drifted) is met. The secret cell separates room from corridor, so L6 holds.
    function countSecrets() { var n = 0; for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (tag[y][x] === "secret") n++; return n; }
    var secCands = [];
    for (var sy2 = 1; sy2 < H - 1; sy2++) for (var sx2 = 1; sx2 < W - 1; sx2++) {
      if (grid[sy2][sx2] !== "#") continue;
      var ta = tag[sy2][sx2 - 1], tb = tag[sy2][sx2 + 1], tc = tag[sy2 - 1][sx2], td2 = tag[sy2 + 1][sx2];
      if ((ta === "room" && tb === "corridor") || (tb === "room" && ta === "corridor") || (tc === "room" && td2 === "corridor") || (td2 === "room" && tc === "corridor")) secCands.push([sx2, sy2]);
    }
    for (var sc = secCands.length - 1; sc > 0; sc--) { var sr2 = rng.int(0, sc), st2 = secCands[sc]; secCands[sc] = secCands[sr2]; secCands[sr2] = st2; }
    for (var si2 = 0; si2 < secCands.length && countSecrets() < 4; si2++) { var cc = secCands[si2]; setc(cc[0], cc[1], ".", "secret"); }

    sealDoorsFixpoint();                                       // all corridors + secrets placed: now seal any door that isn't a clean threshold (L4)

    // RE-DOOR: sealing may strip a room's only corridor door (it sat at a junction). Give every
    // room region a fresh CLEAN door (room one side, corridor opposite, walls perpendicular) so
    // D1 holds without re-introducing an L4 violation.
    function roomHasCorrDoor(p) {
      for (var y = p.y0 - 1; y <= p.y1 + 1; y++) for (var x = p.x0 - 1; x <= p.x1 + 1; x++) {
        if (!(y >= 0 && x >= 0 && y < H && x < W) || tag[y][x] !== "door") continue;
        for (var i = 0; i < 4; i++) { var t = tag[y + D4[i][1]] && tag[y + D4[i][1]][x + D4[i][0]]; if (t === "corridor") return true; }
      }
      return false;
    }
    rooms.forEach(function (p) {
      if (p.cache || roomHasCorrDoor(p)) return;
      for (var y = p.y0; y <= p.y1 && !p._redoored; y++) for (var x = p.x0; x <= p.x1; x++) {
        if (grid[y][x] !== "#") continue;
        var cleanV = (tag[y - 1] && tag[y - 1][x] === "room" && tag[y + 1] && tag[y + 1][x] === "corridor") || (tag[y + 1] && tag[y + 1][x] === "room" && tag[y - 1] && tag[y - 1][x] === "corridor");
        var cleanH = (tag[y][x - 1] === "room" && tag[y][x + 1] === "corridor") || (tag[y][x + 1] === "room" && tag[y][x - 1] === "corridor");
        if (cleanV && !walk(x - 1, y) && !walk(x + 1, y)) { setc(x, y, ".", "door"); p._redoored = 1; break; }
        if (cleanH && !walk(x, y - 1) && !walk(x, y + 1)) { setc(x, y, ".", "door"); p._redoored = 1; break; }
      }
    });

    // ---- DEAD ENDS earn it: every corridor dead-end terminates on a feature (D2). FIXPOINT over
    // the whole grid (the winding filler/connect leave many dead-ends; one pass over a stale list
    // misses some). A corridor cell with one walkable neighbour, not already beside a
    // feature/door/secret/stair, becomes a feature. ----
    function walkN(x, y) { var n = 0; for (var i = 0; i < 4; i++) if (walk(x + D4[i][0], y + D4[i][1])) n++; return n; }
    var deChanged = true;
    while (deChanged) {
      deChanged = false;
      for (var dy = 1; dy < H - 1; dy++) for (var dx = 1; dx < W - 1; dx++) {
        if (grid[dy][dx] === "." && tag[dy][dx] === "corridor" && walkN(dx, dy) === 1) {
          var legit = false; for (var i = 0; i < 4; i++) { var t = tag[dy + D4[i][1]][dx + D4[i][0]]; if (t === "feature" || t === "secret" || t === "stair") legit = true; }   // match law D2: a door does NOT legitimise a dead-end
          if (!legit) { setc(dx, dy, ".", "feature"); deChanged = true; }
        }
      }
    }

    // ---- STAIRS: up + down placed inside two authored vaults. The stair cell is retagged from
    // "room", so it must be a LEAF (fewest room neighbours) — never a bridge whose removal would
    // split a pillared vault into a doorless/tiny sub-region (D1/L11). ----
    function safeStairCell(p) {
      var best = null, bestDeg = 9;
      for (var k = 0; k < p.floor.length; k++) {
        var c = p.floor[k]; if (c[0] === p.cx && c[1] === p.cy) continue;     // not the connect-door's room cell
        var deg = 0; for (var d = 0; d < 4; d++) if (tag[c[1] + D4[d][1]] && tag[c[1] + D4[d][1]][c[0] + D4[d][0]] === "room") deg++;
        if (deg < bestDeg) { bestDeg = deg; best = c; }
      }
      return best || (p.floor.length ? p.floor[0] : null);
    }
    var stairs = [];
    var normalRooms = rooms.filter(function (r) { return !r.cache; });          // stairs live in rooms, never in hidden caches
    var upR = normalRooms[0], dnR = normalRooms[normalRooms.length - 1];
    var u = upR && safeStairCell(upR); if (u) { setc(u[0], u[1], ".", "stair"); stairs.push({ x: u[0], y: u[1], kind: "up", hidden: false }); }
    var dn = dnR && safeStairCell(dnR); if (dn) { setc(dn[0], dn[1], ".", "stair"); stairs.push({ x: dn[0], y: dn[1], kind: "down", hidden: rng.chance(0.4) }); }

    return { w: W, h: H, grid: grid, tag: tag, entry: { x: entryCell.x, y: entryCell.y }, stairs: stairs, rooms: rooms, type: typeName || "STANDARD", minRooms: B.minRooms };
  }

  // generateForLevel — the DRIFT gate in action: produce a STANDARD level that passes BOTH the
  // spatial laws (L1-L11/D1-D4) AND its own drifted target band (paramsFor(seed,level)). Each
  // retry reseeds, so the generator's natural variance (room sizes, zigzag, loops) explores the
  // space until a map lands inside the level's band. Returns the best-effort map if none fully
  // conform within the attempt budget (with .passed=false and the failing checks).
  function generateForLevel(seed, level, typeName, attempts) {
    attempts = attempts || 160;
    var t = paramsFor(seed, level), best = null, bestScore = -1;
    for (var i = 0; i < attempts; i++) {
      var m = generate((seed >>> 0) * 1009 + (level >>> 0) * 31 + i + 1, typeName || "STANDARD");
      if (!m) continue;
      var v = (typeof TD_LAWS !== "undefined") ? TD_LAWS.check(m) : { pass: true, laws: {} };
      if (!v.pass) continue;
      var c = TD_LAWS.conformsType(m, t);
      if (c.pass) return { map: m, laws: v.laws, type: c, band: t, attempt: i + 1, passed: true };
      var score = Object.keys(c.checks).filter(function (k) { return c.checks[k].pass; }).length;
      if (score > bestScore) { bestScore = score; best = { map: m, laws: v.laws, type: c, band: t, attempt: i + 1, passed: false }; }
    }
    return best;
  }

  function generateGated(seed, typeName, attempts) {
    attempts = attempts || 80;
    var best = null, bestPass = -1;
    for (var i = 0; i < attempts; i++) {
      var m = generate(seed * 1009 + i, typeName);
      if (!m) continue;
      var v = (typeof TD_LAWS !== "undefined") ? TD_LAWS.check(m) : { pass: true, laws: {} };
      if (v.pass) return { map: m, laws: v.laws, attempt: i + 1, passed: true };
      var np = Object.keys(v.laws).filter(function (k) { return v.laws[k].pass; }).length;
      if (np > bestPass) { bestPass = np; best = { map: m, laws: v.laws, attempt: i + 1, passed: false }; }
    }
    return best;
  }

  return { generate: generate, generateGated: generateGated, generateForLevel: generateForLevel, BUNDLES: BUNDLES, paramsFor: paramsFor, driftBandOf: driftBandOf, STANDARD_BASE: STANDARD_BASE };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_ASSEMBLER; }
