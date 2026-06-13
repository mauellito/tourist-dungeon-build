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
  var W = 48, H = 28;   // interior screen dims (the TOWN is one continuous 72x44
  // map from TD_TOWN.compose; the dungeon keeps its own dims). Town Composition
  // Law v1: the town is ONE continuous place (figure-ground), not screens.
  var SCREEN_IDS = ["TOWN"];
  var START_SCREEN = "TOWN";
  function isTownScreen(id) { return id === "TOWN"; }
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
      sign: ["THE RUSTY ANCHOR", "Dim, sticky, and unimpressed by you — which is the entire point."] },
    saloon: { title: "The Saloon", glyph: "S", act: "food", counter: "the long bar", sign: ["THE SALOON", "Swinging doors, municipal whiskey, a piano nobody admits to playing."] },
    restaurant: { title: "The Restaurant", glyph: "E", act: "food", counter: "the table", sign: ["THE RESTAURANT", "Prix fixe, prix steep. The fish is local, allegedly."] },
    coffee: { title: "The Coffee Shop", glyph: "O", act: "food", counter: "the counter", sign: ["THE COFFEE SHOP", "Opens early, on the days that have a morning."] },
    bodega: { title: "The Bodega", glyph: "D", act: "food", counter: "the register", sign: ["THE BODEGA", "Everything, a little dear, all hours."] },
    motel: { title: "The Motel", glyph: "M", act: "rest", counter: "the front desk", sign: ["THE MOTEL", "Vacancy. Always vacancy."] },
    bank: { title: "The Bank", glyph: "B", act: "flavor", counter: "the teller window", sign: ["THE BANK", "Your deposits are safe, in the municipal sense of safe."] },
    blacksmith: { title: "The Blacksmith", glyph: "L", act: "flavor", counter: "the anvil", sign: ["THE BLACKSMITH", "Honest tools. No promises."] },
    barber: { title: "The Barber", glyph: "R", act: "flavor", counter: "the chair", sign: ["THE BARBER", "A trim, a shave, and the news you did not ask for."] },
    church: { title: "The Church", glyph: "C", act: "blessing", counter: "the rail", sign: ["THE CHURCH", "Open to the living and, by appointment, the lately-living."] },
    tim: { title: "Tim's Tour Guide", glyph: "G", act: "tim", counter: "the desk", sign: ["TIM'S TOUR GUIDE", "Hints sold here. (Closed.)"] },
    tattoo: { title: "The Tattoo Parlor", glyph: "Z", act: "flavor", counter: "the table", sign: ["THE TATTOO PARLOR", "Permanent souvenirs of a temporary visit."] },
    boat: { title: "Boat Rental", glyph: "Y", act: "boat", counter: "the dock desk", sign: ["BOAT RENTAL", "Rent a boat. The boat goes where the boat goes."] },
    redshop: { title: "the Red Light Shop", glyph: "x", act: "flavor", counter: "the curtained counter", sign: ["THE RED LIGHT SHOP", "Discreet sundries for the discerning visitor. The Bureau files it under 'sundry'."] },
    palmreader: { title: "the Palm Reader", glyph: "&", act: "flavor", counter: "the velvet table", sign: ["PALM READING", "Your fortune, read in the municipal manner. The Bureau makes no representations as to the future, or the hand."] },
    chinese: { title: "the Golden Turnstile", glyph: "N", act: "food", counter: "the takeout window", sign: ["THE GOLDEN TURNSTILE", "Takeout. Fast, municipal, faintly suspicious of you."] },
    clamshack: { title: "the Clam Shack", glyph: "F", act: "food", counter: "the shucking counter", sign: ["THE CLAM SHACK", "Fried, by the water, no questions asked."] },
    gift1: { title: "Ye Olde Dungeon Gifte", glyph: "1", act: "flavor", counter: "the till", sign: ["YE OLDE DUNGEON GIFTE", "Genuine artefacts, genuinely. Ignore the shop next door."] },
    gift2: { title: "Authentic Dungeon Souvenirs", glyph: "2", act: "flavor", counter: "the till", sign: ["AUTHENTIC DUNGEON SOUVENIRS", "The REAL souvenirs. That other place is a tourist trap."] },
    empty: { title: "An Empty Room", glyph: ".", act: null, counter: null, sign: ["—", "Dust, and the suggestion of former purpose."] }
  };
  // which voice keeps each place (accent map): posh / brooklyn / pastoral / plainspoken / mixed
  var KEEPER = {
    kiosk: "kiosk", agency: "agency", hotel: "hotel", spa: "spa", tavern: "keeper_brooklyn",
    saloon: "keeper_brooklyn", bodega: "keeper_brooklyn", boat: "keeper_brooklyn", redshop: "keeper_brooklyn", palmreader: "keeper_brooklyn",
    bank: "keeper_posh", church: "keeper_pastoral",
    blacksmith: "keeper_plain", motel: "keeper_plain", barber: "keeper_plain",
    tim: "tim", tattoo: "keeper_mixed", restaurant: "keeper_mixed", coffee: "coffee",
    chinese: "keeper_mixed", clamshack: "keeper_brooklyn", gift1: "gift1", gift2: "gift2"
  };

  // Errands are now SCREEN-LOCAL (v16): a non-route actor heads for a random
  // street cell of its own screen, dwells, repeats; a route actor (the guard)
  // cycles a fixed list of waypoint tiles. (Named cross-town destination pools
  // were retired with the single-screen town — see FLAG in the wrap-up.)

  function create(world, opts) {
    opts = opts || {};
    var session = opts.session || { knowledge: new Set(), lives: 0 };

    var brassTarget = null, maxL = -1;
    Object.keys(world.nodes).forEach(function (n) {
      var m = world.nodes[n], lv = m.level || 0;
      if (m.required && lv > maxL) { maxL = lv; brassTarget = n; }
    });

    var meters, character, shared, placeId, player, pendingDoor, pendingCounter, dungeon, lastEvent, lastUrgent, dead, won, returnTile, places;
    var invOpen, invSel, look, sensedWater, vendor, pendingVendor, pendingExit, exitReturn, left, returnScreen, lastDungeonLevel;

    function freshCharacter() {
      meters = { hp: 100, hpMax: 100, fatigue: 0, fatigueMax: 100, satiation: 100, satiationMax: 100, comfort: 0 };
      character = { ticket: null, signalsSeen: new Set(), events: { clicks: [], brassRejected: false, anchorRejected: false } };
      // the run-context shared with the dungeon controller: one inventory, one
      // message log, one turn counter, across town and dungeon.
      shared = { meters: meters, character: character, inventory: [], messages: [], turn: 0 };
      placeId = START_SCREEN; dungeon = null; dead = false; won = false; returnScreen = START_SCREEN;
      invOpen = false; invSel = 0; look = { active: false, x: 0, y: 0 };
      returnTile = null; pendingDoor = null; pendingCounter = null; sensedWater = false; pendingVendor = false; pendingExit = false; exitReturn = null; left = false;
      lastDungeonLevel = null; announcedAt = {};
      buildPlaces();
      player = { x: places[START_SCREEN].spawn.x, y: places[START_SCREEN].spawn.y };
      vendor = null;
      spawnPopulation();                                  // per-screen actors: walkers, crowd, troop
      lastEvent = null; lastUrgent = false;
      logMsg("Welcome to the harbour. Mind the monsters; don't feed the guides.");
    }

    // every line declares a CHANNEL (Channel Law, CLAUDE.md). "event" = mechanical
    // truth; "senses" = perceived (heard/said/seen true; intuition may mislead).
    function logMsg(t, urgent, meta) {
      if (!t) return; meta = meta || {};
      lastEvent = t; lastUrgent = !!urgent;
      shared.messages.push({ text: t, urgent: !!urgent, ch: meta.ch || "event", kind: meta.kind || null, obj: meta.obj || null, banner: !!meta.banner });
      if (shared.messages.length > 120) shared.messages.shift();
    }
    // E1 — ENTRY ANNOUNCEMENT: on crossing into a named space, the Bureau welcomes
    // you (one line, banner-flagged). Debounced per-label so quick re-entry of the
    // same space does not spam (a genuine return, many turns later, re-announces).
    var announcedAt = {};
    function announce(label) {
      if (!label) return;
      var t = (typeof shared.turn === "number") ? shared.turn : 0;
      if (announcedAt[label] != null && (t - announcedAt[label]) < 8) return;
      announcedAt[label] = t;
      logMsg("You have entered " + label.toUpperCase() + ".", false, { banner: true });
    }
    function inRect(r, x, y) { return r && x >= r[0] && y >= r[1] && x <= r[2] && y <= r[3]; }
    function districtAt(x, y) {
      var T = places.TOWN, m = T ? T.meta : null; if (!m) return null;
      if (m.redlight && inRect(m.redlight.rect, x, y)) return "the Red Light District";
      if (m.districts.waterfront && inRect(m.districts.waterfront.rect, x, y)) return "the Waterfront";
      if (m.districts.market && inRect(m.districts.market.rect, x, y)) return "the Market";
      return null;
    }
    function senses(t, kind, obj, urgent) { logMsg(t, !!urgent, { ch: "senses", kind: kind, obj: obj }); }
    function makeRation() { return TD_MAP.makeItem("ration"); }
    function makeHotDog() { return { kind: "ration", glyph: "%", name: "a hot dog", desc: "A street hot dog, Bureau-permitted (permit eleven-and-three-quarters). A solid climb up the hunger ladder.", use: "eat", food: 60 }; }

    // session-scoped voice boxes (a line used this session is retired; the NPC
    // "remembers" across lives, which is what famous-from-deaths is built on)
    function voice(id) {
      if (typeof TD_VOICES === "undefined") return null;
      session.voices = session.voices || {};
      if (!session.voices[id]) session.voices[id] = TD_VOICES.box(id);
      return session.voices[id];
    }
    function speak(vb, trigger, state) {
      if (!vb || !vb.spec || vb.spec.placeholder) return false;
      var l = vb.say(trigger, state); if (!l) return false;
      senses(l.text, l.kind || "said", l.obj); return true;
    }
    function cap(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }
    // CONTACT DIALOGUE (v15): first contact greets, further contacts chat
    // (no-repeat, then recycle). Resolution: named spec -> type pool -> generic.
    function pickLine(pool, used) { for (var i = 0; i < pool.length; i++) { var t = (typeof pool[i] === "string") ? pool[i] : pool[i][0]; if (!used[t]) { used[t] = 1; return pool[i]; } } return null; }
    function talkTo(npc) {
      if (typeof TD_VOICES === "undefined") { logMsg(cap(npc.name) + " gives you a nod."); return; }
      var d = TD_VOICES.dialogue(npc.voiceId, npc.type);
      npc.contact = npc.contact || { greeted: false, used: {} };
      var c = npc.contact, pool = c.greeted ? d.chat : d.greetings;
      c.greeted = true;
      var line = pickLine(pool, c.used);
      if (!line) { c.used = {}; line = pickLine(pool, c.used); }   // exhausted -> recycle
      if (line) { var t = (typeof line === "string") ? line : line[0], obj = (typeof line === "string") ? "SUBJ" : line[1]; senses(cap(npc.name) + ": “" + t + "”", "said", obj); }
    }
    // the most salient player state, for NPC reactions
    function playerState() {
      var hg = TD_MAP.hungerStage(meters);
      if (hg.stage === "Starving") return "starving";
      if (meters.hp < 0.5 * meters.hpMax) return "wounded";
      if (session.lives > 2) return "famous";
      if (meters.comfort >= 2) return "comfortable";
      if (character.ticket) return "ticketed";
      if (meters.fatigue > 70) return "fatigued";
      if (session.lives <= 1) return "fresh";
      return "fed";
    }

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
        case "rest":
          restore(meters.hpMax, 0, meters.satiationMax); logMsg("You take a cheap room at the Motel and wake, unimproved but rested."); break;
        case "blessing":
          logMsg("You receive a blessing. It costs nothing and is worth, the parson notes, exactly that — and also everything."); break;
        case "tim":
          logMsg("Tim's hint desk is shuttered. A note reads: “Back when the route is ready.”"); break;   // hints DEFERRED
        case "boat":
          logMsg("The clerk nods at the island offshore. “Rentals resume when the tide and the Bureau agree.”"); break;   // goes nowhere yet (FLAG)
        case "flavor":
          logMsg("You browse. Nothing changes hands today, which is its own kind of transaction."); break;
        case "shrine":
          logMsg("A small peace, off the record."); senses("You bow your head. The Bureau keeps no record of this corner.", "intuition", "SUBJ"); break;
      }
    }
    function restore(hp, fat, sat) { meters.hp = hp; meters.fatigue = fat; meters.satiation = sat; }

    // ---- places ----------------------------------------------------------
    function blank() { var g = []; for (var y = 0; y < H; y++) { var r = []; for (var x = 0; x < W; x++) r.push("#"); g.push(r); } return g; }
    function carve(g, x0, y0, x1, y1) { for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) g[y][x] = "."; }
    function fill(g, x0, y0, x1, y1, ch) { for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) g[y][x] = ch; }

    function buildPlaces() {
      places = {};
      places.TOWN = adaptTown(TD_TOWN.compose((world.meta && world.meta.seed) || 1));
      Object.keys(INTERIORS).forEach(function (id) { places[id] = buildInterior(id); });
    }
    // wrap the figure-ground generator output (Town Composition Law v1) into a
    // live TOWN place: gate functions, gift positions, and the road cells NPCs walk.
    function adaptTown(t) {
      var p = { id: "TOWN", title: "The Harbour", grid: t.grid, doors: t.doors, features: t.features, ground: t.ground, occupants: [], actors: [], cells: [], spawn: t.spawn, exit: t.exit, buildings: t.buildings, piers: t.piers, meta: t.meta };
      Object.keys(t.doors).forEach(function (k) {
        var d = t.doors[k];
        if (d.to === "DUNGEON") d.gate = function () { if (!character.ticket) return { block: "The gate does not open for the unticketed." }; return null; };
        if (d.to === "tavern") d.gate = function () { if (meters.comfort >= 2) { act("anchor"); return { block: SIG["005"].t }; } return null; };
        if (d.red) { /* red-light doors already tagged */ }
      });
      var g1 = null, g2 = null;
      Object.keys(t.doors).forEach(function (k) { var d = t.doors[k]; if (d.to === "gift1") g1 = d.front; if (d.to === "gift2") g2 = d.front; });
      if (g1 && g2) p.meta.gift = { a: g1, b: g2 };
      // canon lookouts carried into the continuous town: the island rail (012)
      // and the three horizon weenies, at the edges (look-only, off the thoroughfares)
      function lkout(x, y, o) { if (t.grid[y] && t.grid[y][x] === "." && (!t.features[key(x, y)] || t.features[key(x, y)].decor)) t.features[key(x, y)] = o; }   // a canon sightline overrides decor furniture
      lkout(50, 36, { type: "lookout", glyph: "≈", label: "harbour rail", text: SIG["012"].t, act: "lookout" });
      lkout(2, 2, { type: "view", glyph: "▲", col: "signal", label: "a castle on a far hill", text: "On a far hill a castle keeps its own counsel and its own portcullis. The Bureau notes it is 'not currently on the itinerary'.", act: "look" });
      lkout(69, 2, { type: "view", glyph: "▲", col: "signal", label: "a monastery in the hills", text: "A monastery folds into the hills, bells and all, serenely beyond the turnstile. You may look; looking is free.", act: "look" });
      lkout(3, 36, { type: "view", glyph: "○", col: "signal", label: "a cave mouth across the water", text: "Across the water a cave mouth yawns, dark and promising and entirely off the map. The Bureau covets it on your behalf.", act: "look" });
      for (var y = 0; y < t.H; y++) for (var x = 0; x < t.W; x++) if (t.grid[y][x] === "." && !t.features[key(x, y)]) p.cells.push({ x: x, y: y });
      return p;
    }


    function occupantName(spec) {
      if (spec.act === "hotel" || spec.act === "rest") return "a hotel guest";
      if (spec.act === "food") return /Rusty Anchor|Saloon/.test(spec.title) ? "a regular" : "a diner";
      if (spec.act === "spa") return "a spa client";
      return "a browsing customer";
    }
    function occupantType(spec) {
      if (/Bank|Gilded Kraken|Spa|Motel/.test(spec.title)) return "guest";
      if (/Rusty Anchor|Saloon/.test(spec.title)) return "regular";
      if (spec.act === "food") return "diner";
      return "townsfolk";
    }
    function buildInterior(id) {
      var spec = INTERIORS[id];
      var g = blank();
      carve(g, 8, 3, 32, 13);
      var doors = {}, features = {};
      if (spec.counter) features[key(20, 5)] = { type: "counter", glyph: "$", label: spec.counter, act: spec.act };   // empty stubs have no counter
      doors[key(20, 14)] = { to: "TOWN", glyph: "<", label: "the way out, back to the harbour" };
      // every enterable establishment has 2-4 occupants (stationary patrons)
      var occupants = [];
      if (spec.counter) {
        var n = 2 + (id.length % 3), oxs = [11, 15, 25, 29], onm = occupantName(spec), oty = occupantType(spec);
        for (var i = 0; i < n; i++) occupants.push({ x: oxs[i % oxs.length], y: 8 + (i % 3), glyph: "o", name: onm, type: oty, voiceId: oty, friendly: true, hp: 1, maxHp: 1, dmg: 0 });
      }
      return { id: id, title: spec.title, sign: spec.sign, grid: g, doors: doors, features: features, occupants: occupants, spawn: { x: 20, y: 12 } };
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
      if (nx < 0 || ny < 0 || nx >= P.grid[0].length || ny >= P.grid.length) return { moved: false };
      // a townsfolk NPC: the vendor is posted at the cart (buy on Enter); any
      // other walker is DISPLACED — you swap past them, movement never stops.
      if (isTownScreen(placeId)) {
        var npcList = npcs();
        for (var ni = 0; ni < npcList.length; ni++) {
          var npc = npcList[ni];
          if (nx !== npc.x || ny !== npc.y) continue;
          if (npc.isVendor) {                              // the hot dog vendor — posted; only Enter buys
            pendingDoor = null; pendingCounter = null; pendingVendor = true;
            var vb = voice("vendor");
            if (!speak(vb, "greeting")) logMsg("The vendor waves you over to the cart.");
            speak(vb, "pitch"); speak(vb, "reaction", playerState());
            logMsg("Buy a hot dog? — Enter to accept; step away to decline.");
            return { moved: false, bumpedVendor: true, event: lastEvent };
          }
          pendingDoor = null; pendingCounter = null; pendingVendor = false; lastEvent = null;
          if (displaceFriendly(npc, nx, ny, P, npcList)) { displaceBark(); shared.turn += 1; walkersStep(); maybeGiftDuel(); maybeAmbientBark(); return { moved: true, displaced: true, event: lastEvent }; }
          return { moved: false };                         // truly boxed in (rare)
        }
      }
      // inside an establishment: patrons are DISPLACED too (the keeper behind the
      // counter is a feature, handled below — posted clerks stay posted).
      if (!isTownScreen(placeId) && placeId !== "DUNGEON") {
        var occs = (cur().occupants) || [];
        for (var oj = 0; oj < occs.length; oj++) {
          var o = occs[oj]; if (nx !== o.x || ny !== o.y) continue;
          pendingCounter = null; pendingDoor = null; lastEvent = null;
          if (displaceFriendly(o, nx, ny, P, occs)) { displaceBark(); shared.turn += 1; return { moved: true, displaced: true, event: lastEvent }; }
          return { moved: false };
        }
      }
      var d = P.doors[key(nx, ny)];
      if (d) { pendingCounter = null; pendingVendor = false; pendingDoor = { meta: d, x: nx, y: ny }; logMsg(doorReveal(d)); return { moved: false, bumpedDoor: true, event: lastEvent }; }
      var f = P.features[key(nx, ny)];
      if (f && f.act) {   // act-features (counters, lookouts). gate/decor features sit on open road and are walked through; labels sit in walls (the floor check blocks them).
        if (f.act === "lookout") { pendingCounter = null; pendingVendor = false; act("lookout"); return { moved: false, interacted: "lookout", event: lastEvent }; }
        if (f.act === "look") { pendingCounter = null; pendingVendor = false; senses(f.text, "seen", "OBJ"); return { moved: false, interacted: "look", event: lastEvent }; }
        if (f.act === "shrine") { pendingCounter = null; pendingVendor = false; act("shrine"); return { moved: false, interacted: "shrine", event: lastEvent }; }
        // a counter/desk: begin the conversation in the keeper's own voice
        pendingDoor = null; pendingVendor = false; pendingCounter = { act: f.act, x: nx, y: ny };
        var vbc = voice(f.act), spoke = false;
        if (speak(vbc, "greeting")) { spoke = true; speak(vbc, "pitch"); speak(vbc, "reaction", playerState()); }
        var p = PITCH[f.act] || { pitch: "The clerk awaits your custom.", offer: "Enter to accept; step away to decline.", obj: "SUBJ" };
        if (!spoke) senses(p.pitch, "said", p.obj || "SUBJ");
        logMsg(p.offer);                            // the offer is a mechanical prompt
        return { moved: false, bumpedCounter: true, act: f.act, event: lastEvent };
      }
      if (P.grid[ny][nx] !== ".") return { moved: false };
      var ox = player.x, oy = player.y;
      player.x = nx; player.y = ny; pendingDoor = null; pendingCounter = null; pendingVendor = false; lastEvent = null;
      // the road out of town: stepping onto the exit tile prompts a clean leave
      if (P.exit && nx === P.exit.x && ny === P.exit.y) { pendingExit = true; exitReturn = { x: ox, y: oy }; logMsg("The Bureau reminds departing visitors that itineraries, once surrendered, are not reissued. Leave town? (y / n)"); return { moved: true, exitPrompt: true }; }
      shared.turn += 1;
      walkersStep();
      var dist = districtAt(nx, ny); if (dist) announce(dist);            // E1: crossing into a named district
      // the senses emitter (town): the harbour makes itself heard near the water
      var nearW = waterAdjacent(P, nx, ny);
      if (nearW && !sensedWater) senses("Down at the quay the water laps at the stone, patient and cold.", "heard", "OBJ");
      sensedWater = nearW;
      maybeGiftDuel(); maybeAmbientBark();
      return { moved: true };
    }
    function waterAdjacent(P, x, y) {
      var pw = P.grid[0].length, ph = P.grid.length;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var ny = y + dy, nx = x + dx;
        if (ny >= 0 && nx >= 0 && ny < ph && nx < pw && P.grid[ny][nx] === "~") return true;
      }
      return false;
    }
    // the town actors run on an ENERGY SCHEDULER (ADOM-style): each player
    // town-turn every actor gains its SPEED in energy and acts (once per 100).
    function npcs() { return isTownScreen(placeId) ? (cur().actors || []) : []; }   // actors are screen-local (v16)
    function occupied(list, self, x, y) { for (var i = 0; i < list.length; i++) if (list[i] !== self && list[i].x === x && list[i].y === y) return true; return false; }
    // an NPC-walkable exterior tile: a STREET/PLAZA floor tile, not a door, not a
    // feature, not water/trees, not the player, not another actor.
    function npcWalkable(T, list, self, x, y) {
      if (x < 0 || y < 0 || x >= T.grid[0].length || y >= T.grid.length) return false;
      if (T.grid[y][x] !== ".") return false;
      if (T.doors[key(x, y)] || T.features[key(x, y)]) return false;
      if (x === player.x && y === player.y) return false;
      return !occupied(list, self, x, y);
    }
    // FRIENDLY DISPLACEMENT (operator ruling, June 11): walking into a non-hostile
    // actor swaps you past it (or steps it aside) — movement never dead-stops on a
    // friendly body. A swap target need only be open floor (the player just stood
    // on it); door/occupant tiles are excluded.
    function canStand(T, list, self, x, y) { return x >= 0 && y >= 0 && y < T.grid.length && x < T.grid[0].length && T.grid[y][x] === "." && !T.doors[key(x, y)] && !occupied(list, self, x, y); }
    var DISPLACE_LINES = ["“Pardon.”", "The walker yields the cobbles with a nod.", "You slip past with a murmured apology.", "A shuffle, a half-step, and you are through.", "“Mind yourself,” said not unkindly, and you are past."];
    var lastDisplace = -99;
    function displaceBark() { if (shared.turn - lastDisplace < 6) return; if (Math.random() > 0.4) return; lastDisplace = shared.turn; senses(DISPLACE_LINES[Math.floor(Math.random() * DISPLACE_LINES.length)], "heard", "OBJ"); }
    function displaceFriendly(npc, nx, ny, T, list) {
      var ox = player.x, oy = player.y;
      if (canStand(T, list, npc, ox, oy)) { npc.x = ox; npc.y = oy; }
      else {
        var ds = [[0, -1], [0, 1], [-1, 0], [1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]], stepped = false;
        for (var i = 0; i < ds.length; i++) { var ax = nx + ds[i][0], ay = ny + ds[i][1]; if (ax === ox && ay === oy) continue; if (canStand(T, list, npc, ax, ay)) { npc.x = ax; npc.y = ay; stepped = true; break; } }
        if (!stepped) return false;
      }
      player.x = nx; player.y = ny; return true;
    }
    // a STREET/PLAZA tile (for errand pathing — ignores dynamic actors)
    function streetTile(T, x, y) { return x >= 0 && y >= 0 && x < T.grid[0].length && y < T.grid.length && T.grid[y][x] === "." && !T.doors[key(x, y)] && !T.features[key(x, y)]; }
    function bfsStreets(T, sx, sy, tx, ty) {
      if (!streetTile(T, tx, ty)) return null;
      var q = [[sx, sy]], seen = {}, prev = {}, ds = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      seen[sx + "," + sy] = 1;
      while (q.length) {
        var c = q.shift();
        if (c[0] === tx && c[1] === ty) { var path = [], k = tx + "," + ty; while (k !== sx + "," + sy) { var p = k.split(","); path.unshift({ x: +p[0], y: +p[1] }); k = prev[k]; } return path; }
        for (var i = 0; i < ds.length; i++) { var nx = c[0] + ds[i][0], ny = c[1] + ds[i][1], kk = nx + "," + ny; if (!seen[kk] && streetTile(T, nx, ny)) { seen[kk] = 1; prev[kk] = c[0] + "," + c[1]; q.push([nx, ny]); } }
      }
      return null;
    }
    function pickErrand(npc) {
      if (npc.route && npc.route.length) { npc.wp = ((npc.wp == null ? -1 : npc.wp) + 1) % npc.route.length; return npc.route[npc.wp]; }   // route = list of {x,y} waypoints on this screen
      var cells = cur().cells || [];                       // else a random street cell of this screen
      return cells.length ? cells[Math.floor(Math.random() * cells.length)] : npc.home;
    }
    function nearestStreetAdj(T, lx, ly, fx, fy) {
      var ds = [[0, -1], [0, 1], [-1, 0], [1, 0]], best = null, bd = 1e9;
      for (var i = 0; i < ds.length; i++) { var x = lx + ds[i][0], y = ly + ds[i][1]; if (streetTile(T, x, y)) { var dd = Math.abs(x - fx) + Math.abs(y - fy); if (dd < bd) { bd = dd; best = { x: x, y: y }; } } }
      return best;
    }
    // the school kids FOLLOW the chaperone, clustering within a few tiles
    function followStep(npc, T, list) {
      var leader = null; list.forEach(function (a) { if (a.id === npc.follow) leader = a; });
      if (!leader) return;
      if (Math.abs(npc.x - leader.x) + Math.abs(npc.y - leader.y) <= 1) { npc.path = null; return; }
      var tgt = nearestStreetAdj(T, leader.x, leader.y, npc.x, npc.y);
      npc.path = tgt ? bfsStreets(T, npc.x, npc.y, tgt.x, tgt.y) : null;
      if (npc.path && npc.path.length) { var n = npc.path[0]; if (npcWalkable(T, list, npc, n.x, n.y)) { npc.x = n.x; npc.y = n.y; npc.path.shift(); return; } npc.path = null; }
      // blocked or no path: greedily step toward the leader to never lag behind
      var ds = [[0, -1], [0, 1], [-1, 0], [1, 0]], best = null, bd = Math.abs(npc.x - leader.x) + Math.abs(npc.y - leader.y);
      for (var i = 0; i < ds.length; i++) { var x = npc.x + ds[i][0], y = npc.y + ds[i][1]; if (npcWalkable(T, list, npc, x, y)) { var dd = Math.abs(x - leader.x) + Math.abs(y - leader.y); if (dd < bd) { bd = dd; best = { x: x, y: y }; } } }
      if (best) { npc.x = best.x; npc.y = best.y; }
    }
    function wobbleStep(npc, T, list) {
      var ds = [[0, -1], [0, 1], [-1, 0], [1, 0]], o = [];
      for (var i = 0; i < ds.length; i++) { var x = npc.x + ds[i][0], y = npc.y + ds[i][1]; if (npcWalkable(T, list, npc, x, y)) o.push({ x: x, y: y }); }
      if (o.length) { var p = o[Math.floor(Math.random() * o.length)]; npc.x = p.x; npc.y = p.y; }
    }
    // ONE movement action: the ERRAND LOOP — go to a destination via streets,
    // dwell, then pick the next. (No pure random wander.)
    function actorStep(npc, T, list) {
      if (npc.follow) { return followStep(npc, T, list); }
      if (npc.dwell > 0) { npc.dwell--; return; }
      if (!npc.path || !npc.path.length) {
        var d = pickErrand(npc);
        npc.path = (d ? bfsStreets(T, npc.x, npc.y, d.x, d.y) : null) || [];
        if (!npc.path.length) { npc.dwell = 2; return; }   // could not path; brief idle, then re-pick
      }
      if (npc.wobble && Math.random() < 0.25) { wobbleStep(npc, T, list); return; }   // a drunk 1-tile deviation
      var n = npc.path[0];
      if (npcWalkable(T, list, npc, n.x, n.y)) { npc.x = n.x; npc.y = n.y; npc.path.shift(); if (!npc.path.length) npc.dwell = 10 + Math.floor(Math.random() * 21); }
      else { npc.path = null; }                            // blocked by another actor — re-path next turn
    }
    function walkersStep() {                              // the scheduler (one player turn)
      if (!isTownScreen(placeId)) return;
      var T = cur(), list = npcs();
      list.forEach(function (npc) {
        if (npc.frozen) return;
        npc.energy = (npc.energy || 0) + (npc.speed || 100);
        var guard = 0;
        while (npc.energy >= 100 && guard++ < 4) { actorStep(npc, T, list); npc.energy -= 100; npc.acts = (npc.acts || 0) + 1; }   // each 100 energy = one action (move or dwell)
      });
    }
    // --- POPULATION: per-screen actors (v16). Waterfront skews dock/sailor;
    // main skews townsfolk; the strip skews visitors; the troop seats on MARKET.
    function spawnPopulation() {
      vendor = null;
      var T = places.TOWN, pool = T.cells.slice(), D = T.meta.districts || {};
      function take(rect) {
        if (rect) { var cand = []; for (var i = 0; i < pool.length; i++) { var c = pool[i]; if (c.x >= rect[0] && c.x <= rect[2] && c.y >= rect[1] && c.y <= rect[3]) cand.push(i); } if (cand.length) { var idx = cand[Math.floor(Math.random() * cand.length)]; return pool.splice(idx, 1)[0]; } }
        return pool.length ? pool.splice(Math.floor(Math.random() * pool.length), 1)[0] : { x: T.spawn.x, y: T.spawn.y };
      }
      function spawn(a, rect) { var t = take(rect); a.x = t.x; a.y = t.y; a.home = { x: t.x, y: t.y }; a.energy = 0; a.acts = 0; a.frozen = false; a.barksUsed = {}; T.actors.push(a); return a; }
      function many(n, type, glyph, name, voiceId, speed, rect, extra) { for (var i = 0; i < n; i++) { var a = { id: type + "_" + T.actors.length, type: type, glyph: glyph, name: name, voiceId: voiceId, speed: speed }; if (extra) for (var k in extra) a[k] = extra[k]; spawn(a, rect); } }
      function townRoute(frac) { var c = T.cells, wp = []; for (var i = 0; i < 4; i++) { var k = Math.floor(c.length * (i + 1) / 5); if (c[k]) wp.push({ x: c[k].x, y: c[k].y }); } return wp; }
      var main = D.main && D.main.rect, market = D.market && D.market.rect, wf = D.waterfront && D.waterfront.rect, strip = D.strip && D.strip.rect;
      vendor = spawn({ id: "vendor", type: "vendor", glyph: "v", name: "the hot dog vendor", voiceId: "vendor", isVendor: true, speed: 90 }, strip);
      many(4, "visitor", "i", "a visitor", "visitor", 90, strip);
      spawn({ id: "guard1", type: "guard", glyph: "G", name: "a Bureau patrol", voiceId: "guard", speed: 100, route: townRoute() });
      many(3, "townsfolk", "c", "a townsperson", "shopper", 90, main);
      spawn({ id: "nuns", type: "nuns", glyph: "n", name: "a pair of nuns", voiceId: "nuns", speed: 70 }, market);
      spawn({ id: "farmers", type: "townsfolk", glyph: "f", name: "a farmer", voiceId: "farmers", speed: 90 }, market);
      spawn({ id: "senorita", type: "townsfolk", glyph: "s", name: "a señorita", voiceId: "senorita", speed: 90 });
      many(4, "shopper", "p", "a shopper", "shopper", 90, market);
      many(5, "dockworker", "w", "a dock worker", "dockworker", 90, wf);
      many(3, "sailor", "j", "a drunk sailor", "sailor", 60, wf, { wobble: true });
      spawn({ id: "salty", type: "sailor", glyph: "j", name: "Salty Pete", voiceId: "salty", speed: 60, wobble: true }, wf);
      many(2, "shopper", "p", "a furtive shopper", "lowlife", 90);
      spawnTroop(T);
    }
    function spawnTroop(T) {
      var cx = T.spawn.x, cy = T.spawn.y, wp = [];
      // a TIGHT local route near the spawn so the troop stays compact (the kids follow)
      var near = T.cells.filter(function (c) { return Math.abs(c.x - cx) + Math.abs(c.y - cy) <= 6; });
      for (var i = 0; i < 4 && near.length; i++) { var c = near[Math.floor(near.length * (i + 1) / 5)]; if (c) wp.push({ x: c.x, y: c.y }); }
      T.actors.push({ id: "chaperone", type: "chaperone", glyph: "C", name: "a Bureau chaperone", voiceId: "chaperone", speed: 90, energy: 0, acts: 0, x: cx, y: cy, route: wp.length ? wp : null, home: { x: cx, y: cy }, frozen: false, barksUsed: {} });
      for (var j = 0; j < 4; j++) T.actors.push({ id: "kid_" + j, type: "kid", glyph: "k", name: "a school kid", voiceId: "kids", speed: 130, energy: 0, acts: 0, x: cx, y: cy, follow: "chaperone", home: { x: cx, y: cy }, frozen: false, barksUsed: {} });
    }
    // ambient barks: a passing crowd member occasionally speaks (never a stop)
    function maybeAmbientBark() {
      if (typeof TD_VOICES === "undefined" || Math.random() > 0.18) return;
      var near = npcs().filter(function (a) { return a.voiceId && !a.isVendor && cheby(player, a) <= 4; });
      if (!near.length) return;
      var a = near[Math.floor(Math.random() * near.length)], spec = TD_VOICES.byId(a.voiceId), barks = (spec && spec.barks) || [];
      a.barksUsed = a.barksUsed || {};
      for (var i = 0; i < barks.length; i++) if (!a.barksUsed[barks[i]]) { a.barksUsed[barks[i]] = 1; senses(a.name + ": “" + barks[i] + "”", "said", "SUBJ"); return; }
    }
    // the two gift shops trade dueling barks when the visitor is near both
    function maybeGiftDuel() {
      if (!isTownScreen(placeId) || typeof TD_VOICES === "undefined") return;
      var gift = cur().meta && cur().meta.gift; if (!gift) return;     // only the screen that holds both shops
      if (cheby(player, gift.a) > 5 || cheby(player, gift.b) > 5) return;
      session.giftDuel = session.giftDuel || { t: -99, used1: {}, used2: {} };
      var s = session.giftDuel;
      if (shared.turn - s.t < 4) return;                  // rate-limited; sparing
      s.t = shared.turn;
      var g1 = TD_VOICES.byId("gift1"), g2 = TD_VOICES.byId("gift2");
      function bark(spec, used) { var a = (spec && spec.barks) || []; for (var i = 0; i < a.length; i++) if (!used[a[i]]) { used[a[i]] = 1; return a[i]; } return null; }
      var b1 = bark(g1, s.used1); if (b1) senses("Ye Olde Dungeon Gifte: “" + b1 + "”", "said", "SUBJ");
      var b2 = bark(g2, s.used2); if (b2) senses("Authentic Dungeon Souvenirs: “" + b2 + "”", "said", "SUBJ");
    }
    function buyHotDog() {
      shared.inventory.push(makeHotDog());
      if (!speak(voice("vendor"), "accept")) logMsg("The vendor hands you a hot dog.");
      logMsg("You take a hot dog. (Free, for now — the cart's economy is still in committee.)");   // PLACEHOLDER price
    }

    function commit() {       // Enter / o
      if (placeId === "DUNGEON") { var rd = dungeon.open(); afterDungeon(); return rd; }
      // a pending hot-dog sale closes here, while still beside the cart
      if (pendingVendor) {
        if (!vendor || cheby(vendor, player) > 1) { pendingVendor = false; }
        else { pendingVendor = false; buyHotDog(); return { opened: true, dealt: "vendor", event: lastEvent }; }
      }
      // a pending counter sale closes only here, while you are still at the desk
      if (pendingCounter) {
        if (cheby(pendingCounter, player) > 1) { pendingCounter = null; }
        else { var a = pendingCounter.act; pendingCounter = null; act(a); speak(voice(a), "accept"); return { opened: true, dealt: a, event: lastEvent }; }
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
      shared.turn += 1; walkersStep(); maybeGiftDuel(); maybeAmbientBark();   // a wait is a player turn; the town keeps moving
      logMsg("You pause. The harbour goes about its business."); return { waited: true };
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
      var lg = cur().grid; if (nx < 0 || ny < 0 || nx >= lg[0].length || ny >= lg.length) return { look: true, x: look.x, y: look.y };
      var v = baseView();
      if (!inView(v, nx, ny)) { logMsg("You cannot make out anything that far into the dark."); return { look: true, x: look.x, y: look.y }; }
      look.x = nx; look.y = ny;
      logMsg("Look — " + describeAt(nx, ny));
      return { look: true, x: nx, y: ny, desc: lastEvent };
    }

    function transition(to, doorPos) {
      if (to === "DUNGEON") { returnScreen = placeId; act("gate"); return; }                  // enterDungeon + line
      if (to === "TOWN") { placeId = returnScreen; player = returnTile ? { x: returnTile.x, y: returnTile.y } : { x: places[returnScreen].spawn.x, y: places[returnScreen].spawn.y }; logMsg("You step back out into the harbour."); return; }
      if (to === "redlit") { senses("A red lamp, a velvet rope, and a card: “Closed for renovations.” The Quay's End keeps its counsel.", "seen", "OBJ"); return; }   // exterior only
      if (to === "locked") { logMsg("The door is locked; no one answers. (A stub, for now.)"); return; }   // filler stub
      returnTile = { x: player.x, y: player.y }; returnScreen = isTownScreen(placeId) ? placeId : returnScreen;   // come back to this screen, where we entered
      placeId = to; player = { x: places[to].spawn.x, y: places[to].spawn.y };
      announce(places[to].title);                                          // E1: the Bureau welcomes you in
      logMsg((places[to].sign || []).join("  —  "));
      var vb = voice(KEEPER[to]); if (vb) { speak(vb, "greeting"); speak(vb, "reaction", playerState()); }   // the keeper speaks
    }

    function afterDungeon() {
      if (dungeon.isDead() && !dead) { dead = true; bankKnowledge(); }
      if (dungeon.isComplete()) won = true;
      lastEvent = dungeon.view().lastEvent;
      var lvl = dungeon.view().level;                                     // E1: announce on entering a new dungeon level
      if (lvl >= 1 && lvl !== lastDungeonLevel) { lastDungeonLevel = lvl; announce("the Dungeon — Level " + lvl); }
    }

    // ---- views -----------------------------------------------------------
    function tilePlaceView() {
      var P = cur(), pw = P.grid[0].length, ph = P.grid.length;
      var explored = [];
      for (var y = 0; y < ph; y++) for (var x = 0; x < pw; x++) explored.push(key(x, y));
      var town = isTownScreen(placeId);
      var disc = town ? fieldNotes() : (P.sign || []).slice();
      return {
        phase: town ? "town" : "interior", w: pw, h: ph, screen: placeId,
        grid: P.grid.map(function (r) { return r.join(""); }),
        doors: P.doors, features: P.features, ground: P.ground || {}, items: {}, plain: {},
        buildings: town ? (P.buildings || []) : [], dungeonEntrance: town && P.meta ? P.meta.dungeonEntrance : null,   // E2: read at a glance
        player: { x: player.x, y: player.y },
        creatures: town
          ? npcs().map(function (n) { return { x: n.x, y: n.y, kind: "npc", glyph: n.glyph, name: n.name, hp: 1, maxHp: 1, dmg: 0, friendly: true }; })
          : (P.occupants || []).slice(),
        events: [],
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
    // leaving town ends the session cleanly (only y commits)
    function confirmExit() { pendingExit = false; left = true; logMsg("You leave town. The itinerary is surrendered; the Bureau wishes you a statistically average day."); }
    function cancelExit() { if (pendingExit) { pendingExit = false; if (exitReturn) player = { x: exitReturn.x, y: exitReturn.y }; logMsg("You think better of it and step back into town."); } }

    function view() {
      var v = baseView();
      v.turn = shared.turn; v.messages = shared.messages; v.inventory = invList();
      v.exitPrompt = !!pendingExit; v.left = !!left;
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
      confirmExit: confirmExit, cancelExit: cancelExit,
      say: function (t) { logMsg(t); },   // the Bureau speaks during play (presentation flavour)
      isDead: function () { return dead; }, isComplete: function () { return won; },
      SIG: SIG, brassTarget: brassTarget,
      _interact: function (type) { lastEvent = null; act(type); return { event: lastEvent, phase: placeId === "DUNGEON" ? "dungeon" : "town" }; },
      _meters: function () { return meters; }, _character: function () { return character; },
      _phase: function () { return placeId === "DUNGEON" ? "dungeon" : (isTownScreen(placeId) ? "town" : "interior"); },
      _place: function () { return placeId; }, _player: function () { return player; },
      _dungeon: function () { return dungeon; },
      _shared: function () { return shared; },
      _goto: function (id) { pendingDoor = null; pendingCounter = null; pendingVendor = false; placeId = id; player = { x: places[id].spawn.x, y: places[id].spawn.y }; if (places[id] && places[id].title && !isTownScreen(id) && id !== "DUNGEON") announce(places[id].title); return view(); },
      _pendingCounter: function () { return pendingCounter ? pendingCounter.act : null; },
      _pendingVendor: function () { return pendingVendor; },
      _vendor: function () { return vendor; },
      _setVendor: function (x, y) { vendor = { id: "vendor", x: x, y: y, frozen: true, glyph: "v", name: "the hot dog vendor", voiceId: "vendor", isVendor: true, type: "vendor", home: { x: x, y: y }, energy: 0, acts: 0 }; if (isTownScreen(placeId)) cur().actors.push(vendor); return vendor; },
      _freezeVendor: function (b) { SCREEN_IDS.forEach(function (id) { (places[id].actors || []).forEach(function (n) { n.frozen = !!b; }); }); },
      _actors: function () { return npcs(); },
      _addActor: function (a) { a.energy = a.energy || 0; a.acts = a.acts || 0; if (typeof a.speed !== "number") a.speed = 100; if (a.frozen == null) a.frozen = false; (isTownScreen(placeId) ? cur().actors : []).push(a); return a; },
      _clearActors: function () { if (isTownScreen(placeId)) cur().actors.length = 0; if (vendor && isTownScreen(placeId)) vendor = null; return isTownScreen(placeId) ? cur().actors : []; },
      _step: function () { walkersStep(); },
      _voice: function (id) { return voice(id); },
      _keepers: function () { return KEEPER; },
      _screens: function () { return [places.TOWN]; },
      _town: function () { return places.TOWN; },
      _townMeta: function () { return places.TOWN.meta; },
      _exitTile: function () { return places.TOWN.exit; },
      _occupantsOf: function (id) { return (places[id] || {}).occupants || []; },
      _talk: function (npc) { talkTo(npc); return lastEvent; },
      _pendingExit: function () { return !!pendingExit; },
      _warp: function (x, y) { player = { x: x, y: y }; return view(); },
      _playerState: function () { return playerState(); },
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
