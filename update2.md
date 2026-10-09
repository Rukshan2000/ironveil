The current browser FPS prototype is working.

Now make the **next major upgrade: build a complete, playable Mission 01**.

The goal is to transform the project from a shooting sandbox into a real tactical stealth/infiltration game.

The mission should feel like a serious classic military tactical FPS, inspired by the gameplay philosophy of early-2000s infiltration shooters, while remaining completely ORIGINAL.

IMPORTANT:

* Do NOT copy Project I.G.I. maps, missions, characters, dialogue, models, textures, sounds, UI, code, or other copyrighted assets.
* Create original locations, mission objectives, characters, names, dialogue, and assets.
* Do not just create a prettier demo.
* Build a complete playable mission with beginning → infiltration → objectives → escalation → extraction → mission result.
* Reuse the existing systems wherever possible.
* Do not rewrite working systems unnecessarily.

==================================================

1. FIRST INSPECT THE CURRENT PROJECT
   ==================================================

Before changing anything:

1. Inspect the repository.
2. Run the current game.
3. Understand the existing architecture.
4. Identify:

   * player system
   * weapons
   * physics
   * AI
   * environment
   * HUD
   * audio
   * mission system
   * state management
5. Identify systems that can be extended.
6. Do not duplicate existing functionality.

Then create a short implementation plan and start implementing.

==================================================
2. MISSION CONCEPT
==================

Create an original mission called:

"OPERATION NIGHTFALL"

Scenario:

The player is an operative infiltrating a heavily guarded military communications facility.

Mission goal:

Enter the facility, obtain intelligence from a secure communications terminal, disable the facility's communication network, and reach the extraction zone.

The player should have multiple approaches.

Example:

APPROACH A
Stealth infiltration through the perimeter.

APPROACH B
Enter through a maintenance route.

APPROACH C
Risky direct entrance through the main gate.

Do not force one solution.

The player should be able to improvise.

==================================================
3. MISSION FLOW
===============

Create the following structure:

MISSION BRIEFING
↓
INSERTION
↓
RECONNAISSANCE
↓
INFILTRATION
↓
FACILITY ENTRY
↓
INTELLIGENCE OBJECTIVE
↓
COMMUNICATIONS DISABLE
↓
ALARM / ESCALATION
↓
EXTRACTION
↓
MISSION RESULTS

The mission should be playable from beginning to end.

==================================================
4. LARGE MILITARY FACILITY
==========================

Upgrade the current environment into a believable military installation.

Create:

OUTER AREA

* terrain
* roads
* grass
* rocks
* fences
* perimeter walls
* gates
* guard posts
* watch towers
* searchlights

FACILITY AREA

* warehouse
* administration building
* communications building
* vehicle area
* maintenance building
* power station
* security checkpoint
* storage area

INTERIOR

* corridors
* rooms
* offices
* control rooms
* server/communications room
* maintenance areas
* stairways
* restricted areas

Do not create everything as simple cubes.

Use modular environment pieces so the map can be expanded later.

==================================================
5. WORLD DESIGN
===============

Create multiple routes through the facility.

For example:

```
                MAIN GATE
                   │
             SECURITY POST
                   │
    ┌──────────────┼──────────────┐
    │              │              │
```

WAREHOUSE       MAIN ROAD      ADMIN AREA
│              │              │
MAINTENANCE      CHECKPOINT    COMMAND
│              │              │
└──────────────┼──────────────┘
│
COMMUNICATIONS
│
EXTRACTION

Also create alternative routes:

* fence breach
* maintenance tunnel
* side entrance
* rooftop access
* back entrance

The player should be able to choose their route.

==================================================
6. SQUAD-BASED ENEMY AI
=======================

Upgrade the existing enemy AI significantly.

Enemies should operate as groups instead of isolated NPCs.

Enemy states:

IDLE
PATROL
SUSPICIOUS
INVESTIGATING
ALERT
SEARCHING
COMBAT
FLANKING
RETREATING
CALLING_REINFORCEMENTS
DEAD

Create squad concepts:

Squad
SquadMember
SquadLeader

The squad leader can coordinate nearby enemies.

==================================================
7. ENEMY PERCEPTION
===================

Enemies should detect the player using:

VISION
HEARING
LAST_KNOWN_POSITION

Vision should consider:

* distance
* field of view
* line of sight
* lighting
* player stance
* player movement

Hearing should consider:

* footsteps
* gunshots
* explosions
* doors
* player movement

Do not make enemies magically know the player's exact location.

==================================================
8. ALERT PROPAGATION
====================

Create a proper facility alert system.

Example:

Guard sees player
↓
Guard becomes ALERT
↓
Radio message
↓
Nearby squad notified
↓
Security level increases
↓
Reinforcements dispatched
↓
Facility enters HIGH ALERT

Security levels:

LEVEL 0
Normal

LEVEL 1
Suspicious activity

LEVEL 2
Local alert

LEVEL 3
Facility alert

LEVEL 4
Full lockdown

Make the entire facility react to the alert level.

==================================================
9. RADIO SYSTEM
===============

Create a simple radio communication system.

Examples:

"Check the west perimeter."

"Movement reported near the warehouse."

"Unit two, investigate."

"All units, remain alert."

"Lock down the communications building."

"Intruder confirmed."

Use placeholder audio or generated/simple audio hooks initially.

Architecture should support real voice files later.

==================================================
10. REINFORCEMENTS
==================

When the facility reaches higher alert levels:

Spawn or dispatch reinforcements from believable locations.

For example:

* guard barracks
* vehicle area
* security building

Do not randomly spawn enemies directly beside the player.

Use reinforcement routes.

Create:

ReinforcementManager

It should know:

* available squads
* spawn locations
* maximum active enemies
* alert level
* reinforcement cooldown

==================================================
11. SECURITY SYSTEM
===================

Add:

SECURITY CAMERAS

* rotation
* FOV
* detection
* alarm

SEARCHLIGHTS

* rotating lights
* detection

ALARMS

* alarm panel
* alarm state
* siren

LOCKED DOORS

* access cards
* hacking
* forced access

RESTRICTED AREAS

* unauthorized entry detection

==================================================
12. MISSION OBJECTIVES
======================

Create a reusable objective framework.

Support:

ReachLocation
Interact
HackTerminal
CollectIntel
DisableSystem
DestroyObject
EliminateTarget
Extract

Primary objectives:

1. Reach the facility.
2. Access the communications building.
3. Download intelligence.
4. Disable communications.
5. Reach extraction.

Secondary objectives:

* disable security cameras
* collect additional intelligence
* avoid triggering the alarm
* locate access credentials

Optional objectives should affect mission results.

==================================================
13. MISSION STATE
=================

Create a proper mission state machine.

States:

BRIEFING
INSERTION
ACTIVE
OBJECTIVE_COMPLETE
ALERT
LOCKDOWN
EXTRACTION
SUCCESS
FAILED

Mission state should persist independently from React rendering.

==================================================
14. EXTRACTION
==============

Create a proper extraction sequence.

After completing the primary objectives:

HUD:

"EXTRACTION AVAILABLE"

The player must reach a specific extraction zone.

While travelling there:

* enemies may search for the player
* facility may remain on alert
* reinforcements may continue
* alarms may remain active

At extraction:

* verify objective completion
* trigger extraction sequence
* freeze/transition mission state
* display mission results

==================================================
15. MISSION RESULTS
===================

Create a professional mission-results screen.

Display:

MISSION COMPLETE

Primary Objectives:
✓ Completed

Secondary Objectives:
✓ / ✗

Detection:
None / Suspicious / Detected

Alarm:
Not Triggered / Triggered

Enemies:
Neutralized

Time:
00:00

Intelligence:
Collected

Do NOT create a score/ranking system unless it is useful to gameplay.

==================================================
16. TACTICAL MAP
================

Create a tactical map.

The player should be able to view:

* facility layout
* player position
* extraction zone
* objectives
* discovered security systems
* optionally discovered enemies

Do not reveal every enemy automatically.

Information should depend on reconnaissance.

==================================================
17. RECONNAISSANCE
==================

Add binoculars.

Controls:

B = binoculars

Binocular mode:

* zoom
* distance view
* target identification
* optional enemy tagging

Player can observe patrols before entering.

This should make reconnaissance an important gameplay mechanic.

==================================================
18. STEALTH GAMEPLAY
====================

Stealth should actually matter.

Factors:

* player stance
* movement speed
* lighting
* distance
* line of sight
* sound

Example:

CROUCH + DARK AREA + SLOW MOVEMENT

should be significantly harder to detect than:

SPRINT + OPEN AREA + BRIGHT LIGHT

Avoid making stealth binary.

Use a detection meter.

==================================================
19. ENVIRONMENT INTERACTION
===========================

Implement useful interactions.

Examples:

* doors
* terminals
* switches
* alarm panels
* access cards
* crates
* ladders
* elevators where practical

Use:

E = interact

Show a small contextual interaction prompt.

==================================================
20. PLAYER EXPERIENCE
=====================

The mission should create tension.

Example gameplay:

Player observes two guards.

One guard patrols away.

Player moves through shadows.

A camera sweeps across the area.

Player waits.

Camera turns away.

Player crosses the road.

A guard hears movement.

Guard investigates.

Player hides.

Guard returns to patrol.

Player enters maintenance building.

This should feel like an infiltration game, not an arena shooter.

==================================================
21. WORLD EVENTS
================

Add scripted events.

Examples:

* vehicle drives through checkpoint
* guard changes patrol route
* searchlight changes direction
* radio announcement
* security door locks
* alarm activates
* reinforcement convoy arrives

Use a reusable event system.

==================================================
22. VEHICLE FOUNDATION
======================

Do not build a complete vehicle simulator yet.

Create the architecture for:

Vehicle
VehicleController
VehicleSpawner
VehicleAI

Add one simple military jeep/truck for environmental use.

Later this system can support:

* player driving
* vehicle missions
* convoy AI
* helicopters

==================================================
23. AUDIO
=========

Make the facility feel alive.

Add positional ambient sounds:

* wind
* machinery
* electrical equipment
* distant vehicles
* footsteps
* radio
* guards
* alarms
* searchlights
* doors

Use audio zones.

Example:

OUTSIDE
→ wind + insects + distant vehicles

WAREHOUSE
→ machinery + echoes

CONTROL ROOM
→ electronics + radio

==================================================
24. GRAPHICS
============

Use the previous graphics improvements.

Further improve:

* terrain
* materials
* lighting
* shadows
* vegetation
* atmospheric fog
* particles
* decals
* environmental details

The goal is a believable military facility.

Avoid excessive post-processing.

Performance is still important.

==================================================
25. PERFORMANCE
===============

Target 60 FPS on modern desktop browsers.

Use:

* LOD
* frustum culling
* instancing
* asset pooling
* texture compression
* efficient shadows
* efficient AI updates
* object pooling
* chunk/sector loading if necessary

Do not run expensive AI calculations every render frame.

Use appropriate update intervals.

==================================================
26. SAVE / CHECKPOINT FOUNDATION
================================

Create the foundation for mission checkpoints.

Save:

* mission state
* objectives
* player position
* inventory
* discovered information
* alert state where appropriate

Do not implement a complicated cloud save system yet.

Local persistence is enough for now.

==================================================
27. UI
======

Create:

MISSION BRIEFING
TACTICAL MAP
HUD
OBJECTIVE PANEL
INTERACTION PROMPT
DETECTION INDICATOR
ALERT INDICATOR
MISSION RESULTS

Keep the visual style:

* military
* restrained
* dark
* functional
* modern
* believable

Do not copy I.G.I.'s exact UI.

==================================================
28. CODE ARCHITECTURE
=====================

Keep systems modular.

Recommended:

game/
missions/
objectives/
ai/
squads/
perception/
security/
world/
environment/
vehicles/
interaction/
audio/
reconnaissance/
extraction/

systems:

MissionSystem
ObjectiveSystem
AlertSystem
SquadSystem
PerceptionSystem
SecuritySystem
ReinforcementSystem
InteractionSystem
ReconSystem
ExtractionSystem
WorldEventSystem

Do not create a giant Mission.ts file.

==================================================
29. IMPORTANT DEVELOPMENT RULE
==============================

Do NOT generate fake functionality.

If something cannot yet be implemented properly:

* create a clean interface
* create a working basic implementation
* clearly mark future extension points

Do not pretend a feature is complete when it is only visual.

==================================================
30. TESTING
===========

After implementation:

Run:

* TypeScript checks
* build
* development server
* browser runtime

Test:

1. Mission starts.
2. Player can infiltrate.
3. Guards patrol.
4. Guards detect player.
5. Guards investigate sounds.
6. Alert propagates.
7. Reinforcements arrive.
8. Objectives update.
9. Terminal can be hacked.
10. Communications can be disabled.
11. Extraction becomes available.
12. Player can extract.
13. Mission results appear.
14. Mission can restart.

Fix all runtime errors.

==================================================
31. FINAL QUALITY BAR
=====================

The final result should feel like:

"An actual tactical infiltration mission running in a browser."

NOT:

"A Three.js technology demo."

The player should have:

* a reason to explore
* multiple routes
* meaningful stealth
* intelligent enemies
* escalating consequences
* clear objectives
* tactical decision-making
* a proper beginning
* a proper ending

Most importantly:

BUILD THE ACTUAL MISSION.

Do not only write documentation.

At the end report:

1. Files created
2. Files modified
3. New systems
4. Mission flow
5. AI improvements
6. Security improvements
7. Performance considerations
8. Known limitations
9. How to run the mission
10. Recommended next major upgrade

Keep the entire implementation original and do not reproduce copyrighted Project I.G.I. content.
