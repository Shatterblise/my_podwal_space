import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');
const read = file => fs.readFile(path.join(root, file), 'utf8');
const write = (file, value) => fs.writeFile(path.join(root, file), value, 'utf8');
function replaceOnce(source, search, replacement, label) {
  const at = source.indexOf(search);
  if (at < 0) throw new Error(`MY WORLD overlay: anchor not found (${label})`);
  return source.slice(0, at) + replacement + source.slice(at + search.length);
}
function replaceRegex(source, regex, replacement, label) {
  if (!regex.test(source)) throw new Error(`MY WORLD overlay: pattern not found (${label})`);
  return source.replace(regex, replacement);
}

await fs.copyFile(new URL('./psyche.js', import.meta.url), path.join(root, 'src/psyche.js'));
await fs.mkdir(path.join(root, 'server'), { recursive: true });
await fs.mkdir(path.join(root, 'tests'), { recursive: true });
for (const file of ['local-db.mjs', 'local-server.mjs']) await fs.copyFile(new URL(`./server/${file}`, import.meta.url), path.join(root, 'server', file));
await fs.copyFile(new URL('./local-runtime.test.js', import.meta.url), path.join(root, 'tests/local-runtime.test.js'));
await fs.copyFile(new URL('./local-provider.test.js', import.meta.url), path.join(root, 'tests/local-provider.test.js'));
await fs.copyFile(new URL('./.gitignore', import.meta.url), path.join(root, '.gitignore'));
await fs.copyFile(new URL('./README_RU.md', import.meta.url), path.join(root, 'README_RU.md'));
const packageJson = JSON.parse(await read('package.json'));
packageJson.scripts ||= {};
packageJson.scripts['start:local'] = 'node server/local-server.mjs';
packageJson.scripts.start = 'node server/local-server.mjs';
await write('package.json', JSON.stringify(packageJson, null, 2) + '\n');

let core = await read('src/core.js');
if (!core.includes("from './psyche.js'")) {
  core = replaceOnce(core,
    "export const deepClone = value => JSON.parse(JSON.stringify(value));",
    `export const deepClone = value => JSON.parse(JSON.stringify(value));\nimport { createPsyche, ensurePsyche, advancePsyche, buildPsycheContext, validateCustomAction, applyPsycheOutcome, chooseLocalAction } from './psyche.js';\nexport { chooseLocalAction };`,
    'core imports');
}

if (!core.includes('function makePenny()')) {
  const pennyFactory = `function makePenny() {\n  const c = makeCharacter('penny', 'Penny', '✦', { sociability: 50, curiosity: 50, orderliness: 50, creativity: 50, empathy: 50, sensitivity: 50 });\n  c.identity.biography = 'Начальный профиль. Подробная биография и характер настраиваются пользователем.';\n  c.identity.speechStyle = 'Индивидуальная манера речи ещё не задана. Формируется из профиля и опыта.';\n  c.identity.interests = ['поделки и рукоделие', 'коллекционирование фантиков', 'необычные милые открытки'];\n  c.identity.habits = ['сохраняет интересные фантики и открытки'];\n  c.state = { ...c.state, location: 'home', activity: 'rest', mood: 55, energy: 76, socialNeed: 34, stress: 14 };\n  c.goals.push({ id: 'penny_collection', title: 'Заниматься собственными коллекциями и поделками', type: 'creative', reason: 'Устойчивый личный интерес', priority: 55, progress: 0, status: 'active' });\n  c.memory.facts.push({ id: 'penny_interest_fact', text: 'Ей интересны поделки, фантики и необычные милые открытки.', importance: 3 });\n  c.memory.episodes.push({ id: 'penny_seed', text: 'Начало жизни в этом мире. Личные занятия и планы ещё формируются.', day: 1, hour: 8, importance: 1, visibility: 'private' });\n  return c;\n}\n\n`;
  core = replaceOnce(core, 'export function createInitialWorld() {', pennyFactory + 'export function createInitialWorld() {', 'Penny factory insertion');
}

core = core.replace(/const chars = \[[\s\S]*?\n  \];/, 'const chars = [makeJacob(), makePenny()];');
core = core.replace(/^\s*chars\[[012]\]\.goals\.push\([^\n]*\);\s*$/gm, '');
if (!core.includes('const chars = [makeJacob(), makePenny()];')) throw new Error('MY WORLD overlay: could not make two-character starter roster');

if (!core.includes('psyche: createPsyche()')) {
  core = replaceOnce(core, 'cooldowns: {}\n  };', 'cooldowns: {}, psyche: createPsyche()\n  };', 'character psyche initialization');
}
if (!core.includes('ensurePsyche(c);')) {
  core = replaceOnce(core, '    c.cooldowns ||= {};', '    c.cooldowns ||= {};\n    ensurePsyche(c);\n    c.state.currentAction = c.state.currentAction && typeof c.state.currentAction === \'object\' ? c.state.currentAction : null;', 'psyche normalization');
}
if (!core.includes('advancePsyche(world, c);')) {
  core = replaceOnce(core, '      if (g.progress >= 100) g.status = \'completed\';\n    }', '      if (g.progress >= 100) g.status = \'completed\';\n    }\n    advancePsyche(world, c);', 'hourly psyche update');
}
if (!core.includes('psyche: buildPsycheContext(world, actor)')) {
  core = replaceOnce(core, `      recentActions\n    },\n    nearby: visible`, `      recentActions\n    },\n    psyche: buildPsycheContext(world, actor, [...incoming.map(message => message.say), ...publicEvents].join(' ')),\n    nearby: visible`, 'cognitive context injection');
}

core = core.replace("else if (act === 'explore' || act === 'travelling') { s.energy = clamp(s.energy - 2); }", "else if (act === 'explore' || act === 'travelling') { s.energy = clamp(s.energy - 2); }\n    else if (act === 'custom') { const category = s.currentAction?.category; s.energy = clamp(s.energy + (category === 'rest' ? 4 : ['work','study','creative','expression','exercise'].includes(category) ? -2 : -0.5)); if (category === 'rest' || category === 'hygiene') s.stress = clamp(s.stress - 2); if (category === 'social') s.socialNeed = clamp(s.socialNeed - 5); if (category === 'exercise') s.stress = clamp(s.stress - 1); }");

core = core.replace("const allowed = new Set(['continue', 'sleep', 'rest', 'work', 'study', 'create', 'music', 'explore', 'move', 'talk', 'wait']);", "const allowed = new Set(['continue', 'sleep', 'rest', 'work', 'study', 'create', 'music', 'explore', 'move', 'talk', 'wait', 'custom']);");
core = core.replace('    action, destination: null, targetId: null,', `    action, destination: null, targetId: null, customAction: null, learnedFactType: 'event', learnedFactTopic: '', learnedFactConfidence: 0.72,`);
if (!core.includes('const proposedCustomAction = validateCustomAction')) {
  core = replaceOnce(core,
    "  if (action === 'talk') {",
    "  if (action === 'custom') {\n    const proposedCustomAction = validateCustomAction(decision.customAction, world, actor);\n    if (proposedCustomAction) result.customAction = proposedCustomAction;\n    else action = 'continue';\n  }\n  if (action === 'talk') {",
    'custom action validation');
}
if (!core.includes("decision.action === 'custom' && decision.customAction")) {
  core = replaceOnce(core,
    "  } else if (decision.action === 'talk' && decision.targetId) {",
    "  } else if (decision.action === 'custom' && decision.customAction) {\n    actor.state.activity = 'custom';\n    actor.state.currentAction = { ...decision.customAction, startedAt: { day: world.time.day, hour: world.time.hour, tick: world.tick } };\n    actor.state.actionDuration = 0;\n    pushEvent(world, { type: 'custom_activity', actorId: actor.id, location: actor.state.location, text: `${actor.identity.name} решил(а): ${decision.customAction.title}.` });\n    if (decision.customAction.targetId) {\n      const target = world.characters.find(c => c.id === decision.customAction.targetId);\n      if (target) addMemory(target, { text: `${actor.identity.name} начал(а) занятие: ${decision.customAction.title}.`, importance: 1, visibility: 'private' }, world);\n    }\n  } else if (decision.action === 'talk' && decision.targetId) {",
    'custom action application');
}
if (!core.includes('applyPsycheOutcome(world, actor, decision);')) {
  core = replaceOnce(core, '  actor.state.recentDecisions = actor.state.recentDecisions.slice(-6);', '  actor.state.recentDecisions = actor.state.recentDecisions.slice(-6);\n  applyPsycheOutcome(world, actor, decision);', 'learning from outcomes');
}
// Keep the legacy test suite aligned with the two intended starter characters.
let coreTests = await read('tests/core.test.js');
if (coreTests.includes('four independent agents including Jacob')) {
  coreTests = coreTests.replace('initial world has four independent agents including Jacob', 'initial world has Jacob and Penny as the two starter agents');
  coreTests = coreTests.replace('one autonomous cycle asks all four characters separately and resolves conflicting talks', 'socially activated agents use the language model and conflicting talks are resolved');
  coreTests = coreTests.replace('assert.equal(world.characters.length, 4);', 'assert.equal(world.characters.length, 2);');
  coreTests = coreTests.replace('assert.equal(Object.keys(a.relationships).length, 3);', 'assert.equal(Object.keys(a.relationships).length, 1);');
  coreTests = coreTests.replaceAll('relationships.jacob.affinity', 'relationships.penny.affinity').replaceAll('relationships.jacob.trust', 'relationships.penny.trust');
  coreTests = coreTests.replaceAll('person_a', 'penny').replaceAll('person_b', 'jacob');
  coreTests = coreTests.replace("const a = world.characters[0];\n  a.relationships.jacob.opinion", "const a = world.characters.find(c => c.id === 'penny');\n  a.relationships.jacob.opinion");
  coreTests = coreTests.replaceAll('assert.equal(requests, 4);', 'assert.equal(requests, 2);')
    .replaceAll('assert.equal(result.succeeded, 4);', 'assert.equal(result.succeeded, 2);')
    .replaceAll('assert.equal(world.meta.usage.requests, 4);', 'assert.equal(world.meta.usage.requests, 2);')
    .replaceAll('assert.equal(world.meta.usage.byProvider.Cloudflare.requests, 4);', 'assert.equal(world.meta.usage.byProvider.Cloudflare.requests, 2);')
    .replaceAll('assert.equal(batch.succeeded, 4);', 'assert.equal(batch.succeeded, 2);');
  coreTests = coreTests.replace(
    '  const result = await agentBatchTurn(env, world);\n  assert.equal(requests, 2);',
    '  world.characters.forEach(c => { c.state.socialNeed = 95; });\n  const result = await agentBatchTurn(env, world);\n  assert.equal(requests, 2);'
  );
  coreTests = coreTests.replace(
    '  const result = await agentBatchTurn(env, world);\n  assert.equal(result.succeeded, 2);\n  assert.equal(world.conversations[0].messages[0].speakerId',
    '  world.characters.forEach(c => { c.state.socialNeed = 95; });\n  const result = await agentBatchTurn(env, world);\n  assert.equal(result.succeeded, 2);\n  assert.equal(world.conversations[0].messages[0].speakerId'
  );
  await write('tests/core.test.js', coreTests);
  let providerTests = await read('tests/providers.test.js');
  providerTests = providerTests.replace('assert.equal(result.succeeded, 12);', 'assert.equal(result.succeeded, 10);')
    .replace('assert.equal(result.succeeded, 4);', 'assert.equal(result.succeeded, 2);');
  providerTests = providerTests.replace(
    '  let active = 0;',
    '  world.characters.forEach(c => { c.state.socialNeed = 95; });\n  let active = 0;'
  );
  providerTests = providerTests.replace(
    '  world.meta.usage = { day: new Date().toISOString().slice(0, 10), requests: 0, inputTokens: 0, outputTokens: 0, byProvider: { Groq: { requests: 0, inputTokens: 180000, outputTokens: 0 }, Cloudflare: { requests: 0, inputTokens: 0, outputTokens: 0 } } };',
    '  world.characters.forEach(c => { c.state.socialNeed = 95; });\n  world.meta.usage = { day: new Date().toISOString().slice(0, 10), requests: 0, inputTokens: 0, outputTokens: 0, byProvider: { Groq: { requests: 0, inputTokens: 180000, outputTokens: 0 }, Cloudflare: { requests: 0, inputTokens: 0, outputTokens: 0 } } };'
  );
  await write('tests/providers.test.js', providerTests);
}

core = core.replace('action: continue|sleep|rest|work|study|create|music|explore|move|talk|wait.', 'action: continue|sleep|rest|work|study|create|music|explore|move|talk|wait|custom. Если готовое действие не подходит, придумай конкретное действие и верни customAction с title, description, category, targetId, location и durationHours. Если получил устойчивый новый факт, укажи learnedFact, learnedFactType, learnedFactTopic и learnedFactConfidence 0.35–1. Не превращай догадки в факты и не записывай одноразовые детали как устойчивые знания.');
core = core.replace('\"targetId\":null,\"speech\":', '\"targetId\":null,\"customAction\":null,\"speech\":');
await write('src/core.js', core);

let worker = await read('src/worker.js');
if (!worker.includes('chooseLocalAction')) {
  worker = replaceOnce(worker, '  parseDecisionText, validateDecision, applyDecision, addMemory, pushEvent\n} from \'./core.js\';', '  parseDecisionText, validateDecision, applyDecision, addMemory, pushEvent, chooseLocalAction\n} from \'./core.js\';', 'worker psyche import');
}
if (!worker.includes('const COGNITIVE_GUIDANCE')) {
  worker = replaceOnce(worker, "const SESSION_SECONDS = 60 * 60 * 24 * 7;", `const SESSION_SECONDS = 60 * 60 * 24 * 7;\nconst COGNITIVE_GUIDANCE = \`ТВОЯ ЦИФРОВАЯ ПСИХИКА: используй needs, affect, attention, motives, retrievedEpisodes, beliefs и learnedHabits как внутреннее состояние, а не как текст для пользователя. Ты не обязан выбрать готовое действие. Если ни одно из стандартных действий не подходит, придумай конкретное естественное занятие сам и верни action="custom" плюс customAction: {title, description, category, targetId, location, durationHours}. Выбирай действие из интересов, привычек, целей, текущей сцены и наблюдаемых деталей. Не выдумывай новые локации, предметы, присутствующих людей или уже произошедшие события. location всегда равна текущей локации, если это не обычное действие move. Не повторяй одно и то же занятие без причины. Новое действие должно иметь понятный локальный результат и длительность 1–6 игровых часов.\`;`, 'cognitive prompt');
}
worker = worker.replace('`${AGENT_SYSTEM_PROMPT}\\n\\nТвоё текущее наблюдение мира.', '`${AGENT_SYSTEM_PROMPT}\\n\\n${COGNITIVE_GUIDANCE}\\n\\nТвоё текущее наблюдение мира.');
if (!worker.includes('local: true')) {
  worker = replaceOnce(worker,
    '    try {\n      const context = buildAgentContext(snapshot, actor);\n      const result = await callModel(env, [',
    '    try {\n      const context = buildAgentContext(snapshot, actor);\n      const localPlan = chooseLocalAction(snapshot, actor);\n      const shouldInterpret = Boolean(context.incoming?.length || localPlan.needsInterpretation);\n      if (!modelConfigured(env) || !shouldInterpret) return { actorId, result: null, raw: localPlan, incomingMessageIds: [], error: null, local: true };\n      const result = await callModel(env, [',
    'local decision without provider');
  worker = replaceOnce(worker,
    '    } catch (error) {\n      return { actorId, result: null, raw: null, incomingMessageIds: [], error: String(error?.message || error).slice(0, 260) };\n    }',
    '    } catch (error) {\n      return { actorId, result: null, raw: chooseLocalAction(snapshot, actor), incomingMessageIds: [], error: null, local: true, modelError: String(error?.message || error).slice(0, 180) };\n    }',
    'local fallback after provider failure');
  worker = replaceOnce(worker,
    '    applyDecision(world, liveActor, decision, item.result);',
    "    applyDecision(world, liveActor, decision, item.result || { provider: 'Local cognition engine', model: 'MY WORLD psyche v1' });",
    'local decision application');
  worker = replaceOnce(worker,
    '    accountUsage(world, item.result);\n    succeeded += 1;',
    '    if (item.result) accountUsage(world, item.result);\n    if (item.local) world.meta.localDecisions = Number(world.meta.localDecisions || 0) + 1;\n    succeeded += 1;',
    'local usage accounting');
}

worker = worker.replace("agentCallsPerDay: 96", "agentCallsPerDay: worldAgentCountHint(), localBrain: true, llmOptionalForSimulation: true");
// Keep setup status independent of a loaded world; do not add a helper with runtime state.
worker = worker.replace('agentCallsPerDay: worldAgentCountHint(), localBrain: true, llmOptionalForSimulation: true', 'localBrain: true, llmOptionalForSimulation: true');
worker = worker.replace("  if (path === '/api/run' && request.method === 'POST') {\n    if (!modelConfigured(env)) return json({ error: 'Не подключён ИИ-провайдер. Включи Workers AI или добавь секрет GROQ_API_KEY.' }, 503);", "  if (path === '/api/run' && request.method === 'POST') {");
worker = worker.replace("  if (path === '/api/step' && request.method === 'POST') {\n    if (!modelConfigured(env)) return json({ error: 'Не подключён ИИ-провайдер.' }, 503);", "  if (path === '/api/step' && request.method === 'POST') {");
worker = worker.replace("if (!modelConfigured(env)) return json({ error: 'Не подключён ИИ-провайдер.' }, 503);\n    const body = await readBody(request, 5000);", "if (!modelConfigured(env)) return json({ error: 'Для диалога нужен подключённый языковой ИИ. Бытовая симуляция продолжит работать локальным когнитивным движком.' }, 503);\n    const body = await readBody(request, 5000);");
worker = worker.replace('function modelConfigured(env) { return Boolean(env.AI || env.GROQ_API_KEY); }', 'function modelConfigured(env) { return Boolean(env.AI || env.GROQ_API_KEY || env.LOCAL_LLM_BASE_URL); }');
worker = worker.replace("  const bucketName = result.provider === 'Groq' ? 'Groq' : 'Cloudflare';", "  const bucketName = result.provider === 'Cloudflare Workers AI' ? 'Cloudflare' : (result.provider || 'Unknown');");
worker = worker.replace("  const canUseGroq = Boolean(env.GROQ_API_KEY) && !disableGroq;\n  const useGroqFirst = canUseGroq && !preferCloudflare && env.AI_PROVIDER !== 'cloudflare';\n  const providers = useGroqFirst ? ['groq', 'cloudflare'] : (canUseGroq ? ['cloudflare', 'groq'] : ['cloudflare']);", "  const canUseGroq = Boolean(env.GROQ_API_KEY) && !disableGroq;\n  const canUseLocal = Boolean(env.LOCAL_LLM_BASE_URL);\n  const useGroqFirst = canUseGroq && !preferCloudflare && env.AI_PROVIDER !== 'cloudflare';\n  const providers = [ ...(canUseLocal ? ['local-llm'] : []), ...(useGroqFirst ? ['groq', 'cloudflare'] : (canUseGroq ? ['cloudflare', 'groq'] : ['cloudflare'])) ];");
worker = worker.replace("  for (const provider of providers) {\n    try {\n      if (provider === 'groq' && env.GROQ_API_KEY && !disableGroq) {", `  for (const provider of providers) {\n    try {\n      if (provider === 'local-llm' && env.LOCAL_LLM_BASE_URL) {\n        const base = String(env.LOCAL_LLM_BASE_URL).replace(/\\/+$/, '');\n        const endpoint = base.endsWith('/chat/completions') ? base : \`\${base}/chat/completions\`;\n        const headers = { 'content-type': 'application/json' };\n        if (env.LOCAL_LLM_API_KEY) headers.authorization = \`Bearer \${env.LOCAL_LLM_API_KEY}\`;\n        const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ model: env.LOCAL_LLM_MODEL || 'qwen3:8b', messages, temperature, max_tokens: maxTokens, ...(jsonMode ? { response_format: { type: 'json_object' } } : {}) }) });\n        if (!response.ok) throw new Error(\`Local LLM \${response.status}: \${(await response.text()).slice(0, 220)}\`);\n        const result = await response.json();\n        const content = normalizeModelContent(result);\n        if (!content.trim()) throw new Error('Локальная модель вернула пустой ответ.');\n        return { content, provider: 'Local LLM', model: env.LOCAL_LLM_MODEL || 'qwen3:8b', usage: result.usage || { prompt_tokens: Math.ceil(JSON.stringify(messages).length / 4), completion_tokens: Math.ceil(content.length / 4), estimated: true } };\n      }\n      if (provider === 'groq' && env.GROQ_API_KEY && !disableGroq) {`);
worker = worker.replace('async function runOneTick(env, { scheduledAt = 0, manual = false } = {}) {', 'export async function runOneTick(env, { scheduledAt = 0, manual = false } = {}) {');
worker = worker.replace("return json({ authConfigured: Boolean(env.APP_PASSWORD), cloudflareAI: Boolean(env.AI), groqFallback: Boolean(env.GROQ_API_KEY), groqAvailable: Boolean(env.GROQ_API_KEY), primaryProvider: env.GROQ_API_KEY && env.AI_PROVIDER !== 'cloudflare' ? 'Groq' : 'Cloudflare Workers AI', model: env.GROQ_API_KEY && env.AI_PROVIDER !== 'cloudflare' ? (env.GROQ_MODEL || GROQ_MODEL_ID) : (env.AI_MODEL || MODEL_ID), cron: '0 * * * *', localBrain: true, llmOptionalForSimulation: true });", "return json({ authConfigured: Boolean(env.APP_PASSWORD), cloudflareAI: Boolean(env.AI), groqFallback: Boolean(env.GROQ_API_KEY), groqAvailable: Boolean(env.GROQ_API_KEY), localLLM: Boolean(env.LOCAL_LLM_BASE_URL), localRuntime: Boolean(env.LOCAL_RUNTIME), primaryProvider: env.LOCAL_LLM_BASE_URL ? 'Local LLM' : (env.GROQ_API_KEY && env.AI_PROVIDER !== 'cloudflare' ? 'Groq' : (env.AI ? 'Cloudflare Workers AI' : 'Локальный когнитивный движок')), model: env.LOCAL_LLM_MODEL || (env.GROQ_API_KEY && env.AI_PROVIDER !== 'cloudflare' ? (env.GROQ_MODEL || GROQ_MODEL_ID) : (env.AI_MODEL || MODEL_ID)), cron: env.LOCAL_RUNTIME ? 'local timer' : '0 * * * *', localBrain: true, llmOptionalForSimulation: true });");
worker = worker.replace("    const value = await sessionCookie(env.APP_PASSWORD);\n    return json({ ok: true }, 200, { 'set-cookie': \`${COOKIE}=\${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=\${SESSION_SECONDS}\` });", "    const value = await sessionCookie(env.APP_PASSWORD);\n    const secure = new URL(request.url).protocol === 'https:' ? ' Secure;' : '';\n    return json({ ok: true }, 200, { 'set-cookie': \`${COOKIE}=\${encodeURIComponent(value)}; Path=/; HttpOnly;\${secure} SameSite=Strict; Max-Age=\${SESSION_SECONDS}\` });");
worker = worker.replace("  if (path === '/api/logout' && request.method === 'POST') return json({ ok: true }, 200, { 'set-cookie': \`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0\` });", "  if (path === '/api/logout' && request.method === 'POST') { const secure = new URL(request.url).protocol === 'https:' ? ' Secure;' : ''; return json({ ok: true }, 200, { 'set-cookie': \`${COOKIE}=; Path=/; HttpOnly;\${secure} SameSite=Strict; Max-Age=0\` }); }");
worker = worker.replace("return json({ world, revision, aiConfigured: modelConfigured(env), provider: world.meta.provider, model: world.meta.model });", "return json({ world, revision, aiConfigured: modelConfigured(env), localLLMConfigured: Boolean(env.LOCAL_LLM_BASE_URL), provider: world.meta.provider, model: world.meta.model });");
await write('src/worker.js', worker);

let html = await read('public/index.html');
html = html.replace("const LABELS={sleep:", "const LABELS={custom:'Занят собственным делом',sleep:");
html = html.replace(/async function refreshStatus\(status\)\{[\s\S]*?\}\nfunction meter/, "async function refreshStatus(status){const ok=status.cloudflareAI||status.groqAvailable||status.groqFallback||status.localLLM;aiConfigured=ok;$('aiNotice').textContent=ok?'Внешний ИИ подключён. Локальная психика продолжает работать независимо.':'Локальная психика активна. Бытовая симуляция работает без ИИ-провайдера; для свободных диалогов и неоднозначных действий нужен языковой ИИ.';}\nfunction meter");
html = html.replace("async function refreshStatus(status){const ok=status.cloudflareAI||status.groqAvailable||status.groqFallback||status.localLLM;aiConfigured=ok;$('aiNotice').textContent=ok?'Внешний ИИ подключён. Локальная психика продолжает работать независимо.':'Локальная психика активна. Бытовая симуляция работает без ИИ-провайдера; для свободных диалогов и неоднозначных действий нужен языковой ИИ.';}", "async function refreshStatus(status){const ok=status.cloudflareAI||status.groqAvailable||status.groqFallback||status.localLLM;aiConfigured=ok;$('aiNotice').textContent=status.localLLM?'Локальная языковая модель подключена. Цифровая психика и сохранение мира работают на твоём сервере.':(ok?'Внешний ИИ подключён. Цифровая психика остаётся независимой от него.':'Локальная психика активна. Бытовая симуляция работает без ИИ-провайдера; для свободных диалогов и придуманных действий нужна языковая модель.');}");

if (!html.includes('data-tab="mind"')) html = html.replace('<button class="tab" data-tab="agents">Агенты</button>', '<button class="tab" data-tab="agents">Агенты</button><button class="tab" data-tab="mind">Психика</button>');
if (!html.includes('function mindView()')) {
  const mind = `function mindView(){const labels={rest:'Отдых',nourishment:'Еда',hydration:'Вода',hygiene:'Гигиена',connection:'Общение',autonomy:'Автономия',competence:'Компетентность',novelty:'Новизна',safety:'Безопасность',expression:'Самовыражение'};return world.characters.map(c=>{const p=c.psyche||{},n=p.needs||{},a=p.affect||{},k=p.cognition||{};const needs=Object.entries(labels).map(([key,label])=>meter(label,n[key]||0)).join('');const motives=(k.currentMotives||[]).slice(0,4).map(m=>'<div class="entry"><div class="between"><strong>'+esc(m.label||m.id)+'</strong><span class="small muted">'+Math.round(m.score||0)+'</span></div></div>').join('')||'<div class="small muted">Мотивы появятся после первого цикла.</div>';const habits=Object.entries(k.habits||{}).sort((x,y)=>y[1]-x[1]).slice(0,6).map(([name,count])=>'<span class="badge">'+esc(name)+' · '+count+'</span>').join('')||'<span class="small muted">Пока нет закрепившихся привычек.</span>';const beliefs=(k.beliefs||[]).slice(-6).map(b=>'<div class="entry">'+esc(b.text||'')+' <span class="small muted">'+Math.round((b.confidence||0)*100)+'%</span></div>').join('')||'<div class="small muted">Устойчивые убеждения ещё не сформировались.</div>';const emotionLabels={joy:'Радость',sadness:'Грусть',anger:'Раздражение',fear:'Тревога',curiosity:'Любопытство',loneliness:'Одиночество',affection:'Привязанность'};const emotions=Object.entries(a.emotions||{}).map(([name,value])=>'<span class=\"badge\">'+esc(emotionLabels[name]||name)+' · '+Math.round(value)+'</span>').join('');const thoughts=(k.workingMemory||[]).slice(0,4).map(m=>'<div class="entry"><span class="small muted">Ход '+(m.tick??'?')+'</span><p>'+esc(m.text||'')+'</p></div>').join('')||'<div class="small muted">Рабочая память пока пуста.</div>';return '<section class="panel"><div class="sectionhead"><h2>'+esc(c.identity.name)+'</h2><span class="pill">'+esc(a.dominant||'нейтральное состояние')+'</span></div><p class="small muted">Физиологические потребности, внутренние мотивы, память и приобретённые поведенческие паттерны. Это вычислимая модель, а не скрытая нейросеть и не доказательство сознания.</p>'+needs+'<h3 class="small muted">Эмоциональные сигналы</h3><div class="pillset">'+emotions+'</div><h3 class="small muted">Текущие мотивы</h3>'+motives+'<h3 class="small muted">Рабочая память / внимание</h3>'+thoughts+'<h3 class="small muted">Усвоенные привычки</h3><div class="pillset">'+habits+'</div><h3 class="small muted">Сформированные убеждения</h3>'+beliefs+'</section>';}).join('');}\n`;
  html = html.replace('function relationsView(){', mind + 'function relationsView(){');
}
html = html.replace('const views={world:worldView,agents:agentView,relations:relationsView', 'const views={world:worldView,agents:agentView,mind:mindView,relations:relationsView');
html = html.replace('`Внешний ИИ не подключён.</span> Бытовая симуляция работает локально; для свободных диалогов и неоднозначных действий нужен языковой ИИ.`', '`Внешний ИИ не подключён.</span> Бытовая симуляция всё равно работает локальным когнитивным движком; для свободных диалогов нужен языковой ИИ.`');
html = html.replace('Для четырёх персонажей — до 96 агентских запросов в сутки.', 'Без подключённой модели каждый персонаж принимает бытовые решения локально; языковая модель нужна только для свободной речи и нестандартных интерпретаций.');
html = html.replace("const views={world:worldView,agents:agentView,mind:mindView,relations:relationsView,memory:memoryView,chat:chatView,history:historyView,settings:settingsView};", "const views={world:worldView,agents:agentView,mind:mindView,relations:relationsView,memory:memoryView,chat:chatView,history:historyView,settings:settingsView};");
await write('public/index.html', html);

const psycheTests = `import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialWorld, normalizeWorld, advanceWorld, validateDecision, applyDecision, buildAgentContext, chooseLocalAction, AGENT_SYSTEM_PROMPT } from '../src/core.js';
import { buildPsycheContext, validateCustomAction, addLongTermFact, retrieveLongTermFacts } from '../src/psyche.js';
import { agentBatchTurn } from '../src/worker.js';

test('starter world is Jacob and Penny, with a persistent cognitive state for each', () => { assert.match(AGENT_SYSTEM_PROMPT,/customAction/); const world = createInitialWorld(); assert.deepEqual(world.characters.map(c => c.id), ['jacob','penny']); for (const c of world.characters) { assert.equal(c.psyche.version, 1); assert.ok(c.psyche.needs.nourishment >= 0); } });

test('the cognitive layer tracks needs, affect, motives and retrieved experience', () => { const world = createInitialWorld(); const jacob = world.characters[0]; const before = jacob.psyche.needs.nourishment; advanceWorld(world); assert.ok(jacob.psyche.needs.nourishment > before); assert.ok(jacob.psyche.cognition.currentMotives.length > 0); const context = buildPsycheContext(world, jacob, 'гитара'); assert.ok(context.needs.rest >= 0); assert.ok(context.currentMotives.length); assert.ok(context.affect.dominant); });

test('custom action is accepted only when grounded in the current world and place', () => { const world = createInitialWorld(); const actor = world.characters[0]; const valid = validateCustomAction({title:'Проверить струны гитары',description:'Проверяет состояние струн и аккуратно подтягивает колки.',category:'creative',location:'home',durationHours:2}, world, actor); assert.ok(valid); assert.equal(validateCustomAction({title:'Телепортироваться',description:'Перемещается в несуществующее место.',category:'explore',location:'moon'}, world, actor), null); });

test('a freeform action becomes a real state transition and is remembered', () => { const world = createInitialWorld(); const actor = world.characters[0]; const raw = {action:'custom',customAction:{title:'Проверить струны гитары',description:'Проверяет состояние струн и аккуратно подтягивает колки.',category:'creative',location:actor.state.location,durationHours:2},intent:'Хочу проверить инструмент.'}; const decision = validateDecision(raw, world, actor); assert.equal(decision.action,'custom'); applyDecision(world, actor, decision); assert.equal(actor.state.activity,'custom'); assert.equal(actor.state.currentAction.title,'Проверить струны гитары'); assert.ok(actor.psyche.cognition.learningEvents > 0); });

test('local cognition runs a world cycle without an external model', async () => { const world=createInitialWorld(); const result=await agentBatchTurn({},world); assert.equal(result.succeeded,2); assert.equal(result.failed,0); assert.ok(world.characters.every(c=>c.state.lastDecisionAt)); assert.ok(world.meta.localDecisions >= 2); });

test('local need-driven routines restore hydration, food and hygiene without a model', () => { const world=createInitialWorld(); const actor=world.characters[0]; actor.psyche.needs.hydration=95; const plan=chooseLocalAction(world,actor); assert.equal(plan.action,'custom'); assert.equal(plan.customAction.category,'drink'); const decision=validateDecision(plan,world,actor); applyDecision(world,actor,decision); advanceWorld(world); assert.ok(actor.psyche.needs.hydration<60); assert.equal(actor.state.activity,'rest'); assert.equal(actor.psyche.cognition.habits['Попить воды'],1); });

test('memory retrieval follows the current conversational cue and emotional state is multidimensional', () => { const world=createInitialWorld(); const actor=world.characters[0]; actor.memory.episodes.unshift({id:'guitar_memory',text:'Вчера я настраивал гитару и менял струны.',tick:world.tick-2,importance:4}); actor.memory.episodes.push({id:'coffee_memory',text:'Я пил кофе утром.',tick:world.tick,importance:5}); const context=buildPsycheContext(world,actor,'гитара струны'); assert.match(context.retrievedEpisodes[0].text,/гитару/); assert.ok(context.affect.emotions.curiosity>=0); assert.ok(context.affect.emotions.loneliness>=0); });

test('long-term facts are retrieved by cue, decay and confidence, while newer same-topic facts supersede old ones', () => { const world=createInitialWorld(); const actor=world.characters[0]; addLongTermFact(actor,'Джейкоб предпочитает заниматься музыкой в одиночестве.',world,{type:'preference',topic:'jacob_music_preference',confidence:0.95,source:'creator'}); addLongTermFact(actor,'Джейкоб предпочитает заниматься музыкой вместе с людьми.',world,{type:'preference',topic:'jacob_music_preference',confidence:0.86}); const active=actor.memory.facts.filter(f=>f.topic==='jacob_music_preference'&&!f.superseded); assert.equal(active.length,1); const found=retrieveLongTermFacts(actor,'музыкой вместе с людьми',world); assert.ok(found.some(f=>f.text.includes('вместе с людьми'))); });

test('standing record keeps a compact situation summary and open goals', () => { const world=createInitialWorld(); const actor=world.characters[0]; const decision=validateDecision({action:'rest',intent:'Отдыхаю.',summaryUpdate:'Последние дни Джейкоб работает над настройкой инструмента.'},world,actor); applyDecision(world,actor,decision); const context=buildPsycheContext(world,actor,'гитара'); assert.match(context.standingRecord.situation,/настройкой инструмента/); });

test('500 hours of local life finish custom routines and do not leave thirst, hunger and hygiene permanently saturated', async () => { const world=createInitialWorld(); for(let hour=0;hour<500;hour++){ const batch=await agentBatchTurn({},world); assert.equal(batch.succeeded,2); advanceWorld(world); normalizeWorld(world); } for(const actor of world.characters){ for(const value of Object.values(actor.psyche.needs)) assert.ok(Number.isFinite(value)&&value>=0&&value<=100); assert.ok(actor.psyche.cognition.learningEvents>=500); assert.ok(actor.psyche.needs.hydration<100); assert.ok(actor.psyche.needs.nourishment<100); assert.ok(actor.psyche.needs.hygiene<100); } });

test('an LLM may invent a grounded custom activity not in the fixed action list', async () => { const world=createInitialWorld(); const env={AI:{async run(_model,input){const match=input.messages[0].content.match(/\"me\":\\{\"id\":\"([^\"]+)/);const id=match?.[1];if(id==='jacob')return {response:JSON.stringify({action:'custom',customAction:{title:'Проверить струны гитары',description:'Проверяет струны и настраивает инструмент.',category:'creative',location:'home',durationHours:2},intent:'Хочу заняться инструментом.'})};return {response:JSON.stringify({action:'rest',intent:'Отдыхаю.'})};}}}; world.characters.find(c=>c.id==='jacob').state.socialNeed=95; const result=await agentBatchTurn(env,world); assert.equal(result.succeeded,2); assert.equal(world.characters.find(c=>c.id==='jacob').state.currentAction.title,'Проверить струны гитары'); });
`;
await write('tests/psyche.test.js', psycheTests);

console.log(`MY WORLD cognitive overlay applied to ${root}`);