// Proxy entre o PWA no celular e a API HTTP do opencode dentro do ambiente AWS.
// O opencode precisa estar rodando com `opencode serve` (porta 4096 por padrao,
// ajuste OPENCODE_URL se necessario). Nao ha autenticacao neste proxy: ele so
// escuta em localhost; o acesso externo deve passar por um tunel com TLS/credencial.
import express from 'express';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import path from 'path';

const OPENCODE_URL = process.env.OPENCODE_URL || 'http://localhost:4096';
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json({ limit: '2mb' }));

const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
app.use(express.static(pub));

// Lista sessoes existentes
app.get('/api/sessions', async (_req, res) => {
  try {
    const r = await fetch(`${OPENCODE_URL}/session`);
    res.status(r.status).json(await r.json());
  } catch (e) {
    res.status(502).json({ error: 'opencode inacessivel: ' + e.message });
  }
});

// Cria sessao
app.post('/api/sessions', async (req, res) => {
  try {
    const r = await fetch(`${OPENCODE_URL}/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req.body || {})
    });
    res.status(r.status).json(await r.json());
  } catch (e) {
    res.status(502).json({ error: 'opencode inacessivel: ' + e.message });
  }
});

// Envia prompt para uma sessao (SSE de volta ao celular)
app.post('/api/sessions/:id/message', async (req, res) => {
  const { id } = req.params;
  const { parts, providerID, modelID } = req.body;
  try {
    const r = await fetch(`${OPENCODE_URL}/session/${id}/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        parts: parts || [{ type: 'text', text: req.body.text || '' }],
        model: { providerID: providerID || 'anthropic', modelID: modelID || 'claude-sonnet-4-20250514' }
      })
    });
    res.status(r.status);
    res.setHeader('content-type', r.headers.get('content-type') || 'application/json');
    r.body.pipe(res);
  } catch (e) {
    res.status(502).json({ error: 'opencode inacessivel: ' + e.message });
  }
});

// Arquivos de uma sessao (diffs/paths modificados)
app.get('/api/sessions/:id/files', async (req, res) => {
  try {
    const r = await fetch(`${OPENCODE_URL}/session/${req.params.id}/file`);
    res.status(r.status).json(await r.json());
  } catch (e) {
    res.status(502).json({ error: 'opencode inacessivel: ' + e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`codex-voz em http://localhost:${PORT} -> ${OPENCODE_URL}`);
});
