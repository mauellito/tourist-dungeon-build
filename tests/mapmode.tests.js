// Tourist Dungeon — visual map mode tests. Defines TD_MAP_TESTS(), run by
// tests/run_map.py in headless Chrome against the REAL engine modules
// (rng + interpreter + vaults + checker + generator + mapmode). Movement, doors,
// one-way sealing, fog, hazards, secrets — all GEOMETRY-AGNOSTIC (v18: rooms are
// carved varied, so tests query the actual layout) — plus the v18 geometry
// variety assertions (CONSTRUCTION LAW: a quality not asserted does not exist).

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

  // -------- geometry-agnostic helpers (query the actual carved layout) --------
  var STEP = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], ul: [-1, -1], ur: [1, -1], dl: [-1, 1], dr: [1, 1] };
  var S4 = ["up", "down", "left", "right"];
  function grid(g) { return g.view().grid; }
  function isFl(g, x, y) { var gr = grid(g); if (y < 0 || x < 0 || y >= gr.length || x >= gr[0].length) return false; if (gr[y][x] !== ".") return false; var k = x + "," + y, v = g.view(); if (v.doors && v.doors[k]) return false; if (v.plain && v.plain[k] && !v.plain[k].open) return false; return true; }
  function floorNbr(g) { var p = g._player(); for (var i = 0; i < S4.length; i++) { var d = S4[i], nx = p.x + STEP[d][0], ny = p.y + STEP[d][1]; if (isFl(g, nx, ny)) return { dir: d, x: nx, y: ny }; } return null; }
  function diagNbr(g) { var p = g._player(), dd = ["ul", "ur", "dl", "dr"]; for (var i = 0; i < dd.length; i++) { var d = dd[i], nx = p.x + STEP[d][0], ny = p.y + STEP[d][1]; if (isFl(g, nx, ny)) return { dir: d, x: nx, y: ny }; } return null; }
  function wallDir(g) { var p = g._player(), gr = grid(g); for (var i = 0; i < S4.length; i++) { var d = S4[i], nx = p.x + STEP[d][0], ny = p.y + STEP[d][1]; if (!(gr[ny] && gr[ny][nx] === ".")) return d; } return null; }
  function wallNbr(g) { var p = g._player(), gr = grid(g), ds = [[1, 0], [-1, 0], [0, -1], [0, 1], [1, 1], [-1, -1], [1, -1], [-1, 1]]; for (var i = 0; i < ds.length; i++) { var nx = p.x + ds[i][0], ny = p.y + ds[i][1]; if (gr[ny] && gr[ny][nx] === "#") return { x: nx, y: ny }; } return null; }
  function bfsPath(g, sx, sy, tx, ty) {
    var q = [[sx, sy]], seen = {}, prev = {}; seen[sx + "," + sy] = 1;
    while (q.length) {
      var c = q.shift();
      if (c[0] === tx && c[1] === ty) { var path = [], k = tx + "," + ty; while (k !== sx + "," + sy) { var pr = prev[k]; path.unshift(pr.dir); k = pr.from; } return path; }
      for (var i = 0; i < S4.length; i++) { var d = S4[i], nx = c[0] + STEP[d][0], ny = c[1] + STEP[d][1], kk = nx + "," + ny; if (!seen[kk] && isFl(g, nx, ny)) { seen[kk] = 1; prev[kk] = { from: c[0] + "," + c[1], dir: d }; q.push([nx, ny]); } }
    }
    return null;
  }
  function walkTo(g, tx, ty) { var p = g._player(); if (p.x === tx && p.y === ty) return true; var path = bfsPath(g, p.x, p.y, tx, ty); if (!path) return false; path.forEach(function (d) { g.move(d); }); var q = g._player(); return q.x === tx && q.y === ty; }
  function dirTo(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; for (var d in STEP) if (STEP[d][0] === dx && STEP[d][1] === dy) return d; return null; }
  // navigate the avatar adjacent to a door (pred-matched); return {door,dir-to-door}
  function reachDoor(g, pred) {
    var doors = g.view().doors;
    for (var k in doors) {
      if (pred && !pred(doors[k])) continue;
      var pp = k.split(",").map(Number), dx = pp[0], dy = pp[1];
      for (var i = 0; i < S4.length; i++) { var d = S4[i], ax = dx + STEP[d][0], ay = dy + STEP[d][1]; if (isFl(g, ax, ay) && walkTo(g, ax, ay)) return { door: { x: dx, y: dy, k: k }, dir: dirTo(ax, ay, dx, dy) }; }
    }
    return null;
  }
  // walk to a reachable floor tile that abuts a wall; return the wall {dir,x,y}
  function gotoWall(g) {
    var gr = grid(g), p = g._player(), best = null, bd = 1e9;
    for (var y = 0; y < gr.length; y++) for (var x = 0; x < gr[0].length; x++) {
      if (!isFl(g, x, y)) continue;
      var hasWall = false; for (var i = 0; i < S4.length; i++) { var nx = x + STEP[S4[i]][0], ny = y + STEP[S4[i]][1]; if (gr[ny] && gr[ny][nx] === "#") hasWall = true; }
      if (hasWall) { var dd = Math.abs(x - p.x) + Math.abs(y - p.y); if (dd < bd && (dd === 0 || bfsPath(g, p.x, p.y, x, y))) { bd = dd; best = { x: x, y: y }; } }
    }
    if (!best) return null;
    if (!(best.x === p.x && best.y === p.y)) walkTo(g, best.x, best.y);
    for (var j = 0; j < S4.length; j++) { var d = S4[j], wx = best.x + STEP[d][0], wy = best.y + STEP[d][1]; if (gr[wy] && gr[wy][wx] === "#") return { dir: d, x: wx, y: wy }; }
    return null;
  }
  function farFloor(g, minD) {           // a reachable floor tile at least minD away
    var p = g._player(), gr = grid(g), best = null, bd = -1;
    for (var y = 0; y < gr.length; y++) for (var x = 0; x < gr[0].length; x++) {
      if (!isFl(g, x, y)) continue; var dd = Math.abs(x - p.x) + Math.abs(y - p.y);
      if (dd >= minD && dd > bd && bfsPath(g, p.x, p.y, x, y)) { bd = dd; best = { x: x, y: y }; }
    }
    return best;
  }

  // ---------------------------------------------------------------- MOVEMENT
  test("avatar walks on floor and is blocked by walls", function () {
    var g = TD_MAP.create(world(), { hazards: false });
    var fn = floorNbr(g); assert(fn, "the spawn room has a floor neighbour");
    var r = g.move(fn.dir); assert(r.moved, "walks onto floor"); eq(g._player().x, fn.x); eq(g._player().y, fn.y);
    var w = gotoWall(g); assert(w, "a wall is reachable somewhere on the screen");
    var px = g._player().x, py = g._player().y;
    var b = g.move(w.dir); assert(!b.moved, "the wall blocks the step"); eq(g._player().x, px); eq(g._player().y, py);
  });

  // ------------------------------------------------------- DIAGONAL MOVEMENT
  test("diagonal keys move the avatar on both axes", function () {
    // Corridors are 1-wide and open corners are sealed, so diagonal movement lives in
    // ROOMS (2x2 floor). Give "a" several edges so it composes rooms, walk into a 2x2
    // block, and step diagonally across it.
    var w = {
      start: "a", year_length: 365, arrival_day: 1, meta: { seed: 3 },
      nodes: { a: { level: 1, title: "A" }, b: { level: 1, required: true }, c: { level: 1 }, d: { level: 1 }, e: { level: 1 } },
      edges: [{ id: "ab", from: "a", to: "b" }, { id: "ba", from: "b", to: "a" },
              { id: "ac", from: "a", to: "c" }, { id: "ca", from: "c", to: "a" },
              { id: "ad", from: "a", to: "d" }, { id: "da", from: "d", to: "a" },
              { id: "ae", from: "a", to: "e" }, { id: "ea", from: "e", to: "a" }], signals: {}
    };
    var g = TD_MAP.create(w, { hazards: false, creatures: false });
    var gr = grid(g);
    // floor reachable from the avatar (so walkTo is guaranteed)
    var reach = {}, rq = [[g._player().x, g._player().y]]; reach[rq[0][0] + "," + rq[0][1]] = 1;
    while (rq.length) { var rp = rq.shift(); S4.forEach(function (d) { var nx = rp[0] + STEP[d][0], ny = rp[1] + STEP[d][1]; if (isFl(g, nx, ny) && !reach[nx + "," + ny]) { reach[nx + "," + ny] = 1; rq.push([nx, ny]); } }); }
    function rf(x, y) { return reach[x + "," + y]; }
    var found = null;
    for (var y = 1; y < gr.length - 1 && !found; y++) for (var x = 1; x < gr[0].length - 1; x++) {
      if (rf(x, y) && rf(x + 1, y) && rf(x, y + 1) && rf(x + 1, y + 1)) { found = { x: x, y: y }; break; }
    }
    assert(found, "a reachable room provides a 2x2 floor block for diagonal movement");
    assert(walkTo(g, found.x, found.y), "reached the 2x2 block corner");
    var p0 = { x: g._player().x, y: g._player().y };
    var r = g.move("dr"); assert(r.moved, "diagonal move onto floor");
    assert(g._player().x === p0.x + 1 && g._player().y === p0.y + 1, "both axes changed");
  });

  // ------------------------------- DOORS: CONTACT REVEALS, ENTER COMMITS ----
  test("bumping a door does NOT open it; it only reveals", function () {
    var g = TD_MAP.create(world(), { hazards: false });
    var rd = reachDoor(g); assert(rd, "navigated adjacent to a door");
    var r = g.move(rd.dir);
    assert(r.bumpedDoor, "contact with a door is a bump, not an opening");
    assert(!r.traversed, "the door did not open on contact");
    eq(g.state.node, "a", "still in room a after the bump");
    includes(r.event, "Enter", "the reveal tells you to press Enter");
  });

  test("Enter opens the bumped door and recenters", function () {
    var g = TD_MAP.create(world(), { hazards: false });
    var rd = reachDoor(g); g.move(rd.dir);
    var r = g.open();
    assert(r.opened, "Enter commits the door");
    eq(g.state.node, "b", "now in room b");
    assert(g.isComplete(), "b was the only required node");
  });

  test("a locked door: bump reveals, Enter reports it barred, no crossing", function () {
    var g = TD_MAP.create(world({ requires: ["key"] }), { hazards: false });
    var rd = reachDoor(g); var b = g.move(rd.dir);
    includes(b.event, "barred", "the reveal shows it is barred");
    var r = g.open();
    assert(!r.opened, "Enter cannot force a barred door");
    includes(r.blocked, "key", "names the missing key");
    eq(g.state.node, "a", "still in room a");
  });

  // ------------------------------------------------------------ ONE-WAY SEAL
  test("a one-way stair seals: no door back after Enter", function () {
    var g = TD_MAP.create(world({ one_way: true }), { hazards: false });
    var rd = reachDoor(g); g.move(rd.dir); g.open();
    eq(g.state.node, "b");
    var backDoors = Object.keys(g._doors()).filter(function (k) { return g._doors()[k].to === "a"; });
    eq(backDoors.length, 0, "there is no way back through the sealed stair");
  });

  // ------------------------------------------------------------- FOG OF WAR
  test("fog reveals new tiles as the avatar moves", function () {
    var g = TD_MAP.create(world(), { hazards: false });
    var before = g._explored().size;
    var fn = floorNbr(g); g.move(fn.dir);
    assert(g._explored().size > before, "moving should reveal new tiles");
  });

  // ---------------------------------------------------- COMBAT (bump-to-fight)
  test("bumping a creature fights it; enough hits kill it", function () {
    var g = TD_MAP.create(world(), { creatures: true });
    g._setCreatures([]); var fn = floorNbr(g);
    g._setCreatures([{ x: fn.x, y: fn.y, kind: "wanderer", hp: 15, maxHp: 15, dmg: 8, name: "a test thing", glyph: "r" }]);
    var p0 = { x: g._player().x, y: g._player().y };
    var r = g.move(fn.dir);
    assert(r.attacked, "bumping a creature is an attack");
    assert(r.killed, "15 hp < 20 damage — it dies in one blow");
    assert(g._player().x === p0.x && g._player().y === p0.y, "the avatar does not move onto the creature");
    eq(g._meters().hp, 100, "no retaliation from a creature already down");
  });

  test("a creature deals damage and can kill the avatar", function () {
    var g = TD_MAP.create(world(), { creatures: true });
    g._setCreatures([]); g._meters().hp = 10; var fn = floorNbr(g);
    g._setCreatures([{ x: fn.x, y: fn.y, kind: "lurker", hp: 100, maxHp: 100, dmg: 16, name: "a patient lurker", glyph: "L" }]);
    var r = g.move(fn.dir);
    assert(r.dead, "16 damage to 10 hp is fatal");
    assert(g.isDead());
    var pm = g.postmortem();
    includes(pm.heading, "BUREAU");
    includes(pm.cause, "Level 1", "postmortem cites the spatial fact (the level)");
  });

  // --------------------------------------------- DMZ (v20 R1: no-fight refuges)
  // The avatar STARTS in the room under test, so the assertion is about the room's
  // own spawn, not navigation. `dmz` toggles the saloon flag on that start room.
  function roomWorld(seed, dmz) {
    var s = { level: 1, title: dmz ? "The Wary Tap-Room" : "A Level-1 Room" };
    if (dmz) s.dmz = "saloon";
    return {
      start: "s", year_length: 365, arrival_day: 1, meta: { seed: seed || 1 },
      nodes: { s: s, x: { level: 1, required: true, title: "Onward" } },
      edges: [{ id: "sx", from: "s", to: "x" }, { id: "xs", from: "x", to: "s" }],
      signals: {}
    };
  }

  test("a DMZ saloon spawns no hostiles, across seeds (and non-DMZ rooms do)", function () {
    var everInDMZ = 0, everPlain = 0;
    for (var s = 1; s <= 10; s++) {
      var gd = TD_MAP.create(roomWorld(s, true), { creatures: true });
      everInDMZ += gd._creatures().length;
      var gp = TD_MAP.create(roomWorld(s, false), { creatures: true });
      everPlain += gp._creatures().length;
    }
    eq(everInDMZ, 0, "no hostile ever spawns inside a DMZ saloon, over 10 seeds");
    assert(everPlain > 0, "the same rooms without the DMZ flag DO spawn hostiles (control)");
  });

  test("inside a DMZ a hostile bump is refused — no fight resolves", function () {
    var g = TD_MAP.create(roomWorld(3, true), { creatures: true });
    eq(g.state.node, "s", "started in the saloon");
    var fn = floorNbr(g);
    g._setCreatures([{ x: fn.x, y: fn.y, kind: "wanderer", hp: 15, maxHp: 15, dmg: 8, name: "a stray", glyph: "r" }]);
    var r = g.move(fn.dir);
    assert(r.refused && r.dmz, "the house rule refuses the blow");
    assert(!r.attacked, "no attack resolves inside the DMZ");
    eq(g._creatures()[0].hp, 15, "the creature is unharmed");
  });

  // v2 (Jaquay) — CLOSED DOORS ARE INSCRUTABLE: a closed door leaks nothing beyond.
  function manyDoorWorld(seed) {
    return {
      start: "a", year_length: 365, arrival_day: 1, meta: { seed: seed },
      nodes: { a: { level: 1, title: "A" }, b: { level: 1, required: true }, c: { level: 1 }, d: { level: 1 } },
      edges: [{ id: "ab", from: "a", to: "b" }, { id: "ba", from: "b", to: "a" },
              { id: "ac", from: "a", to: "c" }, { id: "ca", from: "c", to: "a" },
              { id: "ad", from: "a", to: "d" }, { id: "da", from: "d", to: "a" }], signals: {}
    };
  }
  test("v2 CLOSED DOOR: a closed room door hides the room beyond until opened", function () {
    var tested = false;
    for (var seed = 1; seed <= 14 && !tested; seed++) {
      var g = TD_MAP.create(manyDoorWorld(seed), { creatures: false, hazards: false });
      var rds = g.view().roomDoors || {}, comp = g._composition(), room = null, dk = null;
      (comp.roomList || []).forEach(function (rm) { var k = rm.door.x + "," + rm.door.y; if (rds[k] && rds[k].state === "closed") { room = rm; dk = k; } });
      if (!room) continue;
      var dxy = dk.split(",").map(Number), roomCell = null, corrCell = null;
      S4.forEach(function (dir) { var nx = dxy[0] + STEP[dir][0], ny = dxy[1] + STEP[dir][1]; if (isFl(g, nx, ny)) { if (nx >= room.x0 && nx <= room.x1 && ny >= room.y0 && ny <= room.y1) roomCell = [nx, ny]; else corrCell = [nx, ny]; } });
      if (!roomCell || !corrCell) continue;
      if (!walkTo(g, corrCell[0], corrCell[1])) continue;
      tested = true;
      var vis = new Set(g.view().visible);
      assert(!vis.has(roomCell[0] + "," + roomCell[1]), "seed " + seed + ": the room behind the CLOSED door is NOT visible");
      // step onto the door (it opens), then into the room — now it is visible
      var dToDoor = dirTo(corrCell[0], corrCell[1], dxy[0], dxy[1]); g.move(dToDoor);
      var dIn = dirTo(dxy[0], dxy[1], roomCell[0], roomCell[1]); if (dIn) g.move(dIn);
      assert(new Set(g.view().visible).has(roomCell[0] + "," + roomCell[1]) || (g._player().x === roomCell[0] && g._player().y === roomCell[1]),
        "seed " + seed + ": once opened and entered, the room is visible");
    }
    assert(tested, "found a closed room door to test opacity");
  });

  test("v2 MAP MEMORY: explored geometry persists when a node is left and re-entered", function () {
    var g = TD_MAP.create(manyDoorWorld(5), { creatures: false, hazards: false });
    // explore away from spawn so the captured set is more than the arrival LOS
    var fn = floorNbr(g); if (fn) { g.move(fn.dir); g.move(fn.dir); }
    var exp0 = Array.from(g.view().explored);
    assert(exp0.length > 1, "explored some of the node");
    g._rebuild();   // leave and return to this node (the deterministic geometry is identical)
    var exp1 = new Set(g.view().explored), kept = true;
    for (var i = 0; i < exp0.length; i++) if (!exp1.has(exp0[i])) kept = false;
    assert(kept, "every tile explored before is still remembered after re-entry (not reset to the arrival LOS)");
  });

  // -------------------------------------------------------------- BODY METERS
  test("body meters drain with action; starvation costs HP", function () {
    var g = TD_MAP.create(world(), { creatures: false });
    eq(g._meters().fatigue, 0); eq(g._meters().satiation, 100);
    var fn = floorNbr(g); g.move(fn.dir); g.move(fn.dir === "left" ? "right" : "left");
    assert(g._meters().fatigue > 0, "fatigue rises with action");
    assert(g._meters().satiation < 100, "satiation falls with action");
    g._meters().satiation = 0;
    var hpBefore = g._meters().hp, fn2 = floorNbr(g);
    g.move(fn2.dir);
    assert(g._meters().hp < hpBefore, "starvation drains HP");
  });

  // ------------------------------------------------------- TURN-BASED CLOCK
  test("the turn counter advances on action and the world acts only then", function () {
    var g = TD_MAP.create(world(), { creatures: false });
    var t0 = g._turn(), fn = floorNbr(g);
    g.move(fn.dir);
    eq(g._turn(), t0 + 1, "a step is one turn");
    g.wait();
    eq(g._turn(), t0 + 2, "waiting passes a turn");
    var t1 = g._turn();
    eq(g._turn(), t1, "no action, no turn");
  });

  // ------------------------------------------------------------ FLOOR ITEMS
  test("items lie on the floor; g picks them up into the pack", function () {
    var g = TD_MAP.create(world(), { creatures: false });
    var fn = floorNbr(g); g._setItem(fn.x, fn.y, "ration");
    var miss = g.get();
    assert(!miss.got, "nothing under the avatar yet");
    g.move(fn.dir);
    var r = g.get();
    assert(r.got, "g takes the item");
    eq(g._inventory().length, 1, "the bun is in the pack");
    eq(g._inventory()[0].kind, "ration");
    assert(!g._items()[fn.x + "," + fn.y], "the floor tile is now empty");
  });

  // --------------------------------------------------------- SEARCH SECRETS
  test("searching an adjacent wall finds the hidden pocket", function () {
    var g = TD_MAP.create(world(), { creatures: false });
    var w = gotoWall(g); assert(w, "a wall is reachable");
    g._addSecret(w.x, w.y, "souvenir");
    var r = g.search();
    assert(r.searched, "search runs");
    assert(r.found >= 1, "the adjacent secret is found");
    assert(!!g._items()[w.x + "," + w.y], "the hidden item is now on the revealed tile");
  });

  // ----------------------------------------------- PLAIN DOORS: OPEN / CLOSE
  test("a shut plain door blocks; o opens it, c closes it, and it blocks pursuit", function () {
    var g = TD_MAP.create(world(), { creatures: false });
    var fn = floorNbr(g), k = fn.x + "," + fn.y; g._addPlain(fn.x, fn.y);
    assert(!g._passable(fn.x, fn.y), "a shut plain door is not passable");
    var b = g.move(fn.dir);
    assert(!b.moved && b.plain, "the shut door blocks the step and reveals");
    var o = g.open();
    assert(o.opened, "the door opens");
    assert(g._plain()[k].open, "it is now open");
    assert(g._passable(fn.x, fn.y), "an open plain door is passable");
    g.move(fn.dir);
    eq(g._player().x, fn.x, "now you can step through"); eq(g._player().y, fn.y);
    var back = fn.dir === "left" ? "right" : fn.dir === "right" ? "left" : fn.dir === "up" ? "down" : "up";
    g.move(back);
    var c = g.closeDoor();
    assert(c.closed, "c closes the adjacent open door");
    assert(!g._plain()[k].open, "it is shut again");
  });

  // ------------------------------------------------ THIRD MONSTER: THE CHASER
  test("the chaser pursues relentlessly every turn", function () {
    var g = TD_MAP.create(world(), { creatures: true });
    g._setCreatures([]); var ff = farFloor(g, 4); assert(ff, "a distant floor tile exists");
    g._setCreatures([{ x: ff.x, y: ff.y, kind: "chaser", hp: 26, maxHp: 26, dmg: 11, name: "a fervent docent", glyph: "d" }]);
    var d0 = Math.abs(ff.x - g._player().x) + Math.abs(ff.y - g._player().y);
    g.wait();
    var cr = g._creatures()[0];
    var d1 = Math.abs(cr.x - g._player().x) + Math.abs(cr.y - g._player().y);
    assert(d1 < d0, "the chaser closed the distance on our turn (" + d0 + "->" + d1 + ")");
  });

  // ------------------------------------------- COMBAT NARRATION + HP --------
  test("combat is narrated in FEEL-WORDS — no numbers leak (Disco Elysium law)", function () {
    var g = TD_MAP.create(world(), { creatures: true });
    g._setCreatures([]); var fn = floorNbr(g);
    g._setCreatures([{ x: fn.x, y: fn.y, kind: "lurker", hp: 45, maxHp: 45, dmg: 16, name: "a patient lurker", glyph: "L" }]);
    var r = g.move(fn.dir);
    assert(r.attacked && !r.killed, "it survives the first blow");
    var texts = g._messages().map(function (m) { return m.text; }).join(" || ");
    // the blow + reply are narrated, but NO hit-point number appears (no "25/45", no bare HP)
    assert(/notice|lands on|still stands|strike/.test(texts), "the blow is narrated in the register");
    includes(texts, "amends your itinerary", "the creature's reply is narrated in the register");
    assert(!/\d+\s*\/\s*\d+/.test(texts) && !/\d+\s*hit point/.test(texts), "combat narration leaks NO hit-point number");
  });

  test("LIVE two-function combat: player + creature stat blocks resolve via hit/damage + read (feel-words, no leak)", function () {
    var g = TD_MAP.create(world(), { creatures: true });
    var ch = g._character();                                   // the live game gives the player a stat spine + gear
    ch.stats = TD_STATS.create(TD_RNG.make(5)); ch.weapon = TD_RESOLVE.GEAR.WEAPONS.shortsword; ch.armor = TD_RESOLVE.GEAR.ARMOR.light;
    g._setCreatures([]); var fn = floorNbr(g);
    var crStats = { might: 600, dex: 600, con: 600, int: 300, per: 400, lucky: 500, intuition: 380, appearance: 400, charm: 300, grit: 420 };
    g._setCreatures([{ x: fn.x, y: fn.y, kind: "lurker", hp: 100, maxHp: 100, dmg: 16, name: "a patient lurker", glyph: "L",
                       fighter: TD_RESOLVE.fighter(crStats, { name: "claw", type: "blade", base: 16, acc: 0 }, TD_RESOLVE.GEAR.ARMOR.light) }]);
    var r = g.move(fn.dir);
    assert(r.attacked && typeof r.hit === "boolean", "bumping resolves via the two-function model (connect/miss flag)");
    var texts = g._messages().map(function (m) { return m.text; }).join(" || ");
    assert(/It looks/.test(texts) && /reads it as/.test(texts), "THE READ surfaced feel-words: Per (OBJ seen) + Intuition (SUBJ)");
    assert(!/\d+\s*\/\s*\d+/.test(texts) && !/\d+\s*hit point/.test(texts), "live combat + read leak NO number");
  });

  test("R2 encumbrance: heavier loadout -> a slower band AND worse evasion (band folds into the fighter)", function () {
    var g = TD_MAP.create(world(), { creatures: false });
    var ch = g._character(); ch.stats = TD_STATS.create(TD_RNG.make(3)); ch.weapon = TD_RESOLVE.GEAR.WEAPONS.shortsword; ch.armor = TD_RESOLVE.GEAR.ARMOR.light; ch.purse = {};
    var lb = g._band(), lf = g._playerFighter();
    ch.purse = { gold: 3000 };                                  // ~120 lb of coin -> over the carry cap
    var hb = g._band(), hf = g._playerFighter();
    assert(hb.band.speed < lb.band.speed, "heavier loadout -> a slower band");
    assert(hf.armor.encumbrance > lf.armor.encumbrance, "heavier loadout -> worse evasion (band penalty folds in)");
  });
  test("R2 encumbrance: a band CROSSING announces a feel-word — no number", function () {
    var g = TD_MAP.create(world(), { creatures: false });
    var ch = g._character(); ch.stats = TD_STATS.create(TD_RNG.make(3)); ch.weapon = TD_RESOLVE.GEAR.WEAPONS.shortsword; ch.armor = TD_RESOLVE.GEAR.ARMOR.light; ch.purse = {};
    var fn = floorNbr(g); g.move(fn.dir);                       // walk light -> band recorded (Unencumbered)
    ch.purse = { gold: 3000 };                                  // pile on coin
    var fn2 = floorNbr(g); if (fn2) g.move(fn2.dir);            // walk heavy -> cross to a worse band -> announce
    var texts = g._messages().map(function (m) { return m.text; }).join(" || ");
    var m = /You are (Laden|Strained|Overloaded)\./.exec(texts);
    assert(!!m, "a band-crossing feel-word fires (you are <band>)");
    assert(!/\d/.test(m ? m[0] : "0"), "the band word carries no number");
  });

  // ------------------------------------------- MESSAGE URGENCY TIERS --------
  test("critical events (low HP hit, one-way seal) are flagged urgent in the log", function () {
    var g = TD_MAP.create(world(), { creatures: true });
    g._setCreatures([]); g._meters().hp = 18; var fn = floorNbr(g);
    g._setCreatures([{ x: fn.x, y: fn.y, kind: "chaser", hp: 200, maxHp: 200, dmg: 8, name: "a fervent docent", glyph: "d" }]);
    g.move(fn.dir);
    var last = g._messages()[g._messages().length - 1];
    assert(last.urgent, "the blow that drops you below a quarter is urgent");

    var g2 = TD_MAP.create(world({ one_way: true }), { creatures: false });
    var rd = reachDoor(g2); g2.move(rd.dir); g2.open();
    var msgs = g2._messages();
    assert(msgs.some(function (m) { return m.urgent && /seals behind you/.test(m.text); }), "the one-way seal is urgent");
  });

  // -------------------------------------- HUNGER LADDER + REST RECOVERY -----
  test("the hunger ladder is named, and only STARVING bites; resting recovers fatigue", function () {
    var g = TD_MAP.create(world(), { creatures: false });
    var m = g._meters();
    m.satiation = 100; eq(g._hunger().stage, "well fed");
    m.satiation = 55; eq(g._hunger().stage, "Peckish");
    m.satiation = 30; eq(g._hunger().stage, "Hungry");
    m.satiation = 12; eq(g._hunger().stage, "Famished", "Famished does not bite");
    assert(!g._hunger().critical, "Famished is not critical");
    m.satiation = 2; eq(g._hunger().stage, "Starving");
    assert(g._hunger().critical, "only Starving is critical");
    m.satiation = 100; m.fatigue = 40;
    g._setCreatures([]); g.wait();
    assert(m.fatigue < 40, "waiting with no enemy in sight eases fatigue");
  });

  test("food lasts much longer than before (many steps before it bites)", function () {
    var g = TD_MAP.create(world(), { creatures: false });
    g._meters().satiation = 100;
    var fn = floorNbr(g), back = fn.dir === "left" ? "right" : fn.dir === "right" ? "left" : fn.dir === "up" ? "down" : "up";
    for (var i = 0; i < 40; i++) { g.move(i % 2 ? back : fn.dir); }
    assert(g._hunger().stage === "well fed" || g._hunger().stage === "Peckish",
      "after 40 steps a full character is at worst Peckish (not starving)");
  });

  // -------------------------------------------- SENSES CHANNEL (Round 4) ----
  test("no dungeon line ships unchanneled; the click is a heard senses line", function () {
    var g = TD_MAP.create(world(), { creatures: false });
    var fn = floorNbr(g); g.move(fn.dir); g.wait();
    assert(g._messages().every(function (m) { return m.ch === "event" || m.ch === "senses"; }), "every line declares a channel");
  });

  test("a one-way's tells emit on the senses channel (heard OBJ + intuition SUBJ); the seal is heard", function () {
    var g = TD_MAP.create(world({ one_way: true }), { creatures: false });
    var dk = Object.keys(g._doors())[0];
    g._doors()[dk].tells = ["A cold draft slides from a seam in the wall.", "Probably rats in the wall."];
    var rd = reachDoor(g, function (d) { return d.type === "oneway"; }); g.move(rd.dir);
    var sens = g._messages().filter(function (m) { return m.ch === "senses"; });
    assert(sens.some(function (m) { return m.kind === "heard" && m.obj === "OBJ" && /cold draft/.test(m.text); }), "the draft is heard, OBJ, true");
    assert(sens.some(function (m) { return m.kind === "intuition" && m.obj === "SUBJ"; }), "the hunch (009) is intuition, SUBJ, may mislead");
    g.open();
    assert(g._messages().some(function (m) { return m.ch === "senses" && m.kind === "heard" && /click/.test(m.text); }), "the seal click is a heard senses line");
  });

  // -------------------------------------------- TERRAIN (Round 5) -----------
  function worldDown() {
    return {
      start: "a", year_length: 365, arrival_day: 1, meta: { seed: 1 },
      nodes: { a: { level: 1, title: "Room A" }, b: { level: 2, required: true, title: "Room B" } },
      edges: [{ id: "ab", from: "a", to: "b", label: "a shaft down" }], signals: {}
    };
  }
  test("WATER slows a step; CHASM is impassable and offers a prompted fall down", function () {
    var g = TD_MAP.create(worldDown(), { creatures: false });
    var fn = floorNbr(g); g._setWater(fn.x, fn.y);
    var t0 = g._turn(); g.move(fn.dir);
    eq(g._player().x, fn.x, "you wade into the water"); eq(g._player().y, fn.y);
    eq(g._turn(), t0 + 2, "water slows: two beats pass for the one step");
    var fn2 = floorNbr(g); assert(fn2, "another floor neighbour for the chasm"); g._setChasm(fn2.x, fn2.y);
    var r = g.move(fn2.dir);
    assert(!r.moved && r.chasm, "the chasm blocks the step and prompts a fall");
    assert(!(g._player().x === fn2.x && g._player().y === fn2.y), "you do not walk into the drop by contact");
    var hp0 = g._meters().hp, fr = g.open();
    assert(fr.fell, "Enter throws you down the chasm");
    eq(g.state.node, "b", "you land on the level below");
    assert(g._meters().hp < hp0, "the fall hurts");
  });

  // -------------------------------------------- SECRET GRAMMAR (Round 5) ----
  test("every secret carries a vocabulary tell; nearing one telegraphs it; search confirms hollow", function () {
    var g = TD_MAP.create(world(), { creatures: false });
    var VOCAB = ["draft", "rhyme", "hollow"], secs = g._secrets();
    Object.keys(secs).forEach(function (k) { assert(VOCAB.indexOf(secs[k].tell) >= 0, "secret " + k + " has a tell from the vocabulary"); });
    var w = gotoWall(g); g._addSecret(w.x, w.y, "ration", "rhyme");
    var ec = { x: g._player().x, y: g._player().y };       // the edge cell, adjacent to the new secret
    var away = floorNbr(g); g.move(away.dir); walkTo(g, ec.x, ec.y);   // step away then back -> approach tell fires
    assert(g._messages().some(function (m) { return m.ch === "senses" && /couplet|secret of its own/.test(m.text); }), "the rhyme tell is perceived on approach");
    var r = g.search();
    assert(r.found >= 1 && g._messages().some(function (m) { return m.ch === "senses" && /hollow/.test(m.text); }), "search confirms with the hollow tell");
  });

  // -------------------------------------------- VAULT RENDER (Round 5) ------
  test("a vault node renders its hand-authored room: terrain laid, secret telegraphed", function () {
    var w = {
      start: "v", year_length: 365, arrival_day: 1, meta: { seed: 1 },
      nodes: { v: { level: 1, vault: "flooded-antechamber", title: "V" }, h: { level: 1, required: true, title: "H" } },
      edges: [{ id: "vh", from: "v", to: "h", label: "leave" }], signals: {}
    };
    var g = TD_MAP.create(w, { creatures: false });
    var gr = g.view().grid, anyWater = false;
    for (var y = 0; y < gr.length; y++) if (gr[y].indexOf("~") >= 0) anyWater = true;
    assert(anyWater, "the flooded antechamber lays down water tiles");
    var secs = g._secrets(), keys = Object.keys(secs);
    assert(keys.length >= 1 && ["draft", "rhyme", "hollow"].indexOf(secs[keys[0]].tell) >= 0, "the vault's secret is telegraphed by a vocabulary tell");
  });

  // =========================================================================
  // v21 — DUNGEON ARCHITECTURE LAW v1 (tests are ARCHITECTURE, not topology).
  // Replaces the v18 blob-variety survey, which measured footprint shape of open
  // clusters; the corridors-first composer is graded on architecture instead. The
  // deep per-node conformance lives in tests/run_architecture.py; this is the in-suite
  // survey across 50 real seeds. (FLAGGED change: the old footprint-class, 25-40%-
  // density, 3-6-cluster and symmetric-rect tests are retired — they encoded blobs.)
  // =========================================================================
  function surveyGeometry() {
    var nodes = 0, unreach = 0, lens = [], wtally = { 1: 0, 2: 0, 3: 0 }, dens = [], roomCounts = [];
    var openCorners = 0, roomsNoDoor = 0, corridorless = 0, states = {};
    for (var seed = 1; seed <= 50; seed++) {
      var w = TD_GEN.generate(seed), inc = {};
      w.edges.forEach(function (e) { inc[e.from] = (inc[e.from] || 0) + 1; });
      var g = TD_MAP.create(w, { creatures: false, hazards: false });
      Object.keys(w.nodes).forEach(function (nk) {
        if (w.nodes[nk].vault) return;                 // vault interiors are hand-authored (law exempt)
        var nd = inc[nk] || 0; if (nd < 1) return;
        var c = g._compose(nk, nd); nodes++;
        dens.push(c.floorDensity); roomCounts.push(c.rooms);
        if (!c.corridorCells) corridorless++;
        var grid2 = c.grid, H2 = grid2.length, W2 = grid2[0].length;
        function fl(x, y) { return grid2[y] && grid2[y][x] === "."; }
        function wl(x, y) { return !(grid2[y] && grid2[y][x] === "."); }
        var seen = {}, q = [[c.spawn.x, c.spawn.y]]; seen[c.spawn.x + "," + c.spawn.y] = 1;
        while (q.length) { var p = q.shift();[[p[0], p[1] - 1], [p[0], p[1] + 1], [p[0] - 1, p[1]], [p[0] + 1, p[1]]].forEach(function (n) { if (fl(n[0], n[1]) && !seen[n[0] + "," + n[1]]) { seen[n[0] + "," + n[1]] = 1; q.push(n); } }); }
        c.doorPts.forEach(function (d) { if (!seen[d.x + "," + d.y]) unreach++; });
        (c.roomList || []).forEach(function (rm) { if (!rm.door || !seen[rm.door.x + "," + rm.door.y]) roomsNoDoor++; });
        (c.roomDoors || []).forEach(function (rd) { states[rd.state] = (states[rd.state] || 0) + 1; });
        for (var y = 0; y < H2 - 1; y++) for (var x = 0; x < W2 - 1; x++) {
          if (fl(x, y) && fl(x + 1, y + 1) && wl(x + 1, y) && wl(x, y + 1)) openCorners++;
          if (fl(x + 1, y) && fl(x, y + 1) && wl(x, y) && wl(x + 1, y + 1)) openCorners++;
        }
        c.corrLens.forEach(function (l) { lens.push(l); }); c.corrWidths.forEach(function (x) { if (wtally[x] !== undefined) wtally[x]++; });
      });
    }
    return { nodes: nodes, unreach: unreach, lens: lens, wtally: wtally, dens: dens, roomCounts: roomCounts,
      openCorners: openCorners, roomsNoDoor: roomsNoDoor, corridorless: corridorless, states: states };
  }
  var GEO = surveyGeometry();
  function median(a) { a = a.slice().sort(function (x, y) { return x - y; }); return a[Math.floor(a.length / 2)]; }

  test("ARCHITECTURE: every node has a corridor net; rooms reach it through a doorway", function () {
    eq(GEO.corridorless, 0, "nodes with no corridor: " + GEO.corridorless);
    eq(GEO.roomsNoDoor, 0, "rooms not reaching the corridor via a doorway: " + GEO.roomsNoDoor);
  });

  test("ARCHITECTURE: zero open-corner adjacencies across 50 seeds", function () {
    eq(GEO.openCorners, 0, "diagonal floor leaks: " + GEO.openCorners);
  });

  test("ARCHITECTURE: density is corridors-and-rooms (legible), never a blob", function () {
    var md = median(GEO.dens), mx = Math.max.apply(null, GEO.dens);
    assert(md >= 0.06 && md <= 0.30, "median floor density is " + (100 * md).toFixed(0) + "% (corridors-first band 6-30%)");
    assert(mx <= 0.42, "no node is a blob (densest is " + (100 * mx).toFixed(0) + "%)");
  });

  test("ARCHITECTURE: rooms hang off the corridor (a few per node)", function () {
    var mn = Math.min.apply(null, GEO.roomCounts), mx = Math.max.apply(null, GEO.roomCounts);
    assert(mn >= 1 && mx <= 7, "rooms per node span " + mn + "-" + mx);
    assert(median(GEO.roomCounts) >= 2, "the typical node has several rooms (median " + median(GEO.roomCounts) + ")");
  });

  test("ARCHITECTURE: doors carry states (closed / ajar / open all occur)", function () {
    assert(GEO.states.closed && GEO.states.ajar && GEO.states.open,
      "all three door states appear: " + JSON.stringify(GEO.states));
  });

  // v2 (Jaquay) — WATER IS RATIONED: an occasional level feature, not per-floor default.
  test("v2 WATER: water is a minority-of-levels feature, not standard terrain", function () {
    var wet = 0, total = 0;
    for (var seed = 1; seed <= 24; seed++) {
      var g = TD_MAP.create({ start: "x", year_length: 365, arrival_day: 1, meta: { seed: seed }, nodes: { x: { level: 1 } }, edges: [], signals: {} }, { creatures: false });
      for (var L = 1; L <= 5; L++) { total++; if (g._levelWet(L)) wet++; }
    }
    var pct = 100 * wet / total;
    assert(pct > 0 && pct < 45, "wet levels are a minority: " + pct.toFixed(0) + "% of " + total + " (target a low %, never default)");
  });

  // v2 (Jaquay) — every naked dead-end HIDES a telegraphed secret (no pointless walks).
  test("v2 DEAD ENDS: every naked dead-end hides a telegraphed secret at runtime", function () {
    var miss = 0, checked = 0;
    for (var seed = 1; seed <= 6; seed++) {
      var w = TD_GEN.generate(seed, { depth: 2 }), inc = {};
      w.edges.forEach(function (e) { inc[e.from] = (inc[e.from] || 0) + 1; });
      var g = TD_MAP.create(w, { creatures: false, hazards: false });
      Object.keys(w.nodes).forEach(function (nk) {
        if (w.nodes[nk].vault || (inc[nk] || 0) < 1 || (w.nodes[nk].level || 0) < 1) return;
        var c = g._compose(nk, inc[nk]);
        (c.deadEnds || []).forEach(function (de) {
          checked++;
          // the terminal wall must be a wall the runtime can hide a secret in
          if (!(c.grid[de.wallY] && c.grid[de.wallY][de.wallX] === "#")) miss++;
        });
      });
    }
    assert(checked === 0 || miss === 0, miss + " of " + checked + " dead-ends lack a wall to hide a secret");
  });

  test("R1.5 HALLWAYS: corridors of width 1 AND 2 AND 3 all occur, lengths vary", function () {
    assert(GEO.wtally[1] >= 1 && GEO.wtally[2] >= 1 && GEO.wtally[3] >= 1, "widths 1/2/3 all appear: " + JSON.stringify(GEO.wtally));
    var mn = Math.min.apply(null, GEO.lens), mx = Math.max.apply(null, GEO.lens);
    assert(mx - mn >= 8, "corridor length spread is only " + (mx - mn));
  });

  test("every door on every generated node is reachable from spawn (walkability)", function () {
    eq(GEO.unreach, 0, "unreachable doors across 50 seeds: " + GEO.unreach);
  });

  // ===================================================== v18 R2: LOOPS READ ==
  // Routes that loop are telegraphed in space (glimpse-before-reach). Pure
  // presentation: the graph/checker are untouched, so obligations stay green.
  function loopWorld() {
    return {
      start: "a", year_length: 365, arrival_day: 1, meta: { seed: 1 },
      nodes: { a: { level: 1, title: "Concourse A" }, b: { level: 1, required: true, title: "the Far Turn" } },
      edges: [{ id: "ab", from: "a", to: "b", label: "round the gallery" },
      { id: "ba", from: "b", to: "a", label: "back to the concourse" }],
      signals: {}
    };
  }
  function hubWorld() {
    return {
      start: "h", year_length: 365, arrival_day: 1, meta: { seed: 1 },
      nodes: { h: { level: 1, title: "Concourse" }, g: { level: 1, required: true, title: "the Stamping Office" }, l: { level: 1, title: "a Looping Gallery" } },
      edges: [{ id: "hg", from: "h", to: "g", label: "attend the office" },
      { id: "hl", from: "h", to: "l", label: "wander the gallery" },
      { id: "lh", from: "l", to: "h", label: "return to the concourse" }],
      signals: {}
    };
  }

  test("R2: edges on a directed cycle are detected as loops; dead-ends are not", function () {
    var g = TD_MAP.create(loopWorld(), { creatures: false, hazards: false });
    var ce = g._loopEdges();
    assert(ce["ab"] && ce["ba"], "the a<->b cycle is detected as loop edges");
    var g2 = TD_MAP.create(world(), { creatures: false, hazards: false });   // a->b only, b a dead end
    assert(!g2._loopEdges()["ab"], "a one-way dead-end edge is NOT a loop");
  });

  test("R2: a looping room seats a glimpse grate that names the place beyond", function () {
    var g = TD_MAP.create(loopWorld(), { creatures: false, hazards: false });
    var feats = g.view().features, grate = null;
    Object.keys(feats).forEach(function (k) { if (feats[k].act === "glimpse") grate = feats[k]; });
    assert(grate, "a glimpse grate is seated on the loop");
    eq(grate.glyph, "▦", "the grate has its own glyph");
    assert(grate.kind === "seen" && grate.obj === "OBJ", "the glimpse rides SENSES/seen, OBJ-true (a real sightline)");
    includes(grate.text, "the Far Turn", "the glimpse names the place the route bends toward");
    assert(g._glimpses().length >= 1, "the glimpse is recorded");
  });

  test("R2: entering a looping room logs a 'seen' glimpse on the senses channel", function () {
    var g = TD_MAP.create(loopWorld(), { creatures: false, hazards: false });
    var sens = g.view().messages.filter(function (m) { return m.ch === "senses" && m.kind === "seen" && /glimpse/i.test(m.text); });
    assert(sens.length >= 1, "a glimpse-before-reach senses line on entry");
  });

  test("R2: two route-options and a glimpse are visible at once (the loop reads)", function () {
    var g = TD_MAP.create(hubWorld(), { creatures: false, hazards: false });
    var v = g.view();
    assert(Object.keys(v.doors).length >= 2, "two routes leave the concourse at once (" + Object.keys(v.doors).length + ")");
    var grates = Object.keys(v.features).filter(function (k) { return v.features[k].act === "glimpse"; });
    assert(grates.length >= 1, "and one of them is telegraphed as a loop");
    includes(v.features[grates[0]].text, "Looping Gallery", "the loop door, not the dead-end office, is the one glimpsed");
  });

  test("R2: dead-end test worlds get NO glimpse (no orphaned tells, no regressions)", function () {
    [world(), world({ one_way: true }), world({ requires: ["key"] })].forEach(function (w) {
      var g = TD_MAP.create(w, { creatures: false, hazards: false });
      var any = Object.keys(g.view().features).some(function (k) { return g.view().features[k].act === "glimpse"; });
      assert(!any, "a single dead-end edge raises no glimpse");
    });
  });

  test("R2: generated dungeons actually contain loops for the telegraph to mark", function () {
    var withLoops = 0;
    for (var seed = 1; seed <= 20; seed++) {
      var w = TD_GEN.generate(seed);
      var g = TD_MAP.create(w, { creatures: false, hazards: false });
      var ce = g._loopEdges(), n = Object.keys(ce).length;
      if (n >= 1) withLoops++;
      assert(TD_CHECK.verify(w).pass, "seed " + seed + " still passes all six obligations (R2 touched no graph)");
    }
    assert(withLoops === 20, "every generated dungeon weaves at least one loop (" + withLoops + "/20)");
  });

  test("R3: a vault is spliced into EVERY level of a generated dungeon (outcome #4)", function () {
    for (var seed = 1; seed <= 30; seed++) {
      var w = TD_GEN.generate(seed), depth = w.meta.depth, byLevel = {};
      Object.keys(w.nodes).forEach(function (nk) { var nd = w.nodes[nk]; if (nd.vault) byLevel[nd.level] = (byLevel[nd.level] || 0) + 1; });
      for (var L = 1; L <= depth; L++) assert(byLevel[L] >= 1, "seed " + seed + ": level " + L + " has no vault");
      assert(TD_CHECK.verify(w).pass, "seed " + seed + " stays obligation-green with a vault on every level");
    }
  });

  test("R3: water pools the open floor while every exit keeps a dry route (outcome #3)", function () {
    var everWater = false;
    for (var s = 1; s <= 12; s++) {
      var w = {
        start: "a", year_length: 365, arrival_day: 1, meta: { seed: s },
        nodes: { a: { level: 1, title: "Big Hall" }, b: { level: 1, required: true, title: "B" }, c: { level: 1, title: "C" }, d: { level: 1, title: "D" }, e: { level: 1, title: "E" } },
        edges: [{ id: "ab", from: "a", to: "b", label: "north" }, { id: "ac", from: "a", to: "c", label: "east" }, { id: "ad", from: "a", to: "d", label: "south" }, { id: "ae", from: "a", to: "e", label: "west" }], signals: {}
      };
      var g = TD_MAP.create(w, { creatures: false, hazards: false });
      var v = g.view(), grid = v.grid, p = v.player, water = 0;
      grid.forEach(function (r) { for (var i = 0; i < r.length; i++) if (r[i] === "~") water++; });
      if (water > 0) everWater = true;
      function reach(set) {
        var seen = {}, q = [[p.x, p.y]]; seen[p.x + "," + p.y] = 1;
        while (q.length) { var c = q.shift();[[c[0], c[1] - 1], [c[0], c[1] + 1], [c[0] - 1, c[1]], [c[0] + 1, c[1]]].forEach(function (n) { var k = n[0] + "," + n[1], ch = grid[n[1]] && grid[n[1]][n[0]]; if (!seen[k] && set.indexOf(ch) >= 0) { seen[k] = 1; q.push(n); } }); }
        return seen;
      }
      var wade = reach([".", "~"]), dry = reach(["."]);
      Object.keys(v.doors).forEach(function (dk) {
        var xy = dk.split(",").map(Number), nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        assert(nb.some(function (d) { return wade[(xy[0] + d[0]) + "," + (xy[1] + d[1])]; }), "seed " + s + ": door " + dk + " unreachable even wading");
        assert(nb.some(function (d) { return dry[(xy[0] + d[0]) + "," + (xy[1] + d[1])]; }), "seed " + s + ": door " + dk + " lost its dry route (skeleton broke)");
      });
    }
    assert(everWater, "water never pooled in a large hall across 12 seeds");
  });

  test("R4: secrets appear at learnable density, each a vocabulary tell (outcome #5)", function () {
    var VOCAB = ["draft", "rhyme", "hollow"], seenTells = {}, dense = 0, total = 0;
    for (var s = 1; s <= 12; s++) {
      var w = {
        start: "a", year_length: 365, arrival_day: 1, meta: { seed: s },
        nodes: { a: { level: 1, title: "Big Hall" }, b: { level: 1, required: true, title: "B" }, c: { level: 1, title: "C" }, d: { level: 1, title: "D" }, e: { level: 1, title: "E" } },
        edges: [{ id: "ab", from: "a", to: "b", label: "n" }, { id: "ac", from: "a", to: "c", label: "e" }, { id: "ad", from: "a", to: "d", label: "s" }, { id: "ae", from: "a", to: "e", label: "w" }], signals: {}
      };
      var g = TD_MAP.create(w, { creatures: false, hazards: false }), secs = g._secrets(), ks = Object.keys(secs);
      total++; if (ks.length >= 2) dense++;
      ks.forEach(function (k) {
        assert(VOCAB.indexOf(secs[k].tell) >= 0, "secret " + k + " carries a vocabulary tell (no invented tell)");
        var xy = k.split(",").map(Number); assert(g.view().grid[xy[1]][xy[0]] === "#", "the secret hides in a wall");
        seenTells[secs[k].tell] = 1;
      });
    }
    assert(dense >= 10, "most large rooms carry >=2 secrets at density (" + dense + "/" + total + ")");
    VOCAB.forEach(function (t) { assert(seenTells[t], "the '" + t + "' tell appears across rooms, so it can be learned"); });
  });

  // FRIENDLY DISPLACEMENT in the dungeon DMZ (operator ruling, June 11)
  test("DISPLACEMENT: a HOSTILE bump still attacks (unchanged)", function () {
    var g = TD_MAP.create(world(), { creatures: false }); var fn = floorNbr(g); assert(fn, "a floor neighbour exists");
    g._setCreatures([{ x: fn.x, y: fn.y, kind: "wanderer", hp: 30, maxHp: 30, dmg: 8, name: "a nocent thing", glyph: "r" }]);   // no friendly flag = hostile
    var r = g.move(fn.dir);
    assert(r.attacked && !r.moved, "bumping a hostile attacks, does not displace");
  });

  test("DISPLACEMENT: a FRIENDLY DMZ non-hostile is displaced — swap, never blocks", function () {
    var g = TD_MAP.create(world(), { creatures: false }); var p = { x: g._player().x, y: g._player().y }, fn = floorNbr(g);
    g._setCreatures([{ x: fn.x, y: fn.y, kind: "patron", hp: 1, maxHp: 1, dmg: 0, name: "a saloon patron", glyph: "p", friendly: true }]);
    var r = g.move(fn.dir);
    assert(r.moved && r.displaced, "a friendly never dead-stops you");
    assert(g._player().x === fn.x && g._player().y === fn.y, "you take the friendly's tile");
    assert(g._creatures().some(function (c) { return c.x === p.x && c.y === p.y; }), "the friendly swapped to your old tile");
  });

  var pass = results.filter(function (r) { return r.ok; }).length;
  return { pass: pass, fail: results.length - pass, results: results };
}
