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
  test("Agency kiosk sets the guided ticket and shows OBJ fine print + SUBJ patter", function () {
    var g = game();
    var r = g._interact("agency");
    eq(g._character().ticket, "agency");
    assert(g._character().signalsSeen.has("001"), "objective fine print 001 seen");
    assert(g._character().signalsSeen.has("002"), "subjective patter 002 seen");
    inc(r.event, "Valid in Guided Zones", "the OBJ fine print is shown and is true");
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

  var pass = results.filter(function (r) { return r.ok; }).length;
  return { pass: pass, fail: results.length - pass, results: results };
}
