// Tourist Dungeon engine — VISUAL MAP MODE + living systems + ADOM-minimum grammar.
// A view/play layer over the engine: it draws a 2D tile view, moves a tile
// avatar, and crosses an EDGE door ONLY by asking the interpreter (TD_INTERP) — so
// generation and the checker stay untouched. On top of that it adds the living
// systems (creatures + bump-to-fight combat narrated in the Bureau register,
// body meters with a long hunger ladder and rest-recovery) and the classic
// roguelike grammar: turn-based world, floor items + inventory, a tiered message
// log, a turn counter, wait, search for secrets, plain doors that open/close, and
// a look command (look state itself is owned by the town controller, TD_GAME).
//
// Messages are objects { text, urgent } so the view can render critical events
// (HP below a quarter, STARVING, a one-way seal, death) bold + red.
//
// Classic script: assigns the global TD_MAP. Requires TD_RNG, TD_INTERP.
"use strict";

var TD_MAP = (function () {
  var W = 54, H = 34, CX = 27, CY = 17;   // the live floor IS TD_GEN2's "regular" worked floor (zero open corners); W/H match its native dims
  var REVEAL = 4;

  // (the fixed 8-slot door template was removed in Round 1.5 — door mouths now
  // derive from the carved cluster's own perimeter, not a hardcoded compass.)
  var DIRS = {
    up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
    ul: [-1, -1], ur: [1, -1], dl: [-1, 1], dr: [1, 1]
  };
  var STEP4 = ["up", "down", "left", "right"];

  // --- living-systems tuning (bible §4.13/§4.15 calibration) ----------------
  // GATE 1: combat/damage numbers + creature stats now live in the pure TD_RESOLVE.COMBAT (single
  // source of truth); mapmode reads them and calls TD_RESOLVE for the attack/hp/death math.
  var PLAYER_DMG = TD_RESOLVE.COMBAT.PLAYER_DMG;
  // three distinct simple behaviours: wanderer (drifts, occasionally toward you),
  // lurker (still until you come close, then hunts), chaser (relentless pursuit).
  var CREATURE = TD_RESOLVE.COMBAT.CREATURES;
  // generous slack: walking is cheap, fighting costs, resting recovers fatigue,
  // and a full belly carries you across several levels before food matters.
  var FATIGUE_PER_STEP = 0.5, FATIGUE_PER_FIGHT = 6, REST_RECOVER = 4;
  var SATIATION_PER_STEP = 0.3, STARVE_HP = TD_RESOLVE.COMBAT.STARVE_HP, EXHAUST_HP = TD_RESOLVE.COMBAT.EXHAUST_HP;
  var FALL_DMG = TD_RESOLVE.COMBAT.FALL_DMG;   // the chasm exit: a desperate fall to the level below
  // R3 spawns are PER-WALKABLE-CELL DENSITIES (ratios, not counts) so a NODE->STANDARD floor-size
  // flip never re-balances combat or greed. PLACEHOLDER densities (calibration pending).
  var CREATURE_DENSITY = 0.012, COIN_DENSITY = 0.02;
  // the secret-grammar vocabulary (CLAUDE.md): a fixed, learnable set of tells
  var TELLS = (typeof TD_VAULTS !== "undefined" && TD_VAULTS.TELLS) || {
    draft:  { text: "A cold draft slides from a seam in the wall.", kind: "heard", obj: "OBJ" },
    rhyme:  { text: "A scratched couplet hints the wall keeps a secret of its own.", kind: "seen", obj: "OBJ" },
    hollow: { text: "Your knuckles find a hollow note in the stone.", kind: "heard", obj: "OBJ" }
  };

  // the named hunger ladder (only the bottom rung, STARVING, costs HP).
  var HUNGER_LADDER = ["well fed", "Peckish", "Hungry", "Famished", "Starving"];
  function hungerStage(m) {
    var pct = m.satiationMax ? (m.satiation / m.satiationMax) : 0;
    if (pct > 0.66) return { stage: "well fed", rung: 0, critical: false };
    if (pct > 0.40) return { stage: "Peckish", rung: 1, critical: false };
    if (pct > 0.18) return { stage: "Hungry", rung: 2, critical: false };
    if (pct > 0.05) return { stage: "Famished", rung: 3, critical: false };
    return { stage: "Starving", rung: 4, critical: true };
  }

  // --- items (the floor loot + inventory) -----------------------------------
  var ITEMS = {
    ration:   { glyph: "%", name: "a vendor's bun",        use: "eat",     food: 55,
      desc: "A cold bun from a harbour cart. Eating it climbs you back up the hunger ladder." },
    bandage:  { glyph: "!", name: "a roll of field bandage", use: "heal",  heal: 30,
      desc: "Municipal-issue field dressing. Apply it to close your wounds." },
    souvenir: { glyph: "*", name: "a chipped harbour charm", use: "inspect",
      desc: "A glazed charm shaped like the Brass Door. It does nothing, expensively." }
  };
  function makeItem(kind) {
    var d = ITEMS[kind];
    return { kind: kind, glyph: d.glyph, name: d.name, desc: d.desc, use: d.use, food: d.food, heal: d.heal };
  }

  function key(x, y) { return x + "," + y; }
  function cap(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }
  function newGrid() { var g = []; for (var y = 0; y < H; y++) { var r = []; for (var x = 0; x < W; x++) r.push("#"); g.push(r); } return g; }
  function inb(x, y) { return x >= 0 && x < W && y >= 0 && y < H; }
  function carveRect(g, cx, cy, hw, hh) { for (var y = cy - hh; y <= cy + hh; y++) for (var x = cx - hw; x <= cx + hw; x++) if (inb(x, y)) g[y][x] = "."; }
  function carvePath(g, x0, y0, x1, y1) {
    var x = x0, y = y0;
    while (x !== x1) { if (inb(x, y)) g[y][x] = "."; x += (x1 > x) ? 1 : -1; }
    while (y !== y1) { if (inb(x, y)) g[y][x] = "."; y += (y1 > y) ? 1 : -1; }
    if (inb(x1, y1)) g[y1][x1] = ".";
  }

  // ===========================================================================
  // ROOM GEOMETRY (v21 — DUNGEON ARCHITECTURE LAW v1). CORRIDORS FIRST: lay a hallway
  // network (bends, junctions, dead-ends, width 1-3), reserve its tips as the node's
  // edge-doors, then ACCRETE rooms onto the corridor walls through single doorways in
  // straight wall runs — a room is accepted only if its box plus a one-cell margin is
  // entirely wall, so rooms never merge and never touch at a corner (the Brogue rule).
  // Doors carry states (closed / ajar / open). The graph layer is UNTOUCHED: composeNode
  // renders one node's screen and returns its N edge-doors as reachable doorways, in
  // graph-edge order. (Replaces the v18 room-cluster composer, which produced blobs.)
  // ===========================================================================
  function clampi(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function carveBox(g, x0, y0, x1, y1) { for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) if (inb(x, y)) g[y][x] = "."; }
  function floorCells(g) { var c = []; for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (g[y][x] === ".") c.push([x, y]); return c; }
  function carveCorridor(g, x0, y0, x1, y1, w, R) {
    var horizFirst = R.chance(0.5), midx = horizFirst ? x1 : x0, midy = horizFirst ? y0 : y1;
    function seg(ax, ay, bx, by) {
      var x = ax, y = ay;
      while (true) { if (inb(x, y)) { g[y][x] = "."; if (w === 2) { var px = (ay === by) ? x : x + 1, py = (ay === by) ? y + 1 : y; if (inb(px, py)) g[py][px] = "."; } } if (x === bx && y === by) break; x += (bx > x) ? 1 : (bx < x ? -1 : 0); y += (by > y) ? 1 : (by < y ? -1 : 0); }
    }
    seg(x0, y0, midx, midy); seg(midx, midy, x1, y1);
  }
  function nodeRng(seed, nodeKey) {
    var h = (seed >>> 0) ^ 0x9e3779b9, s = "" + nodeKey;
    for (var i = 0; i < s.length; i++) h = (Math.imul(h ^ s.charCodeAt(i), 16777619)) >>> 0;
    return TD_RNG.make(h || 1);
  }
  var DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // The live floor is ASSEMBLER-ONLY. The pre-law-suite carver (composeNodeOld) must never ship — it
  // has open corners + meaningless geometry. composeNode retries the gated assembler with fresh seeds
  // and, only if every retry fails (a real generator gap), renders an UNMISTAKABLE debug floor. The
  // legacy carver is kept for reference but hard-gated off.
  var ALLOW_LEGACY = false;
  var asmTally = { assembler: 0, gen2: 0, retryRescued: 0, debug: 0, noGen2: 0, worstLaw: {} };
  // THE LIVE FLOOR IS TD_GEN2 (the zero-open-corner / 8-neighbor-isolation worked generator). composeNode
  // calls TD_GEN2.generateLevel and RENDERS IT DIRECTLY: its grid IS the floor (no carve, punch, or
  // edge-door retrofit). gen2 encodes content as glyphs in the grid (# wall, o pillar, X chasm, ~ water,
  // . floor, + door, ? secret, $ loot, < up-stair, > down-stair); we read those into the controller's
  // structures WITHOUT changing the walkable footprint (so its 0 open corners survive verbatim).
  var GEN2_WALL = { "#": 1, "o": 1 };   // pillar renders as rock; chasm/water keep their own glyph
  function composeNodeGen2(seed, nodeKey, numDoors) {
    if (typeof TD_GEN2 === "undefined") return null;
    var R = nodeRng(seed, nodeKey + ":g2");
    var lvl = TD_GEN2.generateLevel(R.int(1, 2000000000) >>> 0, { size: "regular", grammar: "worked", skin: "stone" });
    var src = lvl.grid;
    var g = [], rawGrid = [], roomDoors = [], secrets = [], loot = [], nF = 0, ax = 0, ay = 0;
    for (var y = 0; y < H; y++) {
      var row = [];
      for (var x = 0; x < W; x++) {
        var c = (src[y] && src[y][x]) || "#";
        var out = GEN2_WALL[c] ? "#" : (c === "X") ? "X" : (c === "~") ? "~" : ".";   // walkable footprint preserved exactly
        row.push(out);
        if (out === "." || out === "~") { nF++; ax += x; ay += y; }
        if (c === "+") roomDoors.push({ x: x, y: y, state: R.pick(["closed", "closed", "ajar", "open"]) });
        if (c === "?") secrets.push({ x: x, y: y });
        if (c === "$") loot.push({ x: x, y: y });
      }
      g.push(row); rawGrid.push(row.slice());
    }
    function isF(x, y) { return g[y] && g[y][x] === "."; }
    var spawn = lvl.up ? { x: lvl.up.x, y: lvl.up.y } : { x: CX, y: CY };
    // LEVEL TRANSITIONS use gen2's OWN stairs: descent = its down-stair, ascent = its up-stair.
    var downStair = lvl.down ? { x: lvl.down.x, y: lvl.down.y, kind: "down" } : null;
    var upStair = lvl.up ? { x: lvl.up.x, y: lvl.up.y, kind: "up" } : null;
    // SAME-LEVEL (breadth) edges sit on EXISTING floor cells (dead-ends first, then far cells) — NEVER
    // carved (operator ruling). gen2 invents no geometry for graph edges; the seam is flagged, not punched.
    var stairKeys = {}; if (downStair) stairKeys[downStair.x + "," + downStair.y] = 1; if (upStair) stairKeys[upStair.x + "," + upStair.y] = 1;
    var featDead = [];
    for (var dy = 1; dy < H - 1; dy++) for (var dx = 1; dx < W - 1; dx++) { if (g[dy][dx] !== ".") continue; var fn = DIR4.filter(function (d) { return isF(dx + d[0], dy + d[1]); }); if (fn.length === 1) featDead.push({ x: dx, y: dy }); }
    var seenB = {}, breadthCells = [];
    function addB(c) { var k = c.x + "," + c.y; if (!seenB[k] && !stairKeys[k] && !(c.x === spawn.x && c.y === spawn.y) && breadthCells.length < 16) { seenB[k] = 1; breadthCells.push({ x: c.x, y: c.y }); } }
    featDead.forEach(addB);
    if (breadthCells.length < 16) {
      var fl = []; for (var y2 = 1; y2 < H - 1; y2++) for (var x2 = 1; x2 < W - 1; x2++) if (g[y2][x2] === "." && !seenB[x2 + "," + y2] && !stairKeys[x2 + "," + y2] && !(x2 === spawn.x && y2 === spawn.y)) fl.push([x2, y2]);
      fl.sort(function (a, b) { return (Math.abs(b[0] - spawn.x) + Math.abs(b[1] - spawn.y)) - (Math.abs(a[0] - spawn.x) + Math.abs(a[1] - spawn.y)); });
      for (var i = 0; i < fl.length && breadthCells.length < 16; i++) addB({ x: fl[i][0], y: fl[i][1] });
    }
    return {
      grid: g, rawGrid: rawGrid, spawn: spawn,
      downStair: downStair, upStair: upStair, breadthCells: breadthCells,
      doorPts: (downStair ? [downStair] : []).concat(upStair ? [upStair] : []).concat(breadthCells),   // wired-exit list (compat)
      roomDoors: roomDoors, secrets: secrets, loot: loot, deadEnds: [],
      tag: "gen2", rooms: 0, roomList: [], corridorCells: 0,
      corrLens: [], corrWidths: [], comX: nF ? ax / nF : spawn.x, comY: nF ? ay / nF : spawn.y, floorDensity: nF / (W * H), source: "gen2"
    };
  }
  function composeNode(seed, nodeKey, numDoors) {
    // LIVE = TD_GEN2, rendered directly (no retrofit). gen2 is deterministic + always returns a valid
    // floor, so no retries are needed. If gen2 is absent: the test-only legacy carver (when a suite flips
    // TD_MAP.setLegacy(true)) else a LOUD console.error + an unmistakable debug floor (never a blob).
    var a = composeNodeGen2(seed, nodeKey, numDoors);
    if (a) { asmTally.gen2++; asmTally.assembler++; return a; }
    asmTally.noGen2++;
    // TEST-ONLY: legacy-carver unit suites (run_architecture/run_map) flip TD_MAP.setLegacy(true) to
    // exercise composeNodeOld directly. NEVER reachable in live play (ALLOW_LEGACY is false by default).
    if (ALLOW_LEGACY) { var legacy = composeNodeOld(seed, nodeKey, numDoors); if (legacy) { asmTally.legacy = (asmTally.legacy || 0) + 1; return legacy; } }
    asmTally.debug++;
    console.error("composeNode: " + nodeKey + " UNAVAILABLE (TD_GEN2 not loaded) — tally " + JSON.stringify(asmTally) + " — rendering DEBUG FLOOR");
    return debugFloor(seed, nodeKey, numDoors);
  }
  // an UNMISTAKABLE last-resort floor: one small room + a Bureau sign reading the failure. Never
  // mistakable for real geometry. Only reachable if every assembler retry failed (a generator gap).
  function debugFloor(seed, nodeKey, numDoors) {
    var g = newGrid(), rx = CX - 3, ry = CY - 2;
    for (var y = ry; y <= ry + 4; y++) for (var x = rx; x <= rx + 6; x++) if (inb(x, y)) g[y][x] = ".";
    var spawn = { x: CX, y: CY }, signKey = key(rx + 1, ry + 1);
    var edge = []; for (var i = 0; i < numDoors; i++) { var ex = rx + 1 + i, ey = ry + 4; if (g[ey] && g[ey][ex] === ".") edge.push({ x: ex, y: ey }); }
    return {
      grid: g, spawn: spawn, doorPts: edge, roomDoors: [], deadEnds: [],
      tag: "debug", rooms: 1, roomList: [], corridorCells: 0, corrLens: [], corrWidths: [],
      comX: CX, comY: CY, floorDensity: 0, source: "debug",
      sign: { key: signKey, text: "FLOOR UNAVAILABLE — see console" }
    };
  }
  function composeNodeOld(seed, nodeKey, numDoors) {
    if (!ALLOW_LEGACY) return null;   // HARD-GATED: the pre-law-suite carver must never ship to play

    var R = nodeRng(seed, nodeKey), g = newGrid();
    var corr = {};                                   // corridor cell keys "x,y"
    var LO = 2, HIX = W - 3, HIY = H - 3;             // 2-wide wall border (room for door runs)
    function inM(x, y) { return x >= LO && x <= HIX && y >= LO && y <= HIY; }
    function ck(x, y) { return x + "," + y; }
    function carveCell(x, y) { if (inb(x, y)) { g[y][x] = "."; corr[ck(x, y)] = 1; } }
    var corrLens = [], corrWidths = [];

    // --- 1. CORRIDOR SPINE: a snaking main run, varied width + orthogonal bends. ---
    var px = clampi(Math.round(W * 0.5) + R.int(-5, 5), LO + 2, HIX - 2);
    var py = clampi(Math.round(H * 0.5) + R.int(-2, 2), LO + 1, HIY - 1);
    var spineCells = [[px, py]]; carveCell(px, py);
    var dirIdx = R.int(0, 3), segN = R.int(3, 5);
    for (var s = 0; s < segN; s++) {
      var d = DIR4[dirIdx], len = R.int(4, 9), w = R.pick([1, 1, 2, 3]), moved = 0;
      for (var step = 0; step < len; step++) {
        var nx = px + d[0], ny = py + d[1];
        if (!inM(nx, ny)) break;
        px = nx; py = ny; carveCell(px, py); spineCells.push([px, py]);
        if (w >= 2) { var ax = px + (d[1] ? 1 : 0), ay = py + (d[0] ? 1 : 0); if (inM(ax, ay)) carveCell(ax, ay); }
        if (w >= 3) { var bx = px + (d[1] ? -1 : 0), by = py + (d[0] ? -1 : 0); if (inM(bx, by)) carveCell(bx, by); }
        moved++;
      }
      if (moved) { corrLens.push(moved); corrWidths.push(w); }
      dirIdx = (dirIdx < 2 ? 2 : 0) + R.int(0, 1);     // turn perpendicular (a bend / junction)
    }

    // --- 2. BRANCHES ending in dead-end tips (the well of edge-doors). ---
    var tips = [];
    function tryBranch() {
      var base = spineCells[R.int(0, spineCells.length - 1)], d = DIR4[R.int(0, 3)], len = R.int(2, 6);
      var fx = base[0] + d[0], fy = base[1] + d[1];
      if (!inM(fx, fy) || g[fy][fx] === ".") return false;     // first step must enter wall (a real branch)
      var path = [], x = base[0], y = base[1];
      for (var k = 0; k < len; k++) { var nx = x + d[0], ny = y + d[1]; if (!inM(nx, ny) || g[ny][nx] === ".") break; x = nx; y = ny; path.push([x, y]); }
      if (path.length < 1) return false;
      path.forEach(function (p) { carveCell(p[0], p[1]); });
      var tip = path[path.length - 1]; tips.push({ x: tip[0], y: tip[1] });
      corrLens.push(path.length); corrWidths.push(1);
      return true;
    }
    var want = Math.max(numDoors, 4), guard = 0;
    while (tips.length < want && guard++ < 120) tryBranch();
    // hard guarantee numDoors tips: stub a single wall cell off any spine cell.
    guard = 0;
    while (tips.length < numDoors && guard++ < 400) {
      var b = spineCells[R.int(0, spineCells.length - 1)];
      for (var di = 0; di < 4; di++) { var t2 = [b[0] + DIR4[di][0], b[1] + DIR4[di][1]]; if (inM(t2[0], t2[1]) && g[t2[1]][t2[0]] === "#") { carveCell(t2[0], t2[1]); tips.push({ x: t2[0], y: t2[1] }); break; } }
    }

    // --- 3. SPAWN on the spine; EDGE-DOORS = the first numDoors tips (graph-edge order). ---
    var spawn = { x: spineCells[0][0], y: spineCells[0][1] };
    var edgeDoors = tips.slice(0, numDoors).map(function (t) { return { x: t.x, y: t.y }; });

    // --- 4. ROOMS: accrete onto the corridor through a doorway in a straight wall run. ---
    var rooms = [], roomDoors = [];
    function boxClear(x0, y0, x1, y1) {
      for (var y = y0 - 1; y <= y1 + 1; y++) for (var x = x0 - 1; x <= x1 + 1; x++) {
        if (x < 1 || x > W - 2 || y < 1 || y > H - 2) return false;
        if (g[y][x] !== "#") return false;                  // box + 1-cell margin must be all wall
      }
      return true;
    }
    var allCorr = Object.keys(corr).map(function (k) { var p = k.split(","); return [+p[0], +p[1]]; });
    var target = R.int(3, 5), rtry = 0;
    while (rooms.length < target && rtry++ < 260 && allCorr.length) {
      var c = allCorr[R.int(0, allCorr.length - 1)], d2 = DIR4[R.int(0, 3)];
      var rw = R.int(2, 6), rh = R.int(2, 5);
      var dwx = c[0] + d2[0], dwy = c[1] + d2[1];           // doorway cell (wall -> floor)
      if (!inb(dwx, dwy) || g[dwy][dwx] !== "#") continue;
      var x0, y0, x1, y1;
      if (d2[0] === 1) { x0 = c[0] + 2; x1 = x0 + rw - 1; y0 = c[1] - (rh >> 1); y1 = y0 + rh - 1; }
      else if (d2[0] === -1) { x1 = c[0] - 2; x0 = x1 - rw + 1; y0 = c[1] - (rh >> 1); y1 = y0 + rh - 1; }
      else if (d2[1] === 1) { y0 = c[1] + 2; y1 = y0 + rh - 1; x0 = c[0] - (rw >> 1); x1 = x0 + rw - 1; }
      else { y1 = c[1] - 2; y0 = y1 - rh + 1; x0 = c[0] - (rw >> 1); x1 = x0 + rw - 1; }
      if (!boxClear(x0, y0, x1, y1)) continue;
      var perp = d2[0] ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];     // doorway flanks must be wall (straight run)
      if (g[dwy + perp[0][1]][dwx + perp[0][0]] !== "#" || g[dwy + perp[1][1]][dwx + perp[1][0]] !== "#") continue;
      carveBox(g, x0, y0, x1, y1);
      g[dwy][dwx] = ".";                                    // the doorway opens
      var state = R.pick(["closed", "closed", "ajar", "open"]);
      roomDoors.push({ x: dwx, y: dwy, state: state });
      rooms.push({ x0: x0, y0: y0, x1: x1, y1: y1, tag: "room", aspect: (x1 - x0 + 1) / (y1 - y0 + 1), area: (x1 - x0 + 1) * (y1 - y0 + 1), door: { x: dwx, y: dwy } });
    }

    // --- 5. CONNECTIVITY: spawn must reach every edge-door + room doorway. ---
    function reachSet() { var seen = {}, q = [[spawn.x, spawn.y]]; seen[ck(spawn.x, spawn.y)] = 1; while (q.length) { var c = q.shift(); DIRS4(c[0], c[1]).forEach(function (n) { if (g[n[1]] && g[n[1]][n[0]] === "." && !seen[ck(n[0], n[1])]) { seen[ck(n[0], n[1])] = 1; q.push(n); } }); } return seen; }
    var seen = reachSet();
    edgeDoors.concat(rooms.map(function (r) { return r.door; })).forEach(function (d) {
      if (d && !seen[ck(d.x, d.y)]) { carveCorridor(g, d.x, d.y, spawn.x, spawn.y, 1, R); seen = reachSet(); }
    });

    // --- 6. SEAL open corners: no diagonal floor-floor leak. Rooms cannot be in a leak
    // (their margin is all wall), so this only ever widens corridor — never breaches a
    // room. Bridge by opening one between-wall (adds floor, never disconnects). ---
    for (var pass = 0; pass < 2; pass++) for (var y = 1; y < H - 1; y++) for (var x = 1; x < W - 1; x++) {
      if (g[y][x] === "." && g[y + 1][x + 1] === "." && g[y][x + 1] === "#" && g[y + 1][x] === "#") g[y][x + 1] = ".";
      if (g[y][x] === "." && g[y + 1][x - 1] === "." && g[y][x - 1] === "#" && g[y + 1][x] === "#") g[y][x - 1] = ".";
    }

    var all = floorCells(g), ax2 = 0, ay2 = 0; all.forEach(function (c) { ax2 += c[0]; ay2 += c[1]; });
    // v2 (Jaquay) — DEAD ENDS must HIDE something. Every floor cell with exactly one
    // floor neighbour that is NOT an edge-door is a naked dead-end; record it with the
    // wall it terminates against, so the runtime places a telegraphed secret there (a
    // dead end that hides a secret is legitimate; a naked one is not).
    var edgeSet = {}; edgeDoors.forEach(function (d) { edgeSet[ck(d.x, d.y)] = 1; });
    var deadEnds = [];
    all.forEach(function (c) {
      var x = c[0], y = c[1]; if (edgeSet[ck(x, y)]) return;
      var fn = DIR4.filter(function (d) { return g[y + d[1]] && g[y + d[1]][x + d[0]] === "."; });
      if (fn.length === 1) { var d = fn[0], wx = x - d[0], wy = y - d[1]; if (g[wy] && g[wy][wx] === "#") deadEnds.push({ x: x, y: y, wallX: wx, wallY: wy }); }
    });
    return {
      grid: g, spawn: spawn, doorPts: edgeDoors, roomDoors: roomDoors, deadEnds: deadEnds, tag: "corridor", rooms: rooms.length,
      roomList: rooms.map(function (rm) { return { tag: rm.tag, aspect: rm.aspect, area: rm.area, x0: rm.x0, y0: rm.y0, x1: rm.x1, y1: rm.y1, door: rm.door }; }),
      corridorCells: Object.keys(corr).length, corrLens: corrLens, corrWidths: corrWidths,
      comX: all.length ? ax2 / all.length : spawn.x, comY: all.length ? ay2 / all.length : spawn.y,
      floorDensity: all.length / (W * H)
    };
  }
  function DIRS4(x, y) { return [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]]; }

  function create(world, opts) {
    opts = opts || {};
    var livingOn = opts.hazards !== false && opts.creatures !== false;
    var interp = TD_INTERP.create(world);
    var seed = (world.meta && world.meta.seed) || 1;
    var rng = TD_RNG.make(seed + 7);

    var shared = opts.shared || {};
    var ctrl = {
      world: world, interp: interp,
      node: interp.state.node,
      grid: null, doors: null, player: null, features: {}, pendingDoor: null,
      items: {}, plain: {}, secrets: {}, roomDoors: {},
      creatures: [], explored: null, exploredByNode: {}, fx: [],
      water: {}, chasm: {}, pendingFall: null, sensedSecret: {},
      dead: false, won: false, cause: null, lastEvent: null, lastUrgent: false,
      meters: shared.meters || { hp: 100, hpMax: 100, fatigue: 0, fatigueMax: 100, satiation: 100, satiationMax: 100, comfort: 0 },
      character: shared.character || { ticket: null, signalsSeen: new Set() },
      inventory: shared.inventory || (shared.inventory = []),
      messages: shared.messages || (shared.messages = []),
      kills: 0, lastHungerStage: "well fed", wasExhausted: false,
      sensedSkitter: false, toldDoors: {}
    };
    // the turn counter lives on the shared object so town + dungeon agree on it.
    if (typeof shared.turn !== "number") shared.turn = 0;
    // AUTO-OPEN doors: true (default) = stepping into a closed door opens it and you pass through;
    // false = a closed door BLOCKS, you must open it deliberately ('o'). Persisted across descents.
    if (typeof shared.autoOpenDoors !== "boolean") shared.autoOpenDoors = true;
    ctrl.autoOpenDoors = shared.autoOpenDoors;
    var decorate = opts.decorate || null;   // town layer places signals / marks brass
    var onCross = opts.onCross || null;      // town layer gates a door (e.g. Brass Door)

    function curLevel() { return (world.nodes[ctrl.node] || {}).level || 0; }
    function inDungeon() { return curLevel() >= 1; }
    // v2 (Jaquay) — WATER IS RATIONED: an OCCASIONAL level feature, not standard terrain
    // on every floor. A minority of levels are "wet" (deterministic per seed+level), and
    // only those pool water. Tune the % at the red pen.
    function levelIsWet(L) { if (L == null) L = curLevel(); if (L < 1) return false; var h = (Math.imul((seed >>> 0) ^ 0x9e3779b9, 2654435761) ^ Math.imul(L, 40503)) >>> 0; return (h % 100) < 28; }

    // v18 R2 — ROUTES THAT LOOP. The cyclic generator already weaves loops,
    // returns, and express shortcuts into the graph; here we make them READ in
    // space: a route that closes a cycle (or a shortcut that opens) is
    // TELEGRAPHED with a grate you can see through, naming the place beyond —
    // glimpsed before it is reached (v18 outcome #2). This is presentational
    // ONLY: no node, edge, or signal is touched, so the six obligations are
    // untouched (the checker still rules generation; this never runs there).
    // An edge u->v is a LOOP edge iff v can reach u again by directed travel.
    function buildLoopIndex() {
      var adj = {};
      (world.edges || []).forEach(function (e) { (adj[e.from] = adj[e.from] || []).push(e.to); });
      function reaches(src, dst) {
        var seen = {}, q = [src]; seen[src] = 1;
        while (q.length) { var n = q.shift(); if (n === dst) return true;
          (adj[n] || []).forEach(function (m) { if (!seen[m]) { seen[m] = 1; q.push(m); } }); }
        return false;
      }
      var cyc = {};
      (world.edges || []).forEach(function (e) { if (reaches(e.to, e.from)) cyc[e.id] = true; });
      return cyc;
    }
    ctrl.cycleEdges = buildLoopIndex();
    // classify a rendered door: "loop" (closes a cycle) or "shortcut" (an
    // always-open express, or an annex that opens once the depths grant a token).
    function routeKind(d) {
      if (!d) return null;
      if (ctrl.cycleEdges[d.edgeId]) return "loop";
      if (/express/.test(d.edgeId || "")) return "shortcut";
      if (/breadth/.test(d.edgeId || "") || (d.takeable === false && /annex|breadth/.test(d.to || ""))) return "shortcut";
      return null;
    }

    // every player-facing line declares a CHANNEL (Channel Law, CLAUDE.md):
    // "event" = what mechanically happens (always true); "senses" = what the
    // character perceives (heard/said/seen are true; intuition may mislead).
    function logMsg(t, urgent, meta) {
      if (!t) return; meta = meta || {};
      ctrl.lastEvent = t; ctrl.lastUrgent = !!urgent;
      ctrl.messages.push({ text: t, urgent: !!urgent, ch: meta.ch || "event", kind: meta.kind || null, obj: meta.obj || null });
      if (ctrl.messages.length > 120) ctrl.messages.shift();
    }
    function senses(t, kind, obj, urgent) { logMsg(t, !!urgent, { ch: "senses", kind: kind, obj: obj }); }

    // the senses emitter — atmosphere from the surroundings. FUTURE HOOK: an
    // Intuition stat will later gate frequency/quality here; nothing wired yet.
    function nearUnseenCreature() {
      var vis = visibleSet();
      for (var i = 0; i < ctrl.creatures.length; i++) {
        var c = ctrl.creatures[i], dman = Math.abs(c.x - ctrl.player.x) + Math.abs(c.y - ctrl.player.y);
        if (dman <= REVEAL + 3 && !vis.has(key(c.x, c.y))) return true;
      }
      return false;
    }
    function emitSenses() {
      if (!inDungeon()) return;
      var skit = nearUnseenCreature();
      if (skit && !ctrl.sensedSkitter) senses("Something skitters past, just beyond the lamplight.", "heard", "OBJ");
      ctrl.sensedSkitter = skit;
    }
    // secret grammar: a hidden space is ALWAYS telegraphed, by the fixed tell
    // vocabulary, when you come near it. (No untelegraphed secret.)
    function emitSecretTells() {
      Object.keys(ctrl.secrets).forEach(function (k) {
        var sec = ctrl.secrets[k]; if (sec.found || ctrl.sensedSecret[k]) return;
        var xy = k.split(","), sx = +xy[0], sy = +xy[1];
        if (Math.max(Math.abs(sx - ctrl.player.x), Math.abs(sy - ctrl.player.y)) <= 1) {
          var tl = TELLS[sec.tell] || TELLS.hollow;
          senses(tl.text, tl.kind, tl.obj); ctrl.sensedSecret[k] = 1;
        }
      });
    }

    // v2 (Jaquay) — sight is blocked by walls AND by CLOSED DOORS. A closed door is
    // inscrutable: you see its face but never what lies beyond it until it is opened.
    function losTransparent(x, y) {
      if (!inb(x, y) || ctrl.grid[y][x] === "#") return false;          // walls block sight
      var rd = ctrl.roomDoors[key(x, y)]; if (rd && rd.state === "closed") return false;   // a closed room door is opaque
      var pl = ctrl.plain[key(x, y)]; if (pl && !pl.open) return false;                     // a closed plain door too
      return true;
    }
    // LOS flood from (px,py): you SEE a cell once reached (its face, even a wall or closed
    // door), but sight passes THROUGH only transparent cells — so the beyond of a closed
    // door is never leaked. Bounded by REVEAL; diagonals are glimpsed, not traversed.
    function losFrom(px, py) {
      var seen = new Set([key(px, py)]), done = {}; done[key(px, py)] = 1;
      var q = [[px, py, 0]];
      while (q.length) {
        var c = q.shift(), x = c[0], y = c[1], d = c[2];
        for (var ddy = -1; ddy <= 1; ddy++) for (var ddx = -1; ddx <= 1; ddx++) { var sx = x + ddx, sy = y + ddy; if (inb(sx, sy)) seen.add(key(sx, sy)); }
        if (d >= REVEAL) continue;
        var orth = DIRS4(x, y);
        for (var i = 0; i < orth.length; i++) { var nx = orth[i][0], ny = orth[i][1], k = key(nx, ny); if (!done[k] && losTransparent(nx, ny)) { done[k] = 1; q.push([nx, ny, d + 1]); } }
      }
      return seen;
    }
    function reveal(px, py) { losFrom(px, py).forEach(function (k) { ctrl.explored.add(k); }); }

    function buildView() {
      ctrl.water = {}; ctrl.chasm = {}; ctrl.pendingFall = null; ctrl.sensedSecret = {};
      var meta = world.nodes[ctrl.node] || {};
      var vd = (typeof TD_VAULTS !== "undefined" && meta.vault) ? TD_VAULTS.byId(meta.vault) : null;
      if (vd) { buildVaultView(vd); return; }
      var v = interp.view();
      var cl = curLevel();
      var comp = composeNode(seed, ctrl.node, v.options.length);
      var g = comp.grid, doors = {};
      // Map each graph edge onto the GENERATOR'S OWN exits: level transitions take the down/up STAIR;
      // same-level breadth edges sit on existing floor cells (NEVER carved). No geometry is opened for
      // a graph edge. If a node has more exits than the floor offers, FLAG the seam — never punch.
      // (The test-only legacy carver has no stair concept — it keeps the old doorPts[i]-by-edge mapping.)
      var seam = 0;
      if (comp.breadthCells) {
        var bi = 0;
        v.options.forEach(function (o) {
          var toLevel = (world.nodes[o.to] || {}).level;
          var dir = (typeof toLevel === "number") ? (toLevel < cl ? "up" : toLevel > cl ? "down" : "same") : "same";
          var cell = null, type;
          if (dir === "down" && comp.downStair && !doors[key(comp.downStair.x, comp.downStair.y)]) { cell = comp.downStair; type = "stair_down"; }
          else if (dir === "up" && comp.upStair && !doors[key(comp.upStair.x, comp.upStair.y)]) { cell = comp.upStair; type = "stair_up"; }
          else { cell = comp.breadthCells[bi++]; type = (dir === "up") ? "stair_up" : (dir === "down") ? "stair_down" : (o.one_way ? "oneway" : "door"); }
          if (!cell || doors[key(cell.x, cell.y)]) { seam++; return; }   // ran out of floor cells -> FLAG, never punch
          doors[key(cell.x, cell.y)] = { edgeId: o.id, type: type, takeable: o.takeable, reason: o.reason, one_way: o.one_way, to: o.to, label: o.label, tells: o.tells || [] };
        });
        if (seam) console.warn("composeNode SEAM: node " + ctrl.node + " had " + seam + " lattice edge(s) with no spare floor exit (FLAGGED, not punched — separate ruling).");
      } else {
        v.options.forEach(function (o, i) {                                   // legacy carver (test-only)
          var dp = comp.doorPts[i]; if (!dp) return;
          var toLevel = (world.nodes[o.to] || {}).level;
          var type = (typeof toLevel === "number" && toLevel < cl) ? "stair_up" : (typeof toLevel === "number" && toLevel > cl) ? "stair_down" : (o.one_way ? "oneway" : "door");
          doors[key(dp.x, dp.y)] = { edgeId: o.id, type: type, takeable: o.takeable, reason: o.reason, one_way: o.one_way, to: o.to, label: o.label, tells: o.tells || [] };
        });
      }
      ctrl.grid = g; ctrl.doors = doors; ctrl.features = {};
      ctrl.items = {}; ctrl.plain = {}; ctrl.secrets = {};
      // v21 — room doorways carry a rendered state (closed / ajar / open) — the GENERATOR'S own door tags.
      ctrl.roomDoors = {}; (comp.roomDoors || []).forEach(function (rd) { ctrl.roomDoors[key(rd.x, rd.y)] = { state: rd.state }; });
      // SECRETS are the generator's own tag==="secret" cells (telegraphed per the Secret Grammar Law);
      // the controller no longer invents wall-cache secrets. Each carries a tell + a small reward on search.
      var SECK = ["ration", "bandage", "souvenir"], TELLV0 = ["draft", "rhyme", "hollow"];
      (comp.secrets || []).forEach(function (s, i) { if (!doors[key(s.x, s.y)]) ctrl.secrets[key(s.x, s.y)] = { kind: SECK[i % SECK.length], found: false, tell: TELLV0[i % 3], gen: true }; });
      ctrl.player = { x: comp.spawn.x, y: comp.spawn.y };
      ctrl.composition = comp;
      // v2 (Jaquay) — MAP MEMORY: explored geometry persists per node across revisits
      // within a run (the node is deterministic, so the keys stay valid). Live LOS layers
      // on top at render; what you've seen stays remembered when you leave and return.
      ctrl.explored = ctrl.exploredByNode[ctrl.node] || (ctrl.exploredByNode[ctrl.node] = new Set());
      reveal(comp.spawn.x, comp.spawn.y);
      ctrl.pendingDoor = null;
      // gen2 floors are rendered DIRECTLY — its own skin lays terrain (chasm/water); the controller adds
      // no water of its own (that would change cells). Other generators keep the controller water pass.
      if (comp.source !== "gen2") placeTerrain(comp);
      // gen2's own loot ($) cells become items (its authored rewards), then the usual gameplay fill runs.
      (comp.loot || []).forEach(function (l, i) { if (isFloor(l.x, l.y)) tryItem(l.x, l.y, ["souvenir", "ration", "bandage"][i % 3]); });
      if (inDungeon()) placeDefaults(comp);
      placeGlimpses();
      spawnCreatures();
      spawnCoins();
      if (decorate) decorate(ctrl, { CX: comp.spawn.x, CY: comp.spawn.y, key: key, isFloor: isFloor });
    }
    // adaptive contents for a varied screen: loot on reachable floor. For the ASSEMBLER (live) floor,
    // secrets are the generator's own tag==="secret" cells (registered in buildView) and are NOT invented
    // here — the floor is the generator's floor. The test-only legacy carver has no generator secrets, so
    // it keeps the old wall-cache injection (gated on no generator secrets present).
    function placeDefaults(comp) {
      var g = comp.grid, sp = comp.spawn, R = nodeRng(seed, ctrl.node + ":fill");
      var floors = floorCells(g).filter(function (c) { return !(c[0] === sp.x && c[1] === sp.y) && !ctrl.doors[key(c[0], c[1])]; });
      var kinds = ["ration", "bandage", "souvenir"];
      for (var i = 0; i < 3 && floors.length; i++) { var f = floors[R.int(0, floors.length - 1)]; tryItem(f[0], f[1], kinds[i]); }
      if (comp.secrets && comp.secrets.length) return;   // ASSEMBLER floor: secrets are the generator's own (no invention)
      // --- LEGACY carver only: inject telegraphed wall-cache secrets at learnable density + at dead-ends. ---
      var TELLV = ["draft", "rhyme", "hollow"], want = R.int(2, 3), placedS = [], off = R.int(0, 2);
      for (var fj = 0; fj < floors.length && placedS.length < want; fj++) {
        var x = floors[fj][0], y = floors[fj][1], ds = DIRS4(x, y), wn = null;
        for (var k = 0; k < ds.length; k++) { var wx = ds[k][0], wy = ds[k][1]; if (inb(wx, wy) && g[wy][wx] === "#" && !ctrl.secrets[key(wx, wy)]) { wn = [wx, wy]; break; } }
        if (!wn) continue;
        if (placedS.some(function (p) { return Math.max(Math.abs(p[0] - wn[0]), Math.abs(p[1] - wn[1])) < 4; })) continue;
        addSecret(wn[0], wn[1], R.pick(kinds), TELLV[(off + placedS.length) % 3]);
        placedS.push(wn);
      }
      (comp.deadEnds || []).forEach(function (de, di) {
        if (!ctrl.secrets[key(de.wallX, de.wallY)] && g[de.wallY] && g[de.wallY][de.wallX] === "#")
          addSecret(de.wallX, de.wallY, kinds[di % kinds.length], TELLV[(off + di) % 3]);
      });
    }

    // v18 R3 (outcome #3): terrain on the OPEN FLOOR that forces path decisions.
    // Water is PASSABLE (a step costs more) — laying it never disconnects the
    // room — so we flood off-route pockets: the spawn->door skeleton is protected
    // (the floor-only path to every exit survives, in game and in tests), and we
    // only pool water on the floor that is NOT on that skeleton. Decision created:
    // wade the pool to reach the loot/secret beyond it, or take the dry way round.
    // (Chasm — impassable — lives in the every-level vault rooms, R3a.) Small
    // rooms (and the minimal test worlds) fall under the candidate floor and stay
    // terrain-free.
    function placeTerrain(comp) {
      if (!inDungeon() || !levelIsWet()) return;   // water only on the minority of WET levels (v2 rationing)
      var g = ctrl.grid, sp = ctrl.player, R = nodeRng(seed, ctrl.node + ":terrain");
      var prev = {}, seen = {}, q = [[sp.x, sp.y]]; seen[key(sp.x, sp.y)] = 1;
      while (q.length) { var c = q.shift(); DIRS4(c[0], c[1]).forEach(function (n) { var k = key(n[0], n[1]); if (!seen[k] && g[n[1]] && g[n[1]][n[0]] === ".") { seen[k] = 1; prev[k] = { x: c[0], y: c[1] }; q.push(n); } }); }
      var protect = {}; protect[key(sp.x, sp.y)] = 1;
      Object.keys(ctrl.doors).forEach(function (dk) {
        var xy = dk.split(","), dx = +xy[0], dy = +xy[1];
        DIRS4(dx, dy).forEach(function (n) { var k = key(n[0], n[1]); if (seen[k]) { var cur = k; while (cur) { protect[cur] = 1; var p = prev[cur]; cur = p ? key(p.x, p.y) : null; } } });
      });
      var cand = [];
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
        var k = key(x, y);
        if (g[y][x] !== "." || protect[k] || ctrl.doors[k]) continue;
        if (Math.abs(x - sp.x) <= 1 && Math.abs(y - sp.y) <= 1) continue;
        cand.push([x, y]);
      }
      if (cand.length < 30) return;   // small/corridor rooms stay dry (no forced clutter)
      var budget = Math.min(cand.length >> 2, 14), laid = 0, tries = 0;
      function blob(s, size) {
        var open = [s], n2 = 0;
        while (open.length && n2 < size) {
          var c = open.shift(), k = key(c[0], c[1]);
          if (!(g[c[1]] && g[c[1]][c[0]] === ".") || protect[k] || ctrl.doors[k]) continue;
          g[c[1]][c[0]] = "~"; ctrl.water[k] = 1; n2++;
          DIRS4(c[0], c[1]).forEach(function (nn) { if (R.chance(0.6)) open.push(nn); });
        }
        return n2;
      }
      while (laid < budget && tries < 8) { laid += blob(cand[R.int(0, cand.length - 1)], R.int(3, 6)); tries++; }
    }

    // v18 R2: seat a glimpse grate beside each looping / shortcut door, naming
    // the place the route bends toward — perceived (SENSES/seen, OBJ-true)
    // before it is reached. A grate is a SIGHTLINE, not a secret: it is open
    // and named, the opposite of the telegraphed-hidden vocabulary (TD_VAULTS).
    function placeGlimpses() {
      ctrl.glimpses = [];
      if (!inDungeon()) return;
      var first = null;
      Object.keys(ctrl.doors).forEach(function (k) {
        var d = ctrl.doors[k], kind = routeKind(d);
        if (!kind || d.to === ctrl.node) return;   // a self-loop (e.g. wait-a-day) glimpses nowhere new
        var dest = (world.nodes[d.to] || {}).title || "a place the route bends toward";
        var xy = k.split(","), dx = +xy[0], dy = +xy[1], spot = null, nbrs = DIRS4(dx, dy);
        for (var i = 0; i < nbrs.length; i++) {
          var nx = nbrs[i][0], ny = nbrs[i][1], nk = key(nx, ny);
          if (isFloor(nx, ny) && !ctrl.features[nk] && !ctrl.doors[nk] && !(nx === ctrl.player.x && ny === ctrl.player.y)) { spot = { x: nx, y: ny, k: nk }; break; }
        }
        if (!spot) return;
        var text = (kind === "loop")
          ? "Through an iron grate you glimpse " + dest + " — you have not been there, yet the route bends back toward it."
          : "Through a barred gap you glimpse " + dest + " — a way that opens once the route grants it.";
        ctrl.features[spot.k] = { glyph: "▦", col: "signal", channel: "SENSES", kind: "seen", obj: "OBJ",
          act: "glimpse", loopTo: d.to, routeKind: kind, label: "a grate", text: text };
        ctrl.glimpses.push({ k: spot.k, to: d.to, kind: kind, text: text });
        if (!first) first = text;
      });
      if (first) senses(first, "seen", "OBJ");
    }

    // a hand-authored vault room (the splice payoff): stamp its layout centered,
    // map '+' connection tiles to this node's edges, lay its terrain + contents.
    function buildVaultView(vd) {
      var g = newGrid(), rows = vd.layout, H0 = rows.length, W0 = rows[0].length;
      var ox = Math.floor((W - W0) / 2), oy = Math.floor((H - H0) / 2);
      var conns = [], entry = null, doors = {};
      for (var y = 0; y < H0; y++) for (var x = 0; x < W0; x++) {
        var ch = rows[y].charAt(x), gx = ox + x, gy = oy + y;
        if (ch === "#") g[gy][gx] = "#";
        else if (ch === "~") { g[gy][gx] = "~"; ctrl.water[key(gx, gy)] = 1; }
        else if (ch === "X") { g[gy][gx] = "X"; ctrl.chasm[key(gx, gy)] = 1; }
        else g[gy][gx] = ".";
        if (ch === "@") entry = { x: gx, y: gy };
        if (ch === "+") conns.push({ x: gx, y: gy });
      }
      var iv = interp.view(), cl = curLevel();
      iv.options.forEach(function (o, i) {
        var c = conns[i] || conns[0]; if (!c) return;
        var toLevel = (world.nodes[o.to] || {}).level;
        var type = (typeof toLevel === "number" && toLevel < cl) ? "stair_up" : (typeof toLevel === "number" && toLevel > cl) ? "stair_down" : (o.one_way ? "oneway" : "door");
        doors[key(c.x, c.y)] = { edgeId: o.id, type: type, takeable: o.takeable, reason: o.reason, one_way: o.one_way, to: o.to, label: o.label, tells: o.tells || [] };
      });
      ctrl.grid = g; ctrl.doors = doors; ctrl.features = {}; ctrl.items = {}; ctrl.plain = {}; ctrl.secrets = {}; ctrl.roomDoors = {};
      ctrl.player = entry || { x: ox + (W0 >> 1), y: oy + (H0 >> 1) };
      ctrl.explored = ctrl.exploredByNode[ctrl.node] || (ctrl.exploredByNode[ctrl.node] = new Set()); reveal(ctrl.player.x, ctrl.player.y); ctrl.pendingDoor = null;
      (vd.features || []).forEach(function (f) { ctrl.features[key(ox + f.x, oy + f.y)] = { glyph: f.glyph || "¶", channel: f.channel, kind: f.kind, obj: f.obj, text: f.text, label: "a notice" }; });
      (vd.items || []).forEach(function (it) { var iy = oy + it.y, ix = ox + it.x; if (g[iy] && g[iy][ix] === ".") ctrl.items[key(ix, iy)] = makeItem(it.kind); });
      if (vd.secret) ctrl.secrets[key(ox + vd.secret.x, oy + vd.secret.y)] = { kind: vd.secret.kind, found: false, tell: vd.secret.tell || "hollow" };
      placeGlimpses();
      ctrl.creatures = [];
      if (livingOn && inDungeon()) (vd.creatures || []).forEach(function (c) {
        var def = CREATURE[c.kind]; if (!def) return;
        ctrl.creatures.push({ x: ox + c.x, y: oy + c.y, kind: c.kind, hp: def.hp, maxHp: def.hp, dmg: def.dmg, name: def.name, glyph: def.glyph, fighter: defFighter(def) });
      });
      if (decorate) decorate(ctrl, { CX: CX, CY: CY, key: key, isFloor: isFloor });
    }
    function tryItem(x, y, kind) { if (isFloor(x, y) && !(x === ctrl.player.x && y === ctrl.player.y)) ctrl.items[key(x, y)] = makeItem(kind); }
    function addPlain(x, y) { if (isFloor(x, y)) ctrl.plain[key(x, y)] = { open: false }; }
    function addSecret(x, y, kind, tell) { if (inb(x, y) && ctrl.grid[y][x] === "#") ctrl.secrets[key(x, y)] = { kind: kind, found: false, tell: tell || "hollow" }; }
    function isWater(x, y) { return !!ctrl.water[key(x, y)]; }
    function isChasm(x, y) { return !!ctrl.chasm[key(x, y)]; }

    function featureAt(x, y) { return ctrl.features[key(x, y)] || null; }
    function itemAt(x, y) { return ctrl.items[key(x, y)] || null; }
    function plainAt(x, y) { return ctrl.plain[key(x, y)] || null; }

    // a bare floor tile (used for spawning / item placement)
    function isFloor(x, y) { return inb(x, y) && ctrl.grid[y][x] === "." && !ctrl.doors[key(x, y)]; }
    // can a body stand here this turn? floor, and not blocked by a shut plain door
    function passable(x, y) { if (!isFloor(x, y)) return false; var p = plainAt(x, y); return !(p && !p.open); }
    function creatureAt(x, y) { for (var i = 0; i < ctrl.creatures.length; i++) if (ctrl.creatures[i].x === x && ctrl.creatures[i].y === y) return ctrl.creatures[i]; return null; }
    function otherCreatureAt(self, x, y) { for (var i = 0; i < ctrl.creatures.length; i++) { var c = ctrl.creatures[i]; if (c !== self && c.x === x && c.y === y) return c; } return null; }
    // friendly-displacement flavour (sparse, OBJ-true; lines queue for the voice pass)
    var DISPLACE_LINES = ["“Pardon.”", "It yields the way with a nod.", "You slip past with a murmured apology.", "A shuffle, a half-step, and you are through."];
    function displaceBark() { if (shared.turn - (ctrl.lastDisplace == null ? -99 : ctrl.lastDisplace) >= 5 && rng.chance(0.4)) { ctrl.lastDisplace = shared.turn; senses(DISPLACE_LINES[rng.int(0, DISPLACE_LINES.length - 1)], "heard", "OBJ"); } }

    function walkableCount() { var n = 0; for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (ctrl.grid[y][x] === ".") n++; return n; }
    function makeCoins(amount) { return { kind: "coins", glyph: "$", name: "a heap of coins", desc: "Bureau-stamped coin. It has weight.", coins: amount }; }
    // coin loot at a per-walkable-cell DENSITY; a pile picks up into the PURSE -> weight -> band.
    function spawnCoins() {
      if (!inDungeon() || (world.nodes[ctrl.node] || {}).dmz) return;
      var n = Math.round(walkableCount() * COIN_DENSITY);
      for (var c = 0; c < n; c++) {
        var spot = pickSpot();
        if (!spot || itemAt(spot.x, spot.y) || creatureAt(spot.x, spot.y)) continue;
        ctrl.items[key(spot.x, spot.y)] = makeCoins(rng.int(20, 80));   // PLACEHOLDER gold per pile
      }
    }
    function spawnCreatures() {
      ctrl.creatures = [];
      if (!livingOn || !inDungeon()) return;
      // DMZ law (v20 R1): a saloon or the cafeteria is demilitarised — no hostile
      // action resolves inside, so none ever spawns. (The truce is spatial, not prose.)
      if ((world.nodes[ctrl.node] || {}).dmz) return;
      var n = Math.max(1, Math.round(walkableCount() * CREATURE_DENSITY));   // DENSITY, not a fixed count
      var kinds = ["wanderer", "lurker", "chaser"];
      for (var c = 0; c < n; c++) {
        var kind = kinds[rng.int(0, kinds.length - 1)];
        var spot = pickSpot();
        if (!spot) continue;
        var def = CREATURE[kind];
        ctrl.creatures.push({ x: spot.x, y: spot.y, kind: kind, hp: def.hp, maxHp: def.hp, dmg: def.dmg, name: def.name, glyph: def.glyph, fighter: defFighter(def) });
      }
    }
    function pickSpot() {
      var cand = [], px = ctrl.player.x, py = ctrl.player.y;
      for (var y = py - 5; y <= py + 5; y++) for (var x = px - 6; x <= px + 6; x++)
        if (passable(x, y) && !creatureAt(x, y) && !itemAt(x, y) && (Math.abs(x - px) + Math.abs(y - py)) >= 4) cand.push({ x: x, y: y });
      if (!cand.length) return null;
      return cand[Math.floor(rng.next() * cand.length)];
    }

    function visibleSet() { return losFrom(ctrl.player.x, ctrl.player.y); }
    function enemiesVisible() { var vis = visibleSet(); return ctrl.creatures.some(function (c) { return vis.has(key(c.x, c.y)); }); }

    // ---- the world acts only when the player acts (turn-based) ---------------
    function endTurn(mode) {
      meterTick(mode);
      if (!ctrl.dead) creaturesStep();
      shared.turn += 1;
    }

    function creaturesStep() {
      ctrl.creatures.forEach(function (cr) {
        var dist = Math.abs(cr.x - ctrl.player.x) + Math.abs(cr.y - ctrl.player.y);
        var move = null;
        if (cr.kind === "lurker") {
          if (dist <= REVEAL) move = greedy(cr);             // lurker wakes when you're near
        } else if (cr.kind === "chaser") {
          move = greedy(cr);                                  // chaser never stops coming
        } else {
          move = rng.chance(0.7) ? greedy(cr) : wander(cr);  // wanderer drifts toward you
        }
        if (move) {
          if (move.x === ctrl.player.x && move.y === ctrl.player.y) {        // it reaches you: it bites
            var pf2 = playerFighter();
            if (pf2 && cr.fighter) {                                         // LIVE two-function (feel-words, no numbers)
              if (TD_RESOLVE.hit(cr.fighter, pf2, rng).hit) {
                var dmg2 = TD_RESOLVE.damage(cr.fighter, pf2, rng).damage;
                ctrl.fx.push({ x: ctrl.player.x, y: ctrl.player.y, amount: dmg2, kind: "taken" });
                hurt(dmg2, cr);
                if (!ctrl.dead) logMsg(cap(cr.name) + " amends your itinerary.", lowHP());
              } else logMsg(cap(cr.name) + " lunges and misses.", false);
            } else {                                                        // legacy flat fallback
              ctrl.fx.push({ x: ctrl.player.x, y: ctrl.player.y, amount: cr.dmg, kind: "taken" });
              hurt(cr.dmg, cr);
              if (!ctrl.dead) logMsg(cap(cr.name) + " amends your itinerary.", lowHP());
            }
          } else { cr.x = move.x; cr.y = move.y; }
        }
      });
    }
    function greedy(cr) {
      var best = null, bestD = Math.abs(cr.x - ctrl.player.x) + Math.abs(cr.y - ctrl.player.y);
      STEP4.forEach(function (d) {
        var nx = cr.x + DIRS[d][0], ny = cr.y + DIRS[d][1];
        var onPlayer = (nx === ctrl.player.x && ny === ctrl.player.y);
        if (!onPlayer && (!passable(nx, ny) || creatureAt(nx, ny))) return;
        var nd = Math.abs(nx - ctrl.player.x) + Math.abs(ny - ctrl.player.y);
        if (nd < bestD) { bestD = nd; best = { x: nx, y: ny }; }
      });
      return best;
    }
    function wander(cr) {
      for (var t = 0; t < 4; t++) {
        var d = STEP4[rng.int(0, 3)];
        var nx = cr.x + DIRS[d][0], ny = cr.y + DIRS[d][1];
        if (passable(nx, ny) && !creatureAt(nx, ny)) return { x: nx, y: ny };
      }
      return null;
    }

    // COMBAT-TRACK PHASE 3: two-function combat on real floors. A creature carries a stat block +
    // gear (synthesized from its bestiary hp/dmg — PLACEHOLDER, calibration pending). The player
    // fighter reads the character's stat spine + starting gear. When BOTH are present the live combat
    // resolves via TD_RESOLVE.hit()/damage()/read(); otherwise (test harness, no spine) it falls back
    // to the legacy flat path. Numbers never reach the player — combat lines are feel-words.
    function defFighter(def) {
      if (typeof TD_RESOLVE === "undefined" || !TD_RESOLVE.GEAR) return null;
      return {
        stats: { might: 380 + def.dmg * 14, dex: 470, con: 320 + def.hp * 6, int: 300, per: 420, lucky: 500, intuition: 380, appearance: 400, charm: 300, grit: 420 },
        weapon: { name: def.name, type: "blade", base: def.dmg, acc: 0 },
        armor: TD_RESOLVE.GEAR.ARMOR.light
      };
    }
    // ENCUMBRANCE (R2): the carried loadout (gear + weighty inventory + purse) -> a TD_BURDEN band ->
    // worse EVASION (folded into the player fighter) + slower MOVE/tempo. PLACEHOLDER magnitudes.
    var ENC_EVASION = { unencumbered: 0, laden: 2, strained: 5, overloaded: 9 };   // band -> evasion-dulling (placeholder)
    function carriedItems() {
      var its = [], ch = ctrl.character;
      if (ch && ch.weapon) its.push(ch.weapon);
      (ctrl.inventory || []).forEach(function (it) { if (it && typeof it.weight === "number") its.push(it); });
      return its;
    }
    function playerPurse() { return (ctrl.character && ctrl.character.purse) || {}; }   // coins arrive in R3
    function playerBand() {
      if (typeof TD_BURDEN === "undefined" || !ctrl.character || !ctrl.character.stats) return null;
      return TD_BURDEN.compute(ctrl.character.stats, carriedItems(), playerPurse());
    }
    function playerFighter() {
      var ch = ctrl.character;
      if (!ch || !ch.stats || typeof TD_RESOLVE === "undefined" || typeof TD_RESOLVE.fighter !== "function") return null;
      var armor = ch.armor, bnd = playerBand();
      if (bnd) { var pen = ENC_EVASION[bnd.band.key] || 0; if (pen) armor = { name: armor ? armor.name : "unarmoured", robustness: armor ? armor.robustness : 0, encumbrance: (armor ? armor.encumbrance : 0) + pen }; }   // burden dulls evasion
      return TD_RESOLVE.fighter(ch.stats, ch.weapon, armor);
    }
    // feel-word on a band CROSSING (no number) + a tempo penalty when slow (the world gains a step on you).
    function updateBand() {
      var bnd = playerBand(); if (!bnd) return;
      var key = bnd.band.key;
      if (ctrl.lastBand == null) { ctrl.lastBand = key; }
      else if (key !== ctrl.lastBand) {
        var order = ["unencumbered", "laden", "strained", "overloaded"];
        if (order.indexOf(key) > order.indexOf(ctrl.lastBand)) logMsg("You are " + bnd.band.word + ".", key === "overloaded");   // announce only on the way UP
        ctrl.lastBand = key;
      }
      var deficit = (100 - bnd.band.speed) / 100;                 // 0 .. 0.5 : how much slower than full speed
      ctrl.slowDebt = (ctrl.slowDebt || 0) + deficit;
      if (ctrl.slowDebt >= 1 && !ctrl.dead) { ctrl.slowDebt -= 1; creaturesStep(); }   // you are slow -> the world takes an extra step
    }
    function lowHP() { return ctrl.meters.hp > 0 && ctrl.meters.hp < 0.25 * ctrl.meters.hpMax; }
    function hurt(amount, source) {
      var r = TD_RESOLVE.applyDamage(ctrl.meters.hp, amount);
      ctrl.meters.hp = r.hp; if (r.dead) die(combatCause(source));
    }
    function die(cause) { if (!ctrl.dead) { ctrl.dead = true; ctrl.cause = cause; logMsg(cause, true); } }

    // body meters tick on each dungeon action (bible §4.13 anti-scum).
    // mode: "step" (walk), "fight", "rest" (wait — recovers fatigue if safe).
    function meterTick(mode) {
      if (!inDungeon()) return;
      var m = ctrl.meters;
      if (mode === "rest") { if (!enemiesVisible()) m.fatigue = Math.max(0, m.fatigue - REST_RECOVER); }
      else m.fatigue = Math.min(m.fatigueMax, m.fatigue + (mode === "fight" ? FATIGUE_PER_FIGHT : FATIGUE_PER_STEP));
      m.satiation = Math.max(0, m.satiation - SATIATION_PER_STEP);

      // hunger-ladder transitions (announce only on the way DOWN; STARVING is critical)
      var st = hungerStage(m).stage;
      if (st !== ctrl.lastHungerStage) {
        var worse = HUNGER_LADDER.indexOf(st) > HUNGER_LADDER.indexOf(ctrl.lastHungerStage);
        if (st === "Starving") logMsg("You are STARVING. The Bureau records your dwindling with professional detachment.", true);
        else if (worse) logMsg("You grow " + st.toLowerCase() + ".", false);
        ctrl.lastHungerStage = st;
      }
      if (hungerStage(m).critical) hurt(STARVE_HP, { name: "hunger", starve: true });

      if (m.fatigue >= m.fatigueMax) {
        if (!ctrl.wasExhausted) { logMsg("You are spent past prudence; exhaustion sets in.", true); ctrl.wasExhausted = true; }
        hurt(EXHAUST_HP, { name: "exhaustion", exhaust: true });
      } else { ctrl.wasExhausted = false; }
      updateBand();   // encumbrance: band feel-word on crossing + tempo penalty when slow
    }

    function move(dir) {
      ctrl.lastEvent = null; ctrl.lastUrgent = false; ctrl.fx = [];
      if (ctrl.dead || ctrl.won || !DIRS[dir]) return { moved: false };
      var nx = ctrl.player.x + DIRS[dir][0], ny = ctrl.player.y + DIRS[dir][1];
      if (!inb(nx, ny)) return { moved: false };

      // bump-to-fight (narrated in the Bureau register). You strike; the creature
      // (if it lives) replies on its own turn during creaturesStep — one blow each.
      var cr = creatureAt(nx, ny);
      if (cr && cr.friendly) {
        // FRIENDLY DISPLACEMENT (a DMZ non-hostile never dead-stops you): swap, or
        // step it aside to an adjacent open tile if the swap tile is blocked.
        var ox = ctrl.player.x, oy = ctrl.player.y, placed = false;
        if (passable(ox, oy) && !otherCreatureAt(cr, ox, oy)) { cr.x = ox; cr.y = oy; placed = true; }
        else { for (var di = 0; di < STEP4.length; di++) { var ax = nx + DIRS[STEP4[di]][0], ay = ny + DIRS[STEP4[di]][1]; if (!(ax === ox && ay === oy) && passable(ax, ay) && !otherCreatureAt(cr, ax, ay)) { cr.x = ax; cr.y = ay; placed = true; break; } } }
        if (!placed) return { moved: false };
        ctrl.player.x = nx; ctrl.player.y = ny; ctrl.pendingDoor = null;
        reveal(nx, ny); displaceBark();
        endTurn("step"); emitSenses();
        return { moved: true, displaced: true, event: ctrl.lastEvent };
      }
      if (cr && (world.nodes[ctrl.node] || {}).dmz) {
        // DMZ law (v20 R1): no hostile action RESOLVES inside a saloon or the
        // cafeteria. The house rule refuses the blow — you do not move, nothing is
        // fought. (None spawns here either; this guards a creature that wandered in.)
        logMsg("Not here — the house rule holds: no disputes past the threshold.", false);
        return { moved: false, refused: true, dmz: true };
      }
      if (cr) {
        var pf = playerFighter(), killed = false, connected = true;
        if (pf && cr.fighter) {                                   // LIVE two-function combat (feel-words, no numbers)
          if (!cr.read) { var rd = TD_RESOLVE.read(pf, cr.fighter, rng); senses("It looks " + rd.seen.word + ".", "seen", "OBJ"); senses("Something in you reads it as " + rd.sense.word + ".", "intuition", "SUBJ"); cr.read = true; }
          var h = TD_RESOLVE.hit(pf, cr.fighter, rng); connected = h.hit;
          if (h.hit) {
            var dmg = TD_RESOLVE.damage(pf, cr.fighter, rng).damage;
            ctrl.fx.push({ x: cr.x, y: cr.y, amount: dmg, kind: "dealt" });
            var blow = TD_RESOLVE.strike(cr.hp, dmg); cr.hp = blow.hp; killed = blow.killed;
            if (killed) { removeCreature(cr); ctrl.kills += 1; logMsg("You strike " + cr.name + " from the register.", false); }
            else logMsg("Your " + ((pf.weapon && pf.weapon.verb) || "blow") + " lands on " + cr.name + "; it still stands.", false);
          } else logMsg("You swing at " + cr.name + " and the blow goes wide.", false);
        } else {                                                  // legacy flat fallback (no stat spine / test harness)
          ctrl.fx.push({ x: cr.x, y: cr.y, amount: PLAYER_DMG, kind: "dealt" });
          var fblow = TD_RESOLVE.strike(cr.hp, PLAYER_DMG); cr.hp = fblow.hp; killed = fblow.killed;
          if (killed) { removeCreature(cr); ctrl.kills += 1; logMsg("You strike " + cr.name + " from the register.", false); }
          else logMsg("You serve " + cr.name + " notice; it still stands.", false);
        }
        meterTick("fight");
        if (!ctrl.dead) creaturesStep();
        shared.turn += 1;
        return { moved: false, attacked: true, killed: killed, hit: connected, event: ctrl.lastEvent, dead: ctrl.dead };
      }

      // an EDGE door (a stair / traversal to another node): CONTACT REVEALS, it
      // does not open. Enter/o commits (openDoor).
      var d = ctrl.doors[key(nx, ny)];
      if (d) {
        ctrl.pendingDoor = { meta: d, x: nx, y: ny };
        logMsg(doorReveal(d), false);
        if (d.tells && d.tells.length && !ctrl.toldDoors[d.edgeId]) {   // the secret tells, perceived
          ctrl.toldDoors[d.edgeId] = 1;
          senses(d.tells[0], "heard", "OBJ");                          // 008 cold draft — true
          if (d.tells[1]) senses(d.tells[1], "intuition", "SUBJ");     // 009 "probably rats" — a hunch, may mislead
        }
        return { moved: false, bumpedDoor: true, event: ctrl.lastEvent };
      }

      // INNER DOORS (a generator room doorway OR a plain inner door). When SHUT, behaviour depends on
      // the AUTO-OPEN setting: ON -> the door opens and you pass through in one step (the default feel);
      // OFF -> the door BLOCKS; you must open it deliberately ('o' + direction). Locked/secret stays shut.
      var rdShut = ctrl.roomDoors[key(nx, ny)];
      var pdShut = plainAt(nx, ny);
      var innerShut = (rdShut && rdShut.state !== "open") || (pdShut && !pdShut.open);
      if (innerShut) {
        if (rdShut && rdShut.locked) { logMsg("The door is locked; it wants a key.", false); return { moved: false, bumpedDoor: true, locked: true, event: ctrl.lastEvent }; }
        if (!ctrl.autoOpenDoors) {
          ctrl.pendingDoor = pdShut ? { plain: true, x: nx, y: ny } : { roomDoor: true, x: nx, y: ny };
          logMsg("The door is shut. Press o to open it.", false);
          return { moved: false, bumpedDoor: true, plain: !!pdShut, event: ctrl.lastEvent };
        }
        if (rdShut) rdShut.state = "open";          // auto-open: it gives as you pass
        if (pdShut) pdShut.open = true;
      }

      // CHASM: impassable terrain; bumping it prompts a desperate fall (Enter).
      if (isChasm(nx, ny)) {
        ctrl.pendingFall = { x: nx, y: ny };
        logMsg("A sheer drop yawns. Press Enter to throw yourself down — a fall to the level below.", false);
        senses("A draft rises from the dark below, steady as a held breath.", "heard", "OBJ");
        return { moved: false, chasm: true, event: ctrl.lastEvent };
      }
      var onWater = isWater(nx, ny);
      if (ctrl.grid[ny][nx] !== "." && !onWater) return { moved: false };

      ctrl.player.x = nx; ctrl.player.y = ny;
      ctrl.pendingDoor = null; ctrl.pendingFall = null;
      reveal(nx, ny);
      var f = featureAt(nx, ny);
      if (f) { if (f.id) ctrl.character.signalsSeen.add(f.id); if (f.kind) senses(f.text, f.kind, f.obj); else logMsg(f.text, false); }
      var it = itemAt(nx, ny);
      if (it) logMsg("Here lies " + it.name + ". Press g to take it.", false);
      if (onWater) logMsg("You wade in; it is slow going.", false);
      endTurn("step");
      if (onWater) endTurn("step");                      // WATER slows: the world gets an extra beat
      emitSenses(); emitSecretTells();
      return { moved: true, dead: ctrl.dead, feature: f || undefined, item: it || undefined, water: onWater };
    }

    // wait a turn: the world acts, you do not move. With no enemy in sight this
    // is a rest — fatigue ebbs back (ADOM's '5'/'.').
    function wait() {
      ctrl.lastEvent = null; ctrl.lastUrgent = false; ctrl.fx = [];
      if (ctrl.dead || ctrl.won) return { waited: false };
      logMsg(enemiesVisible() ? "You hold still, watching the dark move." : "You rest a moment; the ache in your legs eases.", false);
      endTurn("rest");
      emitSenses();
      return { waited: true, rested: !enemiesVisible(), dead: ctrl.dead };
    }

    // pick up the item under your feet.
    function get() {
      ctrl.lastEvent = null; ctrl.lastUrgent = false; ctrl.fx = [];
      if (ctrl.dead || ctrl.won) return { got: false };
      var k = key(ctrl.player.x, ctrl.player.y), it = ctrl.items[k];
      if (!it) { logMsg("There is nothing here to take.", false); return { got: false, event: ctrl.lastEvent }; }
      delete ctrl.items[k];
      if (it.kind === "coins") {                                // coins -> the PURSE (weight -> encumbrance), never the pack
        if (!ctrl.character.purse) ctrl.character.purse = { copper: 0, silver: 0, gold: 0 };
        ctrl.character.purse.gold = (ctrl.character.purse.gold || 0) + it.coins;
        logMsg("You pocket the coins; the weight settles onto you.", false);   // no number — band feel-word does the rest
        updateBand();                                           // the heavier purse may cross a band
        return { got: true, coins: true, event: ctrl.lastEvent };
      }
      ctrl.inventory.push(it);
      logMsg("You take " + it.name + ".", false);
      return { got: true, item: it, event: ctrl.lastEvent };
    }

    // drop an item from the pack onto the floor (called by the town controller).
    function dropItem(item) {
      var spots = [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
      for (var i = 0; i < spots.length; i++) {
        var x = ctrl.player.x + spots[i][0], y = ctrl.player.y + spots[i][1];
        if (isFloor(x, y) && !itemAt(x, y) && !creatureAt(x, y)) { ctrl.items[key(x, y)] = item; logMsg("You set down " + item.name + ".", false); return { dropped: true, event: ctrl.lastEvent }; }
      }
      logMsg("There is no room to set it down.", false);
      return { dropped: false, event: ctrl.lastEvent };
    }

    // search the adjacent walls for what the wall is hiding.
    function search() {
      ctrl.lastEvent = null; ctrl.lastUrgent = false; ctrl.fx = [];
      if (ctrl.dead || ctrl.won) return { searched: false };
      var found = [];
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        var x = ctrl.player.x + dx, y = ctrl.player.y + dy, k = key(x, y);
        var sec = ctrl.secrets[k];
        if (sec && !sec.found) {
          sec.found = true;
          ctrl.grid[y][x] = ".";                 // the seam opens
          if (sec.kind) ctrl.items[k] = makeItem(sec.kind);
          ctrl.explored.add(k);
          found.push(k);
        }
      }
      if (found.length) { logMsg("Your fingers find a seam — a hidden pocket gives way.", false); senses(TELLS.hollow.text, TELLS.hollow.kind, TELLS.hollow.obj); }
      else logMsg("You run your hands over the nearby stone and find nothing.", false);
      endTurn("step");
      return { searched: true, found: found.length, event: ctrl.lastEvent };
    }

    // ---- DELIBERATE DOOR HANDLING (open/close, room doors AND plain doors, uniformly) ----
    // An inner door is SHUT if a roomDoor is closed/ajar or a plain door is !open.
    function innerShutAt(x, y) { var rd = ctrl.roomDoors[key(x, y)], pl = plainAt(x, y); return (rd && rd.state !== "open") || (pl && !pl.open); }
    function innerOpenAt(x, y) { var rd = ctrl.roomDoors[key(x, y)], pl = plainAt(x, y); return (rd && rd.state === "open") || (pl && pl.open); }
    function adjShut() { var a = []; for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; var x = ctrl.player.x + dx, y = ctrl.player.y + dy; if (innerShutAt(x, y)) a.push({ x: x, y: y }); } return a; }
    function adjOpen() { var a = []; for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; var x = ctrl.player.x + dx, y = ctrl.player.y + dy; if (innerOpenAt(x, y)) a.push({ x: x, y: y }); } return a; }

    // OPEN a specific cell's inner door (closed/ajar -> open). Costs a turn; the player does not move.
    function openInnerAt(x, y) {
      ctrl.lastEvent = null; ctrl.lastUrgent = false; ctrl.fx = [];
      if (ctrl.dead || ctrl.won) return { opened: false };
      var rd = ctrl.roomDoors[key(x, y)], pl = plainAt(x, y);
      if (rd && rd.locked) { logMsg("The door is locked; it wants a key.", false); return { opened: false, locked: true, event: ctrl.lastEvent }; }   // FLAG: locked doors need a key, not 'o'
      if (rd && rd.state !== "open") { rd.state = "open"; reveal(x, y); logMsg("You open the door.", false); endTurn("step"); return { opened: true, event: ctrl.lastEvent }; }
      if (pl && !pl.open) { pl.open = true; reveal(x, y); logMsg("The inner door swings open.", false); endTurn("step"); return { opened: true, plain: true, event: ctrl.lastEvent }; }
      logMsg("There is no closed door that way.", false);   // no door -> no turn spent
      return { opened: false, none: true, event: ctrl.lastEvent };
    }
    // CLOSE a specific cell's inner door (open/ajar -> closed) — only if the cell is EMPTY.
    function closeInnerAt(x, y) {
      ctrl.lastEvent = null; ctrl.lastUrgent = false; ctrl.fx = [];
      if (ctrl.dead || ctrl.won) return { closed: false };
      if (!innerOpenAt(x, y)) { logMsg("There is no open door that way.", false); return { closed: false, none: true, event: ctrl.lastEvent }; }
      if (creatureAt(x, y) || itemAt(x, y) || (ctrl.player.x === x && ctrl.player.y === y)) { logMsg("Something's in the doorway; it will not close.", false); return { closed: false, blocked: true, event: ctrl.lastEvent }; }
      var rd = ctrl.roomDoors[key(x, y)], pl = plainAt(x, y);
      if (rd) rd.state = "closed";
      if (pl) pl.open = false;
      logMsg("You pull the door shut.", false); endTurn("step");
      return { closed: true, event: ctrl.lastEvent };   // a closed door is opaque again (FOV recomputes on view)
    }
    function openDoorDir(dir) { if (!DIRS[dir]) return { opened: false }; return openInnerAt(ctrl.player.x + DIRS[dir][0], ctrl.player.y + DIRS[dir][1]); }
    function closeDoorDir(dir) { if (!DIRS[dir]) return { closed: false }; return closeInnerAt(ctrl.player.x + DIRS[dir][0], ctrl.player.y + DIRS[dir][1]); }
    // 'o' alone: exactly one adjacent closed door -> open it; none -> message; many -> ambiguous (prompt dir).
    function openDoorAuto() {
      if (ctrl.dead || ctrl.won) return { opened: false };
      var c = adjShut();
      if (c.length === 1) return openInnerAt(c[0].x, c[0].y);
      if (c.length === 0) { ctrl.lastEvent = null; logMsg("There is no closed door beside you.", false); return { opened: false, none: true, event: ctrl.lastEvent }; }
      return { opened: false, ambiguous: true };
    }
    // 'c' alone: exactly one adjacent open door -> close it; none -> message; many -> ambiguous (prompt dir).
    function closeDoorAuto() {
      if (ctrl.dead || ctrl.won) return { closed: false };
      var c = adjOpen();
      if (c.length === 1) return closeInnerAt(c[0].x, c[0].y);
      if (c.length === 0) { ctrl.lastEvent = null; logMsg("There is no open door beside you to close.", false); return { closed: false, none: true, event: ctrl.lastEvent }; }
      return { closed: false, ambiguous: true };
    }
    function closeDoor() { return closeDoorAuto(); }   // legacy alias (close-behind: nearest open door)
    function setAutoOpen(b) { ctrl.autoOpenDoors = !!b; shared.autoOpenDoors = ctrl.autoOpenDoors; return ctrl.autoOpenDoors; }
    function toggleAutoOpen() { setAutoOpen(!ctrl.autoOpenDoors); logMsg("Auto-open doors: " + (ctrl.autoOpenDoors ? "ON — you pass through shut doors." : "OFF — shut doors block; open with o."), false); return ctrl.autoOpenDoors; }

    function doorReveal(d) {
      var base = d.label || "A door";
      if (d.brass) return base + " — the Brass Door. Press Enter to present your ticket.";
      if (!d.takeable) return base + " — barred (" + (d.reason || "you lack what it wants") + "). Press Enter to try it.";
      if (d.type === "oneway") return base + " — a one-way stair; it will click shut behind you. Press Enter to descend.";
      if (d.type === "stair_down") return base + " — a stair down. Press Enter to descend.";
      if (d.type === "stair_up") return base + " — a stair up. Press Enter to climb.";
      return base + " — press Enter to go through.";
    }

    // Enter / o: commit the pending door (an edge stair OR a plain inner door),
    // else open an adjacent plain door if one is shut beside you.
    function fallDescend() {
      ctrl.pendingFall = null;
      var iv = interp.view(), down = null;
      iv.options.forEach(function (o) { var tl = (world.nodes[o.to] || {}).level; if (typeof tl === "number" && tl > curLevel()) down = o; });
      if (!down) { logMsg("You peer over the edge; there is no bottom worth reaching from here.", false); return { fell: false }; }
      var landed = TD_RESOLVE.applyDamage(ctrl.meters.hp, FALL_DMG); ctrl.meters.hp = landed.hp;
      logMsg("You throw yourself into the dark and land badly (−" + FALL_DMG + ").", true);
      senses("Wind, then floor; the level above closes overhead.", "heard", "OBJ");
      if (landed.dead) { die("The visitor took the chasm for an exit; the chasm took the visitor."); return { fell: true, dead: true }; }
      var r = interp.choose(down.id);
      ctrl.node = interp.state.node; ctrl.won = !!r.complete; shared.turn += 1;
      buildView();
      return { fell: true, recenter: true, to: ctrl.node };
    }

    function openDoor() {
      if (ctrl.dead || ctrl.won) return { opened: false };
      ctrl.fx = [];
      if (ctrl.pendingFall) return fallDescend();
      var p = ctrl.pendingDoor;
      if (p && p.plain) return openPlain(p.x, p.y);
      if (p && p.roomDoor) return openInnerAt(p.x, p.y);   // a bumped room door (auto-open off): Enter opens it
      if (!p) {                                            // no pending edge door
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          var px = ctrl.player.x + dx, py = ctrl.player.y + dy, pl = plainAt(px, py);
          if (pl && !pl.open) return openPlain(px, py);
        }
        logMsg("There is no door before you.", false);
        return { opened: false };
      }
      if (Math.max(Math.abs(p.x - ctrl.player.x), Math.abs(p.y - ctrl.player.y)) > 1) { ctrl.pendingDoor = null; return { opened: false }; }
      var d = p.meta;
      if (onCross) { var oc = onCross(d, ctrl); if (oc && oc.block) { logMsg(oc.block, false); return { opened: false, blocked: oc.block }; } }
      var r = interp.choose(d.edgeId);
      if (!r.ok) { logMsg(d.reason || "the way is barred", false); return { opened: false, blocked: ctrl.lastEvent }; }
      if (d.type === "oneway") { logMsg("The way seals behind you with a click. It will not open from this side.", true); senses("A click, behind and below; the way has closed.", "heard", "OBJ"); }
      else { ctrl.lastEvent = null; ctrl.lastUrgent = false; }
      ctrl.node = interp.state.node; ctrl.won = !!r.complete; ctrl.pendingDoor = null;
      shared.turn += 1;
      buildView();
      return { opened: true, traversed: d.edgeId, recenter: true, won: ctrl.won, to: ctrl.node };
    }
    function openPlain(x, y) {
      var p = plainAt(x, y);
      if (!p) { ctrl.pendingDoor = null; return { opened: false }; }
      if (Math.max(Math.abs(x - ctrl.player.x), Math.abs(y - ctrl.player.y)) > 1) { ctrl.pendingDoor = null; return { opened: false }; }
      p.open = true; ctrl.pendingDoor = null;
      reveal(x, y);
      logMsg("The inner door swings open.", false);
      endTurn("step");
      return { opened: true, plain: true };
    }

    function removeCreature(cr) { var i = ctrl.creatures.indexOf(cr); if (i >= 0) ctrl.creatures.splice(i, 1); }

    function combatCause(src) {
      var lvl = curLevel();
      if (src && src.starve) return "The visitor, having neglected to eat, was emptied out on Level " + lvl + " and proved ert.";
      if (src && src.exhaust) return "The visitor, spent past all prudence, sat down on Level " + lvl + " and did not get up.";
      return "The visitor was set upon by " + (src ? src.name : "something") + " on Level " + lvl +
        ", a creature it had every opportunity to decline, and was discontinued.";
    }
    function postmortem() {
      return {
        heading: "BUREAU OF VISITOR OUTCOMES",
        title: "Certificate of Conclusion",
        cause: ctrl.cause || "The visitor was concluded.",
        footer: "The Bureau thanks the deceased for his custom, such as it was."
      };
    }

    function visibleItems(vis) { var o = {}; Object.keys(ctrl.items).forEach(function (k) { if (vis.has(k)) o[k] = ctrl.items[k]; }); return o; }
    function visiblePlain(vis) { var o = {}; Object.keys(ctrl.plain).forEach(function (k) { if (vis.has(k)) o[k] = ctrl.plain[k]; }); return o; }

    function view() {
      var vis = visibleSet();
      var discoveries = [];
      Object.keys(ctrl.doors).forEach(function (k) { if (vis.has(k)) (ctrl.doors[k].tells || []).forEach(function (t) { discoveries.push(t); }); });
      Object.keys(ctrl.features).forEach(function (k) { if (vis.has(k)) discoveries.push(ctrl.features[k].text); });
      var iv = interp.view();
      return {
        w: W, h: H, phase: "dungeon",
        grid: ctrl.grid.map(function (r) { return r.join(""); }),
        doors: ctrl.doors, features: ctrl.features,
        roomDoors: (function () { var o = {}; Object.keys(ctrl.roomDoors || {}).forEach(function (k) { if (vis.has(k)) o[k] = ctrl.roomDoors[k]; }); return o; })(),
        items: visibleItems(vis), plain: visiblePlain(vis),
        player: { x: ctrl.player.x, y: ctrl.player.y },
        creatures: ctrl.creatures.filter(function (c) { return vis.has(key(c.x, c.y)); }),
        explored: Array.from(ctrl.explored), visible: Array.from(vis),
        level: curLevel(), node: ctrl.node, title: iv.title,
        requiredTotal: iv.requiredTotal, requiredDone: iv.requiredDone,
        meters: ctrl.meters, hunger: hungerStage(ctrl.meters), kills: ctrl.kills, ticket: ctrl.character.ticket,
        inventory: ctrl.inventory, messages: ctrl.messages, turn: shared.turn,
        events: ctrl.fx, water: ctrl.water, chasm: ctrl.chasm,
        pendingFall: ctrl.pendingFall ? key(ctrl.pendingFall.x, ctrl.pendingFall.y) : null,
        vault: (world.nodes[ctrl.node] || {}).vault || null,
        compSource: ctrl.composition ? ctrl.composition.source : null,
        discoveries: discoveries, lastEvent: ctrl.lastEvent, lastUrgent: ctrl.lastUrgent,
        pendingDoor: ctrl.pendingDoor ? key(ctrl.pendingDoor.x, ctrl.pendingDoor.y) : null,
        dead: ctrl.dead, won: ctrl.won, cause: ctrl.cause
      };
    }

    buildView();

    var api = {
      world: world, state: ctrl, interp: interp,
      move: move, open: openDoor, view: view, postmortem: postmortem,
      wait: wait, get: get, dropItem: dropItem, search: search, closeDoor: closeDoor,
      openDoorDir: openDoorDir, openDoorAuto: openDoorAuto, closeDoorDir: closeDoorDir, closeDoorAuto: closeDoorAuto,
      toggleAutoOpen: toggleAutoOpen, setAutoOpen: setAutoOpen, autoOpen: function () { return ctrl.autoOpenDoors; },
      isDead: function () { return ctrl.dead; }, isComplete: function () { return ctrl.won; },
      // helpers for the town layer + tests
      _doors: function () { return ctrl.doors; },
      _player: function () { return ctrl.player; },
      _explored: function () { return ctrl.explored; },
      _creatures: function () { return ctrl.creatures; },
      _setCreatures: function (list) { ctrl.creatures = list.slice(); },
      _meters: function () { return ctrl.meters; },
      _character: function () { return ctrl.character; },
      _band: function () { return playerBand(); },
      _playerFighter: function () { return playerFighter(); },
      _walkable: function () { return walkableCount(); },
      _spawnDensity: function () { return { creature: CREATURE_DENSITY, coin: COIN_DENSITY }; },
      _countItemKind: function (kind) { var n = 0; for (var k in ctrl.items) if (ctrl.items[k].kind === kind) n++; return n; },
      _setCoins: function (x, y, amount) { ctrl.items[key(x, y)] = makeCoins(amount); },
      _features: function () { return ctrl.features; },
      _items: function () { return ctrl.items; },
      _plain: function () { return ctrl.plain; },
      _secrets: function () { return ctrl.secrets; },
      _inventory: function () { return ctrl.inventory; },
      _messages: function () { return ctrl.messages; },
      _turn: function () { return shared.turn; },
      _node: function () { return ctrl.node; },
      _hunger: function () { return hungerStage(ctrl.meters); },
      _enemiesVisible: function () { return enemiesVisible(); },
      _addSecret: function (x, y, kind, tell) { addSecret(x, y, kind, tell); },
      _addPlain: function (x, y) { ctrl.plain[key(x, y)] = { open: false }; },
      _setItem: function (x, y, kind) { ctrl.items[key(x, y)] = makeItem(kind); },
      _setWater: function (x, y) { ctrl.water[key(x, y)] = 1; ctrl.grid[y][x] = "~"; },
      _setChasm: function (x, y) { ctrl.chasm[key(x, y)] = 1; ctrl.grid[y][x] = "X"; },
      _passable: function (x, y) { return passable(x, y); },
      _composition: function () { return ctrl.composition || null; },
      _compTally: function () { return asmTally; },
      _compose: function (nodeKey, numDoors) { return composeNode(seed, nodeKey, numDoors); },
      _levelWet: function (L) { return levelIsWet(L); },
      _rebuild: function () { buildView(); },                 // re-enter the current node (tests map memory)
      _loopEdges: function () { return ctrl.cycleEdges; },
      _glimpses: function () { return ctrl.glimpses || []; }
    };
    return api;
  }

  return { create: create, _W: W, _H: H, _CREATURE: CREATURE, _ITEMS: ITEMS, makeItem: makeItem, hungerStage: hungerStage, setLegacy: function (b) { ALLOW_LEGACY = !!b; } };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_MAP; }
