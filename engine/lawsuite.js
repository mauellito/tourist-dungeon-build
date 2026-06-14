// Tourist Dungeon — THE GATE: the dungeon spatial law-suite (Master Directive P3).
// Runs the inarguable spatial laws (SPATIAL LAWS v1: L1-L7 shared, D1-D4 dungeon) on a
// CANDIDATE MAP. The assembler (P2) calls this on every candidate; FAIL -> discard +
// regenerate. Each law reports a number, so failures are SHOWN, never hidden.
//
// Map input: { w, h, grid:[[char]], tag:[[string]], entry:{x,y} }
//   grid char: "#" rock/wall, "." open, "~" water.
//   tag:  per-cell semantic — wall | pillar | secret (non-walkable);  room | corridor |
//         door | feature | plaza | water | stair | landmark | loot (walkable).
// Classic script: assigns global TD_LAWS. DOM-free + deterministic.
"use strict";

var TD_LAWS = (function () {
  var WALK_TAGS = { room: 1, corridor: 1, door: 1, secret: 1, feature: 1, plaza: 1, water: 1, stair: 1, landmark: 1, loot: 1 };
  var BIG_OPEN_EXEMPT = { plaza: 1, feature: 1 };   // the one deliberate "opens into a larger area" (L2 exception)

  function walkable(m, x, y) { if (x < 0 || y < 0 || x >= m.w || y >= m.h) return false; var c = m.grid[y][x]; return c === "." || c === "~"; }
  function tagAt(m, x, y) { return (m.tag[y] && m.tag[y][x]) || "wall"; }
  var D4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  // largest connected component (4-conn) over a predicate; returns {max, total, comps:[{size, tags}]}.
  function components(m, pred) {
    var seen = {}, comps = [], max = 0, total = 0;
    for (var y = 0; y < m.h; y++) for (var x = 0; x < m.w; x++) {
      if (!pred(x, y) || seen[x + "," + y]) continue;
      var q = [[x, y]], size = 0, tags = {}, minx = x, miny = y, maxx = x, maxy = y; seen[x + "," + y] = 1;
      while (q.length) {
        var c = q.pop(), cx = c[0], cy = c[1]; size++; total++;
        if (cx < minx) minx = cx; if (cx > maxx) maxx = cx; if (cy < miny) miny = cy; if (cy > maxy) maxy = cy;
        var t = tagAt(m, cx, cy); tags[t] = (tags[t] || 0) + 1;
        for (var i = 0; i < 4; i++) { var nx = cx + D4[i][0], ny = cy + D4[i][1]; if (nx >= 0 && ny >= 0 && nx < m.w && ny < m.h && pred(nx, ny) && !seen[nx + "," + ny]) { seen[nx + "," + ny] = 1; q.push([nx, ny]); } }
      }
      comps.push({ size: size, tags: tags, minx: minx, miny: miny, maxx: maxx, maxy: maxy, cx: (minx + maxx) >> 1, cy: (miny + maxy) >> 1 }); if (size > max) max = size;
    }
    return { max: max, total: total, comps: comps };
  }

  function check(m) {
    var area = m.w * m.h, laws = {};
    function law(id, ok, value) { laws[id] = { pass: !!ok, value: value }; }

    // L1 NOT ALL BLACK — no big BLOB of undifferentiated rock. Measured as the largest
    // contiguous BURIED-rock region (a wall cell with no orthogonal floor face); the thin
    // wall skeleton between packed spaces has floor faces and does NOT count, so the
    // spacing law (walls-as-cells, >=1-cell gaps) passes by construction. (Interpretation:
    // "contiguous wall region" = a solid rock blob, not the whole connected wall network —
    // which in any real dungeon is one big component. Red-pennable.)
    var buriedC = components(m, function (x, y) {
      if (m.grid[y][x] !== "#") return false;
      for (var i = 0; i < 4; i++) if (walkable(m, x + D4[i][0], y + D4[i][1])) return false;
      return true;
    });
    law("L1", buriedC.max <= area * 0.25, (100 * buriedC.max / area).toFixed(1) + "% solid rock blob");   // Amendment 4: honest rock between scattered rooms is legal (<=25%); a rock field swallowing the level is not

    // L2 NOT ALL OPEN — no big OPEN BLOB. Largest contiguous DEEP-open region (an open
    // cell whose four orthogonal neighbours are all open — the interior of a fat field,
    // not a 1-2-wide corridor or a discrete room edge); one tagged plaza/feature exempt.
    var openC = components(m, function (x, y) { return walkable(m, x, y); });
    var deepC = components(m, function (x, y) {
      if (!walkable(m, x, y)) return false;
      for (var i = 0; i < 4; i++) if (!walkable(m, x + D4[i][0], y + D4[i][1])) return false;
      return true;
    });
    var biggestNonExempt = 0, exemptBig = 0;
    deepC.comps.forEach(function (c) {
      var exemptCells = 0; Object.keys(c.tags).forEach(function (t) { if (BIG_OPEN_EXEMPT[t]) exemptCells += c.tags[t]; });
      var isExempt = exemptCells >= c.size * 0.5;
      if (isExempt) { if (c.size > area * 0.18) exemptBig++; }
      else if (c.size > biggestNonExempt) biggestNonExempt = c.size;
    });
    law("L2", biggestNonExempt <= area * 0.18 && exemptBig <= 1, (100 * biggestNonExempt / area).toFixed(1) + "% deep-open blob; " + exemptBig + " plaza exception(s)");

    // L3 COVERAGE BAND — walkable 35-55%
    var walk = openC.total;
    law("L3", walk >= area * 0.28 && walk <= area * 0.50, (100 * walk / area).toFixed(1) + "% walkable");   // Amendment 4: 28-50% — sparser scatter qualifies; near-empty/near-solid-open still rejected

    // collect cells by tag
    var doors = [], corridors = [], rooms = [], waters = [], untagged = [];
    for (var y2 = 0; y2 < m.h; y2++) for (var x2 = 0; x2 < m.w; x2++) {
      if (!walkable(m, x2, y2)) continue;
      var t = tagAt(m, x2, y2);
      if (!WALK_TAGS[t]) untagged.push([x2, y2]);
      if (t === "door") doors.push([x2, y2]);
      else if (t === "corridor") corridors.push([x2, y2]);
      else if (t === "room") rooms.push([x2, y2]);
      if (m.grid[y2][x2] === "~") waters.push([x2, y2]);
    }

    // L4 EVERY DOOR WORKS — walkable on two OPPOSITE sides, wall on the other two
    var badDoors = 0;
    doors.forEach(function (d) {
      var ns = walkable(m, d[0], d[1] - 1) && walkable(m, d[0], d[1] + 1);
      var ew = walkable(m, d[0] - 1, d[1]) && walkable(m, d[0] + 1, d[1]);
      var through = (ns && !walkable(m, d[0] - 1, d[1]) && !walkable(m, d[0] + 1, d[1])) ||
                    (ew && !walkable(m, d[0], d[1] - 1) && !walkable(m, d[0], d[1] + 1));
      if (!through) badDoors++;
    });
    law("L4", badDoors === 0, badDoors + " doors not a clean through-passage");

    // L5 CORRIDORS BUILT NOT GNAWED — corridor flanked by wall on its two long sides;
    // and NO untagged walkable floor anywhere.
    var gnawed = 0;
    corridors.forEach(function (c) {
      var horiz = walkable(m, c[0] - 1, c[1]) || walkable(m, c[0] + 1, c[1]);
      var vert = walkable(m, c[0], c[1] - 1) || walkable(m, c[0], c[1] + 1);
      // a corridor cell runs along one axis; the perpendicular pair must be wall
      var okH = !walkable(m, c[0], c[1] - 1) && !walkable(m, c[0], c[1] + 1);   // horizontal run -> N/S wall
      var okV = !walkable(m, c[0] - 1, c[1]) && !walkable(m, c[0] + 1, c[1]);   // vertical run -> E/W wall
      if (horiz && vert) { /* a junction cell: allowed */ }
      else if (horiz && !okH) gnawed++;
      else if (vert && !okV) gnawed++;
    });
    law("L5", gnawed === 0 && untagged.length === 0, gnawed + " gnawed corridor tiles, " + untagged.length + " untagged floor");

    // L6 NOTHING OVERLAPS — no corridor cell adjacent to a room cell except via a door.
    var overlaps = 0;
    corridors.forEach(function (c) {
      for (var i = 0; i < 4; i++) { var nx = c[0] + D4[i][0], ny = c[1] + D4[i][1]; if (walkable(m, nx, ny) && tagAt(m, nx, ny) === "room") overlaps++; }
    });
    law("L6", overlaps === 0, overlaps + " corridor-room adjacencies not via a door");

    // L7 REACHABLE — every walkable cell reachable from entry (rooms + corridors one net)
    var entry = m.entry || (rooms[0] ? { x: rooms[0][0], y: rooms[0][1] } : (corridors[0] ? { x: corridors[0][0], y: corridors[0][1] } : null));
    var reached = 0;
    if (entry) {
      var seen = {}, q = [[entry.x, entry.y]]; seen[entry.x + "," + entry.y] = 1;
      while (q.length) { var c = q.pop(); reached++; for (var i = 0; i < 4; i++) { var nx = c[0] + D4[i][0], ny = c[1] + D4[i][1]; if (walkable(m, nx, ny) && !seen[nx + "," + ny]) { seen[nx + "," + ny] = 1; q.push([nx, ny]); } } }
    }
    law("L7", entry && reached === walk, reached + "/" + walk + " walkable reached from entry");

    // D1 ROOMS OFF CORRIDORS — every room component has a door onto a corridor
    var roomNoDoor = roomComponentsWithoutDoor(m);
    law("D1", roomNoDoor === 0, roomNoDoor + " rooms with no door onto a corridor");

    // D2 DEAD ENDS EARN IT — corridor dead-ends terminate in a secret/feature
    var nakedDead = 0;
    corridors.forEach(function (c) {
      var wn = 0; for (var i = 0; i < 4; i++) if (walkable(m, c[0] + D4[i][0], c[1] + D4[i][1])) wn++;
      if (wn === 1) {
        // legitimate if the cell or a neighbour is a secret/feature/landmark/loot/stair
        var legit = ["feature", "landmark", "loot", "stair"].indexOf(tagAt(m, c[0], c[1])) >= 0;
        for (var j = 0; j < 4 && !legit; j++) { var t2 = tagAt(m, c[0] + D4[j][0], c[1] + D4[j][1]); if (["secret", "feature", "landmark", "loot", "stair"].indexOf(t2) >= 0) legit = true; }
        if (!legit) nakedDead++;
      }
    });
    law("D2", nakedDead === 0, nakedDead + " naked dead-ends");

    // D3 VISTA — straight corridor runs of length ≥4 terminate on a feature/door/room/stair
    var vres = vistaCheck(m, corridors);
    law("D3", vres.bad === 0, vres.bad + "/" + vres.runs + " long runs end on blank wall");

    // D4 WATER RARE (per-level) — water only inside water-tagged cells
    var strayWater = 0; waters.forEach(function (w) { if (tagAt(m, w[0], w[1]) !== "water") strayWater++; });
    law("D4", strayWater === 0, strayWater + " water tiles outside a water feature");

    // ===== Amendment 2: POSITIVE STRUCTURE (the laws must REQUIRE rooms+corridors, not
    // just forbid blobs — else a uniform speckle of single tiles passes). The reference is
    // the operator's sheet: real rooms hung off a corridor spine. =====
    var minRooms = m.minRooms || 6;
    var roomRegions = components(m, function (x, y) { return walkable(m, x, y) && tagAt(m, x, y) === "room"; });
    var bigRooms = roomRegions.comps.filter(function (c) { return c.size >= 6; });
    var tinyRooms = roomRegions.comps.filter(function (c) { return c.size <= 2; }).length;
    // corridor cells: how many, and how many are LONE speckle (no orthogonal corridor/door run)
    var corrCount = 0, loneCorr = 0;
    function isLane(x, y) { var t = tagAt(m, x, y); return walkable(m, x, y) && (t === "corridor" || t === "door"); }
    corridors.forEach(function (cc) {
      corrCount++;
      var run = false; for (var i = 0; i < 4; i++) if (isLane(cc[0] + D4[i][0], cc[1] + D4[i][1])) run = true;
      if (!run) loneCorr++;
    });
    // isolated open cells (a walkable tile with no orthogonal walkable neighbour) — pure speckle
    var isolated = 0;
    for (var iy = 0; iy < m.h; iy++) for (var ix = 0; ix < m.w; ix++) {
      if (!walkable(m, ix, iy)) continue;
      var nb = 0; for (var i2 = 0; i2 < 4; i2++) if (walkable(m, ix + D4[i2][0], iy + D4[i2][1])) nb++;
      if (nb === 0) isolated++;
    }

    // L8 ROOMS EXIST AS ROOMS — enough contiguous room regions of real size
    law("L8", bigRooms.length >= minRooms, bigRooms.length + " real rooms (>=6 cells); want >=" + minRooms);
    // L9 CORRIDORS EXIST AS LANES — a real corridor network, none of it lone speckle, and a
    // MINORITY of the floor (circulation, not the bulk — rooms are the bulk; else a corridor
    // maze passes for "rooms hung off a spine").
    var roomCells = 0; roomRegions.comps.forEach(function (c) { roomCells += c.size; });
    law("L9", corrCount >= 16 && loneCorr === 0 && corrCount < roomCells, corrCount + " corridor cells (" + roomCells + " room), " + loneCorr + " lone (speckle)");
    // L10 ROOM/CORRIDOR DISTINCT — both kinds present, every open tile tagged one kind
    law("L10", bigRooms.length > 0 && corrCount > 0 && untagged.length === 0, "rooms+corridors present, " + untagged.length + " untagged open");
    // L11 NO SPECKLE — no checkerboard: no tiny room regions, no isolated single cells
    law("L11", tinyRooms === 0 && isolated === 0, tinyRooms + " tiny rooms, " + isolated + " isolated cells");
    // L16 ANTI-GRID (Amendment 4) — no more than 3 rooms share a top-edge row or a left-edge
    // column. A band/filing-cabinet stacks many rooms in alignment; a scattered hand-sheet does not.
    var alignT = {}, alignL = {}, maxAlign = 0;
    bigRooms.forEach(function (c) { alignT[c.miny] = (alignT[c.miny] || 0) + 1; alignL[c.minx] = (alignL[c.minx] || 0) + 1; });
    Object.keys(alignT).forEach(function (k) { if (alignT[k] > maxAlign) maxAlign = alignT[k]; });
    Object.keys(alignL).forEach(function (k) { if (alignL[k] > maxAlign) maxAlign = alignL[k]; });
    law("L16", maxAlign <= 3, maxAlign + " rooms share an edge-line (max 3)");

    var pass = Object.keys(laws).every(function (k) { return laws[k].pass; });
    return { pass: pass, laws: laws };

    // ---- helpers that need closure over m ----
    function roomComponentsWithoutDoor(mm) {
      var seen = {}, bad = 0;
      for (var y = 0; y < mm.h; y++) for (var x = 0; x < mm.w; x++) {
        if (seen[x + "," + y] || !(walkable(mm, x, y) && tagAt(mm, x, y) === "room")) continue;
        var q = [[x, y]], hasDoor = false; seen[x + "," + y] = 1;
        while (q.length) { var c = q.pop(); for (var i = 0; i < 4; i++) { var nx = c[0] + D4[i][0], ny = c[1] + D4[i][1]; if (nx < 0 || ny < 0 || nx >= mm.w || ny >= mm.h) continue; if (walkable(mm, nx, ny) && tagAt(mm, nx, ny) === "door") hasDoor = true; if (walkable(mm, nx, ny) && tagAt(mm, nx, ny) === "room" && !seen[nx + "," + ny]) { seen[nx + "," + ny] = 1; q.push([nx, ny]); } } }
        if (!hasDoor) bad++;
      }
      return bad;
    }
    function vistaCheck(mm, corr) {
      // scan maximal straight corridor runs; a run ≥4 whose end butts a WALL terminus must
      // have a feature/door/room/stair/landmark adjacent to that end (it ends on SOMETHING).
      // A run that flows into another walkable cell (a junction/turn) is not a blank-wall end.
      var bad = 0, runs = 0, isC = {}; corr.forEach(function (c) { isC[c[0] + "," + c[1]] = 1; });
      var INTEREST = ["feature", "door", "room", "stair", "landmark"];
      function interestNear(x, y) { if (INTEREST.indexOf(tagAt(mm, x, y)) >= 0) return true; for (var i = 0; i < 4; i++) if (INTEREST.indexOf(tagAt(mm, x + D4[i][0], y + D4[i][1])) >= 0) return true; return false; }
      ["h", "v"].forEach(function (axis) {
        var dx = axis === "h" ? 1 : 0, dy = axis === "h" ? 0 : 1, visited = {};
        corr.forEach(function (c) {
          if (visited[axis + c[0] + "," + c[1]]) return;
          var sx = c[0], sy = c[1];
          while (isC[(sx - dx) + "," + (sy - dy)]) { sx -= dx; sy -= dy; }
          var ex = sx, ey = sy, len = 0;
          while (isC[ex + "," + ey]) { visited[axis + ex + "," + ey] = 1; ex += dx; ey += dy; len++; }
          if (len < 4) return;
          runs++;
          // a long run that turns or joins another corridor at its end is a fine vista;
          // only a run that truly DEAD-ENDS (its last cell has no onward walkable neighbour)
          // must end on something of interest.
          [[sx, sy], [ex - dx, ey - dy]].forEach(function (last) {
            var wn = 0; for (var i = 0; i < 4; i++) if (walkable(mm, last[0] + D4[i][0], last[1] + D4[i][1])) wn++;
            if (wn <= 1 && !interestNear(last[0], last[1])) bad++;
          });
        });
      });
      return { bad: bad, runs: runs };
    }
  }

  // ---- TYPE PARAMETERS (Dungeon Type STANDARD v1): the measured knobs that DRIFT per
  // level. measureType returns the numbers; conformsType checks them against a level's band.
  function measureType(m) {
    var W = m.w, H = m.h, area = W * H, D = D4;
    function wk(x, y) { return x >= 0 && y >= 0 && x < W && y < H && m.grid[y][x] !== "#"; }
    function tg(x, y) { return (m.tag[y] && m.tag[y][x]) || "wall"; }
    // room regions (with bbox, for regularity + size-spread)
    var seen = {}, rooms = [];
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      if (seen[x + "," + y] || !(wk(x, y) && tg(x, y) === "room")) continue;
      var q = [[x, y]], cells = [], minx = x, maxx = x, miny = y, maxy = y; seen[x + "," + y] = 1;
      while (q.length) { var c = q.pop(); cells.push(c); if (c[0] < minx) minx = c[0]; if (c[0] > maxx) maxx = c[0]; if (c[1] < miny) miny = c[1]; if (c[1] > maxy) maxy = c[1]; for (var i = 0; i < 4; i++) { var nx = c[0] + D[i][0], ny = c[1] + D[i][1]; if (wk(nx, ny) && tg(nx, ny) === "room" && !seen[nx + "," + ny]) { seen[nx + "," + ny] = 1; q.push([nx, ny]); } } }
      rooms.push({ size: cells.length, bw: maxx - minx + 1, bh: maxy - miny + 1, minx: minx, miny: miny, maxx: maxx, maxy: maxy });
    }
    var big = rooms.filter(function (r) { return r.size >= 6; });
    // regular = bounding box is entirely room (a clean rectangle, no irregular bite)
    var regular = big.filter(function (r) { return r.size === r.bw * r.bh; }).length;
    // size spread: most rooms sharing one (bw x bh) footprint
    var sizeCount = {}, maxOneSize = 0; big.forEach(function (r) { var k = r.bw + "x" + r.bh; sizeCount[k] = (sizeCount[k] || 0) + 1; if (sizeCount[k] > maxOneSize) maxOneSize = sizeCount[k]; });
    // corridors + straightness (a cell is "straight" if in a >=4 run horizontally or vertically)
    var corr = [], V = 0, E = 0;
    for (var y2 = 0; y2 < H; y2++) for (var x2 = 0; x2 < W; x2++) {
      if (!wk(x2, y2)) continue; V++;
      if (wk(x2 + 1, y2)) E++; if (wk(x2, y2 + 1)) E++;                      // orthogonal adjacencies (each once)
      if (tg(x2, y2) === "corridor") corr.push([x2, y2]);
    }
    function runLen(x, y, dx, dy) { var n = 1, a = x + dx, b = y + dy; while (tg(a, b) === "corridor") { n++; a += dx; b += dy; } a = x - dx; b = y - dy; while (tg(a, b) === "corridor") { n++; a -= dx; b -= dy; } return n; }
    var straight = 0; corr.forEach(function (c) { if (runLen(c[0], c[1], 1, 0) >= 4 || runLen(c[0], c[1], 0, 1) >= 4) straight++; });
    // secrets, dead-ends, loops (independent cycles = E - V + components; the net is connected).
    // A dead-end = a circulation terminus: a corridor OR feature cell with exactly one walkable
    // neighbour. Counting feature-capped stubs is deliberate — D2 *requires* a dead-end to earn
    // its keep with a feature, so in this game every dead end is feature-tipped; a measure that
    // only counted naked corridor stubs could never agree with D2. (Flagged to the operator.)
    var secrets = 0, deadEnds = 0;
    for (var y3 = 0; y3 < H; y3++) for (var x3 = 0; x3 < W; x3++) { var tt = tg(x3, y3); if (tt === "secret") secrets++; if (tt === "corridor" || tt === "feature") { var n = 0; for (var i = 0; i < 4; i++) if (wk(x3 + D[i][0], y3 + D[i][1])) n++; if (n === 1) deadEnds++; } }
    var loops = E - V + 1;
    return {
      roomCount: big.length, maxOneSize: maxOneSize,
      regularPct: big.length ? regular / big.length : 0,
      straightPct: corr.length ? straight / corr.length : 0,
      corridorPct: corr.length / area,
      secrets: secrets, deadEnds: deadEnds, loops: loops
    };
  }

  // conformsType — measured params vs a level's drifted target band. Returns {pass, checks}.
  function conformsType(m, t) {
    var p = measureType(m), checks = {};
    function chk(id, ok, val) { checks[id] = { pass: !!ok, value: val }; }
    chk("room_count", p.roomCount >= t.roomMin && p.roomCount <= t.roomMax, p.roomCount + " (band " + t.roomMin + "-" + t.roomMax + ")");
    chk("size_spread", p.maxOneSize <= t.sizeSpreadMax, p.maxOneSize + " of one size (max " + t.sizeSpreadMax + ")");
    chk("regularity", p.regularPct <= t.regularMax + 1e-9, (100 * p.regularPct).toFixed(0) + "% regular (max " + (100 * t.regularMax).toFixed(0) + "%)");
    chk("straightness", p.straightPct <= t.straightMax + 1e-9, (100 * p.straightPct).toFixed(0) + "% straight (max " + (100 * t.straightMax).toFixed(0) + "%)");
    chk("corridor_amount", p.corridorPct >= t.corridorMin - 1e-9, (100 * p.corridorPct).toFixed(0) + "% corridor (min " + (100 * t.corridorMin).toFixed(0) + "%)");
    chk("dead_ends", p.deadEnds >= t.deadEndsMin, p.deadEnds + " (min " + t.deadEndsMin + ")");
    chk("secrets", p.secrets >= t.secretsMin, p.secrets + " (min " + t.secretsMin + ")");
    chk("loops", p.loops >= t.loopsMin, p.loops + " (min " + t.loopsMin + ")");
    var pass = Object.keys(checks).every(function (k) { return checks[k].pass; });
    return { pass: pass, checks: checks, measured: p };
  }

  return { check: check, measureType: measureType, conformsType: conformsType, WALK_TAGS: WALK_TAGS };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_LAWS; }
