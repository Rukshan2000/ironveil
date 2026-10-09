# Sound effects

Drop an `.mp3`, `.ogg` or `.wav` file here with one of the names below and it replaces the
built-in synthesized sound. Any name you don't provide keeps the synthesized sound.
Restart `npm run dev` after adding new files.

The game still adds 3D position, distance muffling and echo to these files, so use dry
(no reverb), mono recordings, trimmed tight at the start.

| File name | Plays when |
|---|---|
| `gunshot-k7` | K7 carbine fires (player and guards) |
| `gunshot-p11` | P-11 pistol fires |
| `gunshot-vk8` | VK-8 sniper fires |
| `gunshot` | fallback for any gun without its own file |
| `explosion-frag`, `explosion-flash`, `explosion-smoke` | grenade goes off |
| `pin` | grenade pin pulled |
| `grenade-bounce` | grenade hits the ground |
| `mech-magOut`, `mech-magIn`, `mech-bolt`, `mech-boltCycle`, `mech-equip`, `mech-dry`, `mech-inspect`, `mech-aimIn`, `mech-aimOut`, `mech-switch` | weapon handling |
| `footstep-concrete`, `-metal`, `-wood`, `-dirt`, `-grass`, `-glass` | footsteps on that surface |
| `footstep` | fallback for any surface |
| `impact-concrete`, `-metal`, `-wood`, `-dirt`, `-grass`, `-glass`, `-flesh`, `-fabric` | bullet hits |
| `impact` | fallback for any surface |
| `voice-suspicious`, `-alert`, `-contact`, `-reinforce`, `-lost`, `-hurt`, `-death`, `-search`, `-reload`, `-body` | guard shouts |
| `ambience` | background bed for the whole mission, looped with a 2 s crossfade (ducked indoors) |
| `loop-siren` | base alarm (loops at every alarm panel while the alarm is on) |
| `loop-truck` | ground vehicles you drive and distant trucks (pitch follows engine revs) |
| `loop-rotor` | helicopter (intro and extraction) |
| `loop-rain` | rain, volume follows how hard it is raining |
| `loop-wind`, `-insects`, `-hum`, `-generator`, `-radio`, `-fire`, `-engine` | background loops (played on repeat) |
| `cue-hit`, `-kill`, `-objective`, `-beep`, `-pickup`, `-denied`, `-hurt` | HUD feedback sounds |

Example: `footstep-grass.ogg`, `voice-death.mp3`.

**Variants:** add `-1`, `-2`, … to any name (`voice-contact-1.mp3`, `voice-contact-2.mp3`) and one is picked at random
each time. `voice-1` … `voice-9` are generic enemy shouts (cut from a military vocals recording) used at random for
every guard callout except pain and death.
