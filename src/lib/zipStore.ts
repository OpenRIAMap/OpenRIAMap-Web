/**
 * Minimal ZIP builder (STORE method, no compression).
 *
 * Use case: export many small JSON files without bringing heavy dependencies.
 *
 * Notes:
 * - This writes correct local headers + central directory + EOCD.
 * - Uses CRC32 for each file.
 */

type ZipTextFile = {
  name: string;
  text: string;
};

const te = new TextEncoder();

// CRC32 implementation (standard polynomial 0xEDB88320)
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function u16(n: number): Uint8Array {
  const b = new Uint8Array(2);
  b[0] = n & 0xFF;
  b[1] = (n >>> 8) & 0xFF;
  return b;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = n & 0xFF;
  b[1] = (n >>> 8) & 0xFF;
  b[2] = (n >>> 16) & 0xFF;
  b[3] = (n >>> 24) & 0xFF;
  return b;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/**
 * Build a zip file that contains multiple UTF-8 text files.
 */
export function buildZipStore(files: ZipTextFile[]): Blob {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];

  let offset = 0;

  for (const f of files) {
    const nameBytes = te.encode(f.name);
    const dataBytes = te.encode(f.text);
    const crc = crc32(dataBytes);

    // Local file header
    // signature 0x04034b50
    // version needed 20
    // general purpose 0
    // compression 0 (store)
    // mod time/date 0
    // crc32
    // compressed size
    // uncompressed size
    // file name length
    // extra length 0
    const localHeader = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(dataBytes.length),
      u32(dataBytes.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    ]);

    localParts.push(localHeader, dataBytes);

    // Central directory header
    // signature 0x02014b50
    // version made by 20
    // version needed 20
    // flags 0
    // compression 0
    // time/date 0
    // crc32
    // sizes
    // name length
    // extra/comment lengths 0
    // disk/start/attrs 0
    // local header offset
    const centralHeader = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(dataBytes.length),
      u32(dataBytes.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);
    centralParts.push(centralHeader);

    offset += localHeader.length + dataBytes.length;
  }

  const centralDir = concat(centralParts);
  const local = concat(localParts);

  const eocd = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDir.length),
    u32(local.length),
    u16(0),
  ]);

  const zipBytes = concat([local, centralDir, eocd]);
  // TS/DOM 类型在部分配置下会把 Uint8Array.buffer 视为 ArrayBufferLike（可能包含 SharedArrayBuffer），
  // 导致 BlobPart 不兼容。这里显式拷贝到“纯 ArrayBuffer”承载的 Uint8Array。
  const safeBytes = new Uint8Array(zipBytes.length);
  safeBytes.set(zipBytes);
  return new Blob([safeBytes], { type: 'application/zip' });
}
