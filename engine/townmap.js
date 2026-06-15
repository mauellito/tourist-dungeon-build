// Tourist Dungeon — TD_TOWNMAP: the town as a FIXED AUTHORED MAP with RANDOMISED
// TENANTS. The LAYOUT is fixed (same crescent, river, bridges, districts, streets,
// and dungeon entrance every run); only the ASSIGNMENT of businesses to building
// SLOTS is dealt per seed, within district + size constraints. Landmarks (church,
// dungeon mouth, graveyard, gate, bridges, piers, kiosk) are FIXED, never shuffled.
//
// NOTE: MAP below is a PLACEHOLDER — a frozen snapshot of one gated TD_TOWNGEN
// output, standing in until the operator's hand-drawn city is pasted in. To install
// the real city, REPLACE MAP.rows / MAP.districts / MAP.redlight with the operator's
// map in this same one-char-per-tag glyph format (legend = GLYPH below). No code
// changes needed; the tenant pass + the live wire-in are format-stable.
// Classic script: assigns global TD_TOWNMAP.
"use strict";

var TD_TOWNMAP = (function () {
  var MAP = {
  "w": 80,
  "h": 56,
  "rows": [
  "........................~~~....G................................................",
  "........................~~~.......ffffffffffn........................p..........",
  "..s#..##.##.##.........~~~#s##...Lf++++++++f..s#.##..###..#.#...s#.p#.#.##..##..",
  "...#..##.##..#.......##~~~####....f++++++++f..##.##..###...##...##..###.##..##..",
  "..##..##.##n##.......##~~~####....f++++++++f..##.##..###..###...##..#.#.##..##..",
  ".................######~~~L.......f++++++++fn........................L..........",
  "......L..........######~~~v..n....f++++++++f...###.###L###.......##..##.##.##...",
  "...##.###.##...........~~~#.......f++++++++f...###.###n###.......##..##.##.##...",
  "...##.###.##.....######~~~####....f++++++++f........n............##..##.##.##...",
  ".................######~~~####....f++++++++f..###..##.###..##...................",
  "..v..............##....~~~####....f++++++++f..###..##.###..##...................",
  "...##.##.###.....##....~~~####....f++++++++f..###..##.###..##...................",
  "...##.##.###.....##.....~~~.......f++++++++f....................................",
  "........................~~~.......ffff+fffff....................................",
  "........................~~~....bb...............................s##..##.##.###..",
  "........................~~~....bb...............................##...##.##..##..",
  "..s#.###.#.#..##.....s##~~~###bb.##########........v............###..##.##.###..",
  "..##..##L###..##.....##~~~####bb.##########...\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"...................",
  "..##.###.###..##.....##~~~####bC.##########...\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"............n......",
  ".......................~~~...,bbv,............\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"...##..##L.##.##...",
  "...##v###..##..##....###~~~##vbbL,#########...\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"...##..##..##.##...",
  "...##.###..##..##....####~~~#,b>,,#########...\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"...................",
  ".....................#####~~~,~~,k#########...\"\"\"\"\"\"\"\"\"\"\"\"\"\"\".............n.....",
  "......n...................~~~,~~,,............\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"....##..###.##.....",
  ".....................#####~~~#~~###########...\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"....##..###.##.....",
  "..s##.#.#..##.##.....#####~~~#~~###########...\"\"\"\"L\"\"\"\"\"\"\"\"\"\"....##..###.##.....",
  "..###.###..##.##.....######~~~.~~##########......n..............................",
  "...........................~~~..................................................",
  "......p.L..................~~~...............s####.######.......................",
  "...###..###.###............~~~...............#:::n::::::#..s#..###.##.#.#..###..",
  "...###..###.#.#............~~~...............#::::::::::#..##..###.##.###..###..",
  "......v..............s#.##.~~~.###..###..##..#:::L::::::#..##..###.##.###..###..",
  "...##.##.##..###.....##.##.#~~~###..#.#..##..#:######:::#.........v.............",
  "...##.##.##..###............~~~..............#:######n::#...##..##.L###.###.....",
  "............................~~~..............#:######:::#...##..#...###.###.....",
  "......................##.##.~~~#..###.##.....#::::::::::#...##..##..###.###.....",
  "......................##.##..~~~..###.##.....############...............n.......",
  "..s##.###..##..###..........~~~p................................................",
  "..###.#.#..##..###..........~~~............................###.###.###.###..##..",
  ".....................##.##..~~~L#..###.##.....s#.###.###...###.###.###.###..##..",
  "........p............##.##.~~~.##..###.##.....##.#.#.###........................",
  "...#.#..###..###.........p~~~....................v..............................",
  "...###..###..###..........~~~....................L......................n.......",
  "......v.L.............##.#~~~##.##.###.###.....##.##..##....s.#..##.##.###.##...",
  "...##.###.##..###.....##.~~~.##.##.###.###.....##.##..p#....###..##.##.#.#.##...",
  "...##.###.##..###.....##.~~~.##.##.###.###.....##.##..##............L...........",
  "...##.###.##..###.......~~~.....................................................",
  ".......................~~~......................................................",
  ".......................bbb......................................................",
  "....~...=.~..~~~....~~.~~~..~.~..~~......~..=~.........~.......~...~.~..~~..~...",
  ".~..~~~.=~~~~~~~....~~~.~...~~~~.~~~~~~~.~.~=~~~.~~.~~~~~.~~...~.~.~~~~n~~~~~~~.",
  "~~~~~~~~=~~~~~~~~~~~~~~~~~~=\"\"\"\"\"~~~~~~~~~~~=~~~~~~~~~~~~~~~=~~~~~~~~~~~~~~~~~~~",
  "~~~~~~~~~~~~~~~~~~~~~~~~~~~=\"\"\"\"\"~~~~~~~~~~~~~~~~~~~~~~~~~~~=~~~~~~~~~~~~~~~~~~~",
  "~~~~~~~~~~~~~~~~~~~~~~~~~~~=\"\"\"\"\"~~~~~~~~~~~~~~~~~~~~~~~~~~~=~~~~~~~~~~~~~~~~~~~",
  "~~~~~~~~~~~~~~~~~~~~~~~~~~~=~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
  "~~~~~~~~~~~~~~~~~~~~~~~~~~~=~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~"
  ],
  "districts": [
  {
  "role": "civic",
  "streetLogic": "planned",
  "x0": 20,
  "y0": 15,
  "x1": 43,
  "y1": 28
  },
  {
  "role": "park",
  "streetLogic": "grown",
  "x0": 45,
  "y0": 16,
  "x1": 61,
  "y1": 26
  },
  {
  "role": "redlight",
  "streetLogic": "grown",
  "x0": 45,
  "y0": 28,
  "x1": 56,
  "y1": 36
  },
  {
  "role": "graveyard",
  "streetLogic": "grown",
  "x0": 34,
  "y0": 1,
  "x1": 43,
  "y1": 13
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 20,
  "y0": 30,
  "x1": 43,
  "y1": 48
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 45,
  "y0": 38,
  "x1": 56,
  "y1": 48
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 45,
  "y0": 1,
  "x1": 61,
  "y1": 14
  },
  {
  "role": "warehouse",
  "streetLogic": "grown",
  "x0": 16,
  "y0": 1,
  "x1": 32,
  "y1": 13
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 63,
  "y0": 13,
  "x1": 78,
  "y1": 26
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 1,
  "y0": 24,
  "x1": 18,
  "y1": 34
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 1,
  "y0": 15,
  "x1": 18,
  "y1": 22
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 58,
  "y0": 28,
  "x1": 78,
  "y1": 40
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 63,
  "y0": 1,
  "x1": 78,
  "y1": 11
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 1,
  "y0": 36,
  "x1": 18,
  "y1": 48
  },
  {
  "role": "market",
  "streetLogic": "grown",
  "x0": 58,
  "y0": 42,
  "x1": 78,
  "y1": 48
  },
  {
  "role": "housing",
  "streetLogic": "grown",
  "x0": 1,
  "y0": 1,
  "x1": 14,
  "y1": 13
  }
  ],
  "redlight": {
  "x0": 45,
  "y0": 28,
  "x1": 56,
  "y1": 36,
  "entrance": [
  50,
  28
  ]
  }
  };

  var GLYPH = { water: "~", pier: "=", bridge: "b", street: ".", plaza: ",", park: "\"", graveyard: "+", fence: "f", building: "#", gate: "G", church: "C", dungeon: ">", alley: ":", landmark: "L", townsecret: "s", notice: "n", vendor: "v", npc: "p", kiosk: "k" };
  var FROM = {}; for (var g in GLYPH) FROM[GLYPH[g]] = g;   // '#' -> building (wall reads the same)

  // ===== TENANT POOL (data; dealt to building SLOTS per seed) =====
  // cat -> colour category (storefront/civic/lodging/faith/vice, via TD_UI.buildingColor).
  // size: smallest slot class it needs. where: eligible district roles. unique: <=1 per town.
  var TENANTS = [
    { id: "coffee",     label: "a coffee shop",          glyph: "e", cat: "commerce", size: "small",  where: ["housing", "market", "civic"], weight: 6 },
    { id: "bakery",     label: "a bakery",               glyph: "q", cat: "commerce", size: "small",  where: ["housing", "market", "civic"], weight: 5 },
    { id: "grocer",     label: "a grocer",               glyph: "g", cat: "commerce", size: "small",  where: ["housing", "market"], weight: 5 },
    { id: "barber",     label: "a barber",               glyph: "y", cat: "commerce", size: "small",  where: ["housing", "market"], weight: 4 },
    { id: "tattoo",     label: "a tattoo parlour",       glyph: "z", cat: "commerce", size: "small",  where: ["market", "civic"], weight: 3 },
    { id: "tailor",     label: "a tailor",               glyph: "u", cat: "commerce", size: "small",  where: ["housing", "market"], weight: 3 },
    { id: "cobbler",    label: "a cobbler",              glyph: "j", cat: "commerce", size: "small",  where: ["housing", "market"], weight: 3 },
    { id: "apothecary", label: "an apothecary",          glyph: "a", cat: "commerce", size: "small",  where: ["market", "civic"], weight: 3 },
    { id: "store",      label: "a general store",        glyph: "o", cat: "commerce", size: "small",  where: ["housing", "market", "civic"], weight: 8 },
    { id: "spa",        label: "a spa",                  glyph: "m", cat: "commerce", size: "medium", where: ["civic", "market", "housing"], weight: 3 },
    { id: "tavern",     label: "a tavern",               glyph: "Y", cat: "commerce", size: "medium", where: ["market", "housing", "civic"], weight: 4 },
    { id: "bank",       label: "the bank",               glyph: "B", cat: "civic",    size: "large",  where: ["civic", "market"], unique: true, weight: 2 },
    { id: "hotel",      label: "the Gilded Kraken Hotel", glyph: "H", cat: "lodging", size: "large",  where: ["civic", "market", "housing"], unique: true, weight: 2 },
    { id: "warehouse",  label: "a warehouse",            glyph: "W", cat: "commerce", size: "large",  where: ["warehouse"], weight: 6 },
    { id: "chandlery",  label: "a ship chandlery",       glyph: "d", cat: "commerce", size: "medium", where: ["warehouse"], weight: 4 },
    { id: "customs",    label: "the customs house",      glyph: "X", cat: "civic",    size: "medium", where: ["warehouse"], unique: true, weight: 2 },
    { id: "redlit",     label: "a members' club",        glyph: "%", cat: "vice",     size: "medium", where: ["redlight"], weight: 3 },
    { id: "redshop",    label: "a red-lit parlour",      glyph: "&", cat: "vice",     size: "small",  where: ["redlight"], weight: 4 },
    { id: "palmreader", label: "a palm-reader",          glyph: "@", cat: "vice",     size: "small",  where: ["redlight"], weight: 3 },
    { id: "bodega",     label: "a bodega",               glyph: "$", cat: "vice",     size: "small",  where: ["redlight", "market"], weight: 3 }
  ];
  var CAT_COL = { commerce: "storefront", civic: "civic", lodging: "lodging", faith: "faith", vice: "vice" };
  var SIZE_RANK = { small: 0, medium: 1, large: 2 };
  function slotClass(area) { return area >= 30 ? "large" : (area >= 14 ? "medium" : "small"); }

  // ---- parse the authored rows into a tag grid + detected building SLOTS ----
  function parse() {
    var w = MAP.w, h = MAP.h, tag = [];
    for (var y = 0; y < h; y++) { var row = MAP.rows[y] || "", r = []; for (var x = 0; x < w; x++) r.push(FROM[row[x]] || "street"); tag.push(r); }
    function inb(x, y) { return x >= 0 && y >= 0 && x < w && y < h; }
    function walk(t) { return t === "street" || t === "plaza" || t === "alley" || t === "pier" || t === "bridge"; }
    function roleAt(x, y) { var best = null, ba = 1e9; for (var i = 0; i < MAP.districts.length; i++) { var D = MAP.districts[i]; if (x >= D.x0 && x <= D.x1 && y >= D.y0 && y <= D.y1) { var a = (D.x1 - D.x0) * (D.y1 - D.y0); if (a < ba) { ba = a; best = D.role; } } } return best; }
    var D4 = [[0, -1], [0, 1], [-1, 0], [1, 0]], seen = {}, slots = [];
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (tag[y][x] !== "building" || seen[x + "," + y]) continue;
      var stack = [[x, y]], cells = [], front = null; seen[x + "," + y] = 1;
      while (stack.length) {
        var c = stack.pop(); cells.push(c);
        for (var i = 0; i < 4; i++) {
          var nx = c[0] + D4[i][0], ny = c[1] + D4[i][1]; if (!inb(nx, ny)) continue;
          if (tag[ny][nx] === "building" && !seen[nx + "," + ny]) { seen[nx + "," + ny] = 1; stack.push([nx, ny]); }
          else if (!front && walk(tag[ny][nx])) front = { x: c[0], y: c[1] };
        }
      }
      if (!front) continue;                         // a landlocked block with no street face: not a slot
      var sx = 0, sy = 0; cells.forEach(function (cc) { sx += cc[0]; sy += cc[1]; });
      var role = roleAt(Math.round(sx / cells.length), Math.round(sy / cells.length)) || roleAt(front.x, front.y);
      slots.push({ cells: cells, area: cells.length, front: front, role: role, cls: slotClass(cells.length) });
    }
    return { w: w, h: h, tag: tag, slots: slots };
  }

  // a small deterministic LCG so the deal is seed-stable without coupling to TD_RNG
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function shuffle(arr, rnd) { for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; }

  // ---- generate(seed): FIXED bones + seeded TENANT assignment ----
  function generate(seed) {
    var P = parse(), rnd = rng((seed >>> 0) ^ 0x7d717a00);
    // stable slot identity order (every seed indexes the same slot) — bones never move
    var slots = P.slots.filter(function (s) { return s.role; }).sort(function (a, b) { return (a.front.y - b.front.y) || (a.front.x - b.front.x); });
    var assigned = new Array(slots.length), usedUnique = {};
    // 1) ANCHORS: each unique (bank, hotel, customs) claims the LARGEST free eligible slot,
    //    so the town always HAS them — which big building they occupy turns over per seed.
    shuffle(TENANTS.filter(function (t) { return t.unique; }), rnd).forEach(function (t) {
      var bestI = -1, bestA = -1;
      for (var i = 0; i < slots.length; i++) { if (assigned[i]) continue; var s = slots[i]; if (t.where.indexOf(s.role) < 0) continue; if (s.area > bestA) { bestA = s.area; bestI = i; } }
      if (bestI >= 0) { assigned[bestI] = t; usedUnique[t.id] = 1; }
    });
    // 2) deal the remaining slots from the weighted general pool (shuffled for fair spread)
    var rest = []; for (var i = 0; i < slots.length; i++) if (!assigned[i]) rest.push(i);
    shuffle(rest, rnd).forEach(function (si) {
      var slot = slots[si];
      var pool = TENANTS.filter(function (t) { return !t.unique && t.where.indexOf(slot.role) >= 0 && SIZE_RANK[slot.cls] >= SIZE_RANK[t.size]; });
      if (!pool.length) pool = TENANTS.filter(function (t) { return !t.unique && t.where.indexOf(slot.role) >= 0; });
      if (!pool.length) return;
      var tot = 0; pool.forEach(function (t) { tot += t.weight || 1; });
      var r = rnd() * tot, pick = pool[0];
      for (var k = 0; k < pool.length; k++) { r -= pool[k].weight || 1; if (r <= 0) { pick = pool[k]; break; } }
      assigned[si] = pick;
    });
    // 3) emit fronts in stable slot order
    var fronts = [];
    for (var i = 0; i < slots.length; i++) {
      var pick = assigned[i]; if (!pick) continue; var slot = slots[i];
      fronts.push({ x: slot.front.x, y: slot.front.y, business: pick.id, label: pick.label, cat: pick.cat,
        col: CAT_COL[pick.cat] || "storefront", glyph: pick.glyph, role: slot.role,
        text: "The front of " + pick.label + ". (Going inside arrives with the interiors pass.)" });
    }
    var grid = []; for (var y = 0; y < P.h; y++) { var s = ""; for (var x = 0; x < P.w; x++) s += (GLYPH[P.tag[y][x]] || "?"); grid.push(s); }
    var meta = { districts: MAP.districts, redlight: MAP.redlight, source: "townmap", pois: { tenants: fronts.length } };
    return { w: P.w, h: P.h, tag: P.tag, grid: grid, meta: meta, fronts: fronts, seed: seed, source: "townmap" };
  }

  return { generate: generate, parse: parse, MAP: MAP, TENANTS: TENANTS, GLYPH: GLYPH };
})();
if (typeof module !== "undefined" && module.exports) { module.exports = TD_TOWNMAP; }
