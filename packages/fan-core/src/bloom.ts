export type BloomOptions = {
  threshold?: number
  strength?: number
  radius?: number
  downsample?: number
}

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)))

export function applyBloom(input: Uint8Array | Uint8ClampedArray, width: number, height: number, options: BloomOptions = {}): Uint8Array {
  if (input.length !== width * height * 4) throw new RangeError('RGBA image size does not match dimensions')
  const output = new Uint8Array(input.length)
  output.set(input)
  const threshold = Math.max(0, Math.min(1, options.threshold ?? 0.65))
  const strength = Math.max(0, options.strength ?? 0)
  const radius = Math.max(1, Math.min(12, Math.round(options.radius ?? 6)))
  const downsample = Math.max(2, Math.min(8, Math.round(options.downsample ?? 4)))
  if (strength <= 0 || threshold >= 1) return output

  const lowWidth = Math.max(1, Math.ceil(width / downsample))
  const lowHeight = Math.max(1, Math.ceil(height / downsample))
  const bright = new Float32Array(lowWidth * lowHeight * 3)

  for (let lowY = 0; lowY < lowHeight; lowY += 1) {
    for (let lowX = 0; lowX < lowWidth; lowX += 1) {
      let r = 0
      let g = 0
      let b = 0
      let samples = 0
      const startX = lowX * downsample
      const startY = lowY * downsample
      for (let y = startY; y < Math.min(height, startY + downsample); y += 1) {
        for (let x = startX; x < Math.min(width, startX + downsample); x += 1) {
          const offset = (y * width + x) * 4
          const peak = Math.max(input[offset], input[offset + 1], input[offset + 2]) / 255
          const amount = Math.max(0, (peak - threshold) / Math.max(0.0001, 1 - threshold))
          r += input[offset] * amount
          g += input[offset + 1] * amount
          b += input[offset + 2] * amount
          samples += 1
        }
      }
      const target = (lowY * lowWidth + lowX) * 3
      bright[target] = r / samples
      bright[target + 1] = g / samples
      bright[target + 2] = b / samples
    }
  }

  const horizontal = new Float32Array(bright.length)
  const blurred = new Float32Array(bright.length)
  const kernel: number[] = []
  let kernelSum = 0
  const sigma = Math.max(1, radius / 2)
  for (let index = -radius; index <= radius; index += 1) {
    const value = Math.exp(-(index * index) / (2 * sigma * sigma))
    kernel.push(value)
    kernelSum += value
  }
  for (let index = 0; index < kernel.length; index += 1) kernel[index] /= kernelSum

  const blurPass = (source: Float32Array, target: Float32Array, horizontalPass: boolean) => {
    for (let y = 0; y < lowHeight; y += 1) {
      for (let x = 0; x < lowWidth; x += 1) {
        const targetOffset = (y * lowWidth + x) * 3
        let r = 0
        let g = 0
        let b = 0
        for (let kernelIndex = -radius; kernelIndex <= radius; kernelIndex += 1) {
          const sampleX = horizontalPass ? Math.max(0, Math.min(lowWidth - 1, x + kernelIndex)) : x
          const sampleY = horizontalPass ? y : Math.max(0, Math.min(lowHeight - 1, y + kernelIndex))
          const sampleOffset = (sampleY * lowWidth + sampleX) * 3
          const weight = kernel[kernelIndex + radius]
          r += source[sampleOffset] * weight
          g += source[sampleOffset + 1] * weight
          b += source[sampleOffset + 2] * weight
        }
        target[targetOffset] = r
        target[targetOffset + 1] = g
        target[targetOffset + 2] = b
      }
    }
  }

  blurPass(bright, horizontal, true)
  blurPass(horizontal, blurred, false)

  for (let y = 0; y < height; y += 1) {
    const lowY = Math.min(lowHeight - 1, y / downsample)
    const y0 = Math.floor(lowY)
    const y1 = Math.min(lowHeight - 1, y0 + 1)
    const ty = lowY - y0
    for (let x = 0; x < width; x += 1) {
      const lowX = Math.min(lowWidth - 1, x / downsample)
      const x0 = Math.floor(lowX)
      const x1 = Math.min(lowWidth - 1, x0 + 1)
      const tx = lowX - x0
      const offset = (y * width + x) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        const a = blurred[(y0 * lowWidth + x0) * 3 + channel]
        const b = blurred[(y0 * lowWidth + x1) * 3 + channel]
        const c = blurred[(y1 * lowWidth + x0) * 3 + channel]
        const d = blurred[(y1 * lowWidth + x1) * 3 + channel]
        const top = a * (1 - tx) + b * tx
        const bottom = c * (1 - tx) + d * tx
        output[offset + channel] = clampByte(input[offset + channel] + (top * (1 - ty) + bottom * ty) * strength)
      }
    }
  }
  return output
}
