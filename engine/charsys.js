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

  // ---- PHASE 2 — VISA CATEGORIES (BONUSES ONLY, editable) ----------------------------------------
  // Eight visas; each grants stat BONUSES (never a penalty) + a signature skill/talent/ability/
  // proficiency from the registries above. Stat-bonus budgets are kept ~equal across visas (~280) so no
  // visa strictly dominates in raw power — they differ only in WHERE the bonus + signature land.
  // `weapon`/`armor` give the starting loadout (Phase-A slots). `freePick` = the Tourist's open knack
  // (chosen at the Phase-5 flow; a sensible default is granted here for the sandbox).
  function clamp1k(v) { return Math.max(1, Math.min(1000, v)); }
  var VISAS = {
    tourist:    { order: 0, name: "Tourist Visa", disposition: "Here for the sights — lucky and hale, with a knack of your choosing.",
      desc: "The default admission. No specialism; a free pick of one aptitude.", weapon: "shortsword", armor: "light", freePick: true,
      stats: { lucky: 140, con: 140 }, grants: [["skill", "appraise", 2]] },
    labourer:   { order: 1, name: "Labourer's Pass", disposition: "Dock-hardened — strong, tough, steady; built for impact and heavy loads.",
      desc: "Hired muscle off the harbour. Impact proficiency and the Dead Lift.", weapon: "mace", armor: "medium",
      stats: { might: 95, con: 95, grit: 95 }, grants: [["proficiency", "impact", 3], ["talent", "deadLift"]] },
    transit:    { order: 2, name: "Transit Visa", disposition: "Always in motion — quick, sharp-eyed, quiet, and tireless.",
      desc: "Cleared for swift passage. Stealth and Athletics.", weapon: "sabre", armor: "light",
      stats: { dex: 140, per: 140 }, grants: [["skill", "stealth", 2], ["skill", "athletics", 2]] },
    scholar:    { order: 3, name: "Scholar's Visa", disposition: "Admitted on letters of study — clever and observant; reads the ciphers.",
      desc: "Here to read the route's records. Research and a Cipher-Minded reliability.", weapon: "dagger", armor: "light",
      stats: { int: 140, per: 140 }, grants: [["skill", "research", 2], ["talent", "cipherMinded"]] },
    surveyor:   { order: 4, name: "Surveyor's Warrant", disposition: "Sent to map and measure — perceptive and intuitive; reads a floor at a glance.",
      desc: "Charged with the survey. Survey and Survey-the-Room.", weapon: "dagger", armor: "light",
      stats: { per: 140, intuition: 140 }, grants: [["skill", "survey", 2], ["ability", "surveyRoom"]] },
    pilgrim:    { order: 5, name: "Pilgrim's Permit", disposition: "Walking it for the soul — unshakable and strong; fear finds no purchase.",
      desc: "On pilgrimage to the deep office. Conviction.", weapon: "mace", armor: "medium",
      stats: { grit: 140, might: 140 }, grants: [["talent", "conviction"]] },
    diplomat:   { order: 6, name: "Diplomatic Visa", disposition: "Credentialed and charming — magnetic and well-made; talks past trouble.",
      desc: "Accredited to negotiate. Parley, the skill and the act.", weapon: "shortsword", armor: "light",
      stats: { charm: 140, appearance: 140 }, grants: [["skill", "parley", 2], ["ability", "parley"]] },
    naturalist: { order: 7, name: "Naturalist's Visa", disposition: "Cataloguing the dark's flora — intuitive and hardy; forages and physicks.",
      desc: "Licensed to forage and study. Forage and Physick.", weapon: "sabre", armor: "light",
      stats: { intuition: 140, con: 140 }, grants: [["skill", "forage", 2], ["talent", "physick"]] }
  };
  function visaList() { return Object.keys(VISAS).map(function (id) { var v = VISAS[id]; return { id: id, name: v.name, disposition: v.disposition, desc: v.desc, weapon: v.weapon, armor: v.armor, order: v.order }; }).sort(function (a, b) { return a.order - b.order; }); }
  function applyVisa(stats, visaId) { var v = VISAS[visaId]; if (!v || !stats) return stats; for (var k in v.stats) if (typeof stats[k] === "number") stats[k] = clamp1k(stats[k] + v.stats[k]); return stats; }
  function grantVisaSignature(sheet, visaId) { var v = VISAS[visaId]; if (!v) return sheet; (v.grants || []).forEach(function (g) { grant(sheet, g[0], g[1], g[2]); }); return sheet; }

  return {
    VISAS: VISAS, visaList: visaList, applyVisa: applyVisa, grantVisaSignature: grantVisaSignature,
    PROFICIENCIES: PROFICIENCIES, PROF_RANKS: PROF_RANKS, profMod: profMod, profRankOf: profRankOf,
    SKILLS: SKILLS, SKILL_RANKS: SKILL_RANKS, TALENTS: TALENTS, ABILITIES: ABILITIES,
    blankSheet: blankSheet, grant: grant, rankUp: rankUp, has: has,
    profWord: profWord, skillWord: skillWord, surface: surface
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_CHARSYS; }
