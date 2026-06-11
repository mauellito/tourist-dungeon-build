// Tourist Dungeon engine — TD_GAME: the spatial expedition.
// A walkable TOWN (streets + harbour + distinct buildings), each building
// opening into its own INTERIOR screen, plus the generated DUNGEON (TD_MAP).
// Doors REVEAL on contact and OPEN on Enter; movement is 8-way. On top of that
// it carries the ADOM-minimum grammar at the top level so it works in every
// phase: a turn counter, a scrolling message log, a carried inventory (with the
// ticket as an inspectable item), wait, and look. The spatial verbs that only
// make sense underground (get / search / close / drop-on-floor) are delegated to
// the dungeon controller (TD_MAP). Generation and the checker are untouched; the
// Brass Door, the doorman gate, and signal placement are play layer.
// Classic script: assigns TD_GAME. Requires TD_RNG, TD_INTERP, TD_MAP.
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

    var meters, character, shared, placeId, player, pendingDoor, pendingCounter, dungeon, lastEvent, lastUrgent, dead, won, returnTile, places;
    var invOpen, invSel, look, sensedWater;

    function freshCharacter() {
      meters = { hp: 100, hpMax: 100, fatigue: 0, fatigueMax: 100, satiation: 100, satiationMax: 100, comfort: 0 };
      character = { ticket: null, signalsSeen: new Set(), events: { clicks: [], brassRejected: false, anchorRejected: false } };
      // the run-context shared with the dungeon controller: one inventory, one
      // message log, one turn counter, across town and dungeon.
      shared = { meters: meters, character: character, inventory: [], messages: [], turn: 0 };
      placeId = "TOWN"; dungeon = null; dead = false; won = false;
      invOpen = false; invSel = 0; look = { active: false, x: 0, y: 0 };
      returnTile = null; pendingDoor = null; pendingCounter = null; sensedWater = false;
      buildPlaces();
      player = { x: places.TOWN.spawn.x, y: places.TOWN.spawn.y };
      lastEvent = null; lastUrgent = false;
      logMsg("Welcome to the harbour. Mind the monsters; don't feed the guides.");
    }

    // every line declares a CHANNEL (Channel Law, CLAUDE.md). "event" = mechanical
    // truth; "senses" = perceived (heard/said/seen true; intuition may mislead).
    function logMsg(t, urgent, meta) {
      if (!t) return; meta = meta || {};
      lastEvent = t; lastUrgent = !!urgent;
      shared.messages.push({ text: t, urgent: !!urgent, ch: meta.ch || "event", kind: meta.kind || null, obj: meta.obj || null });
      if (shared.messages.length > 120) shared.messages.shift();
    }
    function senses(t, kind, obj, urgent) { logMsg(t, !!urgent, { ch: "senses", kind: kind, obj: obj }); }
    function makeRation() { return TD_MAP.makeItem("ration"); }

    // ---- effects layer (shared by spatial counters AND the _interact test hook)
    function act(type) {
      var seen = function (id) { character.signalsSeen.add(id); };
      switch (type) {
        case "lookout": seen("012"); senses(SIG["012"].t, "seen", "OBJ"); break;
        case "agency":
          if (character.ticket) { logMsg("You already hold admission."); break; }
          character.ticket = "agency"; seen("002"); seen("001");
          senses("The clerk beams: “" + SIG["002"].t + "”", "said", "SUBJ");          // 002 SUBJ
          senses("Quieter, the small print she reads aloud: “" + SIG["001"].t + ".”", "said", "OBJ");  // 001 OBJ
          logMsg("A Guided Package is stamped into your hand."); break;
        case "kiosk":
          if (character.ticket) { logMsg("You already hold admission."); break; }
          character.ticket = "standard"; seen("003");
          logMsg("A grey ticket curls from the slot: “" + SIG["003"].t + ".”"); break;   // 003 printed fact -> event
        case "hotel":
          meters.comfort += 2; restore(100, 0, 100); seen("006");
          senses("The concierge, without looking up: “" + SIG["006"].t + "”", "said", "SUBJ");  // 006 SUBJ
          logMsg("You take the night at the Gilded Kraken and wake wonderfully restored."); break;
        case "spa":
          meters.comfort += 1; meters.fatigue = Math.max(0, meters.fatigue - 30); meters.satiation = Math.min(100, meters.satiation + 20); seen("007");
          logMsg("The spa works you over.");
          senses(SIG["007"].t, "said", "OBJ"); break;                  // 007 OBJ effect, told to you
        case "food":
          meters.satiation = meters.satiationMax;
          shared.inventory.push(makeRation()); shared.inventory.push(makeRation());
          logMsg("A hot meal and a flat, honest drink; two buns go to your pack for the road (2 rations).");
          senses("The fortune cookie says something you do not yet understand.", "intuition", "SUBJ"); break;
        case "anchor":
          if (meters.comfort >= 2) { seen("005"); character.events.anchorRejected = true; senses("The doorman, with a nose: “" + SIG["005"].t + "”", "said", "OBJ"); }  // 005 OBJ
          else { logMsg("The doorman loses interest in you, which here is a welcome."); }
          break;
        case "gate":
          if (!character.ticket) { logMsg("The gate does not open for the unticketed."); break; }
          enterDungeon(); logMsg("You present your ticket; the turnstile sighs and lets you by."); break;
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
      features[key(20, 3)] = { type: "lookout", glyph: "~", label: "harbour rail", text: SIG["012"].t, act: "lookout" };
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
    function curPlayer() { return (placeId === "DUNGEON" && dungeon) ? dungeon._player() : player; }

    // ---- dungeon ---------------------------------------------------------
    function enterDungeon() {
      dungeon = TD_MAP.create(world, { shared: shared, decorate: decorate, onCross: onCross });
      placeId = "DUNGEON";
    }
    function levelOf(node) { return (world.nodes[node] || {}).level || 0; }
    function decorate(ctrl, helpers) {
      Object.keys(ctrl.doors).forEach(function (k) { if (ctrl.doors[k].to === brassTarget) { ctrl.doors[k].brass = true; ctrl.doors[k].label = "a great Brass Door"; } });
      Object.keys(ctrl.doors).forEach(function (k) { if (ctrl.doors[k].type === "oneway") ctrl.doors[k].tells = [SIG["008"].t, SIG["009"].t]; });
      if (levelOf(ctrl.node) === 1) {
        var px = helpers.CX - 3, py = helpers.CY - 2;
        if (helpers.isFloor(px, py)) ctrl.features[helpers.key(px, py)] = { id: "011", channel: "OBJ", glyph: "¶", label: "plaque", text: SIG["011"].t };
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

    // a sale is a conversation: contact begins the patter, only Enter closes the
    // deal. Each counter pitches in its house voice, then a plain offer line.
    var PITCH = {
      agency: { pitch: "The Agency clerk sweeps a hand over a laminated map: “This pass gets you everywhere worth going!” (Everywhere worth going, the small print clarifies, is a Guided Zone.)", obj: "SUBJ",
        offer: "Take the Guided Package? — Enter to accept; step away to decline." },
      kiosk: { pitch: "The kiosk hums. A grey ticket waits in the slot, and a notice apologises in advance for the lack of occasion.", obj: "OBJ",
        offer: "Take a Standard Admission? — Enter to accept; step away to decline." },
      hotel: { pitch: "The concierge looks you over and remains unmoved: “Nothing down there worth roughing it for, dear.” The bed, he implies, is the only sensible destination.", obj: "SUBJ",
        offer: "Take the night at the Gilded Kraken? — Enter to accept; step away to decline." },
      spa: { pitch: "The attendant promises you will emerge improved, and — lowering her voice — announced.", obj: "SUBJ",
        offer: "Take the treatment? — Enter to accept; step away to decline." },
      food: { pitch: "The barman sets down something hot and something flat. Neither is impressed by you, which here passes for welcome.", obj: "OBJ",
        offer: "Buy a meal, with rations for the road? — Enter to accept; step away to decline." }
    };

    function move(dir) {
      if (!DIRS[dir]) return { moved: false };
      if (placeId === "DUNGEON") { var rd = dungeon.move(dir); afterDungeon(); return rd; }
      var P = cur();
      var nx = player.x + DIRS[dir][0], ny = player.y + DIRS[dir][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) return { moved: false };
      var d = P.doors[key(nx, ny)];
      if (d) { pendingCounter = null; pendingDoor = { meta: d, x: nx, y: ny }; logMsg(doorReveal(d)); return { moved: false, bumpedDoor: true, event: lastEvent }; }
      var f = P.features[key(nx, ny)];
      if (f) {
        if (f.act === "lookout") { pendingCounter = null; act("lookout"); return { moved: false, interacted: "lookout", event: lastEvent }; }
        // a counter/desk: begin the conversation, do NOT transact
        pendingDoor = null; pendingCounter = { act: f.act, x: nx, y: ny };
        var p = PITCH[f.act] || { pitch: "The clerk awaits your custom.", offer: "Enter to accept; step away to decline.", obj: "SUBJ" };
        senses(p.pitch, "said", p.obj || "SUBJ");   // the patter is perceived speech
        logMsg(p.offer);                            // the offer is a mechanical prompt
        return { moved: false, bumpedCounter: true, act: f.act, event: lastEvent };
      }
      if (P.grid[ny][nx] !== ".") return { moved: false };
      player.x = nx; player.y = ny; pendingDoor = null; pendingCounter = null; lastEvent = null;
      shared.turn += 1;
      // the senses emitter (town): the harbour makes itself heard near the water
      var nearW = waterAdjacent(P, nx, ny);
      if (nearW && !sensedWater) senses("Down at the quay the water laps at the stone, patient and cold.", "heard", "OBJ");
      sensedWater = nearW;
      return { moved: true };
    }
    function waterAdjacent(P, x, y) {
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var ny = y + dy, nx = x + dx;
        if (ny >= 0 && nx >= 0 && ny < H && nx < W && P.grid[ny][nx] === "~") return true;
      }
      return false;
    }

    function commit() {       // Enter / o
      if (placeId === "DUNGEON") { var rd = dungeon.open(); afterDungeon(); return rd; }
      // a pending sale closes only here, and only while you are still at the desk
      if (pendingCounter) {
        if (cheby(pendingCounter, player) > 1) { pendingCounter = null; }
        else { var a = pendingCounter.act; pendingCounter = null; act(a); return { opened: true, dealt: a, event: lastEvent }; }
      }
      var p = pendingDoor;
      if (!p) { logMsg("There is no door before you."); return { opened: false }; }
      if (cheby(p, player) > 1) { pendingDoor = null; return { opened: false }; }
      var d = p.meta;
      if (d.gate) { var oc = d.gate(); if (oc && oc.block) { logMsg(oc.block); return { opened: false, blocked: oc.block }; } }
      pendingDoor = null;
      transition(d.to, p);
      return { opened: true, to: d.to };
    }

    // ---- the new ADOM verbs (top-level; spatial ones delegate underground) ---
    function wait() {
      if (placeId === "DUNGEON") { var r = dungeon.wait(); afterDungeon(); return r; }
      shared.turn += 1; logMsg("You pause. The harbour goes about its business."); return { waited: true };
    }
    function get() {
      if (placeId === "DUNGEON") { var r = dungeon.get(); afterDungeon(); return r; }
      logMsg("There is nothing here to take."); return { got: false };
    }
    function search() {
      if (placeId === "DUNGEON") { var r = dungeon.search(); afterDungeon(); return r; }
      logMsg("You inspect the harbour wall. It is only a wall, and unimpressed."); return { searched: true, found: 0 };
    }
    function closeDoor() {
      if (placeId === "DUNGEON") { var r = dungeon.closeDoor(); afterDungeon(); return r; }
      logMsg("There is nothing here you may close."); return { closed: false };
    }

    // inventory: the carried pack, plus the ticket as an inspectable virtual item
    function ticketDesc() {
      if (character.ticket === "agency") return "A Guided Package from the Tour Agency. “" + SIG["002"].t + "”  The fine print: “" + SIG["001"].t + "” — Guided Zones only.";
      if (character.ticket === "standard") return "A grey Standard Admission ticket. “" + SIG["003"].t + ".”";
      return "A ticket of some kind.";
    }
    function invList() {
      var list = shared.inventory.slice();
      if (character.ticket) list.push({ kind: "ticket", virtual: true, glyph: "=", name: "your admission ticket (" + character.ticket + ")", desc: ticketDesc(), use: "inspect" });
      return list;
    }
    function removeReal(it) { var i = shared.inventory.indexOf(it); if (i >= 0) shared.inventory.splice(i, 1); }
    function clampSel() { var n = invList().length; invSel = n ? Math.max(0, Math.min(n - 1, invSel)) : 0; }

    function toggleInventory() {
      invOpen = !invOpen;
      if (invOpen) { invSel = 0; logMsg(invList().length ? "You open your pack." : "Your pack is empty (but for what you carry on your person)."); }
      return { invOpen: invOpen, inventory: invList() };
    }
    function invSelect(i) {
      var l = invList(); if (!l.length) return { selected: -1 };
      invSel = Math.max(0, Math.min(l.length - 1, i));
      logMsg(l[invSel].name + " — " + l[invSel].desc);
      return { selected: invSel, item: l[invSel] };
    }
    function useSelected() {
      var l = invList(); if (!l.length) { logMsg("Your pack is empty."); return { used: false }; }
      var it = l[invSel];
      if (it.use === "eat") { meters.satiation = Math.min(meters.satiationMax, meters.satiation + (it.food || 40)); removeReal(it); logMsg("You eat " + it.name + ". The hunger eases."); }
      else if (it.use === "heal") { meters.hp = Math.min(meters.hpMax, meters.hp + (it.heal || 20)); removeReal(it); logMsg("You apply " + it.name + ". Your wounds close a little."); }
      else { logMsg(it.name + " — " + it.desc); }
      clampSel();
      return { used: true, item: it };
    }
    function dropSelected() {
      var l = invList(); if (!l.length) { logMsg("You have nothing to drop."); return { dropped: false }; }
      var it = l[invSel];
      if (it.virtual) { logMsg("You had better hold on to your ticket."); return { dropped: false }; }
      removeReal(it);
      if (placeId === "DUNGEON" && dungeon) { dungeon.dropItem(it); afterDungeon(); }
      else logMsg("You set " + it.name + " down on the harbour stones and walk on.");
      clampSel();
      return { dropped: true, item: it };
    }

    // look: a movable cursor over visible tiles, naming what is there
    function describeAt(x, y) {
      var v = baseView(), k = key(x, y), pl = curPlayer();
      if (x === pl.x && y === pl.y) return "yourself, a visitor of unremarkable prospects.";
      if (v.creatures) { for (var i = 0; i < v.creatures.length; i++) { var c = v.creatures[i]; if (c.x === x && c.y === y) return c.name + " (" + c.hp + "/" + c.maxHp + " health)."; } }
      if (v.items && v.items[k]) return v.items[k].name + " — " + v.items[k].desc;
      if (v.doors && v.doors[k]) return (v.doors[k].label || "a door") + ".";
      if (v.plain && v.plain[k]) return v.plain[k].open ? "an open inner door." : "a shut inner door.";
      if (v.features && v.features[k]) { var f = v.features[k]; return f.label ? ("the " + f.label + ": " + (f.text || "")) : (f.text || "something worth noting."); }
      var row = v.grid[y], ch = row ? row[x] : "#";
      if (ch === ".") return "bare floor.";
      if (ch === "~") return "dark water; the far shore is in plain view and plainly off-limits.";
      if (ch === "#") return "a wall. Searching beside it might turn something up.";
      return "shadow you have not been close to.";
    }
    function inView(v, x, y) { var k = key(x, y); return (v.visible && v.visible.indexOf(k) >= 0) || (v.explored && v.explored.indexOf(k) >= 0); }
    function lookToggle() {
      look.active = !look.active;
      if (look.active) { var pl = curPlayer(); look.x = pl.x; look.y = pl.y; logMsg("Look — " + describeAt(look.x, look.y) + "  (move the cursor; press l or Esc to stop)"); }
      else logMsg("You stop looking and straighten up.");
      return { look: look.active, x: look.x, y: look.y };
    }
    function lookMove(dir) {
      if (!look.active || !DIRS[dir]) return { look: look.active };
      var nx = look.x + DIRS[dir][0], ny = look.y + DIRS[dir][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) return { look: true, x: look.x, y: look.y };
      var v = baseView();
      if (!inView(v, nx, ny)) { logMsg("You cannot make out anything that far into the dark."); return { look: true, x: look.x, y: look.y }; }
      look.x = nx; look.y = ny;
      logMsg("Look — " + describeAt(nx, ny));
      return { look: true, x: nx, y: ny, desc: lastEvent };
    }

    function transition(to, doorPos) {
      if (to === "DUNGEON") { act("gate"); return; }                  // enterDungeon + line
      if (to === "TOWN") { placeId = "TOWN"; player = returnTile ? { x: returnTile.x, y: returnTile.y } : { x: places.TOWN.spawn.x, y: places.TOWN.spawn.y }; logMsg("You step back out into the harbour."); return; }
      returnTile = { x: player.x, y: player.y };                       // come back where we entered
      placeId = to; player = { x: places[to].spawn.x, y: places[to].spawn.y };
      logMsg((places[to].sign || []).join("  —  "));
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
        doors: P.doors, features: P.features, items: {}, plain: {},
        player: { x: player.x, y: player.y }, creatures: [], events: [],
        explored: explored, visible: explored,
        level: 0, title: P.title, meters: meters, ticket: character.ticket,
        requiredTotal: 0, requiredDone: 0,
        discoveries: disc, lastEvent: lastEvent,
        pendingDoor: pendingDoor ? key(pendingDoor.x, pendingDoor.y) : null,
        dead: false, won: false
      };
    }
    function baseView() {
      if (placeId === "DUNGEON") { var v = dungeon.view(); v.ticket = character.ticket; v.fieldNotes = fieldNotes(); return v; }
      return tilePlaceView();
    }
    function view() {
      var v = baseView();
      v.turn = shared.turn; v.messages = shared.messages; v.inventory = invList();
      v.invOpen = invOpen; v.invSel = invSel;
      v.look = { active: look.active, x: look.x, y: look.y };
      v.hunger = TD_MAP.hungerStage(meters);
      // the latest log line is the unified "current event", whoever wrote it
      // (town counters, dungeon controller, or the top-level verbs here).
      var lastM = shared.messages.length ? shared.messages[shared.messages.length - 1] : null;
      if (lastM) { v.lastEvent = lastM.text; v.lastUrgent = lastM.urgent; }
      return v;
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
      wait: wait, get: get, search: search, closeDoor: closeDoor,
      toggleInventory: toggleInventory, invSelect: invSelect, useSelected: useSelected, dropSelected: dropSelected,
      lookToggle: lookToggle, lookMove: lookMove,
      say: function (t) { logMsg(t); },   // the Bureau speaks during play (presentation flavour)
      isDead: function () { return dead; }, isComplete: function () { return won; },
      SIG: SIG, brassTarget: brassTarget,
      _interact: function (type) { lastEvent = null; act(type); return { event: lastEvent, phase: placeId === "DUNGEON" ? "dungeon" : "town" }; },
      _meters: function () { return meters; }, _character: function () { return character; },
      _phase: function () { return placeId === "DUNGEON" ? "dungeon" : (placeId === "TOWN" ? "town" : "interior"); },
      _place: function () { return placeId; }, _player: function () { return player; },
      _dungeon: function () { return dungeon; },
      _shared: function () { return shared; },
      _goto: function (id) { pendingDoor = null; pendingCounter = null; placeId = id; player = { x: places[id].spawn.x, y: places[id].spawn.y }; return view(); },
      _pendingCounter: function () { return pendingCounter ? pendingCounter.act : null; },
      _hunger: function () { return TD_MAP.hungerStage(meters); },
      _inventory: function () { return shared.inventory; },
      _invList: function () { return invList(); },
      _turn: function () { return shared.turn; },
      _look: function () { return look; },
      _brassCheck: function () { return onCross({ brass: true, type: "door" }, { node: brassTarget }); },
      _lastEvent: function () { return lastEvent; }
    };
  }

  return { create: create };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_GAME; }
