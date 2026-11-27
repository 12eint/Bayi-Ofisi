// Model olasılığı – veritabanı köprüsü. Bülten oranları değişmediği için maç başına model önbelleklenir.
import { db } from '../db.js';
import { macModeli, secimDegeri, yuzde, degerYazi } from './poisson.js';

const onbellek = new Map();   // mac_id → { oranlar, model }

export function macModeliGetir(macId) {
  if (onbellek.has(macId)) return onbellek.get(macId);
  const oranlar = db.prepare('SELECT bahis, secim, oran FROM oranlar WHERE mac_id = ?').all(macId);
  const kayit = { oranlar, model: macModeli(oranlar) };
  if (onbellek.size > 2000) onbellek.clear();
  onbellek.set(macId, kayit);
  return kayit;
}

/** Maça yeni oran eklendiyse (ör. detay çekimi) önbelleği bırak */
export function modelOnbellekSil(macId) { onbellek.delete(macId); }

/** { model, piyasa, deger } – model kurulamazsa alanlar null */
export function secimModeli(macId, bahis, secim, oran) {
  const { oranlar, model } = macModeliGetir(macId);
  return secimDegeri(oranlar, model, bahis, secim, oran);
}

/** Kısa yazı: "λ 1.62-0.95" */
export function lambdaYazi(macId) {
  const { model } = macModeliGetir(macId);
  return model ? `λ ${model.lh.toFixed(2)}-${model.la.toFixed(2)}` : 'λ –';
}

/** Model alanları boş olan eski kuponları (bültenleri hâlâ duruyorsa) doldurur. Doldurulan kupon sayısını döner. */
export function eksikModelleriDoldur() {
  const kuponlar = db.prepare('SELECT id, bulten_id, toplam_oran FROM kuponlar WHERE model_olasilik IS NULL AND bulten_id IS NOT NULL').all();
  let n = 0;
  for (const k of kuponlar) {
    const ss = db.prepare('SELECT id, mac_kodu, bahis, secim, oran FROM kupon_secimleri WHERE kupon_id = ?').all(k.id);
    let p = 1, tam = ss.length > 0;
    const guncelle = [];
    for (const s of ss) {
      const m = db.prepare('SELECT id FROM maclar WHERE bulten_id = ? AND mac_kodu = ?').get(k.bulten_id, s.mac_kodu);
      const md = m ? secimModeli(m.id, s.bahis, s.secim, s.oran) : { model: null, piyasa: null, deger: null };
      guncelle.push([md.model, md.piyasa, md.deger, s.id]);
      if (md.model == null) tam = false; else p *= md.model;
    }
    const up = db.prepare('UPDATE kupon_secimleri SET model_olasilik = ?, piyasa_olasilik = ?, deger = ? WHERE id = ?');
    for (const g of guncelle) up.run(...g);
    if (tam) {
      db.prepare('UPDATE kuponlar SET model_olasilik = ?, beklenen_getiri = ? WHERE id = ?')
        .run(Math.round(p * 1e6) / 1e6, Math.round((p * k.toplam_oran - 1) * 1e4) / 1e4, k.id);
      n++;
    }
  }
  return n;
}

export { yuzde, degerYazi };
