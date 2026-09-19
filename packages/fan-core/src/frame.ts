import { FRAME_BYTES, FAN_SPEC, SECTOR_BYTES } from './spec'
import { readPixel, writePixel, type LedPixel } from './pixel'

export type FanFrame = Uint8Array

export function createFanFrame(): FanFrame {
  return new Uint8Array(FRAME_BYTES)
}

export function assertAngleIndex(angleIndex: number): void {
  if (!Number.isInteger(angleIndex) || angleIndex < 0 || angleIndex >= FAN_SPEC.angleCount) {
    throw new RangeError(`angleIndex must be an integer from 0 to ${FAN_SPEC.angleCount - 1}`)
  }
}

export function assertLedIndex(ledIndex: number): void {
  if (!Number.isInteger(ledIndex) || ledIndex < 0 || ledIndex >= FAN_SPEC.ledCount) {
    throw new RangeError(`ledIndex must be an integer from 0 to ${FAN_SPEC.ledCount - 1}`)
  }
}

export function getPixelOffset(angleIndex: number, ledIndex: number): number {
  assertAngleIndex(angleIndex)
  assertLedIndex(ledIndex)
  return angleIndex * SECTOR_BYTES + ledIndex * FAN_SPEC.bytesPerLed
}

export function setLedPixel(frame: FanFrame, angleIndex: number, ledIndex: number, pixel: LedPixel): void {
  if (frame.byteLength !== FRAME_BYTES) throw new RangeError(`frame must be ${FRAME_BYTES} bytes`)
  writePixel(frame, getPixelOffset(angleIndex, ledIndex), pixel)
}

export function getLedPixel(frame: FanFrame, angleIndex: number, ledIndex: number): LedPixel {
  if (frame.byteLength !== FRAME_BYTES) throw new RangeError(`frame must be ${FRAME_BYTES} bytes`)
  return readPixel(frame, getPixelOffset(angleIndex, ledIndex))
}

export function copySector(frame: FanFrame, angleIndex: number): Uint8Array {
  assertAngleIndex(angleIndex)
  if (frame.byteLength !== FRAME_BYTES) throw new RangeError(`frame must be ${FRAME_BYTES} bytes`)
  const offset = angleIndex * SECTOR_BYTES
  return frame.slice(offset, offset + SECTOR_BYTES)
}
