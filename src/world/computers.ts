import { Vector3, type Vector3Tuple } from 'three'

/**
 * Computer props. A workstation sits on a desk top (`position` = desk surface under the monitor, screen facing
 * `yaw`); `id` links it to an interactable so its screen shows that objective's progress. A rack face is an
 * animated panel of server units and LEDs laid over the front of an existing rack box.
 */
export type ComputerDef =
  | { kind: 'workstation'; position: Vector3Tuple; yaw: number; id?: string; title?: string }
  | { kind: 'rack'; position: Vector3Tuple; yaw: number; size: [number, number] }

/** Monitor screen geometry in the workstation's local space (metres). */
export const SCREEN = { w: 0.52, h: 0.3, y: 0.38, z: -0.06 }

/** World-space centre of a workstation's screen (camera focus while the player works on it). */
export function screenCenter(c: ComputerDef, out = new Vector3()) {
  const [x, y, z] = c.position
  return out.set(x + Math.sin(c.yaw) * SCREEN.z, y + SCREEN.y, z + Math.cos(c.yaw) * SCREEN.z)
}
