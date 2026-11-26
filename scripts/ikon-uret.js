// Bayi Ofisi pixel simgesi: public/bayi.ico (masaüstü kısayolu) + public/bayi.png (favicon). Harici paket yok.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const N = 32;
const px = Array.from({ length: N * N }, () => [0, 0, 0, 0]);
const hex = (h, a = 255) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a];
const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < N && y < N) px[y * N + x] = c; };
const rect = (x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, c); };

// koyu zemin + sarı neon çerçeve (köşeler yuvarlak)
rect(1, 1, 30, 30, hex('#ffcc00')); rect(2, 2, 28, 28, hex('#1a1512'));
for (const [x, y] of [[1, 1], [30, 1], [1, 30], [30, 30]]) set(x, y, [0, 0, 0, 0]);
// termal fiş
rect(9, 4, 14, 22, hex('#fbfaf5'));
for (let i = 9; i < 23; i += 2) set(i, 25, hex('#1a1512'));                // tırtıklı alt kenar
rect(11, 6, 10, 1, hex('#1a1512'));                                         // başlık
for (const y of [9, 11, 13, 15]) { rect(11, y, 6, 1, hex('#8a8a8a')); rect(18, y, 3, 1, hex('#1a1512')); }
rect(11, 18, 10, 1, hex('#1a1512'));                                        // toplam çizgisi
// kırmızı puan damgası
for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
  const d = Math.hypot(x - 4, y - 4);
  if (d <= 4.4 && d >= 3.2) set(17 + x, 18 + y, hex('#c62828'));
}
rect(20, 21, 3, 3, hex('#c62828'));
// ince belli çay bardağı (sol alt)
rect(4, 21, 4, 1, hex('#f4f1ea')); rect(5, 17, 2, 4, hex('#a2401c')); rect(5, 16, 2, 1, hex('#d9773f'));
set(5, 14, hex('#ffffff', 160)); set(6, 12, hex('#ffffff', 120));

function png(size) {
  const k = size / N; const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const c = px[Math.floor(y / k) * N + Math.floor(x / k)];
      raw.set(c, y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const boyutlar = [32, 64, 256];
const pngler = boyutlar.map(png);
const başlık = Buffer.alloc(6); başlık.writeUInt16LE(0, 0); başlık.writeUInt16LE(1, 2); başlık.writeUInt16LE(boyutlar.length, 4);
let ofs = 6 + 16 * boyutlar.length;
const girişler = boyutlar.map((s, i) => {
  const e = Buffer.alloc(16); e[0] = s === 256 ? 0 : s; e[1] = s === 256 ? 0 : s; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngler[i].length, 8); e.writeUInt32LE(ofs, 12); ofs += pngler[i].length; return e;
});
fs.writeFileSync(path.join(ROOT, 'public', 'bayi.ico'), Buffer.concat([başlık, ...girişler, ...pngler]));
fs.writeFileSync(path.join(ROOT, 'public', 'bayi.png'), pngler[1]);
console.log('yazıldı: public/bayi.ico, public/bayi.png');
