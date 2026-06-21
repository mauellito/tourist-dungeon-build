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
  test("Agency: the admission intake opens; declaring a VISA issues the ticket (002/001 on senses)", function () {
    var g = game();
    g._interact("agency");                                       // CHARACTER B: the booking desk opens the visa form
    assert(g._intakeOpen(), "the Agency opens the admission intake");
    eq(g._character().ticket, null);                             // no ticket until a visa is declared
    assert(g._character().signalsSeen.has("002"), "subjective patter 002 seen at the desk");
    var bgs = g._backgrounds();
    assert(bgs.length >= 8, "the form offers the eight visas");
    g.chooseBackground("tourist");                              // declare -> issues the Guided Package
    eq(g._character().ticket, "agency");
    assert(!g._intakeOpen(), "declaring closes the intake");
    assert(g._character().visa === "tourist", "the declared visa is recorded");
    assert(g._character().background && /Tourist/.test(g._character().background.name), "the declared identity is recorded");
    assert(g._character().signalsSeen.has("001"), "objective fine print 001 seen on declaration");
    var sens = g._shared().messages.filter(function (m) { return m.ch === "senses"; });
    assert(sens.some(function (m) { return /everywhere worth going/.test(m.text) && m.obj === "SUBJ"; }), "002 is SUBJ senses (said)");
    assert(sens.some(function (m) { return /Valid in Guided Zones/.test(m.text) && m.obj === "OBJ"; }), "001 is OBJ senses (said), and true");
    assert(g._shared().messages.some(function (m) { return m.ch === "event" && /Guided Package/.test(m.text); }), "the mechanical fact is an EVENT line");
  });
  // CHARACTER B — visas are BONUSES-ONLY (never a penalty) and grant a signature aptitude + loadout
  test("Visas are bonuses-only declarations (stat lift + signature grant + gear)", function () {
    // bonuses-only: applyVisa only ever RAISES the listed stats
    var base = TD_STATS.create(TD_RNG.make(42)), lab = TD_STATS.create(TD_RNG.make(42));
    TD_CHARSYS.applyVisa(lab, "labourer");
    assert(lab.might >= base.might && lab.con >= base.con && lab.grit >= base.grit, "Labourer raises Might/Con/Grit, never lowers");
    assert(lab.dex === base.dex, "untouched stats are unchanged (no penalty)");
    // declaring grants the visa's signature to the character sheet + its loadout
    var g = game(); g._interact("agency"); g.chooseBackground("labourer");
    var eqp = g._character().equipment;
    eq(eqp.rightHand.name, TD_RESOLVE.GEAR.WEAPONS.mace.name);
    eq(eqp.body.tier, "medium");
    assert(TD_CHARSYS.has(g._character().sheet, "proficiency", "impact"), "Labourer grants Impact proficiency");
    assert(TD_CHARSYS.has(g._character().sheet, "talent", "deadLift"), "Labourer grants the Dead Lift talent");
    // a quick-start (kiosk) carries no declared visa
    var q = game(); q._interact("kiosk");
    eq(q._character().ticket, "standard");
    eq(q._character().visa, undefined);
    eq(q._character().background, null);
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
    g._clearActors(); var pl = g._player(); g._setVendor(pl.x + 1, pl.y);   // isolate + park him beside the spawn
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

  // =================================================================
  // HARBOUR TOWN — THE SCREEN GRAPH (v16 R1)
  // =================================================================
  function cd(a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }
  var INTERIOR_IDS = ["hotel", "restaurant", "coffee", "bodega", "saloon", "bank", "church", "spa", "tavern", "tim", "tattoo", "boat", "blacksmith", "barber", "motel", "redshop", "palmreader", "chinese", "clamshack", "gift1", "gift2", "agency", "kiosk"];

  test("the town is ONE continuous place with a connected road", function () {
    var g = game(); var v = g.view(); eq(v.screen, "TOWN", "one continuous town place");
    var grid = v.grid, sp = v.player, seen = {}, q = [[sp.x, sp.y]], reached = 0; seen[sp.x + "," + sp.y] = 1;
    function flo(x, y) { return grid[y] && grid[y][x] === "."; }
    while (q.length) { var c = q.shift(); reached++;[[c[0], c[1] - 1], [c[0], c[1] + 1], [c[0] - 1, c[1]], [c[0] + 1, c[1]]].forEach(function (n) { if (flo(n[0], n[1]) && !seen[n[0] + "," + n[1]]) { seen[n[0] + "," + n[1]] = 1; q.push(n); } }); }
    var open = 0; grid.forEach(function (r) { for (var i = 0; i < r.length; i++) if (r[i] === ".") open++; });
    eq(reached, open, "the road is one connected component (" + reached + "/" + open + ")");
  });

  test("every building door is reachable from spawn (bumped from the road)", function () {
    var g = game(); var v = g.view(), grid = v.grid, sp = v.player, seen = {}, q = [[sp.x, sp.y]]; seen[sp.x + "," + sp.y] = 1;
    var DV = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    while (q.length) { var c = q.shift(); DV.forEach(function (d) { var nx = c[0] + d[0], ny = c[1] + d[1], k = nx + "," + ny; if (!seen[k] && grid[ny] && grid[ny][nx] === ".") { seen[k] = 1; q.push([nx, ny]); } }); }
    var doors = v.doors || {}, total = 0;
    Object.keys(doors).forEach(function (k) { var p = k.split(",").map(Number); total++; assert(DV.some(function (d) { return seen[(p[0] + d[0]) + "," + (p[1] + d[1])]; }), "door " + k + "->" + doors[k].to + " bumpable from the road"); });
    assert(total >= 20, "the full cast of buildings is placed (" + total + ")");
  });

  test("door-in-wall: no building door on a road tile; letters inside; streets clean", function () {
    var g = game(); var v = g.view();
    Object.keys(v.doors).forEach(function (k) { var p = k.split(",").map(Number); assert(v.grid[p[1]][p[0]] === "#", "door " + k + " sits in a wall, not on the road"); });
    Object.keys(v.features).forEach(function (k) { var f = v.features[k]; if (f.type !== "label") return; var p = k.split(",").map(Number); assert(v.grid[p[1]][p[0]] === "#", "letter at " + k + " is inside the footprint"); });
  });

  test("the road cross is the wide main corridor (4-5 wide)", function () {
    var g = game(); var roads = g._townMeta().roads;
    assert(roads && roads.length >= 2, "the main corridor is a cross of two roads");
    roads.forEach(function (r) { assert(r.width >= 4, r.id + " is a 4+ wide main road (" + r.width + ")"); });
  });

  test("districts are zoned, with the cemetery + park enclosures placed", function () {
    var g = game(); var d = g._townMeta().districts;
    ["main", "market", "waterfront"].forEach(function (n) { assert(d[n], n + " zoned"); });
    assert(d.cemetery && d.park, "cemetery + park enclosures placed");
  });

  test("the harbour rail carries the island sightline (012)", function () {
    var g = game(); var feats = g.view().features || {}, rail = null;
    Object.keys(feats).forEach(function (k) { if (feats[k].act === "lookout") rail = feats[k]; });
    assert(rail && /monastery|graveyard|cannot be reached/.test(rail.text), "the rail shows the island (012)");
  });

  test("open water is plainly visible on the waterfront", function () {
    var g = game(); var v = g.view(), water = 0; v.grid.forEach(function (r) { for (var i = 0; i < r.length; i++) if (r[i] === "~") water++; });
    assert(water >= 300, "a real band of open water (" + water + ")");
  });

  test("every named building has a voice-specced keeper on the accent map", function () {
    var g = game(); var K = g._keepers(), ACC = ["brooklyn", "posh", "pastoral", "plainspoken", "mixed"];
    Object.keys(K).forEach(function (b) { var s = TD_VOICES.byId(K[b]); assert(s && !s.placeholder, b + ": real keeper voice"); assert(ACC.indexOf(s.accent) >= 0, b + ": accent on the map"); });
  });

  test("townsfolk walk the roads and never trap or sit on the player", function () {
    var g = game(); var v = g.view();
    assert(v.grid[v.player.y][v.player.x] === ".", "spawn is on the road");
    assert(v.creatures.length >= 2, "walkers are out (" + v.creatures.length + ")");
    g._freezeVendor(false);
    for (var i = 0; i < 60; i++) g.move(i % 2 ? "left" : "right");
    g.view().creatures.forEach(function (c) { assert(!(c.x === g._player().x && c.y === g._player().y), "no walker sits on the player"); });
  });

  test("the two gift shops trade rivalry barks near both, never repeating", function () {
    var g = game(); g._freezeVendor(true); var gift = g._townMeta().gift; assert(gift, "gift positions set");
    var mx = Math.round((gift.a.x + gift.b.x) / 2), my = Math.round((gift.a.y + gift.b.y) / 2), seen = {}, barks = 0;
    for (var i = 0; i < 16; i++) {
      g._warp(mx, my); var before = g._shared().messages.length; g.wait();
      g._shared().messages.slice(before).forEach(function (m) { if (/Gifte|Authentic Dungeon Souvenirs/.test(m.text)) { assert(!seen[m.text], "no repeat: " + m.text); seen[m.text] = 1; barks++; } });
    }
    assert(barks >= 2, "the shops bark near the strip (" + barks + ")");
  });

  test("barks ride the senses channel and never trigger a critical --more-- stop", function () {
    var g = game(); g._freezeVendor(true); var gift = g._townMeta().gift;
    var mx = Math.round((gift.a.x + gift.b.x) / 2), my = Math.round((gift.a.y + gift.b.y) / 2);
    for (var i = 0; i < 30; i++) { g._warp(mx, my); g.wait(); }
    var barks = g._shared().messages.filter(function (m) { return /Gifte|Authentic Dungeon Souvenirs/.test(m.text); });
    assert(barks.length >= 1 && barks.every(function (m) { return m.ch === "senses" && !m.urgent; }), "barks are senses, never urgent");
  });

  test("a fast actor acts measurably more than a slow one over 100 turns", function () {
    var g = game(); g._warp(2, 2); g._clearActors();
    var kid = g._addActor({ id: "kid", x: 35, y: 16, glyph: "k", name: "a kid", speed: 130 });
    var nun = g._addActor({ id: "slownun", x: 35, y: 24, glyph: "n", name: "a slow nun", speed: 70 });
    for (var i = 0; i < 100; i++) g.wait();
    assert(kid.acts > nun.acts && kid.acts > 100 && nun.acts < 100, "130 acts more than 70 (" + kid.acts + " vs " + nun.acts + ")");
  });

  test("a wobbling drunk sailor never steps through a wall", function () {
    var g = game(); g._warp(2, 2); g._clearActors();
    var sailor = g._addActor({ id: "sailor", x: 35, y: 20, glyph: "d", name: "a drunk sailor", speed: 60, wobble: true, type: "sailor", home: { x: 35, y: 20 } });
    for (var i = 0; i < 120; i++) { g.wait(); var grid = g.view().grid; assert(grid[sailor.y][sailor.x] === ".", "the sailor stands on the road"); }
  });

  test("NPCs travel via roads only and dwell at destinations", function () {
    var g = game(); var v = g.view();
    function isRoad(x, y) { return v.grid[y][x] === "." && !v.doors[x + "," + y] && !v.features[x + "," + y]; }
    var dwelled = {};
    for (var i = 0; i < 400; i++) { g.wait(); g._actors().forEach(function (a) { assert(isRoad(a.x, a.y), a.id + " off-road (" + a.x + "," + a.y + ")"); if (a.dwell > 0) dwelled[a.id] = true; }); }
    assert(Object.keys(dwelled).length >= 2, "actors reach destinations and dwell");
  });

  test("the Bureau patrol walks its route over time", function () {
    var g = game(); g._warp(2, 2); g._clearActors();
    var wp = [[10, 20], [35, 20], [60, 20], [35, 8]], hit = {};
    var gd = g._addActor({ id: "guard1", type: "guard", glyph: "G", name: "a Bureau patrol", voiceId: "guard", speed: 100, x: 35, y: 20, home: { x: 35, y: 20 }, route: wp.map(function (p) { return { x: p[0], y: p[1] }; }) });
    for (var i = 0; i < 1500; i++) { g.wait(); wp.forEach(function (p, idx) { if (Math.max(Math.abs(gd.x - p[0]), Math.abs(gd.y - p[1])) <= 1) hit[idx] = true; }); }
    wp.forEach(function (p, idx) { assert(hit[idx], "guard visited waypoint " + idx + " (" + p + ")"); });
  });

  test("every enterable establishment has 2-4 occupants (friendly)", function () {
    var g = game();
    ["hotel", "restaurant", "coffee", "bodega", "saloon", "bank", "church", "spa"].forEach(function (id) {
      g._goto(id); var v = g.view();
      assert(v.creatures.length >= 2 && v.creatures.length <= 4, id + ": 2-4 occupants (" + v.creatures.length + ")");
      assert(v.creatures.every(function (c) { return c.friendly; }), id + ": occupants friendly");
    });
  });

  test("the exterior crowd is sized to feel busy", function () {
    var g = game(); var a = g._town().actors;
    var ext = a.filter(function (x) { return !x.isVendor && x.type !== "kid" && x.type !== "chaperone"; });
    assert(ext.length >= 18 && ext.length <= 32, "18-32 exterior crowd (" + ext.length + ")");
    assert(a.filter(function (x) { return x.type === "dockworker" || x.type === "sailor"; }).length >= 6, "waterfront dock/sailor");
    assert(a.filter(function (x) { return x.type === "visitor"; }).length >= 3, "visitors on the strip");
  });

  test("the school troop stays together - no kid more than 3 tiles from the chaperone", function () {
    var g = game(); g._warp(2, 2);
    for (var i = 0; i < 250; i++) { g.wait(); var as = g._actors(), chap = as.filter(function (a) { return a.id === "chaperone"; })[0]; if (!chap) continue;
      as.filter(function (a) { return a.type === "kid"; }).forEach(function (k) { assert(cd(k, chap) <= 3, "a kid drifted " + cd(k, chap)); }); }
  });

  test("the town gate prompts to leave; n steps you back; y closes the session", function () {
    var g = game(); var ex = g._exitTile(); assert(ex, "the town has an exit gate");
    g._warp(ex.x, ex.y + 1);
    assert(!g._pendingExit(), "no prompt before the gate");
    g.move("up");
    assert(g._pendingExit() && g.view().exitPrompt, "the gate prompts");
    g.cancelExit();
    assert(!g._pendingExit() && g._player().x === ex.x && g._player().y === ex.y + 1, "n steps you back");
    g._warp(ex.x, ex.y + 1); g.move("up"); g.confirmExit();
    assert(g.view().left, "y closes the session");
  });

  test("three horizon landmarks exist and read on the senses channel", function () {
    var g = game(); var feats = g.view().features;
    var labels = Object.keys(feats).map(function (k) { return feats[k].label || ""; });
    ["castle", "monastery", "cave"].forEach(function (w) { assert(labels.some(function (l) { return new RegExp(w, "i").test(l); }), "a " + w + " landmark"); });
    g._warp(3, 2); var before = g._shared().messages.length; g.move("left");
    var sens = g._shared().messages.slice(before).filter(function (m) { return m.ch === "senses"; });
    assert(sens.some(function (m) { return /castle/i.test(m.text) && m.kind === "seen"; }), "the castle look is a senses/seen line");
  });

  // ----------------------------------- EVERYONE TALKS (across all screens) -
  test("no NPC is mute: every actor on every screen + every occupant resolves to a non-empty pool", function () {
    var g = game();
    function ck(n) { var d = TD_VOICES.dialogue(n.voiceId, n.type); assert(d.greetings.length > 0 && d.chat.length > 0, (n.name || n.voiceId) + " has a non-empty dialogue pool"); }
    g._screens().forEach(function (s) { (s.actors || []).forEach(ck); });
    INTERIOR_IDS.forEach(function (id) { g._occupantsOf(id).forEach(ck); });
  });

  // (the old bump-to-talk "contact dialogue" test is retired: friendly bump now
  // DISPLACES, per the June-11 ruling. The voice greet/chat/recycle flow is
  // covered by the voice-engine suite (run_voices) and the keeper-counter chats.)

  test("D3 PALM READER interior: a stub flavour business (sign, counter, patrons; no mechanics)", function () {
    var g = game(); g._goto("palmreader"); var v = g.view();
    assert(/palm reader/i.test(v.title), "the palm reader interior exists (" + v.title + ")");
    var counterAct = null; Object.keys(v.features).forEach(function (k) { if (v.features[k].type === "counter") counterAct = v.features[k].act; });
    assert(counterAct === "flavor", "the counter is FLAVOUR only — no divination mechanics (red-pen-pending)");
    assert(v.creatures.length >= 2 && v.creatures.every(function (c) { return c.friendly; }), "2+ friendly patrons");
  });

  // E1 — ENTRY ANNOUNCEMENT
  test("E1 ANNOUNCEMENT: entering a named space posts exactly one banner welcome; quick re-entry does not spam", function () {
    var g = game();
    var before = g._shared().messages.length;
    g._goto("hotel");
    var ann = g._shared().messages.slice(before).filter(function (m) { return m.banner && /entered/i.test(m.text); });
    eq(ann.length, 1, "exactly one banner announcement on entry");
    assert(/HOTEL|KRAKEN/i.test(ann[0].text), "it names the place: " + ann[0].text);
    // quick re-entry (no turns pass) must NOT re-announce
    var mid = g._shared().messages.length;
    g._goto("hotel");
    var again = g._shared().messages.slice(mid).filter(function (m) { return m.banner; });
    eq(again.length, 0, "re-entering the same space in quick succession does not spam");
  });

  test("E1 ANNOUNCEMENT: crossing into a town district announces it (the Bureau welcomes you)", function () {
    var g = game(); var rl = g._town().meta.redlight.rect;
    g._warp(rl[0] + 1, rl[1] - 2);                          // just outside the red-light mouth
    var before = g._shared().messages.length;
    // step into the district (walk toward the mouth); find an open tile inside
    var done = false;
    for (var i = 0; i < 30 && !done; i++) { g.move("down"); if (g._shared().messages.slice(before).some(function (m) { return m.banner && /RED LIGHT/i.test(m.text); })) done = true; }
    assert(done, "entering the red-light district posts its banner");
  });

  test("E2: the town view exposes named buildings + the entrance; size grammar survives", function () {
    var g = game(); var v = g.view();
    assert(v.buildings && v.buildings.length >= 10, "the view carries the building list (" + (v.buildings || []).length + ")");
    var church = v.buildings.filter(function (b) { return b.id === "church"; })[0];
    var hotel = v.buildings.filter(function (b) { return b.id === "hotel"; })[0];
    assert(church && church.glyph === "C" && TD_UI.buildingCategory("church") === "civic", "the church reads as civic (glyph C)");
    assert(hotel && hotel.glyph === "H" && TD_UI.buildingCategory("hotel") === "food", "the hotel reads as food/lodging (glyph H)");
    assert(v.dungeonEntrance, "the dungeon entrance is exposed for the map");
    v.buildings.forEach(function (b) { if (b.id !== "church") assert(church.area >= b.area, "size grammar: church >= " + b.id); });
    // the C2 storefront grammar is present to render (operator reported it did not read)
    var by = {}; Object.keys(v.features).forEach(function (k) { var t = v.features[k].type; by[t] = (by[t] || 0) + 1; });
    assert((by.window || 0) >= 5 && (by.awning || 0) >= 3 && (by.sign || 0) >= 3, "storefront features present to render (win/awn/sign " + by.window + "/" + by.awning + "/" + by.sign + ")");
  });

  test("a named NPC spec overrides the type pool", function () {
    var named = TD_VOICES.dialogue("vendor", "townsfolk"), type = TD_VOICES.dialogue("townsfolk", "townsfolk");
    assert(/cart|permit/i.test(named.greetings.join(" ")), "the named vendor pool is used, not the townsfolk type pool");
    assert(!/cart|permit/i.test(type.greetings.join(" ")), "the type pool is distinct");
  });

  // ----------------------------------- WIRE + CHANNEL (v15 R4) -------------
  // FRIENDLY DISPLACEMENT (operator ruling, June 11)
  test("DISPLACEMENT: walking into an interior patron swaps you past it (never blocks)", function () {
    var g = game(); g._goto("hotel");
    var occ = g.view().creatures[0]; assert(occ && occ.friendly, "the hotel has a patron");
    var tx = occ.x, ty = occ.y;                            // capture BEFORE the swap mutates the patron
    g._warp(tx - 1, ty); var p0 = { x: g._player().x, y: g._player().y };
    var r = g.move("right");
    assert(r.moved, "movement is not dead-stopped by the patron");
    assert(g._player().x === tx && g._player().y === ty, "you take the patron's tile");
    assert(g.view().creatures.filter(function (c) { return c.x === p0.x && c.y === p0.y; }).length === 1, "the patron swapped to your old tile (both preserved)");
  });

  test("DISPLACEMENT: a walker in a corridor never blocks; the swap preserves both", function () {
    var g = game(); g._clearActors();
    var px = g._player().x, py = g._player().y;
    var npc = g._addActor({ id: "blocker", type: "townsfolk", voiceId: "townsfolk", glyph: "p", name: "a stroller", x: px + 1, y: py, speed: 0, frozen: true });
    var r = g.move("right");
    assert(r.moved && g._player().x === px + 1 && g._player().y === py, "you pass the walker (movement never stops)");
    assert(npc.x === px && npc.y === py, "the walker swapped to your old tile (both actors preserved)");
  });

  test("DISPLACEMENT: ten steps along a line of friendlies never dead-stops", function () {
    var g = game(); g._clearActors(); var py = g._player().y, x0 = g._player().x;
    for (var i = 1; i <= 4; i++) g._addActor({ id: "row" + i, type: "townsfolk", voiceId: "townsfolk", glyph: "p", name: "a stroller", x: x0 + i, y: py, speed: 0, frozen: true });
    var blocked = 0; for (var s = 0; s < 4; s++) { if (!g.move("right").moved) blocked++; }
    assert(blocked === 0, "walking a corridor packed with friendlies blocked " + blocked + " times (must be 0)");
  });

  test("CLERK EXCEPTION: a posted counter clerk is not displaced (bump opens business)", function () {
    var g = game(); g._goto("hotel"); var v = g.view(), ck = null;
    Object.keys(v.features).forEach(function (k) { if (v.features[k].type === "counter") { var p = k.split(",").map(Number); ck = { x: p[0], y: p[1] }; } });
    assert(ck, "the hotel has a posted counter");
    g._warp(ck.x, ck.y + 1); var r = g.move("up");
    assert(!r.moved && r.bumpedCounter, "the clerk stays posted; bump opens business, does not displace");
    assert(g._player().x === ck.x && g._player().y === ck.y + 1, "you do not move onto the counter");
  });

  var pass = results.filter(function (r) { return r.ok; }).length;
  return { pass: pass, fail: results.length - pass, results: results };
}
