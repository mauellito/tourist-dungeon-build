// Tourist Dungeon engine — VISUAL MAP MODE + first living systems.
// A view/play layer over the engine: it draws a 2D tile view, moves a tile
// avatar, and crosses a door ONLY by asking the interpreter (TD_INTERP) — so
// generation and the checker stay untouched. On top of that it adds the living
// systems (creatures + bump-to-fight combat, body meters). Town, the two forks,
// and signal placement live in mapmode-town.js, layered on the same controller.
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
  var CARDINAL = ["up", "down", "left", "right"];

  // --- living-systems tuning (skeleton; bible §4.13/§4.15 calibration later) --
  var PLAYER_DMG = 20;
  var CREATURE = {
    wanderer: { hp: 30, dmg: 8,  name: "a shuffling nocent thing", glyph: "r" },
    lurker:   { hp: 45, dmg: 16, name: "a patient lurker",         glyph: "L" }
  };
  var FATIGUE_PER_STEP = 2, FATIGUE_PER_FIGHT = 6;
  var SATIATION_PER_STEP = 1.5, STARVE_HP = 2, EXHAUST_HP = 1;

  function key(x, y) { return x + "," + y; }
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
      creatures: [], explored: null, log: [],
      dead: false, won: false, cause: null, lastEvent: null,
      meters: shared.meters || { hp: 100, hpMax: 100, fatigue: 0, fatigueMax: 100, satiation: 100, satiationMax: 100, comfort: 0 },
      character: shared.character || { ticket: null, signalsSeen: new Set() },
      kills: 0
    };
    var decorate = opts.decorate || null;   // town layer places signals / marks brass
    var onCross = opts.onCross || null;      // town layer gates a door (e.g. Brass Door)

    function curLevel() { return (world.nodes[ctrl.node] || {}).level || 0; }
    function inDungeon() { return curLevel() >= 1; }

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
      ctrl.player = { x: CX, y: CY };
      ctrl.explored = new Set(); reveal(CX, CY);
      spawnCreatures();
      if (decorate) decorate(ctrl, { CX: CX, CY: CY, key: key, isFloor: isFloor });
    }
    // a signal object dropped on a floor tile by the town layer (plaque, draft)
    function featureAt(x, y) { return ctrl.features[key(x, y)] || null; }

    function isFloor(x, y) { return inb(x, y) && ctrl.grid[y][x] === "." && !ctrl.doors[key(x, y)]; }
    function creatureAt(x, y) { for (var i = 0; i < ctrl.creatures.length; i++) if (ctrl.creatures[i].x === x && ctrl.creatures[i].y === y) return ctrl.creatures[i]; return null; }

    function spawnCreatures() {
      ctrl.creatures = [];
      if (!livingOn || !inDungeon()) return;
      var n = rng.int(1, 2);
      for (var c = 0; c < n; c++) {
        var kind = rng.chance(0.5) ? "lurker" : "wanderer";
        var spot = pickSpot();
        if (!spot) continue;
        var def = CREATURE[kind];
        ctrl.creatures.push({ x: spot.x, y: spot.y, kind: kind, hp: def.hp, maxHp: def.hp, dmg: def.dmg, name: def.name, glyph: def.glyph });
      }
    }
    function pickSpot() {
      var cand = [];
      for (var y = CY - 3; y <= CY + 3; y++) for (var x = CX - 4; x <= CX + 4; x++)
        if (isFloor(x, y) && !creatureAt(x, y) && (Math.abs(x - ctrl.player.x) + Math.abs(y - ctrl.player.y)) >= 4) cand.push({ x: x, y: y });
      if (!cand.length) return null;
      return cand[Math.floor(rng.next() * cand.length)];
    }

    function creaturesStep() {
      ctrl.creatures.forEach(function (cr) {
        var dist = Math.abs(cr.x - ctrl.player.x) + Math.abs(cr.y - ctrl.player.y);
        var move = null;
        if (cr.kind === "lurker") {
          if (dist <= REVEAL) move = greedy(cr);   // lurker wakes when you're near
        } else {
          move = rng.chance(0.7) ? greedy(cr) : wander(cr);  // wanderer drifts toward you
        }
        if (move) {
          if (move.x === ctrl.player.x && move.y === ctrl.player.y) { hurt(cr.dmg, cr); }   // it reaches you: it bites
          else { cr.x = move.x; cr.y = move.y; }
        }
      });
    }
    function greedy(cr) {
      var best = null, bestD = Math.abs(cr.x - ctrl.player.x) + Math.abs(cr.y - ctrl.player.y);
      ["up", "down", "left", "right"].forEach(function (d) {
        var nx = cr.x + DIRS[d][0], ny = cr.y + DIRS[d][1];
        var onPlayer = (nx === ctrl.player.x && ny === ctrl.player.y);
        if (!onPlayer && (!isFloor(nx, ny) || creatureAt(nx, ny))) return;
        var nd = Math.abs(nx - ctrl.player.x) + Math.abs(ny - ctrl.player.y);
        if (nd < bestD) { bestD = nd; best = { x: nx, y: ny }; }
      });
      return best;
    }
    function wander(cr) {
      var dirs = ["up", "down", "left", "right"];
      for (var t = 0; t < 4; t++) {
        var d = dirs[rng.int(0, 3)];
        var nx = cr.x + DIRS[d][0], ny = cr.y + DIRS[d][1];
        if (isFloor(nx, ny) && !creatureAt(nx, ny)) return { x: nx, y: ny };
      }
      return null;
    }

    function hurt(amount, source) {
      ctrl.meters.hp -= amount;
      if (ctrl.meters.hp <= 0) { ctrl.meters.hp = 0; die(combatCause(source)); }
    }
    function die(cause) { if (!ctrl.dead) { ctrl.dead = true; ctrl.cause = cause; } }

    // body meters tick on each dungeon action (bible §4.13 anti-scum)
    function meterTick(fight) {
      if (!inDungeon()) return;
      ctrl.meters.fatigue = Math.min(ctrl.meters.fatigueMax, ctrl.meters.fatigue + (fight ? FATIGUE_PER_FIGHT : FATIGUE_PER_STEP));
      ctrl.meters.satiation = Math.max(0, ctrl.meters.satiation - SATIATION_PER_STEP);
      if (ctrl.meters.satiation <= 0) hurt(STARVE_HP, { name: "hunger", starve: true });
      if (ctrl.meters.fatigue >= ctrl.meters.fatigueMax) hurt(EXHAUST_HP, { name: "exhaustion", exhaust: true });
    }

    function move(dir) {
      ctrl.lastEvent = null;
      if (ctrl.dead || ctrl.won || !DIRS[dir]) return { moved: false };
      var nx = ctrl.player.x + DIRS[dir][0], ny = ctrl.player.y + DIRS[dir][1];
      if (!inb(nx, ny)) return { moved: false };

      // bump-to-fight
      var cr = creatureAt(nx, ny);
      if (cr) {
        cr.hp -= PLAYER_DMG;
        var killed = cr.hp <= 0;
        if (killed) { removeCreature(cr); ctrl.kills += 1; ctrl.lastEvent = "You put down " + cr.name + "."; }
        else { ctrl.meters.hp -= cr.dmg; ctrl.lastEvent = "You strike " + cr.name + "; it strikes back."; if (ctrl.meters.hp <= 0) { ctrl.meters.hp = 0; die(combatCause(cr)); } }
        meterTick(true);
        creaturesStep();
        return { moved: false, attacked: true, killed: killed, event: ctrl.lastEvent, dead: ctrl.dead };
      }

      // a door: CONTACT REVEALS, it does not open. Enter commits (openDoor).
      var d = ctrl.doors[key(nx, ny)];
      if (d) {
        ctrl.pendingDoor = { meta: d, x: nx, y: ny };
        ctrl.lastEvent = doorReveal(d);
        return { moved: false, bumpedDoor: true, event: ctrl.lastEvent };
      }

      if (ctrl.grid[ny][nx] !== ".") return { moved: false };

      ctrl.player.x = nx; ctrl.player.y = ny;
      ctrl.pendingDoor = null;
      reveal(nx, ny);
      var f = featureAt(nx, ny);
      if (f) { if (f.id) ctrl.character.signalsSeen.add(f.id); ctrl.lastEvent = f.text; }
      meterTick(false);
      if (!ctrl.dead) creaturesStep();
      return { moved: true, dead: ctrl.dead, feature: f || undefined };
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

    // Enter: commit the pending (bumped) door.
    function openDoor() {
      var p = ctrl.pendingDoor;
      if (ctrl.dead || ctrl.won) return { opened: false };
      if (!p) { ctrl.lastEvent = "There is no door before you."; return { opened: false }; }
      if (Math.max(Math.abs(p.x - ctrl.player.x), Math.abs(p.y - ctrl.player.y)) > 1) { ctrl.pendingDoor = null; return { opened: false }; }
      var d = p.meta;
      if (onCross) { var oc = onCross(d, ctrl); if (oc && oc.block) { ctrl.lastEvent = oc.block; return { opened: false, blocked: oc.block }; } }
      var r = interp.choose(d.edgeId);
      if (!r.ok) { ctrl.lastEvent = d.reason || "the way is barred"; return { opened: false, blocked: ctrl.lastEvent }; }
      ctrl.lastEvent = (d.type === "oneway") ? "The way seals behind you with a click." : null;
      ctrl.node = interp.state.node; ctrl.won = !!r.complete; ctrl.pendingDoor = null;
      buildView();
      return { opened: true, traversed: d.edgeId, recenter: true, won: ctrl.won, to: ctrl.node };
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

    function visibleSet() {
      var s = new Set();
      for (var dy = -REVEAL; dy <= REVEAL; dy++) for (var dx = -REVEAL; dx <= REVEAL; dx++) { var x = ctrl.player.x + dx, y = ctrl.player.y + dy; if (inb(x, y)) s.add(key(x, y)); }
      return s;
    }

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
        player: { x: ctrl.player.x, y: ctrl.player.y },
        creatures: ctrl.creatures.filter(function (c) { return vis.has(key(c.x, c.y)); }),
        explored: Array.from(ctrl.explored), visible: Array.from(vis),
        level: curLevel(), node: ctrl.node, title: iv.title,
        requiredTotal: iv.requiredTotal, requiredDone: iv.requiredDone,
        meters: ctrl.meters, kills: ctrl.kills, ticket: ctrl.character.ticket,
        discoveries: discoveries, lastEvent: ctrl.lastEvent,
        pendingDoor: ctrl.pendingDoor ? key(ctrl.pendingDoor.x, ctrl.pendingDoor.y) : null,
        dead: ctrl.dead, won: ctrl.won, cause: ctrl.cause
      };
    }

    buildView();

    var api = {
      world: world, state: ctrl, interp: interp,
      move: move, open: openDoor, view: view, postmortem: postmortem,
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
      _node: function () { return ctrl.node; }
    };
    return api;
  }

  return { create: create, _W: W, _H: H, _CREATURE: CREATURE };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_MAP; }
