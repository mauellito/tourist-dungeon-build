// Tourist Dungeon engine — TD_UI: presentation / quality-of-life logic.
// DOM-free so it can be unit-tested headlessly. play-map.html wires these into
// the canvas, the sidebar, and the input loop. NOTHING here changes generation,
// the checker, or game rules: auto-explore only issues the same move() a player
// would; labels/threats/palette only read the view; barks are flavour the Bureau
// adds to the log. Municipal voice; OBJ-true.
//
// COLOR DISCIPLINE (Brogue rule, standing law — see CLAUDE.md): every colour in
// the UI means exactly one thing, and that meaning is defined ONCE, here, in
// PALETTE. Creatures, items, doors, signals, criticals each own a hue. Glyphs
// (not colour) distinguish kinds within a category. No decorative colour.
"use strict";

var TD_UI = (function () {
  // ---- the single source of truth for colour ------------------------------
  var PALETTE = {
    // category hues (each means exactly one thing)
    player:   "#f5c542",   // gold — you, and damage you deal
    creature: "#ff6b4a",   // orange-red — any creature (glyph tells the kind)
    item:     "#46c8c0",   // teal — any item on the floor
    door:     "#5fd35f",   // green — any door, stair, or passage
    signal:   "#b98cff",   // violet — any signal plaque / lookout
    critical: "#ff2d1f",   // pure red — critical messages, the --more-- halt, damage taken
    senses:   "#7fa8c9",   // steel blue — the SENSES channel (perceived atmosphere)
    redlight:  "#e0559a",  // pink — the red-light district (its doors, its archway)
    nature:    "#5a8a4a",  // green — trees, gardens, the park
    npc:       "#d9b36a",  // warm tan — friendly townsfolk (the crowd, not a threat)
    rampart:   "#7d7468",  // stone — the TOWN perimeter wall (fortification, not architecture)
    fence:     "#9a8458",  // weathered wood — an enclosure fence (see-through)
    gate:      "#caa15a",  // brass — a gate (passage through a barrier)
    storefront: "#b5763e", // terracotta — commercial frontage (shop sign / window / awning)
    fixture:    "#8f8a7a", // pewter — fixed street furniture (lamppost, bench, crate, well, hitching post)
    // damage-number meanings (kept consistent with the category rules)
    dmgDealt: "#f5c542",   // = player gold (your output)
    dmgTaken: "#ff2d1f",   // = critical red (harm to you)
    // terrain / chrome (functional, not decorative)
    voidc:      "#07060a",
    floor:      "#9b8e72", floorDim:    "#4a4438",
    floorBg:    "#574d3c", floorBgDim:  "#2a2620",
    wall:       "#c6b48a", wallDim:     "#5f564a",
    water:      "#1d3346", waterGlyph:  "#6fa0c4",
    // C3 ground surfaces (functional terrain texture, one meaning each)
    cobble:     "#8d8a82", dirt: "#8a6f4a", stone: "#a6a29a", grass: "#5a8a4a", sand: "#c2a86a", plank: "#9a7d50",
    doorBg:     "#403225", pendingBg:   "#7a5f1e",
    // danger tints for the threats panel (severity, a defined meaning)
    dangerHigh: "#ff2d1f", dangerMed: "#e0902a", dangerLow: "#caa15a"
  };
  // the category hues that the Brogue rule requires to be distinct
  var CATEGORY_KEYS = ["player", "creature", "item", "door", "signal", "critical"];

  var DIRS = {
    up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
    ul: [-1, -1], ur: [1, -1], dl: [-1, 1], dr: [1, 1]
  };
  function key(x, y) { return x + "," + y; }

  // ---- view helpers --------------------------------------------------------
  function visCreatures(v) { return v.creatures || []; }           // view already filters to visible
  function creatureAtV(v, x, y) { var cs = v.creatures || []; for (var i = 0; i < cs.length; i++) if (cs[i].x === x && cs[i].y === y) return cs[i]; return null; }
  function meterWarn(v) {
    var m = v.meters || {}, hg = v.hunger || { rung: 0 };
    return (hg.rung >= 2) || (m.fatigue >= 70) || (m.hp < 0.25 * (m.hpMax || 100));
  }
  // the set of "notable" tile keys currently visible (doors, plain doors, signals, items)
  function notableSet(v) {
    var s = {}, vis = {};
    (v.visible || []).forEach(function (k) { vis[k] = 1; });
    function add(map) { Object.keys(map || {}).forEach(function (k) { if (vis[k]) s[k] = 1; }); }
    add(v.doors); add(v.plain); add(v.features); add(v.items);
    return s;
  }
  function hasNew(now, base) { for (var k in now) if (!base[k]) return true; return false; }

  // =========================================================== AUTO-EXPLORE =
  // Walk toward the nearest unexplored frontier, one tile at a time, halting the
  // INSTANT anything notable appears. Never crosses a door (so never a one-way),
  // never steps onto a creature (so never starts a fight), never commits.
  function stepToFrontier(v) {
    var exp = {}; (v.explored || []).forEach(function (k) { exp[k] = 1; });
    var W = v.w, H = v.h, P = v.player;
    function inb(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }
    function floorAt(x, y) { return inb(x, y) && v.grid[y][x] === "."; }
    function pathable(x, y) {
      var k = key(x, y);
      if (!floorAt(x, y) || !exp[k]) return false;          // only known floor
      if (v.doors && v.doors[k]) return false;               // never path onto a door/stair
      if (v.plain && v.plain[k] && !v.plain[k].open) return false;
      if (creatureAtV(v, x, y)) return false;
      return true;
    }
    function isFrontier(x, y) {
      for (var d in DIRS) { var nx = x + DIRS[d][0], ny = y + DIRS[d][1]; if (inb(nx, ny) && !exp[key(nx, ny)]) return true; }
      return false;
    }
    var start = key(P.x, P.y), q = [[P.x, P.y]], seen = {}, prev = {};
    seen[start] = 1;
    while (q.length) {
      var c = q.shift(), ck = key(c[0], c[1]);
      if (ck !== start && isFrontier(c[0], c[1])) {
        var k = ck; while (prev[k] && prev[k].from !== start) k = prev[k].from;
        return prev[k] ? prev[k].dir : null;
      }
      for (var d in DIRS) {
        var nx = c[0] + DIRS[d][0], ny = c[1] + DIRS[d][1], kk = key(nx, ny);
        if (!seen[kk] && pathable(nx, ny)) { seen[kk] = 1; prev[kk] = { from: ck, dir: d }; q.push([nx, ny]); }
      }
    }
    return null;
  }

  function autoExplore(sim, opts) {
    opts = opts || {};
    var MAX = opts.max || 300;
    var v0 = sim.view();
    if (visCreatures(v0).length) return { moved: 0, stoppedBy: "creature", say: "A creature is in view; the Bureau will not have you stroll past it." };
    var startWarn = meterWarn(v0);
    var baseline = notableSet(v0);
    var moved = 0, stoppedBy = "explored";
    while (moved < MAX) {
      var v = sim.view();
      if (v.dead || v.won) { stoppedBy = "end"; break; }
      var dir = stepToFrontier(v);
      if (!dir) { stoppedBy = "explored"; break; }
      var r = sim.move(dir);
      if (!r || !r.moved) { stoppedBy = "blocked"; break; }
      moved++;
      var v2 = sim.view();
      if (visCreatures(v2).length) { stoppedBy = "creature"; break; }
      if ((v2.items || {})[key(v2.player.x, v2.player.y)]) { stoppedBy = "item"; break; }
      if (hasNew(notableSet(v2), baseline)) { stoppedBy = "notable"; break; }
      if (!startWarn && meterWarn(v2)) { stoppedBy = "meter"; break; }
    }
    return { moved: moved, stoppedBy: stoppedBy };
  }

  // =========================================================== LABELS ========
  // Every visible item / creature / door / signal gets a label, all at once.
  function labels(v) {
    var out = [], vis = {};
    (v.visible || []).forEach(function (k) { vis[k] = 1; });
    function xyOf(k) { var p = k.split(","); return { x: +p[0], y: +p[1] }; }
    Object.keys(v.items || {}).forEach(function (k) { if (vis[k]) { var p = xyOf(k); out.push({ x: p.x, y: p.y, cat: "item", text: v.items[k].name }); } });
    Object.keys(v.features || {}).forEach(function (k) { if (vis[k]) { var p = xyOf(k); out.push({ x: p.x, y: p.y, cat: "signal", text: v.features[k].label || "a notice" }); } });
    Object.keys(v.doors || {}).forEach(function (k) { if (vis[k]) { var p = xyOf(k), d = v.doors[k]; out.push({ x: p.x, y: p.y, cat: "door", text: doorLabel(d) }); } });
    Object.keys(v.plain || {}).forEach(function (k) { if (vis[k]) { var p = xyOf(k); out.push({ x: p.x, y: p.y, cat: "door", text: v.plain[k].open ? "an open inner door" : "a shut inner door" }); } });
    (v.creatures || []).forEach(function (c) { out.push({ x: c.x, y: c.y, cat: "creature", text: c.name }); });
    return out;
  }
  function doorLabel(d) {
    if (d.brass) return "the Brass Door";
    if (d.type === "stair_down") return "a stair down";
    if (d.type === "stair_up") return "a stair up";
    if (d.type === "oneway") return "a one-way stair";
    if (d.takeable === false) return "a barred door";
    return d.label || "a door";
  }

  // =========================================================== THREATS =======
  // Every creature in view, with HP and a danger severity.
  function threats(v) {
    return (v.creatures || []).filter(function (c) { return !c.friendly; }).map(function (c) {   // friendly townsfolk are not threats
      return {
        name: c.name, glyph: c.glyph, kind: c.kind, x: c.x, y: c.y,
        hp: c.hp, maxHp: c.maxHp,
        danger: c.dmg >= 14 ? "high" : c.dmg >= 9 ? "med" : "low"
      };
    });
  }

  // =========================================================== --more-- ======
  // A critical-tier message HALTS the game: input is consumed as acknowledgment
  // until every pending critical has been read. moreGate scans messages after
  // the last-acknowledged index for any urgent line.
  function moreGate(messages, ackIndex) {
    messages = messages || [];
    for (var i = Math.max(0, ackIndex | 0); i < messages.length; i++) {
      var m = messages[i];
      if (m && m.urgent) return { blocked: true, index: i, text: (m && m.text) || "" };
    }
    return { blocked: false, index: messages.length };
  }

  // =========================================================== BUREAU BARKS ==
  // The Bureau speaks during play: sparing, never-repeating, rate-limited,
  // OBJ-true one-liners reacting to real events.
  var BARK_LINES = {
    first_kill:     "The Bureau notes your first reduction of local fauna; it is recorded, not congratulated.",
    first_descent:  "You have gone down. The Bureau reminds you the deep fixtures are one-way by design.",
    famished_entry: "You arrive Famished. The Bureau does not provision those who decline to provision themselves.",
    low_hp:         "You persist below a quarter of your allotment. The Bureau admires your economy with blood.",
    lingering:      "You have lingered. Nothing is metered on this level, but the indulgence is noted."
  };
  function Barker(opts) {
    opts = opts || {};
    var cooldown = (opts.cooldown != null) ? opts.cooldown : 18;
    var fired = {}, lastTurn = -99999;
    return {
      lines: BARK_LINES,
      // attempt a bark for an event id at the given turn; returns the line or null
      react: function (id, turn) {
        if (!BARK_LINES[id] || fired[id]) return null;
        if ((turn - lastTurn) < cooldown) return null;
        fired[id] = true; lastTurn = turn;
        return BARK_LINES[id];
      },
      hasFired: function (id) { return !!fired[id]; }
    };
  }

  return {
    PALETTE: PALETTE, CATEGORY_KEYS: CATEGORY_KEYS,
    autoExplore: autoExplore, stepToFrontier: stepToFrontier,
    labels: labels, threats: threats, moreGate: moreGate,
    Barker: Barker, BARK_LINES: BARK_LINES,
    _meterWarn: meterWarn, _notableSet: notableSet
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_UI; }
