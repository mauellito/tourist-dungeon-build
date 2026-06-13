// Tourist Dungeon — THE ASSEMBLER (Master Directive P2). CORRECT-BY-CONSTRUCTION dungeon
// levels on the operator's spreadsheet-proved model, built SPINE-FIRST + DOOR-FIRST:
//
//  - A 1-wide corridor SPINE (trunk + branches) is laid first, flanked by wall (L5).
//  - ROOMS are ACCRETED onto the corridor walls through clean DOOR thresholds: the
//    corridor already exists, so we pick the room wall facing it and punch the door IN
//    that wall (door-first — never carve a corridor and hope it hits a door). room-floor
//    one side, corridor the other, wall on the perpendicular (L4); corridor touches a
//    room ONLY at a door (L6).
//  - SPACING LAW: rooms keep a 1-cell wall to everything (the box + a one-cell margin must
//    be all wall before carving), so no two open spaces fuse (L2) and rock stays a thin,
//    floor-faced separator, never a solid blob (L1). Dense packing keeps coverage in band
//    (L3) and leaves no big unroomed rock.
//  - D / S: D = known door; S = SECRET door placed reward-first (a real loop/shortcut
//    between two already-connected rooms), turning the spine-tree into a looping network.
//  - ROOM vs CORRIDOR floor are tagged distinctly (the eye separates destination from
//    circulation). Dead ends end on a feature; up/down stairs correlate across levels.
//
// Output (for TD_LAWS.check + the renderer):
//   { w, h, grid:[[char]], tag:[[str]], entry, stairs:[...], rooms:[...], type }
// Classic script: assigns global TD_ASSEMBLER. Requires TD_RNG (+ TD_LAWS for the gate).
"use strict";

var TD_ASSEMBLER = (function () {

  var BUNDLES = {
    STANDARD: { w: 47, h: 31, trunkLen: [8, 12], roomMin: 3, roomMax: 6, irregular: 0.5, loops: [1, 2], cap: 44, pack: 2200 },
    WARREN:   { w: 43, h: 29, trunkLen: [7, 11], roomMin: 2, roomMax: 4, irregular: 0.6, loops: [2, 3], cap: 60, pack: 2600 },
    HALLS:    { w: 51, h: 33, trunkLen: [10, 14], roomMin: 5, roomMax: 9, irregular: 0.35, loops: [1, 1], cap: 30, pack: 1800 }
  };
  var D4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  function generate(seed, typeName) {
    var B = BUNDLES[typeName] || BUNDLES.STANDARD;
    var rng = TD_RNG.make(((seed >>> 0) ^ 0x1a2b3c4d) || 1);
    var W = B.w, H = B.h, grid = [], tag = [];
    for (var y = 0; y < H; y++) { var gr = [], tr = []; for (var x = 0; x < W; x++) { gr.push("#"); tr.push("wall"); } grid.push(gr); tag.push(tr); }
    function inb(x, y) { return x >= 1 && y >= 1 && x < W - 1 && y < H - 1; }     // keep a 1-cell border
    function isWall(x, y) { return !(x >= 0 && y >= 0 && x < W && y < H) || grid[y][x] === "#"; }
    function walk(x, y) { return x >= 0 && y >= 0 && x < W && y < H && grid[y][x] !== "#"; }
    function setc(x, y, g, t) { grid[y][x] = g; tag[y][x] = t; }

    // ---- 1. SPINE: a snaking 1-wide trunk with bends, then branches off it. Each carved
    // corridor cell is 1-wide; flanking walls come for free (we only carve into wall). ----
    var corridor = [];
    function carveC(x, y) { if (inb(x, y) && grid[y][x] === "#") { setc(x, y, ".", "corridor"); corridor.push([x, y]); return true; } return inb(x, y) && tag[y][x] === "corridor"; }
    // The trunk is a boustrophedon snake: horizontal sweeps spanning the width, joined
    // end-to-end, spaced so a band of rooms fits between sweeps. One legible trunk that
    // reaches EVERY part of the map, so rooms can pack everywhere (no unreached rock = L1)
    // — branches + rooms + loops + dead-ends supply the organic feel on top.
    var sweepGap = B.roomMax + 2, sweepRows = [], ry = 3 + rng.int(0, 1);   // a band of rooms fits between sweeps
    while (ry < H - 3) { sweepRows.push(ry); ry += sweepGap; }
    var ltr = rng.chance(0.5);
    for (var si = 0; si < sweepRows.length; si++) {
      var sr = sweepRows[si], xa = ltr ? 2 : W - 3, xb = ltr ? W - 3 : 2, st = ltr ? 1 : -1;
      for (var x = xa; x !== xb + st; x += st) carveC(x, sr);
      if (si < sweepRows.length - 1) { var ny2 = sweepRows[si + 1]; for (var y = sr; y <= ny2; y++) carveC(xb, y); }
      ltr = !ltr;
    }
    // ---- 2. DENSE FILL: interleave door-first ROOM accretion with BRANCH growth, so the
    // corridor reaches into every pocket and rooms pack the map (thin walls -> L1; coverage
    // in band -> L3). When a room won't fit at a corridor cell, grow a flanked branch from
    // it instead, opening a new frontier. ----
    var rooms = [];
    function boxClear(x0, y0, x1, y1) {
      for (var y = y0 - 1; y <= y1 + 1; y++) for (var x = x0 - 1; x <= x1 + 1; x++) { if (!inb(x, y)) return false; if (grid[y][x] !== "#") return false; }
      return true;
    }
    function tryPlaceRoom(c, d) {
      var dwx = c[0] + d[0], dwy = c[1] + d[1];
      if (!inb(dwx, dwy) || grid[dwy][dwx] !== "#") return false;
      var rw = rng.int(B.roomMin, B.roomMax), rh = rng.int(B.roomMin, B.roomMax), x0, y0, x1, y1;
      if (d[0] === 1) { x0 = c[0] + 2; x1 = x0 + rw - 1; y0 = c[1] - (rh >> 1); y1 = y0 + rh - 1; }
      else if (d[0] === -1) { x1 = c[0] - 2; x0 = x1 - rw + 1; y0 = c[1] - (rh >> 1); y1 = y0 + rh - 1; }
      else if (d[1] === 1) { y0 = c[1] + 2; y1 = y0 + rh - 1; x0 = c[0] - (rw >> 1); x1 = x0 + rw - 1; }
      else { y1 = c[1] - 2; y0 = y1 - rh + 1; x0 = c[0] - (rw >> 1); x1 = x0 + rw - 1; }
      if (!boxClear(x0, y0, x1, y1)) return false;
      var perp = d[0] ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
      if (grid[dwy + perp[0][1]][dwx + perp[0][0]] !== "#" || grid[dwy + perp[1][1]][dwx + perp[1][0]] !== "#") return false;
      for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) setc(xx, yy, ".", "room");
      if (rng.chance(B.irregular)) { var bw = rng.int(1, Math.max(1, rw >> 1)), bh = rng.int(1, Math.max(1, rh >> 1)), cxr = rng.chance(0.5) ? x0 : x1 - bw + 1, cyr = rng.chance(0.5) ? y0 : y1 - bh + 1; for (var iy = cyr; iy < cyr + bh; iy++) for (var ix = cxr; ix < cxr + bw; ix++) if (ix >= x0 && ix <= x1 && iy >= y0 && iy <= y1) setc(ix, iy, "#", "wall"); }
      setc(dwx, dwy, ".", "door");
      rooms.push({ x0: x0, y0: y0, x1: x1, y1: y1, cx: (x0 + x1) >> 1, cy: (y0 + y1) >> 1, door: { x: dwx, y: dwy } });
      return true;
    }
    function touchesRoom(x, y) { for (var i = 0; i < 4; i++) { var nx = x + D4[i][0], ny = y + D4[i][1]; if (tag[ny] && tag[ny][nx] === "room") return true; } return false; }
    function extendBranch(c, d) {
      var bx = c[0], by = c[1], len = rng.int(2, 5), grew = false;
      for (var j = 0; j < len; j++) {
        var tx = bx + d[0], ty = by + d[1];
        if (!inb(tx, ty) || grid[ty][tx] !== "#") break;
        var perp = d[0] ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
        if (grid[ty + perp[0][1]][tx + perp[0][0]] !== "#" || grid[ty + perp[1][1]][tx + perp[1][0]] !== "#") break;
        if (touchesRoom(tx, ty)) break;                 // never run a corridor up against a room (L6)
        bx = tx; by = ty; carveC(bx, by); grew = true;
      }
      return grew;
    }
    for (var a = 0; a < B.pack && rooms.length < B.cap; a++) {
      var c = corridor[rng.int(0, corridor.length - 1)], d = D4[rng.int(0, 3)];
      if (!tryPlaceRoom(c, d)) extendBranch(c, d);
    }
    if (rooms.length < 4) return null;

    // ---- 3. LOOPS via SECRET doors (reward-first): a room already on the network gets a
    // SECOND door to a different nearby corridor cell -> a real loop. Mark it secret. ----
    var nLoops = rng.int(B.loops[0], B.loops[1]), made = 0;
    for (var li = 0; li < rooms.length && made < nLoops; li++) {
      var R = rooms[(li * 7 + 3) % rooms.length];
      var sides = [["N", 0, -1], ["S", 0, 1], ["W", -1, 0], ["E", 1, 0]];
      for (var si = 0; si < 4; si++) {
        var sd = sides[si], wx, wy, c2x, c2y;
        if (sd[0] === "N") { wx = R.cx; wy = R.y0 - 1; } else if (sd[0] === "S") { wx = R.cx; wy = R.y1 + 1; } else if (sd[0] === "W") { wx = R.x0 - 1; wy = R.cy; } else { wx = R.x1 + 1; wy = R.cy; }
        c2x = wx + sd[1]; c2y = wy + sd[2];
        if (R.door.x === wx && R.door.y === wy) continue;       // not the existing door's wall
        if (inb(wx, wy) && grid[wy][wx] === "#" && walk(c2x, c2y) && tag[c2y][c2x] === "corridor") {
          var perp3 = sd[1] ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
          if (grid[wy + perp3[0][1]][wx + perp3[0][0]] === "#" && grid[wy + perp3[1][1]][wx + perp3[1][0]] === "#") { setc(wx, wy, ".", "secret"); made++; break; }
        }
      }
    }

    // ---- 4. DEAD ENDS earn it: a corridor tip with one walkable neighbour gets a feature ----
    function walkN(x, y) { var n = 0; for (var i = 0; i < 4; i++) if (walk(x + D4[i][0], y + D4[i][1])) n++; return n; }
    corridor.forEach(function (c) {
      if (walkN(c[0], c[1]) === 1) {
        var legit = false; for (var i = 0; i < 4; i++) { var t = tag[c[1] + D4[i][1]][c[0] + D4[i][0]]; if (t === "door" || t === "feature" || t === "secret" || t === "stair") legit = true; }
        if (!legit) setc(c[0], c[1], ".", "feature");
      }
    });

    // ---- 5. STAIRS: up + down in two rooms, variable distance, sometimes hidden ----
    var stairs = [];
    var upR = rooms[0], dnR = rooms[Math.min(rooms.length - 1, (rooms.length >> 1) + rng.int(0, rooms.length >> 1))];
    if (dnR === upR) dnR = rooms[rooms.length - 1];
    setc(upR.cx, upR.cy, ".", "stair"); stairs.push({ x: upR.cx, y: upR.cy, kind: "up", hidden: false });
    setc(dnR.cx, dnR.cy, ".", "stair"); stairs.push({ x: dnR.cx, y: dnR.cy, kind: "down", hidden: rng.chance(0.4) });

    var entry = { x: corridor[0][0], y: corridor[0][1] };
    return { w: W, h: H, grid: grid, tag: tag, entry: entry, stairs: stairs, rooms: rooms, type: typeName || "STANDARD" };
  }

  // GATE in the loop: discard+regenerate until a PASSING map (cap attempts), else return
  // the best-effort with its law table (failures SHOWN, never hidden).
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

  return { generate: generate, generateGated: generateGated, BUNDLES: BUNDLES };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_ASSEMBLER; }
