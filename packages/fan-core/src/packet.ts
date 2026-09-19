import { crc32 } from './crc32'
import { copySector, type FanFrame } from './frame'
import { FAN_SPEC, SECTOR_BYTES } from './spec'

export const SECTOR_PACKET_MAGIC = 0xf360
export const SECTOR_PACKET_VERSION = 1
export const SECTOR_PACKET_TYPE = 1
export const SECTOR_PACKET_HEADER_BYTES = 12
export const SECTOR_PACKET_CRC_BYTES = 4
export const SECTOR_PACKET_BYTES = SECTOR_PACKET_HEADER_BYTES + SECTOR_BYTES + SECTOR_PACKET_CRC_BYTES

export type SectorPacket = {
  angleIndex: number
  sequence: number
  flags: number
  payload: Uint8Array
}

export function packSectorPacket(frame: FanFrame, angleIndex: number, sequence = angleIndex, flags = 0): Uint8Array {
  if (sequence < 0 || sequence > 0xffff) throw new RangeError('sequence must fit in uint16')
  if (flags < 0 || flags > 0xffff) throw new RangeError('flags must fit in uint16')

  const packet = new Uint8Array(SECTOR_PACKET_BYTES)
  const view = new DataView(packet.buffer)
  view.setUint16(0, SECTOR_PACKET_MAGIC, true)
  view.setUint8(2, SECTOR_PACKET_VERSION)
  view.setUint8(3, SECTOR_PACKET_TYPE)
  view.setUint16(4, angleIndex, true)
  view.setUint16(6, sequence, true)
  view.setUint16(8, flags, true)
  view.setUint16(10, SECTOR_BYTES, true)
  packet.set(copySector(frame, angleIndex), SECTOR_PACKET_HEADER_BYTES)
  view.setUint32(SECTOR_PACKET_HEADER_BYTES + SECTOR_BYTES, crc32(packet.subarray(0, SECTOR_PACKET_HEADER_BYTES + SECTOR_BYTES)), true)
  return packet
}

export function parseSectorPacket(packet: Uint8Array): SectorPacket {
  if (packet.byteLength !== SECTOR_PACKET_BYTES) {
    throw new RangeError(`sector packet must be ${SECTOR_PACKET_BYTES} bytes`)
  }

  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength)
  const magic = view.getUint16(0, true)
  const version = view.getUint8(2)
  const type = view.getUint8(3)
  const angleIndex = view.getUint16(4, true)
  const sequence = view.getUint16(6, true)
  const flags = view.getUint16(8, true)
  const payloadLength = view.getUint16(10, true)
  const expectedCrc = view.getUint32(SECTOR_PACKET_HEADER_BYTES + SECTOR_BYTES, true)
  const actualCrc = crc32(packet.subarray(0, SECTOR_PACKET_HEADER_BYTES + SECTOR_BYTES))

  if (magic !== SECTOR_PACKET_MAGIC) throw new Error('invalid sector packet magic')
  if (version !== SECTOR_PACKET_VERSION) throw new Error('unsupported sector packet version')
  if (type !== SECTOR_PACKET_TYPE) throw new Error('unsupported sector packet type')
  if (angleIndex >= FAN_SPEC.angleCount) throw new Error('angle index out of range')
  if (payloadLength !== SECTOR_BYTES) throw new Error('invalid sector payload length')
  if (expectedCrc !== actualCrc) throw new Error('sector packet CRC mismatch')

  return {
    angleIndex,
    sequence,
    flags,
    payload: packet.slice(SECTOR_PACKET_HEADER_BYTES, SECTOR_PACKET_HEADER_BYTES + SECTOR_BYTES),
  }
}
