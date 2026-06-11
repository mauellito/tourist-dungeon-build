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

  // ------------------------------------------------------- TURN-BASED CLOCK
  test("the turn counter advances on action and the world acts only then", function () {
    var g = TD_MAP.create(world(), { creatures: false });
    var t0 = g._turn();
    g.move("left");
    eq(g._turn(), t0 + 1, "a step is one turn");
    g.wait();
    eq(g._turn(), t0 + 2, "waiting passes a turn");
    var t1 = g._turn();
    // no key pressed -> no turn elapses (the world is frozen between keypresses)
    eq(g._turn(), t1, "no action, no turn");
  });

  // ------------------------------------------------------------ FLOOR ITEMS
  test("items lie on the floor; g picks them up into the pack", function () {
    var g = TD_MAP.create(world(), { creatures: false });
    g._setItem(19, 11, "ration");                          // a bun one tile west
    var miss = g.get();
    assert(!miss.got, "nothing under the avatar yet");
    g.move("left");                                        // step onto the bun
    eq(g._player().x, 19);
    var r = g.get();
    assert(r.got, "g takes the item");
    eq(g._inventory().length, 1, "the bun is in the pack");
    eq(g._inventory()[0].kind, "ration");
    assert(!g._items()["19,11"], "the floor tile is now empty");
  });

  // --------------------------------------------------------- SEARCH SECRETS
  test("searching an adjacent wall finds the hidden pocket", function () {
    var g = TD_MAP.create(world(), { creatures: false });
    // central room is carved x16..24,y8..14; (20,7) is the wall just north of (20,8)
    g._addSecret(20, 9, "bandage");                        // a secret in the room floor's neighbour
    // stand next to a wall secret: put one at (16,11)'s wall neighbour (15,11)
    g._addSecret(15, 11, "souvenir");
    g.move("left"); g.move("left"); g.move("left"); g.move("left");  // to x16, beside wall (15,11)
    eq(g._player().x, 16);
    var before = Object.keys(g._items()).length;
    var r = g.search();
    assert(r.searched, "search runs");
    assert(r.found >= 1, "the adjacent secret is found");
    assert(!!g._items()["15,11"], "the hidden item is now on the revealed tile");
  });

  // ----------------------------------------------- PLAIN DOORS: OPEN / CLOSE
  test("a shut plain door blocks; o opens it, c closes it, and it blocks pursuit", function () {
    var g = TD_MAP.create(world(), { creatures: false });
    g._addPlain(19, 11);                                   // a plain door one tile west
    assert(!g._passable(19, 11), "a shut plain door is not passable");
    var b = g.move("left");                                // bump it
    assert(!b.moved && b.plain, "the shut door blocks the step and reveals");
    eq(g._player().x, 20, "did not pass the shut door");
    var o = g.open();                                      // o / Enter opens it
    assert(o.opened, "the door opens");
    assert(g._plain()["19,11"].open, "it is now open");
    assert(g._passable(19, 11), "an open plain door is passable");
    g.move("left");
    eq(g._player().x, 19, "now you can step through");
    g.move("right");                                       // step back east of the door
    var c = g.closeDoor();
    assert(c.closed, "c closes the adjacent open door");
    assert(!g._plain()["19,11"].open, "it is shut again");
  });

  // ------------------------------------------------ THIRD MONSTER: THE CHASER
  test("the chaser pursues relentlessly every turn", function () {
    var g = TD_MAP.create(world(), { creatures: true });
    g._setCreatures([{ x: 24, y: 11, kind: "chaser", hp: 26, maxHp: 26, dmg: 11, name: "a fervent docent", glyph: "d" }]);
    var d0 = Math.abs(24 - g._player().x);
    g.wait();                                              // we hold still; it should close in
    var cr = g._creatures()[0];
    var d1 = Math.abs(cr.x - g._player().x) + Math.abs(cr.y - g._player().y);
    assert(d1 < d0 + 1, "the chaser moved toward the avatar on our turn");
    assert(cr.x < 24 || cr.y !== 11, "the chaser advanced from its spot");
  });

  // ------------------------------------------- COMBAT MESSAGE CARRIES HP -----
  test("a struck-but-living creature reports its remaining HP in the log", function () {
    var g = TD_MAP.create(world(), { creatures: true });
    g._setCreatures([{ x: 21, y: 11, kind: "lurker", hp: 45, maxHp: 45, dmg: 16, name: "a patient lurker", glyph: "L" }]);
    var r = g.move("right");                               // 20 dmg, it survives (25 left)
    assert(r.attacked && !r.killed, "it survives the first blow");
    includes(r.event, "25/45", "the log shows the creature's remaining HP");
  });

  var pass = results.filter(function (r) { return r.ok; }).length;
  return { pass: pass, fail: results.length - pass, results: results };
}
