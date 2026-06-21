// Tourist Dungeon — TD_RESOLVE: the PURE, deterministic resolution core. No DOM, no render, no
// timers. This is the single source of truth for two systems' math:
//   (1) COMBAT — attack / damage / hp / death (the current game uses fixed damage, no rolls, so it
//       is already deterministic; a TD_RNG seed can be threaded later without changing these ops).
//   (2) SMASH-AND-GRAB — the greed / weight / loot-value / collapse / slab / escape resolution,
//       lifted out of smashgrab.js so it operates on an explicit state object (many independent
//       runs can coexist — that is what the headless balance sim needs).
// mapmode.js and smashgrab.js call INTO this module; they no longer own the math. Gate 1 EXTRACTS
// and MEASURES only — not one combat/loot number changed here vs. where it used to live.
//
// Runtime-agnostic: assigns global TD_RESOLVE (browser/headless-Chrome) and module.exports (Node).
"use strict";

var TD_RESOLVE = (function () {
  // ============================ COMBAT (pure) ============================
  var COMBAT = {
    PLAYER_DMG: 20, FALL_DMG: 25, STARVE_HP: 2, EXHAUST_HP: 1,
    // creature stats (the single source of truth; glyph/name are content carried alongside)
    // GATE 1 R2 calibration: creature DMG tuned down ~0.70 (8->6, 16->11, 11->8) so the live
    // two-function descent combat is winnable by skill (sim: ~50% survive a floor, in the 40-60 band)
    // rather than ~6% brutal. HP unchanged (lowering it shifts the smash-grab escape band). PLAYER_DMG/
    // GEAR unchanged. Numbers never reach the player (feel-words only).
    // GATE 3 FIRST BESTIARY — ~a dozen real foes with a TEN-STAT block + roster gear, so blade-accuracy,
    // impact-crush, and the tier-4 crush-tell ACTIVATE against varied armour/evasion. `arche` is the
    // behaviour key (mapmode creaturesStep); `weapon`/`armor` index TD_RESOLVE.GEAR; hp is the pool, dmg
    // the legacy-flat fallback. Numbers never reach the player (mapmode reads stats; tells are feel-words).
    // wanderer/lurker/chaser hp/dmg kept (Gate 1 calibrated); the rest are new distinct identities.
    // GATE 4 R5 — FIRST BESTIARY of ~two dozen across the STRENGTH x SPEED grid. Each: ten-stat block,
    // roster gear, behaviour `arche`, glyph, Bureau name, and a depth `band` (the floor it starts
    // appearing — the R4 spawn table shifts the MIX toward higher bands with depth). `firstStrike` glass
    // cannons strike on contact (they threaten before dying). `tooTough` = out-of-depth must-flee foes
    // (telegraphed). Numbers never reach the player (mapmode reads stats; tells are feel-words).
    CREATURES: {
      // ---- BAND 1: floor-1 fodder (weak; teach the verbs) ----
      gnat:     { band: 1, hp: 10, dmg: 5,  name: "a gnat-clerk",            glyph: "i", arche: "rush",     weapon: "dagger",     armor: "unarmored", firstStrike: true,
                  stats: { might: 360, dex: 640, con: 300, int: 300, per: 460, lucky: 520, intuition: 420, appearance: 360, charm: 300, grit: 360 } },
      wanderer: { band: 1, hp: 30, dmg: 6,  name: "a shuffling nocent thing",glyph: "r", arche: "drift",    weapon: "dagger",     armor: "unarmored",
                  stats: { might: 450, dex: 460, con: 470, int: 300, per: 420, lucky: 500, intuition: 380, appearance: 380, charm: 300, grit: 420 } },
      usher:    { band: 1, hp: 24, dmg: 8,  name: "a brisk usher",           glyph: "u", arche: "pursue",   weapon: "shortsword", armor: "unarmored",
                  stats: { might: 500, dex: 540, con: 460, int: 360, per: 500, lucky: 500, intuition: 440, appearance: 460, charm: 440, grit: 460 } },
      chaser:   { band: 1, hp: 26, dmg: 8,  name: "a fervent docent",        glyph: "d", arche: "pursue",   weapon: "dagger",     armor: "unarmored",
                  stats: { might: 490, dex: 640, con: 430, int: 300, per: 480, lucky: 500, intuition: 420, appearance: 400, charm: 300, grit: 460 } },
      // ---- BAND 2: the ramp begins (evasive, ambush, a tank, a glass nipper) ----
      lurker:   { band: 2, hp: 45, dmg: 11, name: "a patient lurker",        glyph: "L", arche: "ambush",   weapon: "shortsword", armor: "light",
                  stats: { might: 520, dex: 500, con: 540, int: 320, per: 520, lucky: 500, intuition: 460, appearance: 400, charm: 300, grit: 480 } },
      cutpurse: { band: 2, hp: 24, dmg: 9,  name: "a quick-fingered cutpurse",glyph: "c", arche: "skirmish", weapon: "sabre",     armor: "unarmored",
                  stats: { might: 470, dex: 760, con: 420, int: 360, per: 560, lucky: 560, intuition: 480, appearance: 420, charm: 360, grit: 440 } },
      nipper:   { band: 2, hp: 16, dmg: 13, name: "a nipper",                glyph: "n", arche: "rush",     weapon: "dagger",     armor: "unarmored", firstStrike: true,
                  stats: { might: 640, dex: 560, con: 320, int: 280, per: 440, lucky: 460, intuition: 380, appearance: 340, charm: 300, grit: 480 } },
      porter:   { band: 2, hp: 52, dmg: 9,  name: "a laden porter",          glyph: "P", arche: "slow",     weapon: "mace",       armor: "light",
                  stats: { might: 560, dex: 360, con: 620, int: 320, per: 420, lucky: 480, intuition: 380, appearance: 420, charm: 360, grit: 540 } },
      sentry:   { band: 2, hp: 44, dmg: 8,  name: "a corridor sentry",       glyph: "y", arche: "hold",     weapon: "spear",      armor: "light",
                  stats: { might: 500, dex: 440, con: 560, int: 360, per: 540, lucky: 480, intuition: 440, appearance: 420, charm: 340, grit: 560 } },
      // ---- BAND 3: real threats (armoured, glass cannon, evasive) ----
      drone:    { band: 3, hp: 34, dmg: 10, name: "a sanctioned drone",      glyph: "s", arche: "slow",     weapon: "mace",       armor: "medium",
                  stats: { might: 520, dex: 380, con: 560, int: 300, per: 440, lucky: 480, intuition: 380, appearance: 400, charm: 300, grit: 520 } },
      duelist:  { band: 3, hp: 30, dmg: 11, name: "a fencing clerk",         glyph: "f", arche: "pursue",   weapon: "longsword",  armor: "light",
                  stats: { might: 540, dex: 660, con: 480, int: 380, per: 540, lucky: 520, intuition: 460, appearance: 460, charm: 400, grit: 500 } },
      skirling: { band: 3, hp: 26, dmg: 10, name: "a skirling thief",        glyph: "k", arche: "skirmish", weapon: "sabre",      armor: "unarmored",
                  stats: { might: 500, dex: 800, con: 420, int: 380, per: 580, lucky: 560, intuition: 500, appearance: 420, charm: 380, grit: 460 } },
      penitent: { band: 3, hp: 20, dmg: 16, name: "a frenzied penitent",     glyph: "p", arche: "rush",     weapon: "axe",        armor: "unarmored", firstStrike: true,
                  stats: { might: 680, dex: 480, con: 360, int: 280, per: 420, lucky: 460, intuition: 360, appearance: 360, charm: 280, grit: 560 } },
      bailiff:  { band: 3, hp: 52, dmg: 12, name: "a ward bailiff",          glyph: "B", arche: "slow",     weapon: "axe",        armor: "medium",
                  stats: { might: 600, dex: 400, con: 620, int: 340, per: 460, lucky: 480, intuition: 400, appearance: 440, charm: 360, grit: 580 } },
      // ---- BAND 4: heavy ground (armoured bruiser, fast harrier, tank, blocker) ----
      enforcer: { band: 4, hp: 42, dmg: 14, name: "a Bureau enforcer",       glyph: "E", arche: "slow",     weapon: "mace",       armor: "heavy",
                  stats: { might: 580, dex: 360, con: 660, int: 340, per: 440, lucky: 480, intuition: 400, appearance: 440, charm: 340, grit: 600 } },
      warden:   { band: 4, hp: 50, dmg: 7,  name: "a turnstile warden",      glyph: "T", arche: "hold",     weapon: "pike",       armor: "medium",
                  stats: { might: 520, dex: 420, con: 680, int: 360, per: 520, lucky: 480, intuition: 440, appearance: 440, charm: 340, grit: 640 } },
      harrier:  { band: 4, hp: 32, dmg: 12, name: "a harrier",              glyph: "h", arche: "skirmish", weapon: "sabre",      armor: "light",
                  stats: { might: 540, dex: 820, con: 460, int: 360, per: 600, lucky: 540, intuition: 520, appearance: 440, charm: 380, grit: 500 } },
      revenant: { band: 4, hp: 58, dmg: 12, name: "a revenant clerk",        glyph: "R", arche: "pursue",   weapon: "longsword",  armor: "medium",
                  stats: { might: 580, dex: 560, con: 640, int: 360, per: 500, lucky: 480, intuition: 440, appearance: 440, charm: 360, grit: 580 } },
      // ---- BAND 5: deep danger + the first must-flee out-of-depth foe ----
      marshal:  { band: 5, hp: 64, dmg: 14, name: "a ward marshal",          glyph: "M", arche: "slow",     weapon: "warhammer",  armor: "heavy",
                  stats: { might: 660, dex: 380, con: 700, int: 380, per: 480, lucky: 480, intuition: 420, appearance: 460, charm: 400, grit: 660 } },
      inquisitor:{ band: 5, hp: 38, dmg: 18, name: "an inquisitor",          glyph: "Q", arche: "rush",     weapon: "halberd",    armor: "light",   firstStrike: true,
                  stats: { might: 760, dex: 560, con: 460, int: 420, per: 560, lucky: 500, intuition: 520, appearance: 480, charm: 440, grit: 640 } },
      shade:    { band: 5, hp: 48, dmg: 14, name: "a deep shade",            glyph: "S", arche: "skirmish", weapon: "longsword",  armor: "light",
                  stats: { might: 600, dex: 860, con: 520, int: 420, per: 640, lucky: 560, intuition: 560, appearance: 420, charm: 360, grit: 560 } },
      juggernaut:{ band: 5, hp: 95, dmg: 16, name: "a Bureau juggernaut",    glyph: "J", arche: "slow",     weapon: "warhammer",  armor: "heavy",   tooTough: true,
                  stats: { might: 720, dex: 340, con: 800, int: 360, per: 460, lucky: 480, intuition: 420, appearance: 480, charm: 400, grit: 720 } },
      // ---- BAND 6: the deep — out-of-depth must-flee colossus ----
      colossus: { band: 6, hp: 120, dmg: 15, name: "a plated colossus",      glyph: "C", arche: "hold",     weapon: "pike",       armor: "heavy",   tooTough: true,
                  stats: { might: 760, dex: 360, con: 900, int: 360, per: 500, lucky: 480, intuition: 440, appearance: 500, charm: 420, grit: 760 } }
    }
  };
  // one blow against a target: returns its new hp (floored at 0) and whether it died
  function strike(targetHp, dmg) { var hp = targetHp - dmg; return { hp: hp < 0 ? 0 : hp, killed: hp <= 0 }; }
  // damage applied to the player (or any hp pool): new hp + whether it reached 0
  function applyDamage(hp, amount) { var n = hp - amount; return { hp: n < 0 ? 0 : n, dead: n <= 0 }; }
  // turns-to-kill at a fixed per-hit damage (deterministic combat => exact)
  function ttk(hp, perHit) { return perHit > 0 ? Math.ceil(hp / perHit) : Infinity; }

  // ============= TWO-FUNCTION COMBAT MODEL (combat track) =============
  // RATIFIED structure: combat-canon-v0.1.md + character-canon-v1.3.md. HIT (accuracy vs evasion,
  // gap-scaled + Lucky's universal thumb) is SEPARATE from DAMAGE (Might + weapon - armor robustness,
  // deterministic; rare crit; de-minimis if armor eats it). Reads the ten-stat spine via TD_STATS
  // (internal numbers; the player sees FEEL-WORDS only). ALL MAGNITUDES ARE PLACEHOLDER — the
  // balance-sim calibrates them; this aligns STRUCTURE to canon, not values. Do NOT hand-tune.
  // STUB gear only (one weapon per TYPE + the armor dial) — the dozen-weapon roster is the next
  // directive. Live wire-in to mapmode (creatures carry stat blocks) lands in the descent-slice pass;
  // the legacy flat PLAYER_DMG path above stays until then.
  var GEAR = {
    // three gross weapon TYPES (player-simple; ~a dozen live under them, rostered next). Each carries
    // a type-VERB and a lean: Blades -> accuracy/HIT · Heavy-Impact -> crush robustness/DAMAGE ·
    // Polearms -> reach/positioning. Ranged + unarmed DEFERRED.
    WEAPON_TYPES: {
      blade:   { verb: "cut",     lean: "accuracy->HIT" },
      impact:  { verb: "crush",   lean: "crush-robustness->DAMAGE" },
      polearm: { verb: "skewer",  lean: "reach->positioning" }
    },
    // THE ROSTER (~a dozen, under the 3 types). Each: { name, type, base, acc, weight, bulk } +
    // type-verb fields. ALL VALUES PLACEHOLDER (balance-sim calibrates). weight+bulk feed the
    // encumbrance bands (wire-in NEXT). Verbs wired: blades add acc in hit(); impact's `crush`
    // reduces the defender's effective robustness in damage(); polearms carry `reach` + an
    // `opening` strike (now-resolvable on the first exchange) — full positioning is a LIVE HOOK.
    // GATE 7 (A): each weapon declares `hands` (1 = one-handed, 2 = two-handed, takes both hands).
    WEAPONS: {
      // BLADES — fast, light, accuracy-leaning -> HIT
      dagger:     { name: "a dagger",      type: "blade",   base: 6,  acc: 5,  weight: 1, bulk: 1, hands: 1, verb: "cut",    firstStrike: true },  // lightest, highest acc, lowest base; first-strike (initiative HOOK)
      shortsword: { name: "a shortsword",  type: "blade",   base: 9,  acc: 3,  weight: 2, bulk: 2, hands: 1, verb: "cut" },
      longsword:  { name: "a longsword",   type: "blade",   base: 12, acc: 2,  weight: 4, bulk: 3, hands: 1, verb: "cut" },
      sabre:      { name: "a sabre",       type: "blade",   base: 10, acc: 4,  weight: 3, bulk: 2, hands: 1, verb: "cut" },
      // HEAVY / IMPACT — slow, heavy, Might-leaning -> DAMAGE (crush: armour robustness counts for less)
      mace:       { name: "a mace",        type: "impact",  base: 14, acc: -1, weight: 6, bulk: 4, hands: 1, verb: "crush",  crush: 0.6 },   // GATE 2 R3: impact base nudged so DAMAGE/burst wins the tanky foe (lurker) without dominating
      warhammer:  { name: "a warhammer",   type: "impact",  base: 17, acc: -3, weight: 9, bulk: 6, hands: 2, verb: "crush",  crush: 0.4 },  // heaviest: biggest crush + encumbrance; TWO-HANDED
      axe:        { name: "an axe",        type: "impact",  base: 15, acc: -1, weight: 6, bulk: 4, hands: 1, verb: "crush",  crush: 0.55 },
      flail:      { name: "a flail",       type: "impact",  base: 14, acc: -2, weight: 7, bulk: 5, hands: 1, verb: "crush",  crush: 0.5 },
      // POLEARMS — reach -> POSITIONING (opening strike now-resolvable; full positioning a HOOK); all TWO-HANDED
      spear:      { name: "a spear",       type: "polearm", base: 15, acc: 1,  weight: 4, bulk: 5, hands: 2, verb: "skewer", reach: true, opening: 3 },  // GATE 4 R2: +1 base so the reach GENERALIST wins the NORMAL foe (its niche); full positioning edge still a deferred spatial HOOK
      halberd:    { name: "a halberd",     type: "polearm", base: 16, acc: 0,  weight: 7, bulk: 6, hands: 2, verb: "skewer", reach: true, opening: 2 },
      pike:       { name: "a pike",        type: "polearm", base: 14, acc: 0,  weight: 8, bulk: 8, hands: 2, verb: "skewer", reach: true, opening: 4 }   // longest reach -> biggest opening
    },
    // ARMOR — ONE MASTER DIAL, light <-> bulky (4 named tiers). The single dial position drives BOTH
    // together: bulkier = more robustness (damage-reduction) AND more encumbrance (worse evasion ->
    // easier to hit). That coupling IS the tradeoff. DURABILITY DROPPED (no wear, no repair sink).
    // Values PLACEHOLDER (balance-sim calibrates). `none` aliases `unarmored` for back-compat.
    // GATE 2 ARMOUR CONTENT — four NAMED tiers along the one light<->bulky dial (civilian -> official).
    // CONTENT ONLY: robustness/encumbrance are QB's placeholder magnitudes (UNTOUCHED here). NO durability
    // field (dropped — canon). `tierName`/`bulkReadout`/crushTell are VERBATIM from the directive; the
    // wear/examine/weightFeel/struckFeel strings are DRAFT in the municipal Bureau register, PENDING the
    // verbatim §2 text (data — swap in trivially when §2 lands). `name` kept for back-compat (combat/tests).
    ARMOR: {
      unarmored: { tier: 1, name: "unarmoured", tierName: "Attire As Presented", bulkReadout: "Unhindered", robustness: 0, encumbrance: 0,
        wear: "You go as you came. The Bureau notes Attire As Presented and declines to comment.",                 // DRAFT pending §2
        examine: "Your own clothes, logged as 'Attire As Presented.' They flatter no one and stop nothing.",        // DRAFT pending §2
        weightFeel: "nothing worth the mention",                                                                    // DRAFT pending §2
        struckFeel: "Nothing stands between you and the world; the world notices." },                               // DRAFT pending §2
      light: { tier: 2, name: "padded leather", tierName: "Visitor's Padding (Issued)", bulkReadout: "Cushioned", robustness: 3, encumbrance: 1,
        wear: "You shrug into the Visitor's Padding, Issued — faintly damp, and certain it has met worse than you.", // DRAFT pending §2
        examine: "Quilted municipal padding, Issued to every ticketed guest. It has stopped worse, and says so.",   // DRAFT pending §2
        weightFeel: "a coat's worth, no more",                                                                      // DRAFT pending §2
        struckFeel: "The padding takes the blow and complains softly on your behalf." },                            // DRAFT pending §2
      medium: { tier: 3, name: "mail", tierName: "Protective Equipment, Sanctioned", bulkReadout: "Shelled", robustness: 6, encumbrance: 3,
        wear: "You buckle on the Sanctioned Protective Equipment. The straps know their business better than you.",  // DRAFT pending §2
        examine: "Sanctioned Protective Equipment, per regulation. Heavier promises; it intends to keep them.",     // DRAFT pending §2
        weightFeel: "a steady, earned weight",                                                                      // DRAFT pending §2
        struckFeel: "The blow lands on sanctioned steel and is told to wait its turn." },                           // DRAFT pending §2
      heavy: { tier: 4, name: "plate", tierName: "Regulation Plate (Ceremonial)", bulkReadout: "Encased", robustness: 10, encumbrance: 6,
        wear: "You don the Regulation Plate. Ceremonial, they insist — though it has seen ceremonies end badly.",   // DRAFT pending §2
        examine: "Full Regulation Plate, Ceremonial grade. It encases you in the Bureau's own idea of safety.",     // DRAFT pending §2
        weightFeel: "the weight of an office you did not apply for",                                                // DRAFT pending §2
        struckFeel: "The blow rings off the Regulation Plate and the courtyard hears it.",                          // DRAFT pending §2
        crushTell: "you feel the shell give inward" }                                                               // VERBATIM (directive R3 crush-tell)
    }
  };
  GEAR.ARMOR.none = GEAR.ARMOR.unarmored;   // alias so older callers (fighter default, tests) keep working

  // GATE 7 (A) — MULTI-SLOT EQUIPMENT. Eleven slots; nine worn + two hands. The single armour dial is
  // reversed into per-slot PIECES whose robustness/encumbrance/weight AGGREGATE (sum) into the same
  // totals the combat already reads (no combat-math change). A FULL MATCHING SET of one tier reproduces
  // that tier's OLD total (the Gate 1/4 calibration holds). DURABILITY DROPPED; MAGIC DEFERRED — accessory
  // slots (neck/rings) are mundane and carry no effect yet (FLAGGED: girdle->carry / boots->minor-evasion
  // mundane accessory effects deferred with the item-effect layer). Foes are UNCHANGED (single weapon/armor).
  GEAR.SLOTS = ["head", "body", "hands", "feet", "neck", "ringL", "ringR", "waist", "back", "rightHand", "leftHand"];
  GEAR.WORN = ["head", "body", "hands", "feet", "neck", "ringL", "ringR", "waist", "back"];   // everything not a hand
  var ARMOR_SLOTS = {   // each protective slot's SHARE of a tier's rob/enc/weight (sums to ~1.0 -> a full set = the tier)
    body:  { share: 0.50, noun: { light: "a padded jerkin", medium: "a mail hauberk", heavy: "a plate cuirass" } },
    head:  { share: 0.20, noun: { light: "a padded coif", medium: "a mail coif", heavy: "a plate helm" } },
    hands: { share: 0.10, noun: { light: "padded gloves", medium: "mail mittens", heavy: "plate gauntlets" } },
    feet:  { share: 0.10, noun: { light: "soft boots", medium: "mail-shod boots", heavy: "steel sabatons" } },
    waist: { share: 0.05, noun: { light: "a cloth girdle", medium: "a studded belt", heavy: "a plate fauld" } },
    back:  { share: 0.05, noun: { light: "a travelling cloak", medium: "a weighted cloak", heavy: "a mantle of plates" } }
  };
  var DUAL_ACC = 3, DUAL_ENC = 1;   // dual-wield: modest off-hand offense at an accuracy + encumbrance(-evasion) cost
  function armorPiece(slot, tier) {
    var def = ARMOR_SLOTS[slot]; if (!def) return null;
    var T = GEAR.ARMOR[tier] || GEAR.ARMOR.light, sh = def.share;
    return { kind: "armor", slot: slot, tier: tier, name: def.noun[tier] || (tier + " " + slot),
      robustness: T.robustness * sh, encumbrance: T.encumbrance * sh, weight: Math.max(1, Math.round(T.encumbrance * sh * 3 + 1)),
      bulkReadout: T.bulkReadout, struckFeel: T.struckFeel, crushTell: T.crushTell };
  }
  // aggregate a player's equipment into the {weapon, armor} the combat reads. Worn pieces sum their
  // robustness/encumbrance; the primary weapon is the right hand (else left); two 1H weapons dual-wield
  // (effective base = primary + a fraction of the off-hand, at an accuracy + encumbrance cost — SHALLOW by
  // design; deep second-attack mechanics are FLAGGED out of scope). Empty hands -> bare fists.
  function aggregate(eq) {
    eq = eq || {};
    var rob = 0, enc = 0, wt = 0, heavyWorn = false;
    GEAR.WORN.forEach(function (s) { var p = eq[s]; if (p) { rob += p.robustness || 0; enc += p.encumbrance || 0; wt += p.weight || 0; if (p.tier === "heavy") heavyWorn = true; } });
    var rh = eq.rightHand, lh = eq.leftHand, primary = rh || lh || null, dual = false;
    var weapon = primary || { name: "your fists", type: "blade", base: 2, acc: 0, hands: 1, verb: "strike" };
    if (rh && lh && rh !== lh && (rh.hands || 1) === 1 && (lh.hands || 1) === 1) {
      dual = true; var off = lh;
      weapon = { name: rh.name + " (and " + off.name + ")", type: rh.type, base: rh.base + Math.round((off.base || 0) * 0.35),
        acc: (rh.acc || 0) - DUAL_ACC, verb: rh.verb, crush: rh.crush, reach: rh.reach, opening: rh.opening, hands: 1, dual: true };
      enc += DUAL_ENC;
    }
    if (primary) wt += primary.weight || 0;
    return { weapon: weapon, armor: { name: "worn gear", robustness: rob, encumbrance: enc, heavy: heavyWorn, crushTell: heavyWorn ? GEAR.ARMOR.heavy.crushTell : null }, weight: wt, dual: dual };
  }
  // a fresh starting loadout: a full armour set of `tier` (null/"unarmored" = no armour) + a weapon
  // (2H fills both hands). Used by freshCharacter (quick-start) and the Gate 6 background intake.
  function startingSet(tier, weaponKey) {
    var eq = { head: null, body: null, hands: null, feet: null, neck: null, ringL: null, ringR: null, waist: null, back: null, rightHand: null, leftHand: null };
    if (tier && tier !== "unarmored" && tier !== "none" && GEAR.ARMOR[tier]) ["head", "body", "hands", "feet", "waist", "back"].forEach(function (s) { eq[s] = armorPiece(s, tier); });
    var w = GEAR.WEAPONS[weaponKey];
    if (w) { eq.rightHand = w; if ((w.hands || 1) === 2) eq.leftHand = w; }
    return eq;
  }
  GEAR.armorPiece = armorPiece; GEAR.aggregate = aggregate; GEAR.startingSet = startingSet;
  // a single feel-word for total worn bulk (the dossier readout), matching the old four dial stops.
  GEAR.bulkWord = function (rob) { return rob <= 0 ? "Unhindered" : rob <= 4 ? "Cushioned" : rob <= 8 ? "Shelled" : "Encased"; };

  function _S() { return (typeof TD_STATS !== "undefined") ? TD_STATS : null; }
  var ENC_EV_PENALTY = 2.5;   // GATE 4 R2: armour encumbrance -> evasion penalty multiplier. Heavy (enc6) => -15 EV, enough to cancel even a high-Dex dodge: you pick light-and-dodge OR heavy-and-absorb, never both.
  function fighter(stats, weapon, armor) { return { stats: stats, weapon: weapon || GEAR.WEAPONS.longsword, armor: armor || GEAR.ARMOR.none }; }

  // HIT: gap = attacker accuracy - defender evasion. The roll is GAP-SCALED — a clear gap is reliable
  // (sigmoid saturates), a close gap is swingy (~50/50). Lucky adds its bounded +/-10% thumb. PLACEHOLDER.
  // opts.opening (first exchange): a POLEARM's reach lands an opening strike (acc bonus). Full
  // positioning (reach controlling spacing across the fight) is a LIVE HOOK for the spatial wire-in.
  function hit(att, def, rng, opts) {
    var S = _S(); if (!S) return { hit: true, p: 1, gap: 0 };
    var acc = S.DERIVED.accuracy(att.stats) + ((att.weapon && att.weapon.acc) || 0);
    if (opts && opts.opening && att.weapon && att.weapon.reach) acc += (att.weapon.opening || 0);   // polearm opening strike
    var eva = S.DERIVED.evasion(def.stats) - ((def.armor && def.armor.encumbrance) || 0) * ENC_EV_PENALTY;   // GATE 4 R2: bulky armour dulls evasion HARD — no EV+AC stacking (heavy negates the dodge)
    var gap = acc - eva;
    var p = 1 / (1 + Math.exp(-gap * 0.15));                       // PLACEHOLDER slope: clear gap -> reliable, gap~0 -> swingy
    p = Math.max(0.02, Math.min(0.98, p + S.luckyThumb(att.stats)));   // Lucky's universal thumb (+/-10% human)
    var roll = rng ? rng.next() : 0.5;
    return { hit: roll < p, p: p, gap: gap };
  }

  // DAMAGE (on a hit): deterministic Might + weapon - armor robustness; a rare crit SPIKE; a hit may
  // land for DE MINIMIS (1) when armour eats the blow. PLACEHOLDER magnitudes.
  function damage(att, def, rng) {
    var S = _S();
    var raw = ((att.weapon && att.weapon.base) || 0) + (S ? S.DERIVED.damageBonus(att.stats) : 0);
    // Heavy/Impact weapons CRUSH armour robustness (it counts for less) -> their lean is DAMAGE.
    var rob = ((def.armor && def.armor.robustness) || 0) * ((att.weapon && att.weapon.crush != null) ? att.weapon.crush : 1);
    var crit = rng ? (rng.next() < 0.05) : false;                  // PLACEHOLDER crit rate
    if (crit) raw = Math.round(raw * 1.5);
    var dmg = Math.round(raw - rob), deMinimis = false;            // whole HP (crush can make robustness fractional)
    if (dmg < 1) { dmg = raw > 0 ? 1 : 0; deMinimis = true; }      // armour ate it -> a hit still lands for de minimis
    return { damage: dmg, crit: crit, deMinimis: deMinimis };
  }

  // THE READ: Per PERCEIVES (OBJ, honest — vague-not-false at low Per; eyes miss, never lie); Intuition
  // INTERPRETS (SUBJ confidence — can MISLEAD at low Intuition). Surfaced as FEEL-WORDS, never numbers.
  var THREAT_WORDS = ["harmless", "slight", "an even match", "dangerous", "deadly", "overwhelming"];
  function _threatBand(v) { var t = 0, B = [-999, -8, -2, 4, 12, 22]; for (var i = 0; i < B.length; i++) if (v >= B[i]) t = i; return t; }
  function read(observer, target, rng) {
    var S = _S(); if (!S) return { seen: { channel: "seen", obj: "OBJ", word: "unknown" }, sense: { channel: "intuition", obj: "SUBJ", word: "unsure" } };
    var threat = ((target.weapon && target.weapon.base) || 0) + S.DERIVED.damageBonus(target.stats) + S.DERIVED.accuracy(target.stats);
    var trueBand = _threatBand(threat);
    var per = S.DERIVED.perceive(observer.stats), intu = S.DERIVED.interpret(observer.stats);
    // OBJ (Per): the true band, hedged-but-never-false at low Per (vague, not wrong).
    var hedge = per < 350;
    var seen = { channel: "seen", obj: "OBJ", word: THREAT_WORDS[trueBand], vague: hedge };
    // SUBJ (Intuition): a judgment. High Intuition -> matches truth; LOW Intuition -> may drift a band (mislead).
    var senseBand = trueBand, confident = intu >= 670;
    if (intu < 500) { var drift = rng ? (rng.next() < (500 - intu) / 700 ? (rng.next() < 0.5 ? -1 : 1) : 0) : 0; senseBand = Math.max(0, Math.min(THREAT_WORDS.length - 1, trueBand + drift)); }
    var sense = { channel: "intuition", obj: "SUBJ", word: THREAT_WORDS[senseBand], confident: confident, reliable: senseBand === trueBand };
    return { seen: seen, sense: sense };
  }

  // ====================== SMASH-AND-GRAB (pure) ======================
  var SG = (function () {
    var TUNE = {
      // ---- CALIBRATED (post-Gate-1 balance pass). The slab (timer) is the primary generic threat;
      // the collapse is DEMOTED to a conditional edge that only catches runs SLOWED by a fight (it does
      // not chase a clean sprinter — DELAY ~6 ticks of head-start), and a stronger footrace rate is
      // reserved for the chasm SET-PIECE. These two split the deaths so no single cause dominates. ----
      ESCAPE_TURNS: 17,        // slab-door budget: ticks to fully seal the slab ahead (THE primary generic threat)
      WEIGHT_PER_TREASURE: 2,  // each grabbed treasure adds this much LOAD
      SPRINT_THRESHOLD: 2,     // LOAD strictly above this => SPRINT disabled. Cautious can keep ONE treasure light.
      HEAVY_PACE: 1.165,       // ticks/move when over-loaded (vs 1 sprinting) — the weight-as-pressure term
      COLLAPSE_SETPIECE: false,    // the chasm set-piece flips this true to use the strong footrace rate below
      COLLAPSE_DELAY: 5.9,         // head-start before the edge advances — long enough that a clean run outpaces it
      COLLAPSE_RATE: 0.88,         // generic edge speed — catches runs that LOST TIME (a fight), not clean sprinters
      COLLAPSE_RATE_SETPIECE: 1.0, // strong footrace speed, reserved for the chasm/collapse set-piece only
      TREMOR: "hard",          // grab/seal shake severity: soft | med | hard
      LOOT: null               // optional per-treasure VALUE override (array, in TREAS order); else TREASVAL
    };
    var RECOVERY_DEPTH = 3;
    // Loot is valued for GREED-BY-QUANTITY: near-flat values so carrying MORE (greedy) banks more than
    // carrying the best two (cautious). A steep "richest-deep" gradient is reserved for set-pieces — under
    // a steep gradient the cautious top-two haul rivals the greedy total and greed cannot pay (calibration).
    var TREASVAL = { "6,5": 25, "6,10": 25, "15,5": 25, "15,10": 25 };
    var ROWS = [
      "###############################",
      "#####..............############",
      "#####..............############",
      "#####......~.......############",
      "#####......~.......############",
      "#####.$....~...$...############",
      "#####......~.......############",
      "#@.........~............=....>#",
      "#####......~.......############",
      "#####......~.A..B..############",
      "#####.$....~...$...############",
      "#####......~.......############",
      "#####......~.......############",
      "#####..............############",
      "###############################"
    ];
    var TELLS = [
      "A cold draft pours up out of the split in the chamber floor; the Bureau does not heat a room it expects you to leave.",
      "Scratched by the lip of the chasm, a rhyme half-rubbed away: 'take but the one, and run, and run.'",
      "Above the escape passage hangs a slab on a worn iron pin — it has dropped before."
    ];
    var ARTNAMES = { A: "the Reliquary Ledger", B: "the Brass Astrolabe" };

    var W = ROWS[0].length, H = ROWS.length;
    function baseTile(x, y) { return (y >= 0 && y < H && x >= 0 && x < W) ? ROWS[y][x] : "#"; }
    var ENTRY = null, EXIT = null, SLAB = null, ARTS = [], TREAS = [], CREV = [];
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var c = ROWS[y][x];
      if (c === "@") ENTRY = { x: x, y: y };
      else if (c === ">") EXIT = { x: x, y: y };
      else if (c === "=") SLAB = { x: x, y: y };
      else if (c === "A" || c === "B") ARTS.push({ id: c, x: x, y: y });
      else if (c === "$") TREAS.push({ x: x, y: y });
      else if (c === "~") CREV.push({ x: x, y: y });
    }

    function newState() {
      return {
        active: false, player: { x: ENTRY.x, y: ENTRY.y },
        arts: ARTS.map(function (a) { return { id: a.id, name: ARTNAMES[a.id], x: a.x, y: a.y, taken: false, fallen: false }; }),
        treas: TREAS.map(function (t, i) { return { x: t.x, y: t.y, taken: false, value: (TUNE.LOOT && TUNE.LOOT[i] != null) ? TUNE.LOOT[i] : (TREASVAL[t.x + "," + t.y] || 5) }; }),
        load: 0, score: 0, tripped: false, doorClosed: 0, carried: null, treasCarried: 0,
        passedSlab: false, dead: false, escaped: false, swallowed: false, fallenPending: null, runs: 0,
        origin: null, dist: null
      };
    }

    function sealed(S) { return S.tripped && S.doorClosed >= TUNE.ESCAPE_TURNS; }
    function frontier(S) { var rate = TUNE.COLLAPSE_SETPIECE ? TUNE.COLLAPSE_RATE_SETPIECE : TUNE.COLLAPSE_RATE; return S.tripped ? Math.max(0, (S.doorClosed - TUNE.COLLAPSE_DELAY)) * rate : -1; }
    function distAt(S, x, y) { return S.dist ? S.dist[x + "," + y] : undefined; }
    function rubble(S, x, y) { if (!S.tripped || !S.dist) return false; var d = S.dist[x + "," + y]; return (d !== undefined) && d <= frontier(S); }
    function playerLead(S) { var d = distAt(S, S.player.x, S.player.y); return (d === undefined) ? 99 : (d - frontier(S)); }

    function walkBase(S, x, y) {
      var c = baseTile(x, y);
      if (c === "#" || c === "~") return false;
      if (SLAB && x === SLAB.x && y === SLAB.y && sealed(S)) return false;
      if (rubble(S, x, y)) return false;
      return true;
    }
    function computeDist(ox, oy) {
      var D = [[0, -1], [0, 1], [-1, 0], [1, 0]], dist = {}, q = [[ox, oy]]; dist[ox + "," + oy] = 0;
      while (q.length) {
        var c = q.shift(), cd = dist[c[0] + "," + c[1]];
        for (var i = 0; i < 4; i++) {
          var nx = c[0] + D[i][0], ny = c[1] + D[i][1], k = nx + "," + ny, t = baseTile(nx, ny);
          if (dist[k] !== undefined || t === "#" || t === "~") continue;
          dist[k] = cd + 1; q.push([nx, ny]);
        }
      }
      return dist;
    }
    function artAt(S, x, y) { for (var i = 0; i < S.arts.length; i++) { var a = S.arts[i]; if (!a.taken && !a.fallen && a.x === x && a.y === y) return a; } return null; }
    function treasAt(S, x, y) { for (var i = 0; i < S.treas.length; i++) { var t = S.treas[i]; if (!t.taken && t.x === x && t.y === y) return t; } return null; }
    function sprintable(S) { return S.load <= TUNE.SPRINT_THRESHOLD; }
    function doorRemaining(S) { var pace = sprintable(S) ? 1 : TUNE.HEAVY_PACE; return Math.max(0, Math.ceil((TUNE.ESCAPE_TURNS - S.doorClosed) / pace)); }
    function escapeLen() { return SLAB ? Math.abs(EXIT.x - SLAB.x) + Math.abs(SLAB.x - 19) : 0; }
    function tell(n) { return TELLS[((n || 0) % TELLS.length + TELLS.length) % TELLS.length]; }
    function over(S) { return !!(S && (S.dead || S.escaped)); }

    function trip(S) {
      if (S.tripped) return null;
      S.tripped = true; S.doorClosed = 0;
      S.origin = { x: S.player.x, y: S.player.y }; S.dist = computeDist(S.player.x, S.player.y);
      var fell = null;
      S.arts.forEach(function (a) { if (!a.taken && !a.fallen) { a.fallen = true; fell = a; } });
      if (fell) {
        var nearest = null, best = 1e9;
        CREV.forEach(function (c) { var d = Math.abs(c.x - fell.x) + Math.abs(c.y - fell.y); if (d < best) { best = d; nearest = c; } });
        if (nearest) { fell.x = nearest.x; fell.y = nearest.y; }
        S.fallenPending = { id: fell.id, name: fell.name, depth: RECOVERY_DEPTH };
      }
      return {
        tremor: true, severity: TUNE.TREMOR, tile: { x: S.player.x, y: S.player.y }, sfx: "grab",
        float: "EXPEDITED EGRESS, per ordinance.",
        fell: fell ? { id: fell.id, name: fell.name, x: fell.x, y: fell.y } : null,
        lines: ["The far wall buckles — the floor is COMING DOWN behind you, and a slab grinds loose ahead. RUN."].concat(
          fell ? [fell.name + " tumbles into the chasm, into the dark you could not cross. (You will find it again, deeper — level " + RECOVERY_DEPTH + ".)"] : [])
      };
    }

    function get(S) {
      if (!S.active || over(S)) return { got: false };
      var t = treasAt(S, S.player.x, S.player.y);
      if (t) { t.taken = true; S.treasCarried += 1; S.load += TUNE.WEIGHT_PER_TREASURE; S.score += t.value; return { got: true, treasure: true, value: t.value, score: S.score, sfx: "loot", load: S.load, sprintable: sprintable(S) }; }
      var a = artAt(S, S.player.x, S.player.y);
      if (!a) return { got: false };
      if (S.carried) return { got: false, reason: "You can carry only one artifact through a collapse." };
      a.taken = true; S.carried = { id: a.id, name: a.name };
      return { got: true, artifact: true, carried: S.carried, ev: trip(S) };
    }

    function move(S, dir) {
      if (!S.active || over(S)) return { moved: false };
      var D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], ul: [-1, -1], ur: [1, -1], dl: [-1, 1], dr: [1, 1] };
      var d = D[dir]; if (!d) return { moved: false };
      var nx = S.player.x + d[0], ny = S.player.y + d[1];
      if (!walkBase(S, nx, ny)) return { moved: false };
      S.player.x = nx; S.player.y = ny;
      var res = { moved: true, sfx: "step" };
      if (S.tripped && !over(S)) {
        var f0 = Math.floor(frontier(S));
        S.doorClosed += sprintable(S) ? 1 : TUNE.HEAVY_PACE;
        res.grind = true;
        res.crash = Math.floor(frontier(S)) > f0;
        res.lead = playerLead(S);
        res.proximity = Math.max(0, Math.min(1, 1 - res.lead / 8));
        if (SLAB && nx >= SLAB.x && ny === SLAB.y) S.passedSlab = true;
        if (nx === EXIT.x && ny === EXIT.y) {
          S.escaped = true; res.escaped = true; res.sfx = "chime"; res.carried = S.carried; res.score = S.score;
          res.lines = ["You roll clear of the passage as it folds shut behind you" + (S.carried ? ", " + S.carried.name + " still in hand." : ", empty-handed but breathing.") + (S.score ? " ESCAPED with $" + S.score + " in loot." : "")];
        } else if (playerLead(S) <= 0) {
          S.dead = true; S.swallowed = true; res.dead = true; res.sfx = "crash"; res.scoreLost = S.score;
          res.lines = ["The floor drops out from under you and the dark takes everything — the Bureau files it under 'reabsorbed, with effects.'" + (S.score ? " ($" + S.score + " lost.)" : "")];
        } else if (sealed(S) && !S.passedSlab) {
          S.dead = true; res.dead = true; res.sfx = "slam"; res.scoreLost = S.score;
          res.lines = ["The slab slams home across the passage. The Bureau records the cause as 'avarice, in excess of egress.'" + (S.score ? " ($" + S.score + " lost.)" : "")];
        }
      }
      res.doorRemaining = doorRemaining(S);
      return res;
    }

    function view(S) {
      return {
        w: W, h: H, base: baseTile,
        player: { x: S.player.x, y: S.player.y },
        arts: S.arts.map(function (a) { return { id: a.id, name: a.name, x: a.x, y: a.y, taken: a.taken, fallen: a.fallen }; }),
        treas: S.treas.map(function (t) { return { x: t.x, y: t.y, taken: t.taken, value: t.value }; }),
        crevasse: CREV.slice(), exit: { x: EXIT.x, y: EXIT.y }, entry: { x: ENTRY.x, y: ENTRY.y }, slab: SLAB ? { x: SLAB.x, y: SLAB.y } : null,
        tripped: S.tripped, sealed: sealed(S), doorClosed: S.doorClosed, doorProgress: TUNE.ESCAPE_TURNS ? Math.min(1, S.doorClosed / TUNE.ESCAPE_TURNS) : 0,
        doorRemaining: doorRemaining(S), escapeTurns: TUNE.ESCAPE_TURNS, escapeLen: escapeLen(),
        collapse: { active: S.tripped, frontier: Math.round(frontier(S) * 100) / 100, origin: S.origin, lead: S.tripped ? playerLead(S) : null, proximity: S.tripped ? Math.max(0, Math.min(1, 1 - playerLead(S) / 8)) : 0 },
        rubble: function (x, y) { return rubble(S, x, y); }, dist: function (x, y) { return distAt(S, x, y); },
        load: S.load, score: S.score, treasCarried: S.treasCarried, sprintable: sprintable(S), passedSlab: S.passedSlab, carried: S.carried,
        dead: S.dead, escaped: S.escaped, swallowed: S.swallowed, fallenPending: S.fallenPending, runs: S.runs
      };
    }

    return {
      TUNE: TUNE, TREASVAL: TREASVAL, ROWS: ROWS, RECOVERY_DEPTH: RECOVERY_DEPTH,
      layout: { W: W, H: H, ENTRY: ENTRY, EXIT: EXIT, SLAB: SLAB, ARTS: ARTS, TREAS: TREAS, CREV: CREV, baseTile: baseTile },
      newState: newState, over: over, tell: tell,
      sealed: sealed, frontier: frontier, distAt: distAt, rubble: rubble, playerLead: playerLead,
      walkBase: walkBase, computeDist: computeDist, sprintable: sprintable, doorRemaining: doorRemaining, escapeLen: escapeLen,
      trip: trip, get: get, move: move, view: view
    };
  })();

  return {
    COMBAT: COMBAT, strike: strike, applyDamage: applyDamage, ttk: ttk, SG: SG,
    GEAR: GEAR, fighter: fighter, hit: hit, damage: damage, read: read
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_RESOLVE; }
