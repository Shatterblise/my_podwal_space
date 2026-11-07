import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { LocalD1Database } from './local-db.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const publicRoot = path.join(projectRoot, 'public');
const dataRoot = path.resolve(process.env.MY_WORLD_DATA_DIR || path.join(projectRoot, '.my-world-data'));
const port = Number(process.env.PORT || process.env.MY_WORLD_PORT || 8787);
const host = process.env.HOST || process.env.MY_WORLD_HOST || '127.0.0.1';
const tickMinutes = Math.max(0, Math.min(1440, Number(process.env.MY_WORLD_TICK_MINUTES ?? 60)));

await fs.mkdir(dataRoot, { recursive: true, mode: 0o700 });

async function readOrCreatePassword() {
  if (process.env.MY_WORLD_PASSWORD) return process.env.MY_WORLD_PASSWORD;
  const file = path.join(dataRoot, 'app-password.txt');
  try { return (await fs.readFile(file, 'utf8')).trim(); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const password = randomBytes(18).toString('base64url');
    await fs.writeFile(file, `${password}\n`, { mode: 0o600, flag: 'wx' });
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('MY WORLD — пароль первого входа (сохрани его):');
    console.log(password);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    return password;
  }
}

const env = {
  LOCAL_RUNTIME: true,
  APP_PASSWORD: await readOrCreatePassword(),
  LOCAL_LLM_BASE_URL: process.env.LOCAL_LLM_BASE_URL || '',
  LOCAL_LLM_MODEL: process.env.LOCAL_LLM_MODEL || '',
  LOCAL_LLM_API_KEY: process.env.LOCAL_LLM_API_KEY || '',
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  GROQ_MODEL: process.env.GROQ_MODEL || '',
  AI: null,
  DB: new LocalD1Database(path.join(dataRoot, 'local-db.json')),
  ASSETS: {
    async fetch(request) {
      const url = new URL(request.url);
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); }
      catch { return new Response('Bad request', { status: 400 }); }
      if (pathname === '/') pathname = '/index.html';
      const target = path.resolve(publicRoot, `.${pathname}`);
      if (!target.startsWith(`${publicRoot}${path.sep}`)) return new Response('Not found', { status: 404 });
      try {
        const bytes = await fs.readFile(target);
        const ext = path.extname(target).toLowerCase();
        const mime = ({ '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.webmanifest':'application/manifest+json', '.png':'image/png', '.svg':'image/svg+xml', '.ico':'image/x-icon' })[ext] || 'application/octet-stream';
        return new Response(bytes, { headers: { 'content-type': mime, 'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' } });
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'EISDIR') return new Response('Not found', { status: 404 });
        throw error;
      }
    }
  }
};

const server = http.createServer(async (incoming, outgoing) => {
  try {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const hostHeader = incoming.headers.host || `${host}:${port}`;
    const request = new Request(`http://${hostHeader}${incoming.url || '/'}`, {
      method: incoming.method,
      headers: incoming.headers,
      body: ['GET', 'HEAD'].includes(incoming.method) ? undefined : body,
      ...(body && !['GET', 'HEAD'].includes(incoming.method) ? { duplex: 'half' } : {})
    });
    const response = await worker.fetch(request, env, { waitUntil(promise) { promise.catch(error => console.error('[MY WORLD background task]', error)); } });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    if (!response.body || incoming.method === 'HEAD') { outgoing.end(); return; }
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      outgoing.write(Buffer.from(value));
    }
    outgoing.end();
  } catch (error) {
    console.error('[MY WORLD request error]', error);
    if (!outgoing.headersSent) outgoing.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    outgoing.end(JSON.stringify({ error: 'Ошибка локального сервера MY WORLD.' }));
  }
});

server.listen(port, host, () => {
  console.log(`MY WORLD запущен: http://${host}:${port}`);
  console.log(`Данные мира сохраняются в: ${dataRoot}`);
  console.log(env.LOCAL_LLM_BASE_URL ? `Локальная языковая модель: ${env.LOCAL_LLM_BASE_URL} (${env.LOCAL_LLM_MODEL || 'модель по умолчанию'})` : 'Локальная психика активна. Для свободного диалога можно подключить локальную модель через LOCAL_LLM_BASE_URL.');
  if (host === '127.0.0.1' || host === 'localhost') console.log('Сайт доступен только на этом устройстве. Для доступа по локальной сети настрой MY_WORLD_HOST=0.0.0.0.');
});

if (tickMinutes > 0) {
  const intervalMs = tickMinutes * 60_000;
  let lastSlot = Math.floor(Date.now() / intervalMs);
  const timer = setInterval(async () => {
    const slot = Math.floor(Date.now() / intervalMs);
    if (slot === lastSlot) return;
    lastSlot = slot;
    try {
      const { runOneTick } = await import('../src/worker.js');
      const result = await runOneTick(env, { scheduledAt: Date.now(), manual: false });
      if (!result.skipped) console.log(`[MY WORLD] Мир продвинулся на ${tickMinutes} мин. Интервал. Успешных решений: ${result.batch?.succeeded ?? 0}.`);
    } catch (error) { console.error('[MY WORLD scheduled tick]', error); }
  }, Math.min(60_000, intervalMs));
  timer.unref();
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));