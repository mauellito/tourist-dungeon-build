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
  var W = 41, H = 23, CX = 20, CY = 11;
  var REVEAL = 4;

  var SLOTS = [
    { mouth: [20, 7],  door: [20, 5],  room: [20, 3] },   // N
    { mouth: [20, 15], door: [20, 17], room: [20, 19] },  // S
    { mouth: [25, 11], door: [28, 11], room: [31, 11] },  // E
    { mouth: [15, 11], door: [12, 11], room: [9, 11] },   // W
    { mouth: [24, 7],  door: [28, 6],  room: [31, 4] },   // NE
    { mouth: [16, 7],  door: [12, 6],  room: [9, 4] },    // NW
    { mouth: [24, 15], door: [28, 16], room: [31, 18] },  // SE
    { mouth: [16, 15], door: [12, 16], room: [9, 18] }    // SW
  ];
  var DIRS = {
    up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
    ul: [-1, -1], ur: [1, -1], dl: [-1, 1], dr: [1, 1]
  };
  var STEP4 = ["up", "down", "left", "right"];

  // --- living-systems tuning (bible §4.13/§4.15 calibration) ----------------
  var PLAYER_DMG = 20;
  // three distinct simple behaviours: wanderer (drifts, occasionally toward you),
  // lurker (still until you come close, then hunts), chaser (relentless pursuit).
  var CREATURE = {
    wanderer: { hp: 30, dmg: 8,  name: "a shuffling nocent thing", glyph: "r" },
    lurker:   { hp: 45, dmg: 16, name: "a patient lurker",         glyph: "L" },
    chaser:   { hp: 26, dmg: 11, name: "a fervent docent",         glyph: "d" }
  };
  // generous slack: walking is cheap, fighting costs, resting recovers fatigue,
  // and a full belly carries you across several levels before food matters.
  var FATIGUE_PER_STEP = 0.5, FATIGUE_PER_FIGHT = 6, REST_RECOVER = 4;
  var SATIATION_PER_STEP = 0.3, STARVE_HP = 2, EXHAUST_HP = 1;
  var FALL_DMG = 25;   // the chasm exit: a desperate fall to the level below
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
  // ROOM GEOMETRY (v18 R1) — CONSTRUCTION LAW: dungeon rooms are CARVED VARIED.
  // Per node, deterministically (seed + nodeKey), compose 1-3 rooms of varied
  // shape/size, placed OFF-CENTRE, joined by corridors of varied length/width,
  // with doors radiating on varied stubs and (in big rooms) interior pillars.
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
  // carve the MAIN room of a chosen shape; returns its cells + centre + shape tag
  function carveMainRoom(g, R) {
    var M = 2, shape = R.pick(["rect", "rect", "rect", "grand", "L", "cross", "cavern", "cavern", "cramped"]);
    var cx, cy;
    if (shape === "cramped") {
      var w = R.int(1, 1), h = R.int(1, 1);
      cx = clampi(CX + R.int(-13, 13), M + 1, W - 2 - M); cy = clampi(CY + R.int(-7, 7), M + 1, H - 2 - M);
      carveBox(g, cx - w, cy - h, cx + w, cy + h);
    } else if (shape === "grand") {
      var ghw = R.int(7, 11), ghh = R.int(4, 6);
      cx = clampi(CX + R.int(-6, 6), M + ghw, W - 1 - M - ghw); cy = clampi(CY + R.int(-3, 3), M + ghh, H - 1 - M - ghh);
      carveBox(g, cx - ghw, cy - ghh, cx + ghw, cy + ghh);
    } else if (shape === "rect") {
      var hw = R.int(2, 7), hh = R.int(1, 4);
      cx = clampi(CX + R.int(-11, 11), M + hw, W - 1 - M - hw); cy = clampi(CY + R.int(-6, 6), M + hh, H - 1 - M - hh);
      carveBox(g, cx - hw, cy - hh, cx + hw, cy + hh);
    } else if (shape === "L") {
      var lhw = R.int(3, 6), lhh = R.int(2, 4);
      cx = clampi(CX + R.int(-9, 9), M + lhw, W - 1 - M - lhw); cy = clampi(CY + R.int(-5, 5), M + lhh, H - 1 - M - lhh);
      carveBox(g, cx - lhw, cy - lhh, cx + lhw, cy + lhh);
      var ahw = R.int(2, 4), ahh = R.int(2, 4), sx = R.chance(0.5) ? cx - lhw : cx + lhw, sy = R.chance(0.5) ? cy - lhh : cy + lhh;
      var ax = clampi(sx, M + ahw, W - 1 - M - ahw), ay = clampi(sy, M + ahh, H - 1 - M - ahh);
      carveBox(g, ax - ahw, ay - ahh, ax + ahw, ay + ahh);
    } else if (shape === "cross") {
      var xhw = R.int(4, 8), xhh = R.int(3, 5), aw = R.int(1, 2);
      cx = clampi(CX + R.int(-7, 7), M + xhw, W - 1 - M - xhw); cy = clampi(CY + R.int(-4, 4), M + xhh, H - 1 - M - xhh);
      carveBox(g, cx - xhw, cy - aw, cx + xhw, cy + aw); carveBox(g, cx - aw, cy - xhh, cx + aw, cy + xhh);
    } else {   // cavern — a drunkard's-walk blob
      cx = clampi(CX + R.int(-10, 10), 4, W - 5); cy = clampi(CY + R.int(-5, 5), 3, H - 4);
      var steps = R.int(40, 140), x = cx, y = cy;
      for (var s = 0; s < steps; s++) { g[y][x] = "."; var d = R.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]); x = clampi(x + d[0], 2, W - 3); y = clampi(y + d[1], 2, H - 3); }
    }
    return { cells: floorCells(g), cx: cx, cy: cy, tag: shape };
  }
  // place numDoors door tiles on varied outward stubs off the room (all reachable)
  function placeDoors(g, mainCells, numDoors, R) {
    var DS = [[0, -1], [0, 1], [-1, 0], [1, 0]], cands = [];
    mainCells.forEach(function (c) { DS.forEach(function (d) { var wx = c[0] + d[0], wy = c[1] + d[1]; if (inb(wx, wy) && g[wy][wx] === "#") cands.push({ fx: c[0], fy: c[1], dx: d[0], dy: d[1] }); }); });
    for (var i = cands.length - 1; i > 0; i--) { var j = R.int(0, i), t = cands[i]; cands[i] = cands[j]; cands[j] = t; }
    var doors = [], used = {}, lens = [], widths = [];
    function tryAt(cd, maxLen) {
      var len = R.int(0, maxLen), x = cd.fx, y = cd.fy, w = (R.chance(0.25) ? 2 : 1), path = [];
      for (var k = 0; k <= len; k++) { var nx = x + cd.dx, ny = y + cd.dy; if (nx < 2 || ny < 2 || nx > W - 3 || ny > H - 3) break; x = nx; y = ny; path.push([x, y]); }
      if (!path.length) return false;
      var dpt = path[path.length - 1], dk = dpt[0] + "," + dpt[1];
      if (used[dk]) return false;
      path.forEach(function (pp) { g[pp[1]][pp[0]] = "."; if (w === 2) { var px = cd.dx ? pp[0] : pp[0] + 1, py = cd.dx ? pp[1] + 1 : pp[1]; if (inb(px, py)) g[py][px] = "."; } });
      used[dk] = 1; doors.push({ x: dpt[0], y: dpt[1] }); lens.push(path.length); widths.push(w); return true;
    }
    for (var ci = 0; ci < cands.length && doors.length < numDoors; ci++) tryAt(cands[ci], 5);
    // fallback: guarantee numDoors — short stubs on any remaining edge wall
    for (var ci2 = 0; ci2 < cands.length && doors.length < numDoors; ci2++) tryAt(cands[ci2], 0);
    return { doors: doors, lens: lens, widths: widths };
  }
  function pokePillars(g, cells, R) {
    var n = R.int(1, 4);
    for (var i = 0; i < n; i++) {
      var c = cells[R.int(0, cells.length - 1)], x = c[0], y = c[1];
      if (inb(x - 1, y) && inb(x + 1, y) && inb(x, y - 1) && inb(x, y + 1) && g[y - 1][x] === "." && g[y + 1][x] === "." && g[y][x - 1] === "." && g[y][x + 1] === ".") g[y][x] = "#";
    }
  }
  // compose a node's full walkable screen (deterministic per seed+node)
  function composeNode(seed, nodeKey, numDoors) {
    var R = nodeRng(seed, nodeKey), g = newGrid();
    var main = carveMainRoom(g, R);
    var spawn = { x: main.cx, y: main.cy };
    if (g[spawn.y][spawn.x] !== ".") { var fc = main.cells[0]; spawn = { x: fc[0], y: fc[1] }; }
    var corrLens = [], corrWidths = [], rooms = 1;
    var nExtra = R.int(0, 2);
    for (var e = 0; e < nExtra; e++) {
      var w = R.int(1, 3), h = R.int(1, 2);
      var ex = clampi(CX + R.int(-15, 15), 3 + w, W - 4 - w), ey = clampi(CY + R.int(-8, 8), 2 + h, H - 3 - h);
      carveBox(g, ex - w, ey - h, ex + w, ey + h);
      var cw = R.chance(0.25) ? 2 : 1; carveCorridor(g, ex, ey, main.cx, main.cy, cw, R);
      corrLens.push(Math.abs(ex - main.cx) + Math.abs(ey - main.cy)); corrWidths.push(cw); rooms++;
    }
    if (main.cells.length > 60) pokePillars(g, main.cells, R);
    var dd = placeDoors(g, floorCells(g), numDoors, R);
    dd.lens.forEach(function (l) { corrLens.push(l); }); dd.widths.forEach(function (w) { corrWidths.push(w); });
    // reachability guarantee: spawn must reach every door
    var seen = {}, q = [[spawn.x, spawn.y]]; seen[spawn.x + "," + spawn.y] = 1;
    while (q.length) { var c = q.shift(); DIRS4(c[0], c[1]).forEach(function (n) { if (g[n[1]] && g[n[1]][n[0]] === "." && !seen[n[0] + "," + n[1]]) { seen[n[0] + "," + n[1]] = 1; q.push([n[0], n[1]]); } }); }
    dd.doors.forEach(function (d) { if (!seen[d.x + "," + d.y]) carveCorridor(g, d.x, d.y, spawn.x, spawn.y, 1, R); });
    // measured main-room footprint signature
    var mc = main.cells, minx = 99, maxx = -1, miny = 99, maxy = -1, sx = 0, sy = 0;
    mc.forEach(function (c) { if (c[0] < minx) minx = c[0]; if (c[0] > maxx) maxx = c[0]; if (c[1] < miny) miny = c[1]; if (c[1] > maxy) maxy = c[1]; sx += c[0]; sy += c[1]; });
    var bw = maxx - minx + 1, bh = maxy - miny + 1, area = mc.length;
    var all = floorCells(g), ax = 0, ay = 0; all.forEach(function (c) { ax += c[0]; ay += c[1]; });
    return {
      grid: g, spawn: spawn, doorPts: dd.doors, tag: main.tag, rooms: rooms,
      mainArea: area, mainFill: area / (bw * bh), mainAspect: bw / bh,
      comX: ax / all.length, comY: ay / all.length, corrLens: corrLens, corrWidths: corrWidths
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
      items: {}, plain: {}, secrets: {},
      creatures: [], explored: null, fx: [],
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
    var decorate = opts.decorate || null;   // town layer places signals / marks brass
    var onCross = opts.onCross || null;      // town layer gates a door (e.g. Brass Door)

    function curLevel() { return (world.nodes[ctrl.node] || {}).level || 0; }
    function inDungeon() { return curLevel() >= 1; }

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

    function reveal(px, py) {
      for (var dy = -REVEAL; dy <= REVEAL; dy++)
        for (var dx = -REVEAL; dx <= REVEAL; dx++) { var x = px + dx, y = py + dy; if (inb(x, y)) ctrl.explored.add(key(x, y)); }
    }

    function buildView() {
      ctrl.water = {}; ctrl.chasm = {}; ctrl.pendingFall = null; ctrl.sensedSecret = {};
      var meta = world.nodes[ctrl.node] || {};
      var vd = (typeof TD_VAULTS !== "undefined" && meta.vault) ? TD_VAULTS.byId(meta.vault) : null;
      if (vd) { buildVaultView(vd); return; }
      var v = interp.view();
      var cl = curLevel();
      var comp = composeNode(seed, ctrl.node, v.options.length);
      var g = comp.grid, doors = {};
      v.options.forEach(function (o, i) {
        var dp = comp.doorPts[i]; if (!dp) return;
        var toLevel = (world.nodes[o.to] || {}).level;
        var type = (typeof toLevel === "number" && toLevel < cl) ? "stair_up"
          : (typeof toLevel === "number" && toLevel > cl) ? "stair_down"
            : (o.one_way ? "oneway" : "door");
        doors[key(dp.x, dp.y)] = {
          edgeId: o.id, type: type, takeable: o.takeable, reason: o.reason,
          one_way: o.one_way, to: o.to, label: o.label, tells: o.tells || []
        };
      });
      ctrl.grid = g; ctrl.doors = doors; ctrl.features = {};
      ctrl.items = {}; ctrl.plain = {}; ctrl.secrets = {};
      ctrl.player = { x: comp.spawn.x, y: comp.spawn.y };
      ctrl.composition = comp;
      ctrl.explored = new Set(); reveal(comp.spawn.x, comp.spawn.y);
      ctrl.pendingDoor = null;
      placeTerrain(comp);
      if (inDungeon()) placeDefaults(comp);
      placeGlimpses();
      spawnCreatures();
      if (decorate) decorate(ctrl, { CX: comp.spawn.x, CY: comp.spawn.y, key: key, isFloor: isFloor });
    }
    // adaptive contents for a varied screen: loot on reachable floor + one
    // telegraphed secret in a wall (secret density rises in v18 R4).
    function placeDefaults(comp) {
      var g = comp.grid, sp = comp.spawn, R = nodeRng(seed, ctrl.node + ":fill");
      var floors = floorCells(g).filter(function (c) { return !(c[0] === sp.x && c[1] === sp.y) && !ctrl.doors[key(c[0], c[1])]; });
      var kinds = ["ration", "bandage", "souvenir"];
      for (var i = 0; i < 3 && floors.length; i++) { var f = floors[R.int(0, floors.length - 1)]; tryItem(f[0], f[1], kinds[i]); }
      // v18 R4 (outcome #5): secrets at LEARNABLE density. Several hidden pockets
      // per room, each in a wall and each telegraphed by a fixed tell (Secret
      // Grammar Law), spaced apart so they read as distinct, and CYCLING the
      // vocabulary from a per-room offset so across a few rooms the player meets
      // all three tells (draft / rhyme / hollow) and learns the language.
      var TELLV = ["draft", "rhyme", "hollow"], want = R.int(2, 3), placedS = [], off = R.int(0, 2);
      for (var fj = 0; fj < floors.length && placedS.length < want; fj++) {
        var x = floors[fj][0], y = floors[fj][1], ds = DIRS4(x, y), wn = null;
        for (var k = 0; k < ds.length; k++) { var wx = ds[k][0], wy = ds[k][1]; if (inb(wx, wy) && g[wy][wx] === "#" && !ctrl.secrets[key(wx, wy)]) { wn = [wx, wy]; break; } }
        if (!wn) continue;
        var tooClose = placedS.some(function (p) { return Math.max(Math.abs(p[0] - wn[0]), Math.abs(p[1] - wn[1])) < 4; });
        if (tooClose) continue;
        addSecret(wn[0], wn[1], R.pick(kinds), TELLV[(off + placedS.length) % 3]);
        placedS.push(wn);
      }
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
      if (!inDungeon()) return;
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
      ctrl.grid = g; ctrl.doors = doors; ctrl.features = {}; ctrl.items = {}; ctrl.plain = {}; ctrl.secrets = {};
      ctrl.player = entry || { x: ox + (W0 >> 1), y: oy + (H0 >> 1) };
      ctrl.explored = new Set(); reveal(ctrl.player.x, ctrl.player.y); ctrl.pendingDoor = null;
      (vd.features || []).forEach(function (f) { ctrl.features[key(ox + f.x, oy + f.y)] = { glyph: f.glyph || "¶", channel: f.channel, kind: f.kind, obj: f.obj, text: f.text, label: "a notice" }; });
      (vd.items || []).forEach(function (it) { var iy = oy + it.y, ix = ox + it.x; if (g[iy] && g[iy][ix] === ".") ctrl.items[key(ix, iy)] = makeItem(it.kind); });
      if (vd.secret) ctrl.secrets[key(ox + vd.secret.x, oy + vd.secret.y)] = { kind: vd.secret.kind, found: false, tell: vd.secret.tell || "hollow" };
      placeGlimpses();
      ctrl.creatures = [];
      if (livingOn && inDungeon()) (vd.creatures || []).forEach(function (c) {
        var def = CREATURE[c.kind]; if (!def) return;
        ctrl.creatures.push({ x: ox + c.x, y: oy + c.y, kind: c.kind, hp: def.hp, maxHp: def.hp, dmg: def.dmg, name: def.name, glyph: def.glyph });
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

    function spawnCreatures() {
      ctrl.creatures = [];
      if (!livingOn || !inDungeon()) return;
      var n = rng.int(1, 2);
      var kinds = ["wanderer", "lurker", "chaser"];
      for (var c = 0; c < n; c++) {
        var kind = kinds[rng.int(0, kinds.length - 1)];
        var spot = pickSpot();
        if (!spot) continue;
        var def = CREATURE[kind];
        ctrl.creatures.push({ x: spot.x, y: spot.y, kind: kind, hp: def.hp, maxHp: def.hp, dmg: def.dmg, name: def.name, glyph: def.glyph });
      }
    }
    function pickSpot() {
      var cand = [], px = ctrl.player.x, py = ctrl.player.y;
      for (var y = py - 5; y <= py + 5; y++) for (var x = px - 6; x <= px + 6; x++)
        if (passable(x, y) && !creatureAt(x, y) && !itemAt(x, y) && (Math.abs(x - px) + Math.abs(y - py)) >= 4) cand.push({ x: x, y: y });
      if (!cand.length) return null;
      return cand[Math.floor(rng.next() * cand.length)];
    }

    function visibleSet() {
      var s = new Set();
      for (var dy = -REVEAL; dy <= REVEAL; dy++) for (var dx = -REVEAL; dx <= REVEAL; dx++) { var x = ctrl.player.x + dx, y = ctrl.player.y + dy; if (inb(x, y)) s.add(key(x, y)); }
      return s;
    }
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
            ctrl.fx.push({ x: ctrl.player.x, y: ctrl.player.y, amount: cr.dmg, kind: "taken" });
            hurt(cr.dmg, cr);
            if (!ctrl.dead) logMsg(cap(cr.name) + " amends your itinerary by " + cr.dmg + " hit points.", lowHP());
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

    function lowHP() { return ctrl.meters.hp > 0 && ctrl.meters.hp < 0.25 * ctrl.meters.hpMax; }
    function hurt(amount, source) {
      ctrl.meters.hp -= amount;
      if (ctrl.meters.hp <= 0) { ctrl.meters.hp = 0; die(combatCause(source)); }
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
    }

    function move(dir) {
      ctrl.lastEvent = null; ctrl.lastUrgent = false; ctrl.fx = [];
      if (ctrl.dead || ctrl.won || !DIRS[dir]) return { moved: false };
      var nx = ctrl.player.x + DIRS[dir][0], ny = ctrl.player.y + DIRS[dir][1];
      if (!inb(nx, ny)) return { moved: false };

      // bump-to-fight (narrated in the Bureau register). You strike; the creature
      // (if it lives) replies on its own turn during creaturesStep — one blow each.
      var cr = creatureAt(nx, ny);
      if (cr) {
        ctrl.fx.push({ x: cr.x, y: cr.y, amount: PLAYER_DMG, kind: "dealt" });
        cr.hp -= PLAYER_DMG;
        var killed = cr.hp <= 0;
        if (killed) { removeCreature(cr); ctrl.kills += 1; logMsg("You strike " + cr.name + " from the register.", false); }
        else logMsg("You serve " + cr.name + " notice (" + PLAYER_DMG + " hp; " + cr.hp + "/" + cr.maxHp + " stands).", false);
        meterTick("fight");
        if (!ctrl.dead) creaturesStep();
        shared.turn += 1;
        return { moved: false, attacked: true, killed: killed, event: ctrl.lastEvent, dead: ctrl.dead };
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

      // a plain inner door: if shut, it blocks (bump reveals, o/Enter opens); if
      // open you walk through it.
      var pd = plainAt(nx, ny);
      if (pd && !pd.open) {
        ctrl.pendingDoor = { plain: true, x: nx, y: ny };
        logMsg("A plain inner door, shut. Press o (or Enter) to open it.", false);
        return { moved: false, bumpedDoor: true, plain: true, event: ctrl.lastEvent };
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

    // close an adjacent open plain door (so a creature cannot follow).
    function closeDoor() {
      ctrl.lastEvent = null; ctrl.lastUrgent = false; ctrl.fx = [];
      if (ctrl.dead || ctrl.won) return { closed: false };
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        var x = ctrl.player.x + dx, y = ctrl.player.y + dy, p = plainAt(x, y);
        if (p && p.open && !creatureAt(x, y)) { p.open = false; logMsg("You pull the inner door shut.", false); endTurn("step"); return { closed: true, event: ctrl.lastEvent }; }
      }
      logMsg("There is no open door beside you to close.", false);
      return { closed: false, event: ctrl.lastEvent };
    }

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
      ctrl.meters.hp = Math.max(0, ctrl.meters.hp - FALL_DMG);
      logMsg("You throw yourself into the dark and land badly (−" + FALL_DMG + ").", true);
      senses("Wind, then floor; the level above closes overhead.", "heard", "OBJ");
      if (ctrl.meters.hp <= 0) { die("The visitor took the chasm for an exit; the chasm took the visitor."); return { fell: true, dead: true }; }
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
      isDead: function () { return ctrl.dead; }, isComplete: function () { return ctrl.won; },
      // helpers for the town layer + tests
      _doors: function () { return ctrl.doors; },
      _player: function () { return ctrl.player; },
      _explored: function () { return ctrl.explored; },
      _creatures: function () { return ctrl.creatures; },
      _setCreatures: function (list) { ctrl.creatures = list.slice(); },
      _meters: function () { return ctrl.meters; },
      _character: function () { return ctrl.character; },
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
      _compose: function (nodeKey, numDoors) { return composeNode(seed, nodeKey, numDoors); },
      _loopEdges: function () { return ctrl.cycleEdges; },
      _glimpses: function () { return ctrl.glimpses || []; }
    };
    return api;
  }

  return { create: create, _W: W, _H: H, _CREATURE: CREATURE, _ITEMS: ITEMS, makeItem: makeItem, hungerStage: hungerStage };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_MAP; }
