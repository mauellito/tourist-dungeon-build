// Tourist Dungeon engine — TD_GAME: the spatial expedition.
// A walkable TOWN (streets + harbour + distinct buildings), each building
// opening into its own INTERIOR screen, plus the generated DUNGEON (TD_MAP).
// Doors REVEAL on contact and OPEN on Enter; movement is 8-way. Generation and
// the checker are untouched; the Brass Door, the doorman gate, and signal
// placement are play layer. Classic script: assigns TD_GAME. Requires TD_RNG,
// TD_INTERP, TD_MAP.
"use strict";

var TD_GAME = (function () {
  var SIG = {
    "001": { ch: "OBJ", t: "Valid in Guided Zones" },
    "002": { ch: "SUBJ", t: "This pass gets you everywhere worth going!" },
    "003": { ch: "OBJ", t: "Standard Admission — all areas" },
    "004": { ch: "OBJ", t: "This ticket is not valid beyond this point." },
    "005": { ch: "OBJ", t: "You smell like the Gilded Kraken. Not your kind of place." },
    "006": { ch: "SUBJ", t: "Nothing down there worth roughing it for, dear." },
    "007": { ch: "OBJ", t: "You leave with soft hands and a perfume that announces you before you arrive." },
    "008": { ch: "OBJ", t: "A cold draft slides from a seam in the wall." },
    "009": { ch: "SUBJ", t: "Probably rats in the wall." },
    "010": { ch: "OBJ", t: "Behind you the door settles into its frame with a click. It will not open from this side." },
    "011": { ch: "OBJ", t: "Behind the cold and rat-less wall, a stair ascends to serve them all." },
    "012": { ch: "OBJ", t: "Across the water the monastery and the graveyard sit in plain view, and just as plainly cannot be reached from here." }
  };
  var W = 41, H = 23;
  var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], ul: [-1, -1], ur: [1, -1], dl: [-1, 1], dr: [1, 1] };
  function key(x, y) { return x + "," + y; }
  function cheby(a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }

  // building interiors: id -> { title, sign[], counterLabel, act-type, glyph }
  var INTERIORS = {
    kiosk: { title: "The Admission Kiosk", glyph: "K", act: "kiosk", counter: "the ticket slot",
      sign: ["ADMISSION KIOSK", "Self-service. Exact change is appreciated, though admission is, regrettably, free."] },
    agency: { title: "The Tour Agency", glyph: "A", act: "agency", counter: "the booking desk",
      sign: ["THE TOUR AGENCY", "Guided. Safe. Premium. Our guides are famously ruthful."] },
    hotel: { title: "The Gilded Kraken", glyph: "H", act: "hotel", counter: "the front desk",
      sign: ["THE GILDED KRAKEN — a hotel of consequence", "Nothing down there worth roughing it for, dear."] },
    spa: { title: "The Spa", glyph: "P", act: "spa", counter: "the treatment table",
      sign: ["THE SPA", "Emerge improved. Emerge, regrettably, announced."] },
    tavern: { title: "The Rusty Anchor", glyph: "T", act: "food", counter: "the bar",
      sign: ["THE RUSTY ANCHOR", "Dim, sticky, and unimpressed by you — which is the entire point."] }
  };

  function create(world, opts) {
    opts = opts || {};
    var session = opts.session || { knowledge: new Set(), lives: 0 };

    var brassTarget = null, maxL = -1;
    Object.keys(world.nodes).forEach(function (n) {
      var m = world.nodes[n], lv = m.level || 0;
      if (m.required && lv > maxL) { maxL = lv; brassTarget = n; }
    });

    var meters, character, placeId, player, pendingDoor, dungeon, lastEvent, dead, won, returnTile, places;

    function freshCharacter() {
      meters = { hp: 100, hpMax: 100, fatigue: 0, fatigueMax: 100, satiation: 100, satiationMax: 100, comfort: 0 };
      character = { ticket: null, signalsSeen: new Set(), events: { clicks: [], brassRejected: false, anchorRejected: false } };
      placeId = "TOWN"; dungeon = null; dead = false; won = false; lastEvent = "Welcome to the harbour. Mind the monsters; don't feed the guides.";
      returnTile = null;
      buildPlaces();
      player = { x: places.TOWN.spawn.x, y: places.TOWN.spawn.y };
    }

    // ---- effects layer (shared by spatial counters AND the _interact test hook)
    function act(type) {
      var seen = function (id) { character.signalsSeen.add(id); };
      switch (type) {
        case "lookout": seen("012"); lastEvent = SIG["012"].t; break;
        case "agency":
          if (character.ticket) { lastEvent = "You already hold admission."; break; }
          character.ticket = "agency"; seen("002"); seen("001");
          lastEvent = "The clerk beams: “" + SIG["002"].t + "”  (the small print, more quietly: “" + SIG["001"].t + ".”)"; break;
        case "kiosk":
          if (character.ticket) { lastEvent = "You already hold admission."; break; }
          character.ticket = "standard"; seen("003");
          lastEvent = "A grey ticket curls out. It reads, in full: “" + SIG["003"].t + ".”"; break;
        case "hotel":
          meters.comfort += 2; restore(100, 0, 100); seen("006");
          lastEvent = "The concierge: “" + SIG["006"].t + "”  You take the night and wake wonderfully restored."; break;
        case "spa":
          meters.comfort += 1; meters.fatigue = Math.max(0, meters.fatigue - 30); meters.satiation = Math.min(100, meters.satiation + 20); seen("007");
          lastEvent = SIG["007"].t; break;
        case "food":
          meters.satiation = 100;
          lastEvent = "A hot meal and a flat, honest drink. You are fed, if not improved. The fortune cookie says something you do not yet understand."; break;
        case "anchor":
          if (meters.comfort >= 2) { seen("005"); character.events.anchorRejected = true; lastEvent = "The doorman, with a nose: “" + SIG["005"].t + "”"; }
          else { lastEvent = "The doorman loses interest in you, which here is a welcome."; }
          break;
        case "gate":
          if (!character.ticket) { lastEvent = "The gate does not open for the unticketed."; break; }
          enterDungeon(); lastEvent = "You present your ticket; the turnstile sighs and lets you by."; break;
      }
    }
    function restore(hp, fat, sat) { meters.hp = hp; meters.fatigue = fat; meters.satiation = sat; }

    // ---- places ----------------------------------------------------------
    function blank() { var g = []; for (var y = 0; y < H; y++) { var r = []; for (var x = 0; x < W; x++) r.push("#"); g.push(r); } return g; }
    function carve(g, x0, y0, x1, y1) { for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) g[y][x] = "."; }
    function fill(g, x0, y0, x1, y1, ch) { for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) g[y][x] = ch; }

    function buildPlaces() {
      places = {};
      places.TOWN = buildTown();
      Object.keys(INTERIORS).forEach(function (id) { places[id] = buildInterior(id); });
    }

    function buildTown() {
      var g = blank();
      carve(g, 4, 3, 36, 19);                 // the streets
      fill(g, 4, 1, 36, 2, "~");              // the harbour (water, scenery)
      var doors = {}, features = {};
      function building(x0, y0, x1, y1, dx, dy, to, glyph, name) {
        fill(g, x0, y0, x1, y1, "#");
        doors[key(dx, dy)] = { to: to, glyph: glyph, label: name };
      }
      building(6, 4, 10, 6, 8, 7, "kiosk", "K", "the Admission Kiosk");
      building(14, 4, 19, 6, 16, 7, "agency", "A", "the Tour Agency");
      building(23, 4, 28, 6, 25, 7, "hotel", "H", "the Gilded Kraken Hotel");
      building(32, 4, 36, 6, 34, 7, "spa", "P", "the Spa");
      building(6, 15, 11, 18, 8, 14, "tavern", "T", "the Rusty Anchor");
      building(30, 15, 35, 18, 32, 14, "DUNGEON", ">", "the Dungeon Gate");
      // doorman gate on the tavern; ticket gate on the dungeon gate
      doors[key(8, 14)].gate = function () { if (meters.comfort >= 2) { act("anchor"); return { block: SIG["005"].t }; } return null; };
      doors[key(32, 14)].gate = function () { if (!character.ticket) return { block: "The gate does not open for the unticketed." }; return null; };
      features[key(20, 3)] = { type: "lookout", glyph: "~", label: "the harbour rail", text: SIG["012"].t, act: "lookout" };
      return { id: "TOWN", title: "The Harbour", grid: g, doors: doors, features: features, spawn: { x: 20, y: 11 } };
    }

    function buildInterior(id) {
      var spec = INTERIORS[id];
      var g = blank();
      carve(g, 8, 3, 32, 13);
      var doors = {}, features = {};
      features[key(20, 5)] = { type: "counter", glyph: "$", label: spec.counter, act: spec.act };
      doors[key(20, 14)] = { to: "TOWN", glyph: "<", label: "the way out, back to the harbour" };
      return { id: id, title: spec.title, sign: spec.sign, grid: g, doors: doors, features: features, spawn: { x: 20, y: 12 } };
    }

    function cur() { return places[placeId]; }

    // ---- dungeon ---------------------------------------------------------
    function enterDungeon() {
      dungeon = TD_MAP.create(world, { shared: { meters: meters, character: character }, decorate: decorate, onCross: onCross });
      placeId = "DUNGEON";
    }
    function levelOf(node) { return (world.nodes[node] || {}).level || 0; }
    function decorate(ctrl, helpers) {
      Object.keys(ctrl.doors).forEach(function (k) { if (ctrl.doors[k].to === brassTarget) { ctrl.doors[k].brass = true; ctrl.doors[k].label = "a great Brass Door"; } });
      Object.keys(ctrl.doors).forEach(function (k) { if (ctrl.doors[k].type === "oneway") ctrl.doors[k].tells = [SIG["008"].t, SIG["009"].t]; });
      if (levelOf(ctrl.node) === 1) {
        var px = helpers.CX - 3, py = helpers.CY - 2;
        if (helpers.isFloor(px, py)) ctrl.features[helpers.key(px, py)] = { id: "011", channel: "OBJ", glyph: "¶", text: SIG["011"].t };
      }
    }
    function onCross(doorMeta, ctrl) {
      if (doorMeta.type === "oneway") character.events.clicks.push(levelOf(ctrl.node));
      if (doorMeta.brass) {
        if (character.ticket === "standard") return null;
        character.signalsSeen.add("004"); character.events.brassRejected = true;
        return { block: SIG["004"].t };
      }
      return null;
    }

    // ---- movement / commit (8-way; doors reveal then Enter) --------------
    function doorReveal(d) {
      var base = d.label || "a door";
      if (d.to === "DUNGEON") return "The dungeon gate. Press Enter to descend.";
      if (d.to === "TOWN") return "" + base + ". Press Enter to step outside.";
      return "The entrance to " + base + ". Press Enter to go in.";
    }

    function move(dir) {
      if (!DIRS[dir]) return { moved: false };
      if (placeId === "DUNGEON") { var rd = dungeon.move(dir); afterDungeon(); return rd; }
      var P = cur();
      var nx = player.x + DIRS[dir][0], ny = player.y + DIRS[dir][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) return { moved: false };
      var d = P.doors[key(nx, ny)];
      if (d) { pendingDoor = { meta: d, x: nx, y: ny }; lastEvent = doorReveal(d); return { moved: false, bumpedDoor: true, event: lastEvent }; }
      var f = P.features[key(nx, ny)];
      if (f) { act(f.act); return { moved: false, interacted: f.act, event: lastEvent }; }
      if (P.grid[ny][nx] !== ".") return { moved: false };
      player.x = nx; player.y = ny; pendingDoor = null; lastEvent = null;
      return { moved: true };
    }

    function commit() {       // Enter
      if (placeId === "DUNGEON") { var rd = dungeon.open(); afterDungeon(); return rd; }
      var p = pendingDoor;
      if (!p) { lastEvent = "There is no door before you."; return { opened: false }; }
      if (cheby(p, player) > 1) { pendingDoor = null; return { opened: false }; }
      var d = p.meta;
      if (d.gate) { var oc = d.gate(); if (oc && oc.block) { lastEvent = oc.block; return { opened: false, blocked: oc.block }; } }
      pendingDoor = null;
      transition(d.to, p);
      return { opened: true, to: d.to };
    }

    function transition(to, doorPos) {
      if (to === "DUNGEON") { act("gate"); return; }                  // enterDungeon + line
      if (to === "TOWN") { placeId = "TOWN"; player = returnTile ? { x: returnTile.x, y: returnTile.y } : { x: places.TOWN.spawn.x, y: places.TOWN.spawn.y }; lastEvent = "You step back out into the harbour."; return; }
      returnTile = { x: player.x, y: player.y };                       // come back where we entered
      placeId = to; player = { x: places[to].spawn.x, y: places[to].spawn.y };
      lastEvent = (places[to].sign || []).join("  —  ");
    }

    function afterDungeon() {
      if (dungeon.isDead() && !dead) { dead = true; bankKnowledge(); }
      if (dungeon.isComplete()) won = true;
      lastEvent = dungeon.view().lastEvent;
    }

    // ---- views -----------------------------------------------------------
    function tilePlaceView() {
      var P = cur();
      var explored = [];
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) explored.push(key(x, y));
      var disc = (placeId === "TOWN") ? fieldNotes() : (P.sign || []).slice();
      return {
        phase: placeId === "TOWN" ? "town" : "interior", w: W, h: H,
        grid: P.grid.map(function (r) { return r.join(""); }),
        doors: P.doors, features: P.features,
        player: { x: player.x, y: player.y }, creatures: [],
        explored: explored, visible: explored,
        level: 0, title: P.title, meters: meters, ticket: character.ticket,
        requiredTotal: 0, requiredDone: 0,
        discoveries: disc, lastEvent: lastEvent,
        pendingDoor: pendingDoor ? key(pendingDoor.x, pendingDoor.y) : null,
        dead: false, won: false
      };
    }
    function view() {
      if (placeId === "DUNGEON") { var v = dungeon.view(); v.ticket = character.ticket; v.fieldNotes = fieldNotes(); return v; }
      return tilePlaceView();
    }
    function fieldNotes() { return Array.from(session.knowledge).map(function (k) { return "field note: " + k; }); }

    // ---- postmortem / session -------------------------------------------
    function bankKnowledge() {
      if (character.events.brassRejected) session.knowledge.add("A Guided Package is refused at the Brass Door.");
      if (character.events.anchorRejected) session.knowledge.add("The Rusty Anchor turns away the too-well-kept.");
      if (character.events.clicks.length) session.knowledge.add("The deep stairs only go down — the click is honest.");
    }
    function postmortem() {
      var cause = (placeId === "DUNGEON" && dungeon) ? dungeon.view().cause : "The visitor came to an administrative end.";
      var attributions = [];
      if (character.events.brassRejected) attributions.push("Your Guided Package, purchased with enthusiasm at the Agency, was valid only in Guided Zones; the Brass Door was not pervious to it.");
      if (character.events.anchorRejected) attributions.push("Your comfort preceded you (the Gilded Kraken, the spa); the Rusty Anchor's doorman declined the acquaintance.");
      var spatial = [];
      if (character.events.clicks.length) { var lvl = character.events.clicks[character.events.clicks.length - 1]; spatial.push("You heard the stair click shut on Level " + lvl + " and kept descending."); }
      return { heading: "BUREAU OF VISITOR OUTCOMES", title: "Certificate of Conclusion", cause: cause, attributions: attributions, spatial: spatial, footer: "The Bureau thanks the deceased for his custom, such as it was." };
    }
    function newCharacter() { if (!dead) bankKnowledge(); session.lives += 1; freshCharacter(); }

    session.lives += 1;
    freshCharacter();

    return {
      world: world, session: session,
      move: move, open: commit, commit: commit, view: view, postmortem: postmortem, newCharacter: newCharacter,
      isDead: function () { return dead; }, isComplete: function () { return won; },
      SIG: SIG, brassTarget: brassTarget,
      _interact: function (type) { lastEvent = null; act(type); return { event: lastEvent, phase: placeId === "DUNGEON" ? "dungeon" : "town" }; },
      _meters: function () { return meters; }, _character: function () { return character; },
      _phase: function () { return placeId === "DUNGEON" ? "dungeon" : (placeId === "TOWN" ? "town" : "interior"); },
      _place: function () { return placeId; }, _player: function () { return player; },
      _dungeon: function () { return dungeon; },
      _brassCheck: function () { return onCross({ brass: true, type: "door" }, { node: brassTarget }); },
      _lastEvent: function () { return lastEvent; }
    };
  }

  return { create: create };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_GAME; }
