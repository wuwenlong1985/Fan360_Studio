import { FAN_SPEC, FRAME_BYTES, SECTOR_BYTES } from './spec'
import { writePixel } from './pixel'

export type RgbaImage = {
  data: Uint8Array | Uint8ClampedArray
  width: number
  height: number
  flipY?: boolean
}

export type PolarSamplingOptions = {
  centerX?: number
  centerY?: number
  radius?: number
  angleOffsetDeg?: number
  clockwise?: boolean
  gamma?: number
  brightness?: number
  sampling?: 'nearest' | 'bilinear'
  outsideColor?: readonly [number, number, number, number]
}

const DEG_TO_RAD = Math.PI / 180

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function sourceY(image: RgbaImage, y: number): number {
  return image.flipY ? image.height - 1 - y : y
}

function sourceOffset(image: RgbaImage, x: number, y: number): number {
  return (Math.trunc(sourceY(image, y)) * image.width + Math.trunc(x)) * 4
}

function readNearest(image: RgbaImage, x: number, y: number): [number, number, number, number] {
  const px = clamp(Math.round(x), 0, image.width - 1)
  const py = clamp(Math.round(y), 0, image.height - 1)
  const offset = sourceOffset(image, px, py)
  return [image.data[offset], image.data[offset + 1], image.data[offset + 2], image.data[offset + 3]]
}

function readBilinear(image: RgbaImage, x: number, y: number): [number, number, number, number] {
  const x0 = clamp(Math.floor(x), 0, image.width - 1)
  const y0 = clamp(Math.floor(y), 0, image.height - 1)
  const x1 = clamp(x0 + 1, 0, image.width - 1)
  const y1 = clamp(y0 + 1, 0, image.height - 1)
  const tx = clamp(x - x0, 0, 1)
  const ty = clamp(y - y0, 0, 1)
  const a = sourceOffset(image, x0, y0)
  const b = sourceOffset(image, x1, y0)
  const c = sourceOffset(image, x0, y1)
  const d = sourceOffset(image, x1, y1)
  const output: [number, number, number, number] = [0, 0, 0, 0]
  for (let channel = 0; channel < 4; channel += 1) {
    const top = image.data[a + channel] * (1 - tx) + image.data[b + channel] * tx
    const bottom = image.data[c + channel] * (1 - tx) + image.data[d + channel] * tx
    output[channel] = top * (1 - ty) + bottom * ty
  }
  return output
}

export function polarToCartesian(
  angleIndex: number,
  ledIndex: number,
  options: Pick<PolarSamplingOptions, 'centerX' | 'centerY' | 'radius' | 'angleOffsetDeg' | 'clockwise'> = {},
): { x: number; y: number; angleDeg: number; radius: number } {
  const centerX = options.centerX ?? 0
  const centerY = options.centerY ?? 0
  const maxRadius = options.radius ?? 1
  const normalizedRadius = (ledIndex + 0.5) / FAN_SPEC.ledCount
  const radius = normalizedRadius * maxRadius
  const angleDeg = (options.angleOffsetDeg ?? 0) + angleIndex * FAN_SPEC.angleResolutionDeg * (options.clockwise ? -1 : 1)
  const angle = angleDeg * DEG_TO_RAD
  return {
    x: centerX + Math.cos(angle) * radius,
    y: centerY + Math.sin(angle) * radius,
    angleDeg,
    radius,
  }
}

export function rgbaToFanFrame(image: RgbaImage, options: PolarSamplingOptions = {}): Uint8Array {
  if (image.data.length !== image.width * image.height * 4) throw new RangeError('RGBA image size does not match dimensions')
  const frame = new Uint8Array(FRAME_BYTES)
  const centerX = options.centerX ?? image.width / 2 - 0.5
  const centerY = options.centerY ?? image.height / 2 - 0.5
  const radius = options.radius ?? Math.min(image.width, image.height) * 0.46
  const brightness = clamp(options.brightness ?? 1, 0, 1)
  const gamma = options.gamma ?? 1
  const sampling = options.sampling ?? 'bilinear'
  const outside = options.outsideColor ?? [0, 0, 0, 0]

  for (let angleIndex = 0; angleIndex < FAN_SPEC.angleCount; angleIndex += 1) {
    for (let ledIndex = 0; ledIndex < FAN_SPEC.ledCount; ledIndex += 1) {
      const point = polarToCartesian(angleIndex, ledIndex, { centerX, centerY, radius, angleOffsetDeg: options.angleOffsetDeg, clockwise: options.clockwise })
      const source = settingsInsideImage(point.x, point.y, image) ? (sampling === 'nearest' ? readNearest(image, point.x, point.y) : readBilinear(image, point.x, point.y)) : outside
      const alpha = clamp(source[3] / 255, 0, 1)
      const applyGamma = (value: number) => (gamma === 1 ? value : 255 * Math.pow(clamp(value / 255, 0, 1), gamma))
      const offset = angleIndex * SECTOR_BYTES + ledIndex * FAN_SPEC.bytesPerLed
      writePixel(frame, offset, {
        brightness: Math.round(255 * brightness * alpha),
        r: applyGamma(source[0]),
        g: applyGamma(source[1]),
        b: applyGamma(source[2]),
      })
    }
  }
  return frame
}

function settingsInsideImage(x: number, y: number, image: RgbaImage): boolean {
  return x >= 0 && y >= 0 && x <= image.width - 1 && y <= image.height - 1
}
