// Terminalden bülten çek: npm run bulten:cek [-- --tarih YYYY-MM-DD]
// Hız limitine tabidir (varsayılan: 2 saatte bir, günde en fazla 4 kez).
import { refreshBulletin } from '../server/bulletin/index.js';
import { listMatches } from '../server/bulletin/store.js';
import { varsayilanGun } from '../server/bulletin/store.js';

const i = process.argv.indexOf('--tarih');
const tarih = i > 0 ? process.argv[i + 1] : varsayilanGun();
console.log('Hatırlatma: iddaa.com üyelik/kullanım sözleşmesini kontrol ettiğinden emin ol.\n');
const r = await refreshBulletin({ tarih });
if (!r.ok) { console.error('✗', r.hata); process.exit(1); }
console.log(`✓ ${r.mac_sayisi} maç okundu, ${r.hatali} hatalı satır (bülten #${r.bulten_id})`);
console.log('Günlere göre:', r.gunler, r.uyari ? `\n! ${r.uyari}` : '');
console.table(listMatches(r.bulten_id, { gun: tarih, limit: 10 }).map(m => ({
  Kod: m.mac_kodu, Saat: m.saat, Lig: m.lig.slice(0, 24), Maç: `${m.ev} - ${m.deplasman}`.slice(0, 40), MBS: m.mbs,
  MS: m.oranlar.filter(o => o.bahis === 'Maç Sonucu').map(o => `${o.secim}:${o.oran}`).join(' '),
})));
