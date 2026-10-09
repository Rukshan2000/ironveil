You are an expert browser game developer specializing in TypeScript, 3D FPS games, Three.js, React, WebGL/WebGPU, game AI, and physics.

I want to create an **original browser-based tactical stealth FPS inspired by classic early-2000s military stealth games such as Project I.G.I.**

IMPORTANT:

* Do NOT copy Project I.G.I. copyrighted assets, maps, characters, sounds, missions, UI, names, or code.
* Create original assets/placeholders and original gameplay systems.
* The game must run directly in a modern desktop browser.
* Prioritize performance and clean architecture.
* Do not build everything at once. Implement the game incrementally and keep it playable after every major step.

## Technology Stack

Use:

* TypeScript
* React
* Vite
* React Three Fiber
* Three.js
* Rapier physics
* Zustand for game state
* HTML/CSS/Tailwind for menus and HUD
* Blender-compatible GLB/GLTF assets
* Web Audio API for sound
* Vitest for unit tests where useful

Prefer WebGL compatibility first, but structure the renderer so WebGPU can be introduced later.

## Core Game Concept

Create a first-person tactical stealth shooter.

The player is an operative infiltrating a military facility.

Gameplay should emphasize:

* stealth
* reconnaissance
* enemy detection
* tactical shooting
* patrols
* alarms
* mission objectives
* extraction

Example mission:

"INFILTRATION"

The player starts outside a heavily guarded facility.

Objectives:

1. Reach the facility perimeter.
2. Avoid or neutralize guards.
3. Enter the communications building.
4. Hack/download intelligence.
5. Trigger an extraction objective.
6. Reach the extraction zone.

## Phase 1 — Playable Prototype

First create ONLY the following:

### Player

Implement:

* WASD movement
* mouse look
* first-person camera
* sprint
* crouch
* jump
* gravity
* collision
* basic stamina
* pointer lock
* smooth camera movement

Controls:

W/A/S/D = movement
Shift = sprint
Ctrl = crouch
Space = jump
Mouse = look
Left click = shoot
Right click = aim
R = reload
Esc = release mouse

The player should feel like a tactical FPS rather than a floating camera.

### Weapon

Create one original assault rifle prototype.

Implement:

* hip fire
* ADS
* fire rate
* magazine
* reload
* recoil
* muzzle flash
* bullet raycast
* hit detection
* basic weapon sound placeholder
* crosshair

Use a simple placeholder weapon model initially.

Create a weapon system that can later support:

* pistol
* SMG
* assault rifle
* sniper rifle
* shotgun

Do NOT hard-code everything into one weapon component.

Use reusable weapon configuration.

Example conceptual structure:

WeaponDefinition

* id
* name
* damage
* fireRate
* magazineSize
* reloadTime
* recoil
* spread
* range

## Enemy AI

Create basic enemy guards.

Each guard should have:

IDLE
→ PATROL
→ SUSPICIOUS
→ ALERT
→ COMBAT
→ SEARCH

Implement:

* patrol points
* field of view
* vision detection
* distance detection
* hearing placeholder
* investigation
* alert state
* weapon firing
* health
* death

Enemy vision should not simply detect the player from anywhere.

Use:

* distance check
* FOV check
* raycast line-of-sight

Create a visible debug vision cone during development.

## Stealth System

Implement a basic stealth value based on:

* distance
* player movement
* crouching
* line of sight
* lighting placeholder

Display an optional stealth/debug indicator.

Example:

Hidden
Suspicious
Detected

## Environment

Create a small military compound using procedural/simple geometry first.

Include:

* perimeter wall
* gate
* warehouse
* control building
* guard tower
* roads
* crates
* containers
* fences
* lights
* extraction zone

Do not spend time making beautiful assets yet.

Use primitive geometry where necessary.

The goal is gameplay first.

## Mission System

Create a reusable mission system.

Mission objectives should support:

* reach location
* eliminate target
* collect item
* interact with object
* hack terminal
* extract

Create:

Mission
Objective
ObjectiveManager

The HUD should show the current objective.

## HUD

Create a clean tactical HUD.

Display:

* crosshair
* health
* stamina
* ammo
* current weapon
* objective
* detection state
* optional minimap

Style:

dark military/tactical UI.

Avoid copying the original I.G.I. interface.

## Architecture

Use a clean architecture.

Suggested structure:

src/

app/
components/
game/
player/
weapons/
enemies/
ai/
missions/
physics/
world/
audio/
effects/
entities/
systems/
state/
hooks/
utils/
assets/
ui/

Separate:

* rendering
* game logic
* state
* physics
* AI
* UI

Do not put the entire game inside App.tsx.

## Performance

The game should target:

* 60 FPS on normal desktop hardware
* efficient rendering
* frustum culling
* instancing where appropriate
* limited dynamic lights
* compressed textures
* GLTF/GLB models
* object reuse where appropriate

Avoid unnecessary React re-renders inside the game loop.

Use refs/game-loop systems for high-frequency game state.

## Developer Features

Add a development/debug mode.

Keyboard:

F1 = debug mode

Debug mode should optionally show:

* FPS
* player position
* enemy states
* enemy vision cones
* raycasts
* collision information
* current mission objective
* entity count

## Project Requirements

Before writing code:

1. Inspect the existing repository.
2. Determine whether a project already exists.
3. Do not overwrite existing functionality unnecessarily.
4. Check package.json.
5. Check TypeScript configuration.
6. Check Vite configuration.
7. Check existing source structure.
8. Explain what already exists.

Then implement Phase 1.

## Development Rules

Follow these rules strictly:

1. Keep the project runnable after each change.
2. Use TypeScript properly.
3. Avoid `any` unless absolutely necessary.
4. Create reusable components and systems.
5. Do not create giant files.
6. Do not duplicate game logic.
7. Keep game-loop code separate from React UI.
8. Add comments only where they provide useful context.
9. Do not install unnecessary dependencies.
10. Prefer existing dependencies if they already provide the required functionality.
11. Test the application after implementation.
12. Fix TypeScript/build/runtime errors before finishing.

## Asset Strategy

Initially use:

* primitive geometry
* procedural materials
* simple placeholder weapons
* simple placeholder enemies
* simple environment

Later we can replace them with original GLB/GLTF assets.

Create the asset system so replacing placeholders does not require rewriting gameplay code.

## Future Roadmap

Design the architecture so these can be added later:

Phase 2:

* better weapons
* better enemy AI
* animations
* sound
* doors
* interactive terminals
* alarms

Phase 3:

* vehicles
* helicopters
* larger environments
* sniper mechanics
* explosives
* security cameras
* night missions

Phase 4:

* multiple missions
* mission selection
* save system
* inventory
* weapon customization

Phase 5:

* multiplayer/co-op if technically appropriate

## Important

Do NOT attempt to build all future phases now.

Start with a polished **Phase 1 playable prototype**.

At the end:

1. Run the development/build commands.
2. Fix all errors.
3. Tell me exactly what files were created/modified.
4. Tell me how to run the game.
5. Tell me what is currently playable.
6. List the next recommended development steps.

Most importantly:

**Build the actual working prototype, not just documentation or pseudocode.**
