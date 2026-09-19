import { crc32 } from './crc32'
import { packSectorPacket, SECTOR_PACKET_BYTES } from './packet'
import { FRAME_BYTES, FAN_SPEC } from './spec'

export const CONTROL_MAGIC = 0x30363346
export const CONTROL_VERSION = 1
export const CONTROL_HEADER_BYTES = 16
export const CONTROL_CRC_BYTES = 4
export const CONTROL_MAX_PAYLOAD_BYTES = 1024 * 1024

export const CONTROL_MESSAGE_TYPE = {
  HELLO: 1,
  SYNC_BEGIN: 2,
  SYNC_COMMIT: 3,
  SYNC_ACK: 4,
  SYNC_ABORT: 5,
  PLAY: 6,
  STOP: 7,
} as const

export type ControlMessageType = (typeof CONTROL_MESSAGE_TYPE)[keyof typeof CONTROL_MESSAGE_TYPE]

export type ControlMessage = {
  type: ControlMessageType
  sequence: number
  payload: Uint8Array
}

export type SyncBeginInfo = {
  frameCount: number
  frameBytes: number
  sectorPacketBytes: number
  payloadCrc32: number
  totalPacketBytes: number
}

export type SyncAckInfo = {
  accepted: boolean
  errorCode: number
}

export function encodeSyncBeginPayload(info: SyncBeginInfo): Uint8Array {
  if (info.frameCount < 1 || info.frameCount > 0xffff) throw new RangeError('frameCount must fit in uint16 and be positive')
  const payload = new Uint8Array(20)
  const view = new DataView(payload.buffer)
  view.setUint16(0, info.frameCount, true)
  view.setUint16(2, 0, true)
  view.setUint32(4, info.frameBytes, true)
  view.setUint16(8, info.sectorPacketBytes, true)
  view.setUint16(10, 0, true)
  view.setUint32(12, info.payloadCrc32, true)
  view.setUint32(16, info.totalPacketBytes, true)
  return payload
}

export function decodeSyncBeginPayload(payload: Uint8Array): SyncBeginInfo {
  if (payload.byteLength !== 20) throw new RangeError('SYNC_BEGIN payload must be 20 bytes')
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  return {
    frameCount: view.getUint16(0, true),
    frameBytes: view.getUint32(4, true),
    sectorPacketBytes: view.getUint16(8, true),
    payloadCrc32: view.getUint32(12, true),
    totalPacketBytes: view.getUint32(16, true),
  }
}

export function encodeSyncAckPayload(info: SyncAckInfo): Uint8Array {
  return new Uint8Array([info.accepted ? 1 : 0, info.errorCode & 0xff, 0, 0])
}

export function decodeSyncAckPayload(payload: Uint8Array): SyncAckInfo {
  if (payload.byteLength !== 4) throw new RangeError('SYNC_ACK payload must be 4 bytes')
  return { accepted: payload[0] === 1, errorCode: payload[1] }
}

export function encodeControlMessage(type: ControlMessageType, sequence: number, payload: Uint8Array = new Uint8Array(0)): Uint8Array {
  if (sequence < 0 || sequence > 0xffffffff) throw new RangeError('sequence must fit in uint32')
  if (payload.byteLength > CONTROL_MAX_PAYLOAD_BYTES) throw new RangeError('control payload exceeds maximum size')
  const output = new Uint8Array(CONTROL_HEADER_BYTES + payload.byteLength + CONTROL_CRC_BYTES)
  const view = new DataView(output.buffer)
  view.setUint32(0, CONTROL_MAGIC, true)
  view.setUint16(4, CONTROL_VERSION, true)
  view.setUint16(6, type, true)
  view.setUint32(8, sequence, true)
  view.setUint32(12, payload.byteLength, true)
  output.set(payload, CONTROL_HEADER_BYTES)
  view.setUint32(CONTROL_HEADER_BYTES + payload.byteLength, crc32(output.subarray(0, CONTROL_HEADER_BYTES + payload.byteLength)), true)
  return output
}

export function decodeControlMessage(input: Uint8Array): ControlMessage {
  if (input.byteLength < CONTROL_HEADER_BYTES + CONTROL_CRC_BYTES) throw new Error('control message is too short')
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength)
  const magic = view.getUint32(0, true)
  const version = view.getUint16(4, true)
  const type = view.getUint16(6, true)
  const sequence = view.getUint32(8, true)
  const payloadLength = view.getUint32(12, true)
  if (magic !== CONTROL_MAGIC) throw new Error('invalid control message magic')
  if (version !== CONTROL_VERSION) throw new Error('unsupported control message version')
  if (payloadLength > CONTROL_MAX_PAYLOAD_BYTES) throw new Error('control message payload is too large')
  if (input.byteLength !== CONTROL_HEADER_BYTES + payloadLength + CONTROL_CRC_BYTES) throw new Error('control message length mismatch')
  const expectedCrc = view.getUint32(CONTROL_HEADER_BYTES + payloadLength, true)
  const actualCrc = crc32(input.subarray(0, CONTROL_HEADER_BYTES + payloadLength))
  if (expectedCrc !== actualCrc) throw new Error('control message CRC mismatch')
  return {
    type: type as ControlMessageType,
    sequence,
    payload: input.slice(CONTROL_HEADER_BYTES, CONTROL_HEADER_BYTES + payloadLength),
  }
}

export class ControlMessageDecoder {
  private pending = new Uint8Array(0)

  push(chunk: Uint8Array): ControlMessage[] {
    if (chunk.byteLength > 0) {
      const merged = new Uint8Array(this.pending.byteLength + chunk.byteLength)
      merged.set(this.pending, 0)
      merged.set(chunk, this.pending.byteLength)
      this.pending = merged
    }

    const messages: ControlMessage[] = []
    let offset = 0
    while (this.pending.byteLength - offset >= CONTROL_HEADER_BYTES + CONTROL_CRC_BYTES) {
      const view = new DataView(this.pending.buffer, this.pending.byteOffset + offset, this.pending.byteLength - offset)
      if (view.getUint32(0, true) !== CONTROL_MAGIC) throw new Error('invalid control stream magic')
      const payloadLength = view.getUint32(12, true)
      if (payloadLength > CONTROL_MAX_PAYLOAD_BYTES) throw new Error('control stream payload is too large')
      const messageBytes = CONTROL_HEADER_BYTES + payloadLength + CONTROL_CRC_BYTES
      if (this.pending.byteLength - offset < messageBytes) break
      const message = decodeControlMessage(this.pending.subarray(offset, offset + messageBytes))
      messages.push(message)
      offset += messageBytes
    }

    this.pending = this.pending.slice(offset)
    return messages
  }
}

export function packFrameToPackets(frame: Uint8Array, sequenceBase = 0): Uint8Array[] {
  if (frame.byteLength !== FRAME_BYTES) throw new RangeError(`frame must be ${FRAME_BYTES} bytes`)
  const packets: Uint8Array[] = []
  for (let angle = 0; angle < FAN_SPEC.angleCount; angle += 1) {
    packets.push(packSectorPacket(frame, angle, (sequenceBase + angle) & 0xffff, 1))
  }
  return packets
}

export function concatPacketPackets(packets: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(packets.length * SECTOR_PACKET_BYTES)
  packets.forEach((packet, index) => output.set(packet, index * SECTOR_PACKET_BYTES))
  return output
}
