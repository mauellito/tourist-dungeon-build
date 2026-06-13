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
    },

    // ---- v20 R2 — THE LIBRARY FAMILY + the office interior. Placed deterministically
    // by the generator (tag "placed" keeps them OUT of the random splice). Bookshelves
    // are "#" stacks (the only renderable wall glyph) read as aisles; signage is a
    // register-voice feature; every secret tell is from the one vocabulary. STATIC
    // dressing — no mechanics. Finis Africae is the forbidden innermost, deepest only.
    {
      id: "dungeon-library", title: "The Dungeon Library", tags: ["library", "placed"],
      levels: [1, 9], rarity: 0, required: false, connections: 1, size: [11, 9],
      layout: [
        "###########",
        "#.........#",
        "#.#.#.#.#.#",
        "#.#.#.#.#.#",
        "+....@....#",
        "#.#.#.#.#.#",
        "#.#.#.#.#.#",
        "#.........#",
        "###########"
      ],
      features: [{ x: 5, y: 1, glyph: "¶", channel: "OBJ", kind: "seen", obj: "OBJ",
        text: "BUREAU OF SUBTERRANEAN RECORDS. Silence is the first citation; the second is not posted, for reasons the first should make plain." }],
      items: [{ x: 1, y: 1, kind: "ration" }],
      creatures: [],
      secret: { x: 2, y: 2, tell: "hollow", kind: "bandage" }
    },
    {
      id: "ghost-library", title: "The Ghost Library", tags: ["library", "placed"],
      levels: [1, 9], rarity: 0, required: false, connections: 1, size: [11, 9],
      layout: [
        "###########",
        "#.........#",
        "#..#...#..#",
        "#.........#",
        "+....@....#",
        "#.........#",
        "#..#...#..#",
        "#.........#",
        "###########"
      ],
      features: [{ x: 5, y: 7, glyph: "¶", channel: "OBJ", kind: "seen", obj: "OBJ",
        text: "DEPARTMENT OF FORMER PERSONS. Returns are accepted at any hour; the dead, as a class, keep irregular ones." }],
      items: [{ x: 9, y: 1, kind: "souvenir" }],
      creatures: [],
      secret: { x: 3, y: 2, tell: "draft", kind: "ration" }
    },
    {
      id: "dragon-library", title: "The Dragon Library", tags: ["library", "placed"],
      levels: [2, 9], rarity: 0, required: false, connections: 1, size: [11, 9],
      layout: [
        "###########",
        "#.#.#.#.#.#",
        "#.........#",
        "#.........#",
        "+...@.....#",
        "#.........#",
        "#.........#",
        "#.#.#.#.#.#",
        "###########"
      ],
      features: [{ x: 6, y: 4, glyph: "¶", channel: "OBJ", kind: "seen", obj: "OBJ",
        text: "REGISTRY OF LARGE CLAIMANTS. Do not wake the catalogue. It is current, it is enormous, and it remembers being borrowed from." }],
      items: [{ x: 5, y: 2, kind: "ration" }],
      creatures: [],
      secret: { x: 2, y: 1, tell: "rhyme", kind: "souvenir" }
    },
    {
      id: "monster-library", title: "The Monster Library", tags: ["library", "placed"],
      levels: [1, 9], rarity: 0, required: false, connections: 1, size: [11, 9],
      layout: [
        "###########",
        "#.#.#.#.#.#",
        "#.#.#.#.#.#",
        "#.........#",
        "+....@....#",
        "#.........#",
        "#.#.#.#.#.#",
        "#.#.#.#.#.#",
        "###########"
      ],
      features: [{ x: 5, y: 3, glyph: "¶", channel: "OBJ", kind: "seen", obj: "OBJ",
        text: "INDEX OF UNFILED THINGS. Every title here was shelved under itself, against the advice of everyone who survived the attempt." }],
      items: [{ x: 1, y: 3, kind: "bandage" }],
      creatures: [],
      secret: { x: 2, y: 1, tell: "hollow", kind: "souvenir" }
    },
    {
      id: "finis-africae", title: "Finis Africae", tags: ["library", "forbidden", "placed"],
      levels: [3, 9], rarity: 0, required: false, connections: 1, size: [9, 9],
      layout: [
        "#########",
        "#.......#",
        "#.#####.#",
        "#.#...#.#",
        "+...@.#.#",
        "#.#.#.#.#",
        "#.#.#...#",
        "#.....#.#",
        "#########"
      ],
      features: [{ x: 1, y: 1, glyph: "¶", channel: "OBJ", kind: "seen", obj: "OBJ",
        text: "FINIS AFRICAE — the end of the map. No card admits you that you would still be holding on the way out." }],
      items: [],
      creatures: [],
      secret: { x: 5, y: 2, tell: "rhyme", kind: "souvenir" }
    },
    {
      id: "bureau-office", title: "the Bureau Office", tags: ["office", "placed"],
      levels: [1, 9], rarity: 0, required: false, connections: 1, size: [9, 7],
      layout: [
        "#########",
        "#.......#",
        "#.......#",
        "+...@...#",
        "#.#####.#",
        "#.......#",
        "#########"
      ],
      features: [{ x: 4, y: 5, glyph: "¶", channel: "OBJ", kind: "seen", obj: "OBJ",
        text: "The counter, shuttered. A handbell, a sign reserving the right to be elsewhere, and a queue-tape across a chair no one will sit in." }],
      items: [],
      creatures: [],
      secret: { x: 4, y: 4, tell: "hollow", kind: "ration" }
    }
  ];

  function forLevel(L) { return VAULTS.filter(function (v) { return L >= v.levels[0] && L <= v.levels[1]; }); }
  function byId(id) { for (var i = 0; i < VAULTS.length; i++) if (VAULTS[i].id === id) return VAULTS[i]; return null; }
  return { ALL: VAULTS, TELLS: TELLS, forLevel: forLevel, byId: byId };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_VAULTS; }
