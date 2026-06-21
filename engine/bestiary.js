// Tourist Dungeon — TD_BESTIARY: the 10X roster via FAMILIES + VARIANT GENERATOR (classic names).
// ~21 families, each yielding a graded ladder of members across RANK (grunt->lord) x ROLE (melee/
// archer/skirmisher/caster/healer/leader) (+ ELEMENT where apt), producing 200+ foes. Each member is
// shape-compatible with TD_RESOLVE.COMBAT.CREATURES (band/hp/dmg/name/glyph/arche/weapon/armor/stats)
// PLUS family/rank/role/element + MECHANIC TAGS (pack/regen/ranged/raise/summon/poison/fear/drain/
// guardian/bighit/heal/leader). GLYPH BY FAMILY (one letter; UPPERCASE at the top ranks) for instant
// readability. On load it MERGES the roster into TD_RESOLVE.COMBAT.CREATURES and retires the old
// office-worker foes from the spawn pool (noSpawn), keeping a thin Bureau "warden" presence upstairs.
// Bureau flavour is a LIGHT examine sprinkle only (Gate 1). Values are PLACEHOLDER (sim calibrates).
"use strict";

var TD_BESTIARY = (function () {
  // rank ladder: grunt(0) -> veteran(1) -> elite(2) -> champion(3) -> lord(4)
  var HP_MUL  = [1.0, 1.5, 2.3, 3.4, 5.2];
  var DMG_MUL = [1.0, 1.3, 1.7, 2.2, 3.0];
  var BAND_ADD = [0, 1, 2, 3, 4];
  function clampBand(b) { return Math.max(1, Math.min(6, b)); }
  function clampStat(v) { return Math.max(1, Math.min(1000, Math.round(v))); }
  // scale a base stat block toward menace with rank (combat stats climb; mind stats drift mildly)
  function scaleStats(base, rank) {
    var up = 1 + rank * 0.10, o = {};
    ["might", "dex", "con", "int", "per", "lucky", "intuition", "appearance", "charm", "grit"].forEach(function (k) {
      var v = (base && typeof base[k] === "number") ? base[k] : 500;
      o[k] = clampStat(/might|con|grit|dex/.test(k) ? v * up : v);
    });
    return o;
  }
  function uniq(a) { var s = {}, o = []; a.forEach(function (x) { if (!s[x]) { s[x] = 1; o.push(x); } }); return o; }

  // ROLE modifiers: what a role does to a member (arche tendency, weapon, tags). Melee is the default.
  var ROLE = {
    melee:      { arche: "pursue",   tags: [] },
    archer:     { arche: "kite",     tags: ["ranged"],  weapon: "sling" },
    skirmisher: { arche: "skirmish", tags: [],          weapon: "sabre", dex: 120 },
    caster:     { arche: "kite",     tags: ["caster", "ranged"], weapon: "dagger", armor: "unarmored" },
    healer:     { arche: "hold",     tags: ["heal"],    weapon: "mace" },
    leader:     { arche: "pursue",   tags: ["leader"],  armorBump: true }
  };
  var RANK_NAME = ["grunt", "veteran", "elite", "champion", "lord"];

  // ---- THE FAMILIES (terse). g=glyph, a=base arche, w/ar=gear, bb=band of the grunt, hp/dmg base,
  // st=base stat block, tags=family-wide mechanics, L=rank ladder (classic names), RV=role variants
  // (applied to the grunt + the elite rank), el=elements (giants/dragons/elementals). ----
  function st(mi, dx, co, gr) { return { might: mi, dex: dx, con: co, int: 360, per: 460, lucky: 500, intuition: 420, appearance: 380, charm: 340, grit: gr }; }
  var FAM = {
    goblinoid:  { g: "g", a: "pursue",   w: "shortsword", ar: "light",      bb: 1, hp: 20, dmg: 6,  st: st(470, 520, 440, 440), tags: ["pack"],
                  L: ["a goblin", "a hobgoblin", "a bugbear", "a goblin boss", "the goblin king"], RV: ["archer", "skirmisher", "caster"] },
    kobold:     { g: "k", a: "skirmish", w: "dagger",     ar: "unarmored",  bb: 1, hp: 14, dmg: 5,  st: st(420, 600, 360, 420), tags: ["pack"],
                  L: ["a kobold", "a kobold veteran", "a kobold elite", "a kobold chieftain", "the kobold king"], RV: ["archer", "caster"] },
    orc:        { g: "o", a: "pursue",   w: "axe",        ar: "medium",     bb: 2, hp: 34, dmg: 10, st: st(600, 480, 560, 540), tags: ["pack"],
                  L: ["an orc", "an orc veteran", "an orc berserker", "an orc captain", "an orc warlord"], RV: ["archer", "skirmisher", "caster"] },
    gnoll:      { g: "n", a: "pursue",   w: "spear",      ar: "light",      bb: 2, hp: 30, dmg: 11, st: st(560, 580, 500, 520), tags: ["pack"],
                  L: ["a gnoll", "a gnoll hunter", "a gnoll fang", "a gnoll demoncaller", "a gnoll pack lord"], RV: ["archer", "skirmisher"] },
    skeletal:   { g: "s", a: "slow",     w: "shortsword", ar: "light",      bb: 2, hp: 24, dmg: 9,  st: st(520, 440, 520, 600), tags: [],
                  L: ["a skeleton", "a skeletal warrior", "a skeletal champion", "a bone knight", "a death-lord"], RV: ["archer", "caster"] },
    fleshy:     { g: "z", a: "drift",    w: "dagger",     ar: "unarmored",  bb: 1, hp: 30, dmg: 7,  st: st(540, 300, 600, 520), tags: ["poison"],
                  L: ["a zombie", "a ghoul", "a ghast", "a corpse-eater", "a rotting horror"], RV: ["caster"] },
    spectral:   { g: "w", a: "ambush",   w: "dagger",     ar: "unarmored",  bb: 3, hp: 26, dmg: 12, st: st(480, 760, 420, 560), tags: ["fear", "drain"],
                  L: ["a shade", "a wraith", "a wight", "a spectre", "a banshee"], RV: ["caster"] },
    greaterUd:  { g: "l", a: "kite",     w: "dagger",     ar: "unarmored",  bb: 4, hp: 60, dmg: 16, st: st(560, 560, 620, 700), tags: ["raise", "fear", "caster", "ranged"],
                  L: ["a death priest", "a necromancer", "a lich", "an archlich", "the bone emperor"], RV: ["healer"] },
    dwarf:      { g: "h", a: "slow",     w: "mace",       ar: "heavy",      bb: 2, hp: 40, dmg: 10, st: st(620, 420, 660, 600), tags: [],
                  L: ["a dwarf", "a dwarf soldier", "a dwarf hammerguard", "a dwarf warlord", "a dwarf king"], RV: ["archer", "caster"] },
    elf:        { g: "e", a: "kite",     w: "sabre",      ar: "light",      bb: 2, hp: 26, dmg: 10, st: st(500, 740, 460, 520), tags: [],
                  L: ["an elf", "an elf warrior", "an elf bladesinger", "an elf high guard", "an elf lord"], RV: ["archer", "caster", "healer"] },
    giant:      { g: "p", a: "slow",     w: "warhammer", ar: "medium",      bb: 4, hp: 80, dmg: 16, st: st(780, 360, 800, 640), tags: ["bighit", "ranged"],
                  L: ["a hill giant", "a stone giant", "a frost giant", "a fire giant", "a storm giant"], el: ["hill", "stone", "frost", "fire", "storm"], RV: [] },
    troll:      { g: "t", a: "pursue",   w: "axe",        ar: "unarmored",  bb: 4, hp: 70, dmg: 15, st: st(720, 480, 740, 560), tags: ["regen", "bighit"],
                  L: ["a troll", "a war troll", "a dire troll", "a troll matriarch", "a troll king"], RV: [] },
    ogre:       { g: "q", a: "slow",     w: "warhammer", ar: "light",       bb: 3, hp: 60, dmg: 15, st: st(720, 380, 680, 540), tags: ["bighit"],
                  L: ["an ogre", "an ogre brute", "an ogre savage", "an ogre warlord", "an ogre tyrant"], RV: ["archer"] },
    vermin:     { g: "v", a: "rush",     w: "dagger",     ar: "unarmored",  bb: 1, hp: 12, dmg: 6,  st: st(380, 620, 320, 400), tags: ["pack", "poison"],
                  L: ["a giant rat", "a giant spider", "a giant scorpion", "a vermin swarm", "a vermin broodmother"], RV: [] },
    canine:     { g: "f", a: "pursue",   w: "dagger",     ar: "unarmored",  bb: 1, hp: 22, dmg: 8,  st: st(520, 700, 460, 480), tags: ["pack"],
                  L: ["a jackal", "a wolf", "a dire wolf", "a worg", "a hound alpha"], RV: ["skirmisher"] },
    reptile:    { g: "r", a: "ambush",   w: "spear",      ar: "light",      bb: 2, hp: 36, dmg: 11, st: st(560, 540, 580, 500), tags: ["poison"],
                  L: ["a lizardman", "a lizard brave", "a basilisk", "a wyvern", "a serpent lord"], RV: ["archer"] },
    ooze:       { g: "j", a: "drift",    w: "dagger",     ar: "unarmored",  bb: 2, hp: 44, dmg: 9,  st: st(500, 200, 700, 480), tags: ["poison", "regen"],
                  L: ["a grey ooze", "a green slime", "an acid jelly", "a black pudding", "a gelatinous lord"], RV: [] },
    construct:  { g: "c", a: "slow",     w: "warhammer", ar: "heavy",       bb: 3, hp: 70, dmg: 13, st: st(700, 300, 820, 700), tags: ["bighit", "guardian"],
                  L: ["a clay golem", "an iron golem", "a stone guardian", "a war construct", "a colossus"], RV: [] },
    demon:      { g: "&", a: "pursue",   w: "axe",        ar: "medium",     bb: 4, hp: 64, dmg: 16, st: st(700, 620, 640, 660), tags: ["fear", "summon"],
                  L: ["an imp", "a hellhound", "a barbed demon", "a balor", "a demon prince"], RV: ["caster", "archer"] },
    dragon:     { g: "d", a: "pursue",   w: "axe",        ar: "heavy",      bb: 5, hp: 110, dmg: 18, st: st(820, 560, 860, 720), tags: ["bighit", "ranged", "fear"],
                  L: ["a dragon wyrmling", "a young dragon", "an adult dragon", "an ancient dragon", "a great wyrm"], el: ["white", "green", "blue", "red", "gold"], RV: [] },
    fey:        { g: "y", a: "skirmish", w: "dagger",     ar: "unarmored",  bb: 2, hp: 20, dmg: 8,  st: st(440, 780, 420, 520), tags: ["caster"],
                  L: ["a sprite", "a pixie", "a dryad", "a satyr", "a fey lord"], RV: ["archer", "healer"] },
    elemental:  { g: "m", a: "pursue",   w: "warhammer", ar: "unarmored",   bb: 3, hp: 56, dmg: 14, st: st(640, 520, 700, 560), tags: ["bighit", "ranged"],
                  L: ["a dust mephit", "an earth elemental", "a fire elemental", "a frost elemental", "a storm elemental"], el: ["dust", "earth", "fire", "frost", "storm"], RV: [] },
    guardian:   { g: "x", a: "hold",     w: "pike",       ar: "heavy",      bb: 3, hp: 64, dmg: 12, st: st(620, 420, 760, 720), tags: ["guardian"],
                  L: ["a Styx hound", "a gate sentinel", "a tomb guardian", "a vault warden", "a threshold lord"], RV: [] }
  };

  // ---- build a single member def (shape-compatible with COMBAT.CREATURES) ----
  function member(famKey, fam, name, rank, role, element) {
    var rm = ROLE[role] || ROLE.melee;
    var weapon = rm.weapon || fam.w, armor = rm.armor || fam.ar;
    if (role === "leader" && rm.armorBump) armor = "heavy";
    var band = clampBand(fam.bb + BAND_ADD[rank]);
    var hp = Math.round(fam.hp * HP_MUL[rank]);
    var dmg = Math.round(fam.dmg * DMG_MUL[rank]);
    var base = scaleStats(fam.st, rank);
    if (rm.dex) base.dex = clampStat(base.dex + rm.dex);
    var tags = uniq((fam.tags || []).concat(rm.tags || []));
    var glyph = rank >= 3 ? fam.g.toUpperCase() : fam.g;   // case = low/high tier
    var arche = rm.arche || fam.a;
    var def = {
      band: band, hp: hp, dmg: dmg, name: name, glyph: glyph, arche: arche, weapon: weapon, armor: armor,
      family: famKey, rank: rank, role: role, tags: tags, stats: base
    };
    if (element) def.element = element;
    if (tags.indexOf("bighit") >= 0 && rank >= 2) def.tooTough = true;        // telegraphed must-flee for the big ones out of depth
    if (rank === 0 && /rush|skirmish/.test(arche)) def.firstStrike = true;     // glass nippers threaten on contact
    // light Bureau examine sprinkle (Gate 1: occasional only — the lord ranks earn an aside)
    if (rank >= 3) def.examine = name.replace(/^(a|an|the) /, "").replace(/^\w/, function (c) { return c.toUpperCase(); }) + ". The Bureau lists it as 'out of scope'.";
    return def;
  }

  // ---- generate the whole roster ----
  function generate() {
    var R = {};
    Object.keys(FAM).forEach(function (fk) {
      var fam = FAM[fk], L = fam.L, RV = fam.RV || [], el = fam.el || null;
      for (var r = 0; r < L.length; r++) {
        var nm = L[r], elt = el ? el[r] : null;
        R[fk + "_" + r] = member(fk, fam, nm, r, "melee", elt);
        // role variants across the grunt..champion ranks (not the singular lord) -> the family's role spread
        if (r <= 3) {
          RV.forEach(function (role) {
            var rn = nm + " " + (role === "caster" ? "shaman" : role === "archer" ? "archer" : role === "skirmisher" ? "skirmisher" : role === "healer" ? "healer" : "leader");
            R[fk + "_" + r + "_" + role] = member(fk, fam, rn, r, role, el ? el[r] : null);
          });
        }
      }
    });
    return R;
  }

  var ROSTER = generate();

  // depth-banded spawn picker (family-appropriate, in-depth). Mirrors the mapmode mixer but roster-wide.
  function byBand() { var m = {}; Object.keys(ROSTER).forEach(function (k) { var b = ROSTER[k].band; (m[b] = m[b] || []).push(k); }); return m; }
  function count() { return Object.keys(ROSTER).length; }
  function tagsPresent() { var s = {}; Object.keys(ROSTER).forEach(function (k) { (ROSTER[k].tags || []).forEach(function (t) { s[t] = (s[t] || 0) + 1; }); }); return s; }

  // MERGE into the live combat roster: add every generated foe; RETIRE the old office workers from the
  // spawn pool (noSpawn) while keeping their defs for back-compat (a couple are referenced by tests).
  // Keep ONE human "warden" as the Bureau's thin upstairs presence.
  function install() {
    if (typeof TD_RESOLVE === "undefined" || !TD_RESOLVE.COMBAT) return;
    var C = TD_RESOLVE.COMBAT.CREATURES;
    var KEEP_SPAWN = { warden: 1 };   // the thin Bureau presence that still patrols
    Object.keys(C).forEach(function (k) { if (!KEEP_SPAWN[k]) C[k].noSpawn = true; });   // retire the office roster from the pool
    for (var k in ROSTER) C[k] = ROSTER[k];
    return C;
  }
  install();

  return { FAM: FAM, ROLE: ROLE, RANK_NAME: RANK_NAME, ROSTER: ROSTER, generate: generate, member: member,
           byBand: byBand, count: count, tagsPresent: tagsPresent, install: install };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_BESTIARY; }
