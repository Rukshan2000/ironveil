import type { Vector3Tuple } from 'three'

/** Data for a ground vehicle. Local frame: +Y up, -Z forward, +X right. */
export interface VehicleDef {
  id: string
  name: string
  /** Chassis collider half-extents and its offset above the body origin. */
  chassis: Vector3Tuple
  chassisOffsetY: number
  /** Chassis density → mass (kg/m³). */
  density: number
  wheels: { at: Vector3Tuple; steer: boolean; drive: boolean }[]
  wheelRadius: number
  suspension: { rest: number; stiffness: number; compression: number; relaxation: number; maxForce: number; travel: number }
  /** Tyre grip. */
  frictionSlip: number
  sideFriction: number
  /** Newtons per driven wheel. */
  engineForce: number
  brakeForce: number
  maxSteer: number
  /** m/s; engine force fades out towards it. */
  maxSpeed: number
  /** Where the player gets out (local). */
  exit: Vector3Tuple
  camera: { distance: number; height: number }
  /** Model to draw (see VehicleView). */
  model: 'jeep' | 'truck'
}

export const JEEP: VehicleDef = {
  id: 'jeep', name: 'Utility 4x4', chassis: [0.95, 0.42, 2.1], chassisOffsetY: 0.55, density: 170,
  wheels: [
    { at: [-0.86, 0.15, -1.35], steer: true, drive: true }, { at: [0.86, 0.15, -1.35], steer: true, drive: true },
    { at: [-0.86, 0.15, 1.3], steer: false, drive: true }, { at: [0.86, 0.15, 1.3], steer: false, drive: true },
  ],
  wheelRadius: 0.42,
  suspension: { rest: 0.35, stiffness: 28, compression: 4.2, relaxation: 2.6, maxForce: 60000, travel: 0.3 },
  frictionSlip: 2.2, sideFriction: 1.2, engineForce: 2200, brakeForce: 60, maxSteer: 0.55, maxSpeed: 22,
  exit: [-1.9, 0.2, -0.3], camera: { distance: 7, height: 2.6 }, model: 'jeep',
}

/** Heavier, slower; ready for when the motor pool trucks become drivable. */
export const TRUCK: VehicleDef = {
  ...JEEP, id: 'truck', name: 'Cargo Truck', chassis: [1.2, 0.7, 3.6], chassisOffsetY: 0.9, density: 160,
  wheels: [
    { at: [-1.05, 0.2, -2.6], steer: true, drive: false }, { at: [1.05, 0.2, -2.6], steer: true, drive: false },
    { at: [-1.05, 0.2, 0.6], steer: false, drive: true }, { at: [1.05, 0.2, 0.6], steer: false, drive: true },
    { at: [-1.05, 0.2, 2.2], steer: false, drive: true }, { at: [1.05, 0.2, 2.2], steer: false, drive: true },
  ],
  wheelRadius: 0.55, engineForce: 2600, maxSpeed: 16, maxSteer: 0.45, exit: [-2.2, 0.3, -2.4], camera: { distance: 10, height: 3.5 }, model: 'truck',
}

export const VEHICLES: Record<string, VehicleDef> = { jeep: JEEP, truck: TRUCK }
