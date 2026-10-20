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
  const source = read('js/app.js').replace(/\n  initTheme\(\);[\s\S]*$/, '\nwindow.testApi={state,extractCodes,buildDiagnosis,practicalAnswer,diagnosticSearchQuery,handleQuestion,processMedia,appendDiagnosis,handleTestResult,buildSessionPayload,loadHistoryItem,startNewCase,applyVehicle,mergeHistory};\n})();');
  vm.runInContext(source, context);
  const api = context.window.testApi; api.state.vehicle = vehicle;
  return {
    ...api, context, elements, get, searches,
    runNextTimer() { return timers.shift()(); },
    async flush() { while (timers.length) await timers.shift()(); },
    messages() { return get('messages').children.filter(el => !el.removed); }
  };
}

const golf = { brand: 'Volkswagen', model: 'Golf', year: '2014', engine: '1.4 TSI', transmission: 'Automático' };
async function say(h, text) { h.handleQuestion(text); await h.flush(); return h.state.messages.at(-1).text; }

async function afterCoilStayed(h) {
  await say(h, 'P301'); await say(h, 'P0301'); await say(h, 'A falha acontece o tempo todo.');
  h.handleTestResult('single'); await h.flush();
  h.handleTestResult('stayed'); await h.flush();
}

async function afterCylinderThreeCoil(h) {
  await say(h, 'P303'); await say(h, 'P0303'); await say(h, 'A falha acontece o tempo todo.');
  h.handleTestResult('single'); await h.flush();
  h.handleTestResult('stayed'); await h.flush();
}

test('the reported P0303 conversation accepts a later coil result and changes the next step to the moved component', async () => {
  const h = harness(golf); await afterCylinderThreeCoil(h);
  const reply = await say(h, 'TROQUEI AS BOBINAS E MUDOU PARA O 1 CILINDRO A FALHA');
  assert.match(reply, /cilindro 3[\s\S]*cilindro 1/);
  assert.doesNotMatch(reply, /falha ficou no mesmo|Agora confira a vela|estanqueidade do injetor/);
  const result = h.buildDiagnosis('').context.testResults.find(r => r.id === 'misfire-coil-P0303');
  assert.equal(result.outcome, 'moved'); assert.equal(result.toCylinder, 1);
  assert.deepEqual(Array.from(h.state.caseContext.dtcs), ['P0303']); // Do not invent a new scanner code.
  assert.match(h.state.activeTests[0].id, /^misfire-migration-verify-/);
  h.handleTestResult('confirmed'); await h.flush();
  assert.match(h.state.messages.at(-1).text, /bobina que saiu do cilindro 3/);
  assert.match(await say(h, 'Corrigi e testei nas mesmas condições; sem falhas'), /verificação sem falhas registrada/i);
});

test('explicit coil corrections work while a plug comparison is pending and never become plug results', async () => {
  for (const report of ['Troquei as bobinas e a falha passou para o cilindro 1', 'Corrigindo: a falha acompanhou a bobina e agora está no cilindro 1']) {
    const h = harness(golf); await afterCylinderThreeCoil(h); await say(h, 'SECA');
    const reply = await say(h, report);
    assert.match(reply, /cilindro 3[\s\S]*cilindro 1/);
    assert.equal(h.state.testResults.some(r => /^misfire-plug-/.test(r.id)), false);
    assert.equal(h.state.caseContext.observations['misfire-plug-observation'], 'SECA');
  }
});

test('hypothetical swaps and multiple changed components cannot confirm a defective coil', async () => {
  const h = harness(golf); await afterCylinderThreeCoil(h);
  await say(h, 'Se eu trocar as bobinas e mudar para o cilindro 1?');
  assert.equal(h.buildDiagnosis('').context.testResults.find(r => r.id === 'misfire-coil-P0303').outcome, 'stayed');
  await say(h, 'Troquei bobinas e velas e a falha mudou para o cilindro 1');
  assert.match(h.state.messages.at(-1).text, /mais de um componente|bobinas e velas/);
  assert.doesNotMatch(h.state.messages.at(-1).text, /bobina confirmada|substitua a bobina/);
});

test('a changed earlier comparison invalidates dependent results while keeping the audit and observed plug fact', async () => {
  const h = harness(golf); await afterCylinderThreeCoil(h); await say(h, 'SECA');
  h.handleTestResult('stayed'); await h.flush();
  await say(h, 'Corrigindo, troquei as bobinas e a falha mudou para o cilindro 1');
  assert.equal(h.buildDiagnosis('').context.testResults.some(r => /^misfire-plug-/.test(r.id)), false);
  assert.ok(h.state.testResults.some(r => /^misfire-plug-/.test(r.id)));
  const reply = await say(h, 'Corrigindo o teste da bobina: a falha continuou no cilindro 3');
  assert.match(reply, /Comparar a vela do cilindro 3/);
  assert.doesNotMatch(reply, /estanqueidade do injetor|bobina: cilindro 1/);
});

test('the saved old conversation recovers the ignored coil correction from user text when reopened', async () => {
  const h = harness(golf); await afterCylinderThreeCoil(h);
  const saved = JSON.parse(JSON.stringify(h.buildSessionPayload()));
  delete saved.caseContext.continuityVersion;
  saved.messages.push({ role: 'user', at: new Date(Date.now() + 10).toISOString(), text: 'TROQUEI AS BOBINAS E MUDOU PARA O 1 CILINDRO A FALHA' });
  saved.messages.push({ role: 'bot', text: 'A falha ficou no mesmo cilindro. Agora confira a vela.' });
  const restored = harness(); restored.loadHistoryItem(saved); await restored.flush();
  const reply = await say(restored, 'VC ESTA SE REPETINDO');
  assert.match(reply, /cilindro 3[\s\S]*cilindro 1/);
  assert.doesNotMatch(reply, /Agora confira a vela|identificação do motor/);
  assert.equal(restored.buildDiagnosis('').context.testResults.find(r => r.id === 'misfire-coil-P0303').outcome, 'moved');
});

test('reopening the current case restores the pending result controls without duplicating the last answer', async () => {
  const h = harness(golf); await afterCylinderThreeCoil(h);
  await say(h, 'Troquei as bobinas e mudou para o cilindro 1');
  const saved = JSON.parse(JSON.stringify(h.buildSessionPayload()));
  const restored = harness(); restored.loadHistoryItem(saved); await restored.flush();
  assert.match(restored.state.activeTests[0].id, /^misfire-migration-verify-/);
  assert.equal(restored.messages().length, saved.messages.length);
  restored.handleTestResult('confirmed'); await restored.flush();
  assert.match(restored.state.messages.at(-1).text, /Substitua somente a bobina identificada/);
});

test('engine displacement and an unknown engine identifier do not trap the case before the injector test', async () => {
  const h = harness(golf); await afterCylinderThreeCoil(h); await say(h, 'SECA');
  h.handleTestResult('stayed'); await h.flush();
  for (const reply of ['1.4', 'MOTOR1.4 TSI', 'VC ESTA SE REPETINDO', 'Não sei identificar o motor']) {
    const answer = await say(h, reply);
    assert.equal(h.state.caseContext.engineCode, '');
    assert.match(h.state.activeTests[0].id, /^misfire-injector-leak-/);
    assert.doesNotMatch(answer, /qual é a identificação do motor|qual é o código de identificação do motor/i);
    assert.doesNotMatch(answer, /CHPA|pressão correta é|torque de \d/);
  }
});

test('common descriptions of a migrated coil fault identify the destination without fabricating the DTC', async () => {
  for (const report of [
    'Inverti as bobinas e agora falha no 1',
    'A falha acompanhou a bobina para o primeiro cilindro',
    'A falha passou do cilindro 3 para o cilindro 1 depois de inverter as bobinas',
    'Troquei somente as bobinas, sem mexer nas velas, e a falha mudou para o 1'
  ]) {
    const h = harness(golf); await afterCylinderThreeCoil(h);
    assert.match(await say(h, report), /cilindro 3[\s\S]*cilindro 1/);
    assert.deepEqual(Array.from(h.state.caseContext.dtcs), ['P0303']);
    assert.match(h.state.activeTests[0].id, /^misfire-migration-verify-/);
  }
});

test('a short result uses the active comparison and a bare destination answers the requested cylinder', async () => {
  const h = harness(golf); await say(h, 'P0303'); await say(h, 'O tempo todo');
  h.handleTestResult('single'); await h.flush();
  assert.match(await say(h, 'mudou para o cilindro 1'), /cilindro 3[\s\S]*cilindro 1/);
  const other = harness(golf); await say(other, 'P0303'); await say(other, 'O tempo todo');
  other.handleTestResult('single'); await other.flush(); other.handleTestResult('moved'); await other.flush();
  assert.match(other.state.messages.at(-1).text, /Qual cilindro/);
  assert.match(await say(other, '1'), /cilindro 3[\s\S]*cilindro 1/);
});

test('the failed migration check accepts the current cylinder and leaves the invalidated migration path', async () => {
  const h = harness(golf); await afterCylinderThreeCoil(h);
  await say(h, 'Troquei as bobinas e mudou para o cilindro 1');
  h.handleTestResult('not-followed'); await h.flush();
  const next = await say(h, '3');
  assert.match(next, /Agora confira a vela/);
  assert.doesNotMatch(next, /mudança anterior não se confirmou|Substitua somente a bobina/);
});

test('a multiple-part swap is isolated before it can support a component replacement', async () => {
  const h = harness(golf); await afterCylinderThreeCoil(h);
  await say(h, 'Troquei as bobinas e mudou para o cilindro 1');
  h.handleTestResult('multiple-changes'); await h.flush();
  assert.match(h.state.messages.at(-1).text, /mais de um componente[\s\S]*Compare somente a bobina/);
  assert.doesNotMatch(h.state.messages.at(-1).text, /Substitua somente a bobina/);
  h.handleTestResult('stayed'); await h.flush();
  assert.match(h.state.messages.at(-1).text, /Agora confira a vela/);
});

test('a repetition complaint produces a short pending-result prompt rather than the whole procedure again', async () => {
  const h = harness(golf); await afterCylinderThreeCoil(h); await say(h, 'SECA');
  h.handleTestResult('stayed'); await h.flush();
  const reply = await say(h, 'VC ESTA SE REPETINDO');
  assert.match(reply, /Falta o resultado do ensaio/);
  assert.doesNotMatch(reply, /Use o procedimento e o equipamento/);
  assert.match(h.state.activeTests[0].id, /^misfire-injector-leak-/);
});

test('the next-test search asks for the procedure without requiring its page to repeat the DTC', async () => {
  const h = harness(golf); await afterCylinderThreeCoil(h); await say(h, 'SECA');
  h.handleTestResult('stayed'); await h.flush();
  assert.match(h.searches.at(-1).query, /injetor estanqueidade/);
  assert.doesNotMatch(h.searches.at(-1).query, /P0303/);
  h.handleTestResult('sealed'); await h.flush();
  assert.match(h.searches.at(-1).query, /compressao compression/);
});

test('ordinary workshop words at the injector step cannot become an engine identifier', async () => {
  const h = harness(golf); await afterCylinderThreeCoil(h); await say(h, 'SECA');
  h.handleTestResult('stayed'); await h.flush();
  for (const word of ['SECA', 'TESTEI', 'CERTO']) { await say(h, word); assert.equal(h.state.caseContext.engineCode, ''); }
  await say(h, 'Motor CHPA'); assert.equal(h.state.caseContext.engineCode, 'CHPA');
});

test('a failed repair and a new scanner reading start a new physical condition without rewriting the earlier swap', async () => {
  const h = harness(golf); await afterCylinderThreeCoil(h);
  await say(h, 'Troquei as bobinas e mudou para o cilindro 1');
  h.handleTestResult('confirmed'); await h.flush();
  await say(h, 'Após o reparo, a falha continua');
  const next = await say(h, 'Substituí a bobina por uma nova, mas o scanner mostra P0303');
  assert.match(next, /Confirmar a falha no cilindro 3/);
  assert.doesNotMatch(next, /Substitua somente a bobina|Qual é a identificação do motor/);
  assert.equal(h.state.testResults.find(r => r.report === 'Troquei as bobinas e mudou para o cilindro 1').outcome, 'moved');
  assert.ok(h.state.caseContext.flowVersion > 0);
});

test('the reported sequence keeps VELA OK, separates the green coil note and retains the confirmed P0301', async () => {
  const h = harness({ ...golf, brand: 'vw', model: 'golf', engine: '1.4 tsi' });
  await afterCoilStayed(h);
  const plug = await say(h, 'VELA OK');
  assert.match(plug, /comparar|Comparar/);
  assert.match(h.state.activeTests[0].id, /^misfire-plug-/);
  await say(h, 'BOBINA VERDE NO PRIMEIRO CILINDRO');
  assert.equal(h.state.caseContext.observations['misfire-plug-observation'], 'VELA OK');
  assert.match(h.state.messages.at(-1).text, /cor|oxidação/);
  assert.doesNotMatch(h.state.messages.at(-1).text, /Anotei sobre a vela: BOBINA/);
  for (const text of ['P301 UAI JA FALEI', 'P0301']) {
    const reply = await say(h, text);
    assert.doesNotMatch(reply, /Código incompleto|Confirme sem adivinhar|falha a sempre|Anotei sobre a vela: P301/);
    assert.match(reply, /P0301[\s\S]*confirmado/);
    assert.equal(h.state.caseContext.observations['misfire-plug-observation'], 'VELA OK');
    assert.equal(h.state.caseContext.candidateCode, '');
    assert.match(h.state.activeTests[0].id, /^misfire-plug-/);
  }
});

test('a coil note cannot be silently recorded as a spark-plug result while that question is pending', async () => {
  const h = harness(golf); await afterCoilStayed(h);
  await say(h, 'Bobina verde no primeiro cilindro');
  assert.equal(h.state.caseContext.observations['misfire-plug-observation'], undefined);
  await say(h, 'P0301');
  assert.equal(h.state.caseContext.observations['misfire-plug-observation'], undefined);
  assert.deepEqual(Array.from(h.state.caseContext.dtcs), ['P0301']);
});

test('a new unknown abbreviated code still requires confirmation after a previous DTC was confirmed', async () => {
  const h = harness(golf); await say(h, 'P0301');
  assert.match(await say(h, 'P302'), /Código incompleto[\s\S]*P0302/);
  assert.deepEqual(Array.from(h.state.caseContext.dtcs), ['P0301']);
});

test('the plug comparison can move the fault and the new code validates that result without restarting triage', async () => {
  const h = harness(golf); await afterCoilStayed(h); await say(h, 'VELA OK');
  assert.match(await say(h, 'Mudou com a vela'), /Qual cilindro passou/);
  const confirmed = await say(h, 'P0302');
  assert.match(confirmed, /Antes: cilindro 1[\s\S]*vela: cilindro 2/);
  assert.doesNotMatch(confirmed, /Qual cilindro passou|A falha acontece|contador de falhas de combustão/);
});

test('a plug result that stays in cylinder one advances to the injector test and accepts optional engine identification', async () => {
  const h = harness(golf); await afterCoilStayed(h); await say(h, 'VELA OK');
  assert.match(await say(h, 'Continuou no 1'), /Verificar estanqueidade do injetor[\s\S]*Golf 1.4 TSI/);
  assert.match(await say(h, 'P301 UAI JA FALEI'), /P0301[\s\S]*confirmado/);
  assert.equal(h.state.caseContext.engineCode, '');
  const procedure = await say(h, 'Motor CHPA');
  assert.match(procedure, /CHPA[\s\S]*manual[\s\S]*Não abra tubulações/);
  h.handleTestResult('sealed'); await h.flush();
  assert.match(h.state.messages.at(-1).text, /medir a compressão/);
  const readings = await say(h, 'C1 8 bar; C2 12 bar; C3 12 bar; C4 12 bar');
  assert.match(readings, /Compressão informada: C1 8 bar/);
  assert.doesNotMatch(readings, /é normal|troque a bobina|pressão correta é/);
});

test('green plastic and confirmed connector corrosion take different paths without changing the plug observation', async () => {
  for (const [description, contact] of [['Verde é a cor da peça', false], ['Há oxidação no conector', true]]) {
    const h = harness(golf); await afterCoilStayed(h); await say(h, 'VELA OK');
    await say(h, 'Bobina verde no primeiro cilindro'); await say(h, description);
    assert.equal(h.state.caseContext.observations['misfire-plug-observation'], 'VELA OK');
    assert.match(h.state.activeTests[0].id, contact ? /^misfire-coil-contact-/ : /^misfire-plug-/);
    if (contact) {
      h.handleTestResult('cleared'); await h.flush();
      assert.match(await say(h, 'Continuou sem falhas'), /verificação sem falhas registrada/i);
    }
  }
});

test('an old polluted history snapshot recovers VELA OK from the mechanic messages, not bot quotations', async () => {
  const h = harness(golf); await afterCoilStayed(h); await say(h, 'VELA OK');
  const saved = JSON.parse(JSON.stringify(h.buildSessionPayload()));
  delete saved.caseContext.factVersion;
  saved.caseContext.observations['misfire-plug-observation'] = 'P301 UAI JA FALEI';
  saved.messages.push({ role: 'bot', text: 'Vela danificada, não é VELA OK' });
  saved.messages.push({ role: 'user', text: 'BOBINA VERDE NO PRIMEIRO CILINDRO' });
  const restored = harness(); restored.loadHistoryItem(saved); await restored.flush();
  const reply = await say(restored, 'P301 UAI JA FALEI');
  assert.equal(restored.state.caseContext.observations['misfire-plug-observation'], 'VELA OK');
  assert.doesNotMatch(reply, /Código incompleto|vela: P301|vela danificada/i);
  assert.match(restored.state.activeTests[0].id, /^misfire-plug-/);
});

test('an unrelated component description cannot replace a requested voltage reading', async () => {
  const h = harness(golf); await say(h, 'Não pega'); await say(h, 'Não gira'); await say(h, 'Dá clique');
  await say(h, 'BOBINA VERDE');
  assert.equal(h.state.caseContext.observations['no-start-battery'], undefined);
  await say(h, '12,4 V antes e 9,4 V durante a partida');
  assert.match(h.state.caseContext.observations['no-start-battery'], /12,4 V/);
});

test('a new tentative code uses correct Portuguese for the always-present failure condition', async () => {
  const h = harness(golf); await say(h, 'P0301'); await say(h, 'O tempo todo');
  const reply = await say(h, 'P302');
  assert.match(reply, /falha o tempo todo[\s\S]*P0302/);
  assert.doesNotMatch(reply, /falha a sempre/);
});

test('a result explicitly naming the coil cannot be recorded as a result of the plug comparison', async () => {
  const h = harness(golf); await afterCoilStayed(h); await say(h, 'VELA OK');
  await say(h, 'A falha acompanhou a bobina');
  assert.equal(h.state.testResults.some(r => /^misfire-plug-/.test(r.id)), false);
  assert.equal(h.state.caseContext.observations['misfire-plug-observation'], 'VELA OK');
});

test('the reported multi-cylinder conversation records 1 and 2, then switches to no-start and RPM', async () => {
  const h = harness({ ...golf, brand: 'vw', model: 'golf', engine: '1.4 tsi' });
  await say(h, 'golf 1.4 tsi 2014 codigo p301'); await say(h, 'P0301');
  await say(h, 'A falha acontece a quente.');
  h.handleTestResult('multiple'); await h.flush();
  const question = h.state.messages.at(-1).text;
  const recorded = await say(h, 'cilindro 1 e 2');
  assert.notEqual(recorded, question);
  assert.match(recorded, /cilindros 1 e 2/);
  assert.doesNotMatch(recorded, /Quais cilindros acumulam/);
  await say(h, '1'); // Ambiguous reply must not silently erase either observed cylinder.
  assert.deepEqual(Array.from(h.state.caseContext.observedCylinders), [1, 2]);
  assert.match(await say(h, 'O carro não pega. Me guie pelo diagnóstico passo a passo.'), /motor gira ou nem gira/);
  const cranking = await say(h, 'O motor gira, mas não pega.');
  assert.match(cranking, /RPM|rotação/);
  assert.doesNotMatch(cranking, /Quais cilindros|falha a quente|comparar a bobina/i);
  const measured = await say(h, '200 rpm');
  assert.notEqual(measured, cranking);
  assert.match(measured, /200 RPM|200 rpm/);
  assert.doesNotMatch(measured, /Qual rotação|Quais cilindros/);
});

test('the vehicle explicitly supplied in chat survives code confirmation without a second vehicle request', async () => {
  const h = harness();
  await say(h, 'golf 1.4 tsi 2014 codigo p301');
  const reply = await say(h, 'P0301');
  assert.doesNotMatch(reply, /Qual é o veículo|Informe modelo/);
  assert.equal(h.state.currentDiagnosis.context.model.toLowerCase(), 'golf');
  assert.equal(h.state.currentDiagnosis.context.year, '2014');
  assert.match(h.state.currentDiagnosis.context.engine, /1\.4\s+TSI/i);
});

test('multi-cylinder information and the answer about other codes advance by text or button', async () => {
  const h = harness(golf);
  await say(h, 'P0301 falhando a quente');
  await say(h, 'cilindros 1 e 2');
  const reply = await say(h, 'sem outros códigos');
  assert.match(reply, /cilindros 1 e 2/);
  assert.doesNotMatch(reply, /Quais cilindros|aparece outro código/);
  assert.ok(h.practicalAnswer(h.state.currentDiagnosis).test);
});

test('a bare cylinder number is interpreted only when a cylinder is requested, never from an RPM reading', async () => {
  const h = harness(golf);
  await say(h, 'P0300 falhando a quente');
  h.handleTestResult('multiple'); await h.flush();
  assert.doesNotMatch(await say(h, '1'), /Quais cilindros/);
  assert.deepEqual(Array.from(h.state.caseContext.observedCylinders), [1]);
  await say(h, 'Não pega'); await say(h, 'Gira'); await say(h, '0');
  assert.equal(h.state.caseContext.rpm, 0);
  assert.deepEqual(Array.from(h.state.caseContext.observedCylinders), [1]);
  assert.doesNotMatch(h.state.messages.at(-1).text, /Quais cilindros/);
});

test('no-start takes priority over a compatible documented misfire rule and both starter choices stay in no-start', async () => {
  for (const response of ['Gira', 'Não gira']) {
    const h = harness({ brand: 'Renault', model: 'Duster', engine: 'K4M V42' });
    await say(h, 'Duster K4M V42 P0301 falhando a quente');
    await say(h, 'O carro não pega');
    const reply = await say(h, response);
    assert.match(reply, response === 'Gira' ? /RPM|rotação/ : /clique|painel/);
    assert.doesNotMatch(reply, /faísca da bobina|Quais cilindros|falha a quente/);
  }
});

test('old misfire result controls cannot change the case while a new no-start response is pending', async () => {
  const h = harness(golf); await say(h, 'P0301 falhando a quente');
  const oldTest = h.messages().at(-1).querySelector('.test-box');
  h.handleQuestion('Não pega'); oldTest.buttons[1].click(); await h.flush();
  assert.equal(h.state.testResults.length, 0);
  assert.equal(h.state.caseContext.symptom, 'no-start');
  assert.match(h.state.messages.at(-1).text, /motor gira ou nem gira/);
});

test('reopened current and legacy cases accept the RPM answer without returning to earlier cylinder questions', async () => {
  const h = harness(golf);
  await say(h, 'P0301 falhando a quente'); await say(h, 'cilindros 1 e 2');
  await say(h, 'Não pega'); await say(h, 'Gira');
  const saved = JSON.parse(JSON.stringify(h.buildSessionPayload()));
  for (const legacy of [false, true]) {
    const item = JSON.parse(JSON.stringify(saved)); if (legacy) delete item.caseContext;
    const restored = harness(); restored.loadHistoryItem(item); await restored.flush();
    const reply = await say(restored, '0');
    assert.match(reply, /0 RPM[\s\S]*comunicando/);
    assert.doesNotMatch(reply, /Quais cilindros|Qual rotação/);
  }
});

test('zero RPM is an observation, not proof of a bad sensor, and an explicit correction changes the next check', async () => {
  const h = harness(golf); await say(h, 'Não pega'); await say(h, 'Gira');
  assert.match(await say(h, '0 RPM'), /ainda não confirma sensor defeituoso/);
  assert.match(await say(h, 'Sim'), /ECU comunica[\s\S]*conector e chicote/);
  const corrected = await say(h, 'Corrigindo a leitura: 240 RPM');
  assert.match(corrected, /240 RPM[\s\S]*imobilizador/);
  assert.doesNotMatch(corrected, /Anotei 0 RPM|Quais cilindros/);
  assert.match(await say(h, 'Bloqueada'), /partida está bloqueada/i);
});

test('multi-cylinder connection results and fuel-trim observations are recorded instead of asking the same thing again', async () => {
  const h = harness(golf);
  await say(h, 'P0301 falhando a quente'); await say(h, 'cilindros 1 e 2'); await say(h, 'sem outros códigos');
  assert.match(await say(h, 'conexões firmes'), /curto e longo prazo/);
  const measured = await say(h, 'STFT +3%, LTFT +2%, marcha lenta');
  assert.match(measured, /STFT \+3%, LTFT \+2%/);
  assert.doesNotMatch(measured, /veja as correções de combustível/);
  assert.doesNotMatch(measured, /mistura (?:rica|pobre) confirmada|troque (?:a|o)/);
});

test('a new code and its reported scanner description are accepted without fabricating a catalog definition', async () => {
  const h = harness(golf);
  await say(h, 'P0301 falhando a quente'); await say(h, 'cilindros 1 e 2');
  assert.match(await say(h, 'P019A'), /descrição completa/);
  const reply = await say(h, 'P019A: pressão de combustível, módulo motor');
  assert.doesNotMatch(reply, /Qual é a descrição completa/);
  assert.equal(h.state.currentDiagnosis.dtcs.find(d => d.code === 'P019A').label, '');
  assert.match(h.state.caseContext.dtcDescriptions.P019A, /pressão de combustível/);
});

test('a slow old document search cannot replace a more recent no-start answer', async () => {
  const h = harness(golf); let release;
  h.context.ORACLE_REMOTE_KNOWLEDGE.search = () => new Promise(resolve => { release = resolve; });
  h.handleQuestion('P0301 falhando a quente');
  const searching = h.runNextTimer();
  h.handleQuestion('Não pega'); await h.flush();
  const latest = h.state.messages.at(-1).text;
  release([]); await searching;
  assert.equal(h.state.messages.at(-1).text, latest);
  assert.match(latest, /motor gira ou nem gira/);
  assert.equal(h.state.activeTests.length, 0);
});

test('yes in a new no-start step cannot confirm an old tentative DTC', async () => {
  const h = harness(golf); await say(h, 'P301');
  await say(h, 'Não pega'); await say(h, 'Gira'); await say(h, '0 RPM'); await say(h, 'Sim');
  assert.deepEqual(Array.from(h.state.caseContext.dtcs), []);
  assert.match(h.state.messages.at(-1).text, /ECU comunica/);
});

test('chat-supplied vehicle identity stays available after the compact text window advances', async () => {
  const h = harness(); await say(h, 'golf 1.4 tsi 2014 codigo P0301');
  for (let i = 0; i < 14; i++) await say(h, 'Observação do caso ' + i);
  const reply = await say(h, 'Quente');
  assert.equal(h.state.vehicle.model, 'Golf');
  assert.match(reply, /Golf 1.4 TSI/);
  assert.doesNotMatch(reply, /Qual é o veículo/);
  const pressure = harness(); await say(pressure, 'Golf com pressão de 1.4 bar');
  assert.equal(pressure.state.vehicle.engine || '', '');
});

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
  h.get('chatInput').value = 'Continua no mesmo cilindro';
  const reply = await say(h, 'Continua no mesmo cilindro');
  assert.equal(h.get('chatInput').value, '');
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
  const h = harness({ brand: 'Renault', model: 'Duster', engine: 'K4M V42', year: '2011' });
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
  const h = harness({ model: 'Duster', engine: 'K4M V42', year: '2011' });
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

test('a procedure search finds matching injector instructions without DTC text and excludes other systems and engines', async () => {
  const records = {
    1: { id: 1, text: 'Volkswagen Golf 1.4 TSI: ensaio de estanqueidade e vazamento interno do injetor.', path: 'VW/Golf-1.4.pdf', truth_status: 'source_extracted', page: 11 },
    2: { id: 2, text: 'Volkswagen Golf: teste de estol da transmissão e pressão de linha.', path: 'VW/Golf-transmissao.pdf', truth_status: 'source_extracted', page: 12 },
    3: { id: 3, text: 'Volkswagen Golf 1.6: ensaio de estanqueidade e vazamento interno do injetor.', path: 'VW/Golf-1.6.pdf', truth_status: 'source_extracted', page: 13 },
    4: { id: 4, text: 'Renault Duster 1.6: ensaio de estanqueidade e vazamento interno do injetor.', path: 'Renault/Duster.pdf', truth_status: 'source_extracted', page: 14 },
    5: { id: 5, text: 'Volkswagen Golf 1.4 TDI diesel: ensaio de estanqueidade e vazamento interno do injetor.', path: 'VW/Golf-diesel.pdf', truth_status: 'source_extracted', page: 15 }
  };
  const h = harness(); h.context.CustomEvent = function () {}; h.context.window.dispatchEvent = () => {};
  h.context.fetch = async url => {
    const pathname = new URL(url).pathname;
    const body = pathname.endsWith('manifest.json') ? { mode: 'compact-lexical', heavy_shards_required_by_client: false }
      : pathname.endsWith('record-map.json') ? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      : pathname.endsWith('records/r00.json') ? records
      : { injetor: [1, 2, 3, 4, 5], estanqueidade: [1, 3, 4, 5], golf: [1, 2, 3, 5] };
    return { ok: true, async json() { return body; } };
  };
  vm.runInContext(read('js/knowledge-remote.js'), h.context);
  const hits = await h.context.window.ORACLE_REMOTE_KNOWLEDGE.search('injetor estanqueidade vazamento injector internal leakage', golf, 6);
  assert.deepEqual(Array.from(hits, hit => hit.page), [11]);
});


test('denied and hypothetical codes cannot become scanner evidence, and an explicit correction keeps only the actual code', async () => {
  const h = harness({ brand: 'Ford', model: 'Ka', engine: '1.0' });
  await say(h, 'Pode ser P0301?');
  assert.deepEqual(Array.from(h.state.caseContext.dtcs), []);
  await say(h, 'O scanner acusa P0301');
  await say(h, 'Corrigindo: não é P0301, é P0302');
  assert.deepEqual(Array.from(h.state.caseContext.dtcs), ['P0302']);
  await say(h, 'P0302 não aparece mais');
  assert.deepEqual(Array.from(h.state.caseContext.dtcs), []);
  const noStart = harness({ brand: 'Ford', model: 'Ka', engine: '1.0' });
  await say(noStart, 'Não pega; scanner acusa P0335');
  assert.deepEqual(Array.from(noStart.state.caseContext.dtcs), ['P0335']);
});

test('unmeasured and hypothetical RPM cannot turn into a positive engine speed observation', async () => {
  for (const report of ['Se aparecer 200 RPM, o sensor está bom?', 'Não consegui medir 200 RPM', 'O scanner não mostra rotação']) {
    const h = harness({ brand: 'Fiat', model: 'Uno', engine: '1.0' });
    await say(h, 'O motor gira mas não pega');
    await say(h, report);
    assert.equal(h.state.caseContext.rpm, null, report);
    assert.equal(h.state.caseContext.rpmPresent, false, report);
    assert.doesNotMatch(h.state.messages.at(-1).text, /imobilizador mostra partida autorizada/);
  }
});

test('negative and uncertain communication reports retain their meaning at the zero-RPM step', async () => {
  for (const report of ['Não comunica normalmente', 'A ECU não está comunicando durante a partida']) {
    const h = harness({ brand: 'Ford', model: 'Ka', engine: '1.0' });
    await say(h, 'Gira mas não pega'); await say(h, '0 RPM');
    assert.match(await say(h, report), /comunicação cai|tensão da bateria/);
    assert.equal(h.state.caseContext.ecuCommunication, 'no');
  }
  const h = harness(golf); await say(h, 'Gira mas não pega'); await say(h, '0 RPM');
  assert.match(await say(h, 'Não sei se comunica'), /continua comunicando/);
  assert.equal(h.state.caseContext.ecuCommunication, '');
});

test('unknown and denied authorization are never classified as an allowed start', async () => {
  for (const [report, expected] of [['Não sei se está autorizada', 'unknown'], ['Não está autorizada', 'blocked']]) {
    const h = harness({ brand: 'Fiat', model: 'Uno', engine: '1.0' });
    await say(h, 'Gira mas não pega'); await say(h, '200 RPM'); await say(h, report);
    assert.equal(h.state.caseContext.startAuthorized, expected);
    if (expected === 'blocked') assert.match(h.state.messages.at(-1).text, /partida está bloqueada/);
  }
});

test('a cold-only correction does not retain the explicitly denied hot condition', async () => {
  const h = harness(golf); await say(h, 'P0301 falhando a quente');
  assert.match(await say(h, 'Só a frio, não a quente'), /falha a frio/);
  assert.equal(h.state.caseContext.temperature, 'frio');
});

test('a voltage that was not measured cannot complete a no-start check and a real reading is not repeatedly requested', async () => {
  const h = harness({ brand: 'Chevrolet', model: 'Onix', engine: '1.0' });
  await say(h, 'Gira mas não pega'); await say(h, 'Não consigo medir a rotação'); await say(h, 'Tenho multímetro');
  await say(h, 'Ainda não medi, deveria dar 12 V?');
  assert.equal(h.state.caseContext.observations['no-start-battery'], undefined);
  const reply = await say(h, 'Medi 12,5 V antes e 10,1 V durante a partida');
  assert.match(reply, /12,5 V antes e 10,1 V/);
  assert.doesNotMatch(reply, /envie a tensão da bateria antes/);
});

async function afterNoCrankClick(h) {
  await say(h, 'O carro não pega. Me guie pelo diagnóstico passo a passo.');
  await say(h, 'O motor não gira ao tentar ligar.'); await say(h, 'Dá clique');
  assert.equal(h.state.caseContext.awaiting, 'no-start-battery');
}

test('the pasted no-crank conversation clarifies a lone voltage and explains each invalid reply', async () => {
  const h = harness(golf); await afterNoCrankClick(h);
  assert.match(await say(h, '12V'), /Os 12 V foram medidos antes.*durante/);
  const partial = h.state.caseContext.startingBattery;
  assert.equal(partial.before, null); assert.equal(partial.during, null); assert.equal(partial.pending, 12);
  assert.match(await say(h, 'P35'), /DTC incompleto/);
  assert.match(await say(h, '1214'), /não identifica uma tensão/);
  assert.match(await say(h, 'SADAS'), /Não consegui identificar um resultado/);
  assert.deepEqual(Array.from(h.state.caseContext.dtcs), []);
  assert.equal(h.state.caseContext.engineCode, '');
  assert.equal(h.state.caseContext.startingBattery.pending, 12);
  assert.match(await say(h, 'Antes da tentativa'), /menor tensão.*durante/);
  assert.equal(h.state.caseContext.startingBattery.before, 12);
  assert.equal(h.state.caseContext.startingBattery.during, null);
  assert.match(await say(h, '10 V durante'), /terminais da bateria/);
  assert.equal(h.state.caseContext.startingBattery.during, 10);
  assert.match(await say(h, 'Terminais firmes, sem oxidação'), /código de identificação do motor/);
  assert.match(await say(h, 'CHPA'), /Código de motor informado: CHPA/);
  assert.equal(h.state.caseContext.noStartReference.status, 'code');
  const reply = await say(h, 'Não tenho a referência');
  assert.match(reply, /diagnóstico fica pendente/);
  assert.doesNotMatch(reply, /Envie o código de identificação|arranque (?:condenado|defeituoso)|bateria (?:boa|ruim)/);
});

test('battery phases and missing measurements survive reopening without borrowing generated text', async () => {
  const h = harness(golf); await afterNoCrankClick(h); await say(h, '12V');
  const saved = JSON.parse(JSON.stringify(h.buildSessionPayload()));
  const restored = harness(); restored.loadHistoryItem(saved); await restored.flush();
  await say(restored, 'Durante a tentativa');
  assert.equal(restored.state.caseContext.startingBattery.during, 12);
  assert.equal(restored.state.caseContext.startingBattery.before, null);
  assert.equal(restored.state.caseContext.awaiting, 'no-start-battery-before');
  assert.match(await say(restored, '12,4'), /terminais da bateria/);
  assert.equal(restored.state.caseContext.startingBattery.before, 12.4);

  const old = JSON.parse(JSON.stringify(saved));
  delete old.caseContext.startingBattery;
  old.caseContext.awaiting = 'no-start-power-diagram';
  old.messages.push({ role: 'bot', text: 'Antes 14 V e durante 10 V.', at: new Date().toISOString() });
  const migrated = harness(); migrated.loadHistoryItem(old); await migrated.flush();
  assert.equal(migrated.state.caseContext.awaiting, 'no-start-battery-stage');
  assert.equal(migrated.state.caseContext.startingBattery.pending, 12);
  assert.equal(migrated.state.caseContext.startingBattery.before, null);
});

function firebaseStoredPayload(payload) {
  function stored(value) {
    if (value === null) return undefined;
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.length ? value.map(stored) : undefined;
    const result = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, stored(child)]).filter(([, child]) => child !== undefined));
    return Object.keys(result).length ? result : undefined;
  }
  return JSON.parse(JSON.stringify(stored(payload)));
}

test('Firebase omission of null battery phases retains a partial reading and its remaining questions', async () => {
  const h = harness(golf); await afterNoCrankClick(h); await say(h, '12V');
  const saved = firebaseStoredPayload(h.buildSessionPayload());
  assert.equal(Object.hasOwn(saved.caseContext.startingBattery, 'before'), false);
  assert.equal(Object.hasOwn(saved.caseContext.startingBattery, 'during'), false);
  assert.equal(Object.hasOwn(saved.caseContext, 'rpm'), false);
  assert.equal(Object.hasOwn(saved.caseContext, 'dtcs'), false);
  const restored = harness(); restored.loadHistoryItem(saved); await restored.flush();
  assert.equal(restored.state.caseContext.startingBattery.before, null);
  assert.equal(restored.state.caseContext.startingBattery.during, null);
  assert.equal(restored.state.caseContext.startingBattery.pending, 12);
  assert.equal(restored.state.caseContext.rpm, null);
  assert.deepEqual(Array.from(restored.state.caseContext.dtcs), []);
  assert.equal(restored.state.caseContext.awaiting, 'no-start-battery-stage');
  assert.match(restored.practicalAnswer(restored.buildDiagnosis('')).text, /Os 12 V foram medidos antes.*durante/);
  assert.match(await say(restored, 'Antes da tentativa'), /menor tensão.*durante/);
  assert.match(await say(restored, '10 V durante'), /terminais da bateria/);
  assert.equal(restored.state.caseContext.startingBattery.before, 12);
  assert.equal(restored.state.caseContext.startingBattery.during, 10);
});

test('Firebase omission of a cleared pending voltage never reopens a completed reading as undefined volts', async () => {
  const h = harness(golf); await afterNoCrankClick(h); await say(h, '12 V antes e 10 V durante');
  const atTerminals = firebaseStoredPayload(h.buildSessionPayload());
  await say(h, 'Terminais firmes'); await say(h, 'CHPA'); await say(h, 'Não tenho a referência');
  const atReference = firebaseStoredPayload(h.buildSessionPayload());
  for (const [saved, expected] of [[atTerminals, 'no-start-terminals'], [atReference, 'no-start-power-diagram']]) {
    assert.equal(Object.hasOwn(saved.caseContext.startingBattery, 'pending'), false);
    const restored = harness(); restored.loadHistoryItem(saved); await restored.flush();
    assert.equal(restored.state.caseContext.startingBattery.pending, null);
    assert.equal(restored.state.caseContext.startingBattery.before, 12);
    assert.equal(restored.state.caseContext.startingBattery.during, 10);
    assert.equal(restored.state.caseContext.awaiting, expected);
    const answer = restored.practicalAnswer(restored.buildDiagnosis('')).text;
    assert.doesNotMatch(answer, /undefined|Os .* V foram medidos antes/);
    assert.match(answer, /12 V antes e 10 V durante/);
  }
});

test('explicit before and during voltages preserve their reported order and decimal values', async () => {
  for (const [text, before, during] of [
    ['12,4 V antes e 9,4 V durante', 12.4, 9.4],
    ['Durante 9.4 V e antes 12.4 V', 12.4, 9.4],
    ['12V antes e durante, nos dois', 12, 12]
  ]) {
    const h = harness(golf); await afterNoCrankClick(h); await say(h, text);
    assert.equal(h.state.caseContext.startingBattery.before, before, text);
    assert.equal(h.state.caseContext.startingBattery.during, during, text);
    assert.equal(h.state.caseContext.awaiting, 'no-start-terminals');
  }
});

test('unmeasured, hypothetical and unrelated readings never complete the battery phases', async () => {
  for (const text of ['Se medir 12 V antes e 10 V durante?', 'Deveria dar 12 V?', 'Medi 180 psi', '1214', '1214 V', 'Medi -12 V']) {
    const h = harness(golf); await afterNoCrankClick(h); await say(h, text);
    assert.equal(h.state.caseContext.startingBattery, null, text);
    assert.equal(h.state.caseContext.awaiting, 'no-start-battery', text);
  }
});

test('missing equipment pauses the measurement and can be resumed without fabricating voltages', async () => {
  const h = harness(golf); await afterNoCrankClick(h); await say(h, '12V');
  assert.match(await say(h, 'Não tenho multímetro'), /Providencie um multímetro/);
  assert.equal(h.state.caseContext.startingBattery.before, null);
  assert.match(await say(h, 'Vou medir agora'), /Os 12 V foram medidos/);
  await say(h, 'Antes'); await say(h, '10V');
  assert.equal(h.state.caseContext.awaiting, 'no-start-terminals');
});

test('loose terminals are not silently recorded as firm even when there is no corrosion', async () => {
  for (const text of ['Estão soltos, sem oxidação', 'Terminais não estão firmes', 'Sem oxidação, mas soltos', 'Terminais danificados, sem oxidação']) {
    const h = harness(golf); await afterNoCrankClick(h); await say(h, '12 V antes e 10 V durante');
    assert.match(await say(h, text), /Conexão solta ou oxidada/, text);
    assert.equal(h.state.caseContext.starterConnections, 'problem');
    assert.doesNotMatch(h.state.messages.at(-1).text, /arranque defeituoso|bateria normal/);
  }
});

test('all no-start reference endpoints consume identification, missing reference and new measurements', async () => {
  const cases = [
    ['no-start-power-diagram', ['Não pega', 'Não gira', 'Dá clique', '12 V antes e 10 V durante', 'Terminais firmes']],
    ['no-start-signal-reference', ['Gira mas não pega', '0 RPM', 'Não comunica normalmente', '9,4 V durante']],
    ['no-start-engine-procedure', ['Gira mas não pega', '200 RPM', 'Partida autorizada', 'Sem códigos']]
  ];
  for (const [slot, inputs] of cases) {
    const h = harness(golf); for (const input of inputs) await say(h, input);
    assert.equal(h.state.caseContext.awaiting, slot);
    assert.match(await say(h, 'P35'), /DTC incompleto/);
    assert.equal(h.state.caseContext.engineCode, '');
    assert.match(await say(h, 'CHPA'), /Código de motor informado: CHPA/);
    assert.match(await say(h, 'Não tenho o esquema'), /diagnóstico fica pendente/);
    const restored = harness(); restored.loadHistoryItem(JSON.parse(JSON.stringify(h.buildSessionPayload()))); await restored.flush();
    assert.equal(restored.state.caseContext.noStartReference.status, 'unavailable');
    assert.match(await say(restored, 'Quero registrar novas medições'), /pontos onde mediu/);
    assert.match(await say(restored, 'Medi 9,5 V nos polos durante a tentativa'), /Informação adicional registrada: Medi 9,5 V/);
    assert.equal(restored.state.caseContext.noStartReference.status, 'evidence');
  }
});

test('changing the cranking condition invalidates earlier starting measurements and reference status', async () => {
  const h = harness(golf); await afterNoCrankClick(h); await say(h, '12 V antes e 10 V durante');
  await say(h, 'Terminais firmes'); await say(h, 'Não tenho referência');
  assert.match(await say(h, 'Agora o motor gira mas não pega'), /RPM/);
  assert.equal(h.state.caseContext.startingBattery, null);
  assert.equal(h.state.caseContext.noStartReference, null);
  h.startNewCase(); assert.equal(h.state.caseContext.startingBattery, null);
});

test('returning to no-start does not reuse signal evidence from a previous physical condition', async () => {
  const h = harness(golf);
  for (const input of ['Gira mas não pega', '0 RPM', 'Sim, comunica normalmente', 'Conector firme, chicote sem danos']) await say(h, input);
  assert.equal(h.state.caseContext.awaiting, 'no-start-signal-reference');
  for (const input of ['Está falhando', 'Não pega', 'Gira', '0 RPM', 'Sim, comunica normalmente']) await say(h, input);
  assert.equal(h.state.caseContext.awaiting, 'no-start-rotation-signal');
  assert.equal(h.state.caseContext.observations['no-start-rotation-signal'], undefined);
});

test('a post-connection report that the engine turned advances to RPM while a denied turn does not', async () => {
  const h = harness(golf); await afterNoCrankClick(h); await say(h, '12 V antes e 10 V durante'); await say(h, 'Terminais soltos');
  assert.match(await say(h, 'Corrigi a conexão, mas não girou'), /Conexão solta ou oxidada/);
  assert.equal(h.state.caseContext.cranking, 'nao gira');
  assert.match(await say(h, 'Agora girou mas não pega'), /RPM/);
  assert.equal(h.state.caseContext.cranking, 'gira');
});

test('a reported manual excerpt and negative code reading are acknowledged without asking for the same input again', async () => {
  const h = harness(golf); await afterNoCrankClick(h); await say(h, '12 V antes e 10 V durante'); await say(h, 'Terminais firmes');
  const report = 'Manual CHPA página 10: conferir alimentação conforme procedimento; medi 12 V nos polos durante a tentativa';
  assert.match(await say(h, report), /Informação adicional registrada: Manual CHPA/);
  assert.doesNotMatch(h.state.messages.at(-1).text, /envie.*esquema|informe os pontos de medição/i);
  assert.match(await say(h, 'Sem códigos'), /Informação adicional registrada: Sem códigos/);
  assert.deepEqual(Array.from(h.state.caseContext.dtcs), []);
});

test('a later battery correction replaces the structured voltage without borrowing a voltage from another circuit', async () => {
  const h = harness(golf); await afterNoCrankClick(h); await say(h, '12 V antes e 10 V durante'); await say(h, 'Terminais firmes');
  const reply = await say(h, 'Corrigindo: medi 8 V nos polos da bateria durante a tentativa');
  assert.equal(h.state.caseContext.startingBattery.before, 12);
  assert.equal(h.state.caseContext.startingBattery.during, 8);
  assert.match(reply, /12 V antes e 8 V durante/);
  assert.doesNotMatch(reply, /10 V durante/);
  await say(h, 'Medi 5 V no sensor durante a tentativa');
  assert.equal(h.state.caseContext.startingBattery.during, 8);
  await say(h, 'Medi 6 V nos polos do arranque durante a tentativa');
  assert.equal(h.state.caseContext.startingBattery.during, 8);
});

test('Palio without DTC remembers fuel and reported services, handles unavailable scanner readings and reopens cleanly', async () => {
  const vehicle = { brand: 'Fiat', model: 'Palio', year: '2011', engine: '1.0 ECONOMY' };
  const h = harness(vehicle);
  await say(h, 'Está falhando'); await say(h, 'O tempo todo'); await say(h, 'Sem código');
  const condition = await say(h, 'Acelerando');
  const withServices = await say(h, 'Gasolina, velas novas, bicos limpos e cabos novos');
  assert.notEqual(withServices, condition);
  assert.equal(h.state.caseContext.fuelType, 'gasolina');
  assert.deepEqual(Array.from(h.state.caseContext.interventions, x => x.component), ['velas', 'bicos', 'cabos']);
  assert.match(withServices, /velas novas[\s\S]*bicos limpos[\s\S]*cabos novos/);
  assert.doesNotMatch(withServices, /troque a bobina|causa confirmada/);
  assert.ok(h.searches.some(x => /falha combustao/.test(x.query)));
  const noScanner = await say(h, 'Não tenho esse parâmetro no scanner');
  assert.match(noScanner, /leituras não estão disponíveis/);
  assert.doesNotMatch(noScanner, /envie o código do motor e uma leitura comparativa/);
  const restored = harness();
  restored.loadHistoryItem(JSON.parse(JSON.stringify(h.buildSessionPayload())));
  await restored.flush();
  assert.equal(restored.state.caseContext.fuelType, 'gasolina');
  assert.equal(restored.state.caseContext.interventions.length, 3);
  assert.match(await say(restored, 'Você está se repetindo'), /leituras não estão disponíveis/);
});

test('hypothetical or denied workshop services do not enter the Palio facts', async () => {
  const h = harness({ brand:'Fiat', model:'Palio', engine:'1.0 ECONOMY' });
  await say(h, 'Está falhando'); await say(h, 'A quente'); await say(h, 'Sem código');
  await say(h, 'Se eu trocar as velas e os bicos, resolve?');
  await say(h, 'Não troquei os cabos');
  assert.equal(h.state.caseContext.interventions.length, 0);
});

test('misfire without a stored code advances to operating conditions without fabricating a cylinder', async () => {
  const h = harness(golf);
  await say(h, 'Está falhando a quente');
  const reply = await say(h, 'Sem código');
  assert.match(reply, /marcha lenta|sob carga/);
  assert.doesNotMatch(reply, /diga ‘sem código’|bobina do cilindro/);
  assert.deepEqual(Array.from(h.state.caseContext.dtcs), []);
  assert.match(await say(h, 'Em marcha lenta, STFT +15% e LTFT +10%'), /Dados registrados.*STFT/);
});

test('generic normal results survive the next message and a reopened case', async () => {
  const car = { brand: 'Renault', model: 'Duster', engine: 'K4M V42', year: '2011' };
  const h = harness(car); await say(h, 'DF026');
  assert.equal(h.state.activeTests[0].id, 'injector-resistance');
  await say(h, 'Normal');
  assert.equal(h.state.activeTests[h.state.activeTestIndex].id, 'injector-12v');
  await say(h, 'Qual o próximo teste?');
  assert.equal(h.state.activeTests[0].id, 'injector-12v');
  const saved = JSON.parse(JSON.stringify(h.buildSessionPayload()));
  const restored = harness(); restored.loadHistoryItem(saved); await restored.flush();
  assert.equal(restored.state.activeTests[0].id, 'injector-12v');
});

test('a measured or abnormal generic result is recorded without silently passing it or abandoning it', async () => {
  const h = harness({ brand: 'Renault', model: 'Duster', engine: 'K4M V42', year: '2011' });
  await say(h, 'DF026');
  assert.match(await say(h, 'Medi 14 Ω a 25 °C'), /Anotei no teste.*14 Ω/);
  assert.equal(h.state.testResults.at(-1).outcome, 'measured');
  assert.equal(h.state.activeTests[0].id, 'injector-resistance');
  const reply = await say(h, 'Alterado');
  assert.match(reply, /resultado sozinho não confirma/);
  assert.equal(h.state.activeTests[h.state.activeTestIndex].id, 'injector-resistance');
  assert.match(await say(h, 'Medi 40 Ω'), /40 Ω/);
  assert.equal(h.state.testResults.at(-1).outcome, 'measured');
});

test('case summary contains only current reported codes while preserving corrections in the messages', async () => {
  const h = harness(golf);
  await say(h, 'P0301'); await say(h, 'Corrigindo: não é P0301, é P0302');
  const item = h.buildSessionPayload();
  assert.deepEqual(Array.from(item.dtcs), ['P0302']);
  assert.ok(item.messages.some(message => /não é P0301/.test(message.text)));
});

test('local technical values require a model year and cannot apply outside the cited manual years', () => {
  const unknown = harness({ brand: 'Renault', model: 'Duster', engine: 'K4M V42' });
  const answer = unknown.practicalAnswer(unknown.buildDiagnosis('DF026'));
  assert.equal(answer.test, null);
  assert.match(answer.question, /ano do veículo/);
  assert.doesNotMatch(answer.text, /11.?20|9,2.?17/);
  const newer = harness({ brand: 'Renault', model: 'Duster', engine: 'K4M V42', year: '2025' });
  assert.equal(newer.buildDiagnosis('DF026').ruleId, 'baseline');
  assert.equal(newer.buildDiagnosis('resistência do injetor DF026').facts.length, 0);
});

test('an older cloud snapshot cannot erase an offline case or replace its newer result', () => {
  const h = harness();
  const local = [
    { id: 'offline', updatedAt: '2026-10-16T13:00:00Z', title: 'Novo caso offline' },
    { id: 'shared', updatedAt: '2026-10-16T12:00:00Z', title: 'Resultado corrigido' }
  ];
  const cloud = [
    { id: 'cloud', updatedAt: '2026-10-16T10:00:00Z', title: 'Outro caso' },
    { id: 'shared', updatedAt: '2026-10-16T11:00:00Z', title: 'Resultado antigo' }
  ];
  const merged = h.mergeHistory(local, cloud);
  assert.deepEqual(Array.from(merged, row => row.id), ['offline', 'shared', 'cloud']);
  assert.equal(merged.find(row => row.id === 'shared').title, 'Resultado corrigido');
  assert.equal(h.mergeHistory(local, []).length, 2);
  cloud[1].updatedAt = '2026-10-16T14:00:00Z';
  assert.equal(h.mergeHistory(local, cloud)[0].title, 'Resultado antigo'); // Newer server snapshot wins.
});

test('a withdrawn OCR code stays withdrawn on follow-up and after reopening the case', async () => {
  const h = harness(golf);
  h.context.ORACLE_MEDIA.analyzeFile = async () => ({ text: 'P0301', codes: ['P0301'], kind: 'foto' });
  await h.processMedia({ type: 'image/png', size: 100 }); await h.flush();
  await say(h, 'P0301 não aparece mais'); await say(h, 'E agora?');
  assert.deepEqual(Array.from(h.state.caseContext.dtcs), []);
  const restored = harness(); restored.loadHistoryItem(JSON.parse(JSON.stringify(h.buildSessionPayload()))); await restored.flush();
  await say(restored, 'Qual o próximo passo?');
  assert.deepEqual(Array.from(restored.state.caseContext.dtcs), []);
});

test('code possession denials and causal questions do not create current scanner readings', async () => {
  for (const message of ['Não tenho P0301 no scanner', 'Não tenho o código P0301', 'P0301 pode aparecer por causa de combustível?']) {
    const h = harness(golf); await say(h, message);
    assert.deepEqual(Array.from(h.state.caseContext.dtcs), [], message);
  }
});

test('a battery voltage cannot be recorded as an injector resistance reading', async () => {
  const h = harness({ brand: 'Renault', model: 'Duster', engine: 'K4M V42', year: '2011' });
  await say(h, 'DF026'); await say(h, 'Medi 12 V na bateria');
  assert.equal(h.state.testResults.length, 0);
  assert.equal(h.state.activeTests[0].id, 'injector-resistance');
});

async function afterCylinderFourInjector(h) {
  await say(h, 'O motor está falhando. Quero começar o diagnóstico sem trocar peça no chute.');
  await say(h, 'A falha acontece o tempo todo.'); await say(h, 'p304'); await say(h, 'P0304');
  h.handleTestResult('single'); await h.flush(); h.handleTestResult('stayed'); await h.flush();
  await say(h, 'seca'); h.handleTestResult('stayed'); await h.flush();
  h.handleTestResult('sealed'); await h.flush();
  assert.equal(h.state.caseContext.awaiting, 'misfire-compression-readings');
}

test('the pasted P0304 conversation records 180 in each cylinder and asks only for its unit', async () => {
  const h = harness(golf); await afterCylinderFourInjector(h);
  const reply = await say(h, '180 em cada');
  assert.match(reply, /180/);
  assert.match(reply, /psi.*bar.*kPa/i);
  assert.doesNotMatch(reply, /após comparar bobina e vela|próximo passo é medir a compressão|compressão normal/);
  assert.equal(h.state.caseContext.awaiting, 'misfire-compression-unit');
  const next = await say(h, 'PSI');
  assert.match(next, /180 psi em cada cilindro/);
  assert.match(next, /frio|aquecido/);
  assert.doesNotMatch(next, /próximo passo é medir a compressão|mecânica está normal|injetor está bom/);
  assert.equal(h.state.caseContext.temperature, 'sempre');
});

test('a compression unit supplied after reopening completes the saved partial reading', async () => {
  const h = harness(golf); await afterCylinderFourInjector(h); await say(h, '180 em cada');
  const restored = harness(); restored.loadHistoryItem(JSON.parse(JSON.stringify(h.buildSessionPayload()))); await restored.flush();
  const reply = await say(restored, 'psi');
  assert.match(reply, /180 psi em cada cilindro/);
  assert.equal(restored.state.caseContext.engineCode, '');
});

test('compression conditions are retained without rewriting the original failure temperature', async () => {
  const h = harness(golf); await afterCylinderFourInjector(h); await say(h, '180 psi em cada');
  const reply = await say(h, 'Motor aquecido, seguindo o procedimento do ensaio');
  assert.match(reply, /180 psi/);
  assert.match(reply, /condiç|Condiç/);
  assert.doesNotMatch(reply, /A medição foi feita com o motor frio|compressão normal|injetor.*confirmado como bom/);
  assert.equal(h.state.caseContext.temperature, 'sempre');
});

test('a correction to one cylinder is not propagated to every cylinder', async () => {
  const h = harness(golf); await afterCylinderFourInjector(h); await say(h, '180 em cada'); await say(h, 'psi');
  const reply = await say(h, 'Corrigindo: 150 no cilindro 4');
  assert.match(reply, /150 psi.*cilindro 4|cilindro 4.*150 psi/);
  assert.doesNotMatch(reply, /150 psi em cada|não há diferença/);
});

test('hypothetical measurements and unrelated voltages are not recorded as compression', async () => {
  for (const text of ['Se medir 180 em cada, está bom?', 'Não medi 180 psi', 'Medi 12 V na bateria', 'Não é 150 no cilindro 4', 'Se fosse 150 no cilindro 4', '-180 psi em cada']) {
    const h = harness(golf); await afterCylinderFourInjector(h); await say(h, text);
    assert.equal(h.state.caseContext.compression, null, text);
  }
});

test('a natural correction replaces the pressure instead of repeating the old reading', async () => {
  const h = harness(golf); await afterCylinderFourInjector(h); await say(h, '180 psi em cada');
  await say(h, 'Motor quente seguindo o procedimento');
  const reply = await say(h, 'Não, 150 psi em cada');
  assert.deepEqual(Array.from(h.state.caseContext.compression.values), [150]);
  assert.match(reply, /150 psi em cada cilindro/);
  assert.doesNotMatch(reply, /180 psi/);
});

test('cylinder counts are not included among the pressure readings', async () => {
  for (const text of ['180 psi em cada um dos 4 cilindros', '180 nos 4 cilindros']) {
    const h = harness(golf); await afterCylinderFourInjector(h);
    const reply = await say(h, text);
    assert.deepEqual(Array.from(h.state.caseContext.compression.values), [180], text);
    assert.equal(h.state.caseContext.compression.allCylinders, true);
    assert.doesNotMatch(reply, /180 \/ 4/);
  }
});

test('pressure units adjacent to the value are recognized without asking for them again', async () => {
  for (const [text, value, unit] of [['180psi em cada', 180, 'psi'], ['12,5bar em cada', 12.5, 'bar'], ['1200kPa em cada', 1200, 'kpa']]) {
    const h = harness(golf); await afterCylinderFourInjector(h);
    const reply = await say(h, text);
    assert.equal(h.state.caseContext.compression.unit, unit);
    assert.deepEqual(Array.from(h.state.caseContext.compression.values), [value]);
    assert.doesNotMatch(reply, /A leitura está em psi/);
    assert.equal(h.state.caseContext.awaiting, 'misfire-compression-conditions');
  }
});

test('compression and explicit test conditions supplied together do not trigger the same question', async () => {
  const h = harness(golf); await afterCylinderFourInjector(h);
  const reply = await say(h, '180 psi em cada um dos 4 cilindros, motor quente a 90 °C seguindo o procedimento');
  assert.deepEqual(Array.from(h.state.caseContext.compression.values), [180]);
  assert.match(h.state.caseContext.compression.conditions, /motor quente a 90/);
  assert.match(reply, /180 psi em cada cilindro/);
  assert.doesNotMatch(reply, /A medição foi feita com o motor frio/);
  assert.equal(h.state.caseContext.awaiting, 'misfire-compression-reference');
  assert.equal(h.state.caseContext.temperature, 'sempre');
});

test('new cases and changed earlier comparisons cannot reuse old compression readings', async () => {
  const h = harness(golf); await afterCylinderFourInjector(h); await say(h, '180 psi em cada');
  await say(h, 'Corrigindo, troquei as bobinas e a falha mudou para o cilindro 1');
  assert.match(h.state.activeTests[0].id, /^misfire-migration-verify-/);
  assert.doesNotMatch(h.state.messages.at(-1).text, /180 psi/);
  h.startNewCase();
  assert.equal(h.state.caseContext.compression, null);
});

test('an old case recovers the ignored compression value from the mechanic and excludes generated answers', async () => {
  const h = harness(golf); await afterCylinderFourInjector(h); await say(h, '180 em cada');
  const saved = JSON.parse(JSON.stringify(h.buildSessionPayload()));
  delete saved.caseContext.compression;
  saved.caseContext.awaiting = 'misfire-compression-readings';
  saved.messages.at(-1).text = 'Meça a compressão e informe o valor com unidade.';
  const restored = harness(); restored.loadHistoryItem(saved); await restored.flush();
  assert.equal(restored.state.caseContext.awaiting, 'misfire-compression-unit');
  assert.match(await say(restored, 'psi'), /180 psi em cada cilindro/);

  const polluted = JSON.parse(JSON.stringify(saved));
  polluted.messages = polluted.messages.filter(message => message.role !== 'user' || message.text !== '180 em cada');
  polluted.messages.push({ role: 'bot', text: 'Exemplo: 180 psi em cada', at: new Date().toISOString() });
  const clean = harness(); clean.loadHistoryItem(polluted); await clean.flush();
  assert.equal(clean.state.caseContext.compression, null);
  assert.equal(clean.state.caseContext.awaiting, 'misfire-compression-readings');
});

test('a pressure list and a zero reading stay numeric observations without a normality verdict', async () => {
  const h = harness(golf); await afterCylinderFourInjector(h);
  assert.match(await say(h, '180 / 180 / 180 / 0 psi'), /180 \/ 180 \/ 180 \/ 0 psi/);
  assert.deepEqual(Array.from(h.state.caseContext.compression.values), [180, 180, 180, 0]);
  assert.doesNotMatch(h.state.messages.at(-1).text, /motor normal|troque o injetor|mecânica está normal/);
});
