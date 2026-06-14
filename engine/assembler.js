// Tourist Dungeon — THE ASSEMBLER (Master Directive P2, Amendment 2). Builds dungeon
// levels that READ as rooms-hung-off-a-corridor-spine (the operator's sheet), not a
// uniform speckle. Structure is DELIBERATE, not whatever-passes:
//
//  - SPINE = a boustrophedon trunk: clean 1-wide horizontal corridor sweeps joined
//    end-to-end, reaching every band of the map (one legible trunk).
//  - ROOMS are the BULK: each band BETWEEN sweeps is filled with a row of real rooms,
//    each a contiguous rectangle (some irregular), separated by 1-cell walls, each with a
//    clean DOOR threshold onto the sweep it hangs off (room-floor one side, corridor the
//    other, wall on the perpendicular). Corridors stay a thin MINORITY (circulation).
//  - SPACING LAW: 1-cell walls between everything -> no fused open (L2), thin floor-faced
//    rock (L1). Room and corridor are tagged distinctly (the eye separates them).
//  - D doors / S secret-loops (reward-first, a real loop between two known rooms) /
//    features at dead-ends / correlated up+down stairs.
//
// Output (for TD_LAWS.check + the renderer):
//   { w, h, grid, tag, entry, stairs, rooms, type, minRooms }
// Classic script: assigns global TD_ASSEMBLER. Requires TD_RNG (+ TD_LAWS for the gate).
"use strict";

var TD_ASSEMBLER = (function () {

  // bandH (room height between teeth) is decoupled from room WIDTH so "large rooms" = wide,
  // not tall — bandH sets coverage (~bandH/(bandH+3)), kept so L3 lands in 35-55%.
  var BUNDLES = {
    STANDARD: { w: 49, h: 35, bandH: 5, roomMin: 4, roomMax: 7, irregular: 0.45, loops: [1, 2], minRooms: 10 },
    WARREN:   { w: 47, h: 33, bandH: 4, roomMin: 3, roomMax: 5, irregular: 0.55, loops: [2, 3], minRooms: 14 },
    HALLS:    { w: 53, h: 37, bandH: 4, roomMin: 6, roomMax: 11, irregular: 0.3, loops: [1, 1], minRooms: 7 }
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

    // ---- SPINE: a COMB — one vertical TRUNK on the left, full-width TEETH (sweeps) off it,
    // spaced so a band of rooms fits between teeth. One legible trunk + branches; the teeth
    // reach every band so rooms hang off them. Each tooth ends on a feature (a terminating
    // vista, never a blank-wall dead-end). ----
    var bandH = B.bandH, sweepGap = bandH + 2;
    // teeth run to the inb edges (rows 1..H-2, cols 1..W-2) and the trunk sits at x=1, so the
    // whole 1-cell border is corridor-faced — not a buried ring — and L1 sees only tiny pockets.
    var sweepRows = [], ry = 1; while (ry < H - 2) { sweepRows.push(ry); ry += sweepGap; }
    if (sweepRows[sweepRows.length - 1] < H - 2) sweepRows.push(H - 2);
    var corridorCells = [];
    var topSR = sweepRows[0], botSR = sweepRows[sweepRows.length - 1];
    for (var ty0 = topSR; ty0 <= botSR; ty0++) { carveC(1, ty0); corridorCells.push([1, ty0]); }   // the trunk (x=1, against the edge)
    for (var si = 0; si < sweepRows.length; si++) {
      var sr = sweepRows[si];
      for (var x = 1; x <= W - 2; x++) { carveC(x, sr); corridorCells.push([x, sr]); }              // a tooth, edge to edge
      setc(W - 2, sr, ".", "feature");                                                              // the tooth ends on a feature
    }

    // ---- ROOMS (the bulk): fill each band between teeth with a row of rooms, each hanging
    // off the tooth ABOVE via a clean door, with a 1-cell wall to the trunk and to neighbours
    // (spacing law). Rooms start at x=4 (x=3 is the wall lane beside the trunk at x=2). ----
    var rooms = [];
    for (var bi = 0; bi < sweepRows.length; bi++) {
      var upper = sweepRows[bi], lower = (bi + 1 < sweepRows.length) ? sweepRows[bi + 1] : H - 1;
      var bTop = upper + 2, bBot = lower - 2;                // bottom band hangs off the last tooth too (no unfilled rock)
      if (bBot - bTop + 1 < 3) continue;                     // a short band still fills with shorter rooms (height < roomMin is fine; width keeps roomMin)
      var cx = 3;                                             // x=2 is the wall lane beside the trunk at x=1
      while (cx <= W - 2) {
        var rw = rng.int(B.roomMin, B.roomMax);
        var x0 = cx, x1 = Math.min(cx + rw - 1, W - 2);
        if (x1 - x0 + 1 < B.roomMin) break;
        var y0 = bTop, y1 = bBot, midx = (x0 + x1) >> 1;
        for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) setc(xx, yy, ".", "room");
        if (rng.chance(B.irregular)) { var bw = rng.int(1, Math.max(1, rw >> 1)), bh = rng.int(1, Math.max(1, (y1 - y0) >> 1)), bx2 = rng.chance(0.5) ? x0 : x1 - bw + 1, by2 = rng.chance(0.5) ? y0 : y1 - bh + 1; for (var iy = by2; iy < by2 + bh; iy++) for (var ix = bx2; ix < bx2 + bw; ix++) if (ix >= x0 && ix <= x1 && iy >= y0 && iy <= y1) setc(ix, iy, "#", "wall"); }
        if (grid[y0][midx] !== ".") setc(midx, y0, ".", "room");
        setc(midx, upper + 1, ".", "door");
        rooms.push({ x0: x0, y0: y0, x1: x1, y1: y1, cx: midx, cy: (y0 + y1) >> 1, door: { x: midx, y: upper + 1 }, upper: upper, lower: lower });
        cx = x1 + 2;
      }
    }
    if (rooms.length < 4) return null;

    // ---- LOOPS via SECRET doors (reward-first): a room also doors to the tooth BELOW it
    // (a real second route). Mark that entrance secret. ----
    var nLoops = rng.int(B.loops[0], B.loops[1]), made = 0;
    for (var li = 0; li < rooms.length && made < nLoops; li++) {
      var R = rooms[(li * 5 + 2) % rooms.length], by = R.y1 + 1;
      if (by === R.lower - 1 && grid[by][R.cx] === "#" && grid[R.lower][R.cx] === "." && grid[by][R.cx - 1] === "#" && grid[by][R.cx + 1] === "#") { setc(R.cx, by, ".", "secret"); made++; }
    }

    // ---- DEAD ENDS earn it: any corridor cell that is a dead-end gets a feature (D2). ----
    function walkN(x, y) { var n = 0; for (var i = 0; i < 4; i++) if (walk(x + D4[i][0], y + D4[i][1])) n++; return n; }
    corridorCells.forEach(function (c) {
      if (grid[c[1]][c[0]] === "." && tag[c[1]][c[0]] === "corridor" && walkN(c[0], c[1]) === 1) {
        var legit = false; for (var i = 0; i < 4; i++) { var t = tag[c[1] + D4[i][1]][c[0] + D4[i][0]]; if (t === "door" || t === "feature" || t === "secret" || t === "stair") legit = true; }
        if (!legit) setc(c[0], c[1], ".", "feature");
      }
    });

    // ---- STAIRS: up + down in two rooms, variable distance, sometimes hidden ----
    var stairs = [];
    var upR = rooms[0], dnR = rooms[Math.min(rooms.length - 1, (rooms.length >> 1) + rng.int(0, rooms.length >> 1))];
    if (dnR === upR) dnR = rooms[rooms.length - 1];
    setc(upR.cx, upR.cy, ".", "stair"); stairs.push({ x: upR.cx, y: upR.cy, kind: "up", hidden: false });
    setc(dnR.cx, dnR.cy, ".", "stair"); stairs.push({ x: dnR.cx, y: dnR.cy, kind: "down", hidden: rng.chance(0.4) });

    return { w: W, h: H, grid: grid, tag: tag, entry: { x: corridorCells[0][0], y: corridorCells[0][1] }, stairs: stairs, rooms: rooms, type: typeName || "STANDARD", minRooms: B.minRooms };
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

  return { generate: generate, generateGated: generateGated, BUNDLES: BUNDLES, paramsFor: paramsFor, driftBandOf: driftBandOf, STANDARD_BASE: STANDARD_BASE };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_ASSEMBLER; }
