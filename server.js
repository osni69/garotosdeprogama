const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.resolve(__dirname);
const MAX_BODY_BYTES = 50 * 1024;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 15;
const WHATSAPP_NUMBER = '5545999526372';
const rateBuckets = new Map();

const sections = [
  ['01 — O ESSENCIAL', ['Nome da empresa', 'Segmento de atuação', 'Cidade / região', 'Modelo de negócio', 'O que a empresa faz', 'Objetivo principal']],
  ['02 — PÚBLICO, OFERTA E POSICIONAMENTO', ['Cliente ideal', 'Oferta principal', 'Faixa de preço', 'Ação de conversão', 'Diferenciais', 'Referências de mercado']],
  ['03 — CONTEÚDO E CONFIANÇA', ['Produtos e serviços', 'Números e resultados', 'Depoimentos', 'História da marca', 'Dúvidas frequentes', 'Materiais disponíveis']],
  ['04 — DIREÇÃO VISUAL', ['Direção visual', 'Cores da marca', 'Referências visuais', 'O que evitar']],
  ['05 — CONTATO E PRÓXIMOS PASSOS', ['Nome do contato', 'Cargo ou relação', 'E-mail', 'Telefone do cliente', 'Prazo desejado', 'Faixa de investimento', 'Informações adicionais']]
];
const allFields = sections.flatMap(([, fields]) => fields);
const requiredFields = ['Nome da empresa', 'Segmento de atuação', 'Modelo de negócio', 'O que a empresa faz', 'Objetivo principal', 'Cliente ideal', 'Oferta principal', 'Ação de conversão', 'Diferenciais', 'Produtos e serviços', 'Direção visual', 'Nome do contato', 'E-mail', 'Telefone do cliente'];

function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https://files.manuscdn.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'");
}

function sendJson(res, status, payload) {
  applySecurityHeaders(res);
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function clientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (forwarded || req.socket.remoteAddress || 'unknown').slice(0, 80);
}

function isRateLimited(req) {
  const now = Date.now();
  const key = clientKey(req);
  const current = rateBuckets.get(key) || { count: 0, start: now };
  if (now - current.start >= RATE_WINDOW_MS) {
    current.count = 0;
    current.start = now;
  }
  current.count += 1;
  rateBuckets.set(key, current);
  if (rateBuckets.size > 2000) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (now - bucket.start >= RATE_WINDOW_MS) rateBuckets.delete(bucketKey);
    }
  }
  return current.count > RATE_LIMIT;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!String(req.headers['content-type'] || '').toLowerCase().includes('application/json')) {
      reject(Object.assign(new Error('unsupported_media_type'), { status: 415 }));
      return;
    }
    let size = 0;
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('payload_too_large'), { status: 413 }));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(raw || '{}');
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('invalid_json');
        resolve(parsed);
      } catch {
        reject(Object.assign(new Error('invalid_json'), { status: 400 }));
      }
    });
    req.on('error', () => reject(Object.assign(new Error('request_error'), { status: 400 })));
  });
}

function cleanValue(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, 3000) || 'Não informado';
}

function validateAnswers(body) {
  if (cleanValue(body.website) !== 'Não informado') return { ok: false, code: 'invalid_request' };
  const answers = {};
  allFields.forEach((field) => { answers[field] = cleanValue(body[field]); });
  const missing = requiredFields.filter((field) => answers[field] === 'Não informado');
  if (missing.length) return { ok: false, code: 'required_fields' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answers['E-mail'])) return { ok: false, code: 'invalid_email' };
  if (answers['Telefone do cliente'].replace(/\D/g, '').length < 10) return { ok: false, code: 'invalid_phone' };
  return { ok: true, answers };
}

function buildMessage(answers) {
  const lines = ['Olá, Garotos de Programa! Preenchi o briefing da minha landing page e quero conversar sobre o projeto.', '', `Empresa: ${answers['Nome da empresa']}`, ''];
  sections.forEach(([title, fields]) => {
    lines.push(title);
    fields.forEach((field) => lines.push(`${field}: ${answers[field]}`));
    lines.push('');
  });
  lines.push('Enviado pelo briefing online da Garotos de Programa.');
  return lines.join('\n');
}

function safeFilePath(urlPath) {
  const pathname = decodeURIComponent(urlPath.split('?')[0]);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const allowed = new Set(['index.html', 'style.css', 'script.js', 'manus-routes.json', 'assets/logo.png']);
  if (!allowed.has(relative)) return null;
  const resolved = path.resolve(ROOT, relative);
  return resolved.startsWith(`${ROOT}${path.sep}`) ? resolved : null;
}

function serveStatic(req, res) {
  const filePath = safeFilePath(req.url || '/');
  if (!filePath) {
    sendJson(res, 404, { error: 'not_found' });
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }
    applySecurityHeaders(res);
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png' };
    res.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': path.extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=3600' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/health') {
      sendJson(res, 200, { ok: true, service: 'briefing-api' });
      return;
    }
    if (req.method === 'POST' && req.url === '/api/briefing') {
      if (isRateLimited(req)) {
        sendJson(res, 429, { error: 'too_many_requests', message: 'Tente novamente em alguns instantes.' });
        return;
      }
      const body = await readJson(req);
      const result = validateAnswers(body);
      if (!result.ok) {
        sendJson(res, 400, { error: result.code, message: 'Confira os campos obrigatórios e tente novamente.' });
        return;
      }
      const message = buildMessage(result.answers);
      const token = crypto.createHash('sha256').update(message).digest('hex').slice(0, 12);
      const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
      sendJson(res, 200, { ok: true, token, whatsappUrl });
      return;
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      serveStatic(req, res);
      return;
    }
    sendJson(res, 405, { error: 'method_not_allowed' });
  } catch (error) {
    const status = Number(error.status) || 500;
    sendJson(res, status, { error: status === 500 ? 'internal_error' : error.message, message: status === 500 ? 'Não foi possível concluir agora.' : 'Não foi possível processar o briefing.' });
  }
});

server.headersTimeout = 10_000;
server.requestTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.listen(PORT, '0.0.0.0', () => console.log(`briefing-api listening on ${PORT}`));
