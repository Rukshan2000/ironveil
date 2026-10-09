The game now has a large tactical mission, but there are areas that are currently difficult or impossible to play properly.

I want you to perform a major **GAMEPLAY + CONTROLS + PLAYABILITY + FPS POLISH upgrade**.

The goal is:

> Make the game feel like a complete, polished tactical FPS that can actually be played from beginning to end.

Do NOT focus only on graphics.

Focus on:

* player controls
* aiming
* ADS
* zoom
* shooting
* movement
* collisions
* navigation
* interaction
* weapons
* combat
* AI
* vehicles
* mission objectives
* checkpoints
* level accessibility
* camera
* UI
* game feel

The player should NEVER get stuck in a location or reach an area where the game becomes impossible to continue.

==================================================

1. PLAY THE ENTIRE GAME FIRST
   ==================================================

Before changing code:

Actually play/test the entire mission from:

START
→ infiltration
→ facility
→ objectives
→ combat
→ alarm
→ extraction
→ mission complete

Do not assume the current systems work.

Look specifically for:

* unreachable objectives
* blocked doors
* invisible walls
* impossible jumps
* stuck player
* bad collisions
* player falling through terrain
* player getting trapped between objects
* camera clipping
* enemies spawning inside geometry
* objectives without interaction
* inaccessible buildings
* impossible enemy encounters
* broken extraction
* broken mission progression

Fix these issues before adding unnecessary features.

==================================================
2. PLAYER CONTROLLER 2.0
========================

Make the player controller feel like a proper tactical FPS.

Movement:

W = forward
S = backward
A = left
D = right

Shift = sprint
Ctrl = crouch
Space = jump

Add:

* acceleration
* deceleration
* walking
* running
* sprinting
* crouching
* smooth stance transition
* realistic movement speed
* stamina
* landing
* step-up handling
* slopes
* stairs
* small obstacles

Do not make movement floaty.

The player should have physical weight.

==================================================
3. CROUCH
=========

Crouch must actually affect gameplay.

While crouching:

* camera height decreases
* movement slows
* detection decreases
* weapon position changes
* player collision height changes
* footsteps become quieter

Prevent the player from standing if there is not enough headroom.

Use proper capsule/character collision handling.

==================================================
4. PRONE SYSTEM
===============

Add prone if the current level design supports it.

Key:

Z = prone

Prone:

* very low camera
* very slow movement
* improved stealth
* reduced recoil
* different weapon positioning

Before allowing prone:

Check whether there is enough space.

Do not allow the player to stand/prone inside geometry.

==================================================
5. LEAN SYSTEM
==============

Add tactical leaning.

Q = lean left
E = lean right

Implement:

* camera lean
* weapon lean
* body offset
* collision awareness

The player should be able to peek around:

* walls
* doors
* corners
* vehicles

Do not allow the camera to move through walls.

==================================================
6. AIM DOWN SIGHTS
==================

ADS must feel realistic.

Right mouse button:

HOLD = ADS

When ADS:

* smoothly move weapon to sight position
* reduce FOV
* reduce weapon sway
* reduce movement speed
* improve accuracy
* increase stamina usage if appropriate

Add configurable ADS transition speed.

Do NOT instantly teleport the weapon into position.

==================================================
7. ZOOM SYSTEM
==============

Implement proper weapon optics.

Support:

1x
2x
4x
8x

For sniper/optic weapons:

Mouse wheel while ADS = zoom

Example:

Mouse wheel up → zoom in

Mouse wheel down → zoom out

Zoom should smoothly change FOV.

Add:

* scope overlay
* reticle
* realistic scope movement
* scope sway
* breathing effect

For sniper rifles:

SHIFT while scoped can optionally stabilize breathing.

Do not make zoom available on weapons that do not have optics.

==================================================
8. FREE LOOK
============

Allow the player to look around naturally.

Support:

* mouse look
* smooth sensitivity
* configurable sensitivity
* ADS sensitivity
* scoped sensitivity

Add settings:

Mouse Sensitivity
ADS Sensitivity
Scope Sensitivity
Invert Y

Persist settings locally.

==================================================
9. WEAPON SWITCHING
===================

Implement:

1 = primary
2 = secondary
3 = special/equipment

Mouse wheel = weapon switching

Weapon switch should have:

* animation
* sound
* weapon transition
* correct ammo state

Do not allow firing during weapon transition.

==================================================
10. RELOAD SYSTEM
=================

Create realistic reload states.

R = reload

Support:

NORMAL RELOAD
EMPTY RELOAD
TACTICAL RELOAD

The weapon should:

* remove magazine
* insert magazine
* chamber round where appropriate

Do not instantly refill ammo.

Allow reload interruption where appropriate.

==================================================
11. WEAPON INSPECTION
=====================

Add:

I = inspect weapon

The player can briefly inspect the weapon.

This is optional gameplay polish but should feel professional.

==================================================
12. GRENADE / EQUIPMENT SYSTEM
==============================

Create equipment slots.

Example:

G = grenade

Support:

* fragmentation grenade
* smoke grenade
* flashbang

Implement:

* pull pin
* throwing animation
* trajectory preview optionally
* projectile physics
* explosion
* radius damage
* sound
* smoke
* AI reaction

Do not spam particle objects.

Use pooling.

==================================================
13. WEAPON FEEL
===============

Weapons should feel significantly more physical.

Add:

* recoil
* recoil recovery
* muzzle flash
* muzzle smoke
* shell ejection
* weapon sway
* camera recoil
* ADS transition
* firing animation
* reload animation
* mechanical sounds
* impact sounds

Different weapons should feel different.

Examples:

PISTOL

* low recoil
* fast handling

ASSAULT RIFLE

* moderate recoil
* medium handling

SMG

* low damage
* high fire rate

SNIPER

* high damage
* slow handling
* scope
* strong recoil

==================================================
14. DAMAGE SYSTEM
=================

Implement proper damage.

Support hit locations:

HEAD
CHEST
STOMACH
ARMS
LEGS

Damage should vary by:

* weapon
* distance
* hit location
* armor

Add:

* player health
* armor
* enemy health
* hit reactions
* death

Do not make enemies bullet sponges.

==================================================
15. PLAYER DAMAGE FEEDBACK
==========================

When the player is hit:

* directional damage indicator
* subtle screen effect
* health update
* sound
* weapon/camera reaction

Avoid excessive red-screen effects.

The player must understand:

"Where did I get shot from?"

==================================================
16. FOOTSTEP SYSTEM
===================

Footsteps should depend on surface.

Support:

CONCRETE
METAL
GRASS
DIRT
WOOD
STAIRS

Movement should affect sound:

SLOW WALK
WALK
RUN
SPRINT
CROUCH

AI hearing should use these sounds.

==================================================
17. INTERACTION SYSTEM
======================

Create a reliable interaction system.

E = interact

Support:

* doors
* terminals
* switches
* alarm panels
* keycards
* weapons
* vehicles
* mission objects

Display:

[ E ] Open Door

[ E ] Hack Terminal

[ E ] Enter Vehicle

Interaction must be context-sensitive.

Never allow interaction prompts to appear through walls.

==================================================
18. DOORS
=========

Doors need proper states:

OPEN
CLOSED
LOCKED
LOCKED_BY_ALERT
OPENING
CLOSING

Add:

* animation
* sound
* collision
* interaction

Prevent doors from blocking the player permanently.

==================================================
19. CLIMB / VAULT
=================

Add basic traversal.

Allow the player to climb/vault over:

* low walls
* fences
* small obstacles
* crates

Do not allow unrealistic climbing.

Use a clear height limit.

Example:

Low obstacle
→ Vault

High obstacle
→ Cannot climb

==================================================
20. STAIRS AND SLOPES
=====================

Fix navigation problems.

Player must smoothly handle:

* stairs
* ramps
* slopes
* uneven terrain
* small steps

No bouncing.

No getting stuck.

No sliding on normal surfaces.

==================================================
21. COLLISION QUALITY
=====================

Audit the entire map.

Check:

* buildings
* walls
* doors
* fences
* stairs
* vehicles
* crates
* terrain
* rocks
* props

The player must never:

* fall through the map
* walk through walls
* get permanently trapped
* get stuck inside objects

Add a safe recovery system.

If the player falls outside the playable area:

→ teleport to the last valid position/checkpoint.

==================================================
22. LEVEL ACCESSIBILITY AUDIT
=============================

Every mission objective must be physically reachable.

Create a development validation system.

For every objective:

Check:

* navigation path exists
* required door can open
* required interaction exists
* player can physically reach it
* extraction is reachable

Create debug mode:

F2 = Level Validation

Show:

GREEN = reachable

RED = unreachable

YELLOW = warning

==================================================
23. MINIMAP
===========

Add a useful tactical minimap.

Display:

* player
* objective
* extraction
* discovered enemies
* discovered cameras
* important doors

Do NOT reveal all enemies automatically.

Rotate minimap based on player direction or provide a setting.

==================================================
24. COMPASS
===========

Add a small compass.

Show:

N
NE
E
SE
S
SW
W
NW

Optional:

Objective direction.

Keep it subtle.

==================================================
25. OBJECTIVE NAVIGATION
========================

Never leave the player wondering what to do.

HUD should show:

OBJECTIVE

"Reach the communications building."

When appropriate:

distance

"284m"

Optional objective direction marker.

Do not turn the game into a GPS simulator.

The player should still explore.

==================================================
26. CHECKPOINT SYSTEM
=====================

Create proper checkpoints.

Checkpoints should activate after meaningful progress.

Example:

CHECKPOINT REACHED

If player dies:

Continue from latest checkpoint.

Save:

* player position
* mission objectives
* equipment
* discovered information
* mission state

Avoid restarting the entire mission after every death.

==================================================
27. DEATH SYSTEM
================

When player dies:

Show:

MISSION FAILED

Cause:

* Eliminated
* Explosion
* Fall
* Vehicle accident

Buttons:

RESTART CHECKPOINT

RESTART MISSION

MAIN MENU

==================================================
28. ENEMY COMBAT
================

Enemies should also use proper FPS mechanics.

Enemies should:

* aim
* shoot
* reload
* take cover
* reposition
* flank
* search
* retreat
* communicate

Do not make enemies stand in open areas and shoot continuously.

==================================================
29. ENEMY COVER
===============

Create a cover system.

Enemies should prefer:

* walls
* vehicles
* crates
* concrete barriers
* buildings

Cover should consider:

* distance from player
* protection
* visibility
* squad position

==================================================
30. VEHICLE GAMEPLAY
====================

If vehicles are present:

Allow the player to:

E = enter

Implement:

* enter animation/state
* driving
* steering
* acceleration
* braking
* camera
* collision
* exit

Do not allow the player to get permanently stuck inside vehicles.

==================================================
31. FALL / EDGE SAFETY
======================

Audit cliffs, rooftops and terrain.

Implement:

* fall damage
* safe slopes
* invisible boundary where appropriate
* recovery from invalid positions

Do not create arbitrary invisible walls that destroy immersion.

==================================================
32. SETTINGS MENU
=================

Create a proper settings menu.

Include:

Graphics

* quality
* shadows
* resolution scaling
* post processing

Controls

* sensitivity
* ADS sensitivity
* invert Y
* key bindings

Audio

* master
* music
* effects
* voice

Gameplay

* crosshair
* minimap
* subtitles
* detection indicators

Persist settings using localStorage.

==================================================
33. PAUSE MENU
==============

ESC should open:

RESUME
SETTINGS
RESTART CHECKPOINT
RESTART MISSION
QUIT

Pause the game correctly.

AI should stop.

Physics should stop.

Timers should stop where appropriate.

==================================================
34. TUTORIAL / TRAINING
=======================

Create a short training section.

Teach:

Movement
→ ADS
→ Shooting
→ Reload
→ Crouch
→ Lean
→ Interaction
→ Grenades
→ Objective
→ Extraction

Do not create a long tutorial.

==================================================
35. ACCESSIBILITY
=================

Add:

* subtitles
* adjustable UI scale
* configurable sensitivity
* color-independent detection indicators
* configurable key bindings
* audio volume controls

==================================================
36. PERFORMANCE
===============

Maintain 60 FPS target.

Do not update everything every render frame.

Use appropriate update rates:

PLAYER:
high frequency

WEAPON:
high frequency

AI:
10–20 updates/sec where acceptable

ENVIRONMENT:
low frequency

Use:

* object pooling
* LOD
* instancing
* frustum culling
* efficient collision
* efficient raycasts

==================================================
37. INPUT ARCHITECTURE
======================

Create a centralized input system.

Do NOT scatter keyboard checks throughout components.

Create:

InputManager

It should support:

keyboard
mouse
mouse buttons
mouse wheel

Future:

gamepad

All controls should be remappable.

==================================================
38. GAME FEEL
=============

The most important requirement:

The game must FEEL GOOD TO PLAY.

Movement should feel responsive.

Aiming should feel precise.

Shooting should feel powerful.

Reloading should feel physical.

Crouching should feel useful.

Leaning should feel tactical.

Zoom should feel natural.

Enemies should feel dangerous but fair.

Objectives should always be understandable.

The player should always know:

* where they are
* what they are doing
* what killed them
* where to go next
* what options they have

==================================================
39. FULL PLAYTEST
=================

After implementation, actually play through the complete mission.

Test at least:

1. Start mission.
2. Move through the entire map.
3. Sprint.
4. Crouch.
5. Prone.
6. Jump.
7. Lean.
8. ADS.
9. Zoom.
10. Shoot.
11. Reload.
12. Switch weapons.
13. Throw grenade.
14. Open doors.
15. Hack terminal.
16. Enter vehicle.
17. Fight enemies.
18. Escape enemies.
19. Trigger alarm.
20. Complete objectives.
21. Reach extraction.
22. Die.
23. Restart checkpoint.
24. Restart mission.
25. Pause.
26. Change settings.
27. Resume.

Fix EVERY issue discovered.

==================================================
40. FINAL QUALITY BAR
=====================

The final result should feel like:

A complete tactical FPS.

Not:

* a Three.js demo
* a graphics experiment
* a walking simulator
* an unfinished prototype

The player should be able to launch the game and play the entire mission without developer intervention.

Before finishing:

Run TypeScript checks.

Run production build.

Run the game.

Check browser console.

Fix all errors.

Check for broken physics.

Check for unreachable objectives.

Check for stuck locations.

Check for camera clipping.

Check for performance problems.

Then provide:

1. Complete list of implemented features.
2. Controls.
3. Major bugs fixed.
4. Level accessibility problems fixed.
5. Performance improvements.
6. Remaining limitations.
7. Recommended next major upgrade.

MOST IMPORTANT:

Do not only tell me what should be implemented.

IMPLEMENT IT.

Playtest the game and fix problems you discover.
