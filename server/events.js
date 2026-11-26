// Basit olay yayını: SSE istemcilerine ve terminal CLI'ya ofis olaylarını iletir.
// Claude Code içinden çalışan MCP sunucusu ayrı bir süreçtir; onun olayları 'olay_kuyrugu' tablosuna yazılır
// ve web sunucusu bu tabloyu izleyip arayüze iletir (startDbRelay).
import { EventEmitter } from 'node:events';
import { db, nowIso } from './db.js';

db.exec(`CREATE TABLE IF NOT EXISTS olay_kuyrugu (id INTEGER PRIMARY KEY AUTOINCREMENT, veri TEXT NOT NULL)`);

export const bus = new EventEmitter();
bus.setMaxListeners(50);

function persistChat(tip, ev) {
  if (tip === 'gm_mesaj' || tip === 'rapor') {
    db.prepare('INSERT INTO sohbet(zaman, kim, metin, oturum_id) VALUES(?,?,?,?)').run(ev.zaman, 'genel-mudur', ev.metin ?? '', ev.oturum_id ?? null);
  }
}

/** tip: ajan_durum | balon | kupon | puan | gm_mesaj | rapor | bulten | oturum | hata */
export function emit(tip, veri = {}) {
  const ev = { tip, zaman: nowIso(), ...veri };
  persistChat(tip, ev);
  bus.emit('olay', ev);
  return ev;
}

/** Başka süreçten (Claude Code MCP sunucusu) olay: kuyruğa yaz */
export function emitToQueue(tip, veri = {}) {
  const ev = { tip, zaman: nowIso(), ...veri, kaynak: 'claude-code' };
  persistChat(tip, ev);
  db.prepare('INSERT INTO olay_kuyrugu(veri) VALUES(?)').run(JSON.stringify(ev));
  return ev;
}

/** Web sunucusu: kuyruktaki yeni olayları arayüze ilet */
export function startDbRelay(intervalMs = 1200) {
  let last = db.prepare('SELECT COALESCE(MAX(id), 0) m FROM olay_kuyrugu').get().m;
  return setInterval(() => {
    const rows = db.prepare('SELECT id, veri FROM olay_kuyrugu WHERE id > ? ORDER BY id').all(last);
    for (const r of rows) { last = r.id; bus.emit('olay', JSON.parse(r.veri)); }
    if (rows.length) db.prepare('DELETE FROM olay_kuyrugu WHERE id <= ? AND id < ?').run(last, last - 500);
  }, intervalMs);
}
