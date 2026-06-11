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
      creatures: [], explored: null,
      dead: false, won: false, cause: null, lastEvent: null, lastUrgent: false,
      meters: shared.meters || { hp: 100, hpMax: 100, fatigue: 0, fatigueMax: 100, satiation: 100, satiationMax: 100, comfort: 0 },
      character: shared.character || { ticket: null, signalsSeen: new Set() },
      inventory: shared.inventory || (shared.inventory = []),
      messages: shared.messages || (shared.messages = []),
      kills: 0, lastHungerStage: "well fed", wasExhausted: false
    };
    // the turn counter lives on the shared object so town + dungeon agree on it.
    if (typeof shared.turn !== "number") shared.turn = 0;
    var decorate = opts.decorate || null;   // town layer places signals / marks brass
    var onCross = opts.onCross || null;      // town layer gates a door (e.g. Brass Door)

    function curLevel() { return (world.nodes[ctrl.node] || {}).level || 0; }
    function inDungeon() { return curLevel() >= 1; }

    function logMsg(t, urgent) { if (!t) return; ctrl.lastEvent = t; ctrl.lastUrgent = !!urgent; ctrl.messages.push({ text: t, urgent: !!urgent }); if (ctrl.messages.length > 80) ctrl.messages.shift(); }

    function reveal(px, py) {
      for (var dy = -REVEAL; dy <= REVEAL; dy++)
        for (var dx = -REVEAL; dx <= REVEAL; dx++) { var x = px + dx, y = py + dy; if (inb(x, y)) ctrl.explored.add(key(x, y)); }
    }

    function buildView() {
      var g = newGrid();
      carveRect(g, CX, CY, 4, 3);
      var doors = {};
      var v = interp.view();
      var cl = curLevel();
      v.options.forEach(function (o, i) {
        if (i >= SLOTS.length) return;
        var s = SLOTS[i];
        g[s.mouth[1]][s.mouth[0]] = ".";
        carveRect(g, s.room[0], s.room[1], 2, 1);
        carvePath(g, s.mouth[0], s.mouth[1], s.door[0], s.door[1]);
        var toLevel = (world.nodes[o.to] || {}).level;
        var type = (typeof toLevel === "number" && toLevel < cl) ? "stair_up"
          : (typeof toLevel === "number" && toLevel > cl) ? "stair_down"
            : (o.one_way ? "oneway" : "door");
        doors[key(s.door[0], s.door[1])] = {
          edgeId: o.id, type: type, takeable: o.takeable, reason: o.reason,
          one_way: o.one_way, to: o.to, label: o.label, tells: o.tells || []
        };
      });
      ctrl.grid = g; ctrl.doors = doors; ctrl.features = {};
      ctrl.items = {}; ctrl.plain = {}; ctrl.secrets = {};
      ctrl.player = { x: CX, y: CY };
      ctrl.explored = new Set(); reveal(CX, CY);
      ctrl.pendingDoor = null;
      if (inDungeon()) {
        // floor loot near the arrival point (deterministic, reachable). Tiles are
        // chosen off the x=20 column and y=11 row that the core tests walk.
        tryItem(CX - 2, CY - 1, "ration");
        tryItem(CX + 2, CY + 1, "bandage");
        tryItem(CX - 3, CY + 2, "souvenir");   // off the plaque tile the town layer marks (CX-3,CY-2)
        // a plain inner door (a chokepoint you can shut behind you) and a hidden
        // pocket in the wall above it, found only by searching.
        addPlain(18, 9);
        addSecret(18, 7, "ration");
      }
      spawnCreatures();
      if (decorate) decorate(ctrl, { CX: CX, CY: CY, key: key, isFloor: isFloor });
    }
    function tryItem(x, y, kind) { if (isFloor(x, y) && !(x === ctrl.player.x && y === ctrl.player.y)) ctrl.items[key(x, y)] = makeItem(kind); }
    function addPlain(x, y) { if (isFloor(x, y)) ctrl.plain[key(x, y)] = { open: false }; }
    function addSecret(x, y, kind) { if (inb(x, y) && ctrl.grid[y][x] === "#") ctrl.secrets[key(x, y)] = { kind: kind, found: false }; }

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
      var cand = [];
      for (var y = CY - 3; y <= CY + 3; y++) for (var x = CX - 4; x <= CX + 4; x++)
        if (passable(x, y) && !creatureAt(x, y) && !itemAt(x, y) && (Math.abs(x - ctrl.player.x) + Math.abs(y - ctrl.player.y)) >= 4) cand.push({ x: x, y: y });
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
      ctrl.lastEvent = null; ctrl.lastUrgent = false;
      if (ctrl.dead || ctrl.won || !DIRS[dir]) return { moved: false };
      var nx = ctrl.player.x + DIRS[dir][0], ny = ctrl.player.y + DIRS[dir][1];
      if (!inb(nx, ny)) return { moved: false };

      // bump-to-fight (narrated in the Bureau register). You strike; the creature
      // (if it lives) replies on its own turn during creaturesStep — one blow each.
      var cr = creatureAt(nx, ny);
      if (cr) {
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

      if (ctrl.grid[ny][nx] !== ".") return { moved: false };

      ctrl.player.x = nx; ctrl.player.y = ny;
      ctrl.pendingDoor = null;
      reveal(nx, ny);
      var f = featureAt(nx, ny);
      if (f) { if (f.id) ctrl.character.signalsSeen.add(f.id); logMsg(f.text, false); }
      var it = itemAt(nx, ny);
      if (it) logMsg("Here lies " + it.name + ". Press g to take it.", false);
      endTurn("step");
      return { moved: true, dead: ctrl.dead, feature: f || undefined, item: it || undefined };
    }

    // wait a turn: the world acts, you do not move. With no enemy in sight this
    // is a rest — fatigue ebbs back (ADOM's '5'/'.').
    function wait() {
      ctrl.lastEvent = null; ctrl.lastUrgent = false;
      if (ctrl.dead || ctrl.won) return { waited: false };
      logMsg(enemiesVisible() ? "You hold still, watching the dark move." : "You rest a moment; the ache in your legs eases.", false);
      endTurn("rest");
      return { waited: true, rested: !enemiesVisible(), dead: ctrl.dead };
    }

    // pick up the item under your feet.
    function get() {
      ctrl.lastEvent = null; ctrl.lastUrgent = false;
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
      ctrl.lastEvent = null; ctrl.lastUrgent = false;
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
      if (found.length) logMsg("Your fingers find a seam — a hidden pocket gives way.", false);
      else logMsg("You run your hands over the nearby stone and find nothing.", false);
      endTurn("step");
      return { searched: true, found: found.length, event: ctrl.lastEvent };
    }

    // close an adjacent open plain door (so a creature cannot follow).
    function closeDoor() {
      ctrl.lastEvent = null; ctrl.lastUrgent = false;
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
    function openDoor() {
      if (ctrl.dead || ctrl.won) return { opened: false };
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
      if (d.type === "oneway") logMsg("The way seals behind you with a click. It will not open from this side.", true);
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
      _addSecret: function (x, y, kind) { addSecret(x, y, kind); },
      _addPlain: function (x, y) { ctrl.plain[key(x, y)] = { open: false }; },
      _setItem: function (x, y, kind) { ctrl.items[key(x, y)] = makeItem(kind); },
      _passable: function (x, y) { return passable(x, y); }
    };
    return api;
  }

  return { create: create, _W: W, _H: H, _CREATURE: CREATURE, _ITEMS: ITEMS, makeItem: makeItem, hungerStage: hungerStage };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_MAP; }
