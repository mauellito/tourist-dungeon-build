// Tourist Dungeon — VAULT FORMAT + PARSER (Master Directive P1).
// A vault is a header (KEY: value lines) + an ASCII MAP, the proven DCSS .des shape
// reimplemented. The parser is DOM-free + deterministic so it stays testable and the
// assembler (P2) can place + connect vaults through their declared door EDGES.
//
//   NAME:   worked_room_a            (unique id)
//   TAGS:   worked_stone room        (space-separated)
//   WEIGHT: 10                       (selection weight)
//   EDGES:  N door, S door, E door   (connection edges: direction + type)
//   SUBST:  ? = . o                  (variation: a glyph resolves to one option per seed)
//   MAP
//   #####+#####
//   #..o...o..#
//   +....$....+
//   #..o...o..#
//   #####+#####
//   ENDMAP
//
// Glyphs (per the Master Directive): # wall, . floor, + door, { stair, o pillar,
// G landmark, ~ water, $ loot, A/B variation chunks, ? secret chunk. Lines starting
// with ';' are comments (header only; inside MAP every char is map data).
// Classic script: assigns global TD_VAULTFMT. Requires TD_RNG for resolve().
"use strict";

var TD_VAULTFMT = (function () {

  function parse(text) {
    var lines = String(text).split(/\r?\n/);
    var v = { name: "", tags: [], weight: 10, edges: [], subst: {}, rows: [] };
    var inMap = false;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (inMap) {
        if (ln.trim() === "ENDMAP") { inMap = false; continue; }
        v.rows.push(ln.replace(/\s+$/, ""));            // keep the row verbatim (trailing ws trimmed)
        continue;
      }
      var t = ln.trim();
      if (t === "" || t.charAt(0) === ";") continue;     // blank / comment
      if (t === "MAP") { inMap = true; continue; }
      var m = t.match(/^([A-Z]+):\s*(.*)$/);
      if (!m) continue;
      var k = m[1], val = m[2];
      if (k === "NAME") v.name = val.trim();
      else if (k === "TAGS") v.tags = val.trim().split(/\s+/).filter(Boolean);
      else if (k === "WEIGHT") v.weight = parseInt(val, 10) || 10;
      else if (k === "EDGES") v.edges = val.split(",").map(function (s) { var p = s.trim().split(/\s+/); return { dir: p[0], type: p[1] || "door" }; }).filter(function (e) { return e.dir; });
      else if (k === "SUBST") { var sm = val.split("="); if (sm.length === 2) v.subst[sm[0].trim()] = sm[1].trim().split(/\s+/).filter(Boolean); }
    }
    v.h = v.rows.length;
    v.w = v.rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    return v;
  }

  // GLYPH -> { glyph (rendered), tag (semantic) }. Pillars/secrets render as wall.
  function classify(c) {
    switch (c) {
      case "#": return { glyph: "#", tag: "wall" };
      case ".": return { glyph: ".", tag: "floor" };
      case "+": return { glyph: ".", tag: "door" };
      case "{": return { glyph: ".", tag: "stair" };
      case "o": return { glyph: "#", tag: "pillar" };
      case "G": return { glyph: ".", tag: "landmark" };
      case "~": return { glyph: "~", tag: "water" };
      case "$": return { glyph: ".", tag: "loot" };
      case "?": return { glyph: "#", tag: "secret" };
      case "A": case "B": return { glyph: ".", tag: "floor" };   // variation chunk: floor unless SUBST overrides
      case " ": return { glyph: "#", tag: "wall" };               // padding -> rock
      default: return { glyph: "#", tag: "wall" };
    }
  }

  // Resolve variation (SUBST) per seed -> a concrete tagged map ready for the assembler.
  function resolve(v, seed) {
    var rng = TD_RNG.make(((seed >>> 0) ^ 0x5bf03635) || 1);
    var grid = [], tags = [], cats = { door: [], stair: [], pillar: [], landmark: [], water: [], loot: [], secret: [] };
    for (var y = 0; y < v.h; y++) {
      var src = v.rows[y] || "", grow = [], trow = [];
      for (var x = 0; x < v.w; x++) {
        var c = src.charAt(x) || " ";
        if (v.subst[c] && v.subst[c].length) c = v.subst[c][rng.int(0, v.subst[c].length - 1)];
        var info = classify(c);
        grow.push(info.glyph); trow.push(info.tag);
        if (cats[info.tag]) cats[info.tag].push({ x: x, y: y });
      }
      grid.push(grow); tags.push(trow);
    }
    return {
      name: v.name, vtags: v.tags, weight: v.weight, edges: v.edges, w: v.w, h: v.h,
      grid: grid, tags: tags,
      doors: cats.door, stairs: cats.stair, pillars: cats.pillar,
      landmarks: cats.landmark, water: cats.water, loot: cats.loot, secrets: cats.secret
    };
  }

  return { parse: parse, resolve: resolve, classify: classify };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_VAULTFMT; }
