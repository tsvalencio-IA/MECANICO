const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

class Element {
  constructor() { this.children = []; this.dataset = {}; this.handlers = {}; this.value = ''; this.textContent = ''; this.className = ''; this.buttons = []; this.style = {}; this.classList = { add() {}, remove() {} }; }
  set innerHTML(html) {
    this.html = html;
    this.buttons = [...html.matchAll(/data-test-result="([^"]+)"/g)].map(match => {
      const b = new Element(); b.dataset.testResult = match[1]; return b;
    });
  }
  get innerHTML() { return this.html || ''; }
  appendChild(el) { this.children.push(el); return el; }
  setAttribute() {}
  addEventListener(type, fn) { this.handlers[type] = fn; }
  click() { if (!this.disabled && this.handlers.click) return this.handlers.click(); }
  remove() { this.removed = true; }
  focus() {}
  close() {}
  querySelectorAll(selector) {
    if (selector === '[data-test-result]') return this.buttons;
    if (selector === 'button') return this.buttons.concat(this.children.filter(child => child.type === 'button'));
    return [];
  }
  querySelector(selector) {
    const cls = selector.replace('.', '');
    for (const child of this.children) {
      if (child.className.split(' ').includes(cls)) return child;
      const nested = child.querySelector(selector); if (nested) return nested;
    }
    return null;
  }
}

function harness(vehicle = {}) {
  const elements = {}, storage = {}, timers = [], searches = [];
  const get = id => elements[id] || (elements[id] = new Element());
  const context = {
    window: {}, console: { warn() {} }, Date, Math, URL,
    localStorage: { getItem: key => storage[key] || null, setItem: (key, value) => { storage[key] = value; } },
    document: { createElement: () => new Element(), getElementById: get, querySelector: selector => get(selector), body: new Element() },
    requestAnimationFrame: fn => fn(), setTimeout: fn => { timers.push(fn); }, clearTimeout() {}
  };
  vm.createContext(context);
  vm.runInContext(read('data/knowledge.js'), context);
  vm.runInContext(read('js/media.js'), context);
  context.ORACLE_MEDIA = context.window.ORACLE_MEDIA;
  context.window.ORACLE_REMOTE_KNOWLEDGE = context.ORACLE_REMOTE_KNOWLEDGE = {
    async search(query, car) { searches.push({ query, model: car.model }); return [{ snippet: 'RAW WRONG STALL TEST', verified: true, sourcePath: 'manual.pdf', page: 23 }]; }
  };
  const source = read('js/app.js').replace(/\n  initTheme\(\);[\s\S]*$/, '\nwindow.testApi={state,extractCodes,buildDiagnosis,practicalAnswer,diagnosticSearchQuery,handleQuestion,processMedia,appendDiagnosis,handleTestResult,buildSessionPayload,loadHistoryItem,startNewCase,applyVehicle};\n})();');
  vm.runInContext(source, context);
  const api = context.window.testApi; api.state.vehicle = vehicle;
  return {
    ...api, context, elements, get, searches,
    async flush() { while (timers.length) await timers.shift()(); },
    messages() { return get('messages').children.filter(el => !el.removed); }
  };
}

const golf = { brand: 'Volkswagen', model: 'Golf', year: '2014', engine: '1.4 TSI', transmission: 'Automático' };
async function say(h, text) { h.handleQuestion(text); await h.flush(); return h.state.messages.at(-1).text; }

test('the complete Golf conversation in the screenshot keeps the code, symptom, and hot condition', async () => {
  const h = harness(golf);
  assert.match(await say(h, 'P301'), /incompleto.*P301[\s\S]*P0301/);
  assert.deepEqual(Array.from(h.state.caseContext.dtcs), []);
  assert.equal(h.searches.length, 0);
  assert.match(await say(h, 'Falhando'), /frio.*quente/);
  assert.match(await say(h, 'Quente'), /Anotei: falha a quente[\s\S]*P0301/);
  const reply = await say(h, 'Fala de ignição e pega de potência... P0301 acusado no scanner');
  assert.match(reply, /P0301.*cilindro 1[\s\S]*Golf 1.4 TSI: falha a quente[\s\S]*contador/);
  assert.doesNotMatch(reply, /Estou pronto|Qual é o veículo|Me diga o sintoma|não tenho dados|frio, a quente/);
  assert.ok(reply.split(/\s+/).length <= 100);
  for (const text of ['Ué tá cadastrado aí.. golf', 'Falhando', 'Quente']) {
    const next = await say(h, text);
    assert.match(next, /P0301[\s\S]*falha a quente[\s\S]*contador/);
    assert.doesNotMatch(next, /Qual é o veículo|Me diga o sintoma|A falha acontece a frio/);
  }
  assert.equal(h.state.currentDiagnosis.context.model, 'Golf');
  assert.equal(h.state.currentDiagnosis.ruleId, 'baseline'); // Never a Duster procedure.
});

test('a tentative code is never evidence until the mechanic confirms it, including a short yes', async () => {
  const h = harness(golf);
  await say(h, 'P301');
  const saved = h.buildSessionPayload();
  assert.deepEqual(Array.from(saved.dtcs), []); // Ignore the bot's P0301 suggestion.
  await say(h, 'Sim');
  assert.deepEqual(Array.from(h.state.caseContext.dtcs), ['P0301']);
  assert.match(h.state.messages.at(-1).text, /P0301/);
});

test('short hot/cold replies retain a confirmed code, and a correction updates the condition', async () => {
  const h = harness(golf);
  await say(h, 'P0302 falhando');
  assert.match(await say(h, 'Quente'), /P0302[\s\S]*falha a quente[\s\S]*cilindro 2/);
  assert.match(await say(h, 'Corrigindo: só a frio'), /falha a frio[\s\S]*motor frio/);
});

test('greeting prefixes with diagnostic content cannot discard a code or the registered vehicle', async () => {
  const h = harness(golf);
  const reply = await say(h, 'Bom dia, meu Golf falha a quente, P0301');
  assert.match(reply, /P0301[\s\S]*contador/);
  assert.doesNotMatch(reply, /Estou pronto|Me diga o veículo/);
  assert.match(await say(h, 'oi'), /Volkswagen Golf 2014 1.4 TSI/);
});

test('test observations branch from the scanner to a scoped coil check without treating Alterado as a diagnosis', async () => {
  const h = harness(golf);
  await say(h, 'P0301 falhando a quente');
  h.handleTestResult('single'); await h.flush();
  let answer = h.practicalAnswer(h.state.currentDiagnosis);
  assert.match(answer.test.id, /^misfire-coil/);
  assert.match(answer.text, /motor desligado e frio/);
  assert.match(answer.text, /bobinas forem iguais/);
  assert.deepEqual(Array.from(answer.sourceIds), ['vw-misfire-2033805']);
  assert.ok(answer.text.split(/\s+/).length <= 120);
  h.handleTestResult('stayed'); await h.flush();
  answer = h.practicalAnswer(h.state.currentDiagnosis);
  assert.equal(answer.test, null);
  assert.match(answer.text, /bobina ainda não foi confirmada[\s\S]*vela/);
  assert.doesNotMatch(answer.text, /troque a bobina|A falha acontece a frio/);
});

test('multiple cylinders and unsupported engines do not receive the single-cylinder VW coil procedure', async () => {
  const multiple = harness(golf);
  await say(multiple, 'P0301 falhando a quente');
  multiple.handleTestResult('multiple'); await multiple.flush();
  assert.match(multiple.state.messages.at(-1).text, /Quais cilindros/);
  assert.doesNotMatch(multiple.state.messages.at(-1).text, /troque.*bobina/);
  for (const car of [{ ...golf, engine: '2.0 TDI' }, { ...golf, brand: 'Ford' }, { ...golf, year: '2025' }]) {
    const h = harness(car); await say(h, 'P0301 falhando a quente');
    h.handleTestResult('single'); await h.flush();
    assert.doesNotMatch(h.state.messages.at(-1).text, /troque só a bobina/);
  }
});

test('a mechanic can type a test result instead of pressing the result button', async () => {
  const h = harness(golf);
  await say(h, 'P0301 falhando a quente');
  assert.match(await say(h, 'Só no 1'), /Comparar a bobina do cilindro 1/);
  const reply = await say(h, 'Continua no mesmo cilindro');
  assert.match(reply, /bobina ainda não foi confirmada[\s\S]*vela/);
  assert.equal(h.state.testResults.length, 2);
  assert.equal(h.state.messages.filter(m => m.role === 'user' && m.text === 'Só no 1').length, 1);
});

test('single-cylinder triage does not silently classify a reply about a different cylinder', async () => {
  const h = harness(golf);
  await say(h, 'P0301 falhando a quente');
  await say(h, 'Só no 2');
  assert.equal(h.state.testResults.length, 0);
  assert.match(h.state.messages.at(-1).text, /falhas atuais no cilindro 2[\s\S]*P0301 indica o cilindro 1/);
  assert.doesNotMatch(h.state.messages.at(-1).text, /troque só a bobina/);
});

test('reopening new and legacy history retains user facts while ignoring the bot code suggestions', async () => {
  const h = harness(golf); await say(h, 'P0301 falhando'); await say(h, 'Quente');
  const saved = JSON.parse(JSON.stringify(h.buildSessionPayload()));
  for (const legacy of [false, true]) {
    const item = JSON.parse(JSON.stringify(saved));
    if (legacy) delete item.caseContext;
    const restored = harness(); restored.loadHistoryItem(item); await restored.flush();
    assert.match(await say(restored, 'continua igual'), /P0301[\s\S]*Golf 1.4 TSI: falha a quente[\s\S]*contador/);
  }
  const suggested = harness();
  suggested.loadHistoryItem({ messages: [{ role: 'user', text: 'P301' }, { role: 'bot', text: 'Confirma P0301?' }] });
  assert.deepEqual(Array.from(suggested.state.caseContext.dtcs), []);
});

test('a new case or a different vehicle cannot inherit the previous code, symptom or test result', async () => {
  for (const reset of [h => h.startNewCase(), h => h.applyVehicle({ brand: 'Ford', model: 'Ka', engine: '1.0' })]) {
    const h = harness(golf); await say(h, 'P0301 falhando a quente');
    h.handleTestResult('single'); await h.flush();
    reset(h); await h.flush();
    assert.deepEqual(Array.from(h.state.caseContext.dtcs), []);
    assert.equal(h.state.caseContext.temperature, '');
    assert.equal(h.state.testResults.length, 0);
    const reply = await say(h, 'Não pega');
    assert.match(reply, /motor gira ou nem gira/);
    assert.doesNotMatch(reply, /P0301|bobina/);
  }
});

test('recognize real scanner codes, including hexadecimal characters and spaced OCR', () => {
  const h = harness();
  assert.deepEqual(Array.from(h.extractCodes('P0301 P 0 3 0 1 DF 0 2 6 P0A80 U0100')), ['P0301', 'DF026', 'P0A80', 'U0100']);
  assert.deepEqual(Array.from(h.extractCodes('PR037 L9113 MAR9109PD B259233 P03010 29F400')), []);
  assert.deepEqual(Array.from(h.extractCodes('P03O1')), []); // Do not guess OCR letter O as zero.
});

test('ambiguous OCR may suggest a candidate but never silently turns it into a confirmed code', () => {
  const h = harness(), media = h.context.ORACLE_MEDIA;
  assert.deepEqual(Array.from(media.detectCodes('PO301 P030I')), []);
  assert.deepEqual(Array.from(media.codeCandidates('PO301 P030I')), ['P0301']);
  assert.deepEqual(Array.from(media.codeCandidates('BILL CODE PART')), []);
});

test('an ambiguous photo requires confirmation before starting a diagnosis or document search', async () => {
  const h = harness();
  h.context.ORACLE_MEDIA.analyzeFile = async () => ({ text: 'DTC PO301', kind: 'foto' });
  await h.processMedia({ type: 'image/png', size: 100 }); await h.flush();
  assert.equal(h.state.currentDiagnosis, null);
  assert.equal(h.searches.length, 0);
  assert.match(h.state.messages.at(-1).text, /leitura ficou incerta.*P0301/);
});

test('confirming an OCR candidate explicitly starts the selected code and disables duplicate confirmation', async () => {
  const h = harness();
  h.context.ORACLE_MEDIA.analyzeFile = async () => ({ text: 'DTC PO301', kind: 'foto' });
  await h.processMedia({ type: 'image/png', size: 100 });
  const actions = h.messages().at(-1).querySelector('.test-actions');
  actions.children[0].click(); await h.flush();
  assert.equal(h.state.currentDiagnosis.dtcs[0].code, 'P0301');
  assert.equal(actions.children[0].disabled, true);
});

test('a code without a vehicle gets a short definition and a useful request for context', () => {
  const h = harness(), answer = h.practicalAnswer(h.buildDiagnosis('P0301'));
  assert.match(answer.lead, /P0301.*cilindro 1/);
  assert.equal(answer.needsVehicle, true);
  assert.equal(answer.test, null);
  assert.ok(answer.text.split(/\s+/).length < 55);
  assert.doesNotMatch(answer.text, /estól|Prioridades|font.*confirmad/i);
});

test('a manufacturer-specific code does not receive a definition from another car', () => {
  const h = harness({ brand: 'Ford', model: 'Ka', engine: '1.0' });
  const diag = h.buildDiagnosis('DF026');
  assert.equal(diag.dtcs[0].label, '');
  const answer = h.practicalAnswer(diag);
  assert.match(answer.question, /descrição completa.*módulo/);
  assert.equal(answer.test, null);
});

test('vehicle identity alone cannot select a technical rule or an unrelated specification', () => {
  const h = harness({ brand: 'Renault', model: 'Duster', engine: 'K4M V42' });
  const diag = h.buildDiagnosis('Olá, preciso de ajuda');
  assert.equal(diag.ruleId, 'baseline');
  assert.equal(diag.facts.length, 0);
});

test('known vehicle and module yield one compatible test, a result to expect, and a concise answer', () => {
  const h = harness({ brand: 'Renault', model: 'Duster', engine: 'K4M V42' });
  const diag = h.buildDiagnosis('DF026');
  assert.equal(diag.ruleId, 'duster-v42-injector-circuit');
  const answer = h.practicalAnswer(diag);
  assert.equal(answer.test.id, 'injector-resistance');
  assert.match(answer.text, /Esperado:/);
  assert.ok(answer.text.split(/\s+/).length <= 120);
});

test('a short explicit vehicle description in chat is used without making the user repeat it', () => {
  const h = harness(), diag = h.buildDiagnosis('Duster K4M V42 P0301');
  assert.equal(diag.context.model, 'duster');
  assert.equal(diag.context.engine, 'K4M');
  assert.equal(h.practicalAnswer(diag).needsVehicle, false);
  assert.match(h.practicalAnswer(diag).text, /testador de centelha/);
  assert.doesNotMatch(h.practicalAnswer(diag).text, /TEST 14|Prioridades agora/);
});

test('no-start triage first asks whether the engine turns, without pulling an unrelated manual', async () => {
  const h = harness();
  const answer = h.practicalAnswer(h.buildDiagnosis('O carro não pega. Me guie pelo diagnóstico passo a passo.'));
  assert.match(answer.question, /motor gira ou nem gira/);
  assert.deepEqual(Array.from(answer.actions, x => x.label), ['Gira', 'Não gira']);
  assert.equal(answer.test, null);
  h.handleQuestion('O carro não pega.'); await h.flush();
  assert.equal(h.searches.length, 0);
});

test('P0420 is not presented as proof of a clogged catalytic converter', () => {
  const h = harness({ model: 'Ka', engine: '1.0' });
  const answer = h.practicalAnswer(h.buildDiagnosis('P0420'));
  assert.match(answer.question, /não comprova.*entupido/);
  assert.equal(answer.test, null);
});

test('no-start follow-up uses the observed symptom instead of asking it again', () => {
  const h = harness({ model: 'Ka', engine: '1.0' });
  assert.match(h.practicalAnswer(h.buildDiagnosis('O motor gira, mas não pega.')).question, /RPM/);
  assert.match(h.practicalAnswer(h.buildDiagnosis('O motor não gira ao tentar ligar.')).question, /clique/);
});

test('remote lookup receives the actual OCR code and vehicle, not the automatic media phrase', async () => {
  const h = harness({ model: 'Duster', engine: 'K4M V42' });
  h.state.mediaAnalyses = [{ text: 'P0301 Falha de combustão cilindro 1', codes: ['P0301'] }];
  h.handleQuestion('P0301', { silentUser: true }); await h.flush();
  assert.equal(h.searches[0].query, 'P0301');
  assert.equal(h.searches[0].model, 'Duster');
  const html = h.messages().map(m => m.querySelector('.bubble')?.children.map(e => e.innerHTML || e.textContent).join(' ')).join(' ');
  assert.doesNotMatch(html, /RAW WRONG STALL TEST|Diagnóstico orientado por fonte|Evidências da base técnica/);
});

test('sending a scanner photo produces one concise reply, with no fabricated user question', async () => {
  const h = harness();
  h.context.ORACLE_MEDIA.analyzeFile = async () => ({ text: 'P0301', codes: ['P0301'], kind: 'foto' });
  await h.processMedia({ type: 'image/png', size: 100 }); await h.flush();
  assert.equal(h.messages().length, 1);
  assert.equal(h.state.messages.some(m => /Analise a mídia do scanner/.test(m.text)), false);
  assert.match(h.state.messages.at(-1).text, /P0301/);
  assert.equal(h.searches.length, 0);
});

test('unreadable or unrecognized OCR asks for the code instead of a generic document search', async () => {
  const h = harness();
  h.context.ORACLE_MEDIA.analyzeFile = async () => ({ text: 'L9113 PR037 29F400', kind: 'foto' });
  await h.processMedia({ type: 'image/png', size: 100 }); await h.flush();
  assert.equal(h.searches.length, 0);
  assert.match(h.state.messages.at(-1).text, /não consegui confirmar um código/);
  assert.equal(h.state.currentDiagnosis, null);
});

test('skipping a test never records a successful result or advances the sequence', () => {
  const h = harness(), t = { id: 'test', title: 'Teste', procedure: 'Medir', good: 'normal', bad: 'alterado' };
  h.state.activeTests = [t]; h.handleTestResult('skip');
  assert.equal(h.state.activeTestIndex, 0);
  assert.equal(h.state.testResults.length, 0);
});

test('old result buttons cannot accidentally answer a later test', () => {
  const h = harness({ model: 'Duster', engine: 'K4M V42' });
  h.appendDiagnosis(h.buildDiagnosis('DF026'));
  const first = h.messages().at(-1).querySelector('.test-box');
  first.buttons[0].click();
  const count = h.state.testResults.length;
  first.buttons[1].click();
  assert.equal(h.state.testResults.length, count);
  assert.ok(h.messages().at(-1).querySelector('.test-box'));
});

test('compact search excludes a different vehicle and documents that lack the actual code', async () => {
  const records = {
    1: { id: 1, text: 'Duster K4M V42 P0301', path: 'Renault/Duster.pdf', truth_status: 'source_extracted', page: 1 },
    2: { id: 2, text: 'Golf K4M V42 P0301', path: 'VW/Golf.pdf', truth_status: 'source_extracted', page: 2 },
    3: { id: 3, text: 'Duster K4M V42 P0700 stall test', path: 'Renault/Duster.pdf', truth_status: 'source_extracted', page: 3 }
  };
  const h = harness();
  h.context.CustomEvent = function () {};
  h.context.window.dispatchEvent = () => {};
  h.context.fetch = async url => {
    const pathname = new URL(url).pathname;
    let body;
    if (pathname.endsWith('manifest.json')) body = { mode: 'compact-lexical', heavy_shards_required_by_client: false };
    else if (pathname.endsWith('dtc/P0301.json')) body = [1, 2, 3];
    else if (pathname.endsWith('record-map.json')) body = { 1: 0, 2: 0, 3: 0 };
    else if (pathname.endsWith('records/r00.json')) body = records;
    else body = {};
    return { ok: true, async json() { return body; } };
  };
  vm.runInContext(read('js/knowledge-remote.js'), h.context);
  const hits = await h.context.window.ORACLE_REMOTE_KNOWLEDGE.search('P0301', { model: 'Duster', engine: 'K4M V42' }, 6);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].page, 1);
});
