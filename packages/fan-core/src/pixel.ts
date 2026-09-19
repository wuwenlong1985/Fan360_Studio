export type LedPixel = {
  brightness: number
  r: number
  g: number
  b: number
}

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)))

export function normalizePixel(pixel: LedPixel): LedPixel {
  return {
    brightness: clampByte(pixel.brightness),
    r: clampByte(pixel.r),
    g: clampByte(pixel.g),
    b: clampByte(pixel.b),
  }
}

export function writePixel(frame: Uint8Array, offset: number, pixel: LedPixel): void {
  const value = normalizePixel(pixel)
  frame[offset] = value.brightness
  frame[offset + 1] = value.r
  frame[offset + 2] = value.g
  frame[offset + 3] = value.b
}

export function readPixel(frame: Uint8Array, offset: number): LedPixel {
  return {
    brightness: frame[offset],
    r: frame[offset + 1],
    g: frame[offset + 2],
    b: frame[offset + 3],
  }
}
