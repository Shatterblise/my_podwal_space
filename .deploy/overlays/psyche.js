'use strict';

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const clean = (value, max = 160) => String(value ?? '').trim().replace(/[\u0000-\u001f]/g, ' ').slice(0, max);
const words = value => new Set(clean(value, 1200).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(x => x.length > 2));

export function createPsyche() {
  return {
    version: 1,
    needs: {
      rest: 22, nourishment: 18, hydration: 16, hygiene: 18, connection: 35, autonomy: 42,
      competence: 38, novelty: 28, safety: 18, expression: 30
    },
    affect: { valence: 5, arousal: 20, tension: 15, dominant: 'нейтральное состояние', emotions: { joy: 12, sadness: 8, anger: 5, fear: 8, curiosity: 28, loneliness: 35, affection: 10 } },
    cognition: {
      attention: 'текущее занятие', workingMemory: [], beliefs: [], associations: [],
      skills: {}, habits: {}, currentMotives: [], learningEvents: 0, lastThought: '', lastUpdatedTick: -1, standingRecord: { situation: '', openThreads: [], updatedAtTick: -1 }
    }
  };
}

export function ensurePsyche(character) {
  character.psyche ||= createPsyche();
  const p = character.psyche;
  p.version = 1;
  p.needs ||= createPsyche().needs;
  p.affect ||= createPsyche().affect;
  p.cognition ||= createPsyche().cognition;
  for (const key of Object.keys(createPsyche().needs)) p.needs[key] = clamp(p.needs[key] ?? 35);
  for (const key of ['valence', 'arousal', 'tension']) p.affect[key] = clamp(p.affect[key] ?? 0, -100, 100);
  p.affect.dominant = clean(p.affect.dominant || 'нейтральное состояние', 70);
  p.affect.emotions ||= createPsyche().affect.emotions;
  for (const key of Object.keys(createPsyche().affect.emotions)) p.affect.emotions[key] = clamp(p.affect.emotions[key] ?? 0);
  for (const key of ['workingMemory', 'beliefs', 'associations', 'currentMotives']) {
    p.cognition[key] = Array.isArray(p.cognition[key]) ? p.cognition[key].slice(0, key === 'workingMemory' ? 8 : 24) : [];
  }
  p.cognition.skills ||= {};
  p.cognition.habits ||= {};
  p.cognition.standingRecord ||= { situation: '', openThreads: [], updatedAtTick: -1 };
  p.cognition.standingRecord.situation = clean(p.cognition.standingRecord.situation || '', 700);
  p.cognition.standingRecord.openThreads = Array.isArray(p.cognition.standingRecord.openThreads) ? p.cognition.standingRecord.openThreads.slice(0, 8) : [];
  p.cognition.learningEvents = Math.max(0, Number(p.cognition.learningEvents) || 0);
  p.cognition.lastUpdatedTick = Number.isFinite(Number(p.cognition.lastUpdatedTick)) ? Number(p.cognition.lastUpdatedTick) : -1;
  return p;
}

function deriveNeeds(actor) {
  const s = actor.state || {};
  const t = actor.identity?.traits || {};
  const p = ensurePsyche(actor);
  p.needs.rest = clamp(100 - Number(s.energy ?? 65));
  p.needs.connection = clamp(Number(s.socialNeed ?? 35));
  p.needs.safety = clamp(Number(s.stress ?? 15) * 0.78 + (100 - Number(s.mood ?? 50)) * 0.22);
  return p;
}

export function advancePsyche(world, actor) {
  const p = deriveNeeds(actor);
  const s = actor.state;
  const action = s.activity;
  p.needs.nourishment = clamp(p.needs.nourishment + 1.05);
  p.needs.hydration = clamp(p.needs.hydration + 1.45);
  p.needs.hygiene = clamp(p.needs.hygiene + 0.32);
  p.needs.novelty = clamp(p.needs.novelty + (['work', 'sleep', 'rest', 'wait'].includes(action) ? 0.9 : 0.25));
  p.needs.autonomy = clamp(p.needs.autonomy + (action === 'custom' ? -1.5 : 0.25));
  p.needs.competence = clamp(p.needs.competence + (['work', 'study', 'create', 'music', 'custom'].includes(action) ? -1.2 : 0.2));
  if (action === 'sleep' || action === 'rest') { p.needs.nourishment = clamp(p.needs.nourishment + 0.22); p.needs.hygiene = clamp(p.needs.hygiene + 0.08); }
  if (action === 'talk') p.needs.connection = clamp(p.needs.connection - 0.4);
  if (action === 'explore') p.needs.novelty = clamp(p.needs.novelty - 7);
  if (['create', 'music'].includes(action) || (action === 'custom' && ['creative', 'expression'].includes(s.currentAction?.category))) p.needs.expression = clamp(p.needs.expression - 6);
  else p.needs.expression = clamp(p.needs.expression + 0.55);

  const mood = Number(s.mood ?? 50);
  const stress = Number(s.stress ?? 15);
  p.affect.valence = clamp((mood - 50) * 1.15, -100, 100);
  p.affect.arousal = clamp(stress * 0.7 + p.needs.rest * 0.25 + p.needs.connection * 0.12);
  p.affect.tension = clamp(stress * 0.6 + p.needs.safety * 0.4);
  p.affect.emotions = {
    joy: clamp((mood - 45) * 1.35), sadness: clamp((48 - mood) * 1.5),
    anger: clamp((stress - 48) * 0.85 + (100 - Number(actor.identity?.traits?.agreeableness ?? 55)) * 0.08),
    fear: clamp(stress * 0.42 + p.needs.safety * 0.38),
    curiosity: clamp(p.needs.novelty * 0.72 + Number(actor.identity?.traits?.curiosity ?? 50) * 0.28),
    loneliness: clamp(p.needs.connection * (1 - Number(actor.identity?.traits?.sociability ?? 50) / 220)),
    affection: clamp(Object.values(actor.relationships || {}).reduce((sum, r) => sum + Math.max(0, Number(r.affinity || 0)), 0) / Math.max(1, Object.keys(actor.relationships || {}).length))
  };
  const emotionNames = { joy: 'радость', sadness: 'грусть', anger: 'раздражение', fear: 'тревога', curiosity: 'любопытство', loneliness: 'одиночество', affection: 'привязанность' };
  const strongest = Object.entries(p.affect.emotions).sort((a, b) => b[1] - a[1])[0];
  p.affect.dominant = strongest && strongest[1] >= 34 ? emotionNames[strongest[0]] : 'относительно нейтральное состояние';

  if (s.currentAction && action === 'custom' && Number(s.actionDuration || 0) >= Number(s.currentAction.durationHours || 2)) {
    const finishedAction = s.currentAction;
    const finished = finishedAction.title;
    p.cognition.habits[finished] = Math.min(100, Number(p.cognition.habits[finished] || 0) + 1);
    const skillKey = ['creative', 'expression'].includes(finishedAction.category) ? 'creative' : finishedAction.category;
    p.cognition.skills[skillKey] = clamp(Number(p.cognition.skills[skillKey] || 0) + 0.4);
    if (finishedAction.category === 'drink') p.needs.hydration = clamp(p.needs.hydration - 42);
    if (finishedAction.category === 'food') p.needs.nourishment = clamp(p.needs.nourishment - 34);
    if (finishedAction.category === 'hygiene') p.needs.hygiene = clamp(p.needs.hygiene - 38);
    if (finishedAction.category === 'social') { s.socialNeed = clamp(Number(s.socialNeed ?? 35) - 22); if (finishedAction.targetId) { const relation = actor.relationships?.[finishedAction.targetId]; if (relation) { relation.affinity = clamp(Number(relation.affinity || 0) + 1, -100, 100); relation.trust = clamp(Number(relation.trust || 0) + 0.5, -100, 100); } } }
    if (finishedAction.category === 'rest') { s.energy = clamp(Number(s.energy ?? 50) + 12); s.stress = clamp(Number(s.stress ?? 15) - 4); p.needs.safety = clamp(p.needs.safety - 4); }
    s.lastCompletedAction = { title: finished, category: finishedAction.category, tick: world.tick };
    s.activity = 'rest';
    s.currentAction = null;
    s.actionDuration = 0;
  }
  p.cognition.currentMotives = rankMotives(world, actor).slice(0, 6);
  p.cognition.lastUpdatedTick = world.tick;
  return p;
}

function relevance(memory, queryWords, actor, world) {
  const text = clean(memory.text || memory.description || '', 600);
  const tokens = words(text);
  let overlap = 0;
  for (const token of tokens) if (queryWords.has(token)) overlap += 1;
  const importance = clamp(memory.importance ?? 1, 1, 5) / 5;
  const age = Math.max(0, world.tick - Number(memory.tick || 0));
  const recency = 1 / (1 + age / 36);
  const emotional = Math.abs(Number(actor.psyche?.affect?.valence || 0)) / 100;
  return overlap * 2 + importance * 1.8 + recency + emotional * (Number(memory.emotionalSalience || 0) / 100);
}

const FACT_DECAY_BY_TYPE = { identity: 0.9995, preference: 0.998, relationship: 0.997, world: 0.999, event: 0.975, intention: 0.94 };

export function addLongTermFact(actor, rawText, world, options = {}) {
  const text = clean(rawText, 240);
  if (text.length < 8) return null;
  actor.memory ||= { summary: '', episodes: [], facts: [], privateNotes: [] };
  actor.memory.facts ||= [];
  const type = ['identity', 'preference', 'relationship', 'world', 'event', 'intention'].includes(options.type) ? options.type : 'event';
  const topic = clean(options.topic || '', 64).toLowerCase();
  const normalized = text.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  const duplicateIndex = actor.memory.facts.findIndex(f => String(f?.text || f).toLocaleLowerCase().replace(/\s+/g, ' ').trim() === normalized);
  if (duplicateIndex >= 0) {
    const prior = actor.memory.facts[duplicateIndex];
    const duplicate = prior && typeof prior === 'object' ? prior : { text: String(prior) };
    duplicate.confidence = Math.max(Number(duplicate.confidence || 0.5), clamp(options.confidence ?? 0.82, 0, 1));
    duplicate.tick = world.tick;
    duplicate.confirmedTick = world.tick;
    duplicate.source = options.source || duplicate.source || 'experience';
    duplicate.type ||= type;
    actor.memory.facts[duplicateIndex] = duplicate;
    return duplicate;
  }
  if (topic) {
    for (const old of actor.memory.facts) {
      if (old && typeof old === 'object' && old.topic === topic && old.type === type && !old.superseded) {
        old.superseded = true;
        old.supersededAtTick = world.tick;
      }
    }
  }
  const fact = {
    id: `fact_${world.tick}_${actor.memory.facts.length + 1}`,
    text, type, topic, confidence: clamp(options.confidence ?? 0.78, 0, 1),
    importance: clamp(options.importance ?? 3, 1, 5),
    source: clean(options.source || 'experience', 24),
    keywords: [...words(text)].slice(0, 12),
    tick: world.tick, createdTick: world.tick, confirmedTick: world.tick,
    decayRate: FACT_DECAY_BY_TYPE[type], superseded: false
  };
  actor.memory.facts.unshift(fact);
  actor.memory.facts = actor.memory.facts.slice(0, 50);
  return fact;
}

export function retrieveLongTermFacts(actor, cue, world, limit = 8, charBudget = 1400) {
  const cueWords = words(cue);
  const ranked = (actor.memory?.facts || []).map(f => typeof f === 'string' ? { text: f, type: 'event', confidence: 0.65, importance: 2, tick: 0 } : f).filter(f => f && typeof f === 'object' && !f.superseded)
    .map(f => {
      const factWords = new Set(Array.isArray(f.keywords) && f.keywords.length ? f.keywords : words(f.text));
      let overlap = 0;
      for (const word of factWords) if (cueWords.has(word)) overlap++;
      const ageDays = Math.max(0, world.tick - Number(f.tick ?? f.createdTick ?? 0)) / 24;
      const type = f.type || 'event';
      const decayRate = Number(f.decayRate) || FACT_DECAY_BY_TYPE[type] || 0.985;
      const decay = Math.pow(decayRate, ageDays);
      const confidence = clamp(f.confidence ?? 0.7, 0, 1);
      const importance = clamp(f.importance ?? 2, 1, 5) / 5;
      const persistent = ['identity', 'preference', 'relationship', 'world'].includes(type);
      const score = overlap * 1.25 + confidence * 1.1 + importance * 0.55 + decay * 0.45 + (persistent && overlap === 0 ? 0.35 : 0);
      return { fact: f, score, overlap, decay };
    })
    .filter(x => x.fact.confidence === undefined || Number(x.fact.confidence) >= 0.4)
    .sort((a, b) => b.score - a.score);
  const result = [];
  let used = 0;
  for (const item of ranked) {
    const text = clean(item.fact.text || item.fact, 220);
    if (!text) continue;
    const line = `${item.fact.type || 'fact'}: ${text}`;
    if (used + line.length > charBudget) continue;
    result.push({ text, type: item.fact.type || 'fact', confidence: Math.round(Number(item.fact.confidence ?? 0.7) * 100), ageHours: Math.max(0, world.tick - Number(item.fact.tick ?? item.fact.createdTick ?? 0)), score: Math.round(item.score * 100) / 100 });
    used += line.length;
    if (result.length >= limit) break;
  }
  return result;
}

export function buildPsycheContext(world, actor, cue = '') {
  const p = deriveNeeds(actor);
  const cueWords = words([cue, actor.state.lastReflection, actor.state.activity].join(' '));
  const episodes = [...(actor.memory?.episodes || []), ...(actor.memory?.privateNotes || [])]
    .map(memory => ({ ...memory, score: relevance(memory, cueWords, actor, world) }))
    .sort((a, b) => b.score - a.score).slice(0, 5)
    .map(m => ({ text: clean(m.text, 180), importance: clamp(m.importance ?? 1, 1, 5), score: Math.round(m.score * 100) / 100 }));
  const facts = retrieveLongTermFacts(actor, cue, world, 8, 1400);
  const incoming = world.conversations.flatMap(thread => thread.messages || [])
    .filter(m => m.speakerId !== actor.id && !actor.state.seenConversationMessages?.includes(m.id))
    .slice(-3).map(m => clean(m.text, 150));
  const activeGoals = (actor.goals || []).filter(g => g.status === 'active').sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0)).slice(0, 4);
  const motives = rankMotives(world, actor);
  return {
    needs: { ...p.needs }, affect: { ...p.affect, emotions: { ...p.affect.emotions } },
    attention: p.cognition.attention,
    currentMotives: motives.slice(0, 4),
    retrievedEpisodes: episodes,
    knownFacts: facts,
    beliefs: p.cognition.beliefs.slice(-8),
    learnedHabits: Object.entries(p.cognition.habits).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count })),
    skills: p.cognition.skills,
    learningEvents: p.cognition.learningEvents,
    recentAttention: p.cognition.workingMemory.slice(0, 4),
    incomingMessages: incoming,
    activeGoals: activeGoals.map(g => ({ id: g.id, title: clean(g.title, 90), progress: clamp(g.progress), priority: clamp(g.priority) })),
    standingRecord: { ...p.cognition.standingRecord }
  };
}

export function rankMotives(world, actor) {
  const p = deriveNeeds(actor);
  const s = actor.state;
  const traits = actor.identity?.traits || {};
  const nearby = world.characters.filter(c => c.id !== actor.id && c.state.location === s.location && !c.state.travel && c.state.activity !== 'sleep');
  const goals = (actor.goals || []).filter(g => g.status === 'active');
  const bestGoal = goals.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))[0];
  const motives = [
    { id: 'rest', label: 'восстановить силы', score: p.needs.rest * 0.88 + p.needs.safety * 0.08 },
    { id: 'nourishment', label: 'поесть / найти еду', score: p.needs.nourishment * 0.86 },
    { id: 'hydration', label: 'утолить жажду', score: p.needs.hydration * 0.9 },
    { id: 'hygiene', label: 'заняться личной гигиеной', score: p.needs.hygiene * 0.68 },
    { id: 'connection', label: 'побыть с кем-то или поговорить', score: nearby.length ? p.needs.connection * (0.48 + Number(traits.sociability ?? 50) / 180) : p.needs.connection * 0.28 },
    { id: 'autonomy', label: 'самостоятельно выбрать занятие', score: p.needs.autonomy * 0.7 },
    { id: 'competence', label: 'продвинуться в значимом деле', score: p.needs.competence * 0.66 + (bestGoal ? Number(bestGoal.priority || 0) * 0.22 : 0) },
    { id: 'novelty', label: 'изменить обстановку или исследовать новое', score: p.needs.novelty * (0.38 + Number(traits.curiosity ?? 50) / 170) },
    { id: 'expression', label: 'заняться творчеством или любимым делом', score: p.needs.expression * (0.42 + Number(traits.creativity ?? 50) / 160) }
  ];
  if (bestGoal) motives.push({ id: 'goal', label: `продвинуть цель: ${clean(bestGoal.title, 70)}`, score: clamp(bestGoal.priority) * 0.72 + (100 - clamp(bestGoal.progress)) * 0.18 });
  return motives.sort((a, b) => b.score - a.score).map(m => ({ ...m, score: Math.round(m.score * 10) / 10 }));
}

export function validateCustomAction(raw, world, actor) {
  if (!raw || typeof raw !== 'object') return null;
  const title = clean(raw.title || raw.label, 72);
  const description = clean(raw.description || raw.intent, 240);
  const category = ['routine', 'creative', 'social', 'study', 'work', 'rest', 'explore', 'expression', 'food', 'drink', 'hygiene', 'exercise', 'care', 'other'].includes(raw.category) ? raw.category : 'other';
  const targetId = raw.targetId ? String(raw.targetId) : null;
  const location = raw.location ? String(raw.location) : actor.state.location;
  if (title.length < 3 || description.length < 12 || location !== actor.state.location) return null;
  if (!world.locations.some(l => l.id === location)) return null;
  if (targetId) {
    const target = world.characters.find(c => c.id === targetId && c.id !== actor.id && c.state.location === actor.state.location && !c.state.travel && c.state.activity !== 'sleep');
    if (!target) return null;
  }
  return { title, description, category, targetId, location, durationHours: Math.max(1, Math.min(6, Math.floor(Number(raw.durationHours) || 2))) };
}

export function chooseLocalAction(world, actor) {
  const p = deriveNeeds(actor);
  const motives = rankMotives(world, actor);
  const top = motives[0];
  const s = actor.state;
  if (s.travel) return { action: 'continue', intent: 'Продолжаю путь до места назначения.' };
  if (s.activity === 'custom' && s.currentAction) return { action: 'continue', intent: `Продолжаю начатое дело: ${clean(s.currentAction.title, 70)}.` };
  if (s.energy <= 16 || top?.id === 'rest' && s.energy < 34) return { action: s.energy < 13 ? 'sleep' : 'rest', intent: 'Нужно восстановить силы.' };
  const nearby = world.characters.filter(c => c.id !== actor.id && c.state.location === s.location && !c.state.travel && c.state.activity !== 'sleep');
  if (p.needs.connection >= 72 && nearby.length && s.activity !== 'sleep') { const target = nearby.slice().sort((a,b) => Number(b.relationships?.[actor.id]?.affinity || 0) - Number(a.relationships?.[actor.id]?.affinity || 0))[0]; return { action: 'custom', customAction: { title: `Провести время рядом с ${target.identity.name}`, description: `Остаётся рядом с ${target.identity.name}, наблюдает за происходящим и при взаимном желании делит с ним/ней спокойное занятие без обязательного разговора.`, category: 'social', targetId: target.id, location: s.location, durationHours: 2 }, intent: 'Хочется человеческого присутствия, но это не обязательно означает желание разговаривать.', needsInterpretation: true }; }
  if (p.needs.hydration >= 78) return { action: 'custom', customAction: { title: 'Попить воды', description: 'Прерывается, чтобы выпить доступной воды и утолить жажду.', category: 'drink', location: s.location, durationHours: 1 }, intent: 'Нужно утолить жажду.' };
  if (p.needs.nourishment >= 78) return { action: 'custom', customAction: { title: 'Перекусить', description: 'Находит доступную еду и делает небольшой перерыв на еду.', category: 'food', location: s.location, durationHours: 1 }, intent: 'Нужно поесть.' };
  if (p.needs.hygiene >= 84) return { action: 'custom', customAction: { title: 'Привести себя в порядок', description: 'Делает короткий перерыв, чтобы умыться и привести себя в порядок.', category: 'hygiene', location: s.location, durationHours: 1 }, intent: 'Пора заняться личной гигиеной.' };
  if (p.needs.novelty >= 68 && Number(actor.identity?.traits?.curiosity ?? 50) > 60) return { action: 'explore', intent: 'Хочется исследовать что-то новое; конкретное занятие зависит от деталей вокруг.', needsInterpretation: true };
  const unusualEvent = world.events.some(e => Number(e.tick) === Number(world.tick) && e.actorId !== actor.id && (e.location === s.location || e.targetId === actor.id));
  if (unusualEvent) return { action: 'continue', intent: 'Замечаю новое событие и оцениваю, нужно ли на него реагировать.', needsInterpretation: true };
  if (top?.id === 'connection' && nearby.length) {
    return { action: 'wait', intent: 'Пока остаюсь рядом, но не навязываю разговор.' };
  }
  const goal = (actor.goals || []).filter(g => g.status === 'active').sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))[0];
  if (goal) {
    const typeAction = { work: 'work', creative: 'create', study: 'study', social: 'wait', relationship: 'wait' }[goal.type];
    if (typeAction && motives[0]?.id === 'goal') return { action: typeAction, goalId: goal.id, goalProgress: 0.5, intent: `Продвигаю собственную цель: ${clean(goal.title, 70)}.` };
  }
  const interestText = [...(actor.identity?.interests || []), ...(actor.identity?.habits || [])].join(' ');
  if (/music|гитар|музык|инструмент/i.test(interestText) && (top?.id === 'expression' || top?.id === 'competence')) return { action: 'music', intent: 'Возвращаюсь к занятию, которое для меня важно.' };
  if (top?.id === 'novelty' && Number(actor.identity?.traits?.curiosity ?? 50) > 60) return { action: 'explore', intent: 'Хочется сменить обстановку и посмотреть вокруг.' };
  if (top?.id === 'expression') return { action: 'create', intent: 'Хочу заняться чем-то творческим.' };
  if (top?.id === 'nourishment') return { action: 'wait', intent: 'Нужно найти возможность поесть; доступных действий с едой пока нет.' };
  if (['work', 'study', 'create', 'music'].includes(s.activity) && s.actionDuration < 8) return { action: 'continue', intent: 'Продолжаю текущее занятие.' };
  return { action: 'rest', intent: 'Нет срочной причины менять занятие; немного отдыхаю.' };
}

export function applyPsycheOutcome(world, actor, decision) {
  const p = ensurePsyche(actor);
  const c = p.cognition;
  c.learningEvents += 1;
  if (decision.intent) c.lastThought = clean(decision.intent, 180);
  c.attention = decision.customAction?.title || decision.action || 'текущее занятие';
  c.workingMemory = [
    { tick: world.tick, text: clean(decision.intent || decision.customAction?.description || decision.action, 180), salience: 40 },
    ...c.workingMemory
  ].slice(0, 8);
  if (decision.learnedFact) {
    const belief = clean(decision.learnedFact, 180);
    if (!c.beliefs.some(item => item.text.toLowerCase() === belief.toLowerCase())) c.beliefs.push({ text: belief, confidence: clamp(decision.learnedFactConfidence ?? 0.72, 0.35, 1), source: 'experience', formedAt: world.tick });
    addLongTermFact(actor, belief, world, { type: decision.learnedFactType || 'event', topic: decision.learnedFactTopic || '', confidence: decision.learnedFactConfidence ?? 0.78, source: 'agent-inference', importance: 3 });
  }
  if (decision.customAction) {
    c.lastCustomAction = { title: decision.customAction.title, category: decision.customAction.category, tick: world.tick };
    c.attention = decision.customAction.title;
  }
  if (decision.action === 'talk' && decision.targetId) {
    const target = world.characters.find(x => x.id === decision.targetId);
    if (target) c.associations.unshift({ with: target.id, outcome: decision.socialOutcome || 'neutral', tick: world.tick, cue: clean(decision.speech, 100) });
  }
  c.associations = c.associations.slice(0, 24);
  if (decision.summaryUpdate) c.standingRecord.situation = clean(decision.summaryUpdate, 700);
  c.standingRecord.openThreads = (actor.goals || []).filter(g => g.status === 'active').sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0)).slice(0, 8).map(g => clean(g.title, 100));
  c.standingRecord.updatedAtTick = world.tick;
  p.needs.autonomy = clamp(p.needs.autonomy - (decision.action === 'custom' ? 6 : 1));
  p.needs.competence = clamp(p.needs.competence - (['work', 'study', 'create', 'music', 'custom'].includes(decision.action) ? 4 : 0));
  p.affect.valence = clamp(p.affect.valence + (decision.moodShift || 0) * 4, -100, 100);
  return p;
}