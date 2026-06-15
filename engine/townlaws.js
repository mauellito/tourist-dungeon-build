// Tourist Dungeon — TOWN LAW-SUITE (TD_TOWNLAWS). The spatial gate for the procedural town
// (TD_TOWNGEN), the figure/ground INVERSION of the dungeon: buildings are the packed figure,
// streets are the circulation ground, water organises everything. A candidate town must PASS
// or it is discarded + regenerated (same discipline as TD_LAWS for the dungeon).
//
// Tag vocabulary (grid char in []):
//   water [~] · pier [=] · bridge [#](walkable) · street [.] · plaza [,] · park ["] ·
//   graveyard [+] · fence [f](blocks) · building [B](blocks) · wall [#-rock] · gate [G] ·
//   church [C] · dungeon [>] .  WALKABLE = street/plaza/park/graveyard/pier/bridge/gate/
//   church/dungeon.  BLOCKS = water/fence/building/wall.
//
// REQUIRED FEATURES (gate-reject if missing): plaza, park, fenced graveyard, stream+bridges,
// waterfront+piers, city-exit gate, church + dungeon mouth on its plaza, a main-street spine
// gate->dungeon. Plus anti-grid on buildings (T16) and reachability (T_REACH).
// Classic script: assigns global TD_TOWNLAWS. DOM-free + deterministic.
"use strict";

var TD_TOWNLAWS = (function () {
  var D4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  var WALK = { street: 1, plaza: 1, park: 1, graveyard: 1, pier: 1, bridge: 1, gate: 1, church: 1, dungeon: 1, alley: 1, landmark: 1, notice: 1, vendor: 1, npc: 1, kiosk: 1 };

  function tg(m, x, y) { return (m.tag[y] && m.tag[y][x]) || "void"; }
  function walk(m, x, y) { return x >= 0 && y >= 0 && x < m.w && y < m.h && WALK[tg(m, x, y)]; }

  // count cells of a tag; collect first of a kind
  function count(m, t) { var n = 0; for (var y = 0; y < m.h; y++) for (var x = 0; x < m.w; x++) if (m.tag[y][x] === t) n++; return n; }
  function any(m, pred) { for (var y = 0; y < m.h; y++) for (var x = 0; x < m.w; x++) if (pred(x, y)) return [x, y]; return null; }

  // 4-connected components over a predicate -> [{size, cells:[[x,y]..], bbox}]
  function comps(m, pred) {
    var seen = {}, out = [];
    for (var y = 0; y < m.h; y++) for (var x = 0; x < m.w; x++) {
      if (seen[x + "," + y] || !pred(x, y)) continue;
      var q = [[x, y]], cells = []; seen[x + "," + y] = 1;
      while (q.length) { var c = q.pop(); cells.push(c); for (var i = 0; i < 4; i++) { var nx = c[0] + D4[i][0], ny = c[1] + D4[i][1]; if (nx >= 0 && ny >= 0 && nx < m.w && ny < m.h && pred(nx, ny) && !seen[nx + "," + ny]) { seen[nx + "," + ny] = 1; q.push([nx, ny]); } } }
      out.push({ size: cells.length, cells: cells });
    }
    return out;
  }

  function reachFrom(m, sx, sy) {
    var seen = {}, q = [[sx, sy]], n = 0; if (!walk(m, sx, sy)) return { seen: seen, n: 0 };
    seen[sx + "," + sy] = 1;
    while (q.length) { var c = q.pop(); n++; for (var i = 0; i < 4; i++) { var nx = c[0] + D4[i][0], ny = c[1] + D4[i][1]; if (walk(m, nx, ny) && !seen[nx + "," + ny]) { seen[nx + "," + ny] = 1; q.push([nx, ny]); } } }
    return { seen: seen, n: n };
  }

  // longest straight building-front run within a district rect (a building cell with street/plaza
  // directly on one perpendicular side) — the anti-grid / order metric, scoped to one quarter.
  function frontRunIn(m, D) {
    function bld(x, y) { return tg(m, x, y) === "building"; }
    function op(x, y) { var t = tg(m, x, y); return t === "street" || t === "plaza"; }
    var mx = 0, x, y;
    for (y = D.y0; y <= D.y1; y++) { var rn = 0, rs = 0; for (x = D.x0; x <= D.x1; x++) { rn = (bld(x, y) && op(x, y - 1)) ? rn + 1 : 0; rs = (bld(x, y) && op(x, y + 1)) ? rs + 1 : 0; if (rn > mx) mx = rn; if (rs > mx) mx = rs; } }
    for (x = D.x0; x <= D.x1; x++) { var rw = 0, re = 0; for (y = D.y0; y <= D.y1; y++) { rw = (bld(x, y) && op(x - 1, y)) ? rw + 1 : 0; re = (bld(x, y) && op(x + 1, y)) ? re + 1 : 0; if (rw > mx) mx = rw; if (re > mx) mx = re; } }
    return mx;
  }
  // dead-end street cells within a rect (a walkable cell with exactly ONE walkable neighbour) —
  // the crookedness signal of a grown quarter.
  function deadEndsIn(m, D) {
    var n = 0; for (var y = D.y0; y <= D.y1; y++) for (var x = D.x0; x <= D.x1; x++) { if (!walk(m, x, y)) continue; var c = 0; for (var i = 0; i < 4; i++) if (walk(m, x + D4[i][0], y + D4[i][1])) c++; if (c === 1) n++; } return n;
  }

  function check(m) {
    var laws = {};
    function law(id, ok, val) { laws[id] = { pass: !!ok, value: val }; }
    var area = m.w * m.h;

    // T1 WATER ORGANISES — a real water body (a stream/harbour), not a puddle
    var water = count(m, "water");
    law("T1_water", water >= area * 0.06, (100 * water / area).toFixed(0) + "% water");
    // T2 BRIDGES — the stream is crossed only at >=2 tagged bridges
    law("T2_bridges", count(m, "bridge") >= 2, count(m, "bridge") + " bridge cells");
    // T3 PIERS — walkable piers on the waterfront
    law("T3_piers", count(m, "pier") >= 3, count(m, "pier") + " pier cells");
    // T4 PLAZA / T5 PARK / T6 GRAVEYARD present and real-sized
    law("T4_plaza", count(m, "plaza") >= 9, count(m, "plaza") + " plaza cells");
    law("T5_park", count(m, "park") >= 16, count(m, "park") + " park cells");
    var grave = comps(m, function (x, y) { return m.tag[y][x] === "graveyard"; });
    var graveBig = grave.filter(function (c) { return c.size >= 9; });
    // a graveyard must be FENCED: its border neighbours are fence/water/wall (no open street leak
    // except one gate). Count graveyard cells whose orthogonal non-graveyard neighbour is open.
    var graveLeak = 0;
    if (graveBig.length) graveBig[0].cells.forEach(function (c) { for (var i = 0; i < 4; i++) { var t = tg(m, c[0] + D4[i][0], c[1] + D4[i][1]); if (t !== "graveyard" && t !== "fence" && t !== "water" && t !== "wall" && t !== "gate" && t !== "void") graveLeak++; } });
    law("T6_graveyard", graveBig.length >= 1 && graveLeak <= 2, (graveBig.length ? graveBig[0].size : 0) + " cells, " + graveLeak + " unfenced edges");
    // T7 CHURCH + DUNGEON on a plaza — the dungeon mouth sits on a plaza, a church adjacent
    var dmouth = any(m, function (x, y) { return m.tag[y][x] === "dungeon"; });
    var dungeonOnPlaza = false, churchNear = false;
    if (dmouth) {
      for (var i = 0; i < 4; i++) if (tg(m, dmouth[0] + D4[i][0], dmouth[1] + D4[i][1]) === "plaza") dungeonOnPlaza = true;
      // church within 3 cells of the mouth
      for (var yy = -3; yy <= 3 && !churchNear; yy++) for (var xx = -3; xx <= 3; xx++) if (tg(m, dmouth[0] + xx, dmouth[1] + yy) === "church") churchNear = true;
    }
    law("T7_church_dungeon", !!dmouth && dungeonOnPlaza && churchNear, (dmouth ? "" : "no mouth ") + (dungeonOnPlaza ? "" : "not on plaza ") + (churchNear ? "" : "no church "));
    // T8 CITY-EXIT GATE on the border
    var gate = any(m, function (x, y) { return m.tag[y][x] === "gate"; });
    law("T8_gate", !!gate, gate ? "gate@" + gate[0] + "," + gate[1] : "no gate");
    // T9 MAIN-STREET SPINE — the gate reaches the dungeon mouth over walkable ground
    var reach = gate ? reachFrom(m, gate[0], gate[1]) : { seen: {}, n: 0 };
    law("T9_spine", !!(gate && dmouth && reach.seen[dmouth[0] + "," + dmouth[1]]), gate && dmouth ? (reach.seen[dmouth[0] + "," + dmouth[1]] ? "gate->dungeon connected" : "gate cannot reach dungeon") : "missing gate/dungeon");
    // T10 BUILDINGS EXIST — the figure is packed (a real built town), a MAJORITY-ish of land
    var bld = count(m, "building");
    law("T10_buildings", bld >= area * 0.12, (100 * bld / area).toFixed(0) + "% building");
    // T11 REACH — (almost) all walkable reached from the gate (island/boat-only excepted)
    var totalWalk = 0; for (var y2 = 0; y2 < m.h; y2++) for (var x2 = 0; x2 < m.w; x2++) if (walk(m, x2, y2)) totalWalk++;
    law("T11_reach", totalWalk > 0 && reach.n >= totalWalk - (m.islandCells || 0), reach.n + "/" + totalWalk + " walkable reached");
    // PER-DISTRICT STREET-LOGIC — the city-ness contrast. Each quarter is checked by its own
    // streetLogic instead of one global rule: GROWN quarters (market/housing) must read as a
    // tangle (anti-grid + a dead-end); PLANNED quarters (civic/institutional) must read ORDERED
    // (a long aligned terrace front). Warehouse/red-light have their own laws and are exempt.
    var districts = (m.meta && m.meta.districts) || [];
    var GROWN_CONTRAST = { market: 1, housing: 1 };
    var grownDs = districts.filter(function (D) { return D.streetLogic === "grown" && GROWN_CONTRAST[D.role]; });
    var plannedDs = districts.filter(function (D) { return D.streetLogic === "planned"; });

    // T16 (rescoped) — GROWN quarters enforce anti-grid HARD (<=3 in alignment). Planned is
    // deliberately relaxed here (order is its character; checked by T_planned_order instead).
    var maxGrownFront = 0; grownDs.forEach(function (D) { var f = frontRunIn(m, D); if (f > maxGrownFront) maxGrownFront = f; });
    law("T16_antigrid", grownDs.length === 0 || maxGrownFront <= 3, maxGrownFront + "-cell grown front (max 3), " + grownDs.length + " grown quarters");

    // T_PLANNED_ORDER — every planned quarter presents a long aligned terrace front (>3, clearly
    // above the grown cap) so the seam to a grown quarter is visibly order-vs-tangle.
    var plannedVals = [], minPlanned = 99; plannedDs.forEach(function (D) { var f = frontRunIn(m, D); plannedVals.push(f); if (f < minPlanned) minPlanned = f; });
    law("T_planned_order", plannedDs.length === 0 || minPlanned >= 5, (plannedDs.length ? plannedVals.join("/") : "no planned") + " planned fronts (min 5)");

    // T_GROWN_CROOKED — every grown quarter big enough to fit one carries a dead-end (organic nook).
    var crookOk = true, crookVals = []; grownDs.forEach(function (D) { var area = (D.x1 - D.x0 + 1) * (D.y1 - D.y0 + 1), de = deadEndsIn(m, D); crookVals.push(de); if (area >= 16 && de < 1) crookOk = false; });
    law("T_grown_crooked", crookOk, grownDs.length + " grown quarters, dead-ends [" + crookVals.join(",") + "]");

    // T_REDLIGHT SELF-CONCEALMENT — the red-light district reads as a place apart: a solid
    // outward-facing building RING with exactly ONE entrance (no through-route), a hidden
    // alley-warren inside. Measured on its bbox perimeter: >=75% building, exactly one open run.
    var RL = m.meta && m.meta.redlight, rlOk = false, rlVal = "no red-light";
    if (RL) {
      var per = [], i;
      for (var x = RL.x0; x <= RL.x1; x++) { per.push(tg(m, x, RL.y0)); per.push(tg(m, x, RL.y1)); }
      for (var y = RL.y0 + 1; y < RL.y1; y++) { per.push(tg(m, RL.x0, y)); per.push(tg(m, RL.x1, y)); }
      var bld = 0, openRuns = 0, prevOpen = false, perWalk = 0;
      // walk the ring in order to count contiguous OPEN runs (entrances)
      var ring = [];
      for (var x = RL.x0; x <= RL.x1; x++) ring.push(tg(m, x, RL.y0));
      for (var y = RL.y0 + 1; y <= RL.y1; y++) ring.push(tg(m, RL.x1, y));
      for (var x = RL.x1 - 1; x >= RL.x0; x--) ring.push(tg(m, x, RL.y1));
      for (var y = RL.y1 - 1; y > RL.y0; y--) ring.push(tg(m, RL.x0, y));
      for (i = 0; i < ring.length; i++) { var isWalk = !!WALK[ring[i]]; if (ring[i] === "building" || ring[i] === "water" || ring[i] === "fence") bld++; if (isWalk) { perWalk++; if (!prevOpen) openRuns++; prevOpen = true; } else prevOpen = false; }
      if (WALK[ring[0]] && WALK[ring[ring.length - 1]]) openRuns = Math.max(1, openRuns - 1);   // wrap-around merge
      var hidden = 0; for (var y = RL.y0 + 1; y < RL.y1; y++) for (var x = RL.x0 + 1; x < RL.x1; x++) if (tg(m, x, y) === "alley") hidden++;
      rlOk = (bld >= ring.length * 0.75) && openRuns === 1 && hidden >= 6;
      rlVal = (100 * bld / ring.length).toFixed(0) + "% ring, " + openRuns + " entrance, " + hidden + " hidden alley";
    }
    law("T_redlight", rlOk, rlVal);

    // T_INTEREST — the town is BUSY: every quarter has a REASON (landmark) and a SECRET, the kiosk
    // is placed, and there is a density of small static interactions (notices/vendors/NPCs).
    var lm = count(m, "landmark"), sec = count(m, "townsecret"), dens = count(m, "notice") + count(m, "vendor") + count(m, "npc"), kiosk = count(m, "kiosk");
    law("T_interest", lm >= 5 && sec >= 4 && dens >= 8 && kiosk >= 1, lm + " landmarks, " + sec + " secrets, " + dens + " street-life, " + kiosk + " kiosk");

    var pass = Object.keys(laws).every(function (k) { return laws[k].pass; });
    return { pass: pass, laws: laws };
  }

  return { check: check, comps: comps, reachFrom: reachFrom, WALK: WALK };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_TOWNLAWS; }
