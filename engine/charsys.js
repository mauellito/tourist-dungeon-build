// Tourist Dungeon — TD_CHARSYS: the CHARACTER SYSTEM registries (skills / talents / abilities /
// proficiencies), and (added in later phases) visas, birth signs, the horoscope pool, and the
// allocation-pool cost curve. EVERYTHING here is DATA the operator can amend/add/subtract/rename
// without touching logic. Pure + deterministic given a TD_RNG. FEEL-WORDS ONLY on every surface —
// a rank is a word, never a number. Combat MAGNITUDES are untouched; proficiency is a competence
// LAYER folded into the effective weapon (see profMod), not a change to hit()/damage().
"use strict";

var TD_CHARSYS = (function () {
  // ---- PROFICIENCIES — competence with the 3 weapon families + the armour weights ----------------
  // rank index into PROF_RANKS: 0 = clumsy (penalty), 1 = untrained (baseline, no effect), up to 5 = master.
  var PROFICIENCIES = {
    blade:        { name: "Blades", kind: "weapon", family: "blade" },
    impact:       { name: "Impact", kind: "weapon", family: "impact" },
    polearm:      { name: "Polearms", kind: "weapon", family: "polearm" },
    lightArmour:  { name: "Light Armour", kind: "armour", tier: "light" },
    mediumArmour: { name: "Medium Armour", kind: "armour", tier: "medium" },
    heavyArmour:  { name: "Heavy Armour", kind: "armour", tier: "heavy" }
  };
  var PROF_RANKS = ["clumsy", "untrained", "familiar", "proficient", "expert", "master"];
  // a weapon-family proficiency RANK -> a small accuracy/damage modifier (a competence layer ON TOP of
  // the unchanged combat magnitudes). untrained (1) = 0; clumsy (0) = a penalty; master (5) = a modest bonus.
  function profMod(rank) { var r = (typeof rank === "number") ? rank : 1; return { acc: (r - 1) * 2, dmg: Math.round((r - 1) * 0.6) }; }

  // ---- SKILLS (editable list) --------------------------------------------------------------------
  var SKILLS = {
    research:  { name: "Research", desc: "reading the route's records and ciphers" },
    survey:    { name: "Survey", desc: "reading a floor's shape and its dangers" },
    forage:    { name: "Forage", desc: "finding food and physick in the dark" },
    parley:    { name: "Parley", desc: "talking your way past trouble" },
    athletics: { name: "Athletics", desc: "clambering, leaping, and enduring" },
    stealth:   { name: "Stealth", desc: "going unnoticed" },
    appraise:  { name: "Appraise", desc: "knowing what a thing is worth" }
  };
  var SKILL_RANKS = ["unskilled", "novice", "capable", "skilled", "adept", "masterful"];

  // ---- TALENTS (passive perks — each clear + flavourful, never a boring +1 feat-tax) --------------
  var TALENTS = {
    deadLift:     { name: "Dead Lift", desc: "you carry more before the weight slows you." },
    conviction:   { name: "Conviction", desc: "fear, illusion, and compulsion find less purchase." },
    cipherMinded: { name: "Cipher-Minded", desc: "a reliable mind — your worst reads are floored; you are never wholly fooled." },
    sureFooted:   { name: "Sure-Footed", desc: "chasms and treacherous ground rarely take you." },
    lightSleeper: { name: "Light Sleeper", desc: "rest leaves you readier, and an ambush finds you awake." },
    physick:      { name: "Physick", desc: "your foraged remedies go further." }
  };

  // ---- ABILITIES (active — each with a cost: fatigue, or once-per-rest) ---------------------------
  var ABILITIES = {
    powerStrike: { name: "Power Strike", cost: { fatigue: 12 }, desc: "spend yourself for one heavy blow." },
    surveyRoom:  { name: "Survey the Room", cost: { rest: 1 }, desc: "read the whole floor at a glance, once per rest." },
    parley:      { name: "Parley", cost: { rest: 1 }, desc: "attempt to talk a foe down, once per rest." },
    sprint:      { name: "Sprint", cost: { fatigue: 0 }, desc: "a burst of speed (Shift+move) that aids fleeing.", builtin: "sprint" },
    forage:      { name: "Forage", cost: { rest: 1 }, desc: "search the dark for food or physick, once per rest." }
  };

  // ---- the SHEET a character carries; grant + rank mechanics -------------------------------------
  function blankSheet() { return { proficiencies: {}, skills: {}, talents: {}, abilities: {} }; }
  var CATS = { proficiency: "proficiencies", skill: "skills", talent: "talents", ability: "abilities" };
  var REG = { proficiency: PROFICIENCIES, skill: SKILLS, talent: TALENTS, ability: ABILITIES };
  // grant a thing to a sheet. proficiencies/skills carry a RANK (default = next step up, capped);
  // talents/abilities are owned (rank 1 = have it). Returns the sheet.
  function grant(sheet, cat, id, rank) {
    var bucket = CATS[cat]; if (!bucket || !REG[cat] || !REG[cat][id]) return sheet;
    sheet[bucket] = sheet[bucket] || {};
    if (cat === "proficiency") sheet[bucket][id] = clampRank(rank == null ? 2 : rank, PROF_RANKS);       // default = familiar
    else if (cat === "skill") sheet[bucket][id] = clampRank(rank == null ? 1 : rank, SKILL_RANKS);       // default = novice
    else sheet[bucket][id] = (rank == null ? 1 : rank);                                                   // owned
    return sheet;
  }
  // raise a ranked thing by one step (proficiency/skill), capped. (deed-banked GROWTH is STAGED — see note.)
  function rankUp(sheet, cat, id) {
    var bucket = CATS[cat], ranks = cat === "proficiency" ? PROF_RANKS : SKILL_RANKS;
    if (cat !== "proficiency" && cat !== "skill") return sheet;
    var cur = (sheet[bucket] && sheet[bucket][id]) || (cat === "proficiency" ? 1 : 0);
    sheet[bucket] = sheet[bucket] || {}; sheet[bucket][id] = clampRank(cur + 1, ranks); return sheet;
  }
  function has(sheet, cat, id) { var b = CATS[cat]; return !!(sheet && sheet[b] && sheet[b][id]); }
  function profRankOf(sheet, family) {   // the rank for a weapon family (or armour tier) id; default untrained(1)
    if (!sheet || !sheet.proficiencies) return 1;
    return (typeof sheet.proficiencies[family] === "number") ? sheet.proficiencies[family] : 1;
  }
  function clampRank(r, ranks) { return Math.max(0, Math.min(ranks.length - 1, Math.round(r))); }

  // ---- FEEL-WORD SURFACING (the only player-facing read; never a number) -------------------------
  function profWord(rank) { return PROF_RANKS[clampRank(rank == null ? 1 : rank, PROF_RANKS)]; }
  function skillWord(rank) { return SKILL_RANKS[clampRank(rank == null ? 0 : rank, SKILL_RANKS)]; }
  // a whole-sheet surface: arrays of { id, name, word } per category (talents/abilities are owned -> word "yes").
  function surface(sheet) {
    sheet = sheet || blankSheet();
    function mapRanked(bucket, reg, wordFn) { return Object.keys(sheet[bucket] || {}).map(function (id) { return { id: id, name: (reg[id] || {}).name || id, word: wordFn(sheet[bucket][id]) }; }); }
    return {
      proficiencies: mapRanked("proficiencies", PROFICIENCIES, profWord),
      skills: mapRanked("skills", SKILLS, skillWord),
      talents: Object.keys(sheet.talents || {}).map(function (id) { return { id: id, name: (TALENTS[id] || {}).name || id, desc: (TALENTS[id] || {}).desc || "" }; }),
      abilities: Object.keys(sheet.abilities || {}).map(function (id) { return { id: id, name: (ABILITIES[id] || {}).name || id, desc: (ABILITIES[id] || {}).desc || "" }; })
    };
  }

  return {
    PROFICIENCIES: PROFICIENCIES, PROF_RANKS: PROF_RANKS, profMod: profMod, profRankOf: profRankOf,
    SKILLS: SKILLS, SKILL_RANKS: SKILL_RANKS, TALENTS: TALENTS, ABILITIES: ABILITIES,
    blankSheet: blankSheet, grant: grant, rankUp: rankUp, has: has,
    profWord: profWord, skillWord: skillWord, surface: surface
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_CHARSYS; }
