// Geliştirme için: sayfayı BİR KEZ yükle ve ham veriyi data/snapshots/ altına kaydet.
import { loadBulletinPage } from '../server/bulletin/scraper.js';
import { tomorrow } from '../server/db.js';

try {
  const r = await loadBulletinPage({ targetDate: tomorrow(), saveSnapshot: true, skipRateLimit: process.argv.includes('--force') });
  console.log('Kaydedildi:', r.snapshotDir);
  for (const x of r.jsonResponses) {
    const b = x.body; const keys = b && typeof b === 'object' ? Object.keys(b.data ?? b).slice(0, 8) : [];
    console.log('-', x.url.slice(0, 140), JSON.stringify(keys));
  }
} catch (e) {
  console.error(e.name, e.message);
  process.exit(1);
}
