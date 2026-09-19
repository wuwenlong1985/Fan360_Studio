export const FAN_SPEC = Object.freeze({
  angleCount: 360,
  ledCount: 80,
  bytesPerLed: 4,
  rpm: 1000,
  ledPitchMm: 1.5,
  angleResolutionDeg: 1,
})

export const SECTOR_BYTES = FAN_SPEC.ledCount * FAN_SPEC.bytesPerLed
export const FRAME_BYTES = FAN_SPEC.angleCount * SECTOR_BYTES
export const REVOLUTION_MS = 60_000 / FAN_SPEC.rpm
export const SECTOR_DURATION_US = (REVOLUTION_MS * 1000) / FAN_SPEC.angleCount
