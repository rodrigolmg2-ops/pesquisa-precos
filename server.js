/**
 * PesquisaPreços.gov — Proxy Backend
 * Node.js + Express
 *
 * Resolve CORS entre o browser e a API dadosabertos.compras.gov.br
 * Deploy: Railway, Render, Fly.io ou qualquer VPS
 */

const express = require('express');
const https   = require('https');
const http    = require('http');
const path    = require('path');
const url     = require('url');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── CORS aberto (ajuste para domínio específico em prod) ─────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());

// ─── Serve o frontend estático ────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Função utilitária: fetch via https/http nativo ──────────────────────────
function fetchJson(targetUrl) {
  return new Promise((resolve, reject) => {
    const parsed   = new url.URL(targetUrl);
    const protocol = parsed.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      method:   'GET',
      headers: {
        'Accept':     'application/json',
        'User-Agent': 'PesquisaPrecos-Proxy/1.0'
      }
    };

    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try   { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ROTA: /api/pesquisa-preco/material
// Proxy para: dadosabertos.compras.gov.br/modulo-pesquisa-preco/1_consultarMaterial
// Parâmetros aceitos (todos opcionais, exceto ao menos um):
//   codigoItemCatalogo, dataInicial, dataFinal, uf, codigoUasg,
//   esfera, poder, pagina
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/pesquisa-preco/material', async (req, res) => {
  try {
    const target = buildComprasUrl('material', req.query);
    console.log(`[MATERIAL] → ${target}`);
    const { status, body } = await fetchJson(target);
    res.status(status).json(body);
  } catch (err) {
    console.error('[MATERIAL] Erro:', err.message);
    res.status(502).json({ error: 'Erro ao consultar API Compras.gov', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROTA: /api/pesquisa-preco/servico
// Proxy para: dadosabertos.compras.gov.br/modulo-pesquisa-preco/3_consultarServico
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/pesquisa-preco/servico', async (req, res) => {
  try {
    const target = buildComprasUrl('servico', req.query);
    console.log(`[SERVICO]  → ${target}`);
    const { status, body } = await fetchJson(target);
    res.status(status).json(body);
  } catch (err) {
    console.error('[SERVICO] Erro:', err.message);
    res.status(502).json({ error: 'Erro ao consultar API Compras.gov', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROTA: /api/pesquisa-preco/material/detalhe
// Proxy para: /modulo-pesquisa-preco/2_detalharMaterial
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/pesquisa-preco/material/detalhe', async (req, res) => {
  try {
    const base = 'https://dadosabertos.compras.gov.br/modulo-pesquisa-preco/2_detalharMaterial';
    const u = new url.URL(base);
    appendParams(u, req.query, ['codigoCompra','numeroItemCompra','pagina']);
    const { status, body } = await fetchJson(u.toString());
    res.status(status).json(body);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROTA: /api/pesquisa-preco/servico/detalhe
// Proxy para: /modulo-pesquisa-preco/4_detalharServico
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/pesquisa-preco/servico/detalhe', async (req, res) => {
  try {
    const base = 'https://dadosabertos.compras.gov.br/modulo-pesquisa-preco/4_detalharServico';
    const u = new url.URL(base);
    appendParams(u, req.query, ['codigoCompra','numeroItemCompra','pagina']);
    const { status, body } = await fetchJson(u.toString());
    res.status(status).json(body);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROTA: /api/pncp/contratos
// Proxy para PNCP — busca contratos para enriquecimento
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/pncp/contratos', async (req, res) => {
  try {
    const base = 'https://pncp.gov.br/api/pncp/v1/contratos';
    const u = new url.URL(base);
    appendParams(u, req.query, ['dataInicial','dataFinal','uf','pagina','tamanhoPagina','codigoModalidadeContratacao']);
    console.log(`[PNCP]     → ${u.toString()}`);
    const { status, body } = await fetchJson(u.toString());
    res.status(status).json(body);
  } catch (err) {
    console.error('[PNCP] Erro:', err.message);
    res.status(502).json({ error: 'Erro ao consultar PNCP', detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROTA: /api/health — healthcheck para Railway/Render
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'PesquisaPrecos-Proxy',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      material: '/api/pesquisa-preco/material',
      servico:  '/api/pesquisa-preco/servico',
      pncp:     '/api/pncp/contratos'
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SPA fallback — sempre serve o index.html para rotas não-API
// ─────────────────────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
const COMPRAS_BASE = 'https://dadosabertos.compras.gov.br';
const COMPRAS_ENDPOINTS = {
  material: '/modulo-pesquisa-preco/1_consultarMaterial',
  servico:  '/modulo-pesquisa-preco/3_consultarServico'
};

function buildComprasUrl(tipo, query) {
  const u = new url.URL(COMPRAS_BASE + COMPRAS_ENDPOINTS[tipo]);
  const allowed = ['codigoItemCatalogo','dataInicial','dataFinal','uf',
                   'codigoUasg','esfera','poder','pagina'];
  appendParams(u, query, allowed);
  return u.toString();
}

function appendParams(urlObj, query, allowed) {
  allowed.forEach(key => {
    if (query[key] !== undefined && query[key] !== '') {
      urlObj.searchParams.set(key, query[key]);
    }
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ PesquisaPreços Proxy rodando na porta ${PORT}`);
  console.log(`   Frontend:  http://localhost:${PORT}`);
  console.log(`   Health:    http://localhost:${PORT}/api/health`);
  console.log(`   Material:  http://localhost:${PORT}/api/pesquisa-preco/material`);
  console.log(`   Serviço:   http://localhost:${PORT}/api/pesquisa-preco/servico\n`);
});
