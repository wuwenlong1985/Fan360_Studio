import { describe, expect, it } from 'vitest'
import {
  FRAME_BYTES,
  REVOLUTION_MS,
  SECTOR_BYTES,
  SECTOR_DURATION_US,
  SECTOR_PACKET_BYTES,
  CONTROL_MESSAGE_TYPE,
  ControlMessageDecoder,
  concatPacketPackets,
  createFanFrame,
  crc32,
  decodeControlMessage,
  decodeSyncBeginPayload,
  encodeControlMessage,
  encodeSyncBeginPayload,
  decodeFanFile,
  encodeFanFile,
  getLedPixel,
  packSectorPacket,
  packFrameToPackets,
  parseSectorPacket,
  rgbaToFanFrame,
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

describe('3D image to polar frame conversion', () => {
  it('maps the right side to 0 degrees and the left side to 180 degrees', () => {
    const width = 21
    const height = 21
    const data = new Uint8Array(width * height * 4)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4
        const left = x < width / 2
        data[offset] = left ? 255 : 0
        data[offset + 1] = 0
        data[offset + 2] = left ? 0 : 255
        data[offset + 3] = 255
      }
    }
    const frame = rgbaToFanFrame({ data, width, height }, { centerX: 10, centerY: 10, radius: 8, sampling: 'nearest' })
    expect(frame.byteLength).toBe(FRAME_BYTES)
    expect(getLedPixel(frame, 0, 79).b).toBe(255)
    expect(getLedPixel(frame, 180, 79).r).toBe(255)
  })

  it('applies brightness and gamma', () => {
    const data = new Uint8Array(3 * 3 * 4).fill(255)
    const frame = rgbaToFanFrame({ data, width: 3, height: 3 }, { centerX: 1, centerY: 1, radius: 0.5, brightness: 0.5, gamma: 2, sampling: 'nearest' })
    expect(getLedPixel(frame, 0, 0)).toEqual({ brightness: 128, r: 255, g: 255, b: 255 })
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

describe('TCP control protocol', () => {
  it('round-trips SYNC_BEGIN metadata', () => {
    const payload = encodeSyncBeginPayload({
      frameCount: 2,
      frameBytes: FRAME_BYTES,
      sectorPacketBytes: SECTOR_PACKET_BYTES,
      payloadCrc32: 123456,
      totalPacketBytes: SECTOR_PACKET_BYTES * 360 * 2,
    })
    expect(decodeSyncBeginPayload(payload)).toEqual({
      frameCount: 2,
      frameBytes: FRAME_BYTES,
      sectorPacketBytes: SECTOR_PACKET_BYTES,
      payloadCrc32: 123456,
      totalPacketBytes: SECTOR_PACKET_BYTES * 360 * 2,
    })
  })

  it('decodes fragmented control messages', () => {
    const hello = encodeControlMessage(CONTROL_MESSAGE_TYPE.HELLO, 7, new Uint8Array([1, 2, 3]))
    const commit = encodeControlMessage(CONTROL_MESSAGE_TYPE.SYNC_COMMIT, 8)
    const stream = new Uint8Array(hello.byteLength + commit.byteLength)
    stream.set(hello)
    stream.set(commit, hello.byteLength)
    const decoder = new ControlMessageDecoder()
    expect(decoder.push(stream.slice(0, 5))).toHaveLength(0)
    const first = decoder.push(stream.slice(5, 23))
    expect(first).toHaveLength(1)
    expect(first[0].type).toBe(CONTROL_MESSAGE_TYPE.HELLO)
    expect(Array.from(first[0].payload)).toEqual([1, 2, 3])
    const second = decoder.push(stream.slice(23))
    expect(second).toHaveLength(1)
    expect(second[0].type).toBe(CONTROL_MESSAGE_TYPE.SYNC_COMMIT)
  })

  it('detects control message corruption', () => {
    const message = encodeControlMessage(CONTROL_MESSAGE_TYPE.SYNC_COMMIT, 9)
    message[10] ^= 0xff
    expect(() => decodeControlMessage(message)).toThrow('CRC mismatch')
  })

  it('packs one full frame into 360 sector packets', () => {
    const packets = packFrameToPackets(createFanFrame(), 100)
    expect(packets).toHaveLength(360)
    expect(packets[0].byteLength).toBe(SECTOR_PACKET_BYTES)
    expect(parseSectorPacket(packets[0]).angleIndex).toBe(0)
    expect(parseSectorPacket(packets[359]).angleIndex).toBe(359)
    expect(concatPacketPackets(packets).byteLength).toBe(360 * SECTOR_PACKET_BYTES)
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
