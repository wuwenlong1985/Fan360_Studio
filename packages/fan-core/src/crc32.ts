const TABLE = new Uint32Array(256)
for (let index = 0; index < 256; index += 1) {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  TABLE[index] = value >>> 0
}

export function crc32(data: Uint8Array, seed = 0): number {
  let crc = (seed ^ 0xffffffff) >>> 0
  for (let index = 0; index < data.length; index += 1) {
    crc = TABLE[(crc ^ data[index]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}
