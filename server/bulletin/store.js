// Ayrıştırılmış bülteni SQLite'a yazar ve okur.
//
// Bülten modeli: Bir bülten = bir ÇEKİM (ya da yükleme). Çekimde gelen tüm maçlar kendi günüyle (maclar.gun,
// İstanbul saatine göre) kaydedilir; bülten tek bir güne bağlı değildir. Bir gün için sorulduğunda o günün
// maçlarını içeren EN SON çekim kullanılır (en güncel oranlar). Kupon da istenen günün maçlarından yapılır.
import { db, nowIso, tx, istanbulDate } from '../db.js';

const gunOf = (m, yedek) => (m.baslama ? istanbulDate(new Date(m.baslama)) : yedek);

/** tarih: çekimde hedeflenen gün (bilgi amaçlı); maçların günü başlama saatinden hesaplanır. */
export function saveBulletin({ tarih, kaynak, matches, errors = [], not_ = null }) {
  return tx(() => {
    const { lastInsertRowid: bid } = db.prepare(
      'INSERT INTO bultenler(tarih, kaynak, cekilme_zamani, mac_sayisi, hatali_satir_sayisi, not_) VALUES(?,?,?,?,?,?)'
    ).run(tarih ?? istanbulDate(), kaynak, nowIso(), matches.length, errors.length, not_);
    const insM = db.prepare('INSERT INTO maclar(bulten_id, mac_kodu, event_id, lig, ev, deplasman, baslama, saat, mbs, gun) VALUES(?,?,?,?,?,?,?,?,?,?)');
    const insO = db.prepare('INSERT INTO oranlar(mac_id, bahis, secim, oran, mbs) VALUES(?,?,?,?,?)');
    const insE = db.prepare('INSERT INTO hatali_satirlar(bulten_id, satir, neden) VALUES(?,?,?)');
    for (const m of matches) {
      const { lastInsertRowid: mid } = insM.run(bid, m.mac_kodu, m.event_id ?? null, m.lig ?? null, m.ev, m.deplasman, m.baslama ?? null, m.saat ?? null, m.mbs ?? null, gunOf(m, tarih ?? istanbulDate()));
      for (const o of m.oranlar) insO.run(mid, o.bahis, o.secim, o.oran, o.mbs ?? 1);
    }
    for (const e of errors) insE.run(bid, String(e.satir).slice(0, 300), e.neden);
    return Number(bid);
  });
}

/** Bir günün maçlarını içeren en son çekim (bülten satırı) ya da undefined */
export function gunBulteni(gun) {
  return db.prepare('SELECT * FROM bultenler WHERE id = (SELECT MAX(bulten_id) FROM maclar WHERE gun = ?)').get(gun);
}

/** Geriye dönük uyumluluk: gün verilirse o günün bülteni, verilmezse en son çekim */
export function latestBulletin(gun) {
  return gun ? gunBulteni(gun) : db.prepare('SELECT * FROM bultenler ORDER BY id DESC LIMIT 1').get();
}

/** Bugünden itibaren bültende maçı olan günler: [{ gun, mac_sayisi, baslamamis, bulten_id, cekilme_zamani }] */
export function bultenGunleri() {
  const bugun = istanbulDate();
  const simdi = new Date().toISOString();
  return db.prepare(`SELECT g.gun, g.bulten_id, b.cekilme_zamani,
      (SELECT COUNT(*) FROM maclar WHERE bulten_id = g.bulten_id AND gun = g.gun) mac_sayisi,
      (SELECT COUNT(*) FROM maclar WHERE bulten_id = g.bulten_id AND gun = g.gun AND (baslama IS NULL OR baslama > ?)) baslamamis
    FROM (SELECT gun, MAX(bulten_id) bulten_id FROM maclar WHERE gun >= ? GROUP BY gun) g
    JOIN bultenler b ON b.id = g.bulten_id ORDER BY g.gun`).all(simdi, bugun);
}

/**
 * Patron gün belirtmezse: bugün başlamamış maç varsa bugün, yoksa bültendeki ilk sonraki gün, o da yoksa yarın.
 */
export function varsayilanGun() {
  const bugun = istanbulDate();
  const gunler = bultenGunleri();
  const b = gunler.find(g => g.gun === bugun && g.baslamamis > 0) ?? gunler.find(g => g.gun > bugun);
  return b?.gun ?? istanbulDate(new Date(), 1);
}

/** Bir günün bülten durumu (UI ve Genel Müdür için). */
export function bulletinStatus(gun = varsayilanGun()) {
  const b = gunBulteni(gun);
  const sonCekim = db.prepare('SELECT * FROM cekim_kaydi ORDER BY id DESC LIMIT 1').get() ?? null;
  if (!b) return { var: false, tarih: gun, mesaj: `${gun} için bültende maç yok.`, son_cekim: sonCekim, bugun: istanbulDate(), gunler: bultenGunleri() };
  const yasSaat = (Date.now() - new Date(b.cekilme_zamani).getTime()) / 3600000;
  const hatalar = db.prepare('SELECT satir, neden FROM hatali_satirlar WHERE bulten_id = ? LIMIT 200').all(b.id);
  const ligler = db.prepare('SELECT lig, COUNT(*) n FROM maclar WHERE bulten_id = ? AND gun = ? GROUP BY lig ORDER BY n DESC').all(b.id, gun);
  const say = db.prepare('SELECT COUNT(*) n, SUM(CASE WHEN baslama IS NULL OR baslama > ? THEN 1 ELSE 0 END) k FROM maclar WHERE bulten_id = ? AND gun = ?').get(new Date().toISOString(), b.id, gun);
  return {
    var: true, id: b.id, tarih: gun, kaynak: b.kaynak, cekilme_zamani: b.cekilme_zamani,
    yas_saat: Math.round(yasSaat * 10) / 10, mac_sayisi: say.n, baslamamis: say.k ?? 0,
    cekim_mac_sayisi: b.mac_sayisi, hatali_satir_sayisi: b.hatali_satir_sayisi,
    not: b.not_, hatalar, ligler, son_cekim: sonCekim, bugun: istanbulDate(), gunler: bultenGunleri(),
  };
}

/** Maçları oranlarıyla döndürür. filtre: { gun, lig, ligler[], haricLigler[], bahis, minOran, maxOran, limit, kodlar[], baslamamisSonra } */
export function listMatches(bultenId, filtre = {}) {
  let rows = filtre.gun
    ? db.prepare('SELECT * FROM maclar WHERE bulten_id = ? AND gun = ? ORDER BY baslama, mac_kodu').all(bultenId, filtre.gun)
    : db.prepare('SELECT * FROM maclar WHERE bulten_id = ? ORDER BY baslama, mac_kodu').all(bultenId);
  const norm = (s) => (s || '').toLocaleLowerCase('tr-TR');
  if (filtre.kodlar?.length) rows = rows.filter(r => filtre.kodlar.map(String).includes(r.mac_kodu));
  if (filtre.lig) rows = rows.filter(r => norm(r.lig).includes(norm(filtre.lig)));
  if (filtre.ligler?.length) rows = rows.filter(r => filtre.ligler.some(l => norm(r.lig).includes(norm(l))));
  if (filtre.haricLigler?.length) rows = rows.filter(r => !filtre.haricLigler.some(l => norm(r.lig).includes(norm(l))));
  if (filtre.baslamamisSonra) rows = rows.filter(r => !r.baslama || new Date(r.baslama).getTime() > filtre.baslamamisSonra);
  const oStmt = db.prepare('SELECT bahis, secim, oran, mbs FROM oranlar WHERE mac_id = ? ORDER BY id');
  const out = [];
  for (const r of rows) {
    let oranlar = oStmt.all(r.id);
    if (filtre.bahis) oranlar = oranlar.filter(o => norm(o.bahis).includes(norm(filtre.bahis)));
    if (filtre.minOran) oranlar = oranlar.filter(o => o.oran >= filtre.minOran);
    if (filtre.maxOran) oranlar = oranlar.filter(o => o.oran <= filtre.maxOran);
    if (!oranlar.length && (filtre.bahis || filtre.minOran || filtre.maxOran)) continue;
    out.push({ ...r, oranlar });
    if (filtre.limit && out.length >= filtre.limit) break;
  }
  return out;
}

export function findOdd(bultenId, macKodu, bahis, secim) {
  const m = db.prepare('SELECT * FROM maclar WHERE bulten_id = ? AND mac_kodu = ?').get(bultenId, String(macKodu));
  if (!m) return { mac: null };
  const all = db.prepare('SELECT bahis, secim, oran, mbs FROM oranlar WHERE mac_id = ?').all(m.id);
  const norm = (s) => String(s).toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').replace(',', '.').trim();
  const o = all.find(x => norm(x.bahis) === norm(bahis) && norm(x.secim) === norm(secim));
  return { mac: m, oran: o ?? null, secenekler: o ? null : all.filter(x => norm(x.bahis) === norm(bahis)).map(x => x.secim), bahisler: o ? null : [...new Set(all.map(x => x.bahis))] };
}
