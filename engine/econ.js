// Tourist Dungeon — TD_ECON: the town ECONOMY core (buy/sell, vault, posted tariffs, frictionful
// selling). PURE + DOM-free so it tests headless. Coins are weight (25/lb, via TD_BURDEN); value
// differs by denomination (1 gold = 10 silver = 100 copper). Spending/crediting RE-MINTS the purse
// greedily into the largest coins — so change comes back efficient (and lightest), and selling for
// copper genuinely weighs more than holding gold.
//
// TAX-AGNOSTIC by design: every price passes through applyReaction(price, reaction), which TODAY is
// the identity. The future INFATUATION TAX (a per-NPC swoon that bends a price) wires in THERE and
// nowhere else — no swoon logic is built now; the hook is reserved. (Directive PIN.)
//
// PRICES + BUYBACK + SERVICES are PLACEHOLDER, RED-PEN TUNABLE (flagged). The balance-sim calibrates.
"use strict";

var TD_ECON = (function () {
  var COIN = { gold: 100, silver: 10, copper: 1 };   // VALUE per coin (weight is denomination-blind; see TD_BURDEN)

  // ---- posted tariffs (TUNABLE PLACEHOLDER) — base BUY price in copper-equivalent value ----
  var PRICES = {
    // outfitting (descent gear)
    lantern: 60, rope: 24, torch: 6, dagger: 40, club: 28, sling: 30, buckler: 45, sack: 12, waterskin: 14,
    // apothecary (consumables)
    bandage: 16, tincture: 34, antidote: 28, salve: 22,
    // bodega / sundries
    ration: 8, hotdog: 5, biscuit: 4, candle: 3, twine: 5,
    // used-book store (research / lore)
    book: 26, map_scrap: 40, ledger: 55, pamphlet: 9
  };
  // buyback fractions (frictionful selling): a reputable shop pays POORLY; a fence pays WORSE (off-book).
  var BUYBACK = { shop: 0.40, fence: 0.25, bookstore: 0.35 };
  // RLD + civic SERVICES — a flat posted fee, paid at the counter/front (deadpan; no content modelled).
  var SERVICES = {
    rldservice: 35, palmreading: 18, membership: 60, redshop: 22,   // red-light district
    vaultfee: 0                                                      // the bank's vault is free to use (TUNABLE)
  };

  function clampInt(n) { return Math.max(0, Math.round(n || 0)); }

  // ---- purse arithmetic (value <-> coins) ----
  function value(purse) { purse = purse || {}; return (purse.gold || 0) * COIN.gold + (purse.silver || 0) * COIN.silver + (purse.copper || 0) * COIN.copper; }
  function mint(v) { v = clampInt(v); var g = Math.floor(v / 100); v -= g * 100; var s = Math.floor(v / 10); v -= s * 10; return { gold: g, silver: s, copper: v }; }
  function setPurse(purse, v) { var m = mint(v); purse.gold = m.gold; purse.silver = m.silver; purse.copper = m.copper; return purse; }
  function coinCount(purse) { purse = purse || {}; return (purse.gold || 0) + (purse.silver || 0) + (purse.copper || 0); }   // == weight in coin-mass units
  function canAfford(purse, cost) { return value(purse) >= clampInt(cost); }
  // spend: debit `cost` and re-mint; returns true on success, false (purse untouched) if too poor.
  function spend(purse, cost) { cost = clampInt(cost); if (value(purse) < cost) return false; setPurse(purse, value(purse) - cost); return true; }
  function credit(purse, amount) { setPurse(purse, value(purse) + clampInt(amount)); return purse; }

  // ---- RESERVED hook (tax-agnostic): a per-NPC reaction MAY one day bend a price. Identity for now. ----
  function applyReaction(price, reaction) { return clampInt(price); }   // FUTURE: infatuation tax folds in HERE only

  // ---- prices (posted BUY) + buyback (frictionful SELL) ----
  // an item's base value: explicit price > kind in PRICES > a floor of 1 (so loot is never worthless).
  function baseValue(item) {
    if (!item) return 0;
    if (typeof item.price === "number") return clampInt(item.price);
    if (typeof item.value === "number") return clampInt(item.value);
    if (item.kind && typeof PRICES[item.kind] === "number") return PRICES[item.kind];
    if (item.id && typeof PRICES[item.id] === "number") return PRICES[item.id];
    return 1;
  }
  function buyPrice(item, reaction) { return applyReaction(baseValue(item), reaction); }
  function sellPrice(item, where, reaction) {
    var bb = (typeof BUYBACK[where] === "number") ? BUYBACK[where] : BUYBACK.shop;
    return applyReaction(Math.max(1, Math.floor(baseValue(item) * bb)), reaction);
  }
  function servicePrice(id, reaction) { return applyReaction((typeof SERVICES[id] === "number") ? SERVICES[id] : 0, reaction); }

  // ===================================================================
  // SHOP-ECONOMY directive R1 — three ARCHETYPES + the offered-price model. ALL magnitudes below are
  // NAMED PLACEHOLDERS for QB calibration. The SPREAD is STRUCTURAL: a sell offer is clamped strictly
  // below the same item's buy price at the same shop, so no calibration can ever make sell >= buy.
  //   offered = base × spread(buy|sell) × specialty-fit × saturation(category) × Appearance × Charm(sell)
  // ===================================================================
  var ARCH = {
    // buyMul: what the player PAYS (>=1, at/above base). sellMul: what the player RECEIVES (a fraction).
    // fitBonus/offFit: specialty-fit multiplier on a SELL. refusesOff: specialty turns away off-category.
    specialty: { buyMul: 1.00, sellMul: 0.50, fitBonus: 1.15, offFit: 0.55, refusesOff: true,  haggle: true },
    fence:     { buyMul: 1.20, sellMul: 0.30, fitBonus: 1.00, offFit: 1.00, refusesOff: false, haggle: true },   // universal, low, NEVER refuses
    pawn:      { buyMul: 1.10, sellMul: 0.40, fitBonus: 1.00, offFit: 0.85, refusesOff: false, haggle: true, buyback: true }
  };
  // SATURATION — selling duplicates of a category floods it: each unit sold multiplies that category's
  // per-unit price by SAT.decay (ratcheting to SAT.floor); it recovers by SAT.recover per turn-tick and
  // SAT.perVisit when the player re-enters. State lives in the session (game.js); this is just the math.
  var SAT = { decay: 0.85, floor: 0.30, recover: 0.02, perVisit: 0.5, start: 1.0 };
  // APPEARANCE (baseline) + CHARM (sell/haggle) thumbs — a SMALL price nudge mapped from the 0..1000 stat.
  function statThumb(v, lo, hi) { v = (v == null ? 500 : v); return lo + (hi - lo) * Math.max(0, Math.min(1, v / 1000)); }
  function appearanceMul(stats) { return statThumb(stats && stats.appearance, 0.92, 1.08); }   // PLACEHOLDER band
  function charmMul(stats) { return statThumb(stats && stats.charm, 0.92, 1.12); }              // PLACEHOLDER band (sell only)

  // item -> coarse category (specialty shops trade ONE category; the fence trades all).
  var ITEM_CAT = {
    lantern: "outfitting", rope: "outfitting", torch: "outfitting", dagger: "outfitting", club: "outfitting", sling: "outfitting", buckler: "outfitting", sack: "outfitting", waterskin: "outfitting",
    bandage: "apothecary", tincture: "apothecary", antidote: "apothecary", salve: "apothecary",
    ration: "sundries", hotdog: "sundries", biscuit: "sundries", candle: "sundries", twine: "sundries",
    book: "lore", map_scrap: "lore", ledger: "lore", pamphlet: "lore"
  };
  function itemCategory(item) { if (!item) return "misc"; if (item.cat) return item.cat; if (item.kind === "weapon" || item.kind === "armor") return "gear"; return ITEM_CAT[item.kind] || ITEM_CAT[item.id] || "misc"; }
  function archOf(name) { return ARCH[name] || ARCH.specialty; }
  function onCategory(shopCat, item) { return !shopCat || itemCategory(item) === shopCat; }
  // a specialty shop REFUSES off-category; the fence (and pawn) NEVER refuse (no-sludge floor).
  function shopRefuses(archName, shopCat, item) { var a = archOf(archName); return !!a.refusesOff && !onCategory(shopCat, item); }

  // BUY: what the player pays (>= base; floored at 2 so the structural sell<buy holds even for trinkets).
  function shopBuyOffer(item, archName, shopCat, stats) {
    var a = archOf(archName);
    return clampInt(Math.max(2, baseValue(item) * a.buyMul * appearanceMul(stats)));
  }
  // SELL: what the player receives. 0 if refused. Folds spread × fit × saturation × Appearance × Charm,
  // then CLAMPED strictly below the buy price (the spread is structural, not tunable away).
  function shopSellOffer(item, archName, shopCat, satLevel, stats) {
    if (shopRefuses(archName, shopCat, item)) return 0;
    var a = archOf(archName);
    var fit = onCategory(shopCat, item) ? a.fitBonus : a.offFit;
    var sat = (satLevel == null) ? 1 : Math.max(SAT.floor, satLevel);
    var raw = baseValue(item) * a.sellMul * fit * sat * appearanceMul(stats) * charmMul(stats);
    var offer = clampInt(Math.max(1, raw));
    var buy = shopBuyOffer(item, archName, shopCat, stats);
    return Math.max(1, Math.min(offer, buy - 1));   // STRUCTURAL spread: sell is ALWAYS at least 1 below buy
  }
  // saturation transitions: one sale floods the category; time/visits recover it toward SAT.start.
  function satAfterSale(satLevel) { return Math.max(SAT.floor, ((satLevel == null) ? SAT.start : satLevel) * SAT.decay); }
  function satRecover(satLevel, ticks) { return Math.min(SAT.start, ((satLevel == null) ? SAT.start : satLevel) + SAT.recover * (ticks || 1)); }
  function satOnVisit(satLevel) { return Math.min(SAT.start, ((satLevel == null) ? SAT.start : satLevel) + SAT.perVisit); }

  return {
    COIN: COIN, PRICES: PRICES, BUYBACK: BUYBACK, SERVICES: SERVICES,
    value: value, mint: mint, setPurse: setPurse, coinCount: coinCount, canAfford: canAfford, spend: spend, credit: credit,
    applyReaction: applyReaction, baseValue: baseValue, buyPrice: buyPrice, sellPrice: sellPrice, servicePrice: servicePrice,
    // shop-economy R1 — archetypes + offered-price model + saturation math (state held by the session)
    ARCH: ARCH, SAT: SAT, ITEM_CAT: ITEM_CAT, itemCategory: itemCategory, shopRefuses: shopRefuses,
    shopBuyOffer: shopBuyOffer, shopSellOffer: shopSellOffer,
    satAfterSale: satAfterSale, satRecover: satRecover, satOnVisit: satOnVisit, appearanceMul: appearanceMul, charmMul: charmMul
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_ECON; }
