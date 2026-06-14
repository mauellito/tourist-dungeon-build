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
  // not tall — bandH sets coverage, kept so L3 lands in 35-55%. Each band = a WINDING tooth
  // (2 rows: sr, sr+1) + gutter + bandH room rows + gutter, so sweepGap = bandH + 4.
  var BUNDLES = {
    STANDARD: { w: 49, h: 35, bandH: 3, roomMin: 7, roomMax: 13, irregular: 0.6, loops: [3, 4], minRooms: 10, trunkW: 2 },
    WARREN:   { w: 47, h: 33, bandH: 4, roomMin: 5, roomMax: 8, irregular: 0.5, loops: [3, 5], minRooms: 12, trunkW: 2 },
    HALLS:    { w: 53, h: 37, bandH: 4, roomMin: 8, roomMax: 14, irregular: 0.4, loops: [2, 3], minRooms: 7, trunkW: 2 }
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

    // ---- SPINE: WINDING teeth + a thin trunk (steal-list Option A, jogged spine). The teeth
    // are the bulk of the corridor and they ZIGZAG (max 3-cell straightaways between 1-cell
    // vertical jogs) so straight runs stay <=30% (STANDARD wants winding). A thin straight
    // trunk at x=1 stitches the teeth together — it is a tiny fraction of corridor, so the
    // straightness budget survives it. Each tooth ends on a feature (terminating vista). ----
    var bandH = B.bandH, sweepGap = bandH + 4;               // tooth(2) + gutter(1) + rooms(bandH) + gutter(1)
    var lastRow = H - bandH - 4;                             // final tooth: its bandH-row band lands exactly on H-2
    var nTeeth = Math.max(2, Math.round((lastRow - 1) / sweepGap) + 1);  // evenly spaced teeth, last band on H-2
    var sweepRows = []; for (var ti = 0; ti < nTeeth; ti++) sweepRows.push(Math.round(1 + (lastRow - 1) * ti / (nTeeth - 1)));
    var corridorCells = [];
    function push(x, y) { corridorCells.push([x, y]); }

    // a winding tooth living in rows [sr, sr+1]: runs of <=3 along a row, then a 1-cell jog to
    // the other row. Returns the set of columns where the LOWER row (sr+1) is corridor — those
    // are the legal door-attach columns for the room band below.
    function windTooth(sr) {
      var up = sr, low = sr + 1, attach = {}, x = 1, row = up;
      carveC(x, row); push(x, row);
      while (x < W - 2) {
        var lim = Math.min(2, (W - 2) - x);                  // <=2 new cells -> with the jog cell, runs cap at 3
        for (var k = 0; k < lim; k++) { x++; carveC(x, row); push(x, row); if (row === low) attach[x] = 1; }
        if (x < W - 2) { row = (row === up) ? low : up; carveC(x, row); push(x, row); if (row === low) attach[x] = 1; }
      }
      setc(W - 2, row, ".", "feature");                      // the tooth ends on a feature, not a blank wall
      delete attach[W - 2];                                  // the end column is now a feature, not a door-attach corridor
      return { attach: attach, lowRow: low, upRow: up };
    }
    var teeth = [];
    for (var si = 0; si < sweepRows.length; si++) teeth.push(windTooth(sweepRows[si]));
    var topSR = sweepRows[0], botSR = sweepRows[sweepRows.length - 1], trunkW = B.trunkW || 2;
    for (var ty0 = topSR; ty0 <= botSR + 1; ty0++) for (var tx = 1; tx <= trunkW; tx++) { carveC(tx, ty0); if (grid[ty0][tx] === ".") push(tx, ty0); }  // the trunk (circulation spine; x=trunkW+1 stays the wall gutter to the rooms)

    // ---- ROOMS (the bulk): fill each band below a tooth with a row of rooms, each hanging off
    // the tooth ABOVE via a clean door at a column where the tooth's LOWER row is corridor.
    // 1-cell walls to the trunk and between rooms (spacing law). ----
    var rooms = [], bands = [];
    for (var bi = 0; bi < sweepRows.length; bi++) {
      var sr = sweepRows[bi], tooth = teeth[bi];
      var nextSr = (bi + 1 < sweepRows.length) ? sweepRows[bi + 1] : H - 1;
      var bTop = sr + 3, bBot = (bi + 1 < sweepRows.length) ? nextSr - 2 : H - 2;   // gutter at sr+2 and at nextSr-1
      if (bBot - bTop + 1 > bandH) bBot = bTop + bandH - 1;                          // cap every band at bandH (last tooth is placed so its band lands on H-2 anyway)
      if (bBot - bTop + 1 < 2) continue;
      var cx = trunkW + 2, bandRooms = [];                   // x=1..trunkW trunk, x=trunkW+1 wall gutter
      while (cx <= W - 3) {
        var rw = rng.int(B.roomMin, B.roomMax);
        var x0 = cx, x1 = Math.min(cx + rw - 1, W - 3);      // leave x=W-2 for the tooth-end feature lane
        if (x1 - x0 + 1 < B.roomMin) break;
        var rh = rng.int(Math.max(2, bandH - 2), bBot - bTop + 1);   // vary room HEIGHT too (size-spread); >=2 keeps size>=6
        var y0 = bTop, y1 = bTop + rh - 1;
        // door column: prefer a column where the tooth's lower row is already corridor; else tap.
        var dc = -1; for (var ax = x0; ax <= x1; ax++) if (tooth.attach[ax]) { dc = ax; break; }
        if (dc < 0) dc = (x0 + x1) >> 1;
        // bulletproof stub: carve BOTH tooth rows at dc so the door always meets the tooth (the
        // zigzag passes dc on exactly one row; carving both guarantees a connected through-passage).
        if (grid[sr][dc] === "#") { setc(dc, sr, ".", "corridor"); push(dc, sr); }
        if (grid[sr + 1][dc] === "#") { setc(dc, sr + 1, ".", "corridor"); push(dc, sr + 1); }
        for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) setc(xx, yy, ".", "room");
        if (rng.chance(B.irregular)) { var bw = rng.int(1, Math.max(1, rw >> 1)), bh = rng.int(1, Math.max(1, (y1 - y0) >> 1)), bx2 = rng.chance(0.5) ? x0 : x1 - bw + 1, by2 = rng.chance(0.5) ? y0 : y1 - bh + 1; for (var iy = by2; iy < by2 + bh; iy++) for (var ix = bx2; ix < bx2 + bw; ix++) if (ix >= x0 && ix <= x1 && iy >= y0 && iy <= y1 && !(ix === dc && iy === y0)) setc(ix, iy, "#", "wall"); }
        if (grid[y0][dc] !== ".") setc(dc, y0, ".", "room");
        setc(dc, sr + 2, ".", "door");                        // door through the gutter to the tooth's lower row
        var R = { x0: x0, y0: y0, x1: x1, y1: y1, cx: dc, cy: (y0 + y1) >> 1, door: { x: dc, y: sr + 2 }, sr: sr, nextSr: nextSr };
        rooms.push(R); bandRooms.push(R);
        cx = x1 + 2;
      }
      bands.push(bandRooms);
    }
    if (rooms.length < 4) return null;

    // ---- LOOPS via SECRET doors (reward-first): a hidden door punched through the 1-cell wall
    // between two adjacent rooms in a band — a real second route (room -> tooth -> room -> secret
    // -> room). Telegraphed at runtime by a TD_VAULTS.TELL; here it is structural placement. ----
    var nLoops = rng.int(B.loops[0], B.loops[1]), made = 0;
    for (var bj = 0; bj < bands.length && made < nLoops; bj++) {
      var brs = bands[bj];
      for (var ri = 0; ri + 1 < brs.length && made < nLoops; ri++) {
        var A = brs[ri], Bb = brs[ri + 1], wx = A.x1 + 1;     // the shared wall column between A and B
        if (Bb.x0 !== wx + 1) continue;                       // only when they are wall-adjacent (1-cell gap)
        var ly = Math.max(A.y0, Bb.y0), hy = Math.min(A.y1, Bb.y1);
        if (hy < ly) continue;
        var wy = (ly + hy) >> 1;
        if (grid[wy][wx] === "#" && grid[wy][wx - 1] === "." && grid[wy][wx + 1] === ".") { setc(wx, wy, ".", "secret"); made++; }
      }
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
