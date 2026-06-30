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
  // GATE A — the LIVE spawn source is the 223-foe families/variants bestiary (TD_BESTIARY) when present;
  // the old ~23 office roster (TD_RESOLVE.COMBAT.CREATURES) is the fallback only for harnesses that don't
  // load bestiary.js. spawnCreatures + KINDS_BY_BAND read this, so the depth-banded mix draws classic foes.
  var CREATURE = (typeof TD_BESTIARY !== "undefined" && TD_BESTIARY.ROSTER) ? TD_BESTIARY.ROSTER : TD_RESOLVE.COMBAT.CREATURES;
  // generous slack: walking is cheap, fighting costs, resting recovers fatigue,
  // and a full belly carries you across several levels before food matters.
  var FATIGUE_PER_FIGHT = 3, REST_RECOVER = 4, FATIGUE_PER_SPRINT = 1.5;   // RE-TUNE: per-fight 6->3 (one fight isn't a big chunk of the bar)
  var PASSIVE_RECOVER = 1.2;   // RE-TUNE: slow trickle each turn while NOT exerting (unencumbered step / safe, no foe adjacent) — FLAG tunable
  // GATE 8.1: WALKING IS FREE when unencumbered — a "step" costs fatigue only via the BURDEN band (still
  // x fatigueResist). Unburdened -> 0 (you walk a floor and arrive fresh); heavier -> tiring. Fight + sprint
  // keep their costs. (A jump, if added, would cost like a sprint — reserved.)
  var FATIGUE_STEP_BAND = { unencumbered: 0, laden: 0.4, strained: 0.9, overloaded: 1.6 };
  // GATE 8.1: the FOOD CLOCK is LONG and BODY-SCALED. Base drain lowered (0.14 -> 0.10), then multiplied by
  // (a) the BURDEN band (heavier = hungrier) and (b) a BODY-SIZE factor from Might+Con (big bodies burn more,
  // small bodies less; average ~1.0). Town recovery still fully resets.
  var SATIATION_PER_STEP = 0.115, STARVE_HP = TD_RESOLVE.COMBAT.STARVE_HP, EXHAUST_HP = TD_RESOLVE.COMBAT.EXHAUST_HP;
  var SATIATION_BAND = { unencumbered: 1.0, laden: 1.5, strained: 2.2, overloaded: 3.0 };   // burden -> hunger multiplier
  var FALL_DMG = TD_RESOLVE.COMBAT.FALL_DMG;   // the chasm exit: a desperate fall to the level below
  // R3 spawns are PER-WALKABLE-CELL DENSITIES (ratios, not counts) so a NODE->STANDARD floor-size
  // flip never re-balances combat or greed. PLACEHOLDER densities (calibration pending).
  var CREATURE_DENSITY = 0.0041, COIN_DENSITY = 0.05;   // COMBAT: FINAL at 0.0041 (no win-band — that was RETIRED). Combat is governed by both-routes-viable: forced-combat (lower survival/higher loot) vs avoidance (higher survival/lower loot) measured by per-route VALUE in the sim; density is not re-tuned to a survival %. No enemy scaling. (0.012 -> 0.006 GATE 3 -> 0.0041.)
  var GEAR_DENSITY = 0.004;   // GATE 2: weapon/armour drops per walkable cell (rare; a few per floor)
  // GATE 1.1 — coin heaps come in DENOMINATIONS so hoarding has weight. Canon: 25 coins/lb (denomination-
  // blind), 1g=10s=100c by VALUE — so all-gold is the lightest way to hold a value. The floor offers mostly
  // low-denomination BULK (copper/silver: heavy per value) and a few gold heaps (light, high value). The
  // CAUTIOUS play is to take the gold and leave the bulk (stay light); GREED hoovers everything (crosses a
  // burden band -> dulled evasion via playerBand()/ENC_EVASION). `weight` = relative spawn frequency.
  var COIN_MIX = [
    { den: "copper", weight: 4, min: 35, max: 105 },   // low-denomination BULK: heavy, near-worthless
    { den: "silver", weight: 5, min: 22, max: 58 },    // mid bulk: real value AND real weight (greed's reward+cost)
    { den: "gold",   weight: 2, min: 9,  max: 24 }     // high-value, low-weight: the smart pick (cautious takes these)
  ];
  function pickCoinDen(R) {
    var tot = 0; COIN_MIX.forEach(function (m) { tot += m.weight; });
    var r = R.int(1, tot), acc = 0;
    for (var i = 0; i < COIN_MIX.length; i++) { acc += COIN_MIX[i].weight; if (r <= acc) return COIN_MIX[i]; }
    return COIN_MIX[COIN_MIX.length - 1];
  }
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
  var GEN2_OPTS = { size: "regular", grammar: "worked", skin: "stone" };   // live floor params (the SINGLE source the leak sweep reads)
  var GEN2_MAXTRY = 64;                                                     // bounded reseeds; 1.2% leak rate => exhaustion is astronomically unlikely
  // PART A — the LIVE-FLOOR LEAK GATE. gen2 ships ~1.2% of worked floors with one open diagonal corner
  // (the "1 open corner = failure" law). We do NOT weaken the law; we gate the pipeline: reseed and
  // regenerate until TD_GEN2.measure says leaks===0 AND regions===1 AND both stairs exist, THEN render.
  // nextSeed() supplies fresh gen2 seeds (deterministic per node). Returns the level + _tries/_clean.
  function gen2Clean(nextSeed, depth) {
    var last = null, opts = depth ? { size: GEN2_OPTS.size, grammar: GEN2_OPTS.grammar, skin: GEN2_OPTS.skin, depth: depth } : GEN2_OPTS;
    for (var t = 0; t < GEN2_MAXTRY; t++) {
      var cand = TD_GEN2.generateLevel(nextSeed() >>> 0, opts);
      last = cand; cand._tries = t + 1;
      var m = TD_GEN2.measure(cand.grid);   // re-measures the FEATURE-stamped grid too: a feature that breaks a law is rejected + reseeded
      if (m.leaks === 0 && m.regions === 1 && cand.up && cand.down) { cand._clean = true; return cand; }
    }
    last._clean = false; return last;   // exhausted (should never happen live) — ship the last + caller logs
  }
  function composeNodeGen2(seed, nodeKey, numDoors, depth) {
    if (typeof TD_GEN2 === "undefined") return null;
    var R = nodeRng(seed, nodeKey + ":g2");
    depth = depth || 1;   // FEATURES are depth-selected (deeper bands unlock richer features). Passed from the call site (create() has the level; this fn is module-level, no `world` here).
    var lvl = gen2Clean(function () { return R.int(1, 2000000000); }, depth);
    if (!lvl._clean) console.error("composeNodeGen2: NO clean floor in " + GEN2_MAXTRY + " tries (" + nodeKey + ") — the leak law could not be met; shipping last candidate");
    var src = lvl.grid, sw = lvl.w, sh = lvl.h;   // FRAME LIFTED: the floor is the gen2 grid's OWN size (~43..65 x 27..41), not a fixed 54x34
    var g = [], rawGrid = [], roomDoors = [], secrets = [], loot = [], nF = 0, ax = 0, ay = 0;
    for (var y = 0; y < sh; y++) {
      var row = [];
      for (var x = 0; x < sw; x++) {
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
    var spawn = lvl.up ? { x: lvl.up.x, y: lvl.up.y } : { x: sw >> 1, y: sh >> 1 };
    // LEVEL TRANSITIONS use gen2's OWN stairs: descent = its down-stair, ascent = its up-stair.
    var downStair = lvl.down ? { x: lvl.down.x, y: lvl.down.y, kind: "down" } : null;
    var upStair = lvl.up ? { x: lvl.up.x, y: lvl.up.y, kind: "up" } : null;
    // SAME-LEVEL (breadth) edges sit on EXISTING floor cells (dead-ends first, then far cells) — NEVER
    // carved (operator ruling). gen2 invents no geometry for graph edges; the seam is flagged, not punched.
    var stairKeys = {}; if (downStair) stairKeys[downStair.x + "," + downStair.y] = 1; if (upStair) stairKeys[upStair.x + "," + upStair.y] = 1;
    var featDead = [];
    for (var dy = 1; dy < sh - 1; dy++) for (var dx = 1; dx < sw - 1; dx++) { if (g[dy][dx] !== ".") continue; var fn = DIR4.filter(function (d) { return isF(dx + d[0], dy + d[1]); }); if (fn.length === 1) featDead.push({ x: dx, y: dy }); }
    var seenB = {}, breadthCells = [];
    function addB(c) { var k = c.x + "," + c.y; if (!seenB[k] && !stairKeys[k] && !(c.x === spawn.x && c.y === spawn.y) && breadthCells.length < 16) { seenB[k] = 1; breadthCells.push({ x: c.x, y: c.y }); } }
    featDead.forEach(addB);
    if (breadthCells.length < 16) {
      var fl = []; for (var y2 = 1; y2 < sh - 1; y2++) for (var x2 = 1; x2 < sw - 1; x2++) if (g[y2][x2] === "." && !seenB[x2 + "," + y2] && !stairKeys[x2 + "," + y2] && !(x2 === spawn.x && y2 === spawn.y)) fl.push([x2, y2]);
      fl.sort(function (a, b) { return (Math.abs(b[0] - spawn.x) + Math.abs(b[1] - spawn.y)) - (Math.abs(a[0] - spawn.x) + Math.abs(a[1] - spawn.y)); });
      for (var i = 0; i < fl.length && breadthCells.length < 16; i++) addB({ x: fl[i][0], y: fl[i][1] });
    }
    // SECTION D R4 — DEAD-END CONNECTOR (flagged STUB; WHICH dead-end gets WHICH connector is OPERATOR CANON).
    // Demonstrates the mechanism: a deep dead-end gets a CRMC (one-way OUT, reuses the town exit); a shallow
    // dead-end gets a CSRR (one-way IN, dest stubbed). The operator repositions/assigns (CSRR/CRMC/OTIS/GHOST).
    var connectors = [], dlast = featDead.length ? featDead[featDead.length - 1] : null;
    if (dlast && !stairKeys[dlast.x + "," + dlast.y] && !(dlast.x === spawn.x && dlast.y === spawn.y)) {
      if ((depth || 1) >= 4) connectors.push({ x: dlast.x, y: dlast.y, kind: "CRMC", oneway: true, dir: "out", dest: "TOWN", _stub: true });
      else if ((depth || 1) <= 2) connectors.push({ x: dlast.x, y: dlast.y, kind: "CSRR", oneway: true, dir: "in", dest: null, _stub: true });
    }
    return {
      grid: g, rawGrid: rawGrid, spawn: spawn,
      downStair: downStair, upStair: upStair, breadthCells: breadthCells,
      doorPts: (downStair ? [downStair] : []).concat(upStair ? [upStair] : []).concat(breadthCells),   // wired-exit list (compat)
      roomDoors: roomDoors, secrets: secrets, loot: loot, deadEnds: [],
      tag: "gen2", rooms: 0, roomList: [], corridorCells: 0,
      corrLens: [], corrWidths: [], comX: nF ? ax / nF : spawn.x, comY: nF ? ay / nF : spawn.y, floorDensity: sw * sh ? nF / (sw * sh) : 0, source: "gen2", W: sw, H: sh,
      features: lvl.features || [],   // ARCHITECTURAL FEATURES: depth-selected feature-room records {type,rect,depth} (geometry already in the grid via $/X)
      stairs: stairsArray(upStair, downStair),   // SECTION D R2 — multi-stair model (additive; up/down still drive the live dive)
      connectors: connectors   // SECTION D R4 — dead-end connector tiles (flagged stub; placement = operator canon)
    };
  }
  // SECTION D R2 — MULTI-STAIR model: stairs:[{x,y,dir,symbol,dest,opens,shuts}]. N up + M down per floor.
  // ADDITIVE: built alongside the existing single up/down (which keeps the dive green) — the array is the
  // canonical model the leak-gate ("all stairs reachable, single region") + future selection read. symbol =
  // honest dir preview (the CIPHER glyph mapping is operator canon — STUB); dest = node-ref (the maze GRAPH
  // is operator canon — STUB); opens/shuts = the SG lattice selection primitive (STUB, wired with the graph).
  function stairsArray(upStair, downStair, extra) {
    var s = [];
    if (upStair) s.push({ x: upStair.x, y: upStair.y, dir: "up", symbol: "▲", dest: null, opens: null, shuts: null });
    if (downStair) s.push({ x: downStair.x, y: downStair.y, dir: "down", symbol: "▼", dest: null, opens: null, shuts: null });
    (extra || []).forEach(function (e) { s.push({ x: e.x, y: e.y, dir: e.dir || "down", symbol: e.symbol || "▼", dest: null, opens: null, shuts: null }); });
    return s;
  }
  // SECTION D R1 — HAND-AUTHORED floor stub: a clean rectangular Bureau chamber the operator fills later.
  // Law-safe BY CONSTRUCTION (a solid rectangle => zero open corners, single region) with an up + down stair.
  // Returns the SAME comp contract composeNodeGen2 does, so the controller node-load consumes it identically.
  function composeHandAuthored(seed, nodeKey, numDoors, depth) {
    var W2 = 40, H2 = 24, g = [];
    for (var y = 0; y < H2; y++) { var row = []; for (var x = 0; x < W2; x++) row.push((x === 0 || y === 0 || x === W2 - 1 || y === H2 - 1) ? "#" : "."); g.push(row); }
    var up = { x: 2, y: 2 }, down = { x: W2 - 3, y: H2 - 3 };
    var breadth = [{ x: 2, y: H2 - 3 }, { x: W2 - 3, y: 2 }];
    return {
      grid: g, rawGrid: g.map(function (r) { return r.slice(); }), spawn: { x: up.x, y: up.y },
      downStair: { x: down.x, y: down.y, kind: "down" }, upStair: { x: up.x, y: up.y, kind: "up" }, breadthCells: breadth,
      doorPts: [{ x: down.x, y: down.y }, { x: up.x, y: up.y }].concat(breadth),
      roomDoors: [], secrets: [], loot: [], deadEnds: [], tag: "authored-stub", rooms: 1, roomList: [],
      corridorCells: 0, corrLens: [], corrWidths: [], comX: W2 >> 1, comY: H2 >> 1, floorDensity: 1, source: "authored",
      W: W2, H: H2, features: [{ type: "bureau", x: 5, y: 5, w: 6, h: 5, cx: 8, cy: 7, depth: depth || 1, _stub: true }],
      stairs: stairsArray({ x: up.x, y: up.y }, { x: down.x, y: down.y })
    };
  }
  // R10 — AUTHORED-LEVEL TABLE: hand-made floors keyed by id, resolved from a graph node's `authored` ref
  // (world.nodes[id].authored = <levelId>). Engine-side registry; the operator's real authored grids
  // register here (or swap in by id). Each level: { id, rows:[ASCII], stairs:[{x,y,dir,dest}], features?, setpiece? }.
  var AUTHORED_LEVELS = {};
  function registerAuthored(level) { if (level && level.id) AUTHORED_LEVELS[level.id] = level; return level; }

  // R10 — AUTHORED-FLOOR LOADER. Serves a hand-made floor VERBATIM (never reseeded). Rows use the engine's
  // glyph vocabulary (. floor / # wall / + door / ? secret / $ loot / < up-stair / > down-stair / ~ water /
  // X chasm); a stair MANIFEST maps each stair cell to { dir, dest } so a floor can carry SEVERAL typed
  // down-stairs to DIFFERENT nodes (the R7 router consumes dest). Returns the SAME comp contract as
  // composeNodeGen2/composeHandAuthored (source:"authored"). VALIDATED, NOT regenerated: the parsed grid runs
  // the SAME hard invariants as STANDARD (0 open corners / single region / declared stairs reachable from
  // spawn). On ANY failure it FLAGS loudly (console.error) and returns null — the caller falls back to the
  // stub; a broken authored floor is NEVER served. 0 open corners stays non-negotiable.
  function composeAuthored(levelData) {
    var id = (levelData && levelData.id) || "?";
    if (!levelData || !levelData.rows || !levelData.rows.length) { console.error("composeAuthored: level '" + id + "' has no rows — REFUSED."); return null; }
    var rows = levelData.rows, H2 = rows.length, W2 = 0, y, x;
    for (y = 0; y < H2; y++) W2 = Math.max(W2, rows[y].length);
    var g = [], rawGrid = [], roomDoors = [], secrets = [], loot = [], caches = [], gridStairs = {}, nF = 0, ax = 0, ay = 0;
    // SG VAULT LEGEND (operator canon, scoped to the SG set-piece ONLY): in the authored SG vault, '$' is a
    // SECRET DOOR (hidden until searched, then opens/passes — reuse the '?' wall-secret mechanic) and 'S' is a
    // SECRET ROOM / loot cache (the room a '$' opens into; cache content is placed there). Everywhere ELSE the
    // legacy authored read stands ('$' = loot, 'S' = a loot pocket); global gen2 '$' = loot is untouched.
    var isSGVault = !!(levelData && levelData.setpiece === "smashgrab");
    for (y = 0; y < H2; y++) {
      var row = [], raw = rows[y];
      for (x = 0; x < W2; x++) {
        var c = (x < raw.length) ? raw[x] : "#";
        if (c === "+") roomDoors.push({ x: x, y: y, state: "closed" });
        if (c === "?") secrets.push({ x: x, y: y });
        if (c === "$") { if (isSGVault) secrets.push({ x: x, y: y }); else loot.push({ x: x, y: y }); }                 // SG: '$' = a SECRET DOOR (wall until searched); else legacy loot
        if (c === "S") { if (isSGVault) caches.push({ x: x, y: y }); else loot.push({ x: x, y: y, pocket: true }); }   // SG: 'S' = a SECRET ROOM cache cell; else legacy loot pocket
        if (c === "<" || c === ">") gridStairs[x + "," + y] = c;
        // a SG secret door renders as wall until the player searches it open (search() flips it to floor); all
        // other non-wall/water/chasm glyphs (incl. SG 'S' room cells) render as walkable floor.
        var out = (c === "#") ? "#" : (c === "~") ? "~" : (c === "X") ? "X" : (isSGVault && c === "$") ? "#" : ".";
        if (out === "." || out === "~") { nF++; ax += x; ay += y; }
        row.push(out);
      }
      g.push(row); rawGrid.push(row.slice());
    }
    // --- the stair MANIFEST: each {x,y,dir,dest} must sit on a matching stair glyph in the grid ---
    var manifest = levelData.stairs || [], stairs = [], up = null, down = null, badStair = [];
    manifest.forEach(function (s) {
      var gc = gridStairs[s.x + "," + s.y];
      var want = (s.dir === "up") ? "<" : ">";
      if (gc !== want) { badStair.push("(" + s.x + "," + s.y + ") dir " + s.dir + " has glyph '" + (gc || "none") + "', expected '" + want + "'"); return; }
      var entry = { x: s.x, y: s.y, dir: s.dir, symbol: s.dir === "up" ? "▲" : "▼", dest: (s.dest === undefined ? null : s.dest), opens: null, shuts: null };
      stairs.push(entry);
      if (s.dir === "up" && !up) up = entry;
      if (s.dir === "down" && !down) down = entry;
    });
    if (badStair.length) { console.error("composeAuthored: level '" + id + "' stair manifest mismatches the grid: " + badStair.join("; ") + " — REFUSED."); return null; }
    if (!up) { console.error("composeAuthored: level '" + id + "' has no up-stair in its manifest (spawn/arrival need one) — REFUSED."); return null; }
    var spawn = { x: up.x, y: up.y };
    // --- spare floor cells for the GATE-4 return-stair fallback (mirrors gen2's breadthCells; cap 16) ---
    var stairKeys = {}; stairs.forEach(function (s) { stairKeys[s.x + "," + s.y] = 1; });
    var breadthCells = [];
    for (y = 1; y < H2 - 1 && breadthCells.length < 16; y++) for (x = 1; x < W2 - 1 && breadthCells.length < 16; x++) {
      if (g[y][x] !== ".") continue; var k = x + "," + y; if (stairKeys[k] || (x === spawn.x && y === spawn.y)) continue;
      breadthCells.push({ x: x, y: y });
    }
    // --- VALIDATE against the SAME hard invariants as STANDARD (measure = the canonical gen2 law) ---
    var why = [];
    if (typeof TD_GEN2 !== "undefined" && TD_GEN2.measure) {
      var m = TD_GEN2.measure(g);
      if (m.leaks !== 0) why.push("open corners = " + m.leaks + " (must be 0)");
      if (m.regions !== 1) why.push("regions = " + m.regions + " (must be 1)");
    } else { why.push("TD_GEN2.measure unavailable — cannot validate"); }
    // declared stairs reachable from spawn (BFS over walkable floor)
    var seen = {}, q = [[spawn.x, spawn.y]]; seen[spawn.x + "," + spawn.y] = 1;
    function wlk(xx, yy) { return yy >= 0 && yy < H2 && xx >= 0 && xx < W2 && (g[yy][xx] === "." || g[yy][xx] === "~"); }
    while (q.length) { var p = q.shift(); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var nx = p[0] + d[0], ny = p[1] + d[1], nk = nx + "," + ny; if (!seen[nk] && wlk(nx, ny)) { seen[nk] = 1; q.push([nx, ny]); } }); }
    var unreached = stairs.filter(function (s) { return !seen[s.x + "," + s.y]; });
    if (unreached.length) why.push(unreached.length + " declared stair(s) unreachable from spawn");
    if (why.length) { console.error("composeAuthored: level '" + id + "' FAILED validation [" + why.join("; ") + "] — REFUSED (caller falls back to the stub); a broken authored floor is never served."); return null; }
    return {
      grid: g, rawGrid: rawGrid, spawn: spawn,
      downStair: down ? { x: down.x, y: down.y, kind: "down" } : null,
      upStair: up ? { x: up.x, y: up.y, kind: "up" } : null,
      breadthCells: breadthCells,
      doorPts: (down ? [down] : []).concat(up ? [up] : []).concat(breadthCells),
      roomDoors: roomDoors, secrets: secrets, loot: loot, caches: caches, deadEnds: [],
      tag: "authored", rooms: 0, roomList: [], corridorCells: 0, corrLens: [], corrWidths: [],
      comX: nF ? ax / nF : (W2 >> 1), comY: nF ? ay / nF : (H2 >> 1), floorDensity: (W2 * H2 ? nF / (W2 * H2) : 0),
      source: "authored", W: W2, H: H2, features: levelData.features || [], stairs: stairs,
      setpiece: levelData.setpiece || null,   // R10 R3 — SET-PIECE hook (e.g. "smashgrab")
      sg: levelData.sg || null   // R11 — the SG artifact spec ({ arts:[{id,x,y,name}] }) the live set-piece reads (grid-agnostic)
    };
  }

  // ===== CONTIGUOUS FLOORS (Model A) — Phase 1: the SUBLEVEL composer (offline; not yet wired live) =====
  // Compose ONE gen2 floor for a whole sublevel and lay the level's ORDINARY nodes into it as ROOMS, joined
  // by gen2's own corridors into ONE region. Each node's content goes into its room; the up-stair is the
  // arrival anchor and the down-stair is the single descent. SET-PIECE nodes are EXCLUDED (the Smash-and-Grab
  // stays its own stair/portal-reached floor — operator-reserved). Phase 1 proves: exactly one grid, whole-
  // floor single-region, every node's room walk-reachable from the stair-in. (Live wiring is Phase 3.)
  //
  // findRooms — the gen2 floor's discrete ROOMS = connected components of "roomy" cells (a cell whose 2x2 is
  // all floor, matching TD_GEN2.measure's room test). Corridors (width-1) are NOT rooms; they join the rooms.
  function sgFloorRooms(g) {
    var H = g.length, W = g[0].length;
    function fl(x, y) { return y >= 0 && y < H && x >= 0 && x < W && (g[y][x] === "." || g[y][x] === "~"); }
    function roomy(x, y) { if (!fl(x, y)) return false; var q = [[0, 0], [-1, 0], [0, -1], [-1, -1]]; for (var i = 0; i < 4; i++) { var ox = x + q[i][0], oy = y + q[i][1]; if (fl(ox, oy) && fl(ox + 1, oy) && fl(ox, oy + 1) && fl(ox + 1, oy + 1)) return true; } return false; }
    var seen = {}, rooms = [];
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      if (!roomy(x, y) || seen[x + "," + y]) continue;
      var stack = [[x, y]], cells = []; seen[x + "," + y] = 1;
      while (stack.length) { var c = stack.pop(); cells.push({ x: c[0], y: c[1] }); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var nx = c[0] + d[0], ny = c[1] + d[1], k = nx + "," + ny; if (!seen[k] && roomy(nx, ny)) { seen[k] = 1; stack.push([nx, ny]); } }); }
      // room CENTER = the member cell nearest the centroid (a real floor cell, good for content placement)
      var sx = 0, sy = 0; cells.forEach(function (c) { sx += c.x; sy += c.y; }); var cx = sx / cells.length, cy = sy / cells.length;
      var best = cells[0], bd = 1e9; cells.forEach(function (c) { var d = Math.abs(c.x - cx) + Math.abs(c.y - cy); if (d < bd) { bd = d; best = c; } });
      rooms.push({ cells: cells, size: cells.length, cx: best.x, cy: best.y });
    }
    rooms.sort(function (a, b) { return b.size - a.size; });   // biggest rooms first
    return rooms;
  }
  // BFS reachability over the floor (4-dir, walkable), from (ox,oy): returns the reached-cell set.
  function sgReachSet(g, ox, oy) {
    var H = g.length, W = g[0].length, seen = {}, q = [[ox, oy]]; seen[ox + "," + oy] = 1;
    function fl(x, y) { return y >= 0 && y < H && x >= 0 && x < W && (g[y][x] === "." || g[y][x] === "~"); }
    while (q.length) { var c = q.shift(); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var nx = c[0] + d[0], ny = c[1] + d[1], k = nx + "," + ny; if (!seen[k] && fl(nx, ny)) { seen[k] = 1; q.push([nx, ny]); } }); }
    return seen;
  }
  // Phase 2 — classify the sublevel's graph edges into STAIRS (cross-level) vs CORRIDORS (same-level). Same-
  // level edges are satisfied by WALKING (the nodes' rooms are already joined by gen2 corridors into one
  // region — no door). Cross-level edges become stairs, but THIS BUILD ships a SINGLE down-stair + a SINGLE
  // up-stair (the multi-stair / dead-end lattice is operator-reserved, a later round): the first cross-level
  // DOWN edge -> the one `>` (dest = the deeper node = the next sublevel's entry); the first cross-level UP
  // edge -> the one `<` (dest = the shallower node). Extra cross-level edges are FLAGGED, not built.
  function classifySublevelEdges(level, edges, nodeLevel, downCell, upCell, setPieceSet) {
    setPieceSet = setPieceSet || {};
    var corridors = [], downCand = [], upCand = [], portalCand = [];
    (edges || []).forEach(function (e) {
      var fl = nodeLevel[e.from], tl = nodeLevel[e.to];
      if (fl !== level) return;   // only edges OUT of this sublevel are realised here
      if (setPieceSet[e.to]) { portalCand.push(e); }                                      // 3c — a SET-PIECE neighbour is a PORTAL to its own floor (the SG stays separate)
      else if (tl === level) { corridors.push({ id: e.id, from: e.from, to: e.to }); }    // same-level ordinary -> walk
      else if (typeof tl === "number" && tl > level) { downCand.push(e); }                // descend
      else if (typeof tl === "number" && tl < level) { upCand.push(e); }                  // climb
    });
    var stairs = [], extra = 0;
    // 3c — a SET-PIECE PORTAL is the descent of choice (the SG sits on the spine): it takes the down-stair
    // cell; the SG floor's own continue-stair carries the dive onward. Else the first cross-level down edge.
    if (portalCand.length && downCell) { stairs.push({ x: downCell.x, y: downCell.y, dir: "down", dest: portalCand[0].to, edgeId: portalCand[0].id, portal: true }); extra += (portalCand.length - 1) + downCand.length; }
    else if (downCand.length && downCell) { stairs.push({ x: downCell.x, y: downCell.y, dir: "down", dest: downCand[0].to, edgeId: downCand[0].id }); extra += (downCand.length - 1); }
    if (upCand.length && upCell) { stairs.push({ x: upCell.x, y: upCell.y, dir: "up", dest: upCand[0].to, edgeId: upCand[0].id }); extra += (upCand.length - 1); }
    if (extra) console.warn("composeSublevel: Sublevel " + level + " has " + extra + " extra cross-level/portal edge(s) beyond the single up/down — FLAGGED (multi-stair lattice is operator-reserved, not built).");
    return { stairs: stairs, corridors: corridors, extraCrossLevel: extra };
  }
  // composeSublevel(seed, level, nodes [, edges, nodeLevel]) — nodes: [{ id, kind }] the ORDINARY nodes at
  // this sublevel (NO set-piece). edges/nodeLevel (optional, Phase 2): classify cross-level -> stairs,
  // same-level -> corridors.
  function composeSublevel(seed, level, nodes, edges, nodeLevel, setPieceSet) {
    nodes = (nodes || []).filter(function (n) { return n && n.nodeType !== "SET-PIECE"; });   // SG stays its own floor
    // ROOM >= NODE GUARANTEE: reseed the gen2 floor (deterministically — by varying the compose key per try)
    // until it has at least as many rooms as ordinary nodes, so EVERY node gets a real room (none on a spare
    // cell). Keep the best (most-rooms) candidate; stop early once it suffices. Deterministic: same seed+level
    // -> same try sequence -> same chosen floor. If even the best (after MAXTRY) still falls short, the seam
    // FLAG below catches it (never punch).
    var need = nodes.length, MAXTRY = 10, comp = null, rooms = null;
    for (var t = 0; t < MAXTRY; t++) {
      var cand = composeNodeGen2(seed, "SUBLEVEL_" + level + (t ? ":" + t : ""), Math.max(2, need), level || 1);
      if (!cand) continue;
      var rm = sgFloorRooms(cand.grid);
      if (!comp || rm.length > rooms.length) { comp = cand; rooms = rm; }   // keep the most-rooms floor seen
      if (rm.length >= need) break;                                          // enough rooms for every node -> done
    }
    if (!comp) return null;
    var g = comp.grid, up = comp.upStair || comp.spawn;
    // assign each node to a distinct room: the HUB (or first node) takes the room nearest the up-stair (arrival),
    // the rest take the largest remaining rooms. Overflow (more nodes than rooms) -> spare breadth cells, FLAGGED.
    var taken = {}, placements = [], seam = 0;
    function nearestRoom(tx, ty) { var best = null, bd = 1e9; rooms.forEach(function (r, i) { if (taken[i]) return; var d = Math.abs(r.cx - tx) + Math.abs(r.cy - ty); if (d < bd) { bd = d; best = i; } }); return best; }
    var order = nodes.slice().sort(function (a, b) { return (b.kind === "hub" ? 1 : 0) - (a.kind === "hub" ? 1 : 0); });
    order.forEach(function (n, idx) {
      var ri = (idx === 0 && up) ? nearestRoom(up.x, up.y) : nearestRoom(comp.comX || (g[0].length >> 1), comp.comY || (g.length >> 1));
      if (ri != null) { taken[ri] = 1; var r = rooms[ri]; placements.push({ id: n.id, kind: n.kind, x: r.cx, y: r.cy, roomSize: r.size, cells: r.cells }); }
      else { // no spare room — place content on a spare breadth/floor cell (still reachable), FLAG the seam
        var spare = (comp.breadthCells || []).filter(function (c) { return !placements.some(function (p) { return p.x === c.x && p.y === c.y; }); })[0];
        if (spare) { placements.push({ id: n.id, kind: n.kind, x: spare.x, y: spare.y, roomSize: 0, overflow: true, cells: [{ x: spare.x, y: spare.y }] }); seam++; }
        else { seam++; }
      }
    });
    if (seam) console.warn("composeSublevel: Sublevel " + level + " had " + nodes.length + " nodes but only " + rooms.length + " rooms — " + seam + " placed on spare cells / dropped (FLAGGED, not punched).");
    // Phase 2 — edges -> stairs (cross-level) + corridors (same-level). Off without edges (Phase 1 behaviour).
    var edgeModel = (edges && nodeLevel) ? classifySublevelEdges(level, edges, nodeLevel, comp.downStair, comp.upStair, setPieceSet)
                                         : { stairs: [], corridors: [], extraCrossLevel: 0 };
    return {
      grid: g, rawGrid: comp.rawGrid, source: "sublevel", level: level, W: comp.W, H: comp.H,
      spawn: comp.spawn, upStair: comp.upStair, downStair: comp.downStair, breadthCells: comp.breadthCells,
      rooms: rooms, placements: placements, roomCount: rooms.length, nodeCount: nodes.length, seam: seam,
      sublevelStairs: edgeModel.stairs, corridors: edgeModel.corridors, extraCrossLevel: edgeModel.extraCrossLevel,
      stairs: comp.stairs, secrets: comp.secrets, loot: comp.loot, features: comp.features,
      roomDoors: comp.roomDoors, connectors: [], comX: comp.comX, comY: comp.comY, doorPts: comp.doorPts
    };
  }
  // Gather the live world's ORDINARY nodes at a sublevel + the touching edges + a node->level map, then
  // compose the one contiguous floor for that sublevel (the live wiring's entry point; deterministic).
  function composeSublevelLive(world, seed, cl) {
    var nodeLevel = {}, nodes = [], setPieceSet = {};
    Object.keys(world.nodes).forEach(function (id) {
      var m = world.nodes[id]; nodeLevel[id] = m.level;
      if (m.nodeType === "SET-PIECE") setPieceSet[id] = 1;   // 3c — SET-PIECE neighbours become portals, not rooms
      if (m.level === cl && m.nodeType !== "SET-PIECE") nodes.push({ id: id, kind: (id.indexOf("hub") === 0 ? "hub" : id.indexOf("goal") === 0 ? "goal" : (id.indexOf("vault") === 0 ? "vault" : "pocket")), nodeType: m.nodeType });
    });
    var edges = (world.edges || []).filter(function (e) { return nodeLevel[e.from] === cl || nodeLevel[e.to] === cl; });
    return composeSublevel(seed, cl, nodes, edges, nodeLevel, setPieceSet);
  }
  // R10/R11 — the §24 SMASH-AND-GRAB set-piece floor (PLACEHOLDER). DEPENDENCY FLAG: the operator's real
  // authored SG grid is NOT in the repo. This placeholder (a chamber with pedestals `$` + an escape `>` to the
  // surface) PROVES THE WIRING; the operator's real SG grid swaps in by registering the SAME id ("sg_setpiece").
  // `setpiece:"smashgrab"` makes the LIVE floor itself the set-piece (R11: ctrl.sg / sgTick drive the collapse
  // + slab clock from the real turn loop — there is no overlay; the §24 throwaway was deleted in R12). The
  // up-stair `<` is the arrival anchor (climb-home is the GATE-4 auto-return); the escape `>` flees to TOWN.
  registerAuthored({
    id: "sg_setpiece", setpiece: "smashgrab",
    rows: [
      "################",
      "#..............#",
      "#.<..$..$..$...#",
      "#..............#",
      "#...>.....>....#",
      "################"
    ],
    stairs: [
      { x: 2, y: 2, dir: "up", dest: null },        // arrival anchor; the climb-home is the GATE-4 auto-return
      { x: 4, y: 4, dir: "down", dest: null },      // CONTINUE (engine default has no graph child -> inert; sg_live wires the real child)
      { x: 10, y: 4, dir: "down", dest: "TOWN" }    // the ESCAPE: slab-gated flight to the surface with the loot
    ],
    sg: { arts: [{ id: "A", x: 5, y: 3, name: "the Reliquary Ledger" }, { id: "B", x: 11, y: 3, name: "the Brass Astrolabe" }] },
    features: [{ type: "setpiece", x: 2, y: 2, w: 12, h: 3, cx: 7, cy: 2, depth: 1, kind: "smashgrab" }]
  });
  // SECTION D R1 — FLOOR-TYPE REGISTRY: nodeType -> generator. STANDARD is the default (gen2). JUNCTION and
  // SET-PIECE are REGISTERED but stubbed to STANDARD for now (the JUNCTION puzzle-hub + wiring the SG node-
  // graph SET-PIECE are later rounds / the doom-door layer — FLAG). Every type's output runs the SAME leak-gate.
  // R10 — a HAND-AUTHORED / SET-PIECE node serves its `authored` level via composeAuthored; if the ref is
  // missing/unknown OR the floor fails validation (composeAuthored returns null), it FLAGS and FALLS BACK to
  // the stub rectangle — never crashing the dive. The `authored` level data is threaded from the call site
  // (buildView resolves world.nodes[id].authored), since this registry is module-level (no `world` here).
  function authoredOrStub(s, k, n, d, authored) {
    if (authored) { var a = composeAuthored(authored); if (a) return a; console.error("composeNode: HAND-AUTHORED node '" + k + "' authored floor '" + (authored.id || "?") + "' failed to load — FALLING BACK to the stub."); }
    else console.error("composeNode: HAND-AUTHORED node '" + k + "' has no/unknown `authored` ref — FALLING BACK to the stub (FLAGGED).");
    return composeHandAuthored(s, k, n, d);
  }
  var FLOOR_TYPES = {
    STANDARD:        function (s, k, n, d) { return composeNodeGen2(s, k, n, d); },
    "HAND-AUTHORED": function (s, k, n, d, authored) { return authoredOrStub(s, k, n, d, authored); },
    JUNCTION:        function (s, k, n, d) { return composeNodeGen2(s, k, n, d); },   // STUB -> STANDARD (junction puzzle-hub is a later round)
    "SET-PIECE":     function (s, k, n, d, authored) { return authoredOrStub(s, k, n, d, authored); }   // R10 — SET-PIECE loads its authored grid (SG); falls back to the stub if absent
  };
  function composeNode(seed, nodeKey, numDoors, depth, nodeType, authored) {
    // Route by nodeType through the registry (substitution = lookup). STANDARD = gen2, rendered directly + GATED
    // (reseed until leaks=0/single-region/both-stairs). nodeType + authored threaded from the CALL SITE (this fn
    // is module-level — no `world` here). If the generator is absent: test-only legacy carver, else a debug floor.
    var gen = FLOOR_TYPES[nodeType] || FLOOR_TYPES.STANDARD;
    var a = gen(seed, nodeKey, numDoors, depth, authored);
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
      stance: shared.stance || (typeof TD_RESOLVE !== "undefined" ? TD_RESOLVE.STANCE_DEFAULT : "measured"),   // TACTICS: free-switch combat stance (persists via shared)
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
    // R6 — STAIR ARRIVAL CONTINUITY: the direction of the edge just traversed, consumed by the next
    // buildView() to choose the arrival cell. "up" (climbed back) -> spawn on the floor's DOWN-stair (the
    // cell you left by); "down"/"same"/null -> the default up-stair/breadth arrival. Reset after each load.
    var pendingArrival = null;

    function curLevel() { return (world.nodes[ctrl.node] || {}).level || 0; }
    // CONTIGUOUS FLOORS (Model A) — WALKING into a node's room marks that node REACHED: same-level travel
    // advances the interpreter (visited / required / completion) WITHOUT a grid swap. The level is unchanged
    // (all the floor's rooms are the same sublevel), so curLevel() and the rendered floor stay put.
    function markNodeReached(nodeId) {
      if (!nodeId || nodeId === ctrl.node) return;
      ctrl.node = nodeId;
      if (interp && interp.state) {
        interp.state.node = nodeId; interp.state.visited.add(nodeId);
        if (world.nodes[nodeId] && world.nodes[nodeId].required) interp.state.visitedRequired.add(nodeId);
      }
    }
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
    // ARCHITECTURAL FEATURES R3 — the ONLY flavored lines per feature (seasoning, not theme). The hazard
    // SENSES tell fires BEFORE the player commits (telegraph law: honest, seen/OBJ); the EXAMINE/entry line
    // fires once on stepping into the feature room. Verbatim Bureau voice (operator ruling).
    var FEATURE_VOICE = {
      reward: { examine: "Stores the Office sealed and forgot. It would want these back — but the Office is not here, and you are." },
      hazard: { examine: "Condemned. Bureau-permitted to no one.", senses: "The floor ahead reads wrong underfoot — the room holds its breath." },
      bureau: { examine: "Lost Property. Unclaimed these many years; claimant presumed elsewhere. Finder: you." },
      arena:  { examine: "An assembly hall, near as makes no difference. Room to swing — and room to be swung at." }
    };
    function rectDist(f, px, py) { var dx = Math.max(f.x - px, 0, px - (f.x + f.w - 1)), dy = Math.max(f.y - py, 0, py - (f.y + f.h - 1)); return Math.max(dx, dy); }
    function emitFeatureTells() {
      if (!inDungeon() || !ctrl.featureRooms) return;
      var px = ctrl.player.x, py = ctrl.player.y;
      ctrl.featureRooms.forEach(function (f) {
        var v = FEATURE_VOICE[f.type]; if (!v) return;
        var d = rectDist(f, px, py);
        if (f.type === "hazard" && v.senses && !f._tele && d <= 1) { senses(v.senses, "seen", "OBJ"); f._tele = 1; }   // BEFORE commit (approaching)
        if (!f._seen && d === 0) { logMsg(v.examine, false); f._seen = 1; }                                            // on entry (EVENT, Bureau register)
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

    // ===== R11 — SMASH-AND-GRAB ON THE LIVE FLOOR =====
    // The authored SET-PIECE floor IS the §24 set-piece: the collapse/slab CLOCK (TD_RESOLVE.SG, calibration
    // UNCHANGED) is driven from the REAL turn loop; the spatial collapse spreads over THIS floor's grid; the
    // `$` are real treasures (their weight rides the REAL burden, which gates the pace); grabbing a designated
    // artifact trips the clock and forecloses the other (the A/B doom-door choice). No overlay, no separate
    // screen — it plays in the normal renderer as the real character. ALL of this runs ONLY when the live
    // floor's composition.setpiece === "smashgrab"; every other floor is completely untouched.
    var SGR = (typeof TD_RESOLVE !== "undefined" && TD_RESOLVE.SG) ? TD_RESOLVE.SG : null;
    // SG DIRECTIONAL COLLAPSE — tunables (SG-floor-only; replace R11's generic clock). The front's cells-per-turn
    // is DERIVED at grab time from the floor's own artifact->stairwell distance so it SEALS at ~SG_SEAL_TURNS,
    // grid-agnostic (the operator's real grid drops in unchanged). GRACE = the break-from-pedestal head-start;
    // a SPRINT advances the front less (you gain ground); DEBRIS = survivable per-turn damage on overtake (not
    // instant death). Tuned against the sim (tests/run_sg_collapse.py) — see the report.
    var SG_SEAL_TURNS = 70, SG_GRACE = 3, SG_DEBRIS_DMG = 4, SG_SPRINT_FRONT = 0.7;
    function sgActiveFloor() { return !!(ctrl.sg && ctrl.composition && ctrl.composition.setpiece === "smashgrab"); }
    function sgInit(comp) {
      var arts = ((comp.sg && comp.sg.arts) || []).map(function (a) { return { id: a.id, x: a.x, y: a.y, name: a.name || (a.id === "A" ? "the Reliquary Ledger" : "the Brass Astrolabe"), taken: false }; });
      return { setpiece: true, tripped: false, frontTurns: 0, origin: null, dist: null, escaped: false, dead: false, choice: null, arts: arts, toldFront: -2, grace: false, frontRate: 1, stairDist: 0, stairCell: null };
    }
    function sgSprintable() {   // the REAL character burden gates the pace (not an abstract load): heavy -> can't outrun the front
      var b = playerBand(), k = b ? b.band.key : "unencumbered"; return k === "unencumbered" || k === "laden";
    }
    function sgFloorDist(ox, oy) {   // BFS over the LIVE floor (walkable) from the collapse origin
      var D = [[0, -1], [0, 1], [-1, 0], [1, 0]], dist = {}, q = [[ox, oy]]; dist[ox + "," + oy] = 0;
      while (q.length) { var c = q.shift(), cd = dist[c[0] + "," + c[1]]; for (var i = 0; i < 4; i++) { var nx = c[0] + D[i][0], ny = c[1] + D[i][1], k = nx + "," + ny; if (dist[k] !== undefined) continue; if (!inb(nx, ny) || !(ctrl.grid[ny][nx] === "." || ctrl.grid[ny][nx] === "~")) continue; dist[k] = cd + 1; q.push([nx, ny]); } }
      return dist;
    }
    // DIRECTIONAL FRONT: the collapse edge, in BFS-distance cells from the grab origin, after its grace head-start.
    function sgFrontier() { var s = ctrl.sg; if (!s || !s.tripped) return -1; return Math.max(0, s.frontTurns - SG_GRACE) * s.frontRate; }
    // SEALED when the front reaches the STAIRWELL (the escape distance) — the point of no return.
    function sgSealed() { var s = ctrl.sg; return !!(s && s.tripped && s.stairDist > 0 && sgFrontier() >= s.stairDist); }
    function sgRubble(x, y) { var s = ctrl.sg; if (!s || !s.tripped || !s.dist) return false; var d = s.dist[x + "," + y]; return (d !== undefined) && d <= sgFrontier(); }
    function sgPlayerLead() { var s = ctrl.sg; if (!s || !s.dist) return 99; var d = s.dist[ctrl.player.x + "," + ctrl.player.y]; return (d === undefined) ? 99 : (d - sgFrontier()); }
    function sgTrip() {
      var s = ctrl.sg; if (!s || s.tripped) return;
      s.tripped = true; s.frontTurns = 0; s.grace = true; s.origin = { x: ctrl.player.x, y: ctrl.player.y }; s.dist = sgFloorDist(s.origin.x, s.origin.y);
      // The front rolls from the grabbed artifact TOWARD THE STAIRWELL. Find the escape stair (toTown), else the
      // nearest stair, and DERIVE the front's cells-per-turn from that distance so the stair seals at ~SEAL_TURNS.
      var stair = null;
      for (var dk in ctrl.doors) { if (ctrl.doors[dk].toTown) { var p = dk.split(",").map(Number); stair = { x: p[0], y: p[1] }; break; } }
      if (!stair) for (var dk2 in ctrl.doors) { var dr = ctrl.doors[dk2]; if (dr.type === "stair_down" || dr.type === "stair_up") { var p2 = dk2.split(",").map(Number); stair = { x: p2[0], y: p2[1] }; break; } }
      s.stairCell = stair; s.stairDist = stair ? (s.dist[stair.x + "," + stair.y] || 0) : 0;
      s.frontRate = (s.stairDist > 0) ? (s.stairDist / Math.max(1, SG_SEAL_TURNS - SG_GRACE)) : (SGR ? SGR.TUNE.COLLAPSE_RATE_SETPIECE : 1);
      logMsg("The floor splits at your feet and the collapse begins ROLLING toward the way out — outrun it to the stairs. RUN.", true);
      senses("A cold draft pours up out of the split; behind you the floor is folding into the dark, gaining, rolling your way.", "heard", "OBJ");
    }
    function sgTelegraph() {   // R2 — the collapse/slab pressure reads in the SENSES channel as feel-words; never a number
      var s = ctrl.sg; if (!s || !s.tripped) return; var fr = Math.floor(sgFrontier()); if (fr === s.toldFront) return; s.toldFront = fr;
      if (sgSealed()) { senses("The slab has ground down across the way out; only a hand's breadth of light shows beneath it now.", "heard", "OBJ"); return; }
      var lead = sgPlayerLead();
      if (lead <= 2) senses("The collapse is at your heels — grit and dark pour past your ankles. MOVE.", "heard", "OBJ");
      else if (lead <= 5) senses("The floor is folding shut behind you faster than you would like; the slab ahead keeps grinding down.", "heard", "OBJ");
      else senses("A low grinding rolls through the stone — the room is coming apart, unhurried but certain.", "heard", "OBJ");
    }
    function sgGrabArt(it) {   // grabbing one artifact forecloses the other (the doom-door choice) + trips the clock
      var s = ctrl.sg; if (!s) return;
      s.choice = { grabbed: it.sgId, opensDoor: "SG_DOOR_" + it.sgId, shutsDoor: "SG_DOOR_" + (it.sgId === "A" ? "B" : "A"), pairsRuled: false };
      s.arts.forEach(function (a) { if (a.id === it.sgId) a.taken = true; });
      // the OTHER pedestal sinks out of reach (you carry only one)
      for (var k in ctrl.items) { var o = ctrl.items[k]; if (o && o.kind === "sgart" && o.sgId !== it.sgId) { delete ctrl.items[k]; } }
      ctrl.inventory.push({ kind: "artifact", glyph: "☥", name: it.name, sgId: it.sgId, desc: it.name + " — lifted from its pedestal; the other is lost to you now." });
      logMsg("You lift " + it.name + " from its pedestal. The far pedestal sinks out of reach — you may carry only the one.", true);
      senses("Stone grinds on stone the instant your fingers close: you have made your choice, and the room has noted it.", "heard", "OBJ");
      sgTrip();
    }
    // the live-loop SG tick: each player action rolls the DIRECTIONAL collapse front toward the stairwell.
    // mode === "sprint" + the real burden allows it -> the front advances LESS (you GAIN ground); else it
    // advances a full turn. If the front is on/past your cell -> DEBRIS DAMAGE (survivable, per-turn), not an
    // instant kill: fall behind the front and you bleed, you do not auto-die.
    function sgTick(mode) {
      var s = ctrl.sg; if (!sgActiveFloor() || !s || !s.tripped || s.escaped || s.dead || ctrl.dead) return;
      // the GRAB turn is a one-action head-start — break from the pedestal before the front starts rolling.
      if (s.grace) { s.grace = false; sgTelegraph(); return; }
      s.frontTurns += (mode === "sprint" && sgSprintable()) ? SG_SPRINT_FRONT : 1;
      if (sgRubble(ctrl.player.x, ctrl.player.y)) {   // the front has overtaken you -> debris rakes you this turn
        ctrl.meters.hp = Math.max(0, ctrl.meters.hp - SG_DEBRIS_DMG);
        ctrl.fx = ctrl.fx || []; ctrl.fx.push({ x: ctrl.player.x, y: ctrl.player.y, amount: SG_DEBRIS_DMG, kind: "taken" });
        senses("Debris rakes across you — you are IN the collapse now; get clear or it will bury you.", "heard", "OBJ");
        if (ctrl.meters.hp <= 0) { s.dead = true; die("The collapse caught the visitor in the open and the floor took everything — the Bureau files it under 'reabsorbed, with effects.'"); return; }
      }
      sgTelegraph();
    }

    function buildView() {
      ctrl.water = {}; ctrl.chasm = {}; ctrl.pendingFall = null; ctrl.sensedSecret = {};
      var meta = world.nodes[ctrl.node] || {};
      var vd = (typeof TD_VAULTS !== "undefined" && meta.vault) ? TD_VAULTS.byId(meta.vault) : null;
      if (vd) { buildVaultView(vd); return; }
      var v = interp.view();
      var cl = curLevel();
      var nodeType = (world.nodes[ctrl.node] || {}).nodeType || "STANDARD";   // SECTION D — floor-type from the graph (operator canon; defaults STANDARD so the live dive is unchanged)
      // R10 — resolve a HAND-AUTHORED / SET-PIECE node's authored level from the table (no-op for STANDARD nodes).
      var authoredRef = (world.nodes[ctrl.node] || {}).authored;
      var authoredData = authoredRef ? AUTHORED_LEVELS[authoredRef] : null;
      if (authoredRef && !authoredData) console.error("buildView: node '" + ctrl.node + "' references unknown authored level '" + authoredRef + "' — composeNode will fall back to the stub (FLAGGED).");
      // CONTIGUOUS FLOORS (Model A) — an ordinary sublevel (level>=1, not a SET-PIECE / authored / vault node)
      // renders as ONE contiguous floor: every ordinary node on that level is a ROOM joined by gen2 corridors,
      // and only the single up/down STAIRS change sublevels. The SG set-piece (3c) + the entrance (level 0) keep
      // the node-floor path. composeSublevelLive is deterministic, so re-entry renders the identical floor.
      var ordinarySublevel = (cl >= 1 && nodeType !== "SET-PIECE" && !meta.authored && !meta.vault && typeof TD_GEN2 !== "undefined");
      var comp = ordinarySublevel ? composeSublevelLive(world, seed, cl) : null;
      if (!comp) { comp = composeNode(seed, ctrl.node, v.options.length, cl, nodeType, authoredData); ordinarySublevel = false; }   // depth -> features; nodeType + authored -> registry
      // R6 — STAIR ARRIVAL CONTINUITY: the floor is identical per node (deterministic seed, untouched); only
      // WHICH existing stair cell we spawn on changes. Climbing BACK up to a floor (arrivedVia "up") lands you
      // on that floor's DOWN-stair — the cell you left by — instead of the up-stair at the top. Descending in,
      // the entrance, breadth/same edges, and the initial load all keep the default up-stair/breadth arrival.
      if (pendingArrival === "up" && cl >= 1) {
        var dst = comp.downStair;
        if (dst && comp.grid[dst.y] && comp.grid[dst.y][dst.x] === ".") comp.spawn = { x: dst.x, y: dst.y };   // the carved down-stair: always a reachable floor cell
        else console.warn("R6: node " + ctrl.node + " (Sublevel " + cl + ") had no usable down-stair for an up-arrival — falling back to the up-stair (FLAGGED, not stranded).");
      }
      pendingArrival = null;   // consume: a later non-transition rebuild must not inherit a stale direction
      var g = comp.grid, doors = {};
      // FRAME LIFTED: the controller adopts THIS floor's actual dimensions (gen2 now varies +/-20%, ~43..65 x
      // 27..41). All bounds/FOV/render/camera read W/H, so they track the live floor with no truncation.
      W = (g[0] ? g[0].length : W); H = g.length || H; CX = W >> 1; CY = H >> 1;
      // Map each graph edge onto the GENERATOR'S OWN exits: level transitions take the down/up STAIR;
      // same-level breadth edges sit on existing floor cells (NEVER carved). No geometry is opened for
      // a graph edge. If a node has more exits than the floor offers, FLAG the seam — never punch.
      // (The test-only legacy carver has no stair concept — it keeps the old doorPts[i]-by-edge mapping.)
      var seam = 0;
      if (comp.source === "sublevel") {
        // CONTIGUOUS FLOORS — only the cross-level STAIRS are doors; same-level nodes are ROOMS you WALK to
        // (no same-level door, no grid swap). The single down/up stairs carry their dest for R7 routing; the
        // GATE-4 return-stair below still provides the climb-home if the graph wired no up-edge.
        (comp.sublevelStairs || []).forEach(function (s) {
          var k = key(s.x, s.y); if (doors[k]) return;
          var type = (s.dir === "up") ? "stair_up" : "stair_down", ed = null;
          (world.edges || []).forEach(function (o) { if (o.id === s.edgeId) ed = o; });
          doors[k] = { edgeId: s.edgeId, type: type, takeable: ed ? ed.takeable : true, reason: ed ? ed.reason : null, one_way: ed ? !!ed.one_way : false, to: s.dest, label: (type === "stair_down" ? "a stair down — deeper" : "a stair up"), tells: [] };
        });
      } else if (comp.source === "authored") {
        // R10 — AUTHORED floors place their stairs DIRECTLY from the manifest (each carries an explicit dest);
        // the generic edge-mapper is skipped. A dest is matched to its graph edge (so interp.choose advances the
        // lattice + checks takeable); "TOWN" exits to the surface; a null/unmatched dest FLAGS and stays an inert
        // marker. The GATE-4 return-stair + GATE-5 town-exit blocks below still run (comp.breadthCells is present).
        (comp.stairs || []).forEach(function (s) {
          var k = key(s.x, s.y); if (doors[k]) return;
          var type = (s.dir === "up") ? "stair_up" : "stair_down";
          if (s.dest === "TOWN") { doors[k] = { type: "stair_up", toTown: true, takeable: true, to: "TOWN", label: "the way up — to the surface (Town)", tells: [] }; return; }
          if (s.dest == null) { doors[k] = { type: type, takeable: false, to: null, label: "an authored stair (destination unassigned — operator canon)", tells: [] }; return; }
          var ed = null; v.options.forEach(function (o) { if (o.to === s.dest) ed = o; });
          if (!ed) { console.error("buildView: authored node '" + ctrl.node + "' stair dest '" + s.dest + "' has no matching graph edge — placed as an inert marker (FLAGGED)."); doors[k] = { type: type, takeable: false, to: s.dest, label: "an authored stair (no graph edge)", tells: [] }; return; }
          doors[k] = { edgeId: ed.id, type: type, takeable: ed.takeable, reason: ed.reason, one_way: ed.one_way, to: s.dest, label: ed.label || ("a stair " + s.dir), tells: ed.tells || [] };
        });
      } else if (comp.breadthCells) {
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
      // GATE 4 R3 — GUARANTEE A REACHABLE UP-STAIR. The lattice is ~88% down-directed (most nodes have
      // no up-edge), so descending would otherwise strand you. Wire a RETURN up-stair at the generator's
      // own (reachable) up-stair cell, back to the node we descended FROM, whenever the graph wired none.
      // SET-PIECE EXCEPTION: an authored set-piece floor (the SG vault) declares ALL its exits in its
      // manifest — its single `<` stairwell IS the way out (collapse-gated). NEVER punch a generic return
      // stair onto a spare floor cell here: those cells live in the artifact chambers, and a stray door
      // both clobbers an artifact pedestal and gives a free back-door the set-piece must not have.
      if (comp.breadthCells && !comp.setpiece) {
        var back = shared.cameFrom && shared.cameFrom[ctrl.node];
        // place a RETURN stair to where we came from unless a door already leads there (a pocket up-edge
        // elsewhere does NOT count — it doesn't go home). Prefer the floor's up-stair cell; else any spare
        // breadth cell; else FLAG. This makes the climb-home / flee-up retreat ALWAYS available.
        var hasBack = Object.keys(doors).some(function (k) { return doors[k].to === back; });
        if (back && !hasBack) {
          var cell = (comp.upStair && !doors[key(comp.upStair.x, comp.upStair.y)]) ? comp.upStair : null;
          if (!cell) { for (var ci = comp.breadthCells.length - 1; ci >= 0; ci--) { var bc = comp.breadthCells[ci]; if (!doors[key(bc.x, bc.y)]) { cell = bc; break; } } }
          if (cell) doors[key(cell.x, cell.y)] = { type: "stair_up", returnTo: back, takeable: true, to: back, label: "a stair up (the way you came)", tells: [] };
          else console.warn("GATE 5: no spare cell for the return stair at " + ctrl.node + " (FLAGGED).");
        }
      }
      // GATE 5 R2 — THE WAY UP TO TOWN. At the dungeon entrance (the top of the dive, world.start),
      // place an exit back to the surface so the town<->descent LOOP closes: climb all the way up and
      // step out into the harbour. Sits on the floor's own up-stair cell; flagged toTown for the game
      // controller to hand back to the town screen. (No graph edge — the surface is not a lattice node.)
      if (comp.breadthCells && ctrl.node === world.start) {
        var townCell = comp.upStair || (comp.breadthCells.length ? comp.breadthCells[comp.breadthCells.length - 1] : null);
        if (townCell && !doors[key(townCell.x, townCell.y)]) doors[key(townCell.x, townCell.y)] = { type: "stair_up", toTown: true, takeable: true, to: "TOWN", label: "the way up — back to the surface (Town)", tells: [] };
        else if (!townCell) console.warn("GATE 5: entrance node had no free cell for the town exit (FLAGGED).");
      }
      // SECTION D R4 — wire dead-end CONNECTORS into the door layer (reuse the transition tech). A CRMC
      // (one-way OUT) becomes a town-exit door (the existing toTown transition); a CSRR (one-way IN) / OTIS /
      // GHOST become flagged stub markers (their dest is operator canon — no transition until the graph is wired).
      (comp.connectors || []).forEach(function (cn) {
        var k = key(cn.x, cn.y); if (doors[k]) return;   // never clobber a stair/edge door
        if (cn.dir === "out") doors[k] = { type: "stair_up", toTown: true, takeable: true, to: "TOWN", connector: cn.kind, label: "a mop closet — the one-way OUT to the surface (Town)", tells: [] };
        else doors[k] = { type: "connector", connector: cn.kind, oneway: true, dest: cn.dest, takeable: false, label: "a " + cn.kind + " connector (one-way " + (cn.dir || "?") + ") — destination unassigned (operator canon)", tells: [] };
      });
      // R7 — ROUTE THE DIVE THROUGH stairs[].dest. The live router (ctrl.stairs, below) is DERIVED from the
      // final door layer so EVERY actual stair carries its destination: the down-stair <- the down-edge's
      // target; the up-stair <- the up-edge; the synthetic RETURN stair <- the came-from node; the entrance's
      // way-up <- "TOWN". This supersedes the dormant Section D R2 scaffolding (gen2's two physical cells with
      // dest:null, kept on comp.stairs for the leak-gate). openDoor resolves every stair transition via .dest,
      // never the implicit single up/down. CAPABILITY ONLY: the graph (TD_GEN) is untouched — with one up + one
      // down per floor this is identical to before, but a floor can now hold several typed stairs, each routing
      // to a different node. liveStairs IS the realizable lattice router.
      // HARD GUARANTEE (strand guard, item 1): every reachable floor MUST offer at least one OPENABLE exit to
      // a connected floor — a level with one barred door and no usable stair is unplayable. The graph + the
      // GATE-4/5 return/town stairs already ensure this (proven by tests/run_strand_guard.py), but if the door
      // layer ever produced none (a null-dest authored stair as the sole exit, a future floor type), FLAG it
      // loudly and drop in a guaranteed way-up (to where we came, else to TOWN) on a spare reachable cell so a
      // stranding floor can NEVER ship silently. Runs before liveStairs so the fallback is a real router exit.
      (function () {
        var hasExit = false;
        for (var dk in doors) { var dd = doors[dk]; if (dd.toTown || dd.returnTo != null) { hasExit = true; break; } if ((dd.type === "stair_up" || dd.type === "stair_down" || dd.type === "oneway" || dd.type === "connector") && dd.takeable !== false) { hasExit = true; break; } }
        if (hasExit) return;
        var back = (shared.cameFrom && shared.cameFrom[ctrl.node]);
        var spare = (comp.breadthCells || []).concat(comp.upStair ? [comp.upStair] : []), cell = null;
        for (var ci = 0; ci < spare.length; ci++) { var sc = spare[ci]; if (sc && !doors[key(sc.x, sc.y)]) { cell = sc; break; } }
        if (!cell) { console.error("STRAND GUARD: node '" + ctrl.node + "' (level " + cl + ", " + comp.source + ") had NO openable exit AND no spare cell for a fallback — FLAGGED (a stranding floor)."); return; }
        if (back != null) doors[key(cell.x, cell.y)] = { type: "stair_up", returnTo: back, takeable: true, to: back, label: "a stair up (the way you came)", tells: [] };
        else doors[key(cell.x, cell.y)] = { type: "stair_up", toTown: true, takeable: true, to: "TOWN", label: "the way up — back to the surface (Town)", tells: [] };
        console.error("STRAND GUARD: node '" + ctrl.node + "' (level " + cl + ", " + comp.source + ") had NO openable exit — placed a guaranteed way-up at " + cell.x + "," + cell.y + " (FLAGGED, not stranded).");
      })();
      var liveStairs = [];
      Object.keys(doors).forEach(function (k) {
        var dr = doors[k]; if (dr.type !== "stair_up" && dr.type !== "stair_down") return;   // breadth/plain/connector doors are NOT stairs
        var pc = k.split(",").map(Number), dir = (dr.type === "stair_up") ? "up" : "down";
        liveStairs.push({ x: pc[0], y: pc[1], dir: dir, symbol: (dir === "up") ? "▲" : "▼",
          dest: dr.toTown ? "TOWN" : (dr.to != null ? dr.to : (dr.returnTo != null ? dr.returnTo : null)),
          edgeId: dr.edgeId || null, returnTo: (dr.returnTo != null) ? dr.returnTo : null,
          oneway: !!dr.one_way, toTown: !!dr.toTown, reason: dr.reason || null, opens: null, shuts: null });
      });
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
      ctrl.featureRooms = comp.features || [];   // ARCHITECTURAL FEATURES — for the view (telegraph/voice wire in R3)
      ctrl.stairs = liveStairs;                  // R7 — the LIVE multi-stair router (door-derived, dest-stamped). comp.stairs (gen2's physical up/down) stays for the leak-gate / compose consumers.
      ctrl.connectors = comp.connectors || [];   // SECTION D R4 — dead-end connector tiles (CRMC wired as a town-exit door; others flagged stubs)
      // v2 (Jaquay) — MAP MEMORY: explored geometry persists per node across revisits
      // within a run (the node is deterministic, so the keys stay valid). Live LOS layers
      // on top at render; what you've seen stays remembered when you leave and return.
      // MAP MEMORY persists per FLOOR — keyed by SUBLEVEL for the contiguous floors (all the level's nodes
      // share one floor), else per node (SET-PIECE / authored / entrance).
      var exKey = (comp.source === "sublevel") ? ("L" + cl) : ctrl.node;
      ctrl.explored = ctrl.exploredByNode[exKey] || (ctrl.exploredByNode[exKey] = new Set());
      reveal(comp.spawn.x, comp.spawn.y);
      ctrl.pendingDoor = null;
      // gen2 (and sublevel, which IS a gen2 grid) floors are rendered DIRECTLY — their own skin lays terrain;
      // the controller adds no water of its own. Other generators keep the controller water pass.
      if (comp.source !== "gen2" && comp.source !== "sublevel") placeTerrain(comp);
      // gen2's own loot ($) cells become items (its authored rewards), then the usual gameplay fill runs.
      (comp.loot || []).forEach(function (l, i) { if (isFloor(l.x, l.y)) tryItem(l.x, l.y, ["souvenir", "ration", "bandage"][i % 3]); });
      // CONTIGUOUS FLOORS — lay each ordinary node's CONTENT into its room + map the room's cells to the node,
      // so WALKING into a room marks that node reached (move() reads ctrl.cellToNode). Same-level travel is
      // walking — there is NO same-level door / grid swap.
      ctrl.cellToNode = {};
      if (comp.source === "sublevel") {
        (comp.placements || []).forEach(function (p) {
          (p.cells || []).forEach(function (c) { ctrl.cellToNode[key(c.x, c.y)] = p.id; });
          if (isFloor(p.x, p.y) && !ctrl.items[key(p.x, p.y)] && !doors[key(p.x, p.y)]) {
            if (p.kind === "vault") ctrl.items[key(p.x, p.y)] = makeCoins("gold", 30);       // the vault's loot
            else if (p.kind !== "hub") tryItem(p.x, p.y, p.kind === "goal" ? "souvenir" : "ration");
          }
        });
      }
      if (inDungeon()) placeDefaults(comp);
      placeGlimpses();
      spawnCreatures();
      spawnCoins();
      spawnGear();
      if (decorate) decorate(ctrl, { CX: comp.spawn.x, CY: comp.spawn.y, key: key, isFloor: isFloor });
      // R11 — SET-PIECE SETUP: the authored SG floor IS the live §24. Build the run-state, clear wandering
      // foes (a curated footrace, not a brawl), seed the SECRET-ROOM caches (operator legend: the 'S' rooms a
      // '$' secret door opens into) with REAL heavy treasure (greed -> real burden -> the slab pace), and
      // place the designated A/B artifacts (grabbing one trips the clock + forecloses the other). The '$'
      // secret doors themselves are registered above (comp.secrets) — hidden until searched. Determinism: the
      // floor is authored (fixed); only the run-state is fresh per arrival.
      ctrl.sg = (comp.setpiece === "smashgrab") ? sgInit(comp) : null;
      if (ctrl.sg) {
        ctrl.creatures = [];
        (comp.loot || []).forEach(function (l) { if (isFloor(l.x, l.y)) ctrl.items[key(l.x, l.y)] = makeCoins("gold", 50); });   // any legacy '$'-loot fallback (none in the operator vault; '$' there is a secret door)
        (comp.caches || []).forEach(function (cc) { if (isFloor(cc.x, cc.y) && !ctrl.items[key(cc.x, cc.y)]) ctrl.items[key(cc.x, cc.y)] = makeCoins("gold", 50); });   // the SECRET-ROOM caches ('S'): heavy treasure with WEIGHT (the anti-greed lever)
        ctrl.sg.arts.forEach(function (a) { if (isFloor(a.x, a.y)) ctrl.items[key(a.x, a.y)] = { kind: "sgart", sgId: a.id, glyph: "☥", name: a.name, desc: a.name + " on a pedestal — you may carry only ONE artifact out, and grabbing it brings the room down." }; });
      }
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
    var COIN_DEN_NAME = { copper: "a heap of copper", silver: "a stack of silver", gold: "a few gold coins" };
    function makeCoins(den, amount) { return { kind: "coins", den: den || "gold", glyph: "$", name: COIN_DEN_NAME[den || "gold"], desc: "Bureau-stamped coin. It has weight, all the same.", coins: amount }; }
    // coin loot at a per-walkable-cell DENSITY; each pile is a DENOMINATION (copper/silver/gold). A pile
    // picks up into the PURSE by denomination -> weight (25/lb, blind) -> band. Greed = grab the bulk too.
    function spawnCoins() {
      if (!inDungeon() || (world.nodes[ctrl.node] || {}).dmz) return;
      var n = Math.round(walkableCount() * COIN_DENSITY);
      for (var c = 0; c < n; c++) {
        var spot = pickSpot();
        if (!spot || itemAt(spot.x, spot.y) || creatureAt(spot.x, spot.y)) continue;
        var m = pickCoinDen(rng);
        ctrl.items[key(spot.x, spot.y)] = makeCoins(m.den, rng.int(m.min, m.max));   // PLACEHOLDER counts (sim-calibrated)
      }
    }
    // GATE 2 — GEAR DROPS. Weapons (the roster's 3 types) + armour tiers appear on the floor at a
    // per-walkable-cell density. Picking one up EQUIPS it; the displaced piece goes to the pack, where
    // its WEIGHT counts toward the burden band (the anti-hoard lever — carrying a backup arsenal slows you).
    var GEAR = (typeof TD_RESOLVE !== "undefined") ? TD_RESOLVE.GEAR : null;
    function armorCarryWeight(spec) { return Math.round((spec.encumbrance || 0) * 3) + 1; }   // heft from the dial; equipped armour costs evasion, a SPARE costs this weight
    // feel-words (NEVER a number): a weapon's weight in the hand, an armour tier's heft.
    function weightWord(w) { return w <= 2 ? "light in the hand" : w <= 4 ? "a fair heft" : w <= 7 ? "heavy" : "a burden to swing"; }
    function heftWord(spec) { var e = spec.encumbrance || 0; return e <= 1 ? "barely there" : e <= 3 ? "a steady weight" : "ponderous on the shoulders"; }
    function weaponItem(spec) { var v = (GEAR && GEAR.WEAPON_TYPES[spec.type]) ? GEAR.WEAPON_TYPES[spec.type].verb : spec.verb; return { kind: "weapon", slot: "rightHand", glyph: ")", name: spec.name, weight: spec.weight, bulk: spec.bulk, type: spec.type, hands: spec.hands || 1, verb: spec.verb || v, value: spec.value, spec: spec, desc: "A " + (((spec.hands || 1) === 2) ? "two-handed " : "") + spec.type + " weapon — you " + (spec.verb || v) + " with it. It is " + weightWord(spec.weight) + "." }; }
    // GATE 7 (A): an armour piece is slot-bound (it equips to its own slot, e.g. a helm -> head).
    function armorItem(spec) { return { kind: "armor", slot: spec.slot || "body", glyph: "[", name: spec.name, weight: spec.weight || armorCarryWeight(spec), bulk: 4, value: spec.value, spec: spec, desc: spec.name + " (" + (spec.slot || "armour") + ") — it sits " + heftWord(spec) + "." }; }
    function spawnGear() {
      if (!GEAR || !inDungeon() || (world.nodes[ctrl.node] || {}).dmz) return;
      var wkeys = Object.keys(GEAR.WEAPONS), akeys = ["light", "medium", "heavy"], aslots = ["head", "body", "hands", "feet", "waist", "back"];   // GATE 7 (A): armour drops as SLOT PIECES
      var n = Math.round(walkableCount() * GEAR_DENSITY);
      for (var i = 0; i < n; i++) {
        var spot = pickSpot();
        if (!spot || itemAt(spot.x, spot.y) || creatureAt(spot.x, spot.y)) continue;
        if (rng.chance(0.7)) ctrl.items[key(spot.x, spot.y)] = weaponItem(GEAR.WEAPONS[rng.pick(wkeys)]);   // weapons more common than armour
        else ctrl.items[key(spot.x, spot.y)] = armorItem(GEAR.armorPiece(rng.pick(aslots), rng.pick(akeys)));
      }
    }
    // GATE 4 R4 — DEPTH-BANDED SPAWN TABLE. Danger rises with depth by shifting the foe MIX toward
    // tougher bands (NOT by inflating counts — density is unchanged). Each foe carries a `band` (1..6).
    // The mix CENTERS on a compounding target band (DANGER_RATE^(L-1)); a foe of band b on floor L is
    // weighted SPREAD^|b - target|, so the average foe climbs steadily with depth while lower bands still
    // appear (the tourist still meets a gnat on floor 4) and rare higher ones threaten. An occasional
    // OUT-OF-DEPTH spawn one band over the floor seeds the must-flee read (threatTell).
    // CALIBRATION (sandbox-tuned, R4): RATE/SPREAD give the survival curve its shape — a freshly-rolled
    // starting char HANDLES floor 1, the ramp bites on floors 2-3, and you are mostly fleeing by floor 5.
    // (FLAGGED: the mix's average BAND climbs ~30%/floor and effective THREAT faster; a LITERAL 20%/floor
    // band-ramp leaves floor 5-6 too soft to force fleeing for an ungrown char — the OUTCOME "flee by 5"
    // is senior to the 20% figure per the Spirit Clause, so the ramp is set to deliver it.)
    var DANGER_RATE = 1.4;            // target band = RATE^(L-1): the compounding danger ramp
    var BAND_SPREAD = 0.5;            // how tightly the mix clusters on the target band (smaller = tighter)
    var OUT_OF_DEPTH_CHANCE = 0.10;   // chance a given spawn is one band TOO STRONG for the floor (telegraphed must-flee)
    var KINDS_BY_BAND = (function () { var m = {}; Object.keys(CREATURE).forEach(function (k) { if (CREATURE[k].noSpawn) return; var b = CREATURE[k].band || 1; (m[b] = m[b] || []).push(k); }); return m; })();   // GATE 2: the retired office roster (noSpawn) is excluded from the pool
    var MAX_BAND = (function () { var mx = 1; Object.keys(CREATURE).forEach(function (k) { mx = Math.max(mx, CREATURE[k].band || 1); }); return mx; })();
    function pickFoe(L) {
      if (L < 1) L = 1;
      if (L < MAX_BAND && rng.chance(OUT_OF_DEPTH_CHANCE)) {            // occasional out-of-depth (one band over)
        var over = KINDS_BY_BAND[Math.min(MAX_BAND, L + 1)];
        if (over && over.length) return over[rng.int(0, over.length - 1)];
      }
      var target = Math.pow(DANGER_RATE, L - 1), pool = [], weights = [], total = 0;
      for (var b = 1; b <= L && b <= MAX_BAND; b++) {
        var ks = KINDS_BY_BAND[b]; if (!ks) continue;
        var w = Math.pow(BAND_SPREAD, Math.abs(b - target));
        for (var i = 0; i < ks.length; i++) { pool.push(ks[i]); weights.push(w); total += w; }
      }
      if (!pool.length) return Object.keys(CREATURE)[0];
      var r = rng.next() * total;
      for (var j = 0; j < pool.length; j++) { r -= weights[j]; if (r <= 0) return pool[j]; }
      return pool[pool.length - 1];
    }
    function spawnCreatures() {
      ctrl.creatures = [];
      if (!livingOn || !inDungeon()) return;
      // DMZ law (v20 R1): a saloon or the cafeteria is demilitarised — no hostile
      // action resolves inside, so none ever spawns. (The truce is spatial, not prose.)
      if ((world.nodes[ctrl.node] || {}).dmz) return;
      var n = Math.max(1, Math.round(walkableCount() * CREATURE_DENSITY));   // DENSITY, not a fixed count
      var L = curLevel();
      for (var c = 0; c < n; c++) {
        var spot = pickSpot();
        if (!spot) continue;
        var kind = pickFoe(L), def = CREATURE[kind];
        // GATE A R2 — carry the bestiary member's real fields onto the live creature (weapon/armor/stats too).
        // Mechanic tags with no engine hook yet (regen/ranged/raise) ride along as DATA for later gates (FLAG: not faked).
        ctrl.creatures.push({ x: spot.x, y: spot.y, kind: kind, hp: def.hp, maxHp: def.hp, dmg: def.dmg, name: def.name, glyph: def.glyph, arche: def.arche, band: def.band || 1, firstStrike: !!def.firstStrike, tooTough: !!def.tooTough, tags: def.tags || [], family: def.family || null, role: def.role || null, weapon: def.weapon || null, armor: def.armor || null, stats: def.stats || null, fighter: defFighter(def) });
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
    function foeAdjacent() { var p = ctrl.player; return ctrl.creatures.some(function (c) { return Math.max(Math.abs(c.x - p.x), Math.abs(c.y - p.y)) <= 1; }); }   // RE-TUNE: in melee = no passive breather

    // ---- the world acts only when the player acts (turn-based) ---------------
    function endTurn(mode, noWorld) {
      meterTick(mode, noWorld);
      if (!noWorld && !ctrl.dead) creaturesStep();   // GATE 8 (B): a SPRINT skips the world's step (you dart ahead) at a high fatigue cost
      sgTick(mode);   // SG — roll the DIRECTIONAL collapse front from the REAL turn loop (mode "sprint" gains ground; no-op off a set-piece floor)
      shared.turn += 1;
    }

    // INTENT TELEGRAPH (graded-omens law): a hostile that ends its step ADJACENT will strike NEXT turn —
    // it telegraphs the coming blow now, so the strike is readable + reactable, never a hidden coin-flip.
    // No new behaviour: the creature still moves+bites on its normal schedule; this only ADDS a feel-word
    // tell. CLARITY scales with the read (Per) — sharp for the perceptive, a vague hunch for the dull —
    // but it ALWAYS fires before a commit and NEVER surfaces a number. (FUTURE HOOK: an Intuition stat
    // can later sharpen the murky tier; nothing is wired to it yet.)
    // GATE 4 R5: 24 foes share SEVEN archetypes, so the tells are keyed by ARCHETYPE (drift/ambush/
    // pursue/skirmish/rush/slow/hold) x clarity (clear/vague/murky), with "{it}" interpolated to the
    // foe's capitalised name. One vocabulary, learnable: the same archetype always reads the same way,
    // so the player learns to recognise a rusher's all-or-nothing lunge vs a holder's planted line.
    var ARCHE_TELLS = {
      clear: { drift:    "{it} gathers itself and reaches — a blow is a breath away.",
               ambush:   "{it} coils, its weight tipping to strike; you have one beat to answer.",
               pursue:   "{it} draws back to lunge — its intent is plain.",
               skirmish: "{it} weaves a feint and sets to dart in — fast, and aimed.",
               rush:     "{it} hurls itself forward without guard; it means to spend everything on one strike, now.",
               slow:     "{it} plants its feet and hauls its weight back — a slow, certain ruin is coming.",
               hold:     "{it} levels its weapon along its line; step in and you walk onto it." },
      vague: { drift:    "{it} lurches in close, meaning to land something.",
               ambush:   "{it} tenses; a strike is gathering.",
               pursue:   "{it} winds up to lunge.",
               skirmish: "{it} shifts quick on its feet, looking for the gap.",
               rush:     "{it} throws itself at you, all need and no guard.",
               slow:     "{it} cocks back; something heavy is on the way.",
               hold:     "{it}'s point swings toward you and holds." },
      murky: { drift:    "Something at your side tenses to move.",
               ambush:   "A stillness beside you draws tight — wrong, somehow.",
               pursue:   "A gathering at your flank; a blow is forming.",
               skirmish: "A flicker at the edge of you, too quick to fix.",
               rush:     "Something rushes your flank past all sense; it will not hold.",
               slow:     "A weight gathers nearby, patient and bad.",
               hold:     "A line of threat settles between you and the way on." }
    };
    function intentTier() {
      var per = (ctrl.character && ctrl.character.stats && typeof ctrl.character.stats.per === "number") ? ctrl.character.stats.per : 500;
      return per >= 620 ? "clear" : (per >= 420 ? "vague" : "murky");
    }
    function telegraphIntent(cr) {
      var tier = intentTier(), set = ARCHE_TELLS[tier] || ARCHE_TELLS.vague, line = set[cr.arche] || set.drift;
      line = line.replace("{it}", cap(cr.name));
      // clear/vague are PERCEIVED (seen, OBJ-true); the murky tier reads as a hunch (intuition/SUBJ) — both
      // ALWAYS fire before the commit (the timing is reliable; only the wording's precision scales).
      senses(line, tier === "murky" ? "intuition" : "seen", tier === "murky" ? "SUBJ" : "OBJ");
    }
    // GATE 4 R4 — OUT-OF-DEPTH THREAT TELL. A foe too strong for this floor (an out-of-depth spawn one
    // band over, or a flagged tooTough must-flee foe) is telegraphed as DISPROPORTIONATE the first time
    // it comes within reveal range — the Per/Intuition read that says "do not fight this here, run."
    // Per-gated like the intent tells; never a number. (Reads against the character-power surface in
    // spirit; the explicit power feel-word rides the view.)
    function threatTell(cr) {
      if (cr.threatTold) return;
      cr.threatTold = true;
      if (intentTier() === "murky") senses("Something near is wrong in scale — every instinct in you says run.", "intuition", "SUBJ");
      else senses(cap(cr.name) + " is out of all proportion to this floor; you are not meant to fight it here.", "seen", "OBJ");
    }
    // GATE 2 R3 — CRUSH-TELL HOOK (stub). A HEAVY-IMPACT blow landing on tier-4 Regulation Plate makes
    // the shell give inward; fire the GENERATOR'S crush-tell string on the senses channel. The crush
    // MAGNITUDE stays QB's (damage() already carries the crush term); this is only the tell. The hook is
    // DORMANT in normal play (no impact-wielding foe exists yet) — it lights up when one does.
    function crushTell(attWeapon) {
      // GATE 7 (A): the player's armour is now AGGREGATED across slots — the crush-tell fires when the worn
      // set includes plate (a heavy piece) and an impact blow lands on it.
      var arm = playerArmor();
      if (attWeapon && attWeapon.type === "impact" && arm && arm.heavy && arm.crushTell) senses(arm.crushTell, "heard", "OBJ");
    }
    function creaturesStep() {
      var toldIntent = false;   // one telegraph per step keeps the senses panel readable, not spammy
      var pSee = losFrom(ctrl.player.x, ctrl.player.y);   // GATE 3: LOS once/step — a foe sees you iff its cell is lit
      ctrl.creatures.forEach(function (cr) {
        var dist = Math.abs(cr.x - ctrl.player.x) + Math.abs(cr.y - ctrl.player.y);
        if (dist > 1) cr.poised = false;                     // out of reach -> must re-telegraph before its next strike
        if ((cr.tooTough || (cr.band || 1) > curLevel()) && dist <= REVEAL) threatTell(cr);   // R4: a foe too strong for this floor reads as must-flee
        // ---- GATE 3: AI = ANIMUS state machine (dormant->wandering->seeking->fleeing) x per-archetype movement.
        if (cr.mode === undefined) aiInit(cr);
        // GATE C — a REGEN-tagged foe (troll) heals each turn until burned down: a self-status, ticked here.
        if (typeof TD_STATUS !== "undefined" && cr.tags && cr.tags.indexOf("regen") >= 0 && !TD_STATUS.has(cr, "regen") && cr.hp < (cr.maxHp || cr.hp)) TD_STATUS.apply(cr, "regen", 999);
        if (cr.statuses && cr.statuses.length) { cr._regenShown = false; tickCreatureStatuses(cr); if (cr._regenShown && dist <= REVEAL && !toldIntent) { senses(cap(cr.name) + "'s wounds knit shut before your eyes.", "seen", "OBJ"); toldIntent = true; } }
        var sees = pSee.has(key(cr.x, cr.y));                 // LOS-gated perception (no omniscient pursuit)
        if (sees) {
          cr.lastSeen = { x: ctrl.player.x, y: ctrl.player.y }; cr.chaseLeft = cr.persistence;
          if (cr.animus === "dormant" || cr.animus === "wandering") { cr.animus = "seeking"; if (cr.mode === "ambush" && !toldIntent) { senses(cap(cr.name) + " uncoils from its stillness.", "seen", "OBJ"); toldIntent = true; } }
        } else if (cr.animus === "seeking") {
          cr.chaseLeft = (cr.chaseLeft || 0) - 1;             // PERSISTENCE: chase from memory, then give up (break-LOS escapes the flighty)
          if (cr.chaseLeft <= 0) { cr.animus = "wandering"; cr.lastSeen = null; }
        }
        if (cr.fleeLow && cr.hp > 0 && cr.hp < 0.25 * (cr.maxHp || cr.hp)) cr.animus = "fleeing";   // fleeing-low
        var move = null, m = cr.mode;
        var tgt = sees ? { x: ctrl.player.x, y: ctrl.player.y } : (cr.lastSeen || null);
        if (cr.animus === "fleeing") move = fleeStep(cr);
        else if (cr.animus === "dormant") move = null;        // asleep until you cross its sight
        else if (cr.animus === "seeking" && tgt) {
          if (m === "chase") move = pathStep(cr, tgt.x, tgt.y) || greedy(cr, tgt.x, tgt.y);            // real pathfind (around walls)
          else if (m === "plod") { cr._slow = !cr._slow; if (cr._slow) move = pathStep(cr, tgt.x, tgt.y) || greedy(cr, tgt.x, tgt.y); }   // every other turn
          else if (m === "kite") move = kiteStep(cr);                                                  // keep range (archer/caster)
          else if (m === "hold") { move = (dist <= REVEAL) ? (pathStep(cr, tgt.x, tgt.y) || greedy(cr, tgt.x, tgt.y)) : returnToPost(cr); }   // leashed to its post
          else if (m === "wander") move = rng.chance(0.45) ? greedy(cr, tgt.x, tgt.y) : wander(cr);    // a drifter that spots you only loosely drifts your way
          else move = greedy(cr, tgt.x, tgt.y);                                                        // beeline / ambush / roused predator
        } else {                                              // wandering (no target)
          if (m === "hold") move = returnToPost(cr);          // SINGULAR FOCUS = return to post
          else if (m === "wander") move = rng.chance(0.6) ? wander(cr) : null;
          else move = rng.chance(0.3) ? wander(cr) : null;    // idle patrol after losing you
        }
        if (move) {
          if (move.x === ctrl.player.x && move.y === ctrl.player.y) {        // it reaches you: it strikes
            // TELEGRAPH LAW: a stat-blocked foe NEVER commits un-telegraphed. If it has not been poised
            // (e.g. you walked up to a holding warden), it WINDS UP this turn — telegraphs, does not strike
            // — and lands the blow next turn. (Legacy/test foes without a fighter keep the immediate path.)
            // GATE 4 R5: a FIRST-STRIKE foe (a glass cannon) strikes on contact — it has initiative and
            // is a real threat before it dies. (Its approach still telegraphs at distance 1, below, so the
            // blow is never wholly unread; first-strike only denies the free wind-up turn.)
            if (cr.fighter && !cr.poised && !cr.firstStrike) { telegraphIntent(cr); cr.poised = true; toldIntent = true; return; }
            var pf2 = playerFighter();
            if (pf2 && cr.fighter) {                                         // LIVE two-function (feel-words, no numbers)
              cr.poised = false;                                            // struck -> must re-telegraph next time
              if (TD_RESOLVE.hit(cr.fighter, pf2, rng).hit) {
                var dmg2 = TD_RESOLVE.damage(cr.fighter, pf2, rng).damage;
                ctrl.fx.push({ x: ctrl.player.x, y: ctrl.player.y, amount: dmg2, kind: "taken" });
                hurt(dmg2, cr);
                crushTell(cr.fighter.weapon);                                  // R3 hook: impact vs tier-4 plate -> the shell gives inward
                // SECTION G — the armour STRUCK-FEEL voice (verbatim per tier), as a SENSES tell on a landed
                // blow. Throttled so it seasons rather than spams; the tier is the player's EFFECTIVE armour.
                if (rng.chance(0.34) && pf2.armor && TD_RESOLVE.GEAR && TD_RESOLVE.GEAR.armourVoice) { var av = TD_RESOLVE.GEAR.armourVoice(pf2.armor.robustness || 0); if (av && av.struckFeel) senses(av.struckFeel, "seen", "OBJ"); }
                envenom(cr);                                                   // GATE 5 R2: a poison-tagged foe leaves venom (antidote cures)
                if (!ctrl.dead) logMsg(cap(cr.name) + " amends your itinerary.", lowHP());
              } else logMsg(cap(cr.name) + " lunges and misses.", false);
            } else {                                                        // legacy flat fallback
              ctrl.fx.push({ x: ctrl.player.x, y: ctrl.player.y, amount: cr.dmg, kind: "taken" });
              hurt(cr.dmg, cr); envenom(cr);
              if (!ctrl.dead) logMsg(cap(cr.name) + " amends your itinerary.", lowHP());
            }
          } else {
            cr.x = move.x; cr.y = move.y;
            // poised one step away -> telegraph the strike it will land next turn (hostiles with a stat block)
            if (cr.fighter && Math.abs(cr.x - ctrl.player.x) + Math.abs(cr.y - ctrl.player.y) === 1) { if (!toldIntent) { telegraphIntent(cr); toldIntent = true; } cr.poised = true; }
          }
        }
      });
    }
    // GATE 3 — derive a foe's AI from its archetype + tags (data-driven; lazy so every spawn path + test
    // injection is covered). MODE = movement style; PERSISTENCE = turns it chases from memory after LOS is
    // lost (low = break-LOS escapes; high = relentless); FOCUS = fixate vs return-to-post; fleeLow = breaks
    // at low HP unless stalwart (guardian/hold/leader/must-flee colossus hold the line).
    function aiInit(cr) {
      var a = cr.arche || "drift", tags = cr.tags || [];
      var MODE = { pursue: "chase", skirmish: "beeline", rush: "beeline", kite: "kite", ambush: "ambush", slow: "plod", hold: "hold", drift: "wander" };
      cr.mode = MODE[a] || "wander";
      if (tags.indexOf("guardian") >= 0) cr.mode = "hold";
      if (tags.indexOf("ranged") >= 0 && (cr.mode === "beeline" || cr.mode === "wander")) cr.mode = "kite";   // archers/casters keep range
      var P = { chase: 12, plod: 8, hold: 14, beeline: 4, kite: 3, ambush: 6, wander: 2 };
      cr.persistence = P[cr.mode] || 4;
      if (cr.tooTough) cr.persistence = Math.max(cr.persistence, 14);
      cr.focus = (cr.mode === "hold") ? "post" : "fixate";
      cr.home = { x: cr.x, y: cr.y };
      cr.fleeLow = !(cr.mode === "hold" || cr.tooTough || tags.indexOf("guardian") >= 0 || tags.indexOf("leader") >= 0);
      cr.animus = (cr.mode === "ambush") ? "dormant" : "wandering";
      cr.chaseLeft = 0;
    }
    // greedy step toward a TARGET (default the player). Stepping onto the player is always allowed (a strike).
    function greedy(cr, tx, ty) {
      if (tx == null) { tx = ctrl.player.x; ty = ctrl.player.y; }
      var best = null, bestD = Math.abs(cr.x - tx) + Math.abs(cr.y - ty);
      STEP4.forEach(function (d) {
        var nx = cr.x + DIRS[d][0], ny = cr.y + DIRS[d][1];
        var onPlayer = (nx === ctrl.player.x && ny === ctrl.player.y);
        if (!onPlayer && (!passable(nx, ny) || creatureAt(nx, ny))) return;
        var nd = Math.abs(nx - tx) + Math.abs(ny - ty);
        if (nd < bestD) { bestD = nd; best = { x: nx, y: ny }; }
      });
      return best;
    }
    // real BFS pathfind toward a target (pursuers only; capped for perf). Returns the first step or null.
    function pathStep(cr, tx, ty) {
      if (cr.x === tx && cr.y === ty) return null;
      var q = [[cr.x, cr.y]], seen = {}, prev = {}, start = key(cr.x, cr.y), n = 0;
      seen[start] = 1;
      while (q.length && n++ < 500) {
        var c = q.shift();
        for (var i = 0; i < STEP4.length; i++) {
          var d = STEP4[i], nx = c[0] + DIRS[d][0], ny = c[1] + DIRS[d][1], kk = key(nx, ny);
          if (seen[kk]) continue;
          var onTgt = (nx === tx && ny === ty), onPlayer = (nx === ctrl.player.x && ny === ctrl.player.y);
          if (!onTgt && !onPlayer && (!passable(nx, ny) || creatureAt(nx, ny))) continue;
          seen[kk] = 1; prev[kk] = key(c[0], c[1]);
          if (onTgt) { var step = kk, p = prev[step]; while (p && p !== start) { step = p; p = prev[step]; } var xy = step.split(","); return { x: +xy[0], y: +xy[1] }; }
          q.push([nx, ny]);
        }
      }
      return null;
    }
    function fleeStep(cr) {
      var best = null, bestD = Math.abs(cr.x - ctrl.player.x) + Math.abs(cr.y - ctrl.player.y);
      STEP4.forEach(function (d) {
        var nx = cr.x + DIRS[d][0], ny = cr.y + DIRS[d][1];
        if (!passable(nx, ny) || creatureAt(nx, ny)) return;
        var nd = Math.abs(nx - ctrl.player.x) + Math.abs(ny - ctrl.player.y);
        if (nd > bestD) { bestD = nd; best = { x: nx, y: ny }; }
      });
      return best;
    }
    // kite: hold an ideal stand-off range — back off if crowded, close if too far, hold (and "fire") in band.
    function kiteStep(cr) {
      var ideal = 3, d = Math.abs(cr.x - ctrl.player.x) + Math.abs(cr.y - ctrl.player.y);
      if (d < ideal) return fleeStep(cr);
      if (d > ideal + 1) return greedy(cr);
      return null;
    }
    function returnToPost(cr) {
      if (!cr.home || (cr.x === cr.home.x && cr.y === cr.home.y)) return null;
      return pathStep(cr, cr.home.x, cr.home.y) || greedy(cr, cr.home.x, cr.home.y);
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
    // GATE 3: read the foe's REAL ten-stat block + roster gear when present (the bestiary), so armour/
    // evasion/weapon-type all bite. Falls back to synthesizing from hp/dmg for stat-less creatures
    // (test-harness foes set via _setCreatures, or any legacy block) so nothing breaks.
    function defFighter(def) {
      if (typeof TD_RESOLVE === "undefined" || !TD_RESOLVE.GEAR) return null;
      var G = TD_RESOLVE.GEAR;
      var stats = def.stats || { might: 380 + def.dmg * 14, dex: 470, con: 320 + def.hp * 6, int: 300, per: 420, lucky: 500, intuition: 380, appearance: 400, charm: 300, grit: 420 };
      var weapon = def.weapon ? G.WEAPONS[def.weapon] : { name: def.name, type: "blade", base: def.dmg, acc: 0 };
      var armor = def.armor ? G.ARMOR[def.armor] : G.ARMOR.light;
      return { stats: stats, weapon: weapon || { name: def.name, type: "blade", base: def.dmg, acc: 0 }, armor: armor || G.ARMOR.light };
    }
    // ENCUMBRANCE (R2): the carried loadout (gear + weighty inventory + purse) -> a TD_BURDEN band ->
    // worse EVASION (folded into the player fighter) + slower MOVE/tempo. The burden->evasion fold is now
    // the SINGLE SOURCE TD_RESOLVE.applyBurdenEvasion (so the HUD footing reads the SAME effect, not a copy).
    // GATE 7 (A): the player's effective {weapon, armor} aggregated from the 11-slot equipment.
    function playerLoadout() {
      var ch = ctrl.character;
      if (!ch || typeof TD_RESOLVE === "undefined" || !TD_RESOLVE.GEAR || !TD_RESOLVE.GEAR.aggregate) return null;
      return TD_RESOLVE.GEAR.aggregate(ch.equipment || {});
    }
    function playerArmor() { var lo = playerLoadout(); return lo ? lo.armor : null; }
    function carriedItems() {
      var its = [], ch = ctrl.character, G = (typeof TD_RESOLVE !== "undefined") ? TD_RESOLVE.GEAR : null;
      var eq = ch && ch.equipment;   // every worn/wielded piece carries weight toward the burden band
      if (eq && G) G.SLOTS.forEach(function (s) { var p = eq[s]; if (p && typeof p.weight === "number" && (s !== "leftHand" || p !== eq.rightHand)) its.push(p); });
      (ctrl.inventory || []).forEach(function (it) { if (it && typeof it.weight === "number") its.push(it); });
      return its;
    }
    function playerPurse() { return (ctrl.character && ctrl.character.purse) || {}; }   // coins arrive in R3
    function playerBand() {
      if (typeof TD_BURDEN === "undefined" || !ctrl.character || !ctrl.character.stats) return null;
      return TD_BURDEN.compute(ctrl.character.stats, carriedItems(), playerPurse());
    }
    function playerFighter() {
      var ch = ctrl.character, lo = playerLoadout();
      if (!ch || !ch.stats || !lo || typeof TD_RESOLVE === "undefined" || typeof TD_RESOLVE.fighter !== "function") return null;
      var armor = lo.armor, bnd = playerBand();
      if (bnd && TD_RESOLVE.applyBurdenEvasion) armor = TD_RESOLVE.applyBurdenEvasion(armor, bnd.band.key);   // burden dulls evasion (single source: TD_RESOLVE)
      // CHARACTER A — PROFICIENCY competence layer: a weapon-family rank folds a small acc/damage modifier
      // into the EFFECTIVE weapon (combat magnitudes untouched). Default untrained -> no change.
      var weapon = lo.weapon;
      if (typeof TD_CHARSYS !== "undefined" && ch.sheet && weapon && weapon.type) {
        var pr = TD_CHARSYS.profRankOf(ch.sheet, weapon.type);
        if (pr !== 1) { var pm = TD_CHARSYS.profMod(pr), w2 = {}; for (var kk in weapon) w2[kk] = weapon[kk]; w2.acc = (weapon.acc || 0) + pm.acc; w2.base = (weapon.base || 0) + pm.dmg; weapon = w2; }
      }
      var f = TD_RESOLVE.fighter(ch.stats, weapon, armor);
      if (TD_RESOLVE.stanceByKey) f.stance = TD_RESOLVE.stanceByKey(ctrl.stance);   // STANCE biases hit() (acc as attacker, eva as defender)
      return f;
    }
    // GATE 8 (B): fatigue RESISTANCE — Con + Grit + Might make you tire slower (a multiplier on all
    // fatigue GAIN). avg 500 = neutral (x1); hardy/willful/strong (high avg) tire far slower; the frail
    // and faint tire faster. Surfaced as a feel-word stage, never a number.
    function fatigueResist() {
      var s = ctrl.character && ctrl.character.stats; if (!s) return 1;
      var avg = (s.con + s.grit + s.might) / 3;
      return Math.max(0.45, Math.min(1.6, 1 - (avg - 500) / 1000));
    }
    var FATIGUE_STAGES = ["fresh", "winded", "tiring", "flagging", "spent"];
    function fatigueStage() { var m = ctrl.meters, p = m.fatigueMax ? m.fatigue / m.fatigueMax : 0; return p < 0.2 ? "fresh" : p < 0.45 ? "winded" : p < 0.7 ? "tiring" : p < 0.95 ? "flagging" : "spent"; }
    // feel-word on a band CROSSING (no number) + a tempo penalty when slow (the world gains a step on you).
    function updateBand(noWorld) {
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
      if (!noWorld && ctrl.slowDebt >= 1 && !ctrl.dead) { ctrl.slowDebt -= 1; creaturesStep(); }   // slow -> the world takes an extra step (NOT while sprinting)
    }
    function lowHP() { return ctrl.meters.hp > 0 && ctrl.meters.hp < 0.25 * ctrl.meters.hpMax; }
    function hurt(amount, source) {
      var r = TD_RESOLVE.applyDamage(ctrl.meters.hp, amount);
      ctrl.meters.hp = r.hp; if (r.dead) die(combatCause(source));
    }
    function die(cause) { if (!ctrl.dead) { ctrl.dead = true; ctrl.cause = cause; logMsg(cause, true); } }
    // XP + LEVELS — accumulate XP (meta), and on a level-up grow HP (Con-derived, numeric meta) + surface
    // the modest stat gain as a FEEL-WORD. Level is a plain number (meta, like turn/money). No enemy scaling.
    function awardXP(amount, why) {
      var ch = ctrl.character; if (!ch || typeof TD_STATS === "undefined" || !TD_STATS.gainXP || !(amount > 0)) return;
      var r = TD_STATS.gainXP(ch, amount);
      if (r.levels > 0) {
        ctrl.meters.hpMax += r.hpGain; ctrl.meters.hp = Math.min(ctrl.meters.hpMax, ctrl.meters.hp + r.hpGain);
        logMsg("You advance to Rank " + ch.level + "." + (r.words.length ? " " + r.words.join(" ") : ""), false);   // R5 — RANK (XP), not depth: "Level" is no longer used for the character, only the dungeon floor (Sublevel)
      }
    }
    function killXP(cr) { var ch = ctrl.character; return (typeof TD_STATS !== "undefined" && TD_STATS.XP) ? TD_STATS.XP.killXP(cr.band || 1, (ch && ch.level) || 1) : 0; }
    // GATE C — STATUS ON HIT (generic engine TD_STATUS). A struck-by foe applies the statuses its bestiary
    // tags carry: poison (DoT, antidote-curable), bleed (DoT), fear (Grit-RESISTED on application). Durations
    // are META + TUNABLE (FLAG). Telegraphed honestly (two-channel law).
    var POISON_TURNS = 5, BLEED_TURNS = 4, FEAR_TURNS = 4;
    function gritResist() { var s = ctrl.character && ctrl.character.stats; if (!s) return 0; return Math.max(0, Math.min(0.9, ((s.grit || 500) - 300) / 700)); }
    function envenom(cr) {   // (name kept for callers) — apply all of the attacker's on-hit statuses
      if (!cr || !cr.tags || typeof TD_STATUS === "undefined") return;
      var t = cr.tags, m = ctrl.meters;
      if (t.indexOf("poison") >= 0 && !TD_STATUS.has(m, "poison")) { TD_STATUS.apply(m, "poison", POISON_TURNS); senses("A cold venom spreads from the wound — you will want an antidote.", "intuition", "SUBJ"); }
      if (t.indexOf("bleed") >= 0 && !TD_STATUS.has(m, "bleed")) { TD_STATUS.apply(m, "bleed", BLEED_TURNS); senses("The cut will not close on its own; you are bleeding.", "seen", "OBJ"); }
      if (t.indexOf("fear") >= 0 && !TD_STATUS.has(m, "fear")) {
        if (rng.chance(gritResist())) senses("Dread claws at you — you set your jaw and it passes.", "intuition", "SUBJ");   // Grit RESISTS
        else { TD_STATUS.apply(m, "fear", FEAR_TURNS); senses("A wave of dread takes you; you are afraid.", "intuition", "SUBJ"); }
      }
    }
    // tick a creature's own statuses (e.g. a TROLL's regen heals it each turn until burned down).
    function tickCreatureStatuses(cr) {
      if (!cr || !cr.statuses || typeof TD_STATUS === "undefined") return;
      TD_STATUS.tick(cr, { heal: function (a) { var was = cr.hp; cr.hp = Math.min(cr.maxHp || cr.hp, cr.hp + a); if (cr.hp > was) cr._regenShown = true; } });
    }

    // body meters tick on each dungeon action (bible §4.13 anti-scum).
    // mode: "step" (walk), "fight", "rest" (wait — recovers fatigue if safe).
    // GATE 8.1: a BODY-SIZE food factor from Might+Con — big bodies burn more food, small bodies less,
    // average ~1.0 (clamped). (Same lanes that, via carry+resist, make a big body otherwise advantaged.)
    function bodyFactor() { var s = ctrl.character && ctrl.character.stats; if (!s) return 1; return Math.max(0.7, Math.min(1.3, 1 + ((s.might + s.con) / 2 - 500) / 600)); }
    function meterTick(mode, noWorld) {
      if (!inDungeon()) return;
      var m = ctrl.meters, bnd = playerBand(), bk = bnd ? bnd.band.key : "unencumbered";
      // FATIGUE: rest recovers; walking is FREE unencumbered (cost via the burden band only); fight + sprint
      // keep their costs; all gains x fatigueResist (Con/Grit/Might tire slower).
      // RE-TUNE: fighting/sprinting/encumbered-walking are the SINKS; unexerted turns (unencumbered step or
      // a safe stand with no foe adjacent) TRICKLE fatigue back, so explore-and-fight doesn't ratchet to
      // collapse — but back-to-back melee (foe adjacent) and overloaded exertion still climb toward exhaustion.
      if (mode === "fight") { m.fatigue = Math.min(m.fatigueMax, m.fatigue + FATIGUE_PER_FIGHT * fatigueResist()); }
      else if (mode === "sprint") { m.fatigue = Math.min(m.fatigueMax, m.fatigue + FATIGUE_PER_SPRINT * fatigueResist()); }
      else {
        var stepCost = (mode === "rest") ? 0 : (FATIGUE_STEP_BAND[bk] || 0);   // encumbered walk is a sink; unencumbered = 0
        if (stepCost > 0) { m.fatigue = Math.min(m.fatigueMax, m.fatigue + stepCost * fatigueResist()); }
        else {
          var rec = (mode === "rest" && !enemiesVisible()) ? REST_RECOVER : (!foeAdjacent() ? PASSIVE_RECOVER : 0);   // big rest when safe; else a passive breather unless in melee
          m.fatigue = Math.max(0, m.fatigue - rec);
        }
      }
      // HUNGER: a long, body-scaled clock — base x burden band x body-size; sprint costs a touch more food.
      var smul = SATIATION_BAND[bk] || 1;
      m.satiation = Math.max(0, m.satiation - SATIATION_PER_STEP * smul * bodyFactor() * (mode === "sprint" ? 1.4 : 1));

      // hunger-ladder transitions (announce only on the way DOWN; STARVING is critical)
      var st = hungerStage(m).stage;
      if (st !== ctrl.lastHungerStage) {
        var worse = HUNGER_LADDER.indexOf(st) > HUNGER_LADDER.indexOf(ctrl.lastHungerStage);
        if (st === "Starving") logMsg("You are STARVING. The Bureau records your dwindling with professional detachment.", true);
        else if (worse) logMsg("You grow " + st.toLowerCase() + ".", false);
        ctrl.lastHungerStage = st;
      }
      // GATE C — tick the player's STATUS EFFECTS (poison/bleed DoT, etc.) through the generic engine.
      if (typeof TD_STATUS !== "undefined") {
        var sev = TD_STATUS.tick(m, { hurt: function (a, id) { hurt(a, { name: id }); } });
        sev.forEach(function (e) { if (e.expired && !ctrl.dead) { if (e.id === "poison") senses("The venom finally burns out of your blood.", "intuition", "SUBJ"); else if (e.id === "bleed") senses("The bleeding stops.", "seen", "OBJ"); else if (e.id === "fear") senses("The dread loosens; your nerve returns.", "intuition", "SUBJ"); } });
      }
      if (hungerStage(m).critical) hurt(STARVE_HP, { name: "hunger", starve: true });

      if (m.fatigue >= m.fatigueMax) {
        if (!ctrl.wasExhausted) { logMsg("You are spent past prudence; exhaustion sets in.", true); ctrl.wasExhausted = true; }
        hurt(EXHAUST_HP, { name: "exhaustion", exhaust: true });
      } else { ctrl.wasExhausted = false; }
      updateBand(noWorld);   // encumbrance: band feel-word on crossing + tempo penalty when slow (skipped on a sprint)
    }

    function move(dir) {
      ctrl.lastEvent = null; ctrl.lastUrgent = false; ctrl.fx = [];
      if (ctrl.dead || ctrl.won || !DIRS[dir]) return { moved: false };
      // GATE C — FEAR: while afraid your step may falter (erratic), the chance reduced by Grit. The turn still
      // passes (foes act), so fear is a real cost, not a freeze. (Only ever applied by a fear-foe's hit.)
      if (typeof TD_STATUS !== "undefined" && TD_STATUS.has(ctrl.meters, "fear") && rng.chance((TD_STATUS.def("fear").flinch) * (1 - gritResist()))) {
        senses("Fear locks your legs for a beat; you do not go where you meant to.", "intuition", "SUBJ");
        endTurn("rest"); return { moved: false, flinched: true, event: ctrl.lastEvent };
      }
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
          var op = !cr.opened; cr.opened = true;                  // GATE 2: a POLEARM's reach lands an opening strike on the FIRST exchange (existing hit() hook)
          var h = TD_RESOLVE.hit(pf, cr.fighter, rng, { opening: op }); connected = h.hit;
          if (h.hit) {
            var dmg = TD_RESOLVE.damage(pf, cr.fighter, rng).damage;
            ctrl.fx.push({ x: cr.x, y: cr.y, amount: dmg, kind: "dealt", max: cr.maxHp || cr.hp });   // max -> hit-pulse band (render only)
            var blow = TD_RESOLVE.strike(cr.hp, dmg); cr.hp = blow.hp; killed = blow.killed;
            if (killed) { dropLoot(cr); removeCreature(cr); ctrl.kills += 1; logMsg("You strike " + cr.name + " from the register.", false); awardXP(killXP(cr), "kill"); }
            else logMsg("Your " + ((pf.weapon && pf.weapon.verb) || "blow") + " lands on " + cr.name + "; it still stands.", false);
          } else logMsg("You swing at " + cr.name + " and the blow goes wide.", false);
        } else {                                                  // legacy flat fallback (no stat spine / test harness)
          ctrl.fx.push({ x: cr.x, y: cr.y, amount: PLAYER_DMG, kind: "dealt", max: cr.maxHp || cr.hp });
          var fblow = TD_RESOLVE.strike(cr.hp, PLAYER_DMG); cr.hp = fblow.hp; killed = fblow.killed;
          if (killed) { dropLoot(cr); removeCreature(cr); ctrl.kills += 1; logMsg("You strike " + cr.name + " from the register.", false); awardXP(killXP(cr), "kill"); }
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
      // SG — collapsed (rubble) cells are NOT blocked: you can be overtaken / cut back through the collapse,
      // taking DEBRIS DAMAGE (sgTick), but it never hard-walls you in. (Falling behind the front = bleeding.)

      ctrl.player.x = nx; ctrl.player.y = ny;
      ctrl.pendingDoor = null; ctrl.pendingFall = null;
      if (ctrl.cellToNode && ctrl.cellToNode[key(nx, ny)]) markNodeReached(ctrl.cellToNode[key(nx, ny)]);   // CONTIGUOUS FLOORS — walked into a node's room
      reveal(nx, ny);
      var f = featureAt(nx, ny);
      if (f) {
        // GATE 5 R3 — the SLICE MILESTONE: stepping on the deep survey marker files the survey (the
        // half of the objective that needs the bottom). The rest is ascending alive to report it.
        if (f.survey && !shared.surveyed) {
          shared.surveyed = true;
          logMsg("BUREAU SURVEY FILED. Itinerary amended: ascend, and report at the surface.", false);
          senses("The marker hums under your palm; far below, something the size of the whole route shifts once, and is still.", "seen", "OBJ");
          senses("A certainty you cannot account for — this deep floor is only the porch of something much larger.", "intuition", "SUBJ");
        }
        if (f.id) ctrl.character.signalsSeen.add(f.id); if (f.kind) senses(f.text, f.kind, f.obj); else logMsg(f.text, false);
      }
      var it = itemAt(nx, ny);
      if (it) logMsg("Here lies " + it.name + ". Press g to take it.", false);
      if (onWater) logMsg("You wade in; it is slow going.", false);
      endTurn("step");
      if (onWater) endTurn("step");                      // WATER slows: the world gets an extra beat
      emitSenses(); emitSecretTells(); emitFeatureTells();
      return { moved: true, dead: ctrl.dead, feature: f || undefined, item: it || undefined, water: onWater };
    }

    // GATE 8 (B) — SPRINT: the costliest pace, always available, AIDS FLEEING. On a clear floor cell you
    // dart ahead and the world does NOT take its step this turn (you gain ground), at a high fatigue cost
    // (and a touch more hunger). Onto anything special (a foe, a door, water, a chasm, a wall) it is just a
    // normal step — you cannot sprint THROUGH the world, only across open floor.
    function sprint(dir) {
      ctrl.lastEvent = null; ctrl.lastUrgent = false; ctrl.fx = [];
      if (ctrl.dead || ctrl.won || !DIRS[dir]) return { moved: false };
      var nx = ctrl.player.x + DIRS[dir][0], ny = ctrl.player.y + DIRS[dir][1];
      var clear = inb(nx, ny) && ctrl.grid[ny] && ctrl.grid[ny][nx] === "." && !creatureAt(nx, ny) && !ctrl.doors[key(nx, ny)] && !plainAt(nx, ny) && !(ctrl.roomDoors && ctrl.roomDoors[key(nx, ny)]) && !isChasm(nx, ny) && !isWater(nx, ny);
      if (!clear) return move(dir);   // can't sprint into the world — a normal step
      ctrl.player.x = nx; ctrl.player.y = ny; ctrl.pendingDoor = null; ctrl.pendingFall = null;
      if (ctrl.cellToNode && ctrl.cellToNode[key(nx, ny)]) markNodeReached(ctrl.cellToNode[key(nx, ny)]);   // CONTIGUOUS FLOORS — sprinted into a node's room
      reveal(nx, ny);
      var f = featureAt(nx, ny);
      if (f) {
        if (f.survey && !shared.surveyed) { shared.surveyed = true; logMsg("BUREAU SURVEY FILED. Itinerary amended: ascend, and report at the surface.", false); senses("The marker hums under your palm; far below, something the size of the whole route shifts once, and is still.", "seen", "OBJ"); senses("A certainty you cannot account for — this deep floor is only the porch of something much larger.", "intuition", "SUBJ"); }
        if (f.id) ctrl.character.signalsSeen.add(f.id); if (f.kind) senses(f.text, f.kind, f.obj); else logMsg(f.text, false);
      }
      endTurn("sprint", true);   // high fatigue + hunger; the world does NOT act -> you gain a step on it
      emitSenses(); emitSecretTells(); emitFeatureTells();
      return { moved: true, sprinted: true, dead: ctrl.dead };
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
      if (it.kind === "sgart") {   // R11 — grab a SMASH-AND-GRAB artifact: records the A/B choice, forecloses the other, trips the collapse
        delete ctrl.items[k]; sgGrabArt(it); endTurn("step");
        return { got: true, artifact: true, sgId: it.sgId, choice: ctrl.sg && ctrl.sg.choice, event: ctrl.lastEvent };
      }
      delete ctrl.items[k];
      if (it.kind === "coins") {                                // coins -> the PURSE (weight -> encumbrance), never the pack
        if (!ctrl.character.purse) ctrl.character.purse = { copper: 0, silver: 0, gold: 0 };
        var den = it.den || "gold";                             // by DENOMINATION (weight is blind; value is not)
        ctrl.character.purse[den] = (ctrl.character.purse[den] || 0) + it.coins;
        logMsg("You pocket the coins; the weight settles onto you.", false);   // no number — band feel-word does the rest
        updateBand();                                           // the heavier purse may cross a band
        return { got: true, coins: true, event: ctrl.lastEvent };
      }
      if (it.kind === "weapon" || it.kind === "armor") return equipFromFloor(it);   // GATE 2: pick up = equip; old piece -> pack (weight)
      ctrl.inventory.push(it);
      logMsg("You take " + it.name + ".", false);
      return { got: true, item: it, event: ctrl.lastEvent };
    }
    // GATE 2 — equip a gear item off the floor; the displaced piece falls to the pack (its weight now
    // rides the burden band). Feel-words only: name + type-verb + weight/heft, never an integer.
    function equipFromFloor(it) {
      var ch = ctrl.character; if (!ch.equipment) ch.equipment = {}; var eq = ch.equipment, spec = it.spec;
      if (it.kind === "weapon") {
        var twoH = (spec.hands || 1) === 2;
        if (twoH) {                                                    // a 2H fills BOTH hands; displace whatever was held
          if (eq.rightHand) ctrl.inventory.push(weaponItem(eq.rightHand));
          if (eq.leftHand && eq.leftHand !== eq.rightHand) ctrl.inventory.push(weaponItem(eq.leftHand));
          eq.rightHand = spec; eq.leftHand = spec;
        } else if (eq.rightHand && eq.rightHand === eq.leftHand) {     // was holding a 2H -> pack it, take this in the right
          ctrl.inventory.push(weaponItem(eq.rightHand)); eq.leftHand = null; eq.rightHand = spec;
        } else if (!eq.rightHand) { eq.rightHand = spec; }
        else if (!eq.leftHand && (eq.rightHand.hands || 1) === 1) { eq.leftHand = spec; logMsg("You take up " + it.name + " in your off hand — two blades now.", false); updateBand(); return { got: true, equipped: true, slot: "leftHand", dual: true, item: it, event: ctrl.lastEvent }; }   // DUAL-WIELD
        else { ctrl.inventory.push(weaponItem(eq.rightHand)); eq.rightHand = spec; }
        logMsg("You take up " + it.name + "; you " + (it.verb || "strike") + " with it. It feels " + weightWord(it.weight) + ".", false);
      } else {
        var slot = spec.slot || it.slot || "body";                    // an armour piece equips to ITS OWN slot
        if (eq[slot]) ctrl.inventory.push(armorItem(eq[slot]));
        eq[slot] = spec;
        logMsg("You don " + it.name + "; it sits " + heftWord(spec) + ".", false);
      }
      updateBand();                                                    // the displaced piece may cross a band
      return { got: true, equipped: true, slot: (spec && spec.slot) || it.slot, item: it, event: ctrl.lastEvent };
    }
    // GATE 2 — re-equip a backup from the pack ('u' on a weapon/armour). Swaps with the held piece.
    function equipFromPack(it, turnCost) {
      var i = ctrl.inventory.indexOf(it); if (i < 0) return { equipped: false };
      ctrl.inventory.splice(i, 1);
      var r = equipFromFloor(it);
      // GATE 4 R3 — equipping COSTS TURNS: foes act while you fumble with straps/buckles.
      var n = Math.max(0, turnCost || 0), t0 = shared.turn;
      for (var t = 0; t < n && !ctrl.dead; t++) endTurn("rest", false);
      if (r) r.turns = shared.turn - t0;
      return r;
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

    // R7 — the stairs[] entry sitting on a cell (the live router's lookup). null for breadth/plain/connector
    // doors (which are not stairs) — those keep edge routing. Each stair carries the .dest stamped in buildView.
    function stairAt(x, y) { var s = ctrl.stairs || []; for (var i = 0; i < s.length; i++) if (s[i].x === x && s[i].y === y) return s[i]; return null; }

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
      // R7 — ROUTE THROUGH stairs[].dest: the stair under this door is the live router. Its .dest is the
      // destination ("TOWN" = the surface, a node-ref for a graph stair, the came-from node for a synthetic
      // return). The descend, ascend, and synthetic-return paths ALL resolve here. Breadth/plain/connector
      // doors are NOT stairs (stairAt -> null) and keep edge routing below; a stair with a null dest FLAGS
      // and drops to the legacy path — never strands.
      var st = stairAt(p.x, p.y);
      if (st && st.dest != null) {
        // SG — the collapse seals THE STAIRWELL (s.stairCell) it rolls toward: once sealed, that exit is shut
        // (the point of no return), whether it routes to TOWN or onward to the next sublevel. Other stairs unaffected.
        if (sgActiveFloor() && sgSealed() && ctrl.sg && ctrl.sg.stairCell && p.x === ctrl.sg.stairCell.x && p.y === ctrl.sg.stairCell.y) {
          ctrl.pendingDoor = null; logMsg("The collapse has reached the stairwell — the way out is gone. You are sealed in. (Avarice, in excess of egress.)", true); senses("Stone meets stone with a sound like a held breath let go; the last light under the stair is gone.", "heard", "OBJ"); return { opened: false, blocked: "slab", event: ctrl.lastEvent };
        }
        if (st.dest === "TOWN") {   // the WAY UP to the surface — hand back to the town controller; freeze the dive where we stand
          ctrl.pendingDoor = null; ctrl.lastEvent = null; ctrl.lastUrgent = false;
          if (sgActiveFloor() && ctrl.sg) ctrl.sg.escaped = true;   // R11 — fled with the loot before the slab; the run resolves clean
          return { opened: true, toTown: true, exited: true, to: "TOWN" };
        }
        var sFromNode = ctrl.node, sFromLevel = curLevel();
        if (st.edgeId) {            // a real graph stair: advance the interpreter (it checks takeable / requirements / completion)
          if (onCross) { var soc = onCross(d, ctrl); if (soc && soc.block) { logMsg(soc.block, false); return { opened: false, blocked: soc.block }; } }
          // CONTIGUOUS FLOORS — on a sublevel floor the stair can be taken from ANY room, so anchor the
          // interpreter at the stair-edge's `from` node before choosing (a no-op on the node-floor path,
          // where it is already the current node).
          var sed = null; (world.edges || []).forEach(function (o) { if (o.id === st.edgeId) sed = o; }); if (sed) interp.state.node = sed.from;
          var sr = interp.choose(st.edgeId);
          if (!sr.ok) { logMsg(st.reason || d.reason || "This way is barred — seek another stair; the floor has more than one way on.", false); return { opened: false, blocked: ctrl.lastEvent }; }
          if (st.oneway) { logMsg("The way seals behind you with a click. It will not open from this side.", true); senses("A click, behind and below; the way has closed.", "heard", "OBJ"); }
          else { ctrl.lastEvent = null; ctrl.lastUrgent = false; }
          ctrl.node = interp.state.node; ctrl.won = !!sr.complete;
        } else {                    // a synthetic return stair (no graph edge): set the resolved destination node directly
          interp.state.node = st.dest; ctrl.node = st.dest; ctrl.won = false; ctrl.lastEvent = null; ctrl.lastUrgent = false;
        }
        ctrl.pendingDoor = null;
        if (!shared.cameFrom) shared.cameFrom = {};
        if (ctrl.node !== sFromNode) shared.cameFrom[ctrl.node] = sFromNode;
        if (st.oneway) delete shared.cameFrom[ctrl.node];
        if (curLevel() > sFromLevel && typeof TD_STATS !== "undefined" && TD_STATS.XP) awardXP(TD_STATS.XP.descentXP(curLevel()), "descend");
        shared.deepest = Math.max(shared.deepest || 0, curLevel());
        // R6 arrival continuity — fed by the dest-resolved direction (ascend -> down-stair, descend -> up-stair)
        pendingArrival = (curLevel() < sFromLevel) ? "up" : (curLevel() > sFromLevel) ? "down" : "same";
        shared.turn += 1;
        buildView();
        return { opened: true, traversed: st.edgeId || ("stair:" + st.dest), recenter: true, won: ctrl.won, to: ctrl.node };
      }
      if (st && st.dest == null) console.warn("R7: stair at " + p.x + "," + p.y + " (node " + ctrl.node + ") has a null dest — falling back to legacy edge/return routing (FLAGGED, not stranded).");
      // --- LEGACY FALLBACK: non-stair breadth/connector doors, or a flagged null-dest stair ---
      if (d.toTown) {   // GATE 5 R2: the WAY UP to the surface — hand back to the town controller (no graph edge); freeze the dungeon where we stand so a re-descent resumes here
        ctrl.pendingDoor = null; ctrl.lastEvent = null; ctrl.lastUrgent = false;
        return { opened: true, toTown: true, exited: true, to: "TOWN" };
      }
      if (d.returnTo) {   // GATE 4 R3: a guaranteed RETURN up-stair (no graph up-edge exists) -> ascend to where we descended from
        interp.state.node = d.returnTo; ctrl.node = d.returnTo; ctrl.won = false; ctrl.pendingDoor = null;
        pendingArrival = "up";   // R6 — the return stair is always an ASCENT: arrive at the destination floor's down-stair (the cell we left by)
        ctrl.lastEvent = null; ctrl.lastUrgent = false; shared.turn += 1; buildView();
        return { opened: true, ascended: true, traversed: "return:" + d.returnTo, recenter: true, to: ctrl.node };
      }
      if (onCross) { var oc = onCross(d, ctrl); if (oc && oc.block) { logMsg(oc.block, false); return { opened: false, blocked: oc.block }; } }
      var fromNode = ctrl.node, fromLevel = curLevel();
      var r = interp.choose(d.edgeId);
      if (!r.ok) { logMsg(d.reason || "This way is barred — seek another stair; the floor has more than one way on.", false); return { opened: false, blocked: ctrl.lastEvent }; }
      if (d.type === "oneway") { logMsg("The way seals behind you with a click. It will not open from this side.", true); senses("A click, behind and below; the way has closed.", "heard", "OBJ"); }
      else { ctrl.lastEvent = null; ctrl.lastUrgent = false; }
      ctrl.node = interp.state.node; ctrl.won = !!r.complete; ctrl.pendingDoor = null;
      if (!shared.cameFrom) shared.cameFrom = {};
      // GATE 5 R2 — BREADCRUMB EVERY step (not just descents): the lattice's down-edges are directional
      // and some up-edges only pop into sealed pockets, so a descent-only trail leaves no way home from a
      // same-level spine node. Recording the way-you-came at each traversal lets the return stair chain
      // ALWAYS retrace the route to the surface (the climb-home / flee-up escape valve never breaks).
      if (ctrl.node !== fromNode) shared.cameFrom[ctrl.node] = fromNode;
      if (d.type === "oneway") delete shared.cameFrom[ctrl.node];                                     // a one-way stair clicks shut: no return
      if (curLevel() > fromLevel && typeof TD_STATS !== "undefined" && TD_STATS.XP) awardXP(TD_STATS.XP.descentXP(curLevel()), "descend");   // XP beat for reaching a new floor
      shared.deepest = Math.max(shared.deepest || 0, curLevel());   // GATE F — track the deepest floor reached (run tally)
      // R6 — record the traversed edge's direction so buildView places the arrival cell: ascending lands you
      // at the destination's down-stair (the cell you left by); descending/same keep the default arrival.
      pendingArrival = (curLevel() < fromLevel) ? "up" : (curLevel() > fromLevel) ? "down" : "same";
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

    // GATE 3 — a kill drops loot into the PROVEN economy: a reason to engage (anti-"walk-around trash"),
    // while the fight still costs time/HP (the tradeoff stays real). Mostly coin (scaled to the foe's
    // toughness); occasionally the foe's own weapon (feeds the gear loop). Numbers never surface.
    function dropLoot(cr) {
      var k = key(cr.x, cr.y);
      if (!GEAR || !isFloor(cr.x, cr.y) || ctrl.items[k]) return;
      var def = CREATURE[cr.kind] || {};
      if (def.weapon && rng.chance(0.18)) { ctrl.items[k] = weaponItem(GEAR.WEAPONS[def.weapon]); return; }   // its weapon
      var m = pickCoinDen(rng), tough = Math.max(1, (cr.maxHp || 20) / 30);   // tougher foe -> a touch more coin
      ctrl.items[k] = makeCoins(m.den, Math.round(rng.int(m.min, m.max) * tough));
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
        w: W, h: H, phase: "dungeon", featureRooms: ctrl.featureRooms || [], stairs: ctrl.stairs || [],
        floorSource: (ctrl.composition && ctrl.composition.source) || "gen2",   // SECTION D R3 — which generator made this floor (gen2 STANDARD / authored HAND-AUTHORED) — the registry swap, legible
        connectors: ctrl.connectors || [],   // SECTION D R4 — dead-end connector tiles (CSRR/CRMC/OTIS/GHOST), placement flagged-stub
        // GATE 8 (B) — the metabolism state as FEEL-WORDS (hunger/fatigue/burden BAND, no numbers) PLUS the
        // INVENTORY-WEIGHT readout (object mass IS numeric-OK): the carried total in coin-mass + a stone label,
        // a second channel that sits BESIDE the burden feel-word. Derived from the same band weight.
        metabolism: (function () { var b = playerBand(); var lb = b ? b.weight : 0; var c = (typeof TD_BURDEN !== "undefined") ? TD_BURDEN.massCoins(lb) : 0;
          return { hunger: hungerStage(ctrl.meters).stage, fatigue: fatigueStage(), burden: b ? b.band.word : "unburdened",
                   afflict: (typeof TD_STATUS !== "undefined" ? TD_STATUS.surface(ctrl.meters) : []).join(", ") || null,   // GATE C — active statuses as feel-words (poisoned/bleeding/afraid)
                   weight: { coins: c, label: (typeof TD_BURDEN !== "undefined") ? TD_BURDEN.massLabel(c) : ("" + c) } }; })(),
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
        setpiece: ctrl.composition ? (ctrl.composition.setpiece || null) : null,   // R10 R3 — set-piece marker (e.g. "smashgrab")
        // R11 — the SMASH-AND-GRAB run-state for the NORMAL renderer (no overlay): which cells have collapsed
        // (rubble), whether the clock is running / the slab has sealed, and the proximity of the edge. The
        // PRESSURE is told in the senses channel (feel-words); this is just what the renderer paints on the floor.
        sg: (sgActiveFloor() && ctrl.sg) ? { active: true, tripped: ctrl.sg.tripped, sealed: sgSealed(), escaped: ctrl.sg.escaped, choice: ctrl.sg.choice, rubble: function (x, y) { return sgRubble(x, y); }, proximity: ctrl.sg.tripped ? Math.max(0, Math.min(1, 1 - sgPlayerLead() / 8)) : 0 } : null,
        discoveries: discoveries, lastEvent: ctrl.lastEvent, lastUrgent: ctrl.lastUrgent,
        pendingDoor: ctrl.pendingDoor ? key(ctrl.pendingDoor.x, ctrl.pendingDoor.y) : null,
        // GATE 2 R2 — the equip/character readout: gear as FEEL-WORDS only (name + type-verb; armour bulk
        // as ONE dial stop Unhindered/Cushioned/Shelled/Encased). NO numbers ever surface here.
        gear: (function () {
          // GATE 7 (A): read the AGGREGATE loadout (11 slots). weapon = the wielded/effective weapon;
          // armour = one bulk feel-word over total worn robustness + the signature body piece. No numbers.
          var ch = ctrl.character, eq = ch && ch.equipment, G = (typeof TD_RESOLVE !== "undefined") ? TD_RESOLVE.GEAR : null;
          if (!eq || !G || !G.aggregate) return { weapon: null, armour: null };
          var ag = G.aggregate(eq);
          return {
            weapon: ag.weapon ? { name: ag.weapon.name, verb: ag.weapon.verb || "strike" } : null,
            armour: { name: eq.body ? eq.body.name : "unarmoured", bulk: G.bulkWord(ag.armor.robustness) }
          };
        })(),
        equipment: ctrl.character ? ctrl.character.equipment : null,   // GATE 7 (A) — raw slots, for the Phase-C paperdoll
        // GATE 4 R4 — the FLAGGED character-power surface: a feel-word for how strong the visitor has
        // grown (the canon had no power/level lane; this is a minimal composite of the combat triangle +
        // any growth-by-deeds). Lets the player read their standing against the floor's rising danger.
        // Never a number; null when no stat spine (test harness).
        power: (ctrl.character && ctrl.character.stats && typeof TD_STATS !== "undefined" && TD_STATS.powerWord) ? TD_STATS.powerWord(ctrl.character.stats, ctrl.character.progress) : null,
        // TACTICS HUD (R2) — three FEEL-WORDS, never numbers: the chosen stance, net Footing (Dex+burden+stance,
        // folded once), and armour Protection (bulkReadout). Computed from the live player fighter.
        tactics: (function () {
          var st = (typeof TD_RESOLVE !== "undefined" && TD_RESOLVE.stanceByKey) ? TD_RESOLVE.stanceByKey(ctrl.stance) : null;
          var pf = playerFighter();
          return {
            stance: st ? st.name : "Measured", readout: st ? st.readout : "",
            footing: (pf && TD_RESOLVE.footingReadout) ? TD_RESOLVE.footingReadout(pf) : null,
            protection: (pf && TD_RESOLVE.protectionReadout) ? TD_RESOLVE.protectionReadout(pf) : null
          };
        })(),
        dead: ctrl.dead, won: ctrl.won, cause: ctrl.cause
      };
    }

    // TACTICS STANCE — a FREE switch (no turn cost; foes do NOT act). Cycles the ordered stance list and
    // telegraphs the honest-trade line on the EVENT channel (always factually true). Persists via shared.
    function setStance(key) {
      if (typeof TD_RESOLVE === "undefined" || !TD_RESOLVE.STANCES) return { stance: ctrl.stance };
      var st = TD_RESOLVE.stanceByKey(key); if (!st) return { stance: ctrl.stance };
      var changed = st.key !== ctrl.stance;
      ctrl.stance = st.key; shared.stance = st.key;
      if (changed) { ctrl.lastEvent = null; ctrl.lastUrgent = false; logMsg(st.trade, false, { ch: "event" }); }   // R3 telegraph
      buildView();
      return { stance: ctrl.stance, name: st.name, free: true, changed: changed };
    }
    function cycleStance(dir) {
      if (typeof TD_RESOLVE === "undefined" || !TD_RESOLVE.STANCES) return { stance: ctrl.stance };
      var order = TD_RESOLVE.STANCES, i = TD_RESOLVE.stanceIndex(ctrl.stance);
      i = (i + (dir || 1) + order.length) % order.length;
      return setStance(order[i].key);
    }

    buildView();

    var api = {
      world: world, state: ctrl, interp: interp,
      move: move, sprint: sprint, open: openDoor, view: view, postmortem: postmortem,
      wait: wait, get: get, dropItem: dropItem, search: search, closeDoor: closeDoor, equipFromPack: equipFromPack,
      openDoorDir: openDoorDir, openDoorAuto: openDoorAuto, closeDoorDir: closeDoorDir, closeDoorAuto: closeDoorAuto,
      toggleAutoOpen: toggleAutoOpen, setAutoOpen: setAutoOpen, autoOpen: function () { return ctrl.autoOpenDoors; },
      cycleStance: cycleStance, setStance: setStance, _stance: function () { return ctrl.stance; },
      _featureRooms: function () { return ctrl.featureRooms || []; }, _emitFeatureTells: function () { emitFeatureTells(); },   // R3 test hooks
      _setPlayer: function (x, y) { ctrl.player.x = x; ctrl.player.y = y; },
      isDead: function () { return ctrl.dead; }, isComplete: function () { return ctrl.won; },
      // general host hook: append a line to the FIELD LOG (the message stream the host renders + the L review
      // log persist). Used by the play-map EMERGENCY channel so an on-screen alert always also lands in the log.
      // Appends only — does NOT touch ctrl.lastEvent (the current action's result cue stays intact).
      pushLog: function (text, urgent) { if (!text) return; ctrl.messages.push({ text: text, urgent: !!urgent, ch: "event", kind: null, obj: null }); if (ctrl.messages.length > 120) ctrl.messages.shift(); },
      // helpers for the town layer + tests
      _doors: function () { return ctrl.doors; },
      _player: function () { return ctrl.player; },
      _explored: function () { return ctrl.explored; },
      _creatures: function () { return ctrl.creatures; },
      _setCreatures: function (list) { ctrl.creatures = list.slice(); },
      _meters: function () { return ctrl.meters; },
      _meterTick: function (mode) { meterTick(mode); return ctrl.meters; },   // GATE 8 (B) test hook: run one live metabolism tick
      _fatigueResist: function () { return fatigueResist(); },
      _character: function () { return ctrl.character; },
      _band: function () { return playerBand(); },
      _playerFighter: function () { return playerFighter(); },
      _walkable: function () { return walkableCount(); },
      _spawnDensity: function () { return { creature: CREATURE_DENSITY, coin: COIN_DENSITY }; },
      _countItemKind: function (kind) { var n = 0; for (var k in ctrl.items) if (ctrl.items[k].kind === kind) n++; return n; },
      _setCoins: function (x, y, amount, den) { ctrl.items[key(x, y)] = makeCoins(den || "gold", amount); },
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
      _setGear: function (x, y, slot, gkey) { ctrl.items[key(x, y)] = (slot === "armor") ? armorItem(GEAR.ARMOR[gkey]) : weaponItem(GEAR.WEAPONS[gkey]); },
      _setWater: function (x, y) { ctrl.water[key(x, y)] = 1; ctrl.grid[y][x] = "~"; },
      _setChasm: function (x, y) { ctrl.chasm[key(x, y)] = 1; ctrl.grid[y][x] = "X"; },
      _passable: function (x, y) { return passable(x, y); },
      _composition: function () { return ctrl.composition || null; },
      _sg: function () { return ctrl.sg || null; },   // R11 — the live SMASH-AND-GRAB run-state (test/inspection hook)
      _sgRubble: function (x, y) { return sgRubble(x, y); }, _sgSealed: function () { return sgSealed(); },
      _compTally: function () { return asmTally; },
      _compose: function (nodeKey, numDoors) { return composeNode(seed, nodeKey, numDoors); },
      _levelWet: function (L) { return levelIsWet(L); },
      _rebuild: function () { buildView(); },                 // re-enter the current node (tests map memory)
      _loopEdges: function () { return ctrl.cycleEdges; },
      _glimpses: function () { return ctrl.glimpses || []; }
    };
    return api;
  }

  return {
    create: create, _W: W, _H: H, _CREATURE: CREATURE, _ITEMS: ITEMS, makeItem: makeItem, hungerStage: hungerStage,
    setLegacy: function (b) { ALLOW_LEGACY = !!b; },
    // PART A sweep hook — run the SAME live leak-gate for one seed and return {grid,up,down,_tries,_clean}.
    // Used by tests/run_leakgate.py to prove 0 leaks / single region / both stairs across seeds 1..N.
    _gen2Clean: function (seed, depth) { var r = nodeRng((seed >>> 0) || 1, "leaksweep:g2"); return gen2Clean(function () { return r.int(1, 2000000000); }, depth || 0); },
    _composeType: function (nodeType, seed) { return composeNode((seed >>> 0) || 1, "ltest" + (seed || 0), 2, 6, nodeType); },   // SECTION D — compose one floor of a given type (leak-gate test hook)
    _floorTypes: function () { return Object.keys(FLOOR_TYPES); },
    // R10 — AUTHORED-FLOOR loader + registry. composeAuthored serves/validates a hand-made floor; registerAuthored
    // adds a level to the table a HAND-AUTHORED node resolves via its `authored` ref. Exposed for tests + content wiring.
    composeAuthored: function (levelData) { return composeAuthored(levelData); },
    registerAuthored: function (level) { return registerAuthored(level); },
    authoredLevel: function (id) { return AUTHORED_LEVELS[id] || null; },
    // CONTIGUOUS FLOORS (Model A) Phase 1 — the offline sublevel composer + a reachability probe (test hooks).
    composeSublevel: function (seed, level, nodes, edges, nodeLevel) { return composeSublevel(seed, level, nodes, edges, nodeLevel); },
    _reachSet: function (grid, ox, oy) { return sgReachSet(grid, ox, oy); },
    _gen2Opts: GEN2_OPTS,
    // live spawn densities + coin denomination mix — the SINGLE SOURCE the balance sim reads (no re-hardcoding).
    CREATURE_DENSITY: CREATURE_DENSITY, COIN_DENSITY: COIN_DENSITY, COIN_MIX: COIN_MIX
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_MAP; }
