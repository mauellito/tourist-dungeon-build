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
  // ---- IMPACT / death-verb BANK (the combat onomatopoeia, in the municipal register). Categorized
  // by event severity so a kill reads heavier than a graze; data-driven + easy to extend. TD_FEEL
  // pulls a float CONTEXTUALLY from the category matching the event. EVENT channel (what happened).
  var IMPACT = {
    "glancing-hit": ["NOTED.", "FILED.", "LOGGED.", "INITIALLED.", "RECEIVED."],
    "solid-hit": ["PROCESSED.", "ASSESSED.", "STAMPED.", "DULY RECORDED.", "ENTERED INTO THE RECORD."],
    "crit": ["SUMMARILY VOIDED.", "STRUCK FROM THE ROLL.", "FINALISED WITHOUT APPEAL.", "EXPUNGED."],
    "kill": ["VOIDED.", "DISCONTINUED.", "RETURNED TO SENDER.", "STRUCK OFF.", "CASE CLOSED."],
    "player-hit": ["DOCKED.", "A DEMERIT.", "PENALISED.", "DEDUCTED."],
    "player-death": ["DECEASED — PERMITTED.", "FILED UNDER FINAL.", "STAMPED: CONCLUDED.", "CLOSED, WITH REGRET."],
    "pickup": ["ACQUIRED.", "REQUISITIONED.", "LOGGED IN.", "ADDED TO THE MANIFEST."],
    "descend": ["DESCENT AUTHORISED.", "PROCEED TO THE NEXT WICKET.", "MIND THE STEP.", "DOWN ONE LEVEL, PER ITINERARY."]
  };
  function impact(category, n) { var p = IMPACT[category] || IMPACT["solid-hit"]; return p[((n || 0) % p.length + p.length) % p.length]; }

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

  // ===========================================================================
  // CONTACT DIALOGUE POOLS (v15): every NPC type can be talked to. GREETINGS
  // fire on first contact; CHAT on subsequent contacts (no-repeat, then recycle).
  // Separate from the ambient `barks`. Resolution: named spec -> type pool ->
  // GENERIC (so no NPC is ever mute). Accent law: cadence + idiom only.
  // ===========================================================================
  var GENERIC = { greetings: ["They give you a nod."], chat: ["They have nothing much to add."] };
  function setPool(id, accent, greetings, chat) {
    if (!SPECS[id]) SPECS[id] = { name: id, role: "townsperson", accent: accent, contactOnly: true, bible: { register: accent + " local", rhythm: "brief", tic: "", neverSays: [] }, lines: {} };
    SPECS[id].accent = SPECS[id].accent || accent;
    SPECS[id].greetings = greetings; SPECS[id].chat = chat;
  }

  // DOCK WORKERS — Brooklyn; cargo, backs, foremen, the morning boat
  setPool("dockworker", "brooklyn",
    ["Mind the ropes, friend.", "You lost? The dock is no place to be lost.", "Cargo waits for nobody, least of all you.", "Step lively or step aside."],
    ["The morning boat came in heavy; my back will hear about it for a week.", "The foreman counts crates like they are his children, and likes them better.", "Half this cargo goes straight to the gift shops — genuine artefacts, my eye.", ["Twelve hours on the dock and the Bureau still wants a form in triplicate.", "OBJ"], "You see that island out past the rail? We load for everywhere but there.", "A crate came in once that hummed. We did not open it. We are not paid to open it.", "The red end of the quay gets its deliveries after dark. We do not ask."]);
  // DRUNK SAILORS — Brooklyn, beer-loose; tall tales, complaints, sentiment
  setPool("sailor", "brooklyn",
    ["Heyyy. Buy a man a drink?", "There he is, dry land's finest.", "You got the look of someone with stories. I got better ones.", "Sit, sit — the Anchor's just there."],
    [["I have seen that island up close. Closer than the Bureau likes. There is a bell that rings itself.", "SUBJ"], ["Under the quay — under it — there is a thing the size of a barge that breathes once an hour. I felt the dock lift.", "SUBJ"], ["A kraken took my second-best hat off the Rusty Anchor's own roof. Ask the doorman; he will deny it, the coward.", "SUBJ"], "The sea is honest. The town is not. The fountain is just a puddle that got ambitious.", "I had a girl in every port and a debt in every other.", "Solid ground keeps moving on me; I blame the town, not the beer.", "Those gift shops would sell you the sea in a jar and call it genuine."]);
  // VENDORS / LOWLIFES base — Brooklyn, always selling or sizing you up
  setPool("lowlife", "brooklyn",
    ["Psst. Over here. Yeah, you.", "You look like a man who knows a deal.", "I am not selling anything. I am offering an opportunity.", "Keep your voice down and your wallet handy."],
    ["The Quay's End is 'closed for renovations'. It has been closed for renovations since before the renovations.", "Everything genuine in this town is in a jar with a label. Trust the jar, not the label.", "The guards walk a route you could set a clock by. I have set a clock by it.", "A dungeon ticket gets you in. Getting out, now — that is the part they undersell.", "The castle on the hill? Nobody goes up. Nobody comes down. Draw your own conclusion.", "I knew a fella went into that cave on the horizon. Came back rich. Came back wrong, too."]);
  // SHOPPERS / TOWNSFOLK / DINERS — plain local register; gossip, prices, the catch
  setPool("townsfolk", "plainspoken",
    ["Afternoon.", "Busy today, with the school lot in.", "You are not from here. It shows, kindly.", "Mind how you go."],
    ["Prices at the Bodega are a scandal and a convenience both.", "Somebody was seen leaving the Quay's End at dawn. Sideways. Polite, but sideways.", "The two gift shops are at it again — one of them is a fraud and I will not say which, in public.", "The catch was thin this morning; the Clam Shack will be dear by noon.", "That school troop has been round the fountain three times. Lost, or thorough.", "They say the monastery in the hills takes visitors. They say a lot of things.", ["The dungeon takes more than it gives back, by my count of the funerals.", "OBJ"]]);
  setPool("shopper", "plainspoken",
    ["So many shops, so little sense.", "I am only browsing, truly.", "Have you seen the prices? Sit down first.", "One does not visit this town; one is itemised."],
    ["The bodega has everything and charges for the privilege of finding it.", "Both gift shops swear the other is the knockoff. They cannot both be right; I suspect neither is.", "I came for one souvenir and the fountain ate my afternoon.", "A genuine artefact, they said. Genuine what, they did not say.", "The spa makes you smell expensive, which the doorman at the Anchor holds against you.", "I would buy from the cave-mouth man if the cave-mouth man existed."]);
  setPool("diner", "plainspoken",
    ["Pull up a chair, there is room.", "The fish is local, allegedly.", "Eat before the dungeon, not after; trust me.", "They sat me by the window; I can see the whole feud from here."],
    ["The Clam Shack fries anything that washes up, no questions, and that is the appeal.", "The two gift shops shout across the street all through lunch; it is the entertainment.", "Coffee opens early on the days that have a morning, which is not all of them.", "Saw the school kids try to order at the bar. The chaperone nearly fainted.", "The catch came off the morning boat; the dock men look like they regret it.", "The island sits out there at dinner like a guest who will not be invited."]);
  // VISITORS — plain/eager tourist
  setPool("visitor", "plainspoken",
    ["Is THIS the dungeon? It is smaller than the brochure.", "Where does one get a ticket, exactly?", "Which gift shop is the real one? Quickly, we have a schedule.", "We are doing the whole town by lunch."],
    ["The brochure promised more graveyard. I feel slightly cheated, in a premium way.", "Both gift shops told me the other is a tourist trap. I bought from neither, on principle.", "We threw a coin in the fountain; the Bureau, I am told, keeps the coins.", "A guided package, you know. We are conducted. It is the only way to tour.", "Is the island included? It looks included. It is RIGHT THERE.", "The castle on the hill is not on the itinerary, which only makes me want it."]);
  // GUARDS — clipped procedural; atmospheric, never menacing
  setPool("guard", "mixed",
    ["In order. Carry on.", "Noted. Move along, pleasantly.", "Bureau patrol. Nothing is, by definition, happening.", "Keep to the lit streets, if you would."],
    ["A quiet beat is a successful beat. This is a successful beat.", "The red-light end is somebody else's paperwork, thankfully.", "Order is mostly a matter of signage, in my experience.", "The gift-shop dispute is noted, monitored, and beneath intervention.", "The fountain is municipal property; coins in it are the Bureau's, technically.", "The dungeon gate is not my jurisdiction. Cheerfully not my jurisdiction."]);
  // KIDS — awe, dares, are-we-there-yet, confident misinformation
  setPool("kids", "mixed",
    ["Are we there yet?", "I can see the ISLAND! Is it a pirate island?", "Are you a dungeon person? You look like a dungeon person.", "Dare you to touch the red door. DARE you."],
    ["My brother says the dungeon has a dragon that does TAXES. That is the scary part, he says.", "The fountain has a fish in it the size of a BUS, I saw it, basically.", "The castle is where they keep the BAD tourists. The chaperone said. Probably.", "That sailor has fought a kraken nine times and LOST every time and that is so cool.", "The cave on the hill goes all the way to the OTHER side of the world. Fact.", "We are not allowed in the dungeon because last time a kid bought too many souvenirs."]);
  // SEÑORITA — warm, formal courtesy (idiom + rhythm only)
  setPool("senorita", "mixed",
    ["Good day to you, and a kinder one than the weather promises.", "You walk like a person with an appointment underground.", "Welcome, traveller; the harbour flatters those who arrive by water.", "A moment of your time is a small, civilised theft."],
    ["The harbour is prettier than the brochure permits it to be.", "I keep to the streets; the streets, in turn, keep their counsel.", "The red-lit end is closed, they say; everyone asks, no one is told.", "Two shops, one street, and a war over a single adjective. It is almost tender.", "The fountain at dusk is the one honest mirror in this town.", "Should you go down to the dungeon, go fed. The Bureau does not pack lunches."]);
  // INTERIOR: HOTEL GUESTS / SPA / BANK — posh; complain beautifully about nothing
  setPool("guest", "posh",
    ["Oh — one did not see you there; one rarely does.", "Is one expected to make conversation? How rustic.", "You have the harbour about you. The smell, I mean.", "Do sit, if the chairs here permit a person of standing to sit."],
    ["The pillows are adequate, which from the Gilded Kraken is an insult.", "The gulls, my dear, begin at FIVE. The Bureau will hear about the gulls.", "The view of the harbour is, if anything, too maritime. All that water.", "I am told there is a dungeon. I am told a great many distressing things.", "The fountain is charming in the way small municipal gestures are charming.", "Those gift shops shriek at one another like fishwives, which I find I rather enjoy."]);
  // INTERIOR: SALOON / ANCHOR REGULARS — Brooklyn dive
  setPool("regular", "brooklyn",
    ["You buying or sitting? Either is fine.", "New face. New faces buy the first round.", "Park it. The stool is the only thing in here that judges you.", "We do not do conversation. We do proximity."],
    ["The doorman turned away a man for smelling like the SPA. That is policy I respect.", "Everything down at the dock comes through here eventually, including the dock men.", "That sailor's kraken story gets a tentacle longer every telling.", "The two gift shops? Both fronts. For what, ask a quieter table.", "The dungeon takes the regulars one by one; we keep their stools warm a while.", "The Quay's End sends a man over sometimes. We do not ask his name."]);

  // KEY WALKERS — named specs (override the type pool)
  setPool("nuns", "pastoral",
    ["Peace to you, traveller.", "Bless you, and mind the deeper doors.", "Come, walk a step with us toward the water.", "Grace finds the lost more easily than the map does."],
    ["We walk to the fountain and back; it settles the soul better than the spa.", "The island sits in plain sight and plainly not for us; we pray for it anyway.", "We pray for the lately-discontinued of the dungeon; the list is long, child.", "The two gift shops feud; we forgive them both, which annoys them equally.", "The monastery in the hills keeps a stricter rule than ours, and a finer view.", ["Go fed and go gently, if you must go down at all.", "OBJ"]]);
  setPool("farmers", "plainspoken",
    ["Morning. Or whatever the harbour calls it.", "Mind yourself in that dungeon, friend.", "Cart's empty; market was thin.", "You buying or just looking honest?"],
    ["Soil up top, stone down below. I keep to the soil.", "Prices at the Bodega are a crime; I sell to them anyway, the hypocrite I am.", "I do not go past the turnstile. I am not paid enough, nor stupid enough.", "The morning boat brought salt air and bad backs to the dock men.", "Saw the school troop trample the public garden. The Bureau will bill the school.", "Rain's coming off the island side; it always does."]);
  setPool("chaperone", "municipal",   // PROTECTED REGISTER — Bureau entities only
    ["This way, visitor — and in single file; the Bureau prefers a line.", "Eyes front, hands to yourselves, questions at the end.", "We are AHEAD of schedule, which the Bureau distrusts on principle.", "Do not engage the vendor; the vendor is not on the itinerary."],
    ["On your left, the fountain; we do not climb the fountain, do we, children.", "The gift shops are a lesson in commerce, and in litigation.", "No, we are not going IN the dungeon. That is a permission slip nobody signed.", "The island is a designated Point of Interest, viewable, non-visitable, per regulation.", "Count off — one, two, where is three. Three is always at the hot dog cart.", "The castle is private; the monastery is closed; the cave is a rumour. Enjoy them all from here."]);
  setPool("vendor", "brooklyn",       // expanded in R3
    ["Hey, hey — the cart finds the hungry. That is a guarantee.", "There he is, a visitor with the good sense to stand near me.", "Permit eleven-and-three-quarters, fully municipal, step right up.", "You just walked into the best decision of your afternoon."],
    ["A dog from me climbs you a full rung up the hunger ladder; that is policy.", "The posh places will not feed you real food even if you bled for it.", "This cart has seen more of this town than the mayor, and tips better.", "Those two gift shops feud; I sell to both their customers, neutral as Switzerland.", "Permit eleven-and-three-quarters covers the cart, the route, and a third of the fountain.", "You going down the dungeon? Eat first. Future-you sends thanks."]);
  setPool("gift1", "brooklyn",        // expanded in R3 (feud)
    ["Welcome to the GENUINE article — accept no substitutes, especially next door.", "Authentic, certified, municipally adjacent. Step in.", "You want a real souvenir, not whatever number two is peddling.", "We were here FIRST, whatever their sign claims."],
    ["That shop next door is a tourist trap with delusions; we are the original.", "Our snow globes hold real dungeon dust. Theirs hold the harbour, settled.", "Number two would not know an artefact if it bit them, which it might.", "The fountain coins go to the Bureau; our prices go to a better cause: me.", "Ask the dock men whose crates are genuine. Ours. Theirs hum suspiciously.", "The island in a jar — we have that. Number two has the JAR, empty."]);
  setPool("gift2", "brooklyn",        // expanded in R3 (feud)
    ["The REAL souvenirs are HERE — that other place is a trap for the unwary.", "Step in, friend, away from the knockoffs next door.", "One shop in this town is honest, and you are standing in it.", "Do not buy a 'genuine' anything from number one; I beg you."],
    ["Ye Olde whatever was established last Tuesday; we are the genuine article.", "Their certificates of authenticity are forged; ours are forged BETTER.", "Number one sells gravel in a jar and calls it dungeon dust; come see real gravel.", "The fountain feud, the gift feud — this town runs on rivalry and we are winning ours.", "The dock men deliver to us first; that is not a coincidence, that is quality.", "Buy here and the island is practically included. Practically."]);

  // TIM (Tim's Tour Guide) — hustler warmth, always one map short of useful
  setPool("tim", "mixed",
    ["Tim's Tour Guide — Tim's the name, the guide's the game.", "Friend! You look like a person who could use a map.", "I have got a map for that. I have got a map for everything. Mostly.", "Step in, step in, mind the other maps."],
    ["This map is current as of a Tuesday. A good Tuesday.", "The dungeon? I can get you to the door. The door is the easy part.", "Hints are, ah, temporarily shuttered. Regulatory. You understand.", "Both gift shops are crooks; I deal only in information, which is honest crookery.", "I had a map to the island once. Sold it. Regret it daily.", "The castle, the monastery, the cave — I have maps to all three; none of them work, collector's items."]);
  // SALTY PETE — a drunk sailor promoted to named Rusty Anchor regular
  setPool("salty", "brooklyn",
    ["Salty's the name, and yeah, before you ask, it stuck.", "Pull up a stool; the Anchor's buying — it is not, but pull up anyway.", "I have been a regular here since before the harbour had water. Roughly.", "New blood at the Anchor — the doorman let you in? Bold of him."],
    [["I told the kraken story to those school kids; the chaperone has not forgiven me.", "SUBJ"], ["The thing under the quay is real; I have a hat to prove it, except I do not have the hat.", "SUBJ"], "The doorman and I have an understanding: he ignores me, I ignore the bill.", "I have watched that island for forty years; it has watched me back for forty-one.", "Went down the dungeon once, came back up — that is the whole of the story and the miracle of it.", "The Quay's End sends a fella over some nights; we do not learn his name, he likes it that way."]);
  // CONCIERGE / HOTEL — posh, extended; keeps the anchor line
  setPool("hotel", "posh",
    ["A room, dear? Of course there is a room.", "You have the look of someone who would rather be lying down.", "The Gilded Kraken; mind the name, mind the prices.", "Come in out of the plot, dear."],
    [["Nothing down there worth roughing it for, dear.", "SUBJ"], "The pillows are changed daily; the gulls, alas, are not.", "The Rusty Anchor? We do not speak of the Rusty Anchor.", "The dungeon is a phase, dear; the suite is forever, or until checkout.", "Comfort precedes you everywhere, including, regrettably, the doorman's nose.", "The harbour view is included; the appreciation of it is extra."]);
  // DOORMAN — the Rusty Anchor, barely speaks
  setPool("doorman", "brooklyn",
    ["Yeah.", "We are open. Do not make it a thing.", "You drinking, or looking?", "Door is behind you if the answer is neither."],
    ["The hotel upstairs hates us; it is mutual and load-bearing.", "Salty's kraken story is forty percent kraken, sixty percent Salty.", "You smell like the spa, I turn you away. Policy. I like policy.", "The Quay's End sends a man over; he drinks alone, we let him.", "The dungeon thins the regulars; we keep their stools a respectful while.", "Quiet is the special. It is always the special."]);

  // ---- contact-dialogue resolver: named spec -> type pool -> GENERIC --------
  function dialogue(voiceId, type) {
    function pool(id, key) { var s = SPECS[id]; return (s && s[key] && s[key].length) ? s[key] : null; }
    return {
      greetings: pool(voiceId, "greetings") || pool(type, "greetings") || GENERIC.greetings,
      chat: pool(voiceId, "chat") || pool(type, "chat") || GENERIC.chat
    };
  }

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
  return { SPECS: SPECS, DUNGEON_CAST: DUNGEON_CAST, box: box, byId: byId, dialogue: dialogue, IMPACT: IMPACT, impact: impact, _trig: TRIG, _expand: expand };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TD_VOICES; }
