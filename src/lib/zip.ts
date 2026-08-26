/**
 * A ZIP FILE, WITHOUT A DEPENDENCY.
 *
 * The only thing being zipped here is Etsy product photographs, which are
 * already JPEG — squeezing them again saves a percent or two and costs a
 * library. So this writes the archive with the "store" method: the bytes go
 * in untouched and only the bookkeeping around them is generated.
 *
 * That bookkeeping is the whole format. Every file gets a local header, then
 * its bytes; then a central directory repeats each header with the offset it
 * was written at; then a record saying where the directory starts and how
 * many entries it holds. Nothing else.
 */

/** The standard CRC-32 table, built once. Every entry in a zip carries a
 *  checksum and an archive with wrong ones will not open. */
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++)
    c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

export function zip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  /*
    Every reader tolerates a fixed timestamp and nobody looks at it here, so
    the same DOS date goes on every entry rather than dragging real clock
    time into a pure function. 1 January 2020.
  */
  const time = 0;
  const date = ((2020 - 1980) << 9) | (1 << 5) | 1;

  for (const e of entries) {
    const name = encoder.encode(e.name);
    const sum = crc32(e.bytes);
    const size = e.bytes.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); // local file header
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0, true); // flags
    local.setUint16(8, 0, true); // method: stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, sum, true);
    local.setUint32(18, size, true); // compressed
    local.setUint32(22, size, true); // uncompressed
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true); // no extra field

    const head = new Uint8Array(local.buffer);
    locals.push(head, name, e.bytes);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true); // central directory header
    dir.setUint16(4, 20, true); // version made by
    dir.setUint16(6, 20, true); // version needed
    dir.setUint16(8, 0, true);
    dir.setUint16(10, 0, true);
    dir.setUint16(12, time, true);
    dir.setUint16(14, date, true);
    dir.setUint32(16, sum, true);
    dir.setUint32(20, size, true);
    dir.setUint32(24, size, true);
    dir.setUint16(28, name.length, true);
    dir.setUint16(30, 0, true); // extra
    dir.setUint16(32, 0, true); // comment
    dir.setUint16(34, 0, true); // disk
    dir.setUint16(36, 0, true); // internal attrs
    dir.setUint32(38, 0, true); // external attrs
    dir.setUint32(42, offset, true); // where its local header sits

    central.push(new Uint8Array(dir.buffer), name);
    offset += head.length + name.length + size;
  }

  const dirBytes = central.reduce((n, b) => n + b.length, 0);

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // end of central directory
  end.setUint16(4, 0, true); // this disk
  end.setUint16(6, 0, true); // disk with the directory
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, dirBytes, true);
  end.setUint32(16, offset, true);
  end.setUint16(20, 0, true); // no comment

  const parts = [...locals, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
