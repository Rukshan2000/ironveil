The Phase 1 playable prototype is complete.

Now upgrade the game substantially so it feels like a **realistic tactical military FPS inspired by the gameplay and atmosphere of classic games such as Project I.G.I.**, rather than a basic Three.js prototype.

IMPORTANT:

* Do NOT copy Project I.G.I. models, textures, maps, sounds, characters, UI, missions, animations, or source code.
* Recreate the general gameplay philosophy and visual atmosphere using original assets and systems.
* The result should feel like a serious military infiltration game.
* Prioritize realism, immersion, lighting, animation, physics, sound, and environmental detail.
* Do not sacrifice FPS performance unnecessarily.

Before making changes, inspect the current implementation and understand the existing architecture. Reuse existing systems instead of rewriting working functionality.

# 1. VISUAL QUALITY UPGRADE

The current graphics should no longer look like primitive placeholder geometry.

Upgrade the environment toward a realistic military installation.

Create:

* realistic concrete
* asphalt
* dirt
* grass
* metal
* rusty surfaces
* painted military structures
* fences
* gates
* pipes
* electrical boxes
* cables
* crates
* barrels
* containers
* vehicles
* watch towers
* security buildings
* warehouses
* roads
* terrain variation

Use physically based materials.

Materials should support:

* albedo
* roughness
* metalness
* normal maps
* ambient occlusion where appropriate

Use GLTF/GLB for detailed assets.

If real assets are unavailable, create procedural/detail-enhanced placeholders rather than leaving everything as flat cubes.

# 2. REALISTIC LIGHTING

Completely improve the lighting.

Implement:

* directional sunlight
* realistic shadows
* ambient lighting
* hemisphere/environment lighting
* contact shadows where practical
* emissive lights
* indoor/outdoor lighting differences
* flashlight
* street lamps
* security lights

Create a convincing outdoor military environment.

Add:

* sunrise/sunset lighting
* darker indoor areas
* shadows around buildings
* light coming through windows
* atmospheric depth

Avoid excessive bloom.

The scene should remain readable and tactical.

# 3. ATMOSPHERIC ENVIRONMENT

Make the world feel alive.

Add subtle:

* fog
* dust
* wind
* grass movement
* smoke
* environmental particles
* distant ambient effects

Add environmental audio:

* wind
* insects
* distant vehicles
* electrical hum
* machinery
* occasional distant gunfire
* radio chatter placeholders

Do not make the environment noisy.

Use positional 3D audio.

# 4. PLAYER MOVEMENT

The player currently feels too game-like.

Make movement more realistic.

Implement:

* acceleration
* deceleration
* inertia
* walking speed
* running speed
* crouching speed
* smooth stance transition
* camera height transition
* subtle head movement
* weapon sway
* sprint camera behavior
* landing movement
* movement-based camera bob

Do NOT overdo camera shake.

The player should feel like a human soldier carrying equipment.

Movement should have weight.

# 5. WEAPON SYSTEM

Upgrade the weapon system significantly.

The weapon should feel physical.

Implement:

* realistic recoil
* recoil recovery
* muzzle flash
* muzzle smoke
* shell ejection
* shell casing physics
* weapon sway
* ADS transition
* weapon movement
* reload animation
* tactical reload
* empty magazine reload
* bolt/slide movement
* firing sound layers
* distant gunshot sound
* impact sounds
* surface-specific bullet impacts

Create proper weapon state:

IDLE
ADS
FIRING
RELOADING
SPRINTING
EMPTY
INSPECTING

Do not make every weapon behave identically.

Create configurable weapon properties.

# 6. BALLISTICS

Replace extremely basic raycast shooting with a more believable ballistic system where appropriate.

Support:

* bullet velocity
* gravity
* travel time
* bullet drop
* distance
* damage falloff
* penetration placeholder/system
* surface impact

For performance, use hitscan for appropriate short-range weapons if necessary, but architect the system so projectile simulation can be added.

Sniper rifles should eventually support visible bullet drop.

# 7. ENEMY AI

Make enemies considerably smarter.

Enemy states:

IDLE
PATROL
SUSPICIOUS
INVESTIGATE
SEARCH
ALERT
COMBAT
RETREAT
CALL_REINFORCEMENTS
DEAD

Enemies should:

* patrol naturally
* look around
* react to sounds
* investigate suspicious locations
* communicate with nearby guards
* search last-known-player position
* take cover
* avoid standing completely still during combat
* reload
* retreat when appropriate
* call for reinforcements

Implement perception using:

VISION
HEARING
LAST_KNOWN_POSITION

Enemy detection should depend on:

* distance
* FOV
* line of sight
* player stance
* player movement
* lighting
* sound

Avoid omniscient AI.

# 8. COVER SYSTEM

Introduce tactical cover.

Objects such as:

* walls
* crates
* vehicles
* concrete barriers
* buildings

should provide protection.

Enemies should be able to identify useful cover positions.

The player should also naturally benefit from cover.

# 9. REALISTIC ANIMATIONS

Improve character animation.

Support:

* idle
* walking
* running
* crouching
* aiming
* shooting
* reloading
* death
* turning
* taking cover

Use animation blending.

Avoid robotic transitions.

If placeholder models are currently used, create an abstraction so higher-quality animated GLB characters can be inserted later without changing AI logic.

# 10. FIRST-PERSON WEAPON PRESENTATION

Improve the first-person weapon view.

Implement:

* proper weapon positioning
* hand/arm model
* ADS alignment
* recoil movement
* weapon sway
* sprint lowering
* reload movement
* camera-relative weapon movement

The weapon should feel attached to the player's body.

# 11. BULLET IMPACTS

Make shooting interact with the environment.

Different materials should produce different impacts:

CONCRETE
METAL
WOOD
DIRT
GLASS
VEHICLE

Create:

* impact particles
* bullet holes
* sparks
* dust
* decals

Use pooling where appropriate.

Do not spawn unlimited objects.

# 12. VEHICLES

Prepare the architecture for realistic vehicles.

If the current project already has vehicles, improve them.

Otherwise create one simple military vehicle prototype.

Implement:

* acceleration
* braking
* steering
* suspension
* wheel rotation
* collision
* engine sound

Do not build a complicated vehicle system yet.

The architecture should support future:

* jeeps
* trucks
* armored vehicles
* helicopters

# 13. MILITARY UI / HUD

Redesign the UI.

It should feel like a professional tactical interface.

Use:

* minimal HUD
* clean typography
* subtle transparent panels
* tactical indicators
* objective display
* ammo
* health
* stamina
* detection status
* compass
* small minimap

Avoid futuristic sci-fi UI.

The interface should feel like equipment used by a modern military operative.

Do not copy I.G.I.'s exact HUD.

# 14. MAP DESIGN

Improve the current map.

It should no longer feel like a collection of test objects.

Create believable spatial relationships:

OUTSIDE
↓
PERIMETER
↓
GUARD POST
↓
FENCE
↓
ROAD
↓
WAREHOUSE
↓
COMMAND BUILDING
↓
SECURITY AREA
↓
EXTRACTION

Create multiple approaches to objectives.

Allow:

* stealth route
* direct combat route
* alternative entrance
* elevated route

The player should be able to plan an infiltration.

# 15. SECURITY SYSTEM

Add believable security.

Implement:

* security cameras
* alarm panels
* guards
* searchlights
* restricted zones
* locked doors
* access cards
* alarms

Security cameras should have:

* FOV
* rotation
* detection
* alarm trigger

# 16. SOUND DESIGN

Sound is extremely important.

Implement positional audio.

Examples:

Player:

* footsteps
* breathing
* weapon handling
* reload
* movement

Weapons:

* shot
* mechanical action
* magazine
* distant shot
* impact

Environment:

* wind
* birds
* machinery
* electricity
* vehicles
* distant activity

AI:

* radio communication
* alert
* search
* combat

Use layered audio instead of one sound for everything.

# 17. PHYSICS

Improve physics.

Use Rapier appropriately.

Implement:

* proper collision shapes
* rigid bodies where needed
* gravity
* object interaction
* vehicle physics
* projectile physics where appropriate
* ragdoll-ready architecture

Do not use physics simulation for every decorative object.

Performance is important.

# 18. GRAPHICS PERFORMANCE

Target:

60 FPS on modern desktop browsers.

Implement:

* frustum culling
* LOD
* instancing
* texture compression
* asset streaming where practical
* object pooling
* efficient shadows
* limited dynamic lights
* efficient particle systems

Avoid creating React state updates every frame.

Keep high-frequency game systems outside normal React rendering.

# 19. POST PROCESSING

Add subtle cinematic effects.

Possible effects:

* tone mapping
* color grading
* ambient occlusion
* subtle vignette
* subtle motion blur if performant
* subtle depth of field for menus/cutscenes

Do NOT overuse post-processing.

The game should look realistic rather than like a graphics demo.

# 20. GAME FEEL

This is the most important part.

The player should feel:

"I am infiltrating a dangerous military facility."

Not:

"I am controlling a camera inside a Three.js demo."

Every interaction should have weight.

Movement should have momentum.

Weapons should have recoil.

Enemies should react believably.

Buildings should feel physical.

Sound should provide situational awareness.

Lighting should create tactical choices.

# 21. CODE QUALITY

Maintain the existing architecture.

Do not create one enormous component.

Keep systems separated:

PlayerSystem
WeaponSystem
CombatSystem
AISystem
PerceptionSystem
PhysicsSystem
MissionSystem
AudioSystem
EnvironmentSystem
VehicleSystem
SecuritySystem
EffectsSystem

Keep configuration data separate from logic.

Use TypeScript types/interfaces.

Avoid unnecessary dependencies.

# 22. DEVELOPMENT PROCESS

Do NOT implement everything blindly.

First:

1. Inspect the existing project.
2. Run the game.
3. Identify current visual/physics limitations.
4. Identify reusable systems.
5. Create a prioritized implementation plan.

Then implement in this order:

1. Environment/material quality
2. Lighting
3. Player movement
4. Weapon feel
5. Enemy AI
6. Character animation
7. Audio
8. Bullet impacts
9. Security systems
10. HUD
11. Performance optimization

After each major stage:

* run the project
* check TypeScript
* check browser console
* fix runtime errors
* verify FPS
* verify gameplay

# 23. IMPORTANT VISUAL TARGET

Aim for the atmosphere of a **serious early-2000s military tactical FPS**, but with modern browser rendering.

The visual direction should combine:

* realistic military environments
* muted materials
* believable lighting
* dense environmental detail
* tactical UI
* grounded animations
* realistic weapon handling
* stealth gameplay
* large outdoor spaces

Do NOT make it futuristic.
Do NOT make it cartoonish.
Do NOT make it neon.
Do NOT make it an arcade shooter.

The goal is:

**classic tactical military FPS gameplay + modern browser technology + original assets.**

Finally:

Run the project and verify that it actually works.

Report:

1. Files changed
2. Systems added
3. Visual improvements
4. Physics improvements
5. AI improvements
6. Performance measurements
7. Remaining limitations
8. Next recommended upgrade

Do the implementation, not just the explanation.
