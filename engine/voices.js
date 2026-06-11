// Tourist Dungeon engine — TD_VOICES: the data-driven NPC voice system.
// One voice spec per speaking NPC: a VOICE BIBLE (register, rhythm, one verbal
// tic, a never-says list, an ACCENT) and a LINE POOL keyed by trigger. The
// engine picks a line by trigger + player state; a line used this session is
// RETIRED (no repeats). Every emitted line declares its CHANNEL (senses) and
// OBJ/SUBJ (Channel Law). ACCENT LAW (CLAUDE.md): accent is written through word
// choice, idiom and rhythm ONLY — never phonetic spelling, never dropped
// letters; all speech stays under the municipal translated-brochure register.
//
// This is the mirror-safe RUNTIME table; the JSON Schema + authoring copies live
// in /design/voices/ (private). Line pools are drafted to budget for the
// operator's red pen; thin triggers are flagged in the session summary, not
// padded with weak lines.
"use strict";

var TD_VOICES = (function () {
  // trigger -> default channel/obj for lines that don't override
  var TRIG = {
    greeting:  { ch: "senses", kind: "said", obj: "SUBJ" },
    pitch:     { ch: "senses", kind: "said", obj: "SUBJ" },
    accept:    { ch: "senses", kind: "said", obj: "OBJ" },
    decline:   { ch: "senses", kind: "said", obj: "SUBJ" },
    smalltalk: { ch: "senses", kind: "said", obj: "SUBJ" },
    reaction:  { ch: "senses", kind: "said", obj: "OBJ" }
  };

  // A line is a string (uses the trigger default) or [text, obj] to override.
  var SPECS = {
    // ----- KIOSK — terse municipal clerk (accent: mixed/clipped) ------------
    kiosk: {
      name: "the Admission Kiosk", role: "ticket clerk", accent: "mixed",
      bible: { register: "clipped municipal notice", rhythm: "short. flat. final.", tic: "states the obvious as policy", neverSays: ["please", "enjoy", "wonderful"] },
      lines: {
        greeting: ["Kiosk. Self-service.", "Tickets. One per visitor.", "State your business or move along.", "Admission is free. It is not, however, an occasion."],
        pitch: ["Standard Admission. All areas. No frills, no refunds.", "Grey ticket. Valid everywhere a grey ticket is valid.", "Take it or do not. The queue is theoretical.", "It opens the gate. That is the whole of its talent."],
        accept: [["A Standard Admission. All areas, as printed.", "OBJ"], ["Stamped. Keep it where you can find it.", "OBJ"], ["Done. The gate will know it.", "OBJ"], ["One ticket, dispensed. Next.", "OBJ"]],
        decline: ["Suit yourself.", "The slot will wait. It has nothing else.", "No sale. No matter.", "Come back when you mean it."],
        smalltalk: ["The weather is municipal.", "Complaints go in the box. The box is also theoretical.", "I have stamped worse than you.", "Lost-and-Found is down the hall and behind the point."],
        reaction: {
          starving: [["You look hollowed out. Eat before the gate, not after.", "OBJ"]],
          wounded: [["You are bleeding on the counter. It is municipal property.", "OBJ"]],
          famous: [["You again. The register remembers, even when I would rather not.", "OBJ"]],
          comfortable: [["You smell expensive. The ticket costs the same.", "OBJ"]],
          ticketed: [["You already hold admission. One is the limit.", "OBJ"]],
          fresh: [["New face. The dungeon files those alphabetically.", "OBJ"]],
          fatigued: [["You are dead on your feet. Sit, or do not. Policy is neutral.", "OBJ"]],
          fed: [["Well fed, for now. The gate does not cater.", "OBJ"]]
        }
      }
    },
    // ----- AGENCY — posh oversell (accent: posh English) -------------------
    agency: {
      name: "the Tour Agency", role: "tour clerk", accent: "posh",
      bible: { register: "brochure superlative", rhythm: "expansive, gilded, breathless", tic: "promises everything, delivers a zone", neverSays: ["no", "cannot", "small"] },
      lines: {
        greeting: ["Welcome, welcome — to the very best of everything!", "Ah, a discerning visitor; one sees it at once.", "You have come to the right desk; there is no other worth the name.", "Step in, step in — the Guided life awaits."],
        pitch: ["This pass gets you everywhere worth going!", "Guided, safe, premium — our guides are famously ruthful.", "Why wander, when one may be conducted?", "Everywhere worth seeing, and nothing one would rather not."],
        accept: [["A Guided Package — valid in all Guided Zones, as the small print sings.", "OBJ"], ["Marvellous choice. The Zones are yours.", "OBJ"], ["Stamped with our compliments. Mind the Zones.", "OBJ"], ["Welcome to the Guided life; it is the only life worth guiding.", "OBJ"]],
        decline: ["A pity — but the door remains, as ever, open.", "One reconsiders; one always reconsiders.", "The unguided life is a story one tells once.", "We shall be here, gleaming, when you return."],
        smalltalk: ["Our brochures are printed on the finest available stock.", "The graveyard view is, between us, the premium aspect.", "One does not visit; one is curated.", "We have never lost a guest we were prepared to admit losing."],
        reaction: {
          starving: [["You look famished — the Guided itinerary includes a sit-down, you know.", "OBJ"]],
          wounded: [["Goodness, you are marked. Our guides would never have permitted it.", "OBJ"]],
          famous: [["Your reputation precedes you; several of them do.", "OBJ"]],
          comfortable: [["You have the bearing of a premium guest. We adore the bearing.", "OBJ"]],
          ticketed: [["You are already provisioned. One package per discerning soul.", "OBJ"]],
          fresh: [["A new face! How we cherish a clean slate to itemise.", "OBJ"]],
          fatigued: [["You seem weary; the Guided pace is, naturally, gentler.", "OBJ"]],
          fed: [["Well fed and well met — half of touring is the appetite for it.", "OBJ"]]
        }
      }
    },
    // ----- CONCIERGE / HOTEL — posh condescension --------------------------
    hotel: {
      name: "the Gilded Kraken", role: "concierge", accent: "posh",
      bible: { register: "velvet discouragement", rhythm: "unhurried, faintly bored", tic: "calls you 'dear' to keep you small", neverSays: ["adventure", "down there", "hurry"] },
      lines: {
        greeting: ["A room, dear? Of course there is a room.", "You have the look of someone who would rather be lying down.", "The Gilded Kraken; mind the name, mind the prices.", "Come in out of the plot, dear."],
        pitch: ["Nothing down there worth roughing it for, dear.", "Stay. The bed is the only honest destination.", "Let the dungeon keep its appointments. You keep the suite.", "One night here is worth three of whatever you were planning."],
        accept: [["The night is yours; you wake restored, as the restored do.", "OBJ"], ["Suite's made up. Do try not to return marked.", "OBJ"], ["Rest, dear. The world will still be disappointing tomorrow.", "OBJ"], ["A perfumed night. You will leave announced.", "OBJ"]],
        decline: ["Off you go, then, to be uncomfortable on purpose.", "The bed will keep. It is very good at keeping.", "As you like, dear; martyrdom is a kind of holiday.", "Do mind the draught on your way to the regret."],
        smalltalk: ["The Rusty Anchor? We do not speak of the Rusty Anchor.", "Our towels have a thread count one does not discuss with guests.", "Comfort, dear, is a destination in itself.", "We launder reputations as a courtesy."],
        reaction: {
          starving: [["You are positively gaunt, dear; ring for something before you faint in the lobby.", "OBJ"]],
          wounded: [["You are dripping on the marble. We have people for that, and a fee.", "OBJ"]],
          famous: [["So many arrivals, all of them you. The staff keep a tally.", "OBJ"]],
          comfortable: [["You wear comfort well, dear. It suits the marble.", "OBJ"]],
          ticketed: [["A ticket already? How quaint. The bed asks no ticket.", "OBJ"]],
          fresh: [["A fresh guest. We do so enjoy a guest who has not yet learned better.", "OBJ"]],
          fatigued: [["You can barely stand, dear. The lift is just there. So is sense.", "OBJ"]],
          fed: [["Fed and upright. You will undo both downstairs, of course.", "OBJ"]]
        }
      }
    },
    // ----- SPA — posh flattery --------------------------------------------
    spa: {
      name: "the Spa", role: "attendant", accent: "posh",
      bible: { register: "soft flattery with a barb", rhythm: "low, slow, lulling", tic: "promises you will be 'announced'", neverSays: ["cheap", "rush", "ordinary"] },
      lines: {
        greeting: ["You have arrived precisely when you needed to.", "Such tension. We can see it from here.", "Welcome; you are already improving.", "Lie back. The improvements will find you."],
        pitch: ["Emerge improved. Emerge, regrettably, announced.", "You will leave with soft hands and a perfume that enters rooms first.", "An hour here undoes a week of the dungeon.", "Let us make you someone worth recognising."],
        accept: [["The treatment is done; you are improved, and unmistakably scented.", "OBJ"], ["Soft hands, dear visitor — the dungeon will smell you coming.", "OBJ"], ["You are remade, and announced for it.", "OBJ"], ["A perfume that precedes you into every room.", "OBJ"]],
        decline: ["The tension will keep you company, then.", "We will be here, warm and patient, when the knots win.", "As you wish; one cannot improve the unwilling.", "Go un-scented; the dungeon has a nose all the same."],
        smalltalk: ["Scent is a passport one cannot surrender.", "We have improved guests who did not survive the improvement.", "Relaxation is a discipline, and we are strict.", "The doorman dislikes our work; the doorman dislikes work."],
        reaction: {
          starving: [["You are running on fumes — we cannot massage an empty larder.", "OBJ"]],
          wounded: [["Those wounds will not take the oils. Mend first, glow later.", "OBJ"]],
          famous: [["So many lives, and each one leaves with our perfume.", "OBJ"]],
          comfortable: [["Already so well-kept. We merely turn the dial further.", "OBJ"]],
          ticketed: [["Ticketed and tense — admission first, serenity never, it seems.", "OBJ"]],
          fresh: [["A fresh canvas. We do our finest work on the unmarked.", "OBJ"]],
          fatigued: [["You are exhausted; an hour here and you will at least be exhausted beautifully.", "OBJ"]],
          fed: [["Fed and willing — the ideal state for improvement.", "OBJ"]]
        }
      }
    },
    // ----- DOORMAN — barely speaks (accent: brooklyn) — FLAVOR budget ------
    doorman: {
      name: "the Rusty Anchor", role: "doorman", accent: "brooklyn", flavor: true,
      bible: { register: "monosyllabic gatekeeping", rhythm: "few words, fewer wasted", tic: "judges by nose", neverSays: ["welcome", "sir", "lovely"] },
      lines: {
        greeting: ["Yeah.", "We are open. Do not make it a thing.", "You drinking, or looking?"],
        decline: ["Door is that way.", "Come back when you are carrying less.", "Not tonight."],
        smalltalk: ["The place is a dive. That is the amenity.", "The hotel upstairs hates us. It is mutual."],
        reaction: {
          comfortable: [["You smell like the Gilded Kraken. Not your kind of place.", "OBJ"]],
          starving: [["You look half-starved. The bar food is honest, at least.", "OBJ"]],
          wounded: [["You are bleeding. Take it to a stool, not my floor.", "OBJ"]],
          famous: [["I have seen you die a few times. Buys you nothing here.", "OBJ"]]
        }
      }
    },
    // ----- HOT DOG VENDOR — the best voice: street patter vs municipal form -
    vendor: {
      name: "the Hot Dog Vendor", role: "mobile vendor", accent: "brooklyn",
      bible: { register: "street barker forced through a municipal permit", rhythm: "fast, looping, all-caps energy in lowercase", tic: "quotes his own (invented) Bureau permit number", neverSays: ["perhaps", "regrettably", "moderation"] },
      lines: {
        greeting: ["Hey, hey — the cart finds the hungry. That is a guarantee. Look it up.", "There he is: a visitor with the good sense to be standing near me.", "Step right up. Permit eleven-and-three-quarters, fully municipal, I assure you.", "You just walked into the best decision of your afternoon."],
        pitch: ["One dog, dressed how you like, climbs you right up the hunger ladder. That is nutrition. That is policy.", "Bureau-approved, street-perfected: the only honest meal between here and the turnstile.", "Look, a dog is a dog, but my dog is an itinerary. You eat, you ascend.", "Two dollars of joy, today priced at one smile. The economy is still in committee."],
        accept: [["One hot dog, hot as promised. Carry it. Eat it when the dark gets long.", "OBJ"], ["There she is, wrapped and yours. Climbs you a full rung, easy.", "OBJ"], ["Enjoy it, champ. Permit eleven-and-three-quarters stands behind every bite.", "OBJ"], ["A dog for the road. The road is worse without it.", "OBJ"]],
        decline: ["Your loss — and I mean that with municipal warmth.", "The cart moves on. The cart always moves on.", "Walk away hungry. It is a free country and a fee dungeon.", "I will be around. I am always around. Ask the streets."],
        smalltalk: ["I have a route, see, and the route has me. We are partners.", "The posh places will not sell you a real meal, even if you bled for it.", "This cart has seen more of this town than the mayor, and it tips better.", "Mustard is a condiment. My mustard is a civic service."],
        reaction: {
          starving: [["Whoa, whoa — you are STARVING. Sit. Eat. The Bureau can wait; your stomach cannot.", "OBJ"]],
          wounded: [["You are all banged up, friend. A dog will not stitch you, but it will not judge you either.", "OBJ"]],
          famous: [["I know you. You are the one who keeps coming back. Loyalty discount: also a smile.", "OBJ"]],
          comfortable: [["Look at you, all spa-fresh, slumming it at the cart. I respect it.", "OBJ"]],
          ticketed: [["You have your ticket. Good. Now get your lunch: a gate is no good on an empty tank.", "OBJ"]],
          fresh: [["New blood. The first dog is the one you remember. That is a fact, basically.", "OBJ"]],
          fatigued: [["You are dragging, champ. Carbohydrates are a kind of rest. Ask any cart.", "OBJ"]],
          fed: [["Full already? Take one for the pocket. Future-you sends thanks.", "OBJ"]]
        }
      }
    }
  };

  // ----- archetype keepers (flavor budget) for the wider town, by accent map -
  function flavorSpec(name, role, accent, greeting, smalltalk, reactions) {
    return { name: name, role: role, accent: accent, flavor: true,
      bible: { register: accent + " keeper", rhythm: "brief, in character", tic: "stays in register", neverSays: [] },
      lines: { greeting: greeting, smalltalk: smalltalk, reaction: reactions } };
  }
  var RX_POSH = { comfortable: [["One sees you keep yourself. One approves, naturally.", "OBJ"]], starving: [["You look quite faint; do see someone about a meal.", "OBJ"]], wounded: [["You are marked; how very out-of-doors of you.", "OBJ"]], famous: [["Your face is familiar, in the way a recurring expense is.", "OBJ"]] };
  var RX_BKLN = { comfortable: [["Look at you, all done up. Slumming, I respect it.", "OBJ"]], starving: [["You are running on empty, friend. Eat something real.", "OBJ"]], wounded: [["You are bleeding on my floor. Mind the floor.", "OBJ"]], famous: [["I know that face. You keep turning up. Bold.", "OBJ"]] };
  var RX_PAST = { comfortable: [["You are well-kept, child; see that the keeping is not all.", "OBJ"]], starving: [["You hunger; come, none here are turned away empty.", "OBJ"]], wounded: [["You are wounded; rest, and be mended in due season.", "OBJ"]], famous: [["You have died and returned; the door is open to such, also.", "OBJ"]] };
  var RX_PLAIN = { comfortable: [["You clean up nice. Won't last down there.", "OBJ"]], starving: [["You look half-starved. Eat before you work.", "OBJ"]], wounded: [["You're banged up. Sit before you fall.", "OBJ"]], famous: [["Seen you around. More than once, seems like.", "OBJ"]] };
  var RX_MIX = { comfortable: [["You carry yourself well. The dungeon does not care.", "OBJ"]], starving: [["You should eat. Plainly stated.", "OBJ"]], wounded: [["You are hurt. Mind it.", "OBJ"]], famous: [["You are becoming a regular feature. Noted.", "OBJ"]] };

  SPECS.keeper_posh = flavorSpec("a posh keeper", "keeper", "posh",
    ["Do come in; one is delighted, within reason.", "You have the look of an account worth opening.", "Mind the marble; it minds you back."],
    ["We are discreet, which is the whole of the service.", "The harbour view costs extra, as views do.", "One does not discuss the red-lit end of the quay."], RX_POSH);
  SPECS.keeper_brooklyn = flavorSpec("a Brooklyn keeper", "keeper", "brooklyn",
    ["Hey, come in, the door is the door.", "There you are. Took you long enough.", "Whaddya need — and I say that with affection."],
    ["This block runs on favours and the favours run on me.", "The posh places upstreet would not give you the time.", "Everything is negotiable except the closing time."], RX_BKLN);
  SPECS.keeper_pastoral = flavorSpec("the parson", "keeper", "pastoral",
    ["Peace to you, traveller; come in from the commute.", "Enter, and be still a moment.", "The door is open; it is always open."],
    ["The island across the water keeps its own sabbath, and keeps it from us.", "We mind the living and we mind the lately-living.", "Rest is a kind of prayer, and you look prayerful."], RX_PAST);
  SPECS.keeper_plain = flavorSpec("the smith", "keeper", "plainspoken",
    ["Door is open. Mind the heat.", "You need something made or mended.", "Speak plain, I work plain."],
    ["I make what holds and I do not make promises.", "Town is small. Word travels faster than you do.", "Honest tools, honest prices, honest dirt."], RX_PLAIN);
  SPECS.keeper_mixed = flavorSpec("the proprietor", "keeper", "mixed",
    ["Welcome. Such as it is.", "Come in, the sign says open and the sign rarely lies.", "Browse. Or do not. The shelves are patient."],
    ["A little of everything, none of it the canon.", "The Bureau lists us under 'sundry'.", "We keep odd hours and odder stock."], RX_MIX);
  SPECS.coffee = flavorSpec("the Coffee Shop", "barista", "mixed",
    ["Morning — it is always morning, somewhere on the menu.", "Welcome to the only honest stimulant in town.", "We open early, on the days that have a morning."],
    ["The roast is municipal-dark, which is darker than it sounds.", "A cup here is a meal, legally, on a technicality.", "We do not do the foam art; the foam does itself."], RX_MIX);
  // townsfolk walkers (flavor)
  SPECS.nuns = flavorSpec("a pair of nuns", "townsfolk", "pastoral",
    ["Bless you, traveller; mind the deeper doors.", "Peace, and a steady commute to you.", "We walk to the water and back; it settles the soul."],
    ["The island is in plain sight and plainly not for us.", "We pray for the lately-discontinued; the list is long.", "Charity first, curiosity second, the Bureau a distant third."], RX_PAST);
  SPECS.farmers = flavorSpec("a farmer", "townsfolk", "plainspoken",
    ["Morning. Or whatever it is down here.", "Mind yourself in that dungeon, friend.", "Cart is empty; market was thin."],
    ["Soil up top, stone down below. I prefer the soil.", "Prices at the Bodega are a crime and a convenience.", "I do not go past the turnstile. I am not paid enough."], RX_PLAIN);
  SPECS.senorita = flavorSpec("a señorita", "townsfolk", "mixed",
    ["Buenas — though the Bureau prefers 'good day'.", "You walk like someone with an appointment underground.", "The harbour is prettier than the brochure admits."],
    ["I keep to the streets; the streets keep their counsel.", "The red-lit place is closed; everyone asks, no one is told.", "Dance is also a kind of route knowledge, no?"], RX_MIX);

  // the two WARRING gift shops by the dungeon gate (Brooklyn touts at war)
  SPECS.gift1 = flavorSpec("Ye Olde Dungeon Gifte", "gift-shop tout", "brooklyn",
    ["Welcome to the GENUINE article — accept no substitutes, especially the one next door.", "Authentic, certified, municipally adjacent. Step right in.", "You want a real souvenir, not whatever they are peddling at number two."],
    ["That shop next door? A tourist trap. We are the original.", "Our snow globes contain real dungeon dust. Allegedly. Definitely.", "Number two would not know an artefact if it bit them — which it might."], RX_BKLN);
  SPECS.gift2 = flavorSpec("Authentic Dungeon Souvenirs", "gift-shop tout", "brooklyn",
    ["The REAL souvenirs are HERE — that other place is a trap for the unwary.", "Step in, friend, away from the knockoffs next door.", "One shop in this town is honest. You are standing in it."],
    ["Ye Olde whatever? Established last Tuesday. We are the genuine article.", "Our certificates of authenticity are themselves authentic.", "Do not buy a 'genuine' anything from number one. I beg you."], RX_BKLN);
  // proximity barks the two shops trade when the visitor is near both (used in play)
  SPECS.gift1.barks = ["Do not listen to number two — those are knockoffs!", "GENUINE artefacts here, not that imported nonsense next door!", "We were here FIRST, whatever their sign says!"];
  SPECS.gift2.barks = ["Number one sells gravel in a jar — come see the REAL thing!", "Authentic! Certified! Unlike SOME shops on this strip!", "Their 'olde' is spelled with an extra e and a lie!"];

  // --- the filler crowd + the school troop (ambient barks; flagged for export) ---
  SPECS.dockworker = flavorSpec("a dock worker", "labourer", "brooklyn",
    ["Mind the ropes.", "Cargo waits for nobody.", "You lost, friend?"],
    ["Twelve hours on the dock and the Bureau still wants a form.", "Tide is coming; so is my shift.", "The warehouse eats men like me for paperwork."], RX_BKLN);
  SPECS.dockworker.barks = ["Coming through!", "Heavy load, make a hole.", "Another crate, another century."];
  SPECS.sailor = flavorSpec("a drunk sailor", "sailor", "brooklyn",
    ["Heyyy. Buy a man a drink?", "The sea is honest. The town is not.", "I been everywhere, twice."],
    ["The tavern knows my name better than my mother.", "Solid ground keeps moving on me.", "Do not trust a calm harbour."], RX_BKLN);
  SPECS.sailor.barks = ["To the tavern! Again!", "Whoa — who moved the street?", "One more, then I swear I am done."];
  SPECS.shopper = flavorSpec("a shopper", "townsperson", "mixed",
    ["So many shops, so little sense.", "I am only browsing.", "Have you seen the prices?"],
    ["The bodega is a crime and a comfort.", "I came for one thing and left with five.", "Everything is 'genuine' now."], RX_MIX);
  SPECS.shopper.barks = ["Is this genuine, do you think?", "Two for one, surely.", "I will think about it."];
  SPECS.visitor = flavorSpec("a visitor", "tourist", "mixed",
    ["Is THIS the dungeon? It is smaller than the brochure.", "Where does one get a ticket?", "Which gift shop is the real one?"],
    ["The brochure promised more graveyard.", "I have a guided package, you know.", "We are doing the whole town by lunch."], RX_MIX);
  SPECS.visitor.barks = ["Which gift shop is real?!", "Take the photo, take the photo!", "Is the island included?"];
  SPECS.guard = flavorSpec("a Bureau patrol", "patrol", "mixed",
    ["Move along; nothing is, by definition, happening.", "Keep to the lit streets.", "The Bureau sees you. The Bureau sees everyone."],
    ["A quiet beat is a successful beat.", "The red-light end is somebody else's paperwork.", "Order is mostly a matter of signage."], RX_MIX);
  SPECS.guard.barks = ["Move along.", "Nothing to see; that is the point.", "Mind the bylaws."];
  SPECS.chaperone = flavorSpec("a Bureau chaperone", "tour chaperone", "mixed",
    ["This way, children — and in single file, the Bureau prefers a line.", "Eyes front, hands to yourselves, questions at the end.", "We are AHEAD of schedule, which the Bureau distrusts."],
    ["On your left, a fountain; do not climb the fountain.", "The gift shops are a lesson in commerce, children.", "No, we are not going IN the dungeon."], RX_MIX);
  SPECS.chaperone.barks = ["Single file, please!", "Do NOT feed the vendor.", "Count off — one, two, where is three?"];
  SPECS.kids = flavorSpec("a school kid", "schoolchild", "mixed",
    ["Are we there yet?", "I can see the island!", "Can we go in the dungeon? Please?"],
    ["My feet hurt.", "That sailor smells funny.", "I want a hot dog."], RX_MIX);
  SPECS.kids.barks = ["Are we there yet?!", "I saw a monster, I SAW one!", "Can we get souvenirs?"];

  // dungeon cast — reserved voices, NO lines yet (canon arrives as design data)
  var DUNGEON_CAST = ["janitor", "elevator_operator", "oracle", "bookie"];
  DUNGEON_CAST.forEach(function (id) { SPECS[id] = { name: id, role: "dungeon NPC", accent: "mixed", placeholder: true, bible: { register: "TBD", rhythm: "TBD", tic: "TBD", neverSays: [] }, lines: {} }; });

  function expand(line, trig) {
    var t = (typeof line === "string") ? line : line[0];
    var obj = (typeof line === "string") ? (TRIG[trig] || TRIG.smalltalk).obj : line[1];
    var d = TRIG[trig] || TRIG.smalltalk;
    return { text: t, ch: d.ch, kind: d.kind, obj: obj };
  }

  // A session-scoped voice: picks an unused line by trigger (+ state for
  // reactions); a used line is retired. Returns {text, ch, kind, obj} or null.
  function box(specId) {
    var spec = SPECS[specId];
    var used = {};
    function pickFrom(arr, trig) {
      if (!arr || !arr.length) return null;
      for (var i = 0; i < arr.length; i++) {
        var ex = expand(arr[i], trig);
        if (!used[ex.text]) { used[ex.text] = 1; return ex; }
      }
      return null;   // pool exhausted this session
    }
    return {
      spec: spec,
      say: function (trigger, state) {
        if (!spec || !spec.lines) return null;
        if (trigger === "reaction") {
          var r = spec.lines.reaction || {};
          var arr = (state && r[state]) ? r[state] : null;
          return pickFrom(arr, "reaction");
        }
        return pickFrom(spec.lines[trigger], trigger);
      },
      // a non-retiring peek (tests / fallbacks)
      _all: function (trigger, state) {
        if (!spec || !spec.lines) return [];
        var arr = trigger === "reaction" ? ((spec.lines.reaction || {})[state] || []) : (spec.lines[trigger] || []);
        return arr.map(function (l) { return expand(l, trigger); });
      }
    };
  }

  function byId(id) { return SPECS[id] || null; }
  return { SPECS: SPECS, DUNGEON_CAST: DUNGEON_CAST, box: box, byId: byId, _trig: TRIG, _expand: expand };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_VOICES; }
