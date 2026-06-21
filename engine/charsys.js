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
  function profMod(rank) { var r = (typeof rank === "number") ? rank : 1; return { acc: (r - 1) * 1.2, dmg: Math.round((r - 1) * 0.4) }; }

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

  // ---- PHASE 3 — BIRTH SIGNS (balanced SIDEGRADES, ~5% makeup shift; no dominant) + HOROSCOPE --------
  // 12 editable signs. Each is a small ZERO-SUM trade (+one stat / -another, ~SIGN_SHIFT), so picking a
  // sign reshapes the build a little without making anyone stronger overall — no dominant sign. The player
  // PICKS the sign; assignDay() assigns a specific DAY within it (semi-random) and stores a daySeed
  // (reserved for future hidden birthday effects — NOT built here; the senses must never be made to lie).
  var SIGN_SHIFT = 32, SIGN_DAYS = 30;
  var SIGNS = {
    anchor:  { order: 0,  name: "The Anchor",  blurb: "steady, and slow with it",      plus: "con", minus: "dex" },
    gull:    { order: 1,  name: "The Gull",    blurb: "quick, and slight with it",     plus: "dex", minus: "con" },
    hammer:  { order: 2,  name: "The Hammer",  blurb: "strong, and plain-spoken",      plus: "might", minus: "int" },
    ledger:  { order: 3,  name: "The Ledger",  blurb: "clever, and no brawler",        plus: "int", minus: "might" },
    lantern: { order: 4,  name: "The Lantern", blurb: "watchful, and aloof",           plus: "per", minus: "charm" },
    mask:    { order: 5,  name: "The Mask",    blurb: "winning, and unobservant",      plus: "charm", minus: "per" },
    tide:    { order: 6,  name: "The Tide",    blurb: "knowing, and easily swayed",    plus: "intuition", minus: "grit" },
    pillar:  { order: 7,  name: "The Pillar",  blurb: "steadfast, and literal",        plus: "grit", minus: "intuition" },
    coin:    { order: 8,  name: "The Coin",    blurb: "fortunate, and forgettable",    plus: "lucky", minus: "appearance" },
    crown:   { order: 9,  name: "The Crown",   blurb: "striking, and hard-luck",       plus: "appearance", minus: "lucky" },
    net:     { order: 10, name: "The Net",     blurb: "nimble, and flighty",           plus: "dex", minus: "grit" },
    forge:   { order: 11, name: "The Forge",   blurb: "mighty, and ill-starred",       plus: "might", minus: "lucky" }
  };
  function signList() { return Object.keys(SIGNS).map(function (id) { var s = SIGNS[id]; return { id: id, name: s.name, blurb: s.blurb, order: s.order }; }).sort(function (a, b) { return a.order - b.order; }); }
  function applySign(stats, signId) { var s = SIGNS[signId]; if (!s || !stats) return stats; stats[s.plus] = clamp1k(stats[s.plus] + SIGN_SHIFT); stats[s.minus] = clamp1k(stats[s.minus] - SIGN_SHIFT); return stats; }
  // assign a specific day within the chosen sign + a reserved day-seed (stored, never read here).
  function assignDay(rng, signId) { var s = SIGNS[signId] || SIGNS.anchor, di = rng.int(0, SIGN_DAYS - 1); return { id: signId, name: s.name, day: s.order * SIGN_DAYS + di + 1, dayInSign: di + 1, daySeed: rng.int(1, 2147483646) }; }

  // HOROSCOPE — at creation, PULL a random ~5% bonus (a stat bump OR an aptitude grant), FIXED for the
  // run (no re-roll). RANDOM => not gameable. Bureau-voice flavour. Applied to stats/sheet by applyHoroscope.
  var HOROSCOPE_STAT_BONUS = 50;
  var STAT_IDS = (typeof TD_STATS !== "undefined" && TD_STATS.STATS) ? TD_STATS.STATS : ["might", "dex", "con", "int", "per", "lucky", "intuition", "appearance", "charm", "grit"];
  var STAT_NAMES = (typeof TD_STATS !== "undefined" && TD_STATS.NAMES) ? TD_STATS.NAMES : {};
  var HORO_GRANTS = [["talent", "sureFooted"], ["talent", "lightSleeper"], ["ability", "powerStrike"], ["ability", "forage"], ["talent", "conviction"]];
  function pullHoroscope(rng) {
    if (rng.next() < 0.7) {
      var st = STAT_IDS[rng.int(0, STAT_IDS.length - 1)];
      return { kind: "stat", target: st, amount: HOROSCOPE_STAT_BONUS, line: "The Bureau's almanac smiles, this season, upon your " + (STAT_NAMES[st] || st) + "." };
    }
    var g = HORO_GRANTS[rng.int(0, HORO_GRANTS.length - 1)], reg = (g[0] === "talent") ? TALENTS : ABILITIES;
    return { kind: g[0], target: g[1], line: "The stars, the clerk observes, have issued you a gift: " + ((reg[g[1]] || {}).name || g[1]) + "." };
  }
  function applyHoroscope(stats, sheet, horo) {
    if (!horo) return;
    if (horo.kind === "stat" && stats && typeof stats[horo.target] === "number") stats[horo.target] = clamp1k(stats[horo.target] + horo.amount);
    else if (sheet && (horo.kind === "talent" || horo.kind === "ability")) grant(sheet, horo.kind, horo.target);
  }

  // ---- PHASE 4 — THE UNIFIED ALLOCATION POOL (~20 pts; STATS or ABILITIES; not gameable) -----------
  // ~20 discretionary points across two pieces: STATS (escalating cost — cheap below average, dear toward
  // the top; lowering below average REFUNDS at the cheap rate; a hard human cap so you can't max one) and
  // ABILITIES (skills/talents/proficiencies bought in discrete bounded chunks per rank/pick — no infinite
  // stacking). Tuned so NEITHER piece strictly dominates per point (sandbox-verified). A STEP = 25 internal
  // stat points (never shown). raiseCost depends on the value you raise FROM (stat-agnostic -> no dominant stat).
  var POOL = {
    POINTS: 20, STEP: 25, FLOOR: 320, CEIL: 950,
    PICK_COST: { talent: 4, ability: 4, skill: 2, proficiency: 2 },   // discrete chunks; capped ranks -> bounded
    raiseCost: function (v) { return v < 500 ? 1.0 : v < 600 ? 1.25 : v < 700 ? 1.5 : v < 800 ? 2.0 : v < 900 ? 2.5 : 3.0; },
    lowerRefund: function () { return 1.0; }   // the cheap rate (lowering a dump stat funds little; no arbitrage vs the dear top)
  };
  function poolCostRaise(from, n) { var c = 0, v = from; for (var i = 0; i < n; i++) { if (v + POOL.STEP > POOL.CEIL) return Infinity; c += POOL.raiseCost(v); v += POOL.STEP; } return c; }
  function poolRefundLower(from, n) { var r = 0, v = from; for (var i = 0; i < n; i++) { if (v - POOL.STEP < POOL.FLOOR) break; r += POOL.lowerRefund(v); v -= POOL.STEP; } return r; }
  // the most STEPs you can raise a stat starting at `from`, spending up to `budget` points (caps at CEIL).
  function poolMaxRaise(from, budget) { var n = 0, v = from, spent = 0; while (v + POOL.STEP <= POOL.CEIL) { var c = POOL.raiseCost(v); if (spent + c > budget + 1e-9) break; spent += c; v += POOL.STEP; n++; } return { steps: n, end: v, spent: spent }; }
  function pickCost(cat) { return POOL.PICK_COST[cat] || 4; }

  // ---- GATE GENDER — FORM-12 ALLOTMENT (the Bureau's ordinance; an allowance by checkbox, not biology) --
  // A box on the visa application grants a small stat ALLOWANCE (applied to the BASE, within the cap). The
  // satire IS the joke. BONUSES only (Other nets to zero, reserved/decline-to-state). Feel-words only — the
  // allowance surfaces solely as a knee-shift in the stat feel-words, never an integer. (FLAG: as written,
  // FEMALE nets more total than MALE -> may read as the stronger general pick; the R3 asymmetry rebalance
  // and the infatuation tax are PINNED, not built.)
  var ALLOT_U = 25;
  // FIX — MALE / FEMALE ONLY. "Other (Supplementary Form 9)" removed; no code path resolves to it.
  var ALLOTMENTS = {
    male:   { order: 0, name: "Male", note: "Allotment per ordinance: a labourer's frame.", stats: { might: 2 * ALLOT_U, con: 2 * ALLOT_U } },
    female: { order: 1, name: "Female", note: "Allotment per ordinance: deftness, bearing, and address.", stats: { might: ALLOT_U, con: ALLOT_U, dex: ALLOT_U, charm: ALLOT_U, appearance: ALLOT_U } }
  };
  function allotmentList() { return Object.keys(ALLOTMENTS).map(function (id) { var a = ALLOTMENTS[id]; return { id: id, name: a.name, note: a.note, order: a.order }; }).sort(function (x, y) { return x.order - y.order; }); }
  function applyAllotment(stats, sexId) { var a = ALLOTMENTS[sexId]; if (!a || !stats) return stats; for (var k in a.stats) if (typeof stats[k] === "number") stats[k] = clamp1k(stats[k] + a.stats[k]); return stats; }
  // the hidden seed the box-value contributes (stored only — for the future name/day hidden-math economy;
  // Two-Channel Honesty: may augment, must NEVER make the senses lie).
  function sexSeed(sexId) { return { box: sexId, seed: ((ALLOTMENTS[sexId] ? ALLOTMENTS[sexId].order + 1 : 0) * 2654435761) >>> 0 }; }
  // GATE GENDER R2 — the visa CASCADE: a Charm-weighted visa assignment (the female Charm allowance bleeds
  // into which visa the Bureau SUGGESTS). Weight each visa by how well the character's stats match its bonus
  // lanes; pick weighted. (FLAG: no prior 'Charm-weighted visa-assignment hook' existed — added here.)
  function assignVisaWeighted(stats, rng) {
    var ids = Object.keys(VISAS), w = [], tot = 0;
    ids.forEach(function (id) { var v = VISAS[id], s = 0; for (var k in v.stats) s += (stats[k] || 500); var ww = Math.pow(s / 500, 3); w.push(ww); tot += ww; });
    var r = (rng ? rng.next() : 0.5) * tot; for (var i = 0; i < ids.length; i++) { r -= w[i]; if (r <= 0) return ids[i]; } return ids[ids.length - 1];
  }

  return {
    ALLOTMENTS: ALLOTMENTS, allotmentList: allotmentList, applyAllotment: applyAllotment, sexSeed: sexSeed, assignVisaWeighted: assignVisaWeighted,
    POOL: POOL, poolCostRaise: poolCostRaise, poolRefundLower: poolRefundLower, poolMaxRaise: poolMaxRaise, pickCost: pickCost,
    SIGNS: SIGNS, signList: signList, applySign: applySign, assignDay: assignDay,
    pullHoroscope: pullHoroscope, applyHoroscope: applyHoroscope,
    VISAS: VISAS, visaList: visaList, applyVisa: applyVisa, grantVisaSignature: grantVisaSignature,
    PROFICIENCIES: PROFICIENCIES, PROF_RANKS: PROF_RANKS, profMod: profMod, profRankOf: profRankOf,
    SKILLS: SKILLS, SKILL_RANKS: SKILL_RANKS, TALENTS: TALENTS, ABILITIES: ABILITIES,
    blankSheet: blankSheet, grant: grant, rankUp: rankUp, has: has,
    profWord: profWord, skillWord: skillWord, surface: surface
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_CHARSYS; }
