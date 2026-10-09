import type { MissionDef } from './types'

/** Mission 01. All names, places and dialogue are original to this project. */
export const NIGHTFALL: MissionDef = {
  id: 'nightfall',
  name: 'NIGHTFALL',
  briefing:
    'Infiltrate the Halvard Ridge signals station, pull the encrypted traffic logs from its secure comms terminal, ' +
    'cut the facility\'s uplink and get out through the north-west landing zone. Approach is your call.',
  situation:
    'Halvard Ridge is a hardened relay station run by the 9th Signals Detachment. For six weeks it has been routing ' +
    'coded traffic we cannot read. Tonight a single operative — call sign WREN — goes in alone. No support until extraction. ' +
    'CANOPY will be your handler on this net.',
  intel: [
    'Roughly sixteen guards on site, working in squads of two to four. A barracks in the south-east holds a reaction force.',
    'Security cameras cover the gate, the command building and the security compound. Alarm panels are wired — they work even if radios do not.',
    'The comms terminal sits in the communications building inside the walled security compound (north-east). The keycard for its gate is carried around the warehouse office.',
    'The uplink is fed from the power station on the east fence line. Kill the uplink transformer and the station goes deaf — and their squads lose long-range radio.',
    'Searchlights on both towers. Guards see further in light and notice movement; stay low, slow and dark.',
  ],
  approaches: [
    { name: 'A — Perimeter', text: 'Follow the drainage ditch on the west side to a damaged section of fence. Quiet, long, and the command building sits between you and the target.', path: [[-2, 126], [-40, 112], [-75, 70], [-100, 20], [-96, -18], [-70, -9], [-58, -8]] },
    { name: 'B — Maintenance', text: 'A utility tunnel runs under the east fence into the maintenance building. The grate will need cutting. Puts you next to the power station and the compound\'s back gate.', path: [[-2, 126], [40, 112], [75, 70], [100, 20], [104, -20], [74, -16], [60, -16]] },
    { name: 'C — Main gate', text: 'Straight up the road past the checkpoint. Fastest, most watched. Not recommended unless things have already gone loud.', path: [[-2, 126], [0, 80], [0, 44], [0, 10]] },
    { name: 'Rooftops', text: 'Exterior stairs climb the warehouse; a pipe-bridge crosses from its roof to the communications building.', path: [[24, -14], [26, -25], [41, -25], [44, -45]] },
  ],
  extractionTime: 12,
  objectives: [
    { id: 'reach', kind: 'enter', label: 'Reach the facility — get inside the perimeter', rect: [-62, -66, 66, 44], marker: [0, 0, 44] },
    { id: 'comms', kind: 'enter', label: 'Access the communications building', rect: [37.3, -54.7, 50.7, -45.3], marker: [44, 0, -50] },
    { id: 'download', kind: 'hack', label: 'Download intelligence — secure comms terminal', interactId: 'comms-terminal', duration: 10 },
    { id: 'uplink', kind: 'disable', label: 'Disable communications — uplink transformer, power station', interactId: 'uplink-breaker', duration: 5 },
    { id: 'extract', kind: 'extract', label: 'Extract — hold the north-west landing zone', position: [-48, 0, -54], radius: 6 },
    { id: 'cameras', kind: 'destroy', label: 'Disable the security cameras', targets: ['cam-gate', 'cam-command', 'cam-sec-gate', 'cam-sec-yard', 'cam-maint'], optional: true },
    { id: 'cmd-intel', kind: 'hack', label: 'Collect additional intelligence — command building', interactId: 'intel-terminal', duration: 6, optional: true },
    { id: 'credentials', kind: 'collect', label: 'Locate access credentials — security keycard', itemId: 'sec-card', optional: true },
    { id: 'ghost', kind: 'avoid', label: 'Avoid triggering the facility alarm', event: 'alarm', optional: true },
  ],
}
