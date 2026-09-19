import { rgbaToFanFrame, type PolarSamplingOptions } from '@fan360/core'

type PolarWorkerRequest = {
  id: number
  pixels: ArrayBuffer
  width: number
  height: number
  options: PolarSamplingOptions
}

type PolarWorkerResponse = {
  id: number
  frame: ArrayBuffer
}

const scope = self as unknown as Worker

scope.onmessage = (event: MessageEvent<PolarWorkerRequest>) => {
  const { id, pixels, width, height, options } = event.data
  try {
    const frame = rgbaToFanFrame(
      { data: new Uint8Array(pixels), width, height, flipY: true },
      options,
    )
    const frameBuffer = frame.buffer as ArrayBuffer
    const response: PolarWorkerResponse = { id, frame: frameBuffer }
    scope.postMessage(response, [frameBuffer])
  } catch (error) {
    scope.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
