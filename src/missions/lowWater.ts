import type { MissionDef } from './types'

/** Mission 02. Follows Nightfall: the stolen orders say DAWN means a flood. */
export const LOW_WATER: MissionDef = {
  id: 'low-water',
  name: 'LOW WATER',
  briefing:
    'Get into the Tessaly Dam control house, lock the sluice program before dawn and kill the backup generator so it ' +
    'cannot be forced open. Extract by boat from the west-bank jetty. Find out who sold the Nightfall landing zone.',
  situation:
    'The orders taken at Halvard Ridge are decoded. At first light General Drask\'s 4th Engineers open every sluice of the ' +
    'Tessaly Dam at once. The flood takes the valley\'s river line, its bridges and the farms below, and when the water drops ' +
    'his armour crosses the empty riverbed. Lock the sluices and the attack has nowhere to go. ' +
    'One more thing: the gunships found your helicopter minutes after the uplink went dead. Someone told them where it was. ' +
    'This time there is no flight plan. WREN and the partner go in up the river. CANOPY has the only copy of the route.',
  intel: [
    'Fourteen guards on site. Reinforcements by security level as before: +2, +3, +4 by truck up the valley road, then +5 from the control house.',
    'Cameras on the road gate, the control house, the spillway and the jetty. Outside restricted areas a camera only reports you and sends a patrol; at the control house it sounds the siren. The camera desk in the road-gate hut loops every feed (hold 6 s).',
    'Two marksmen on the dam crest work the searchlights. Kill the operator and the light dies with him. The river channel is waist deep: slow, but low.',
    'The sluice program runs on the gate controller in the control house at the foot of the dam (east side). Hold to overwrite it (10 s).',
    'A backup generator in the shed east of the switchyard can force the gates by hand. Sabotage it after the program is locked.',
    'If the facility alarm sounds, the crew will start a manual opening. You will have three minutes to kill the generator.',
    'The engineer on the west bank keeps a radio ledger in his hut. If anyone passed on the Nightfall LZ, it will be in there.',
  ],
  approaches: [
    { name: 'A — River', text: 'Wade up the river channel under the crest lights and slip through the broken fence where it meets the water. Slow and wet, but out of sight.', path: [[4, 126], [-8, 80], [-14, 40], [-6, 10], [2, -10], [12, -10]] },
    { name: 'B — West bank', text: 'Cross the footbridge, take the ledger from the engineer\'s hut, then wade across below the spillway.', path: [[20, 100], [6, 40], [-4, 2], [-24, -6], [-34, -20], [-10, -36], [12, -40]] },
    { name: 'C — Road gate', text: 'Straight up the valley road through the gate. Fastest, camera and tower on it. Only when it has gone loud anyway.', path: [[24, 126], [30, 80], [30, 40], [30, 0]] },
  ],
  extractionTime: 10,
  ride: 'boat',
  radio: {
    alarm: 'They\'ve sounded the alarm. Reaction teams from the barracks and up the valley road. Keep moving.',
    lockdown: 'Seal the control house! Nobody touches those gates!',
    extractionCalled: 'Generator\'s dead, the gates are ours. Boat is coming up the river to the west-bank jetty — get there and hold it.',
    extracted: 'Both aboard. Throttle up, we\'re going downriver.',
  },
  objectives: [
    { id: 'reach', kind: 'enter', label: 'Reach the dam works — get past the fence line', rect: [10, -48, 66, 36], marker: [10, 0, -10] },
    { id: 'control', kind: 'enter', label: 'Get into the control house at the foot of the dam', rect: [34.3, -45.7, 45.7, -38.3], marker: [40, 0, -42] },
    { id: 'sluice', kind: 'hack', label: 'Lock the sluice program — gate controller', interactId: 'gate-controller', duration: 10 },
    { id: 'power', kind: 'disable', label: 'Sabotage the backup generator — generator shed', interactId: 'backup-generator', duration: 5 },
    { id: 'extract', kind: 'extract', label: 'Extract — hold the west-bank jetty for the boat', position: [-20, 0, 30], radius: 6 },
    { id: 'ledger', kind: 'collect', label: 'Take the engineer\'s radio ledger — west-bank hut', itemId: 'eng-ledger', optional: true },
    { id: 'cameras', kind: 'destroy', label: 'Disable the dam security cameras', targets: ['cam-gate', 'cam-control', 'cam-spillway', 'cam-jetty'], optional: true },
    { id: 'ghost', kind: 'avoid', label: 'Avoid triggering the dam siren', event: 'alarm', optional: true },
  ],
}
