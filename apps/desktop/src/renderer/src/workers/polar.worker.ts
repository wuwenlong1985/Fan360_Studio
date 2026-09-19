import { applyBloom, rgbaToFanFrame, type BloomOptions, type PolarSamplingOptions } from '@fan360/core'

type PolarWorkerRequest = {
  id: number
  pixels: ArrayBuffer
  width: number
  height: number
  options: PolarSamplingOptions & { bloom?: BloomOptions }
}

type PolarWorkerResponse = {
  id: number
  frame: ArrayBuffer
  processingMs: number
}

const scope = self as unknown as Worker

scope.onmessage = (event: MessageEvent<PolarWorkerRequest>) => {
  const { id, pixels, width, height, options } = event.data
  try {
    const startedAt = performance.now()
    const source = new Uint8Array(pixels)
    const processed = options.bloom ? applyBloom(source, width, height, options.bloom) : source
    const frame = rgbaToFanFrame(
      { data: processed, width, height, flipY: true },
      options,
    )
    const frameBuffer = frame.buffer as ArrayBuffer
    const response: PolarWorkerResponse = { id, frame: frameBuffer, processingMs: performance.now() - startedAt }
    scope.postMessage(response, [frameBuffer])
  } catch (error) {
    scope.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
