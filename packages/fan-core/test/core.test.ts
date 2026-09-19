import { describe, expect, it } from 'vitest'
import {
  FRAME_BYTES,
  REVOLUTION_MS,
  SECTOR_BYTES,
  SECTOR_DURATION_US,
  SECTOR_PACKET_BYTES,
  createFanFrame,
  crc32,
  decodeFanFile,
  encodeFanFile,
  getLedPixel,
  packSectorPacket,
  parseSectorPacket,
  setLedPixel,
} from '../src'

describe('fan hardware specification', () => {
  it('matches the 360 x 80 x 4 byte display contract', () => {
    expect(SECTOR_BYTES).toBe(320)
    expect(FRAME_BYTES).toBe(115_200)
    expect(REVOLUTION_MS).toBe(60)
    expect(SECTOR_DURATION_US).toBeCloseTo(166.6667, 3)
  })
})

describe('frame pixels', () => {
  it('stores brightness and RGB in one LED slot', () => {
    const frame = createFanFrame()
    setLedPixel(frame, 359, 79, { brightness: 128, r: 10, g: 20, b: 30 })
    expect(getLedPixel(frame, 359, 79)).toEqual({ brightness: 128, r: 10, g: 20, b: 30 })
  })

  it('clamps byte values', () => {
    const frame = createFanFrame()
    setLedPixel(frame, 0, 0, { brightness: -1, r: 255.7, g: 12.2, b: Number.NaN })
    expect(getLedPixel(frame, 0, 0)).toEqual({ brightness: 0, r: 255, g: 12, b: 0 })
  })
})

describe('sector packet', () => {
  it('packs and parses one 336 byte sector', () => {
    const frame = createFanFrame()
    setLedPixel(frame, 123, 7, { brightness: 200, r: 1, g: 2, b: 3 })
    const packet = packSectorPacket(frame, 123, 9, 2)
    expect(packet.byteLength).toBe(SECTOR_PACKET_BYTES)
    const parsed = parseSectorPacket(packet)
    expect(parsed.angleIndex).toBe(123)
    expect(parsed.sequence).toBe(9)
    expect(parsed.flags).toBe(2)
    expect(parsed.payload.byteLength).toBe(SECTOR_BYTES)
    expect(Array.from(parsed.payload.slice(28, 32))).toEqual([200, 1, 2, 3])
  })

  it('detects a corrupted packet', () => {
    const frame = createFanFrame()
    const packet = packSectorPacket(frame, 0)
    packet[20] ^= 0xff
    expect(() => parseSectorPacket(packet)).toThrow('CRC mismatch')
  })
})

describe('fan file', () => {
  it('round-trips multiple full frames', () => {
    const first = createFanFrame()
    const second = createFanFrame()
    setLedPixel(first, 1, 2, { brightness: 9, r: 8, g: 7, b: 6 })
    setLedPixel(second, 359, 79, { brightness: 1, r: 2, g: 3, b: 4 })
    const encoded = encodeFanFile([first, second], { fps: 1000 / 60, createdAtMs: 123456 })
    const decoded = decodeFanFile(encoded)
    expect(decoded.metadata.frameCount).toBe(2)
    expect(decoded.metadata.totalPayloadBytes).toBe(BigInt(FRAME_BYTES * 2))
    expect(decoded.frames[0]).toEqual(first)
    expect(decoded.frames[1]).toEqual(second)
  })

  it('detects payload corruption', () => {
    const encoded = encodeFanFile([createFanFrame()])
    encoded[encoded.length - 1] ^= 0xff
    expect(() => decodeFanFile(encoded)).toThrow('CRC mismatch')
  })
})

describe('CRC32', () => {
  it('matches the standard 123456789 vector', () => {
    expect(crc32(new Uint8Array([49, 50, 51, 52, 53, 54, 55, 56, 57]))).toBe(0xcbf43926)
  })
})
