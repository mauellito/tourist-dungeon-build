// Tourist Dungeon — TD_UI tests (presentation / quality-of-life LOGIC).
// Defines TD_UI_TESTS(), run by tests/run_ui.py in headless Chrome against the
// real modules (rng + interpreter + mapmode + generator + ui). Covers the
// colour-discipline palette, auto-explore stop conditions (each trigger), the
// label list, the threats list, the --more-- gate, and Bureau-bark
// non-repetition. Auto-explore triggers use deterministic mock sims so each stop
// condition is exercised in isolation; one integration check uses the real engine.

function TD_UI_TESTS() {
  var results = [];
  function test(n, fn) { try { fn(); results.push({ name: n, ok: true }); } catch (e) { results.push({ name: n, ok: false, err: (e && e.message) || String(e) }); } }
  function assert(c, m) { if (!c) throw new Error(m || "assert"); }
  function eq(a, b, m) { if (a !== b) throw new Error((m || "eq") + ": expected " + JSON.stringify(b) + " got " + JSON.stringify(a)); }

  // a tiny world for the real-engine integration check (node a, level 1)
  function world(extra) {
    return {
      start: "a", year_length: 365, arrival_day: 1, meta: { seed: 1 },
      nodes: { a: { level: 1, title: "Room A" }, b: { level: 1, required: true, title: "Room B" } },
      edges: [Object.assign({ id: "ab", from: "a", to: "b", label: "a door north" }, extra || {})],
      signals: {}
    };
  }

  // ----- a 7x7 open-floor view, explored a 3x3 around the player (frontier exists)
  function baseView(player, exploredAll, extra) {
    var w = 7, h = 7, grid = [];
    for (var y = 0; y < h; y++) { var r = ""; for (var x = 0; x < w; x++) r += "."; grid.push(r); }
    var explored = [];
    if (exploredAll) { for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) explored.push(xx + "," + yy); }
    else { for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) explored.push((player.x + dx) + "," + (player.y + dy)); }
    return Object.assign({
      w: w, h: h, grid: grid, explored: explored, visible: explored.slice(),
      player: { x: player.x, y: player.y }, doors: {}, plain: {}, features: {}, items: {}, creatures: [],
      meters: { hp: 100, hpMax: 100, fatigue: 0, fatigueMax: 100, satiation: 100, satiationMax: 100 },
      hunger: { rung: 0, stage: "well fed", critical: false }, dead: false, won: false
    }, extra || {});
  }
  // a mock sim that hands out a scripted sequence of views; move() advances it
  function mockSim(states) {
    var i = 0;
    return { view: function () { return states[Math.min(i, states.length - 1)]; },
             move: function () { if (i < states.length - 1) { i++; return { moved: true }; } return { moved: false }; } };
  }

  // =================================================== COLOUR DISCIPLINE =====
  test("the palette is a single table; each category owns a distinct hue", function () {
    var P = TD_UI.PALETTE, keys = TD_UI.CATEGORY_KEYS;
    assert(keys.length === 6, "six category meanings");
    var seen = {};
    keys.forEach(function (k) {
      assert(typeof P[k] === "string" && /^#/.test(P[k]), k + " has a colour");
      assert(!seen[P[k]], "colour " + P[k] + " means exactly one thing (clash on " + k + ")");
      seen[P[k]] = k;
    });
    eq(P.dmgDealt, P.player, "damage you deal is your own gold");
    eq(P.dmgTaken, P.critical, "damage you take is critical red");
  });

  // =================================================== AUTO-EXPLORE ==========
  test("auto-explore refuses to start while a creature is in view", function () {
    var v = baseView({ x: 3, y: 3 }, false, { creatures: [{ x: 2, y: 3, hp: 9, maxHp: 9, dmg: 8, name: "a thing", glyph: "r" }] });
    var r = TD_UI.autoExplore(mockSim([v]));
    eq(r.moved, 0, "it does not take a step");
    eq(r.stoppedBy, "creature");
    assert(/creature[\s\S]*view/i.test(r.say || ""), "it says why, in the Bureau voice");
  });

  test("auto-explore stops the instant a creature appears", function () {
    var v0 = baseView({ x: 3, y: 3 }, false);
    var v1 = baseView({ x: 2, y: 3 }, false, { creatures: [{ x: 1, y: 3, hp: 9, maxHp: 9, dmg: 8, name: "a thing", glyph: "r" }] });
    var r = TD_UI.autoExplore(mockSim([v0, v1]));
    eq(r.moved, 1); eq(r.stoppedBy, "creature");
  });

  test("auto-explore stops when it steps onto an item", function () {
    var v0 = baseView({ x: 3, y: 3 }, false);
    var v1 = baseView({ x: 2, y: 3 }, false, { items: { "2,3": { kind: "ration", name: "a bun" } } });
    var r = TD_UI.autoExplore(mockSim([v0, v1]));
    eq(r.moved, 1); eq(r.stoppedBy, "item");
  });

  test("auto-explore stops when a new door comes into view", function () {
    var v0 = baseView({ x: 3, y: 3 }, false);
    var v1 = baseView({ x: 2, y: 3 }, false, { doors: { "1,3": { edgeId: "z", label: "a door" } } });
    v1.visible.push("1,3");
    var r = TD_UI.autoExplore(mockSim([v0, v1]));
    eq(r.moved, 1); eq(r.stoppedBy, "notable");
  });

  test("auto-explore stops when a meter reaches a warning stage", function () {
    var v0 = baseView({ x: 3, y: 3 }, false);
    var v1 = baseView({ x: 2, y: 3 }, false, { hunger: { rung: 2, stage: "Hungry", critical: false } });
    var r = TD_UI.autoExplore(mockSim([v0, v1]));
    eq(r.moved, 1); eq(r.stoppedBy, "meter");
  });

  test("auto-explore reports nothing-left when the area is fully known", function () {
    var v = baseView({ x: 3, y: 3 }, true);                // everything explored -> no frontier
    var r = TD_UI.autoExplore(mockSim([v]));
    eq(r.moved, 0); eq(r.stoppedBy, "explored");
  });

  test("auto-explore (real engine) reveals new ground and never starts a fight", function () {
    var g = TD_MAP.create(world(), { creatures: false });
    var before = g._explored().size;
    var r = TD_UI.autoExplore(g);
    assert(r.moved >= 1, "it walked");
    assert(g._explored().size > before, "it revealed new tiles");
    assert(!g.isDead(), "it never walked into harm");
  });

  // =================================================== LABELS ================
  test("labels name every visible item, creature, door and signal at once", function () {
    var v = baseView({ x: 3, y: 3 }, false, {
      items: { "2,3": { kind: "ration", name: "a bun", glyph: "%" } },
      doors: { "4,3": { edgeId: "z", label: "a door" } },
      features: { "3,2": { label: "a plaque", glyph: "¶" } },
      creatures: [{ x: 4, y: 4, name: "a lurker", glyph: "L" }]
    });
    v.visible.push("2,3"); v.visible.push("4,3"); v.visible.push("3,2");
    var ls = TD_UI.labels(v);
    var cats = ls.map(function (l) { return l.cat; }).sort().join(",");
    eq(cats, "creature,door,item,signal");
    assert(ls.some(function (l) { return l.text === "a bun"; }), "the item is named");
  });

  // =================================================== THREATS ===============
  test("friendly townsfolk are filtered out of the threats list (v14 roster)", function () {
    var v = { creatures: [{ x: 1, y: 1, name: "a nun", glyph: "n", hp: 1, maxHp: 1, dmg: 0, friendly: true }, { x: 2, y: 2, name: "a patient lurker", glyph: "L", kind: "lurker", hp: 45, maxHp: 45, dmg: 16 }] };
    var t = TD_UI.threats(v);
    eq(t.length, 1, "only the hostile creature is a threat");
    eq(t[0].name, "a patient lurker");
  });

  test("the extended palette adds single-meaning hues (npc / redlight / nature), all distinct", function () {
    var P = TD_UI.PALETTE, extra = ["npc", "redlight", "nature", "senses"];
    extra.forEach(function (k) {
      assert(typeof P[k] === "string" && /^#/.test(P[k]), k + " is a defined colour");
      TD_UI.CATEGORY_KEYS.forEach(function (c) { assert(P[k] !== P[c], k + " must not reuse the " + c + " hue"); });
    });
  });

  test("the threat list mirrors the creatures in view, with danger by bite", function () {
    var v = baseView({ x: 3, y: 3 }, false, {
      creatures: [
        { x: 2, y: 3, name: "a patient lurker", glyph: "L", kind: "lurker", hp: 30, maxHp: 45, dmg: 16 },
        { x: 4, y: 3, name: "a shuffling thing", glyph: "r", kind: "wanderer", hp: 30, maxHp: 30, dmg: 8 }
      ]
    });
    var t = TD_UI.threats(v);
    eq(t.length, 2);
    eq(t[0].danger, "high", "a 16-damage bite is high danger");
    eq(t[1].danger, "low", "an 8-damage bite is low danger");
    eq(TD_UI.threats(baseView({ x: 3, y: 3 }, false)).length, 0, "empty when nothing stalks you");
  });

  // =================================================== --more-- GATE =========
  test("a pending critical blocks; acknowledging past it unblocks", function () {
    var msgs = [{ text: "a", urgent: false }, { text: "you are STARVING", urgent: true }, { text: "c", urgent: false }];
    var g0 = TD_UI.moreGate(msgs, 0);
    assert(g0.blocked, "the critical halts play"); eq(g0.index, 1);
    var g1 = TD_UI.moreGate(msgs, g0.index + 1);
    assert(!g1.blocked, "acknowledged: no further critical pending");
  });

  // =================================================== BUREAU BARKS ==========
  test("Bureau barks never repeat and respect a cooldown", function () {
    var b = TD_UI.Barker({ cooldown: 18 });
    assert(b.react("first_kill", 10), "the first kill is remarked");
    eq(b.react("first_kill", 40), null, "but never twice");
    eq(b.react("first_descent", 12), null, "cooldown blocks a second bark too soon");
    assert(b.react("first_descent", 30), "after the cooldown another event may speak");
    assert(/Bureau|one-way/.test(b.lines.first_descent), "barks are in the municipal voice");
  });

  test("E2: a building's KIND is classifiable, and each kind owns a distinct hue", function () {
    var cat = TD_UI.buildingCategory;
    eq(cat("church"), "faith", "church is faith");
    eq(cat("hotel"), "lodging", "hotel is lodging");
    eq(cat("motel"), "lodging", "motel is lodging");
    eq(cat("bank"), "civic", "bank is civic");
    eq(cat("DUNGEON"), "civic", "the dungeon office/entrance is civic");
    eq(cat("redshop"), "vice", "red-light shop is vice");
    eq(cat("coffee"), "commerce", "a shop defaults to commerce");
    var ids = { faith: "church", lodging: "hotel", civic: "bank", vice: "redshop", commerce: "coffee" };
    var hues = Object.keys(ids).map(function (k) { return TD_UI.buildingColor(ids[k]); });
    var uniq = hues.filter(function (v, i, a) { return a.indexOf(v) === i; });
    eq(uniq.length, 5, "the five building kinds own five distinct hues");
  });

  var pass = results.filter(function (r) { return r.ok; }).length;
  return { pass: pass, fail: results.length - pass, results: results };
}
