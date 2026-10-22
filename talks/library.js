/* Toolbox Talk library: the original pages of each talk, rendered verbatim
   from the source PDF, plus its Guided Talk sections in the source's own words.
   Copied from the Greiner Toolbox Talk (demo-assets/toolbox-talks/manifest.json)
   so both companies show the same talk the same way. Keyed by the talk's original
   filename, which is what pe_talk_templates.source_filename holds. Page paths are
   relative to this file's folder. Nothing here is personal data.
   An entry marked guidedOnly has no pages: the link opens straight into its
   Guided Talk (Purdue, October 12 and 13: the two ladder talks from Tony Sweet,
   word for word from the .docx files whose SHA-256 is recorded, except the
   OSHA talk's closing sentence, which points to another company's safety
   director). */
window.TBT_LIBRARY = {
  "Fall Protection.pdf": {
    "title": "Fall Protection",
    "filename": "Fall Protection.pdf",
    "sourceSha256": "151f1940e4918d98fb2810f399ca6540707e27f66b72b9b699c766e03f4fd041",
    "pages": [
      {
        "src": "fall-protection/page-01.jpg",
        "w": 900,
        "h": 1273
      },
      {
        "src": "fall-protection/page-02.png",
        "w": 900,
        "h": 1273
      }
    ],
    "sections": [
      {
        "h": "Fall Protection",
        "p": [
          "It may seem that a job can be performed more efficiently without spending the time to protect against falls. However, falls remain one of the top causes of fatalities in construction. Workers have fallen off edges of every description, especially floors and roofs, and through openings in floors, roofs, and walls. Fall protection is required whenever a worker faces serious risk of injury, including:",
          "* on structures where a worker could fall more than 7 feet",
          "* on thrustouts, trusses, beams, purlins, and plates at heights over 15 feet",
          "* on a sloped roof"
        ],
        "pgl": "page 1"
      },
      {
        "h": "Use Barriers",
        "p": [
          "To prevent accidental falls at worksites, guardrails and toeboards or other effective barriers to falls should be used. However, there will be areas where guardrails or other barriers are not feasible. In these cases, workers must use approved personal fall protection systems or positioning devices."
        ],
        "pgl": "page 1"
      },
      {
        "h": "Fall Arrests",
        "p": [
          "Two basic types of person fall protection systems that require tie off are fall arrest and travel restraint. Fall arrest systems stop a fall within a few feet of the worker's original position. A full body harness is required with a fall arrest system. The system typically consists of a full body harness, a lanyard, a rope grab, a lifeline, and a lifeline anchor. A fall arrest system must be worn when working on a rolling scaffold that is being moved or when a worker is getting on, working from or getting off suspended access equipment."
        ],
        "pgl": "page 1"
      },
      {
        "h": "Travel Restraints",
        "p": [
          "A travel restraint system prevents falls by restraining a worker from getting too close to an unprotected edge. This system usually consists of a safety belt or full body harness, a lanyard, a rope grab, a lifeline, and a lifeline anchor."
        ],
        "pgl": "page 1"
      },
      {
        "h": "Safety Nets",
        "p": [
          "When conventional fall protection or personal fall protection are not practical, safety nets must be used instead. Before using safety nets, check to see that the nets are hung with enough clearance to prevent a falling person from hitting the surface or structure below."
        ],
        "pgl": "page 1"
      },
      {
        "h": "Net Locations",
        "p": [
          "Safety nets should be placed within 10 vertical feet and never more than 30 feet below the working surface. Nets must extend at least eight feet beyond the building or structure. If the vertical distance from the working level to the net is greater than 5 feet, then the net must extend 10 feet beyond the building. A net from 10 feet to 30 feet below the working surface must extend 13 feet."
        ],
        "pgl": "pages 1–2"
      },
      {
        "h": "Right Equipment, Right Job",
        "p": [
          "If you use any type of fall protection equipment, including personal fall protection or safety nets, be sure to check that you are using the right equipment for the job, labeled as meeting the requirements of the American National Standards Institute (ANSI), and that the equipment is in good condition."
        ],
        "pgl": "page 2"
      },
      {
        "h": "Fall Protection Saves Lives",
        "p": [
          "Whenever feasible, employers should always set up temporary floors, guardrails, toeboards, or other physical barriers to falls, instead of having workers rely on tying off and nets for fall protection. When not feasible, personal fall protection or safety nets must be used. No work should proceed unless the necessary fall protection is in place. The use of fall protection can prevent serious injury and save your life."
        ],
        "pgl": "page 2"
      }
    ]
  },
  "OSHA Ladder Safety Requirements 2026.docx": {
    "title": "OSHA Ladder Safety Requirements 2026",
    "filename": "OSHA Ladder Safety Requirements 2026.docx",
    "sourceSha256": "9158785858127d740a8dc5e0b2b68d463970677212a12f2d87039271daab8d8d",
    "guidedOnly": true,
    "pages": [],
    "sections": [
      {
        "h": "OSHA Ladder Safety Requirements: The Rules Crews Actually Break",
        "p": [
          "Ladders sit in OSHA's top three most-cited standards year after year — right behind fall protection — and the reason is simple. Everyone thinks they already know how to use one. Then someone leans a damaged extension ladder at the wrong angle, climbs with a nail gun in one hand, and becomes one of the roughly 160+ workers killed in ladder falls each year, plus tens of thousands more injured badly enough to miss work."
        ]
      },
      {
        "h": "Pick the Right Ladder Before Anyone Climbs",
        "p": [
          "Half of ladder citations start with the wrong ladder for the job:",
          "* Duty rating — the ladder must hold the worker plus tools and materials. A 250-lb worker with a 60-lb tool bag needs Type IA (300 lb) or better, not the Type III homeowner special.",
          "* Material — fiberglass near any electrical work. Aluminum ladders within reach of live circuits or service drops are a citation and a body bag waiting to happen.",
          "* Length — an extension ladder must reach 3 feet above the upper landing you're stepping onto. A stepladder is the wrong tool if you're tempted to stand on the top two steps to reach."
        ]
      },
      {
        "h": "Setup: The Two Numbers That Matter",
        "p": [
          "* 4-to-1 angle. For every 4 feet of working height, the base sits 1 foot out from the wall. Quick field check: stand with your toes at the ladder's feet, arms straight out — your palms should land on the rung at shoulder height.",
          "* 3 feet above the landing. Extension ladders extend at least 3 feet past the surface you're climbing onto, and the ladder gets secured at the top (tied off) or footed at the bottom.",
          "Plus, the setup rules that get skipped when the crew is in a hurry:",
          "* Firm, level footing — no pallets, blocks, or mud. Use levelers on slopes, never a scrap of plywood.",
          "* Both spreaders fully locked on stepladders. A half-open A-frame is a folding machine.",
          "* Barricade or flag the base in doorways and traffic paths or lock the door.",
          "* Never on top of scaffolds, boxes, or truck beds to \"get a little more height.\""
        ]
      },
      {
        "h": "Climbing: 3-Point Contact, Belt Buckle, Empty Hands",
        "p": [
          "* Three points of contact at all times — two hands and a foot, or two feet and a hand. Tools go up on a hoist line or a tool belt, never in your hand.",
          "* Belt buckle inside the rails. The moment your buckle passes the side rail, you're overreaching — climb down and move the ladder. This one habit prevents most tip-overs.",
          "* No standing on the top step or top cap of a stepladder (or the top 3 rungs of an extension ladder). It's on the warning label because people die doing it.",
          "* Face the ladder going up and down. One person on the ladder at a time."
        ]
      },
      {
        "h": "Inspect Before First Use on Each Shift",
        "p": [
          "OSHA requires a competent person to inspect ladders periodically and after anything that could damage them — best practice is a 30-second check before first use each shift:",
          "* Rails: cracks, splits, dents, bends — especially after a drop or a ride in a loose truck bed",
          "* Rungs: bent, missing, greasy, or coated in mud",
          "* Feet: pads present and intact, not worn smooth",
          "* Hardware: rung locks, spreaders, ropes and pulleys working; rivets tight",
          "* Labels: duty rating readable",
          "Found a defect? Tag it \"Do Not Use\" and pull it from service — don't lean it back against the Conex for the next guy. Defective ladders left in circulation are their own citation under 1926.1053(b)(16)."
        ]
      },
      {
        "h": "When a Ladder Is the Wrong Answer",
        "p": [
          "If the task means working from the ladder for long stretches, handling heavy or awkward material, or pushing/pulling with force (drilling into concrete, pulling wire), a ladder is usually the wrong tool — that's scissor lift, scaffold, or platform ladder territory."
        ]
      }
    ]
  },
  "Falls from Ladder.docx": {
    "title": "Falls from Ladder",
    "filename": "Falls from Ladder.docx",
    "sourceSha256": "20cb565f144bc92d18c28451e0e9d99a668eed621e3d193bb20391179191de52",
    "guidedOnly": true,
    "pages": [],
    "sections": [
      {
        "h": "Fatal Ladders Falls",
        "p": [
          "On March 3, 1996, a 29-year-old service worker was using a three-foot stepladder to reach the overhead work area. He fell only three feet to the plywood floor below. However, the force of the fall caused his aorta to rupture killing him instantly.",
          "* Falls from ladders are the leading cause of injury among mechanical service workers. Stepladders are involved in a large percentage of these falls.",
          "* Inspect your stepladder before you use it. If there is any damage, such as cracks, missing rungs, missing rivets, bending, warping, etc., take it out of service immediately.",
          "* Check each step for ice, mud, Snow, grease, oil or anything else that could cause a slip. If one of these slip hazards is present, clean the ladder off thoroughly before using it.",
          "* Check the bottom of your work shoes or boots before using the ladder. There may be mud or grease on them as well.",
          "* Never use any stepladder as a straight ladder. They are designed to support your weight only in a fully open position.",
          "* Never use the top platform and the first rung from the top as steps.",
          "* Don't use the supports on the back of the ladder as steps. They are not made to support your weight.",
          "* Never use stepladders as scaffold or platform supports. They are not made to support or balance the weight that would be placed upon them.",
          "* Make sure the ground is level under all four feet and that the ladder is locked in a fully Open position before starting to climb.",
          "On December 5, 1996, a 34 -year- old service worker was descending a ladder from a rooftop. His weight on the ladder caused the rain gutter to break and the ladder to fall. He fell 18 feet to his death.",
          "* Falls from ladders are the leading cause of injury among service workers.",
          "* Reaching out from ladders and carrying tools, equipment and materials by hand are the leading causes of falls from ladders. Keep your hands free to climb and pull other items up by rope after you are safely off the ladder.",
          "* Ladders are classified by the weight they are designed to hold safely. Make Sure your ladder is designed to hold your weight plus the weight of your tool belt. Look for the ladder rating on the rails.",
          "* Type IA - ladders are rated up to 300 pounds.",
          "* Type I - ladders are rated up to 250 pounds.",
          "* Type II - ladders are rated up to 225 pounds.",
          "* Type III - ladders are rated up to 200 pounds.",
          "* Inspect the ladder each time you are going to use it. If there is any damage to the ladder such as cracked, broken or missing rungs, cracked side rails, missing feet or any other damage, remove it from service.",
          "* Set the ladder at the proper pitch. For each four feet of height the ladder should be one foot out from vertical. For example, a ladder accessing a 24-foot-high landing from a level surface should be pitched out six feet from vertical.",
          "* Set the ladder up on a level, non-slippery surface and secure it in p by bracing it at the bottom and/or tying it at the top.",
          "* Make sure the ladder you choose extends at least three feet above the roof, deck, platform or landing area.",
          "* Make sure there is no mud or grease on the rungs or on your shoes or boots."
        ]
      },
      {
        "h": "What selecting the ladder actually means for you.",
        "p": [
          "JOBSITE - An overloaded ladder fails as a structural collapse, not a slow bend. Failure during use is an OSHA recordable, a stop-work, and a hard conversation with the GC. The Type IA ladder costs roughly $40 more than the Type II it replaces. Cheapest insurance on the truck.",
          "Individual - More than 300 people die in ladder-related incidents each year, and 175,000 end up in the ER. Most overloaded-ladder failures happen at the rung joint or rail. There’s no warning. The rung simply gives, and you’re falling before you know what happened.",
          "Home - Same reading at home. The cheap aluminum step ladder in the garage is almost always Type II or Type III. Once you add a 200-lb adult, a heavy bucket of paint, and a roll of gutter screen, you’re past the rating. The label tells you. Read it before you climb."
        ]
      }
    ]
  },
  /* Video Toolbox Talk: the public YouTube video Tony Sweet supplied (Oct 19 test).
     A video entry has no pages and no sections: the link plays the video on the page. */
  "Driver Safety: Proper Positioning": {
    "title": "Driver Safety: Proper Positioning",
    "filename": "Driver Safety: Proper Positioning (video)",
    "video": { "provider": "youtube", "id": "94wWLo0IEjw", "seconds": 112 },
    "pages": [],
    "sections": []
  }
};
