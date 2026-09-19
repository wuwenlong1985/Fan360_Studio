import { crc32 } from './crc32'
import type { FanFrame } from './frame'
import { FRAME_BYTES, FAN_SPEC, REVOLUTION_MS } from './spec'

export const FAN_FILE_MAGIC = 'FAN36001'
export const FAN_FILE_VERSION = 1
export const FAN_FILE_HEADER_BYTES = 64

export type FanFileMetadata = {
  version: number
  angleCount: number
  ledCount: number
  bytesPerLed: number
  frameCount: number
  fpsMilli: number
  frameBytes: number
  payloadCrc32: number
  totalPayloadBytes: bigint
  createdAtMs: bigint
}

export type FanFile = {
  metadata: FanFileMetadata
  frames: FanFrame[]
}

function writeMagic(view: DataView): void {
  for (let index = 0; index < FAN_FILE_MAGIC.length; index += 1) {
    view.setUint8(index, FAN_FILE_MAGIC.charCodeAt(index))
  }
}

function assertFrame(frame: FanFrame): void {
  if (frame.byteLength !== FRAME_BYTES) throw new RangeError(`frame must be ${FRAME_BYTES} bytes`)
}

export function encodeFanFile(frames: FanFrame[], options: { fps?: number; createdAtMs?: number } = {}): Uint8Array {
  if (frames.length < 1 || frames.length > 0xffff) throw new RangeError('frameCount must be from 1 to 65535')
  frames.forEach(assertFrame)

  const fps = options.fps ?? 1000 / REVOLUTION_MS
  if (!Number.isFinite(fps) || fps <= 0 || fps > 65535) throw new RangeError('fps must be positive and fit in 16.16 milli-fps')
  const fpsMilli = Math.round(fps * 1000)
  if (fpsMilli > 0xffffffff) throw new RangeError('fpsMilli does not fit in uint32')

  const totalPayloadBytes = BigInt(frames.length) * BigInt(FRAME_BYTES)
  let payloadCrc32 = 0
  for (const frame of frames) payloadCrc32 = crc32(frame, payloadCrc32)

  const output = new Uint8Array(FAN_FILE_HEADER_BYTES + Number(totalPayloadBytes))
  const view = new DataView(output.buffer)
  writeMagic(view)
  view.setUint16(8, FAN_FILE_VERSION, true)
  view.setUint16(10, FAN_FILE_HEADER_BYTES, true)
  view.setUint16(12, FAN_SPEC.angleCount, true)
  view.setUint16(14, FAN_SPEC.ledCount, true)
  view.setUint8(16, FAN_SPEC.bytesPerLed)
  view.setUint8(17, 0)
  view.setUint16(18, frames.length, true)
  view.setUint32(20, fpsMilli, true)
  view.setUint32(24, FRAME_BYTES, true)
  view.setUint32(28, payloadCrc32, true)
  view.setBigUint64(32, totalPayloadBytes, true)
  view.setBigUint64(40, BigInt(options.createdAtMs ?? Date.now()), true)

  let offset = FAN_FILE_HEADER_BYTES
  for (const frame of frames) {
    output.set(frame, offset)
    offset += FRAME_BYTES
  }
  return output
}

export function decodeFanFile(input: Uint8Array): FanFile {
  if (input.byteLength < FAN_FILE_HEADER_BYTES) throw new Error('fan file is shorter than header')
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength)
  let magic = ''
  for (let index = 0; index < FAN_FILE_MAGIC.length; index += 1) magic += String.fromCharCode(view.getUint8(index))
  if (magic !== FAN_FILE_MAGIC) throw new Error('invalid fan file magic')

  const version = view.getUint16(8, true)
  const headerBytes = view.getUint16(10, true)
  const angleCount = view.getUint16(12, true)
  const ledCount = view.getUint16(14, true)
  const bytesPerLed = view.getUint8(16)
  const frameCount = view.getUint16(18, true)
  const fpsMilli = view.getUint32(20, true)
  const frameBytes = view.getUint32(24, true)
  const payloadCrc32 = view.getUint32(28, true)
  const totalPayloadBytes = view.getBigUint64(32, true)
  const createdAtMs = view.getBigUint64(40, true)

  if (version !== FAN_FILE_VERSION) throw new Error('unsupported fan file version')
  if (headerBytes !== FAN_FILE_HEADER_BYTES) throw new Error('unsupported fan file header size')
  if (angleCount !== FAN_SPEC.angleCount || ledCount !== FAN_SPEC.ledCount || bytesPerLed !== FAN_SPEC.bytesPerLed) {
    throw new Error('fan file does not match the 360x80x4 display specification')
  }
  if (frameBytes !== FRAME_BYTES) throw new Error('fan file frame size mismatch')
  if (totalPayloadBytes !== BigInt(frameCount) * BigInt(FRAME_BYTES)) throw new Error('fan file payload size mismatch')
  if (BigInt(input.byteLength - headerBytes) !== totalPayloadBytes) throw new Error('fan file is truncated or has trailing data')

  const payload = input.subarray(headerBytes)
  const actualCrc = crc32(payload)
  if (actualCrc !== payloadCrc32) throw new Error('fan file CRC mismatch')

  const frames: FanFrame[] = []
  for (let index = 0; index < frameCount; index += 1) {
    const offset = index * FRAME_BYTES
    frames.push(payload.slice(offset, offset + FRAME_BYTES))
  }

  return {
    metadata: {
      version,
      angleCount,
      ledCount,
      bytesPerLed,
      frameCount,
      fpsMilli,
      frameBytes,
      payloadCrc32,
      totalPayloadBytes,
      createdAtMs,
    },
    frames,
  }
}
