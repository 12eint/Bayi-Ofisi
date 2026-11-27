// Genel Müdür – Claude Agent SDK ana agent'ı. Alt agent'lar SDK'nın `agents` seçeneğiyle tanımlanır.
import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { db, nowIso } from '../db.js';
import { getSettings } from '../settings.js';
import { emit } from '../events.js';
import { AGENTS, gmSystemPrompt, TOOL_PREFIX, ajanPrompt, ajanModeli } from './definitions.js';
import { buildHandlers } from './handlers.js';
import { runDemoOffice } from './demo.js';

let aktif = null; // aynı anda tek oturum

export function officeMode() {
  const mod = process.env.OFIS_MODU || getSettings().ofisModu;   // OFIS_MODU=canli|demo ile geçici geçersiz kılma
  if (mod === 'demo') return 'demo';
  if (mod === 'canli') return 'canli';
  if (mod === 'claude-code') return 'claude-code';
  // otomatik: API anahtarı varsa SDK, yoksa aboneliğinle çalışan Claude Code'daki Genel Müdür (gelen kutusu)
  return process.env.ANTHROPIC_API_KEY ? 'canli' : 'claude-code';
}
export const isBusy = () => !!aktif;

function bayiServer(oturumId) {
  const h = buildHandlers({ oturumId, emit });
  delete h.rapor_kaydet; delete h.gelen_mesajlari_al; delete h.cevap_yaz; delete h.butce_kontrol;   // SDK modunda bunları orkestratör yapar
  const tools = Object.entries(h).map(([name, d]) =>
    tool(name, d.desc, d.shape, async (args) => {
      try {
        const r = await d.run(args ?? {});
        return { content: [{ type: 'text', text: r.text }], ...(r.isError ? { isError: true } : {}) };
      } catch (e) {
        return { content: [{ type: 'text', text: `Araç hatası: ${e.message}` }], isError: true };
      }
    }, d.readOnly ? { annotations: { readOnlyHint: true } } : undefined));
  return createSdkMcpServer({ name: 'bayi', version: '1.0.0', tools, alwaysLoad: true });
}

const AGENT_TOOL_NAMES = new Set(['Agent', 'Task']);

/**
 * Patronun talimatıyla Genel Müdür'ü çalıştırır. Aynı günün önceki SDK oturumu varsa devam eder (resume).
 * @returns {Promise<{oturumId:number, rapor:string, maliyet?:number}>}
 */
export async function runOffice(talimat, { onLog } = {}) {
  if (aktif) throw new Error('Ofis şu an başka bir iş üzerinde çalışıyor.');
  const settings = getSettings();
  const { lastInsertRowid } = db.prepare('INSERT INTO oturumlar(baslangic, talimat) VALUES(?,?)').run(nowIso(), talimat);
  const oturumId = Number(lastInsertRowid);
  db.prepare('INSERT INTO sohbet(zaman, kim, metin, oturum_id) VALUES(?,?,?,?)').run(nowIso(), 'patron', talimat, oturumId);
  aktif = { oturumId, abort: new AbortController() };
  emit('oturum', { oturum_id: oturumId, durum: 'basladi', talimat, mod: officeMode() });
  const log = onLog ?? (() => {});

  try {
    if (officeMode() === 'demo') {
      const rapor = await runDemoOffice(talimat, { oturumId, log });
      finish(oturumId, 'bitti', rapor, null, null);
      return { oturumId, rapor };
    }

    // Aynı gün içindeki son başarılı SDK oturumundan devam et (sohbet bağlamı korunur)
    const prev = db.prepare("SELECT sdk_session_id FROM oturumlar WHERE sdk_session_id IS NOT NULL AND durum = 'bitti' AND date(baslangic) = date('now') ORDER BY id DESC LIMIT 1").get();
    const agents = Object.fromEntries(Object.entries(AGENTS).map(([k, a]) => [k, {
      description: a.description, prompt: ajanPrompt(k, settings), tools: a.tools, model: ajanModeli(k, settings), maxTurns: 40,
    }]));

    const taskAgent = new Map(); // tool_use_id / task_id -> ajan adı
    let rapor = ''; let maliyet = null; let sdkSession = null;
    const q = query({
      prompt: `Patronun talimatı: ${talimat}\n(Bugün: ${new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' })}. Kupon patronun istediği güne yapılır; gün belirtmediyse varsayılan gün (bugün başlamamış maç varsa bugün, yoksa sonraki gün).)`,
      options: {
        model: settings.model,
        systemPrompt: gmSystemPrompt(settings),
        agents,
        mcpServers: { bayi: bayiServer(oturumId) },
        allowedTools: ['Agent', 'Task', `${TOOL_PREFIX}*`],
        // Dosya, kabuk ve web araçları ofiste yok – sadece bayi araçları ve alt agent'lar
        disallowedTools: ['Bash', 'Write', 'Edit', 'NotebookEdit', 'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Workflow', 'Agent(fork)', 'Agent(general-purpose)', 'Agent(Explore)', 'Agent(Plan)'],
        permissionMode: 'dontAsk',
        settingSources: [],
        maxBudgetUsd: settings.oturumButceUsd,
        maxTurns: 60,
        resume: prev?.sdk_session_id,
        abortController: aktif.abort,
        env: { ...process.env, CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: '1', CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: '4', CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS: '1' },
      },
    });

    for await (const m of q) {
      if (m.session_id && !sdkSession) { sdkSession = m.session_id; db.prepare('UPDATE oturumlar SET sdk_session_id = ? WHERE id = ?').run(sdkSession, oturumId); }
      if (m.type === 'assistant') {
        const fromSub = m.parent_tool_use_id;
        for (const b of m.message?.content ?? []) {
          if (b.type === 'tool_use' && AGENT_TOOL_NAMES.has(b.name)) {
            const ajan = b.input?.subagent_type;
            taskAgent.set(b.id, ajan);
            emit('ajan_durum', { ajan, durum: ajan === 'cok-bilen-kardes' ? 'eleştiriyor...' : 'kupon yazıyor...', calisiyor: true, oturum_id: oturumId });
            log(`→ ${ajan}: ${b.input?.description ?? ''}`);
          } else if (b.type === 'tool_use' && fromSub) {
            const ajan = taskAgent.get(fromSub);
            if (ajan) emit('ajan_durum', { ajan, durum: toolStatus(b.name, ajan), calisiyor: true });
          } else if (b.type === 'text' && !fromSub && b.text?.trim()) {
            log(`GM: ${b.text.trim().slice(0, 300)}`);
          }
        }
      } else if (m.type === 'system' && m.subtype === 'task_started' && m.subagent_type) {
        if (m.tool_use_id) taskAgent.set(m.tool_use_id, m.subagent_type);
        taskAgent.set(m.task_id, m.subagent_type);
      } else if (m.type === 'system' && m.subtype === 'task_notification') {
        const ajan = taskAgent.get(m.task_id) ?? taskAgent.get(m.tool_use_id);
        if (ajan) emit('ajan_durum', { ajan, durum: m.status === 'completed' ? 'işini bitirdi' : `durdu (${m.status})`, calisiyor: false });
      } else if (m.type === 'user' && !m.parent_tool_use_id) {
        // Ön planda çalışan alt agent'ın sonucu döndü
        for (const b of Array.isArray(m.message?.content) ? m.message.content : []) {
          if (b.type === 'tool_result' && taskAgent.has(b.tool_use_id)) {
            const txt = JSON.stringify(b.content ?? '');
            if (!/async_launched|running in the background/i.test(txt)) emit('ajan_durum', { ajan: taskAgent.get(b.tool_use_id), durum: 'işini bitirdi', calisiyor: false });
          }
        }
      } else if (m.type === 'result') {
        maliyet = m.total_cost_usd ?? null;
        if (m.subtype === 'success') rapor = m.result;
        else rapor = `Ofis işi tamamlayamadı (${m.subtype}).` + (m.subtype === 'error_max_budget_usd' ? ` Oturum bütçesi (${settings.oturumButceUsd} USD) doldu; ayarlardan artırabilirsin.` : '');
      }
    }
    finish(oturumId, 'bitti', rapor, maliyet, sdkSession);
    return { oturumId, rapor, maliyet };
  } catch (e) {
    const msg = /auth|api key|401|credential|login/i.test(e.message)
      ? `Claude'a bağlanılamadı: kimlik bilgisi yok ya da geçersiz. .env içine ANTHROPIC_API_KEY ekle (ya da ayarlardan "Deneme ofisi" modunu seç). Ayrıntı: ${e.message}`
      : `Ofiste hata: ${e.message}`;
    finish(oturumId, 'hata', msg, null, null);
    emit('hata', { mesaj: msg, oturum_id: oturumId });
    return { oturumId, rapor: msg, hata: true };
  } finally {
    aktif = null;
    for (const k of Object.keys(AGENTS)) emit('ajan_durum', { ajan: k, durum: 'masada', calisiyor: false });
    emit('ajan_durum', { ajan: 'genel-mudur', durum: 'masada', calisiyor: false });
  }
}

export function stopOffice() {
  if (!aktif) return false;
  aktif.abort.abort();
  return true;
}

function toolStatus(name, ajan) {
  const n = name.replace(TOOL_PREFIX, '');
  if (n === 'bulten_listele' || n === 'mac_detay') return 'bülteni inceliyor...';
  if (n === 'takim_formu') return 'form verisine bakıyor...';
  if (n === 'kupon_teklif_et') return 'kupon yazıyor...';
  if (n === 'kupon_puanla') return 'puan veriyor...';
  if (n === 'kuponlari_getir') return ajan === 'cok-bilen-kardes' ? 'eleştiriyor...' : 'kuponlara bakıyor...';
  return 'çalışıyor...';
}

function finish(oturumId, durum, rapor, maliyet, sdkSession) {
  db.prepare('UPDATE oturumlar SET durum = ?, rapor = ?, maliyet_usd = ?, sdk_session_id = COALESCE(?, sdk_session_id) WHERE id = ?')
    .run(durum, rapor, maliyet, sdkSession, oturumId);
  emit('rapor', { oturum_id: oturumId, metin: rapor, durum, maliyet });
  emit('oturum', { oturum_id: oturumId, durum });
}
