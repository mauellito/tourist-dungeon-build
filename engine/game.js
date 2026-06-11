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
  var W = 64, H = 40;   // the harbour town — a sprawl (the dungeon stays 41x23)
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
    chinese: { title: "the Golden Turnstile", glyph: "N", act: "food", counter: "the takeout window", sign: ["THE GOLDEN TURNSTILE", "Takeout. Fast, municipal, faintly suspicious of you."] },
    clamshack: { title: "the Clam Shack", glyph: "F", act: "food", counter: "the shucking counter", sign: ["THE CLAM SHACK", "Fried, by the water, no questions asked."] },
    gift1: { title: "Ye Olde Dungeon Gifte", glyph: "1", act: "flavor", counter: "the till", sign: ["YE OLDE DUNGEON GIFTE", "Genuine artefacts, genuinely. Ignore the shop next door."] },
    gift2: { title: "Authentic Dungeon Souvenirs", glyph: "2", act: "flavor", counter: "the till", sign: ["AUTHENTIC DUNGEON SOUVENIRS", "The REAL souvenirs. That other place is a tourist trap."] },
    empty: { title: "An Empty Room", glyph: ".", act: null, counter: null, sign: ["—", "Dust, and the suggestion of former purpose."] }
  };
  // which voice keeps each place (accent map): posh / brooklyn / pastoral / plainspoken / mixed
  var KEEPER = {
    kiosk: "kiosk", agency: "agency", hotel: "hotel", spa: "spa", tavern: "keeper_brooklyn",
    saloon: "keeper_brooklyn", bodega: "keeper_brooklyn", boat: "keeper_brooklyn", redshop: "keeper_brooklyn",
    bank: "keeper_posh", church: "keeper_pastoral",
    blacksmith: "keeper_plain", motel: "keeper_plain", barber: "keeper_plain",
    tim: "keeper_mixed", tattoo: "keeper_mixed", restaurant: "keeper_mixed", coffee: "coffee",
    chinese: "keeper_mixed", clamshack: "keeper_brooklyn", gift1: "gift1", gift2: "gift2"
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
    var invOpen, invSel, look, sensedWater, vendor, pendingVendor, townsfolk, sensedGarden, crowd;

    function freshCharacter() {
      meters = { hp: 100, hpMax: 100, fatigue: 0, fatigueMax: 100, satiation: 100, satiationMax: 100, comfort: 0 };
      character = { ticket: null, signalsSeen: new Set(), events: { clicks: [], brassRejected: false, anchorRejected: false } };
      // the run-context shared with the dungeon controller: one inventory, one
      // message log, one turn counter, across town and dungeon.
      shared = { meters: meters, character: character, inventory: [], messages: [], turn: 0 };
      placeId = "TOWN"; dungeon = null; dead = false; won = false;
      invOpen = false; invSel = 0; look = { active: false, x: 0, y: 0 };
      returnTile = null; pendingDoor = null; pendingCounter = null; sensedWater = false; pendingVendor = false; sensedGarden = false;
      buildPlaces();
      player = { x: places.TOWN.spawn.x, y: places.TOWN.spawn.y };
      // every actor runs on the energy scheduler: it gains its SPEED in energy
      // each player town-turn and acts whenever energy >= 100 (ADOM-style).
      vendor = { id: "vendor", x: 31, y: 9, frozen: false, glyph: "v", name: "the hot dog vendor", voiceId: "vendor", isVendor: true, home: { x: 31, y: 7 }, radius: 9, speed: 90, energy: 0, acts: 0 };
      townsfolk = [                                       // flavor walkers anchored to a home patch
        { id: "nuns", voiceId: "nuns", x: 44, y: 24, glyph: "n", name: "a pair of nuns", frozen: false, home: { x: 44, y: 25 }, radius: 6, speed: 70, energy: 0, acts: 0 },
        { id: "farmers", voiceId: "farmers", x: 20, y: 25, glyph: "f", name: "a farmer", frozen: false, home: { x: 20, y: 25 }, radius: 7, speed: 90, energy: 0, acts: 0 },
        { id: "senorita", voiceId: "senorita", x: 31, y: 30, glyph: "s", name: "a señorita", frozen: false, home: { x: 31, y: 30 }, radius: 8, speed: 90, energy: 0, acts: 0 }
      ];
      crowd = [];                                         // the filler population (R3)
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
      places.TOWN = buildTown();
      Object.keys(INTERIORS).forEach(function (id) { places[id] = buildInterior(id); });
    }

    // The harbour town — a SPRAWL. Street hierarchy is town law (TOWN LAW):
    // 4-wide MAIN streets form a T (vertical stem to the harbour + a top cross
    // bar); 3-wide SECONDARY streets branch off; the red-light district is
    // 2-wide alleys plus a 1-wide one. Width signals respectability. The harbour
    // is the front door (cheap near the water, quality rising inland). Buildings
    // face the streets; the island folds into the harbour rail (012).
    function buildTown() {
      var g = blank();
      var streets = [], districts = {};
      function street(id, district, x0, y0, x1, y1) {
        carve(g, x0, y0, x1, y1);
        streets.push({ id: id, district: district, width: Math.min(x1 - x0 + 1, y1 - y0 + 1), rect: [x0, y0, x1, y1] });
      }
      function zone(name, x0, y0, x1, y1) { districts[name] = { rect: [x0, y0, x1, y1], doors: [] }; }
      // --- the T: 4-wide main streets ---
      street("main-bar", "main", 6, 5, 57, 8);        // the cross bar (top)
      street("main-stem", "main", 30, 5, 33, 37);     // the stem, down to the harbour
      // --- 3-wide secondary streets ---
      street("sec-west", "shops", 11, 8, 13, 26);
      street("sec-east", "civic", 50, 8, 52, 28);
      street("sec-mid", "shops", 8, 24, 52, 26);       // the mid cross
      street("dock-st", "waterfront", 6, 32, 57, 34);  // the docks road (cheap, by the water)
      // --- the red-light district: the streets PINCH as you approach (Novigrad) ---
      street("red-approach", "redlight", 8, 26, 9, 32);   // 2-wide, narrowing down
      street("red-alley", "redlight", 8, 34, 15, 35);     // 2-wide
      street("red-slit", "redlight", 12, 35, 12, 37);     // a 1-wide alley
      // the harbour, curving along the bottom
      fill(g, 3, 38, 60, 39, "~");
      // the fountain plaza where the T crosses (open square; the fountain lands in R3)
      carve(g, 26, 9, 37, 15);

      zone("main", 6, 2, 57, 8); zone("tourist-strip", 18, 2, 46, 5);
      zone("shops", 8, 9, 26, 26); zone("waterfront", 6, 30, 57, 37); zone("redlight", 6, 26, 16, 37);

      var doors = {}, features = {};
      function bld(dx, dy, to, glyph, name, district) { doors[key(dx, dy)] = { to: to, glyph: glyph, label: name }; if (districts[district]) districts[district].doors.push(key(dx, dy)); }

      // --- main street (posh, inland/top): gate + hotel + bank + spa + saloon ---
      bld(31, 5, "DUNGEON", ">", "the Dungeon Gate", "main");
      bld(24, 5, "bank", "B", "the Bank", "main");
      bld(38, 5, "hotel", "H", "the Gilded Kraken Hotel", "main");
      bld(46, 5, "spa", "P", "the Spa", "main");
      bld(10, 5, "saloon", "S", "the Saloon", "tourist-strip");
      bld(53, 5, "tim", "G", "Tim's Tour Guide", "main");
      // --- shops district (around the plaza / the west secondary) ---
      bld(12, 12, "kiosk", "K", "the Admission Kiosk", "shops");
      bld(12, 16, "agency", "A", "the Tour Agency", "shops");
      bld(35, 12, "coffee", "O", "the Coffee Shop", "shops");
      bld(20, 25, "barber", "R", "the Barber", "shops");
      // --- civic / east secondary ---
      bld(51, 14, "restaurant", "E", "the Restaurant", "civic");
      bld(51, 20, "tattoo", "Z", "the Tattoo Parlor", "civic");
      bld(51, 25, "blacksmith", "L", "the Blacksmith", "civic");
      bld(44, 25, "church", "C", "the Church", "civic");
      // --- waterfront (cheap, by the water): motel at the edge, boat, the Anchor, bodega ---
      bld(53, 33, "motel", "M", "the Motel", "waterfront");
      bld(40, 33, "boat", "Y", "Boat Rental", "waterfront");
      bld(26, 33, "tavern", "T", "the Rusty Anchor", "waterfront");
      bld(15, 33, "bodega", "D", "the Bodega", "redlight");
      // --- the red-light district (alleys) ---
      bld(10, 35, "redshop", "x", "the Red Light Shop", "redlight");
      bld(9, 30, "redlit", "Q", "the Quay's End", "redlight");
      // --- the tourist strip: two WARRING gift shops flanking the gate ---
      bld(28, 5, "gift1", "1", "Ye Olde Dungeon Gifte", "tourist-strip");
      bld(34, 5, "gift2", "2", "Authentic Dungeon Souvenirs", "tourist-strip");
      // --- scattered eateries (never a food court) ---
      bld(51, 11, "chinese", "N", "the Golden Turnstile (takeout)", "civic");
      bld(33, 33, "clamshack", "F", "the Clam Shack", "waterfront");
      // --- filler buildings (varied; locked or empty stubs, no content yet) ---
      bld(16, 5, "locked", "h", "a shuttered townhouse", "tourist-strip");
      bld(49, 8, "locked", "h", "a boarded-up shop", "main");
      bld(6, 33, "empty", "w", "a harbour warehouse", "waterfront");
      // gates
      doors[key(26, 33)].gate = function () { if (meters.comfort >= 2) { act("anchor"); return { block: SIG["005"].t }; } return null; };
      doors[key(31, 5)].gate = function () { if (!character.ticket) return { block: "The gate does not open for the unticketed." }; return null; };
      // the harbour rail: the island offshore, in plain sight and plainly off-limits (012)
      features[key(31, 37)] = { type: "lookout", glyph: "≈", label: "harbour rail", text: SIG["012"].t, act: "lookout" };

      // --- OPEN SPACE: a fountain, a public garden, a stable, a dead-end view ---
      g[12][31] = "~"; g[12][32] = "~"; g[13][31] = "~"; g[13][32] = "~";        // the fountain (you walk around it)
      features[key(31, 11)] = { type: "view", glyph: "≈", col: "water", label: "the fountain plaza", text: "The fountain mutters to itself, municipal and content. Coins glint in it, unclaimed.", act: "look" };
      carve(g, 40, 9, 47, 14);                                                   // the public garden, off the bar
      ["41,10", "45,11", "43,13", "46,9"].forEach(function (t) { var p = t.split(","); g[+p[1]][+p[0]] = "t"; });   // trees
      features[key(43, 12)] = { type: "view", glyph: "t", col: "nature", label: "the public garden", text: "A square of deliberate green: a bench, two trees, and a sign forbidding the obvious.", act: "look" };
      bld(57, 33, "empty", "u", "the Stable", "waterfront");                     // a stable on the road out of town
      carve(g, 57, 34, 57, 37);                                                  // a dead-end down to the water
      features[key(57, 37)] = { type: "view", glyph: "=", col: "signal", label: "a quiet railing", text: "A railing, a bench, the harbour breathing below. The island sits offshore, indifferent. The wrong turn was the right one.", act: "look" };
      // the red-light archway — you feel the threshold (Clock Town)
      features[key(8, 27)] = { type: "view", glyph: "∩", col: "redlight", label: "the red-light archway", text: "An arch of dim red glass. Past it the streets pinch and the lamps go pink. You are somewhere else now.", act: "look" };
      [key(10, 35), key(9, 30), key(15, 33)].forEach(function (kk) { if (doors[kk]) doors[kk].red = true; });   // red-tinted doors

      // --- THE CURIOSITY (Dragon Quest): a hidden garden behind the church,
      // found by a curious detour, telegraphed by a draft (secret grammar law) ---
      carve(g, 45, 28, 48, 30); g[27][46] = ".";                                 // the gap + the pocket garden
      features[key(46, 29)] = { type: "shrine", glyph: "¶", col: "nature", label: "a forgotten shrine", text: "Behind the church, out of the Bureau's sightline: a small shrine, two candles, and a quiet you may keep.", act: "shrine" };

      return { id: "TOWN", title: "The Harbour", grid: g, doors: doors, features: features, spawn: { x: 31, y: 20 }, meta: { streets: streets, districts: districts } };
    }

    function buildInterior(id) {
      var spec = INTERIORS[id];
      var g = blank();
      carve(g, 8, 3, 32, 13);
      var doors = {}, features = {};
      if (spec.counter) features[key(20, 5)] = { type: "counter", glyph: "$", label: spec.counter, act: spec.act };   // empty stubs have no counter
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
      // a townsfolk NPC (vendor or walker): contact begins the conversation
      if (placeId === "TOWN") {
        var npcList = npcs();
        for (var ni = 0; ni < npcList.length; ni++) {
          var npc = npcList[ni];
          if (nx !== npc.x || ny !== npc.y) continue;
          pendingDoor = null; pendingCounter = null;
          if (npc.isVendor) {                              // the hot dog vendor — only Enter buys
            pendingVendor = true;
            var vb = voice("vendor");
            if (!speak(vb, "greeting")) logMsg("The vendor waves you over to the cart.");
            speak(vb, "pitch"); speak(vb, "reaction", playerState());
            logMsg("Buy a hot dog? — Enter to accept; step away to decline.");
            return { moved: false, bumpedVendor: true, event: lastEvent };
          }
          pendingVendor = false;                           // a walker — they just talk
          var vt = voice(npc.voiceId);
          if (!speak(vt, "greeting")) logMsg(npc.name + " nods at you.");
          speak(vt, "smalltalk"); speak(vt, "reaction", playerState());
          return { moved: false, bumpedNpc: true, event: lastEvent };
        }
      }
      var d = P.doors[key(nx, ny)];
      if (d) { pendingCounter = null; pendingVendor = false; pendingDoor = { meta: d, x: nx, y: ny }; logMsg(doorReveal(d)); return { moved: false, bumpedDoor: true, event: lastEvent }; }
      var f = P.features[key(nx, ny)];
      if (f) {
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
      player.x = nx; player.y = ny; pendingDoor = null; pendingCounter = null; pendingVendor = false; lastEvent = null;
      shared.turn += 1;
      walkersStep();
      // the senses emitter (town): the harbour makes itself heard near the water
      var nearW = waterAdjacent(P, nx, ny);
      if (nearW && !sensedWater) senses("Down at the quay the water laps at the stone, patient and cold.", "heard", "OBJ");
      sensedWater = nearW;
      // secret grammar: the hidden church garden is telegraphed by a draft
      if (!sensedGarden && Math.max(Math.abs(nx - 46), Math.abs(ny - 27)) <= 1) { senses("A cool draft slips from behind the church — there is a way around.", "heard", "OBJ"); sensedGarden = true; }
      maybeGiftDuel();
      return { moved: true };
    }
    function waterAdjacent(P, x, y) {
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var ny = y + dy, nx = x + dx;
        if (ny >= 0 && nx >= 0 && ny < H && nx < W && P.grid[ny][nx] === "~") return true;
      }
      return false;
    }
    // the town actors run on an ENERGY SCHEDULER (ADOM-style): each player
    // town-turn every actor gains its SPEED in energy and acts (once per 100).
    function npcs() { if (placeId !== "TOWN") return []; return (vendor ? [vendor] : []).concat(townsfolk || []).concat(crowd || []); }
    function occupied(list, self, x, y) { for (var i = 0; i < list.length; i++) if (list[i] !== self && list[i].x === x && list[i].y === y) return true; return false; }
    // an NPC-walkable exterior tile: a STREET/PLAZA floor tile, not a door, not a
    // feature, not water/trees, not the player, not another actor.
    function npcWalkable(T, list, self, x, y) {
      if (x < 0 || y < 0 || x >= W || y >= H) return false;
      if (T.grid[y][x] !== ".") return false;
      if (T.doors[key(x, y)] || T.features[key(x, y)]) return false;
      if (x === player.x && y === player.y) return false;
      return !occupied(list, self, x, y);
    }
    function actorStep(npc, T, list) {                    // ONE movement action
      var ds = [[0, -1], [0, 1], [-1, 0], [1, 0]], opts = [];
      for (var i = 0; i < ds.length; i++) { var x = npc.x + ds[i][0], y = npc.y + ds[i][1]; if (npcWalkable(T, list, npc, x, y)) opts.push({ x: x, y: y }); }
      if (!opts.length) return;
      if (npc.home) {                                     // home-patch bias (errand loops arrive in R2)
        var near = opts.filter(function (o) { return (Math.abs(o.x - npc.home.x) + Math.abs(o.y - npc.home.y)) <= (npc.radius || 6); });
        if (near.length) opts = near;
        else opts.sort(function (a, b) { return (Math.abs(a.x - npc.home.x) + Math.abs(a.y - npc.home.y)) - (Math.abs(b.x - npc.home.x) + Math.abs(b.y - npc.home.y)); }).splice(1);
      }
      var p = opts[Math.floor(Math.random() * opts.length)]; npc.x = p.x; npc.y = p.y; npc.acts = (npc.acts || 0) + 1;
    }
    function walkersStep() {                              // the scheduler (one player turn)
      if (placeId !== "TOWN") return;
      var T = places.TOWN, list = npcs();
      list.forEach(function (npc) {
        if (npc.frozen) return;
        npc.energy = (npc.energy || 0) + (npc.speed || 100);
        var guard = 0;
        while (npc.energy >= 100 && guard++ < 4) { actorStep(npc, T, list); npc.energy -= 100; }
      });
    }
    // the two gift shops trade dueling barks when the visitor is near both
    function maybeGiftDuel() {
      if (placeId !== "TOWN" || typeof TD_VOICES === "undefined") return;
      if (cheby(player, { x: 28, y: 5 }) > 5 || cheby(player, { x: 34, y: 5 }) > 5) return;
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
      shared.turn += 1; walkersStep();   // a wait is a player turn; the town keeps moving
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
      if (to === "redlit") { senses("A red lamp, a velvet rope, and a card: “Closed for renovations.” The Quay's End keeps its counsel.", "seen", "OBJ"); return; }   // exterior only
      if (to === "locked") { logMsg("The door is locked; no one answers. (A stub, for now.)"); return; }   // filler stub
      returnTile = { x: player.x, y: player.y };                       // come back where we entered
      placeId = to; player = { x: places[to].spawn.x, y: places[to].spawn.y };
      logMsg((places[to].sign || []).join("  —  "));
      var vb = voice(KEEPER[to]); if (vb) { speak(vb, "greeting"); speak(vb, "reaction", playerState()); }   // the keeper speaks
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
        player: { x: player.x, y: player.y },
        creatures: npcs().map(function (n) { return { x: n.x, y: n.y, kind: "vendor", glyph: n.glyph, name: n.name, hp: 1, maxHp: 1, dmg: 0 }; }),
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
      _goto: function (id) { pendingDoor = null; pendingCounter = null; pendingVendor = false; placeId = id; player = { x: places[id].spawn.x, y: places[id].spawn.y }; return view(); },
      _pendingCounter: function () { return pendingCounter ? pendingCounter.act : null; },
      _pendingVendor: function () { return pendingVendor; },
      _vendor: function () { return vendor; },
      _setVendor: function (x, y) { vendor = { x: x, y: y, frozen: true, glyph: "v", name: "the hot dog vendor", voiceId: "vendor", isVendor: true }; return vendor; },
      _freezeVendor: function (b) { if (vendor) vendor.frozen = !!b; (townsfolk || []).forEach(function (n) { n.frozen = !!b; }); (crowd || []).forEach(function (n) { n.frozen = !!b; }); },
      _actors: function () { return npcs(); },
      _addActor: function (a) { a.energy = a.energy || 0; a.acts = a.acts || 0; if (typeof a.speed !== "number") a.speed = 100; crowd.push(a); return a; },
      _step: function () { walkersStep(); },
      _voice: function (id) { return voice(id); },
      _keepers: function () { return KEEPER; },
      _townMeta: function () { return places.TOWN.meta; },
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
