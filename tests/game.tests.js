// Tourist Dungeon — TD_GAME tests (town, the two forks, signals, Brass Door,
// spatial postmortem, session persistence). Defines TD_GAME_TESTS(), run by
// tests/run_game.py against rng + interpreter + mapmode + generator + game.

function TD_GAME_TESTS() {
  var results = [];
  function test(n, fn) { try { fn(); results.push({ name: n, ok: true }); } catch (e) { results.push({ name: n, ok: false, err: (e && e.message) || String(e) }); } }
  function assert(c, m) { if (!c) throw new Error(m || "assert"); }
  function eq(a, b, m) { if (a !== b) throw new Error((m || "eq") + ": expected " + JSON.stringify(b) + " got " + JSON.stringify(a)); }
  function inc(h, n, m) { if (String(h).indexOf(n) < 0) throw new Error((m || "inc") + ": " + JSON.stringify(n) + " not in " + JSON.stringify(h)); }
  function game(seed) { return TD_GAME.create(TD_GEN.generate(seed || 3)); }

  // -------------------------------------------------------------- FORK 1
  test("Agency: SUBJ patter (002) and OBJ fine print (001) ride the senses channel", function () {
    var g = game();
    g._interact("agency");
    eq(g._character().ticket, "agency");
    assert(g._character().signalsSeen.has("001"), "objective fine print 001 seen");
    assert(g._character().signalsSeen.has("002"), "subjective patter 002 seen");
    var sens = g._shared().messages.filter(function (m) { return m.ch === "senses"; });
    assert(sens.some(function (m) { return /everywhere worth going/.test(m.text) && m.obj === "SUBJ"; }), "002 is SUBJ senses (said)");
    assert(sens.some(function (m) { return /Valid in Guided Zones/.test(m.text) && m.obj === "OBJ"; }), "001 is OBJ senses (said), and true");
    assert(g._shared().messages.some(function (m) { return m.ch === "event" && /Guided Package/.test(m.text); }), "the mechanical fact is an EVENT line");
  });

  // ----------------------------------------------- CHANNEL LAW --------------
  test("no line ships unchanneled; 002 and 006 are SUBJ senses", function () {
    var g = game();
    g._interact("agency"); g._interact("hotel");
    var msgs = g._shared().messages;
    assert(msgs.length > 0, "there are lines");
    assert(msgs.every(function (m) { return m.ch === "event" || m.ch === "senses"; }), "every line declares a channel");
    assert(msgs.some(function (m) { return m.ch === "event"; }), "the event stream is used");
    var subj = msgs.filter(function (m) { return m.ch === "senses" && m.obj === "SUBJ"; }).map(function (m) { return m.text; }).join(" || ");
    assert(/everywhere worth going/.test(subj), "002 SUBJ senses present");
    assert(/roughing it/.test(subj), "006 SUBJ senses present");
  });

  test("Standard kiosk sets the standard ticket (OBJ all-areas)", function () {
    var g = game();
    var r = g._interact("kiosk");
    eq(g._character().ticket, "standard");
    assert(g._character().signalsSeen.has("003"));
    inc(r.event, "all areas");
  });

  // -------------------------------------------------------------- COMFORT
  test("hotel(+2)/spa(+1) raise the hidden comfort counter and restore the body", function () {
    var g = game();
    g._meters().fatigue = 50;
    g._interact("hotel");
    eq(g._meters().comfort, 2);
    eq(g._meters().fatigue, 0, "the hotel night restores fatigue");
    g._interact("spa");
    eq(g._meters().comfort, 3);
  });

  // -------------------------------------------------------- FORK 2 (Anchor)
  test("the Rusty Anchor doorman admits the plain and rejects the well-kept (OBJ 005)", function () {
    var g = game();
    var admit = g._interact("anchor");
    assert(admit.event.indexOf("Gilded Kraken") < 0, "low comfort is admitted, no scent line");
    g._interact("hotel");                                  // comfort 2
    var reject = g._interact("anchor");
    inc(reject.event, "Not your kind of place", "high comfort gets the scent rejection");
    assert(g._character().events.anchorRejected, "the rejection is recorded");
    assert(g._character().signalsSeen.has("005"));
  });

  // ----------------------------------------------------------------- GATE
  test("the dungeon gate needs a ticket; with one you enter the dungeon", function () {
    var g = game();
    g._interact("gate");
    eq(g._phase(), "town", "no ticket — the gate does not open");
    g._interact("kiosk");
    g._interact("gate");
    eq(g._phase(), "dungeon", "ticket in hand — you cross into the dungeon");
  });

  // ----------------------------------------------------------- BRASS DOOR
  test("the Brass Door rejects an agency ticket (OBJ 004) and admits standard", function () {
    var ga = game();
    ga._interact("agency");
    var blocked = ga._brassCheck();
    assert(blocked && blocked.block, "agency is blocked at the Brass Door");
    inc(blocked.block, "not valid beyond this point");
    assert(ga._character().events.brassRejected);

    var gs = game();
    gs._interact("kiosk");
    eq(gs._brassCheck(), null, "standard passes the Brass Door");
  });

  // --------------------------------------------------------------- SIGNALS
  test("the 12 signals carry the right channels (9 OBJ / 3 SUBJ)", function () {
    var sig = g_sig();
    var obj = 0, subj = 0, n = 0;
    for (var i = 1; i <= 12; i++) { var c = sig[("00" + i).slice(-3)]; n++; if (c.ch === "OBJ") obj++; else subj++; }
    eq(n, 12); eq(obj, 9); eq(subj, 3);
    function g_sig() { return game().SIG; }
  });

  // ---------------------------------------------------- SPATIAL POSTMORTEM
  test("the postmortem cites spatial facts and attributes the forks", function () {
    var g = game();
    var c = g._character();
    c.events.brassRejected = true;
    c.events.anchorRejected = true;
    c.events.clicks = [2];
    var pm = g.postmortem();
    inc(pm.attributions.join(" || "), "Brass Door", "ticket fork attributed");
    inc(pm.attributions.join(" || "), "Rusty Anchor", "comfort fork attributed");
    inc(pm.spatial.join(" "), "Level 2", "cites the spatial fact (the click on Level 2)");
    inc(pm.spatial.join(" "), "click", "the stair click is the spatial breadcrumb");
  });

  // ------------------------------------------------- SESSION PERSISTENCE
  test("world facts persist across lives while the character resets", function () {
    var g = game();
    g._interact("agency");
    g._character().events.brassRejected = true;            // learned this life
    var livesBefore = g.session.lives;
    g.newCharacter();
    assert(g.session.knowledge.size >= 1, "the world remembers the Brass Door lesson");
    eq(g._character().ticket, null, "the new character has no ticket");
    eq(g._meters().comfort, 0, "comfort resets");
    eq(g.session.lives, livesBefore + 1, "a new life is counted");
  });

  // --------------------------------------------------------- TURN / WAIT / GET
  test("waiting passes a turn (in town too); get finds nothing on the harbour stones", function () {
    var g = game();
    var t0 = g._turn();
    g.wait();
    eq(g._turn(), t0 + 1, "a turn passes when you wait");
    var r = g.get();
    assert(!r.got, "there is nothing to pick up in the street");
  });

  // ---------------------------------------------------------------- THE PACK
  test("the pack: eating a ration fills the belly, applying a bandage heals", function () {
    var g = game();
    g._meters().satiation = 40; g._meters().hp = 50;
    g._inventory().push({ kind: "ration", name: "a bun", desc: "d", use: "eat", food: 60 });
    g._inventory().push({ kind: "bandage", name: "a bandage", desc: "d", use: "heal", heal: 30 });
    g.toggleInventory();
    g.invSelect(0); g.useSelected();                       // eat the ration
    eq(g._meters().satiation, 100, "a ration tops the belly up (capped)");
    g.invSelect(0); g.useSelected();                       // apply the bandage
    eq(g._meters().hp, 80, "the bandage heals 30");
    eq(g._inventory().length, 0, "both consumables are spent");
  });

  test("the ticket rides in the pack as an inspectable item and cannot be dropped", function () {
    var g = game();
    g._interact("kiosk");                                  // standard ticket
    var list = g._invList();
    assert(list.some(function (i) { return i.kind === "ticket"; }), "the ticket shows up in the pack");
    var idx = list.map(function (i) { return i.kind; }).indexOf("ticket");
    g.toggleInventory(); g.invSelect(idx);
    var r = g.dropSelected();
    assert(!r.dropped, "the ticket cannot be dropped");
    eq(g._character().ticket, "standard", "you still hold admission");
  });

  // -------------------------------------------------------------------- LOOK
  test("look names the tile under the cursor and toggles back off", function () {
    var g = game();
    var r = g.lookToggle();
    assert(r.look, "look is on");
    inc(g._lastEvent(), "Look", "the look line is shown");
    inc(g._lastEvent(), "yourself", "the cursor starts on you");
    g.lookToggle();
    assert(!g._look().active, "look toggles off");
  });

  // ----------------------------------- PURCHASES ARE CONVERSATIONS ----------
  test("a purchase is a conversation: contact pitches, only Enter closes the deal", function () {
    var g = game();
    g._goto("kiosk");
    for (var i = 0; i < 6; i++) g.move("up");             // up to the counter's doorstep
    var r = g.move("up");                                 // bump the desk
    assert(r.bumpedCounter, "bumping the desk begins a conversation, not a sale");
    eq(g._character().ticket, null, "no ticket changes hands on contact");
    eq(g._pendingCounter(), "kiosk", "the kiosk's offer is pending");
    inc(g._lastEvent(), "Enter to accept", "a clear offer line is shown");
    g.commit();                                           // Enter closes the deal
    eq(g._character().ticket, "standard", "Enter completes the purchase");
  });

  test("stepping away declines the offer — no deal closes", function () {
    var g = game();
    g._goto("agency");
    for (var i = 0; i < 6; i++) g.move("up");
    g.move("up");                                         // bump the desk
    eq(g._pendingCounter(), "agency", "the Agency's offer is pending");
    g.move("down");                                       // step away
    eq(g._pendingCounter(), null, "stepping away clears the pending sale");
    g.commit();                                           // nothing to close
    eq(g._character().ticket, null, "no ticket was bought");
  });

  // ----------------------------------- FOOD + HUNGER LADDER -----------------
  test("the tavern deal feeds you now and hands you rations for the road", function () {
    var g = game();
    g._meters().satiation = 30;
    g._interact("food");
    var rations = g._inventory().filter(function (i) { return i.kind === "ration"; });
    assert(rations.length >= 2, "two rations land in the pack");
    eq(g._meters().satiation, 100, "the hot meal fills you now");
  });

  test("the HUD carries the named hunger stage", function () {
    var g = game();
    g._meters().satiation = 12;
    eq(g.view().hunger.stage, "Famished");
    g._meters().satiation = 100;
    eq(g.view().hunger.stage, "well fed");
  });

  // ------------------------------------- THE HOT DOG VENDOR (Round 6) -------
  test("the vendor is a conversation: bump pitches in his voice, only Enter buys", function () {
    var g = game();
    var pl = g._player(); g._setVendor(pl.x + 1, pl.y);   // park him beside the spawn (frozen)
    var r = g.move("right");                              // bump the cart
    assert(r.bumpedVendor, "bumping the cart begins a conversation, not a sale");
    eq(g._inventory().filter(function (i) { return i.name === "a hot dog"; }).length, 0, "no hot dog changes hands on contact");
    inc(g._lastEvent(), "Enter to accept", "a clear offer line is shown");
    var spoke = g._shared().messages.filter(function (m) { return m.ch === "senses"; });
    assert(spoke.length >= 1, "the vendor speaks on the senses channel");
    g.commit();                                           // Enter closes the deal
    assert(g._inventory().some(function (i) { return i.name === "a hot dog"; }), "Enter buys a carryable hot dog");
  });

  test("voice lines are channelled and never repeat within a session", function () {
    var g = game();
    var vb = g._voice("vendor");
    var seen = {}, n = 0, l;
    while ((l = vb.say("pitch"))) { assert(!seen[l.text], "no repeat"); assert(l.ch === "senses" && l.obj, "channelled"); seen[l.text] = 1; if (++n > 20) break; }
    assert(n >= 4, "at least 4 pitch variants");
  });

  // ------------------------------------- HARBOUR TOWN (Round 7) -------------
  test("town layout: every building door is reachable from spawn", function () {
    var g = game(); var v = g.view();
    var Wv = v.w, Hv = v.h, grid = v.grid, sp = v.player;
    function flo(x, y) { return y >= 0 && x >= 0 && y < Hv && x < Wv && grid[y][x] === "."; }
    var seen = {}, q = [[sp.x, sp.y]]; seen[sp.x + "," + sp.y] = 1;
    var DV = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    while (q.length) { var c = q.shift(); DV.forEach(function (d) { var nx = c[0] + d[0], ny = c[1] + d[1], k = nx + "," + ny; if (!seen[k] && flo(nx, ny)) { seen[k] = 1; q.push([nx, ny]); } }); }
    var doors = v.doors || {}, bad = [];
    Object.keys(doors).forEach(function (k) { if (!seen[k]) bad.push(k + "->" + doors[k].to); });
    eq(bad.length, 0, "all doors reachable from spawn; unreachable: " + bad.join(", "));
    assert(Object.keys(doors).length >= 14, "the town has its full cast of buildings (" + Object.keys(doors).length + ")");
  });

  test("the harbour rail carries the island sightline (012)", function () {
    var g = game(); var feats = g.view().features || {}, rail = null;
    Object.keys(feats).forEach(function (k) { if (feats[k].act === "lookout") rail = feats[k]; });
    assert(rail && /monastery|graveyard|cannot be reached/.test(rail.text), "the rail shows the island, plainly off-limits (012)");
  });

  test("every named building has a voice-specced keeper on the accent map", function () {
    var g = game(); var K = g._keepers(), ACC = ["brooklyn", "posh", "pastoral", "plainspoken", "mixed"];
    Object.keys(K).forEach(function (b) {
      var s = TD_VOICES.byId(K[b]);
      assert(s && !s.placeholder, b + ": has a real keeper voice (" + K[b] + ")");
      assert(ACC.indexOf(s.accent) >= 0, b + ": keeper accent on the map (" + s.accent + ")");
    });
  });

  test("townsfolk walk the streets and never trap or sit on the player", function () {
    var g = game(); var v = g.view();
    assert(v.grid[v.player.y][v.player.x] === ".", "spawn is on floor");
    assert(v.creatures.length >= 2, "two or three walkers are out (" + v.creatures.length + ")");
    v.creatures.forEach(function (c) { assert(v.grid[c.y][c.x] === ".", "a walker stands on floor"); });
    g._freezeVendor(false);
    for (var i = 0; i < 80; i++) g.move(i % 2 ? "left" : "right");
    g.view().creatures.forEach(function (c) { assert(!(c.x === g._player().x && c.y === g._player().y), "no walker ever sits on the player"); });
  });

  // ----------------------------------- TOWN LAW: STREET WIDTHS (v13) --------
  test("street widths follow the 4/3/2/1 hierarchy, carved as declared", function () {
    var g = game(); var meta = g._townMeta(), v = g.view();
    function carvedWidth(seg) {
      var r = seg.rect, horizontal = (r[2] - r[0]) > (r[3] - r[1]), c;
      if (horizontal) { var x = Math.floor((r[0] + r[2]) / 2); c = 0; for (var y = r[1]; y <= r[3]; y++) { var t = v.grid[y][x]; if (t === "." || t === "~") c++; } }
      else { var yy = Math.floor((r[1] + r[3]) / 2); c = 0; for (var xx = r[0]; xx <= r[2]; xx++) { var t2 = v.grid[yy][xx]; if (t2 === "." || t2 === "~") c++; } }
      return c;
    }
    var by = {}; meta.streets.forEach(function (s) { by[s.id] = s; });
    eq(by["main-bar"].width, 4, "the T's bar is a 4-wide main street");
    eq(by["main-stem"].width, 4, "the T's stem is a 4-wide main street");
    assert(by["sec-west"].width === 3 && by["sec-east"].width === 3, "secondary streets are 3 wide");
    assert(by["red-approach"].width === 2 && by["red-alley"].width === 2, "red-light alleys are 2 wide");
    eq(by["red-slit"].width, 1, "the red-light district has a 1-wide alley");
    meta.streets.forEach(function (s) { assert(carvedWidth(s) >= s.width, s.id + ": carved to at least its declared width (" + carvedWidth(s) + ">=" + s.width + ")"); });
  });

  test("districts are zoned, each with at least one building door", function () {
    var g = game(); var d = g._townMeta().districts;
    ["main", "tourist-strip", "shops", "waterfront", "redlight"].forEach(function (name) {
      assert(d[name] && d[name].doors.length >= 1, name + ": zoned with a door (" + (d[name] ? d[name].doors.length : 0) + ")");
    });
  });

  // ----------------------------------- GIFT-SHOP RIVALRY (v13) --------------
  test("the two gift shops trade rivalry barks near both, never repeating", function () {
    var g = game(); g._freezeVendor(true);                // hush the crowd so the duel isn't blocked
    var seen = {}, barks = 0;
    for (var i = 0; i < 16; i++) {
      g._warp(31, 6);                                      // stand between the two shops
      var before = g._shared().messages.length;
      g.wait();                                            // a town turn triggers the duel (rate-limited)
      g._shared().messages.slice(before).forEach(function (m) {
        if (/Gifte|Authentic Dungeon Souvenirs/.test(m.text)) { assert(!seen[m.text], "no repeated bark: " + m.text); seen[m.text] = 1; barks++; }
      });
    }
    assert(barks >= 2, "the shops bark at each other near the strip (" + barks + ")");
  });

  // ----------------------------------- ENERGY SCHEDULER (v14 R1) -----------
  test("a fast actor acts measurably more than a slow one over 100 turns", function () {
    var g = game(); g._freezeVendor(true);                // hush the default walkers
    var kid = g._addActor({ id: "kid", x: 31, y: 18, glyph: "k", name: "a kid", speed: 130 });
    var nun = g._addActor({ id: "slownun", x: 31, y: 22, glyph: "n", name: "a slow nun", speed: 70 });
    for (var i = 0; i < 100; i++) g.wait();               // each wait is a player turn
    assert(kid.acts > nun.acts, "speed 130 acts more than speed 70 (" + kid.acts + " vs " + nun.acts + ")");
    assert(kid.acts > 100 && nun.acts < 100, "roughly 130 vs 70 acts (" + kid.acts + ", " + nun.acts + ")");
  });

  test("a wobbling drunk sailor never steps through a wall", function () {
    var g = game(); g._freezeVendor(true);
    var sailor = g._addActor({ id: "sailor", x: 8, y: 33, glyph: "d", name: "a drunk sailor", speed: 60, wobble: true, type: "sailor", home: { x: 8, y: 33 } });
    for (var i = 0; i < 120; i++) { g.wait(); var grid = g.view().grid; assert(grid[sailor.y][sailor.x] === ".", "the sailor stands on a street floor tile, never inside a wall"); }
  });

  // ----------------------------------- ERRAND LOOPS (v14 R2) ---------------
  test("NPCs travel via streets only, reach destinations, and dwell", function () {
    var g = game(); var v = g.view();
    function isStreet(x, y) { return v.grid[y][x] === "." && !v.doors[x + "," + y] && !v.features[x + "," + y]; }
    var dwelled = {};
    for (var i = 0; i < 400; i++) {
      g.wait();
      g._actors().forEach(function (a) {
        assert(isStreet(a.x, a.y), a.id + " on a non-street tile (" + a.x + "," + a.y + "='" + v.grid[a.y][a.x] + "')");
        if (a.dwell > 0) dwelled[a.id] = true;             // arrived at a destination
      });
    }
    ["nuns", "farmers", "senorita", "vendor"].forEach(function (id) { assert(dwelled[id], id + " reached a destination and dwelt"); });
  });

  test("the Bureau patrol walks its full route over time", function () {
    var g = game();
    var wp = { main: [31, 14], plaza: [31, 10], "strip-a": [28, 6], alley: [8, 28] }, hit = {};
    for (var i = 0; i < 1000; i++) {
      g.wait();
      var gd = g._actors().filter(function (a) { return a.id === "guard1"; })[0];
      Object.keys(wp).forEach(function (n) { if (Math.max(Math.abs(gd.x - wp[n][0]), Math.abs(gd.y - wp[n][1])) <= 1) hit[n] = true; });   // within a tile (busy streets)
    }
    Object.keys(wp).forEach(function (n) { assert(hit[n], "the guard visited waypoint " + n); });
  });

  // ----------------------------------- POPULATION + OCCUPANCY (v14 R3) -----
  function cd(a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }

  test("every enterable establishment has 2-4 occupants (friendly)", function () {
    var g = game();
    ["hotel", "restaurant", "coffee", "bodega", "saloon", "bank", "church", "spa"].forEach(function (id) {
      g._goto(id); var v = g.view();
      assert(v.creatures.length >= 2 && v.creatures.length <= 4, id + ": 2-4 occupants (" + v.creatures.length + ")");
      assert(v.creatures.every(function (c) { return c.friendly; }), id + ": occupants are friendly, not threats");
    });
  });

  test("the exterior crowd is sized to feel busy, skewed by district", function () {
    var g = game();
    var ext = g._actors().filter(function (a) { return !a.isVendor && a.type !== "kid" && a.type !== "chaperone"; });
    assert(ext.length >= 18 && ext.length <= 26, "18-25ish exterior crowd (" + ext.length + ")");
    var dockSailor = ext.filter(function (a) { return a.type === "dockworker" || a.type === "sailor"; }).length;
    assert(dockSailor >= 6, "the waterfront skews dock workers + sailors (" + dockSailor + ")");
    assert(ext.filter(function (a) { return a.type === "visitor"; }).length >= 3, "the tourist strip has visitors");
    assert(ext.filter(function (a) { return a.type === "guard"; }).length >= 2, "patrols are out");
  });

  test("the school troop stays together — no kid more than 3 tiles from the chaperone", function () {
    var g = game();
    for (var i = 0; i < 250; i++) {
      g.wait();
      var as = g._actors(), chap = as.filter(function (a) { return a.id === "chaperone"; })[0];
      as.filter(function (a) { return a.type === "kid"; }).forEach(function (k) { assert(cd(k, chap) <= 3, "a kid drifted to " + cd(k, chap) + " tiles from the chaperone"); });
    }
  });

  // ----------------------------------- EXIT + HORIZON (v14 R4) -------------
  test("the exit tile prompts to leave; n steps you back; y closes the session", function () {
    var g = game(); var ex = g._exitTile();
    g._warp(ex.x - 1, ex.y);
    assert(!g._pendingExit(), "no prompt before reaching the exit tile");
    g.move("right");
    assert(g._pendingExit() && g.view().exitPrompt, "stepping onto the exit tile prompts");
    g.cancelExit();
    assert(!g._pendingExit() && g._player().x === ex.x - 1 && g._player().y === ex.y, "n steps you back, safely");
    g._warp(ex.x - 1, ex.y); g.move("right"); g.confirmExit();
    assert(g.view().left, "y leaves town and closes the session");
  });

  test("three horizon landmarks exist and read on the senses channel", function () {
    var g = game(); var feats = g.view().features;
    var labels = Object.keys(feats).map(function (k) { return feats[k].label || ""; });
    ["castle", "monastery", "cave"].forEach(function (w) { assert(labels.some(function (l) { return new RegExp(w, "i").test(l); }), "a " + w + " landmark exists"); });
    g._warp(6, 7); var before = g._shared().messages.length; g.move("up");   // step onto the castle lookout
    var sens = g._shared().messages.slice(before).filter(function (m) { return m.ch === "senses"; });
    assert(sens.some(function (m) { return /castle/i.test(m.text) && m.kind === "seen"; }), "looking at the castle emits a senses/seen line");
  });

  var pass = results.filter(function (r) { return r.ok; }).length;
  return { pass: pass, fail: results.length - pass, results: results };
}
