const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

class Element {
  constructor() { this.children = []; this.dataset = {}; this.handlers = {}; this.value = ''; this.textContent = ''; this.className = ''; this.buttons = []; this.style = {}; }
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
  querySelectorAll(selector) {
    if (selector === '[data-test-result]' || selector === 'button') return this.buttons;
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
    document: { createElement: () => new Element(), getElementById: get },
    requestAnimationFrame: fn => fn(), setTimeout: fn => { timers.push(fn); }, clearTimeout() {}
  };
  vm.createContext(context);
  vm.runInContext(read('data/knowledge.js'), context);
  vm.runInContext(read('js/media.js'), context);
  context.ORACLE_MEDIA = context.window.ORACLE_MEDIA;
  context.window.ORACLE_REMOTE_KNOWLEDGE = context.ORACLE_REMOTE_KNOWLEDGE = {
    async search(query, car) { searches.push({ query, model: car.model }); return [{ snippet: 'RAW WRONG STALL TEST', verified: true, sourcePath: 'manual.pdf', page: 23 }]; }
  };
  const source = read('js/app.js').replace(/\n  initTheme\(\);[\s\S]*$/, '\nwindow.testApi={state,extractCodes,buildDiagnosis,practicalAnswer,diagnosticSearchQuery,handleQuestion,processMedia,appendDiagnosis,handleTestResult};\n})();');
  vm.runInContext(source, context);
  const api = context.window.testApi; api.state.vehicle = vehicle;
  return {
    ...api, context, elements, get, searches,
    async flush() { while (timers.length) await timers.shift()(); },
    messages() { return get('messages').children.filter(el => !el.removed); }
  };
}

test('recognize real scanner codes, including hexadecimal characters and spaced OCR', () => {
  const h = harness();
  assert.deepEqual(Array.from(h.extractCodes('P0301 P 0 3 0 1 DF 0 2 6 P0A80 U0100')), ['P0301', 'DF026', 'P0A80', 'U0100']);
  assert.deepEqual(Array.from(h.extractCodes('PR037 L9113 MAR9109PD B259233 P03010 29F400')), []);
  assert.deepEqual(Array.from(h.extractCodes('P03O1')), []); // Do not guess OCR letter O as zero.
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
