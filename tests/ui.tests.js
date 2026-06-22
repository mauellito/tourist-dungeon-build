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

  test("TOWN A: a building's CATEGORY is classifiable, and the five categories own distinct hues", function () {
    var cat = TD_UI.buildingCategory;
    eq(cat("church"), "faith", "GATE 1: the church is its own FAITH landmark category (sanctified jewel tone, not civic)");
    eq(cat("bank"), "civic", "bank is civic");
    eq(cat("DUNGEON"), "civic", "the dungeon office/entrance is civic");
    eq(cat("coffee"), "food", "coffee is food/lodging");
    eq(cat("hotel"), "food", "the hotel is food/lodging");
    eq(cat("redshop"), "vice", "red-light shop is vice");
    eq(cat("chandlery"), "maritime", "the chandlery is maritime");
    eq(cat("spa"), "maritime", "the spa is maritime");
    eq(cat("store"), "commerce", "a shop defaults to commerce");
    var ids = { civic: "bank", commerce: "store", food: "coffee", vice: "redshop", maritime: "chandlery", faith: "church" };
    var hues = Object.keys(ids).map(function (k) { return TD_UI.buildingColor(ids[k]); });
    var uniq = hues.filter(function (v, i, a) { return a.indexOf(v) === i; });
    eq(uniq.length, 6, "the six town categories own six distinct hues (faith added: the church landmark)");
  });

  // ====== PREMIUM-ASCII RENDERER P1 — the tile-cell DATA CONTRACT ======
  // deriveCell is pure: given real fields (terrain char, entity, explored/visible
  // Sets, REVEAL) it returns the render contract, or null for an undiscovered cell.
  var PV = Object.keys(TD_UI.PALETTE).map(function (k) { return TD_UI.PALETTE[k]; });
  function inPalette(hex) { return PV.indexOf(hex) >= 0; }
  function cell(o) { return TD_UI.deriveCell(o); }
  function exV(keys) { return { has: function (k) { return keys.indexOf(k) >= 0; } }; }

  test("P1: an UNDISCOVERED cell is unrendered (returns null)", function () {
    var c = cell({ x: 5, y: 5, terrain: ".", player: { x: 5, y: 5 }, explored: exV([]), visible: exV([]) });
    eq(c, null, "undiscovered -> null");
  });

  test("P1: a DISCOVERED-but-not-visible cell is remembered (visible:false, light:0)", function () {
    var c = cell({ x: 2, y: 2, terrain: ".", player: { x: 5, y: 5 }, explored: exV(["2,2"]), visible: exV([]) });
    assert(c, "discovered -> a cell");
    eq(c.discovered, true, "discovered");
    eq(c.visible, false, "not visible");
    eq(c.light, 0, "remembered cell is unlit (drawn dim by the renderer)");
  });

  test("P1: a VISIBLE floor cell resolves glyph + PALETTE fg/bg (never literal hex)", function () {
    var c = cell({ x: 4, y: 5, terrain: ".", player: { x: 5, y: 5 }, reveal: 4, explored: exV(["4,5"]), visible: exV(["4,5"]) });
    eq(c.category, "floor", "floor category");
    eq(c.glyph, ".", "live floor char kept (not silently reglyphed)");
    eq(c.fg, TD_UI.PALETTE.floor, "fg is the PALETTE floor hue");
    eq(c.bg, TD_UI.PALETTE.floorBg, "bg is the PALETTE floor-bg");
    assert(inPalette(c.fg), "fg comes from PALETTE (colour discipline)");
    assert(c.light > 0 && c.light <= 1, "a visible cell has light in (0,1]");
  });

  test("P1: light falls off by chebyshev distance and hits 0 at REVEAL", function () {
    var P = { x: 5, y: 5 };
    var near = cell({ x: 5, y: 5, terrain: ".", player: P, reveal: 4, explored: exV(["5,5"]), visible: exV(["5,5"]) });
    var mid = cell({ x: 7, y: 5, terrain: ".", player: P, reveal: 4, explored: exV(["7,5"]), visible: exV(["7,5"]) });
    var edge = cell({ x: 9, y: 5, terrain: ".", player: P, reveal: 4, explored: exV(["9,5"]), visible: exV(["9,5"]) });
    eq(near.light, 1, "player tile is fully lit");
    assert(mid.light > edge.light, "closer is brighter");
    eq(edge.light, 0, "at distance == REVEAL the light is 0");
  });

  test("P1: the PLAYER cell — glyph @, category player, breathing pulse, full light", function () {
    var c = cell({ x: 5, y: 5, terrain: ".", isPlayer: true, entity: { kind: "player", glyph: "@" },
                   player: { x: 5, y: 5 }, explored: exV(["5,5"]), visible: exV(["5,5"]) });
    eq(c.category, "player", "player category");
    eq(c.glyph, "@", "player glyph");
    eq(c.fg, TD_UI.PALETTE.player, "player gold");
    eq(c.animState, "pulse", "breathing pulse");
    eq(c.light, 1, "the player is fully lit");
  });

  test("P1: a HOSTILE creature carries its REAL band, band-derived hue, threat pulse — using only live fields", function () {
    var brute = cell({ x: 6, y: 5, terrain: ".", entity: { glyph: "O", band: 5, kind: "ogre" },
                       player: { x: 5, y: 5 }, explored: exV(["6,5"]), visible: exV(["6,5"]) });
    eq(brute.category, "hostile", "hostile category");
    eq(brute.glyph, "O", "live bestiary glyph kept, not overwritten");
    eq(brute.threatBand, 5, "the REAL creature.band is surfaced as threatBand");
    eq(brute.fg, TD_UI.PALETTE.dangerHigh, "band 5 -> high-danger hue");
    eq(brute.animState, "threat", "threat pulse (gated on band)");
    var weak = cell({ x: 6, y: 6, terrain: ".", entity: { glyph: "r", band: 1, kind: "rat" },
                      player: { x: 5, y: 5 }, explored: exV(["6,6"]), visible: exV(["6,6"]) });
    eq(weak.fg, TD_UI.bandColor(1), "band 1 -> low-danger hue on the severity ramp (distinct from a brute)");
    assert(weak.fg !== brute.fg, "a band-1 nuisance and a band-5 brute are not the same colour");
  });

  test("P1: a FRIENDLY npc is not a threat (npc hue, no threatBand)", function () {
    var c = cell({ x: 6, y: 5, terrain: ".", entity: { glyph: "p", friendly: true, kind: "npc", name: "Jimmy" },
                   player: { x: 5, y: 5 }, explored: exV(["6,5"]), visible: exV(["6,5"]) });
    eq(c.category, "npc", "npc category");
    eq(c.fg, TD_UI.PALETTE.npc, "friendly tan");
    eq(c.threatBand, undefined, "a friendly carries no threat band");
  });

  test("P1: a creature is NOT remembered where it's no longer visible (falls back to terrain)", function () {
    var c = cell({ x: 6, y: 5, terrain: ".", entity: { glyph: "O", band: 5, kind: "ogre" },
                   player: { x: 5, y: 5 }, explored: exV(["6,5"]), visible: exV([]) });
    eq(c.visible, false, "not visible");
    eq(c.category, "floor", "remembered tile shows terrain, not a ghost monster");
    eq(c.glyph, ".", "the floor, not the ogre");
  });

  test("P1: water resolves to its PALETTE fg/bg pair", function () {
    var c = cell({ x: 5, y: 6, terrain: "~", player: { x: 5, y: 5 }, explored: exV(["5,6"]), visible: exV(["5,6"]) });
    eq(c.category, "water", "water");
    eq(c.fg, TD_UI.PALETTE.waterGlyph, "water glyph hue");
    eq(c.bg, TD_UI.PALETTE.water, "water bg");
  });

  test("P1: deriveCell accepts a real Set (not just an array) for explored/visible", function () {
    var ex = new Set(["3,3"]), vis = new Set(["3,3"]);
    var c = cell({ x: 3, y: 3, terrain: "#", player: { x: 3, y: 3 }, explored: ex, visible: vis });
    eq(c.category, "stone", "wall -> stone");
    eq(c.fg, TD_UI.PALETTE.wall, "wall hue");
  });

  test("P1: EVERY colour deriveCell emits comes from PALETTE (Brogue colour discipline)", function () {
    var cats = ["floor", "stone", "door", "exit", "water", "item", "nature", "fence", "unknown", "void", "npc", "player"];
    var bandsOk = [1, 3, 5].every(function (b) { return inPalette(TD_UI.cellColors("hostile", b).fg); });
    assert(bandsOk, "all band hues are PALETTE values");
    var ok = cats.every(function (cat) {
      var c = TD_UI.cellColors(cat);
      return inPalette(c.fg) && (c.bg === null || inPalette(c.bg));
    });
    assert(ok, "every category's fg/bg is a PALETTE value or null");
  });

  // ====== PREMIUM-ASCII RENDERER P3 — the COLOUR GRAMMAR ======
  test("P3: bandColor ramps creature hue by THREAT BAND on the shared severity scale", function () {
    eq(TD_UI.bandColor(1), TD_UI.PALETTE.dangerLow, "band 1 = low danger");
    eq(TD_UI.bandColor(2), TD_UI.PALETTE.dangerLow, "band 2 = low danger");
    eq(TD_UI.bandColor(3), TD_UI.PALETTE.dangerMed, "band 3 = medium");
    eq(TD_UI.bandColor(4), TD_UI.PALETTE.dangerMed, "band 4 = medium");
    eq(TD_UI.bandColor(5), TD_UI.PALETTE.dangerHigh, "band 5 = high");
    eq(TD_UI.bandColor(6), TD_UI.PALETTE.dangerHigh, "band 6 = high");
    eq(TD_UI.bandColor(), TD_UI.PALETTE.dangerLow, "missing band defaults to low, never throws");
    var lo = TD_UI.bandColor(1), md = TD_UI.bandColor(3), hi = TD_UI.bandColor(5);
    assert(lo !== md && md !== hi && lo !== hi, "the three threat tiers are visually distinct");
  });

  test("P3: the dungeon colour grammar categories each own a distinct PALETTE hue", function () {
    var cats = ["bureau", "ancient", "corruption", "organic", "artifact", "rubble", "unknown", "water"];
    var hues = cats.map(function (c) { return TD_UI.cellColors(c).fg; });
    hues.forEach(function (h) { assert(inPalette(h), "grammar hue " + h + " comes from PALETTE"); });
    var uniq = hues.filter(function (v, i, a) { return a.indexOf(v) === i; });
    eq(uniq.length, cats.length, "Bureau/Ancient/Corruption/Organic/Artifact/Rubble/Unknown/Water are all distinct");
  });

  test("P3: a hostile cell's hue follows its REAL band (deriveCell agrees with bandColor)", function () {
    function h(band) {
      return cell({ x: 6, y: 5, terrain: ".", entity: { glyph: "X", band: band, kind: "foe" },
                    player: { x: 5, y: 5 }, explored: exV(["6,5"]), visible: exV(["6,5"]) }).fg;
    }
    eq(h(1), TD_UI.bandColor(1), "band 1 hue");
    eq(h(6), TD_UI.bandColor(6), "band 6 hue");
    assert(h(1) !== h(6), "a kitten and a boss are not the same colour");
  });

  test("P3: TOWN colour derives from tenant ACT but STAYS in the muted town set (mute directive honoured)", function () {
    eq(TD_UI.actColor("agency"), TD_UI.townTone("civic"), "agency -> civic tone");
    eq(TD_UI.actColor("food"), TD_UI.townTone("food"), "food -> food tone");
    eq(TD_UI.actColor("spa"), TD_UI.townTone("maritime"), "spa -> maritime tone");
    eq(TD_UI.actColor("blessing"), TD_UI.townTone("faith"), "church blessing -> faith tone");
    eq(TD_UI.actColor("shop"), TD_UI.townTone("commerce"), "a shop -> commerce tone");
    eq(TD_UI.actColor("???"), TD_UI.townTone("commerce"), "unknown act -> commerce default");
    // muted means every town tone is the same low saturation as TOWN_TONE (no vivid dungeon hue leaks in)
    var tones = ["kiosk", "agency", "hotel", "spa", "food", "shop", "blessing", "boat"].map(TD_UI.actColor);
    tones.forEach(function (t) {
      var vals = Object.keys(TD_UI.TOWN_TONE).map(function (k) { return TD_UI.TOWN_TONE[k]; });
      assert(vals.indexOf(t) >= 0, "act tone " + t + " is a muted TOWN_TONE value, not a vivid grammar hue");
    });
  });

  var pass = results.filter(function (r) { return r.ok; }).length;
  return { pass: pass, fail: results.length - pass, results: results };
}
