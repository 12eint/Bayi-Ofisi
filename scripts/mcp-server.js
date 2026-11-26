// Claude Code için stdio MCP sunucusu: "bayi" araçlarını (mcp__bayi__*) sunar.
// Bu yolla ofis, kendi Claude aboneliğinle oturum açmış Claude Code içinde çalışır (Genel Müdür = Claude Code oturumu).
// Olaylar veritabanı kuyruğuna yazılır; açık olan bayi ekranı (npm start) bunları canlı gösterir.
import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { db, nowIso } from '../server/db.js';
import { emitToQueue } from '../server/events.js';
import { buildHandlers } from '../server/agents/handlers.js';

// Her Claude Code oturumu (bu sürecin ömrü) için tek ofis oturumu; ilk ihtiyaçta oluşturulur
let oturumId = null;
const ctx = {
  get oturumId() {
    if (!oturumId) {
      oturumId = Number(db.prepare("INSERT INTO oturumlar(baslangic, talimat, durum) VALUES(?, 'Claude Code oturumu', 'calisiyor')").run(nowIso()).lastInsertRowid);
      emitToQueue('oturum', { oturum_id: oturumId, durum: 'basladi', mod: 'claude-code' });
    }
    return oturumId;
  },
  emit: emitToQueue,
  oturumuKapat() { oturumId = null; },   // rapor kaydedilince sonraki tur yeni oturumla başlar
};

const server = new McpServer({ name: 'bayi', version: '1.0.0' });
const h = buildHandlers(ctx);
for (const [name, d] of Object.entries(h)) {
  server.tool(name, d.desc, d.shape, async (args) => {
    try {
      const r = await d.run(args ?? {});
      return { content: [{ type: 'text', text: r.text }], isError: r.isError || undefined };
    } catch (e) {
      return { content: [{ type: 'text', text: `Araç hatası: ${e.message}` }], isError: true };
    }
  });
}
await server.connect(new StdioServerTransport());
