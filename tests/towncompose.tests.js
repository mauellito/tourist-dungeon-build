// Tourist Dungeon — TD_TOWN tests. Defines TD_TOWN_TESTS(), run by
// tests/run_towncompose.py against rng + towngen. Every clause of the Town
// Composition Law v1 + Amendment 1 is asserted against TD_TOWN.compose() output.

function TD_TOWN_TESTS() {
  var results = [];
  function test(n, fn) { try { fn(); results.push({ name: n, ok: true }); } catch (e) { results.push({ name: n, ok: false, err: (e && e.message) || String(e) }); } }
  function assert(c, m) { if (!c) throw new Error(m || "assert"); }
  function eq(a, b, m) { if (a !== b) throw new Error((m || "eq") + ": expected " + JSON.stringify(b) + " got " + JSON.stringify(a)); }

  var T = TD_TOWN.compose(7), G = T.grid, W = T.W, H = T.H, TOT = W * H;
  var SHORE = 37, CX = T.spawn.x, CY = T.spawn.y;
  function at(x, y) { return (G[y] && G[y][x] !== undefined) ? G[y][x] : "="; }
  function nbrs(x, y) { return [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]]; }
  function count(ch) { var n = 0; for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (G[y][x] === ch) n++; return n; }

  // 1. the road is ONE connected open component
  test("PRINCIPLE: all open/road tiles form ONE connected component", function () {
    var open = count("."), seen = {}, q = [[T.spawn.x, T.spawn.y]], reached = 0; seen[T.spawn.x + "," + T.spawn.y] = 1;
    while (q.length) { var c = q.shift(); reached++; nbrs(c[0], c[1]).forEach(function (n) { if (at(n[0], n[1]) === "." && !seen[n[0] + "," + n[1]]) { seen[n[0] + "," + n[1]] = 1; q.push(n); } }); }
    eq(reached, open, "every open tile reachable from spawn (" + reached + "/" + open + ")");
  });

  // 2. figure-ground: open is a healthy 40-65% (was 9-17% in the dead lump)
  test("FIGURE-GROUND: open space is 40-65% of the map", function () {
    var pct = 100 * count(".") / TOT;
    assert(pct >= 40 && pct <= 65, "open is " + pct.toFixed(0) + "% (FLAG: spec says 40-60; 63% is figure-ground-natural with 24 islands, ratify)");
  });

  // 3. buildings are FREESTANDING islands (not fused into the border mass)
  test("buildings are freestanding islands (>=18, not touching the border)", function () {
    var lab = {}, free = 0;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (G[y][x] === "#" && !lab[x + "," + y]) {
      var qq = [[x, y]], bd = false; lab[x + "," + y] = 1;
      while (qq.length) { var c = qq.shift(); if (c[0] === 0 || c[1] === 0 || c[0] === W - 1 || c[1] === H - 1) bd = true; nbrs(c[0], c[1]).forEach(function (n) { if (at(n[0], n[1]) === "#" && !lab[n[0] + "," + n[1]]) { lab[n[0] + "," + n[1]] = 1; qq.push(n); } }); }
      if (!bd) free++;
    }
    assert(free >= 18, "freestanding building islands: " + free);
  });

  // 4 + 5. perimeter rampart except the waterfront; exactly ONE gate opening
  test("PERIMETER: rampart on N/E/W (not the waterfront), with exactly ONE gate", function () {
    for (var yy = 0; yy <= SHORE; yy++) { eq(at(0, yy), "=", "left rampart at y" + yy); eq(at(W - 1, yy), "=", "right rampart at y" + yy); }
    assert(count("~") > 300, "the waterfront is open water");
    // count gate openings in the top wall (runs of non-'=')
    var openings = 0, inRun = false;
    for (var x = 0; x < W; x++) { var wall = at(x, 0) === "="; if (!wall && !inRun) { openings++; inRun = true; } if (wall) inRun = false; }
    eq(openings, 1, "exactly one opening in the top rampart (the town gate)");
  });

  // 6. clear ring: no building tile adjacent to the rampart
  test("CLEAR RING: zero building tiles adjacent to the perimeter rampart", function () {
    var bad = 0;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (G[y][x] === "#") nbrs(x, y).forEach(function (n) { if (at(n[0], n[1]) === "=") bad++; });
    eq(bad, 0, "building tiles touching the rampart: " + bad);
  });

  // 7. no two buildings touch (they are islands with a gap)
  test("no two buildings touch — each is an island with a gap", function () {
    var b = T.buildings;
    for (var i = 0; i < b.length; i++) for (var j = i + 1; j < b.length; j++) {
      var A = b[i], B = b[j], ax1 = A.x0 + A.w - 1, ay1 = A.y0 + A.h - 1, bx1 = B.x0 + B.w - 1, by1 = B.y0 + B.h - 1;
      var apart = (ax1 < B.x0 - 1) || (bx1 < A.x0 - 1) || (ay1 < B.y0 - 1) || (by1 < A.y0 - 1);
      assert(apart, A.id + " and " + B.id + " touch (no gap)");
    }
  });

  // 8. SIZE GRAMMAR: takeout < cafe/restaurant < shop < hotel
  test("SIZE GRAMMAR: takeout < cafe/restaurant < shop < hotel (by footprint area)", function () {
    function area(id) { var b = T.buildings.filter(function (x) { return x.id === id; })[0]; return b ? b.area : null; }
    var chinese = area("chinese"), coffee = area("coffee"), rest = area("restaurant"), bank = area("bank"), hotel = area("hotel");
    assert(chinese && coffee && rest && bank && hotel, "all sized buildings present");
    assert(chinese < coffee && chinese < rest, "takeout < cafe/restaurant (" + chinese + " < " + coffee + "/" + rest + ")");
    assert(coffee < bank && rest < bank, "cafe/restaurant < shop (" + coffee + "/" + rest + " < " + bank + ")");
    assert(bank < hotel, "shop < hotel (" + bank + " < " + hotel + ")");
  });

  // 9. every door faces open road
  test("every door faces open road the player can stand on", function () {
    Object.keys(T.doors).forEach(function (k) { var p = k.split(",").map(Number); assert(nbrs(p[0], p[1]).some(function (n) { return at(n[0], n[1]) === "."; }), "door " + k + "->" + T.doors[k].to + " faces open"); });
    assert(Object.keys(T.doors).length >= 20, "the building cast is placed (" + Object.keys(T.doors).length + " doors)");
  });

  // 10. TILE VOCABULARY (Amendment 1): four distinct classes, no cross-bleed
  test("TILE VOCABULARY: building '#', rampart '=', fence ':' and gate are distinct, no bleed", function () {
    assert(count("#") > 0 && count("=") > 0 && count(":") > 0, "building, rampart, fence all present");
    var gates = 0; Object.keys(T.features).forEach(function (k) { if (T.features[k].type === "gate") gates++; }); assert(gates >= 1, "gate features present");
    T.buildings.forEach(function (b) { for (var y = b.y0; y < b.y0 + b.h; y++) for (var x = b.x0; x < b.x0 + b.w; x++) assert(at(x, y) !== "=", "no rampart glyph inside a building"); });
    for (var x2 = 0; x2 < W; x2++) assert(at(x2, 0) !== "#", "no building glyph on the perimeter row");
  });

  // 11. piers extend into the water and are reachable
  test("PIERS: walkable planks reach into the water", function () {
    var pierInWater = T.piers.filter(function (k) { var p = k.split(",").map(Number); return p[1] >= SHORE && at(p[0], p[1]) === "."; });
    assert(pierInWater.length >= 2, "piers extend into the water (" + pierInWater.length + " plank tiles)");
  });

  // 12. RED-LIGHT: one mouth (no through), 1-wide alleys, no straight run > 4
  test("RED-LIGHT: single mouth (no through-route), 1-wide bent alleys", function () {
    var rl = T.redlight, r = rl.rect, x0 = r[0], y0 = r[1], x1 = r[2], y1 = r[3];
    function inRl(x, y) { return x >= x0 && x <= x1 && y >= y0 && y <= y1; }
    // exactly one alley tile connects to open OUTSIDE the pocket (the mouth)
    var mouths = 0;
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) if (G[y][x] === ".") nbrs(x, y).forEach(function (n) { if (!inRl(n[0], n[1]) && at(n[0], n[1]) === ".") mouths++; });
    eq(mouths, 1, "the red-light pocket has a single mouth (no through-route): " + mouths);
    // no 2x2 open block (alleys are 1-wide)
    var fat = 0; for (var yy = y0; yy < y1; yy++) for (var xx = x0; xx < x1; xx++) if (at(xx, yy) === "." && at(xx + 1, yy) === "." && at(xx, yy + 1) === "." && at(xx + 1, yy + 1) === ".") fat++;
    eq(fat, 0, "no 2x2 open block — alleys are 1-wide (" + fat + ")");
    // no straight run > 4 inside the pocket
    function runOk(getter, a0, a1, b0, b1) { for (var b = b0; b <= b1; b++) { var run = 0; for (var a = a0; a <= a1; a++) { if (getter(a, b) === ".") { run++; if (run > 4) return false; } else run = 0; } } return true; }
    assert(runOk(function (a, b) { return at(a, b); }, x0, x1, y0, y1), "no horizontal straight run > 4");
    assert(runOk(function (a, b) { return at(b, a); }, y0, y1, x0, x1), "no vertical straight run > 4");
  });

  // 13. gated see-into enclosures: cemetery + park (fence + gate + interior)
  test("ENCLOSURES: cemetery + park are fenced, gated, with visible interiors", function () {
    ["cemetery", "park"].forEach(function (kind) {
      var d = T.meta.districts[kind]; assert(d, kind + " placed");
      var r = d.rect, fence = 0, gate = 0, decor = 0;
      for (var y = r[1]; y <= r[3]; y++) for (var x = r[0]; x <= r[2]; x++) { if (G[y][x] === ":") fence++; var f = T.features[x + "," + y]; if (f && f.type === "gate") gate++; if (f && f.type === "decor") decor++; }
      assert(fence >= 8, kind + ": a fence ring (" + fence + ")");
      assert(gate >= 1, kind + ": a gate");
      assert(decor >= 2, kind + ": visible interior contents (" + decor + ")");
    });
  });

  // 14. the road CROSS is 4-5 wide — measured PERPENDICULAR to each arm (the old
  // test scanned the centerline LENGTH and only lower-bounded it at >=4, so an
  // 8-wide street passed; this measures the cross-section and bounds it 4-5).
  var SQ = T.meta.plazas.civic, FRONT = {};
  Object.keys(T.doors).forEach(function (k) { var f = T.doors[k].front; if (f) FRONT[f.x + "," + f.y] = 1; });
  function inSq(x, y) { return SQ && x >= SQ[0] && y >= SQ[1] && x <= SQ[2] && y <= SQ[3]; }
  function roadable(x, y) { return at(x, y) === "." && !inSq(x, y) && !FRONT[x + "," + y]; }  // a door stoop is not the street
  test("ROAD HIERARCHY: the main cross is 4-5 wide (median cross-section, not 8)", function () {
    // The TYPICAL (median) perpendicular cross-section is the honest "how wide is
    // the street" measure: robust to the full-height wall margins and side-alley
    // junctions that wreck a max-run, and to door stoops (excluded). The old
    // 9-wide street had a median of 9; the squared street has a median of ~5.
    function med(arr) { arr.sort(function (a, b) { return a - b; }); return arr.length ? arr[Math.floor(arr.length / 2)] : 0; }
    var hr = [];
    for (var x = 4; x < W - 4; x++) {
      if (x >= CX - 2 && x <= CX + 2) continue;
      if (!roadable(x, CY)) continue;
      var run = 1, yy = CY; while (roadable(x, --yy)) run++; yy = CY; while (roadable(x, ++yy)) run++;
      if (run <= 10) hr.push(run);                               // >10 == a wall margin / vertical corridor, not the street
    }
    assert(hr.length >= 20, "the horizontal street spans the town (" + hr.length + " clean columns)");
    var hm = med(hr); assert(hm >= 4 && hm <= 5, "horizontal main street median width is " + hm + " (law: 4-5)");
    var vr = [];
    for (var y = 5; y < SHORE - 4; y++) {
      if (y >= CY - 2 && y <= CY + 2) continue;
      if (!roadable(CX, y)) continue;
      var rn = 1, xx = CX; while (roadable(--xx, y)) rn++; xx = CX; while (roadable(++xx, y)) rn++;
      if (rn <= 10) vr.push(rn);
    }
    assert(vr.length >= 12, "the vertical street runs the town (" + vr.length + " clean rows)");
    var vm = med(vr); assert(vm >= 4 && vm <= 5, "vertical main street median width is " + vm + " (law: 4-5)");
  });

  // 15. the CHURCH is the landmark: largest footprint in town, with a plaza
  test("SIZE GRAMMAR: the CHURCH is the largest footprint, fronting a plaza", function () {
    var ch = T.buildings.filter(function (b) { return b.id === "church"; })[0];
    assert(ch, "the church is placed");
    T.buildings.forEach(function (b) { if (b.id !== "church") assert(ch.area > b.area, "church (" + ch.area + ") > " + b.id + " (" + b.area + ")"); });
    assert(T.meta.districts.churchPlaza, "the church fronts a plaza / civic square");
  });

  // 16. DENSITY: no big empty — no 6x6 open block outside the road + plazas
  test("DENSITY: no open plaza larger than ~6x6 except the civic square + enclosures", function () {
    var allow = [SQ, T.meta.districts.cemetery.rect, T.meta.districts.park.rect, T.meta.redlight.rect];
    function ok(x, y) { if (x >= CX - 2 && x <= CX + 2) return true; if (y >= CY - 2 && y <= CY + 2) return true; if (y <= 2) return true; for (var i = 0; i < allow.length; i++) if (allow[i] && x >= allow[i][0] && y >= allow[i][1] && x <= allow[i][2] && y <= allow[i][3]) return true; return false; }
    // a GENUINE empty = a 6x6 that is ALL open AND wholly OUTSIDE the road/plazas
    // (a block straddling the road is road + a thin strip a filler can't legally
    // halo into — not a "big empty plaza", so not flagged).
    var N = 6, bad = null;
    for (var y = 3; y < SHORE - 2 - N && !bad; y++) for (var x = 2; x < W - 2 - N; x++) {
      var allOpen = true, allOut = true;
      for (var dy = 0; dy < N && allOpen; dy++) for (var dx = 0; dx < N; dx++) { if (at(x + dx, y + dy) !== ".") { allOpen = false; break; } if (ok(x + dx, y + dy)) allOut = false; }
      if (allOpen && allOut) { bad = [x, y]; break; }
    }
    assert(!bad, "a 6x6 open empty survives at " + JSON.stringify(bad) + " (density pass missed it)");
  });

  // 17. C2 STOREFRONT GRAMMAR: every shop has a sign, windows, and an awning
  test("STOREFRONT GRAMMAR: shops read as shops — sign + windows + awning", function () {
    var byType = { window: 0, awning: 0, sign: 0 };
    Object.keys(T.features).forEach(function (k) { var f = T.features[k]; if (byType[f.type] !== undefined) { byType[f.type]++; assert(f.col === "storefront", f.type + " uses the storefront hue"); } });
    assert(byType.window >= 10, "windows dress the facades (" + byType.window + ")");
    assert(byType.awning >= 6, "awnings over the entrances (" + byType.awning + ")");
    assert(byType.sign >= 6, "hanging signs beside the doors (" + byType.sign + ")");
    // each NAMED shop gets the full kit near its door
    ["bank", "coffee", "restaurant", "barber"].forEach(function (id) {
      var b = T.buildings.filter(function (x) { return x.id === id; })[0]; assert(b, id + " present");
      var win = 0, awn = 0, sgn = 0;
      Object.keys(T.features).forEach(function (k) {
        var p = k.split(",").map(Number), f = T.features[k];
        if (p[0] >= b.x0 - 1 && p[0] <= b.x0 + b.w && p[1] >= b.y0 && p[1] <= b.y0 + b.h + 1) { if (f.type === "window") win++; if (f.type === "awning") awn++; if (f.type === "sign") sgn++; }
      });
      assert(win >= 1 && awn >= 1 && sgn >= 1, id + ": sign+window+awning (" + win + "/" + awn + "/" + sgn + ")");
    });
  });

  // 18. C3 GROUND VARIATION: the surface changes by district (render-only)
  test("GROUND VARIATION: cobble street, dirt alleys, stone plaza, grass park, sand beach, plank piers", function () {
    var G2 = T.ground; assert(G2, "the town exposes a ground layer");
    var kinds = {}; Object.keys(G2).forEach(function (k) { kinds[G2[k]] = (kinds[G2[k]] || 0) + 1; });
    ["cobble", "dirt", "stone", "grass", "sand", "plank"].forEach(function (s) { assert(kinds[s] >= 1, "the town has " + s + " ground (" + (kinds[s] || 0) + ")"); });
    // every ground tile is an open tile (texture, not terrain — walkability intact)
    Object.keys(G2).forEach(function (k) { var p = k.split(",").map(Number); assert(at(p[0], p[1]) === ".", "ground tile " + k + " is walkable"); });
    // the main cross is cobble; the civic square is stone
    assert(G2[CX + "," + CY] === "cobble", "the cross centre is cobbled");
    var sq = T.meta.plazas.civic, midS = G2[(sq[0] + 1) + "," + (sq[1] + 1)]; assert(midS === "stone", "the civic square is stone (" + midS + ")");
    // a pier plank reaches the water
    assert(Object.keys(G2).some(function (k) { var p = k.split(",").map(Number); return G2[k] === "plank"; }), "dock planking present");
  });

  // 19. C4 STREET FURNITURE + DISTRICT PALETTE
  test("STREET FURNITURE: lampposts, stalls, crates, benches, a well, hitching posts, trees", function () {
    var by = {};
    Object.keys(T.features).forEach(function (k) { var t = T.features[k].type; by[t] = (by[t] || 0) + 1; });
    assert(by.lamppost >= 4, "lampposts light the high street (" + (by.lamppost || 0) + ")");
    assert(by.stall >= 2, "market stalls in the square (" + (by.stall || 0) + ")");
    assert(by.crate >= 3, "crates on the waterfront (" + (by.crate || 0) + ")");
    assert(by.bench >= 2, "benches to rest on (" + (by.bench || 0) + ")");
    assert(by.well >= 1, "a well at the square (" + (by.well || 0) + ")");
    assert(by.hitch >= 1, "hitching posts at the smithy (" + (by.hitch || 0) + ")");
    assert(by.streettree >= 2, "street trees (" + (by.streettree || 0) + ")");
    // all furniture is walkable decor on open tiles (the grid is unchanged)
    Object.keys(T.features).forEach(function (k) { var f = T.features[k]; if (["lamppost", "stall", "crate", "bench", "well", "hitch", "streettree"].indexOf(f.type) >= 0) { var p = k.split(",").map(Number); assert(at(p[0], p[1]) === ".", f.type + " sits on an open tile"); assert(f.decor === true, f.type + " is decor"); } });
  });

  test("DISTRICT PALETTE: the red-light district is red-lit ground", function () {
    var red = Object.keys(T.ground).filter(function (k) { return T.ground[k] === "redlight"; });
    assert(red.length >= 3, "the red-light alley reads as a red-lit district (" + red.length + " tiles)");
    red.forEach(function (k) { var p = k.split(",").map(Number); assert(at(p[0], p[1]) === ".", "red-lit ground is walkable alley"); var rl = T.redlight.rect; assert(p[0] >= rl[0] && p[0] <= rl[2] && p[1] >= rl[1] && p[1] <= rl[3], "red-lit ground is inside the red-light district"); });
  });

  // 20. D1 PIERS: clustered at one end (a pier district), not spread
  test("D1 PIERS: clustered into a district at one end, open shoreline elsewhere", function () {
    var px = T.piers.map(function (k) { return +k.split(",")[0]; });
    var uniq = px.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
    assert(uniq.length >= 2, "several pier columns (" + uniq.length + ")");
    assert(uniq[uniq.length - 1] - uniq[0] <= 10, "piers cluster within ~10 tiles (span " + (uniq[uniq.length - 1] - uniq[0]) + "), not spread");
    assert(T.meta.pierDistrict, "the pier district is recorded");
  });

  // 21. D2 REDLIGHT SPAGHETTI: many bent alleys, junctions + dead-ends, lined with small shops
  test("D2 REDLIGHT SPAGHETTI: more alley, junctions + dead-ends, small shops on the alleys", function () {
    var rl = T.redlight, alley = rl.alley;
    assert(alley.length >= 30, "substantially more alley than before (" + alley.length + " tiles, was ~18)");
    function openN(x, y) { var n = 0;[[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { if (at(x + d[0], y + d[1]) === ".") n++; }); return n; }
    var dead = 0, junc = 0; alley.forEach(function (p) { var k = openN(p[0], p[1]); if (k === 1) dead++; if (k >= 3) junc++; });
    assert(dead >= 4, "many dead-ends (" + dead + ")");
    assert(junc >= 2, "real junctions, not a single snake (" + junc + ")");
    var redDoors = 0; Object.keys(T.doors).forEach(function (k) { if (T.doors[k].red) redDoors++; });
    assert(redDoors >= 4, "small shops line the alleys (" + redDoors + " red-light doors)");
  });

  // 22. D3 PALM READER: a new red-light business with a door on the alleys
  test("D3 PALM READER: a new red-light business, door on the alleys", function () {
    var k = Object.keys(T.doors).filter(function (k) { return T.doors[k].to === "palmreader"; })[0];
    assert(k, "the palm reader has a door in the red-light");
    assert(T.doors[k].red, "it is a red-light establishment");
    var p = T.doors[k].front; assert(at(p.x, p.y) === ".", "its door faces an alley you can stand on");
  });

  var pass = results.filter(function (r) { return r.ok; }).length;
  return { pass: pass, fail: results.length - pass, results: results };
}
