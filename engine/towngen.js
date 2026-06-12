// Tourist Dungeon — TD_TOWN: the figure-ground town generator (Town Composition
// Law v1 + Amendment 1 + Round C density/dressing). The town IS open space
// (road = ground); buildings are ISLANDS placed on it. Reservation pass:
// structural + special regions are reserved first, then buildings pack into the
// remaining open space, so the layout is collision-free by construction. A
// density pass then squares the main cross to 4-5 wide and breaks up every big
// empty with row-homes / sheds / storefront fillers (Round C1). Four-class tile
// vocabulary: building '#', perimeter rampart '=', fence ':', gate (glyph '∩').
// Classic script: assigns TD_TOWN. Requires TD_RNG.
"use strict";

var TD_TOWN = (function () {
  var W = 72, H = 44, WATER_Y = 38, SHORE = 37, CX = 35, CY = 20;
  // the main cross: a 5-wide open lane each way (Round C1: was ~9 wide).
  var RDV0 = CX - 2, RDV1 = CX + 2;   // vertical road open core cols 33..37
  var RDH0 = CY - 2, RDH1 = CY + 2;   // horizontal road open core rows 18..22
  function key(x, y) { return x + "," + y; }
  function inb(x, y) { return x >= 0 && x < W && y >= 0 && y < H; }
  function rectHas(r, x, y) { return r && x >= r[0] && y >= r[1] && x <= r[2] && y <= r[3]; }

  // SIZE grammar (w x h), strictly increasing footprint area:
  // shed(4) < takeout(6) < rowhome(9) < cafe(12)/eatery(15) < shop(20) <
  // hotel(40) < CHURCH(54, the landmark).
  var SIZE = { shed: [2, 2], takeout: [3, 2], rowhome: [3, 3], cafe: [4, 3], eatery: [5, 3], shop: [5, 4], filler: [4, 3], hotel: [8, 5], church: [9, 6] };
  // [id, glyph, sizeClass, to?] — id matches an INTERIORS key; to defaults to id.
  // (church is placed explicitly as a landmark, not via the packer.)
  var CAST = {
    nw: [["hotel", "H", "hotel"], ["bank", "B", "shop"], ["tim", "G", "shop"], ["blacksmith", "L", "shop"], ["spa", "P", "shop"], ["saloon", "S", "shop"], ["locked", "h", "filler"], ["locked", "h", "shop"], ["locked", "h", "filler"]],
    ne: [["agency", "A", "shop"], ["coffee", "O", "cafe"], ["restaurant", "E", "eatery"], ["barber", "R", "shop"], ["tattoo", "Z", "shop"], ["chinese", "N", "takeout"], ["locked", "h", "filler"], ["locked", "h", "shop"], ["locked", "h", "filler"]],
    strip: [["gate", ">", "shop", "DUNGEON"], ["gift1", "1", "shop"], ["gift2", "2", "shop"], ["kiosk", "K", "shop"]],
    wf: [["tavern", "T", "shop"], ["boat", "Y", "shop"], ["motel", "M", "shop"], ["clamshack", "F", "takeout"], ["empty", "w", "shop"]]
  };

  function compose(seed) {
    var R = TD_RNG.make(((seed >>> 0) + 13) || 1);
    var g = [], occ = []; for (var y = 0; y < H; y++) { var r = [], o = []; for (var x = 0; x < W; x++) { r.push("."); o.push(false); } g.push(r); occ.push(o); }
    function box(x0, y0, x1, y1, c) { for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) if (inb(x, y)) g[y][x] = c; }
    function reserve(x0, y0, x1, y1) { for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) if (inb(x, y)) occ[y][x] = true; }
    var doors = {}, features = {}, buildings = [], piers = [], meta = { districts: {}, roads: [], shopRows: [], redlight: null, plazas: {} };

    // --- water + perimeter rampart (N/E/W to shore; south open to water) -------
    box(0, WATER_Y, W - 1, H - 1, "~");
    for (var x = 0; x < W; x++) g[0][x] = "=";
    for (var yy = 0; yy <= SHORE; yy++) { g[yy][0] = "="; g[yy][W - 1] = "="; }
    var GX = 54; for (var i = 0; i < 4; i++) { g[0][GX + i] = "."; features[key(GX + i, 0)] = { type: "gate", glyph: "∩", col: "gate", label: "the town gate" }; }
    var exitTile = { x: GX + 1, y: 1 };

    // --- reservation pass: ring, the 5-wide cross, dock kept building-free -------
    reserve(0, 0, W - 1, 2); reserve(0, 0, 1, SHORE); reserve(W - 2, 0, W - 1, SHORE);   // 2-tile clear ring inside the wall
    reserve(0, SHORE - 2, W - 1, H - 1);                                                  // dock + water band
    reserve(CX - 1, 1, CX + 1, SHORE);                                                    // vertical road core (halos widen it to 5)
    reserve(1, CY - 1, W - 2, CY + 1);                                                    // horizontal road core
    meta.roads.push({ id: "cross-v", width: 5, rect: [RDV0, 1, RDV1, SHORE] });
    meta.roads.push({ id: "cross-h", width: 5, rect: [1, RDH0, W - 2, RDH1] });

    // --- the CIVIC SQUARE + CHURCH: the church is landmark-scale (largest
    // footprint in town) and fronts an open square that doubles as the market
    // square (stalls in C4). The square's south edge abuts the horizontal road,
    // so the plaza is always connected to the street (no orphaned pocket). ------
    var sq = [39, RDH0 - 6, 49, RDH0 - 1];                            // 11x6 open square at the NE cross corner, bottom on the road
    reserve(sq[0], sq[1], sq[2], sq[3]); meta.plazas.civic = sq; meta.districts.marketSquare = { rect: sq };
    var chW = SIZE.church[0], chH = SIZE.church[1], chx = 39, chy = sq[1] - chH;   // church just north of the square
    box(chx, chy, chx + chW - 1, chy + chH - 1, "#"); reserve(chx - 1, chy - 1, chx + chW, chy + chH);
    var chdx = chx + (chW >> 1), chdy = chy + chH - 1;
    doors[key(chdx, chdy)] = { to: "church", glyph: "+", letter: "C", label: "the Church", front: { x: chdx, y: chdy + 1 }, building: true };
    features[key(chdx, chy + chH - 2)] = { type: "label", glyph: "C", col: "door", label: "the Church" };
    buildings.push({ id: "church", x0: chx, y0: chy, w: chW, h: chH, area: chW * chH, glyph: "C", landmark: true });
    meta.districts.churchPlaza = { rect: sq };

    // --- SW special regions placed + reserved FIRST (so buildings avoid them) ---
    var rl = buildRedlight(g, occ, doors, features); meta.redlight = rl;
    buildEnclosure(g, occ, features, "cemetery", 16, 25, 8, 7, "grave"); meta.districts.cemetery = { rect: [16, 25, 23, 31] };
    buildEnclosure(g, occ, features, "park", 25, 25, 8, 7, "tree"); meta.districts.park = { rect: [25, 25, 32, 31] };

    // --- the building packer (islands with a 1-tile open halo) -----------------
    function fits(x0, y0, w, h) {
      for (var yy = y0 - 1; yy <= y0 + h; yy++) for (var xx = x0 - 1; xx <= x0 + w; xx++) { if (!inb(xx, yy)) return false; if (g[yy][xx] !== ".") return false; if (occ[yy][xx]) return false; }
      return true;
    }
    function stamp(x0, y0, w, h, to, glyph, name, kind) {
      box(x0, y0, x0 + w - 1, y0 + h - 1, "#");
      var dx = x0 + (w >> 1), dy = y0 + h - 1;
      doors[key(dx, dy)] = { to: to, glyph: /^[A-Za-z0-9]$/.test(glyph) ? "+" : glyph, letter: glyph, label: name || to, front: { x: dx, y: dy + 1 }, building: true, interactive: kind !== "home" };
      var ly = y0 + Math.max(0, h - 2); if (g[ly][dx] === "#" && ly !== dy) features[key(dx, ly)] = { type: "label", glyph: glyph, col: "door", label: name || to };
      buildings.push({ id: to, x0: x0, y0: y0, w: w, h: h, area: w * h, glyph: glyph, kind: kind || "shop" });
      if ((kind || "shop") !== "home" && (kind || "shop") !== "shed") dressShop(x0, y0, w, h, dx, dy, to);
    }
    // C2 STOREFRONT GRAMMAR: every shop reads as a shop at a glance — WINDOW
    // glyphs on the facade flanking the entrance, an AWNING over the door (a
    // walkable stoop), and a hanging SIGN beside it. Decorative-but-meaningful
    // (one palette hue "storefront"; glyphs distinguish), so it honours the
    // Colour Discipline Law (a sign/window/awning all read "place of business").
    function dressShop(x0, y0, w, h, dx, dy, to) {
      [[dx - 1, dy], [dx + 1, dy]].forEach(function (p) {
        if (p[0] >= x0 && p[0] < x0 + w && g[p[1]] && g[p[1]][p[0]] === "#" && !features[key(p[0], p[1])])
          features[key(p[0], p[1])] = { type: "window", glyph: "▫", col: "storefront", label: "a shop window" };
      });
      var ay = dy + 1;
      if (g[ay] && g[ay][dx] === "." && !features[key(dx, ay)])
        features[key(dx, ay)] = { type: "awning", glyph: "▾", col: "storefront", label: "an awning", decor: true };
      [[dx - 1, dy + 1], [dx + 1, dy + 1]].some(function (p) {
        if (g[p[1]] && g[p[1]][p[0]] === "." && !features[key(p[0], p[1])]) { features[key(p[0], p[1])] = { type: "sign", glyph: "♟", col: "storefront", label: "a shop sign", decor: true }; return true; }
        return false;
      });
    }
    function packZone(zx0, zy0, zx1, zy1, list) {
      var cx = zx0, cy = zy0, rowH = 0;
      for (var k = 0; k < list.length; k++) {
        var it = list[k], sz = SIZE[it[2]], w = sz[0], h = sz[1], to = it[3] || it[0], placed = false;
        for (var guard = 0; guard < 400 && !placed; guard++) {
          if (cx + w - 1 > zx1) { cx = zx0; cy += rowH + 2; rowH = 0; }
          if (cy + h - 1 > zy1) break;
          if (fits(cx, cy, w, h)) { stamp(cx, cy, w, h, to, it[1], it[0]); cx += w + 2; rowH = Math.max(rowH, h); placed = true; }
          else cx += 1;
        }
      }
    }
    // zones now pack closer to the 5-wide cross (x: <=CX-3 / >=CX+3; y: <=CY-3 / >=CY+3)
    packZone(3, 3, CX - 3, CY - 3, CAST.nw); meta.districts.main = { rect: [3, 3, CX - 3, CY - 3] };
    packZone(51, 3, W - 4, CY - 3, CAST.ne); meta.districts.market = { rect: [51, 3, W - 4, CY - 3] };
    var rowStart = buildings.length;
    packZone(CX + 3, CY + 3, W - 4, CY + 7, CAST.strip); meta.districts.strip = { rect: [CX + 3, CY + 3, W - 4, CY + 7] };
    meta.shopRows.push({ ids: buildings.slice(rowStart).map(function (b) { return b.id; }) });
    packZone(CX + 3, CY + 8, W - 4, SHORE - 3, CAST.wf); meta.districts.waterfront = { rect: [CX + 3, CY + 8, W - 4, SHORE - 3] };

    // --- piers: walkable planks from the dock into the water -------------------
    [16, 30, 46].forEach(function (px) { for (var py = SHORE; py < WATER_Y + 3; py++) { if (g[py]) { g[py][px] = "."; piers.push(key(px, py)); } } });

    // --- DENSITY PASS (Round C1): square the cross to 4-5, then break every big
    // empty with row-homes / sheds / storefront fillers, so no open plaza is
    // larger than ~6x6 except the church plaza and the market square. ----------
    var keepOpen = [sq, meta.districts.cemetery.rect, meta.districts.park.rect, rl.rect];
    function protectedTile(x, y) {
      if (y <= 2 || x <= 1 || x >= W - 2 || y >= SHORE - 2) return true;     // ring + dock band
      if ((x >= RDV0 && x <= RDV1) || (y >= RDH0 && y <= RDH1)) return true; // the whole 5-wide cross
      if (g[y][x] === "~" || g[y][x] === ":" || g[y][x] === "=") return true;
      for (var i = 0; i < keepOpen.length; i++) if (rectHas(keepOpen[i], x, y)) return true;
      return false;
    }
    var frontSet = {}; for (var dk in doors) { var df = doors[dk].front; if (df) frontSet[key(df.x, df.y)] = true; }
    squareRoad(g, frontSet);                                                 // square the cross to 4-5 (flush facades only)
    breakOpens(g, occ, doors, features, buildings, fits, stamp, protectedTile, R);

    // --- connectivity: the road is ONE component (fill any orphan open pocket) --
    pruneOpen(g, { x: CX, y: CY });

    // --- C4 STREET FURNITURE: lampposts along the high street, a well + market
    // stalls + benches in the square, crates on the waterfront, hitching posts at
    // the smithy, street trees. All DECOR (walkable) and feature-only — the grid
    // is unchanged, so the one-connected-road invariant holds. ----------------
    function furn(x, y, type, glyph, col) { if (g[y] && g[y][x] === "." && !features[key(x, y)] && !doors[key(x, y)]) { features[key(x, y)] = { type: type, glyph: glyph, col: col, label: type, decor: true }; return true; } return false; }
    for (var lx = 6; lx < W - 4; lx += 9) { furn(lx, RDH0, "lamppost", "ï", "fixture"); furn(lx, RDH1, "lamppost", "ï", "fixture"); }   // lit high street
    for (var ly = 7; ly < SHORE - 3; ly += 8) { furn(RDV0, ly, "lamppost", "ï", "fixture"); furn(RDV1, ly, "lamppost", "ï", "fixture"); }
    furn(Math.round((sq[0] + sq[2]) / 2), Math.round((sq[1] + sq[3]) / 2), "well", "⊙", "fixture");                     // the well at the heart of the square
    furn(sq[0] + 1, sq[1] + 1, "stall", "⌂", "storefront"); furn(sq[2] - 1, sq[1] + 1, "stall", "⌂", "storefront"); furn(sq[0] + 3, sq[1] + 1, "stall", "⌂", "storefront");
    furn(sq[0] + 1, sq[3], "bench", "╤", "fixture"); furn(sq[2] - 1, sq[3], "bench", "╤", "fixture");
    var wf = meta.districts.waterfront.rect; for (var ci = 0; ci < 7; ci++) furn(wf[0] + ci * 3, SHORE - 1, "crate", "▣", "fixture");        // crates on the quay
    var pkr = meta.districts.park.rect; furn(pkr[0] + 1, pkr[3], "bench", "╤", "fixture"); furn(pkr[2] - 1, pkr[3], "bench", "╤", "fixture");
    var smith = buildings.filter(function (b) { return b.id === "blacksmith"; })[0];
    if (smith) { furn(smith.x0 - 1, smith.y0 + smith.h - 1, "hitch", "Π", "fixture"); furn(smith.x0 + smith.w, smith.y0 + smith.h - 1, "hitch", "Π", "fixture"); }
    [9, 27, 59, 64].forEach(function (tx) { furn(tx, RDH1, "streettree", "♣", "nature") || furn(tx, RDH0, "streettree", "♣", "nature"); });

    // --- C3 GROUND VARIATION: tag every open tile with a surface (render-only,
    // walkability unchanged) — cobble main street, dirt alleys, stone plaza,
    // grass park, sand beach, dock planking. ---------------------------------
    var ground = {};
    function setG(x, y, t) { if (g[y] && g[y][x] === ".") ground[key(x, y)] = t; }
    for (var gy = 0; gy < H; gy++) for (var gx = 0; gx < W; gx++) if (g[gy][gx] === ".") ground[key(gx, gy)] = "dirt";  // default: dirt alleys/lanes
    for (var cy2 = 1; cy2 < SHORE; cy2++) for (var cx2 = RDV0; cx2 <= RDV1; cx2++) setG(cx2, cy2, "cobble");            // the cobbled main cross
    for (var cx3 = 1; cx3 < W - 1; cx3++) for (var cy3 = RDH0; cy3 <= RDH1; cy3++) setG(cx3, cy3, "cobble");
    for (var sy = sq[1]; sy <= sq[3]; sy++) for (var sx = sq[0]; sx <= sq[2]; sx++) setG(sx, sy, "stone");              // the stone civic square
    var pk = meta.districts.park.rect; for (var py2 = pk[1] + 1; py2 < pk[3]; py2++) for (var px2 = pk[0] + 1; px2 < pk[2]; px2++) setG(px2, py2, "grass");  // park grass
    for (var by = SHORE - 2; by <= SHORE; by++) for (var bx = 1; bx < W - 1; bx++) setG(bx, by, "sand");               // the waterfront beach
    piers.forEach(function (pk2) { if (ground[pk2]) ground[pk2] = "plank"; });                                          // dock planking
    rl.alley.forEach(function (p) { ground[key(p[0], p[1])] = "redlight"; });                                           // the red-lit district (district palette)

    return { W: W, H: H, grid: g, spawn: { x: CX, y: CY }, doors: doors, features: features, buildings: buildings, piers: piers, exit: exitTile, redlight: rl, ground: ground, meta: meta };
  }

  // square the 5-wide cross: along each centerline, fill open bleed beyond the
  // 5-tile core (so the main street reads 4-5, not 8) — never a door front,
  // never a protected tile, never the core itself.
  // square the cross to 4-5 wide by EXTENDING each road-facing facade down to the
  // road, closing the ragged gap the packer leaves. Per column/row: if a building
  // backs this spot within REACH tiles, fill the open gap between it and the road
  // core. Door stoops are skipped (left as inlets); the inter-building alleys
  // (open with NO building backing them within REACH) are never filled, so no two
  // separate buildings are bridged — figure-ground and the redlight mouth survive.
  function squareRoad(g, frontSet) {
    var REACH = 6;
    for (var x = 2; x < W - 2; x++) {
      if (x >= RDV0 && x <= RDV1) continue;
      extendCol(g, frontSet, x, RDH0, -1, REACH);              // north facade -> road
      extendCol(g, frontSet, x, RDH1, +1, REACH);              // south facade -> road
    }
    for (var yy = 2; yy < SHORE; yy++) {
      if (yy >= RDH0 && yy <= RDH1) continue;
      extendRow(g, frontSet, yy, RDV0, -1, REACH);             // west facade -> road
      extendRow(g, frontSet, yy, RDV1, +1, REACH);             // east facade -> road
    }
  }
  function extendCol(g, frontSet, x, edge, dir, REACH) {
    var y = edge + dir, hops = 0, hit = -1;
    for (; hops < REACH && inb(x, y); y += dir, hops++) { if (frontSet[x + "," + y]) return; if (g[y][x] === "#") { hit = y; break; } if (g[y][x] !== ".") return; }
    if (hit < 0) return;
    for (var b = edge + dir; b !== hit; b += dir) if (!frontSet[x + "," + b]) g[b][x] = "#";
  }
  function extendRow(g, frontSet, y, edge, dir, REACH) {
    var x = edge + dir, hops = 0, hit = -1;
    for (; hops < REACH && inb(x, y); x += dir, hops++) { if (frontSet[x + "," + y]) return; if (g[y][x] === "#") { hit = x; break; } if (g[y][x] !== ".") return; }
    if (hit < 0) return;
    for (var b = edge + dir; b !== hit; b += dir) if (!frontSet[b + "," + y]) g[y][b] = "#";
  }

  // break up any open square larger than ~6x6 (outside the allowed plazas) by
  // stamping a filler — a row-home terrace where there is room, else a shed.
  // break up any open square larger than ~6x6 (outside the protected plazas) by
  // stamping a filler ISLAND (halo-respecting, via fits/stamp — so figure-ground
  // is preserved): a row-home terrace where there is room, else a storefront,
  // else a shed. Never raw-fills, so it never fuses two buildings.
  function breakOpens(g, occ, doors, features, buildings, fits, stamp, prot, R) {
    var fillN = 0;
    // [kind, w, h] largest-first; a filler needs a clear footprint+halo (fits),
    // so it can only land in a genuine empty (a 1-tile alley/halo has no room) —
    // figure-ground and connectivity survive. Stamp the biggest that fits
    // anywhere, repeat until the town holds no empty large enough for a shed.
    var KINDS = [["row", 11, 3], ["row", 8, 3], ["shop", 5, 4], ["shop", 4, 3], ["shed", 3, 3], ["shed", 2, 2]];
    function fitsClear(px, py, w, h) {
      if (!fits(px, py, w, h)) return false;
      for (var y = py - 1; y <= py + h; y++) for (var x = px - 1; x <= px + w; x++) if (prot(x, y)) return false;   // never eat a road/plaza tile's halo
      return true;
    }
    for (var guard = 0; guard < 400; guard++) {
      var placed = false;
      for (var t = 0; t < KINDS.length && !placed; t++) {
        var w = KINDS[t][1], h = KINDS[t][2];
        for (var y = 3; y < SHORE - 2 - h && !placed; y++) for (var x = 2; x < W - 2 - w; x++) {
          if (fitsClear(x, y, w, h)) {
            if (KINDS[t][0] === "row") stampRow(g, doors, features, buildings, x, y, w, h, R);
            else if (KINDS[t][0] === "shop") stamp(x, y, w, h, "locked", "s", "a storefront", "shop");
            else stamp(x, y, w, h, "shed", "o", "a shed", "shed");
            placed = true; fillN++; break;
          }
        }
      }
      if (!placed) break;
    }
    return fillN;
  }

  // a ROW-HOME terrace: a contiguous residential block divided into shared-wall
  // units by internal walls, doors on the south face (mostly non-interactive).
  function stampRow(g, doors, features, buildings, x0, y0, w, h, R) {
    for (var y = y0; y < y0 + h; y++) for (var x = x0; x < x0 + w; x++) g[y][x] = "#";
    var units = Math.max(2, Math.floor(w / 3)), uw = Math.floor(w / units), dy = y0 + h - 1;
    for (var u = 0; u < units; u++) {
      var dx = x0 + u * uw + (uw >> 1);
      doors[key(dx, dy)] = { to: "home", glyph: "+", letter: "n", label: "a row home", front: { x: dx, y: dy + 1 }, building: true, interactive: false };
      if (u > 0) { for (var yy = y0; yy < y0 + h; yy++) g[yy][x0 + u * uw] = "#"; }   // shared party wall (already #)
    }
    buildings.push({ id: "rowhomes", x0: x0, y0: y0, w: w, h: h, area: w * h, glyph: "n", kind: "rowhome", units: units });
  }

  // RED-LIGHT: a solid block carved into a single-mouth 1-wide alley tree —
  // bends every <=4 tiles, dead-ends, never a through-route.
  function buildRedlight(g, occ, doors, features) {
    var x0 = 3, y0 = 24, x1 = 14, y1 = SHORE - 3;
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) { g[y][x] = "#"; occ[y][x] = true; }
    var segs = [[5, 24, "D", 3], [5, 27, "R", 3], [8, 27, "D", 3], [8, 30, "L", 3], [6, 30, "D", 2], [8, 28, "R", 2]];
    var DV = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] }, alley = [], seen = {};
    function open(x, y) { if (x > x0 && x < x1 && y >= y0 && y < y1) { g[y][x] = "."; if (!seen[x + "," + y]) { seen[x + "," + y] = 1; alley.push([x, y]); } } }
    segs.forEach(function (s) { var x = s[0], y = s[1], d = DV[s[2]]; open(x, y); for (var i = 0; i < s[3]; i++) { x += d[0]; y += d[1]; open(x, y); } });
    g[y0 - 1][5] = (g[y0 - 1][5] === "#") ? "." : g[y0 - 1][5];

    var rd = [["bodega", "D"], ["redshop", "x"], ["redlit", "Q"]];
    for (var dn = 0; dn < rd.length; dn++) {
      var p = alley[3 + dn * 3]; if (!p) continue;
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var di = 0; di < dirs.length; di++) { var wx = p[0] + dirs[di][0], wy = p[1] + dirs[di][1]; if (g[wy] && g[wy][wx] === "#" && !doors[key(wx, wy)]) { doors[key(wx, wy)] = { to: rd[dn][0], glyph: "+", letter: rd[dn][1], label: rd[dn][0], red: true, front: { x: p[0], y: p[1] }, building: true }; break; } }
    }
    return { rect: [x0, y0, x1, y1], mouth: { x: 5, y: y0 }, alley: alley };
  }

  function buildEnclosure(g, occ, features, kind, x0, y0, w, h, fill) {
    var x1 = x0 + w - 1, y1 = y0 + h - 1;
    for (var x = x0; x <= x1; x++) { g[y0][x] = ":"; g[y1][x] = ":"; }
    for (var y = y0; y <= y1; y++) { g[y][x0] = ":"; g[y][x1] = ":"; }
    for (var ry = y0; ry <= y1; ry++) for (var rx = x0; rx <= x1; rx++) occ[ry][rx] = true;
    var gx = x0 + (w >> 1); g[y1][gx] = "."; features[key(gx, y1)] = { type: "gate", glyph: "∩", col: "gate", label: kind + " gate" };
    var gl = (fill === "grave") ? "†" : "t", col = (fill === "grave") ? "signal" : "nature";
    for (var iy = y0 + 1; iy <= y1 - 1; iy += 2) for (var ix = x0 + 1; ix <= x1 - 1; ix += 2) features[key(ix, iy)] = { type: "decor", glyph: gl, col: col, label: kind };
  }

  function pruneOpen(g, from) {
    var seen = {}, q = [[from.x, from.y]]; seen[from.x + "," + from.y] = 1;
    while (q.length) { var c = q.shift();[[c[0], c[1] - 1], [c[0], c[1] + 1], [c[0] - 1, c[1]], [c[0] + 1, c[1]]].forEach(function (n) { if (g[n[1]] && g[n[1]][n[0]] === "." && !seen[n[0] + "," + n[1]]) { seen[n[0] + "," + n[1]] = 1; q.push(n); } }); }
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (g[y][x] === "." && !seen[x + "," + y]) g[y][x] = "#";
  }

  return { compose: compose, _W: W, _H: H, _SIZE: SIZE };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_TOWN; }
