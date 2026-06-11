// Tourist Dungeon engine — TD_VAULTS: the runtime vault table.
// Hand-authored rooms spliced into generated levels (the DCSS conceit). This is
// the mirror-safe RUNTIME form; the authoring source + JSON Schema live in
// /design/vaults/ (private canon). Keep the two in step. PLACEHOLDER content
// only — generic municipal tone; the canon themed rooms arrive later as pure
// data through this same format.
//
// Each vault: id, title, tags, levels [lo,hi], rarity (weight), required,
// connections (count of '+' tiles), size [w,h], layout rows, and placed
// contents. Layout glyphs: '#' wall · '.' floor · '@' arrival · '+' connection
// (becomes a door to the rest of the level) · '~' water (slows) · 'X' chasm
// (impassable; a prompted fall to the next level) · '$' a plinth (floor).
//
// SECRET GRAMMAR LAW (CLAUDE.md): every secret is telegraphed by one of a small,
// fixed vocabulary of tells — draft / rhyme / hollow — so the language is
// learnable. No untelegraphed secret; no tell that points at nothing.
"use strict";

var TD_VAULTS = (function () {
  var TELLS = {
    draft:  { text: "A cold draft slides from a seam in the wall.", kind: "heard", obj: "OBJ" },
    rhyme:  { text: "A scratched couplet hints that the wall keeps a secret of its own.", kind: "seen", obj: "OBJ" },
    hollow: { text: "Your knuckles find a hollow note in the stone.", kind: "heard", obj: "OBJ" }
  };

  var VAULTS = [
    {
      id: "flooded-antechamber", title: "A Flooded Antechamber", tags: ["water"],
      levels: [1, 4], rarity: 0.5, required: false, connections: 1, size: [9, 7],
      layout: [
        "#########",
        "#..~~~..#",
        "#..~~~..#",
        "+...@...#",
        "#..~~~..#",
        "#.......#",
        "#########"
      ],
      features: [{ x: 7, y: 5, glyph: "¶", channel: "OBJ", kind: "heard", obj: "OBJ", text: "Water laps somewhere out of sight, patient and cold." }],
      items: [{ x: 6, y: 5, kind: "ration" }],
      creatures: [],
      secret: { x: 1, y: 5, tell: "draft", kind: "bandage" }
    },
    {
      id: "collapsed-gallery", title: "A Collapsed Gallery", tags: ["chasm"],
      levels: [2, 4], rarity: 0.4, required: false, connections: 1, size: [9, 7],
      layout: [
        "#########",
        "#.......#",
        "#..XXX..#",
        "+...@...#",
        "#..XXX..#",
        "#.......#",
        "#########"
      ],
      features: [{ x: 1, y: 1, glyph: "¶", channel: "OBJ", kind: "heard", obj: "OBJ", text: "A draft rises from the dark below, steady as a held breath." }],
      items: [{ x: 7, y: 1, kind: "souvenir" }],
      creatures: [{ x: 7, y: 5, kind: "lurker" }],
      secret: { x: 7, y: 6, tell: "hollow", kind: "ration" }
    },
    {
      id: "shrine-alcove", title: "A Shrine Alcove", tags: ["shrine"],
      levels: [1, 4], rarity: 0.6, required: false, connections: 1, size: [7, 7],
      layout: [
        "#######",
        "#.....#",
        "#.....#",
        "+..@..#",
        "#.....#",
        "#..$..#",
        "#######"
      ],
      features: [{ x: 3, y: 5, glyph: "¶", channel: "SUBJ", kind: "intuition", obj: "SUBJ", text: "Something about this alcove invites a second look." }],
      items: [{ x: 1, y: 1, kind: "bandage" }],
      creatures: [],
      secret: { x: 5, y: 1, tell: "rhyme", kind: "souvenir" }
    }
  ];

  function forLevel(L) { return VAULTS.filter(function (v) { return L >= v.levels[0] && L <= v.levels[1]; }); }
  function byId(id) { for (var i = 0; i < VAULTS.length; i++) if (VAULTS[i].id === id) return VAULTS[i]; return null; }
  return { ALL: VAULTS, TELLS: TELLS, forLevel: forLevel, byId: byId };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_VAULTS; }
