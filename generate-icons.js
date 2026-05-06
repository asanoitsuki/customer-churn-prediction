#!/usr/bin/env node
/**
 * generate-icons.js
 * Chrome拡張機能用のアイコンPNGを自動生成します。
 * 外部ライブラリ不要 — Node.js標準モジュール(zlib)のみ使用。
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── CRC32 ────────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ── PNG チャンク生成 ──────────────────────────────────────────────────────────
function u32be(n) {
  return Buffer.from([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const d = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const crcBuf = u32be(crc32(Buffer.concat([t, d])));
  return Buffer.concat([u32be(d.length), t, d, crcBuf]);
}

/**
 * 単色の正方形 PNG を生成する
 * @param {number} size  一辺のピクセル数
 * @param {number[]} rgb [R, G, B] 各 0–255
 * @returns {Buffer} PNG バイナリ
 */
function solidPNG(size, [r, g, b]) {
  // IHDR: 幅/高さ/ビット深度8/カラータイプRGB(2)/圧縮0/フィルタ0/インタレース0
  const ihdrData = Buffer.concat([
    u32be(size), u32be(size),
    Buffer.from([8, 2, 0, 0, 0])
  ]);

  // 生の画像データ: 行ごとにフィルタバイト(0x00) + RGB × width
  const rowLen = 1 + size * 3;
  const raw = Buffer.alloc(size * rowLen);
  for (let y = 0; y < size; y++) {
    const base = y * rowLen;
    raw[base] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const p = base + 1 + x * 3;
      raw[p] = r; raw[p + 1] = g; raw[p + 2] = b;
    }
  }

  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    PNG_SIG,
    chunk('IHDR', ihdrData),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ── アイコン出力 ──────────────────────────────────────────────────────────────
const ICON_DIR = path.join(__dirname, 'extension', 'icons');
fs.mkdirSync(ICON_DIR, { recursive: true });

const COLOR = [99, 102, 241]; // Indigo-500 (#6366f1)
for (const size of [16, 48, 128]) {
  const buf = solidPNG(size, COLOR);
  fs.writeFileSync(path.join(ICON_DIR, `icon${size}.png`), buf);
  console.log(`  icon${size}.png  (${buf.length} bytes)`);
}
console.log('アイコン生成完了');
