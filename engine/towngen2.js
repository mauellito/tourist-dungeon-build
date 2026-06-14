// Tourist Dungeon — TD_TOWNGEN: the procedural town, the figure/ground INVERSION of the vault
// assembler. WATER organises the map (a winding, forking channel + a harbour with piers and an
// island); the LAND is BSP-partitioned into DISTRICTS placed by geography; each district is
// PACKED with buildings (the figure) leaving 1-cell street margins (the ground/circulation), so
// the streets are a connected network by construction. A MAIN-STREET SPINE runs gate -> plaza ->
// dungeon mouth. Required features (plaza, park, fenced graveyard, stream+bridges, waterfront+
// piers, city gate, church + dungeon mouth) are placed, then TD_TOWNLAWS gates the candidate.
// Classic script: assigns global TD_TOWNGEN. Requires TD_RNG (+ TD_TOWNLAWS for the gate).
"use strict";

var TD_TOWNGEN = (function () {
  var D4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  var GLYPH = { water: "~", pier: "=", bridge: "b", street: ".", plaza: ",", park: '"', graveyard: "+", fence: "f", building: "#", gate: "G", church: "C", dungeon: ">", wall: "#", alley: ":" };

  function generate(seed) {
    var W = 80, H = 56, rng = TD_RNG.make(((seed >>> 0) ^ 0x70774e21) || 1);
    var tag = []; for (var y = 0; y < H; y++) { var r = []; for (var x = 0; x < W; x++) r.push("street"); tag.push(r); }
    function inb(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }
    function set(x, y, t) { if (inb(x, y)) tag[y][x] = t; }
    function t(x, y) { return inb(x, y) ? tag[y][x] : "void"; }
    var meta = { districts: [], islandCells: 0 };

    // ---- WATER: a winding river down the map + a harbour along the bottom, with a fork-island.
    var riverX = 22 + rng.int(0, 10);
    var rx = riverX, half = 1;                                   // river half-width ~1 -> 3 wide
    for (var y = 0; y < H - 6; y++) {
      for (var dx = -half; dx <= half; dx++) set(rx + dx, y, "water");
      if (rng.chance(0.5)) rx += rng.int(-1, 1);                 // meander
      rx = Math.max(8, Math.min(W - 20, rx));
    }
    // a FORK around mid-map: a second channel branches and rejoins, leaving an island between
    var forkTop = 14, forkBot = 26, fx = riverX + 6;
    for (var y = forkTop; y <= forkBot; y++) { set(fx, y, "water"); set(fx + 1, y, "water"); if (rng.chance(0.4)) fx += rng.int(-1, 1); fx = Math.max(riverX + 4, Math.min(W - 16, fx)); }
    // harbour: bottom strip, organic shoreline
    var shore = []; for (var x = 0; x < W; x++) { shore[x] = H - 6 + rng.int(-1, 1); for (var y = shore[x]; y < H; y++) set(x, y, "water"); }
    // island in the harbour
    var isx = 12 + rng.int(0, W - 30), isy = H - 4;
    for (var iy = isy - 1; iy <= isy + 1; iy++) for (var ix = isx - 2; ix <= isx + 2; ix++) if (inb(ix, iy) && t(ix, iy) === "water") { set(ix, iy, "park"); meta.islandCells++; }
    // piers: short walkable jetties from the shore into the harbour
    for (var p = 0; p < 4; p++) { var px = 8 + p * Math.floor((W - 16) / 4) + rng.int(0, 4); var sy = shore[px]; for (var k = 0; k < 3 + rng.int(0, 2); k++) { if (t(px, sy + k) === "water") set(px, sy + k, "pier"); } }

    // ---- DISTRICTS: BSP-partition the LAND (rows above the harbour) into regions.
    var landBot = Math.min.apply(null, shore) - 1, leaves = [];
    (function bsp(x0, y0, x1, y1, d) {
      var w = x1 - x0 + 1, h = y1 - y0 + 1;
      var cLR = w >= 22, cTB = h >= 16, must = w > 26 || h > 20;
      if ((!cLR && !cTB) || (!must && d >= 2 && rng.chance(0.3))) { leaves.push({ x0: x0, y0: y0, x1: x1, y1: y1 }); return; }
      var lr = (cLR && cTB) ? (w >= h) : cLR;
      if (lr) { var c = x0 + 10 + rng.int(0, w - 20 - 1); bsp(x0, y0, c, y1, d + 1); bsp(c + 2, y0, x1, y1, d + 1); }
      else { var c2 = y0 + 7 + rng.int(0, h - 14 - 1); bsp(x0, y0, x1, c2, d + 1); bsp(x0, c2 + 2, x1, y1, d + 1); }
    })(1, 1, W - 2, landBot, 0);
    // keep only leaves that are mostly land (not drowned by the river)
    var dist = [];
    leaves.forEach(function (L) {
      var land = 0, tot = 0; for (var y = L.y0; y <= L.y1; y++) for (var x = L.x0; x <= L.x1; x++) { tot++; if (t(x, y) !== "water") land++; }
      if (land >= tot * 0.55) { L.cx = (L.x0 + L.x1) >> 1; L.cy = (L.y0 + L.y1) >> 1; L.touchesWater = land < tot * 0.92; dist.push(L); }
    });
    if (dist.length < 5) return null;

    // assign roles by geography: central-most = CIVIC (church+dungeon), water-touching = WAREHOUSE,
    // a small one = RED-LIGHT, one = PARK, one = GRAVEYARD, rest = HOUSING/MARKET.
    var ccx = W / 2, ccy = landBot / 2;
    dist.sort(function (a, b) { return (Math.abs(a.cx - ccx) + Math.abs(a.cy - ccy)) - (Math.abs(b.cx - ccx) + Math.abs(b.cy - ccy)); });
    var civic = dist[0]; civic.role = "civic";
    var assigned = { civic: 1 };
    // park = a leaf far from centre; graveyard = a corner leaf; redlight = a small leaf; warehouse = water-touching
    var bySize = dist.slice(1).sort(function (a, b) { return ((a.x1 - a.x0) * (a.y1 - a.y0)) - ((b.x1 - b.x0) * (b.y1 - b.y0)); });
    var redlight = bySize[0]; redlight.role = "redlight";
    var warehouse = null; for (var i = dist.length - 1; i >= 0; i--) if (dist[i].touchesWater && !dist[i].role) { warehouse = dist[i]; warehouse.role = "warehouse"; break; }
    var rest = dist.filter(function (L) { return !L.role; });
    if (rest.length) { rest[0].role = "park"; }
    if (rest.length > 1) { rest[1].role = "graveyard"; }
    for (var i = 2; i < rest.length; i++) rest[i].role = (i % 2 ? "market" : "housing");
    meta.districts = dist.map(function (L) { return { role: L.role, x0: L.x0, y0: L.y0, x1: L.x1, y1: L.y1 }; });

    // ---- pack a district with BUILDINGS (figure): BSP the leaf into random sub-cells, drop one
    // building per cell (filling it minus a 1-cell margin = the street), jittered within the cell.
    // Random cuts => varied building positions => no aligned rows (T16 anti-grid); the margins
    // form the connected street network (the ground).
    function placeBld(x0, y0, x1, y1, opts) {
      var w = x1 - x0 + 1, h = y1 - y0 + 1;
      var bw = Math.max(2, w - 1 - rng.int(0, 1)), bh = Math.max(2, h - 1 - rng.int(0, 1));
      if (bw < 2 || bh < 2 || bw > w || bh > h) return;
      var ox = x0 + rng.int(0, w - bw), oy = y0 + rng.int(0, h - bh);
      for (var yy = oy; yy < oy + bh; yy++) for (var xx = ox; xx < ox + bw; xx++) if (t(xx, yy) === "street") set(xx, yy, opts.tag || "building");
      // organic-ise: bite a CORNER (L-shape/notch) so building fronts aren't flat regular rows
      if (bw >= 3 && bh >= 3 && rng.chance(0.55)) {
        var cw = 1 + rng.int(0, bw >> 1), ch = 1 + rng.int(0, bh >> 1);
        var bx = rng.chance(0.5) ? ox : ox + bw - cw, by = rng.chance(0.5) ? oy : oy + bh - ch;
        for (var yy2 = by; yy2 < by + ch; yy2++) for (var xx2 = bx; xx2 < bx + cw; xx2++) if (t(xx2, yy2) === (opts.tag || "building")) set(xx2, yy2, "street");
      }
    }
    function packBuildings(L, opts) {
      opts = opts || {};
      var maxW = opts.wide ? 10 : 7, maxH = opts.tall ? 8 : 6;
      (function bsp(x0, y0, x1, y1, d) {
        var w = x1 - x0 + 1, h = y1 - y0 + 1;
        if (w < 4 || h < 4) return;
        var cLR = w >= 9, cTB = h >= 8, must = w > maxW || h > maxH;
        if ((!cLR && !cTB) || (!must && d >= 1 && rng.chance(0.4))) { placeBld(x0, y0, x1, y1, opts); return; }
        var lr = (cLR && cTB) ? (w >= h) : cLR;
        if (lr) { var c = x0 + 4 + rng.int(0, w - 8 - 1); bsp(x0, y0, c, y1, d + 1); bsp(c + 1, y0, x1, y1, d + 1); }
        else { var c2 = y0 + 4 + rng.int(0, h - 8 - 1); bsp(x0, y0, x1, c2, d + 1); bsp(x0, c2 + 1, x1, y1, d + 1); }
      })(L.x0 + 1, L.y0 + 1, L.x1 - 1, L.y1 - 1, 0);
    }

    // ---- RED-LIGHT: a SELF-CONCEALING district — a solid outward-facing building RING, exactly
    // ONE entrance, a hidden alley-warren inside, and NO through-route (you enter and leave by the
    // same gap). It must read as "a place apart" on the map.
    function buildRedlight(L) {
      var x0 = L.x0, y0 = L.y0, x1 = L.x1, y1 = L.y1;
      function ringSet(x, y) { if (t(x, y) === "street" || t(x, y) === "building") set(x, y, "building"); }
      for (var x = x0; x <= x1; x++) { ringSet(x, y0); ringSet(x, y1); }
      for (var y = y0; y <= y1; y++) { ringSet(x0, y); ringSet(x1, y); }
      // interior: a 1-cell perimeter alley (street) just inside the ring, then a packed inner core
      // whose margins are the hidden warren — all reachable only from the perimeter alley.
      packBuildings({ x0: x0 + 1, y0: y0 + 1, x1: x1 - 1, y1: y1 - 1 }, {});
      for (var x = x0 + 1; x <= x1 - 1; x++) { if (t(x, y0 + 1) !== "alley" && t(x, y0 + 1) === "street") set(x, y0 + 1, "alley"); if (t(x, y1 - 1) === "street") set(x, y1 - 1, "alley"); }
      for (var y = y0 + 1; y <= y1 - 1; y++) { if (t(x0 + 1, y) === "street") set(x0 + 1, y, "alley"); if (t(x1 - 1, y) === "street") set(x1 - 1, y, "alley"); }
      // retag the inner-core street margins (the warren) as alley so the district reads distinct
      for (var y = y0 + 1; y <= y1 - 1; y++) for (var x = x0 + 1; x <= x1 - 1; x++) if (t(x, y) === "street") set(x, y, "alley");
      // ONE entrance on the side facing the town centre: a single gap, connected in AND out
      var ex = (x0 + x1) >> 1, side = (y0 > 4) ? "top" : "bot";
      if (side === "top") { set(ex, y0, "street"); set(ex, y0 + 1, "alley"); for (var k = 1; k <= 3; k++) if (inb(ex, y0 - k) && t(ex, y0 - k) !== "water") set(ex, y0 - k, "street"); }
      else { set(ex, y1, "street"); set(ex, y1 - 1, "alley"); for (var k = 1; k <= 3; k++) if (inb(ex, y1 + k) && t(ex, y1 + k) !== "water") set(ex, y1 + k, "street"); }
      meta.redlight = { x0: x0, y0: y0, x1: x1, y1: y1, entrance: [ex, side === "top" ? y0 : y1] };
    }

    // ---- CIVIC: a central PLAZA with the CHURCH + DUNGEON mouth; pack civic with big buildings.
    var px = civic.cx, py = civic.cy;
    for (var yy = py - 2; yy <= py + 2; yy++) for (var xx = px - 2; xx <= px + 2; xx++) if (t(xx, yy) !== "water") set(xx, yy, "plaza");
    set(px, py, "dungeon");
    // church: a building block just north of the plaza, with a "church" marker cell
    for (var yy = py - 5; yy <= py - 3; yy++) for (var xx = px - 2; xx <= px + 2; xx++) if (t(xx, yy) === "street") set(xx, yy, "building");
    set(px, py - 3, "church");
    packBuildings({ x0: civic.x0, y0: py + 3, x1: civic.x1, y1: civic.y1 }, { wide: true, tall: true });
    packBuildings({ x0: civic.x0, y0: civic.y0, x1: civic.x1, y1: py - 6 }, { wide: true, tall: true });

    // ---- other districts
    dist.forEach(function (L) {
      if (L.role === "civic") return;
      if (L.role === "park") { for (var y = L.y0 + 1; y <= L.y1 - 1; y++) for (var x = L.x0 + 1; x <= L.x1 - 1; x++) if (t(x, y) === "street") set(x, y, "park"); return; }
      if (L.role === "graveyard") {
        for (var y = L.y0; y <= L.y1; y++) for (var x = L.x0; x <= L.x1; x++) if (t(x, y) === "street") set(x, y, (y === L.y0 || y === L.y1 || x === L.x0 || x === L.x1) ? "fence" : "graveyard");
        set(L.cx, L.y1, "gate");   // a graveyard gate (the one opening); also doubles legible
        // re-open the gate cell as a walkable break in the fence by making it 'graveyard' adjacent
        set(L.cx, L.y1, "graveyard");
        return;
      }
      if (L.role === "redlight") { buildRedlight(L); return; }
      packBuildings(L, L.role === "warehouse" ? { wide: true } : {});
    });

    // ---- SPINE + GATE: a wide main street from a top-border GATE straight down to the plaza,
    // bulldozing buildings in its path (the navigational backbone). Bridges where it crosses water.
    var gx = px, RL = meta.redlight;                            // gate aligned above the plaza
    function inRL(x, y) { return RL && x >= RL.x0 && x <= RL.x1 && y >= RL.y0 && y <= RL.y1; }   // never bulldoze the red-light ring (keeps its single entrance)
    for (var y = 0; y <= py; y++) { for (var dx = -1; dx <= 1; dx++) { var cx = gx + dx; if (!inb(cx, y) || inRL(cx, y)) continue; if (t(cx, y) === "water") set(cx, y, "bridge"); else if (t(cx, y) !== "plaza" && t(cx, y) !== "dungeon" && t(cx, y) !== "church") set(cx, y, "street"); } }
    set(gx, 0, "gate");
    // a cross street to the harbour so warehouse/piers connect, bridging water
    for (var x = 1; x < W - 1; x++) { var ry = landBot; if (inRL(x, ry)) continue; if (t(x, ry) === "water") set(x, ry, "bridge"); else if (t(x, ry) === "building") set(x, ry, "street"); }

    // ---- render grid
    var grid = []; for (var y = 0; y < H; y++) { var r = ""; for (var x = 0; x < W; x++) r += (GLYPH[tag[y][x]] || "?"); grid.push(r); }
    return { w: W, h: H, tag: tag, grid: grid, meta: meta, islandCells: meta.islandCells, seed: seed };
  }

  function generateGated(seed, attempts) {
    attempts = attempts || 120;
    var best = null, bestScore = -1;
    for (var i = 0; i < attempts; i++) {
      var m = generate((seed >>> 0) * 2654435761 + i + 1);
      if (!m) continue;
      var v = (typeof TD_TOWNLAWS !== "undefined") ? TD_TOWNLAWS.check(m) : { pass: true, laws: {} };
      if (v.pass) return { map: m, laws: v.laws, attempt: i + 1, passed: true };
      var sc = Object.keys(v.laws).filter(function (k) { return v.laws[k].pass; }).length;
      if (sc > bestScore) { bestScore = sc; best = { map: m, laws: v.laws, attempt: i + 1, passed: false }; }
    }
    return best;
  }

  return { generate: generate, generateGated: generateGated, GLYPH: GLYPH };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_TOWNGEN; }
