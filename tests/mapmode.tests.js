// Tourist Dungeon — visual map mode tests. Defines TD_MAP_TESTS(), run by
// tests/run_map.py in headless Chrome against the REAL engine modules
// (rng + interpreter + mapmode). Movement, door blocking, one-way sealing,
// fog reveal, and hazard contact.

function TD_MAP_TESTS() {
  var results = [];
  function test(name, fn) {
    try { fn(); results.push({ name: name, ok: true }); }
    catch (e) { results.push({ name: name, ok: false, err: (e && e.message) || String(e) }); }
  }
  function assert(c, m) { if (!c) throw new Error(m || "assertion failed"); }
  function eq(a, b, m) { if (a !== b) throw new Error((m || "eq") + ": expected " + JSON.stringify(b) + " got " + JSON.stringify(a)); }
  function includes(h, n, m) { if (String(h).indexOf(n) < 0) throw new Error((m || "includes") + ": " + JSON.stringify(n) + " not in " + JSON.stringify(h)); }

  // a tiny world: node a (level 1) with one north door to b (required).
  function world(extraEdge) {
    return {
      start: "a", year_length: 365, arrival_day: 1, meta: { seed: 1 },
      nodes: { a: { level: 1, title: "Room A" }, b: { level: 1, required: true, title: "Room B" } },
      edges: [Object.assign({ id: "ab", from: "a", to: "b", label: "a door north" }, extraEdge || {})],
      signals: {}
    };
  }
  function ups(g, n) { var r; for (var i = 0; i < n; i++) r = g.move("up"); return r; }

  // ---------------------------------------------------------------- MOVEMENT
  test("avatar walks on floor and is blocked by walls", function () {
    var g = TD_MAP.create(world(), { hazards: false });
    eq(g._player().x, 20); eq(g._player().y, 11);
    var r = g.move("left"); assert(r.moved, "should walk left onto floor");
    eq(g._player().x, 19);
    g.move("left"); g.move("left"); g.move("left");      // to x16 (room edge)
    eq(g._player().x, 16);
    var blocked = g.move("left");                         // x15 is wall
    assert(!blocked.moved, "wall should block");
    eq(g._player().x, 16, "did not pass the wall");
  });

  // ------------------------------------------------------- DIAGONAL MOVEMENT
  test("diagonal keys move the avatar on both axes", function () {
    var g = TD_MAP.create(world(), { hazards: false });
    var p0 = { x: g._player().x, y: g._player().y };
    var r = g.move("ur");                                  // up-right
    assert(r.moved, "diagonal move onto floor");
    eq(g._player().x, p0.x + 1, "x changed");
    eq(g._player().y, p0.y - 1, "y changed");
  });

  // ------------------------------- DOORS: CONTACT REVEALS, ENTER COMMITS ----
  test("bumping a door does NOT open it; it only reveals", function () {
    var g = TD_MAP.create(world(), { hazards: false });
    var r = ups(g, 6);                                     // step into the door tile
    assert(r.bumpedDoor, "contact with a door is a bump, not an opening");
    assert(!r.traversed, "the door did not open on contact");
    eq(g.state.node, "a", "still in room a after the bump");
    includes(r.event, "Enter", "the reveal tells you to press Enter");
  });

  test("Enter opens the bumped door and recenters", function () {
    var g = TD_MAP.create(world(), { hazards: false });
    ups(g, 6);                                             // bump the north door
    var r = g.open();                                      // Enter
    assert(r.opened, "Enter commits the door");
    eq(g.state.node, "b", "now in room b");
    assert(g.isComplete(), "b was the only required node");
  });

  test("a locked door: bump reveals, Enter reports it barred, no crossing", function () {
    var g = TD_MAP.create(world({ requires: ["key"] }), { hazards: false });
    var b = ups(g, 6);
    includes(b.event, "barred", "the reveal shows it is barred");
    var r = g.open();
    assert(!r.opened, "Enter cannot force a barred door");
    includes(r.blocked, "key", "names the missing key");
    eq(g.state.node, "a", "still in room a");
  });

  // ------------------------------------------------------------ ONE-WAY SEAL
  test("a one-way stair seals: no door back after Enter", function () {
    var g = TD_MAP.create(world({ one_way: true }), { hazards: false });
    ups(g, 6); g.open();
    eq(g.state.node, "b");
    var backDoors = Object.keys(g._doors()).filter(function (k) { return g._doors()[k].to === "a"; });
    eq(backDoors.length, 0, "there is no way back through the sealed stair");
  });

  // ------------------------------------------------------------- FOG OF WAR
  test("fog reveals new tiles as the avatar moves", function () {
    var g = TD_MAP.create(world(), { hazards: false });
    var before = g._explored().size;
    g.move("up");                                          // step toward unseen tiles
    assert(g._explored().size > before, "moving should reveal new tiles");
  });

  // ---------------------------------------------------- COMBAT (bump-to-fight)
  test("bumping a creature fights it; enough hits kill it", function () {
    var g = TD_MAP.create(world(), { creatures: true });
    g._setCreatures([{ x: 21, y: 11, kind: "wanderer", hp: 15, maxHp: 15, dmg: 8, name: "a test thing", glyph: "r" }]);
    var r = g.move("right");                               // attack east (do not step onto it)
    assert(r.attacked, "bumping a creature is an attack");
    assert(r.killed, "15 hp < 20 damage — it dies in one blow");
    eq(g._player().x, 20, "the avatar does not move onto the creature");
    eq(g._creatures().length, 0, "the creature is gone");
    eq(g._meters().hp, 100, "no retaliation from a creature already down");
  });

  test("a creature deals damage and can kill the avatar", function () {
    var g = TD_MAP.create(world(), { creatures: true });
    g._meters().hp = 10;
    g._setCreatures([{ x: 21, y: 11, kind: "lurker", hp: 100, maxHp: 100, dmg: 16, name: "a patient lurker", glyph: "L" }]);
    var r = g.move("right");                               // it survives and strikes back
    assert(r.dead, "16 damage to 10 hp is fatal");
    assert(g.isDead());
    var pm = g.postmortem();
    includes(pm.heading, "BUREAU");
    includes(pm.cause, "Level 1", "postmortem cites the spatial fact (the level)");
  });

  // -------------------------------------------------------------- BODY METERS
  test("body meters drain with action; starvation costs HP", function () {
    var g = TD_MAP.create(world(), { creatures: false });
    eq(g._meters().fatigue, 0); eq(g._meters().satiation, 100);
    g.move("left"); g.move("left"); g.move("left");
    assert(g._meters().fatigue > 0, "fatigue rises with action");
    assert(g._meters().satiation < 100, "satiation falls with action");
    g._meters().satiation = 0;
    var hpBefore = g._meters().hp;
    g.move("left");                                        // a step while starving
    assert(g._meters().hp < hpBefore, "starvation drains HP");
  });

  var pass = results.filter(function (r) { return r.ok; }).length;
  return { pass: pass, fail: results.length - pass, results: results };
}
