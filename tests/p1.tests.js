// Tourist Dungeon — P1 attribution instrument: test cases.
// Plain JS, no framework. Defines TD_TESTS(TD), run by tests/run.py inside
// headless Chrome against the REAL game core extracted from the HTML file.
// Each test throws on failure; the runner tallies pass/fail.

function TD_TESTS(TD) {
  var results = [];
  function test(name, fn) {
    try { fn(); results.push({ name: name, ok: true }); }
    catch (e) { results.push({ name: name, ok: false, err: (e && e.message) || String(e) }); }
  }
  function assert(c, m) { if (!c) throw new Error(m || "assertion failed"); }
  function eq(a, b, m) { if (a !== b) throw new Error((m || "eq") + ": expected " + JSON.stringify(b) + " got " + JSON.stringify(a)); }
  function includes(hay, needle, m) { if (String(hay).indexOf(needle) < 0) throw new Error((m || "includes") + ": " + JSON.stringify(needle) + " not in " + JSON.stringify(hay)); }
  function notIncludes(hay, needle, m) { if (String(hay).indexOf(needle) >= 0) throw new Error((m || "notIncludes") + ": found " + JSON.stringify(needle)); }

  // Drive a fresh game through a list of option ids.
  function play(steps, session) {
    var s = session || TD.createSession();
    var g = TD.createGame(s);
    steps.forEach(function (id) { g.choose(id); });
    return g;
  }
  // Shared dungeon tail: from the gate down to (and including) presenting at
  // the Brass Door. Evades every lethal hazard; fights the one feeble thing.
  var TO_BRASS = ["descend", "inward", "stair", "descend", "dry", "evade", "descend", "fight", "descend", "brass"];

  // ---------------------------------------------------------------- SIGNALS
  test("all 12 signals present with correct channels and counts", function () {
    var obj = 0, subj = 0;
    for (var i = 1; i <= 12; i++) {
      var id = ("00" + i).slice(-3);
      var s = TD.SIGNALS[id];
      assert(s, "missing signal " + id);
      assert(s.text && s.text.length, "empty text " + id);
      if (s.channel === "OBJ") obj++; else if (s.channel === "SUBJ") subj++; else throw new Error("bad channel " + id);
    }
    eq(obj, 9, "OBJ count");
    eq(subj, 3, "SUBJ count");
  });

  test("signal texts match the directive (verbatim-in-spirit)", function () {
    eq(TD.SIGNALS["001"].channel, "OBJ"); includes(TD.SIGNALS["001"].text, "Valid in Guided Zones");
    eq(TD.SIGNALS["002"].channel, "SUBJ"); includes(TD.SIGNALS["002"].text, "everywhere worth going");
    eq(TD.SIGNALS["003"].channel, "OBJ"); includes(TD.SIGNALS["003"].text, "Standard Admission");
    includes(TD.SIGNALS["003"].text, "all areas");
    eq(TD.SIGNALS["004"].channel, "OBJ"); includes(TD.SIGNALS["004"].text, "not valid beyond this point");
    eq(TD.SIGNALS["005"].channel, "OBJ"); includes(TD.SIGNALS["005"].text, "Gilded Kraken"); includes(TD.SIGNALS["005"].text, "Not your kind of place");
    eq(TD.SIGNALS["006"].channel, "SUBJ"); includes(TD.SIGNALS["006"].text, "roughing it");
    eq(TD.SIGNALS["007"].channel, "OBJ"); includes(TD.SIGNALS["007"].text, "soft hands"); includes(TD.SIGNALS["007"].text, "perfume");
    eq(TD.SIGNALS["008"].channel, "OBJ"); includes(TD.SIGNALS["008"].text, "draft");
    eq(TD.SIGNALS["009"].channel, "SUBJ"); includes(TD.SIGNALS["009"].text, "rats");
    eq(TD.SIGNALS["010"].channel, "OBJ"); includes(TD.SIGNALS["010"].text, "click");
    eq(TD.SIGNALS["012"].channel, "OBJ"); includes(TD.SIGNALS["012"].text, "monastery"); includes(TD.SIGNALS["012"].text, "graveyard");
  });

  test("SIG-011 plaque is two lines and actually rhymes", function () {
    var lines = TD.SIGNALS["011"].text.split("\n").filter(function (x) { return x.trim().length; });
    eq(lines.length, 2, "plaque should be two lines");
    function endWord(s) { return s.trim().replace(/[^A-Za-z]+$/, "").split(/\s+/).pop().toLowerCase(); }
    var a = endWord(lines[0]), b = endWord(lines[1]);
    assert(a !== b, "rhyme should not be the identical word (" + a + ")");
    // crude but sufficient rhyme check: shared trailing sound
    assert(a.slice(-2) === b.slice(-2), "end words do not rhyme: " + a + " / " + b);
  });

  // ----------------------------------------------------------- TICKET FORK
  test("Brass Door REJECTS an agency ticket (SIG-004 shown, no pass option)", function () {
    var g = play(["to_agency", "buy_agency", "to_gate"].concat(TO_BRASS));
    var v = g.view();
    eq(v.nodeId, "d4_brass");
    assert(v.lines.some(function (l) { return l.sig === "004"; }), "expected SIG-004 rejection line");
    var ids = v.options.map(function (o) { return o.id; });
    assert(ids.indexOf("turnback") >= 0, "agency should be able to turn back");
    assert(ids.indexOf("pass") < 0, "agency must NOT be offered passage");
  });

  test("Brass Door ADMITS a standard ticket (no SIG-004, pass option present)", function () {
    var g = play(["to_kiosk", "buy_standard", "to_gate"].concat(TO_BRASS));
    var v = g.view();
    eq(v.nodeId, "d4_brass");
    assert(!v.lines.some(function (l) { return l.sig === "004"; }), "standard should not see rejection");
    var ids = v.options.map(function (o) { return o.id; });
    assert(ids.indexOf("pass") >= 0, "standard should be offered passage");
  });

  test("standard ticket can reach 'prevailed' beyond the Brass Door", function () {
    var g = play(["to_kiosk", "buy_standard", "to_gate"].concat(TO_BRASS).concat(["pass", "bank"]));
    eq(g.state.outcome, "prevailed");
    assert(g.state.flags.has("brass_passed"), "brass_passed flag");
    assert(g.state.visited.has("d4_beyond"), "reached beyond");
  });

  // ---------------------------------------------------------- COMFORT FORK
  test("doorman ADMITS a low-comfort character (no SIG-005)", function () {
    var g = play(["to_anchor"]);
    var v = g.view();
    eq(v.nodeId, "rusty_anchor");
    assert(!v.lines.some(function (l) { return l.sig === "005"; }), "low comfort should not be rejected");
    assert(v.options.map(function (o) { return o.id; }).indexOf("anchor_drink") >= 0, "should be admitted");
  });

  test("doorman REJECTS a high-comfort character (SIG-005 shown)", function () {
    var g = play(["to_hotel", "stay_hotel", "to_anchor"]);
    var v = g.view();
    assert(v.lines.some(function (l) { return l.sig === "005"; }), "expected SIG-005 scent rejection");
    assert(v.options.map(function (o) { return o.id; }).indexOf("anchor_leave") >= 0, "should be turned away");
  });

  test("comfort counter is hidden and incremented by hotel(+2)/spa(+1)", function () {
    var g = play(["to_hotel", "stay_hotel", "to_spa", "visit_spa"]);
    eq(g.state.comfort, 3, "hotel+spa comfort");
  });

  // ------------------------------------------------------------- ONE-WAY
  test("the broad stair to Level 2 is one-way (click shown, no path back up)", function () {
    var g = play(["to_kiosk", "buy_standard", "to_gate", "descend", "inward", "stair", "descend"]);
    var v = g.view();
    eq(v.nodeId, "d2_landing");
    assert(g.state.flags.has("oneway_closed"), "oneway flag set");
    assert(v.lines.some(function (l) { return l.sig === "010"; }), "expected SIG-010 click");
    var targets = TD.NODES.d2_landing.options(g.state, g.session).map(function (o) { return o.to; });
    targets.forEach(function (t) { assert(String(t).indexOf("d1") !== 0, "Level 2 must not route back to Level 1: " + t); });
  });

  // ----------------------------------------------------- HIDDEN L1 POCKET
  test("Level 1 has NO direct route to the sealed pocket", function () {
    var l1 = ["d1_landing", "d1_plaque", "d1_fork", "d1_hazard", "d1_mainstair"];
    var fakeState = { ticket: "standard", comfort: 0, flags: new Set(), visited: new Set() };
    l1.forEach(function (id) {
      var opts = TD.NODES[id].options(fakeState, TD.createSession());
      opts.forEach(function (o) { assert(o.to !== "d1_pocket", id + " must not reach the pocket directly"); });
    });
  });

  test("sealed pocket IS reachable via the Level 2 cold draft (telegraphed)", function () {
    var g = play(["to_kiosk", "buy_standard", "to_gate", "descend", "inward", "stair", "descend", "cold"]);
    var v = g.view();
    eq(v.nodeId, "d2_draftwall");
    assert(v.lines.some(function (l) { return l.sig === "008"; }), "expected SIG-008 cold draft");
    assert(v.lines.some(function (l) { return l.sig === "009"; }), "expected SIG-009 'rats' gut line");
    g.choose("investigate");
    eq(g.view().nodeId, "d1_pocket", "investigating the draft should reach the L1 pocket");
    g.choose("take");
    assert(g.state.flags.has("found_pocket"), "found_pocket flag");
  });

  // ------------------------------------------------------ DEATH FREQUENCY
  test("a careless run dies within ~10-15 choices", function () {
    var g = play(["to_kiosk", "buy_standard", "to_gate", "descend", "inward", "low", "press"]);
    eq(g.state.outcome, "dead");
    assert(g.state.log.length <= 15, "careless death took too long: " + g.state.log.length);
  });

  // -------------------------------------------------- POSTMORTEM: ATTRIBUTION
  test("postmortem attributes BOTH forks on the demonstrator run", function () {
    var seq = ["to_agency", "buy_agency", "to_hotel", "stay_hotel", "to_anchor", "anchor_leave", "to_gate"]
      .concat(TO_BRASS).concat(["turnback", "press"]);
    var g = play(seq);
    eq(g.state.outcome, "dead");
    var pm = g.postmortem();
    eq(pm.attributions.length, 2, "should attribute exactly the two engaged forks");
    var joined = pm.attributions.join(" || ");
    includes(joined, "Guided Package", "ticket fork");
    includes(joined, "not pervious", "ticket -> brass door closed");
    includes(joined, "Rusty Anchor", "comfort fork");
    includes(joined, "Gilded Kraken", "comfort source named from actual choices");
  });

  test("postmortem NEVER prints the hidden comfort counter as a number", function () {
    var seq = ["to_agency", "buy_agency", "to_hotel", "stay_hotel", "to_anchor", "anchor_leave", "to_gate"]
      .concat(TO_BRASS).concat(["turnback", "press"]);
    var pm = play(seq).postmortem();
    pm.attributions.forEach(function (a) { assert(!/[0-9]/.test(a), "attribution contains a digit: " + a); });
  });

  test("postmortem reveals NO untouched content (early death = no brass/anchor)", function () {
    var g = play(["to_kiosk", "buy_standard", "to_gate", "descend", "inward", "low", "press"]);
    var pm = g.postmortem();
    eq(pm.attributions.length, 0, "no doors were actually engaged");
    var blob = JSON.stringify(pm);
    notIncludes(blob, "Brass", "must not mention unreached Brass Door");
    notIncludes(blob, "Anchor", "must not mention untried Anchor");
    notIncludes(blob, "monastery", "must not reveal unreachable surface content");
    notIncludes(blob, "sealed", "must not reveal the hidden pocket");
  });

  test("breadcrumb appears once when L1 was passed without reading the plaque", function () {
    var pm = play(["to_kiosk", "buy_standard", "to_gate", "descend", "inward", "low", "press"]).postmortem();
    assert(pm.breadcrumb, "expected a breadcrumb");
    includes(pm.breadcrumb, "rhymes", "breadcrumb hints the plaque");
  });

  test("breadcrumb is withheld when the plaque WAS examined", function () {
    var pm = play(["to_kiosk", "buy_standard", "to_gate", "descend", "plaque", "note_it", "low", "press"]).postmortem();
    assert(g_isNull(pm.breadcrumb), "breadcrumb should be withheld once the plaque is read");
    function g_isNull(x) { return x === null || x === undefined; }
  });

  test("a standard win attributes the OPENED door, not a closed one", function () {
    var pm = play(["to_kiosk", "buy_standard", "to_gate"].concat(TO_BRASS).concat(["pass", "bank"])).postmortem();
    eq(pm.title, "Notice of Provisional Survival");
    includes(pm.attributions.join(" "), "honoured at the Brass Door", "should note the door opened");
  });

  // --------------------------------------------------- LOOP / PERSISTENCE
  test("world facts persist across lives while the character resets", function () {
    var s = TD.createSession();
    // life 1: discover several world facts, then die
    var seq = ["to_agency", "buy_agency", "to_hotel", "stay_hotel", "to_anchor", "anchor_leave", "to_gate"]
      .concat(TO_BRASS).concat(["turnback", "press"]);
    var g1 = TD.createGame(s);
    seq.forEach(function (id) { g1.choose(id); });
    assert(s.knowledge.size >= 2, "world should have learned facts: " + s.knowledge.size);

    // life 2: fresh character, same session
    var g2 = TD.createGame(s);
    eq(g2.state.ticket, null, "ticket resets");
    eq(g2.state.comfort, 0, "comfort resets");
    eq(g2.state.nodeId, "harbor", "position resets");
    eq(g2.state.life, 2, "life counter advances");
    assert(s.knowledge.size >= 2, "world facts persist into the next life");
  });

  test("a session supports 3+ lives", function () {
    var s = TD.createSession();
    TD.createGame(s); TD.createGame(s); var g3 = TD.createGame(s);
    eq(s.lives, 3, "three lives");
    eq(g3.state.life, 3);
  });

  test("OBJ truthfulness: an agency fine-print promise matches reality at the door", function () {
    // 001 says "Valid in Guided Zones"; the Brass Door (a non-guided zone) must refuse it.
    var g = play(["to_agency", "buy_agency", "to_gate"].concat(TO_BRASS).concat(["turnback"]));
    assert(g.state.flags.has("brass_rejected"), "agency truly refused, matching its OBJ fine print");
    // 003 says standard is "all areas"; the door must honour it.
    var g2 = play(["to_kiosk", "buy_standard", "to_gate"].concat(TO_BRASS).concat(["pass"]));
    assert(g2.state.flags.has("brass_passed"), "standard truly admitted, matching its OBJ ticket text");
  });

  var pass = results.filter(function (r) { return r.ok; }).length;
  return { pass: pass, fail: results.length - pass, results: results };
}
