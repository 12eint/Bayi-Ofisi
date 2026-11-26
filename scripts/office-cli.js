// Terminalden ofisi çalıştır: npm run ofis -- "Yarın için kuponları hazırla, Premier Lig ağırlıklı olsun"
import 'dotenv/config';
import { runOffice, officeMode } from '../server/agents/orchestrator.js';
import { bus } from '../server/events.js';
import { listCoupons } from '../server/agents/rules.js';

const talimat = process.argv.slice(2).filter(a => !a.startsWith('--')).join(' ') || 'Yarın için kuponları hazırla.';
console.log(`Mod: ${officeMode()} | Talimat: ${talimat}\n`);
bus.on('olay', (e) => {
  if (e.tip === 'balon') console.log(`  💬 ${e.ajan}: ${e.mesaj}`);
  else if (e.tip === 'ajan_durum' && e.durum !== 'masada') console.log(`  · ${e.ajan}: ${e.durum}`);
  else if (e.tip === 'kupon') console.log(`  🧾 Kupon #${e.kupon.id} (${e.kupon.ajan}) oran ${e.kupon.toplam_oran} → ${e.kupon.olasi_kazanc} TL`);
  else if (e.tip === 'puan') console.log(`  🔖 #${e.kupon.id} puan ${e.kupon.puan}/10`);
});
const r = await runOffice(talimat, { onLog: (s) => console.log('  ' + s) });
console.log('\n================ GENEL MÜDÜR RAPORU ================\n');
console.log(r.rapor);
if (r.maliyet != null) console.log(`\n(Claude maliyeti: ~${r.maliyet.toFixed(3)} USD)`);
console.log(`\nAktif kupon sayısı: ${listCoupons({ oturumId: r.oturumId }).length}`);
process.exit(r.hata ? 1 : 0);
