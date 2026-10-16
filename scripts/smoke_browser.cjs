const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const baseURL = process.env.MECANICO_SMOKE_URL || 'http://127.0.0.1:8000/MECANICO/';
if (!['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) throw new Error('Use a local development server for this synthetic smoke test');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(25000);
    const errors = [], failures = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('requestfailed', r => {
      if (!r.url().includes('/firebasejs/')) failures.push({ host: new URL(r.url()).host, error: r.failure().errorText });
    });
    // Keep synthetic diagnoses local; do not create anonymous production users or cases.
    await page.route('https://www.gstatic.com/firebasejs/**', route => route.abort());
    if (process.env.MECANICO_KNOWLEDGE_DIR) {
      const directory = path.resolve(process.env.MECANICO_KNOWLEDGE_DIR);
      await page.route('https://raw.githubusercontent.com/tsvalencio-IA/MECANICO/knowledge-compact/**', async route => {
        const name = decodeURIComponent(new URL(route.request().url()).pathname.split('/knowledge-compact/')[1]);
        const file = path.resolve(directory, name);
        assert.ok(file.startsWith(directory + path.sep));
        try {
          await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: await fs.readFile(file) });
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          await route.fulfill({ status: 404, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{}' });
        }
      });
    }

    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#chatInput');
    await page.waitForFunction(() => window.ORACLE_MEDIA && window.ORACLE_REMOTE_KNOWLEDGE && window.Tesseract);
    assert.equal(new URL(page.url()).pathname, '/MECANICO/app-v134.html');
    const sw = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.ready;
      return { scope: new URL(r.scope).pathname, active: !!r.active };
    });
    assert.deepEqual(sw, { scope: '/MECANICO/', active: true });

    await page.locator('#chatInput').fill('Golf 2014 1.4 TSI automático, código P0303, falha o tempo todo');
    await page.locator('#chatInput').press('Enter');
    await page.locator('[data-test-result="single"]:not([disabled])').last().waitFor();
    await page.locator('[data-test-result="single"]:not([disabled])').last().click();
    await page.locator('[data-test-result="stayed"]:not([disabled])').last().waitFor();
    await page.locator('[data-test-result="stayed"]:not([disabled])').last().click();
    await page.waitForFunction(() => document.querySelector('#messages').textContent.includes('vela'));
    await page.locator('#chatInput').fill('Corrigindo, troquei as bobinas e a falha mudou para o cilindro 1');
    await page.locator('#chatInput').press('Enter');
    await page.locator('[data-test-result="confirmed"]:not([disabled])').last().waitFor();
    const text = await page.locator('#messages').innerText();
    assert.match(text, /cilindro 3[\s\S]*cilindro 1/);
    const history = await page.evaluate(() => JSON.parse(localStorage.getItem('thiaguinho_history') || '[]'));
    assert.ok(history.length > 0, 'local history persisted');
    await page.locator('#historyBtn').click();
    assert.ok(await page.locator('#historyDialog').isVisible());
    assert.match(await page.locator('#historyList').innerText(), /P0303/);
    await page.locator('#closeHistoryBtn').click();
    await page.locator('#photoBtn').click();
    assert.ok(await page.locator('#mediaSourceDialog').isVisible());
    await page.locator('#closeMediaSourceBtn').click();
    assert.equal(await page.locator('input[type=password]').count(), 0, 'public access has no password gate');
    console.log(JSON.stringify({ check: 'browser-workflow', passed: true, serviceWorker: sw, localHistoryCases: history.length, pageErrors: errors }));
    assert.equal(errors.length, 0);

    async function say(text, expected) {
      await page.locator('#chatInput').fill(text);
      await page.locator('#chatInput').press('Enter');
      await page.waitForFunction(pattern => {
        const last = document.querySelector('#messages .message.bot:last-child');
        return last && !last.classList.contains('typing') && new RegExp(pattern, 'i').test(last.textContent);
      }, expected);
    }
    await page.locator('#newCaseBtn').click();
    await say('O motor está falhando. Quero começar o diagnóstico sem trocar peça no chute.', 'frio');
    await say('A falha acontece o tempo todo.', 'sem código');
    await say('p304', 'P0304');
    await say('P0304', 'Confirmar a falha no cilindro 4');
    await page.locator('[data-test-result="single"]:not([disabled])').last().click();
    await page.locator('[data-test-result="stayed"]:not([disabled])').last().click();
    await page.waitForFunction(() => document.querySelector('#messages .message.bot:last-child')?.textContent.includes('Agora confira a vela'));
    await say('seca', 'Comparar a vela do cilindro 4');
    await page.locator('[data-test-result="stayed"]:not([disabled])').last().click();
    await page.locator('[data-test-result="sealed"]:not([disabled])').last().click();
    await page.waitForFunction(() => document.querySelector('#messages .message.bot:last-child')?.textContent.includes('próximo passo é medir a compressão'));
    await say('180 em cada', 'psi, bar ou kPa');
    const unitQuestion = await page.locator('#messages .message.bot').last().innerText();
    assert.match(unitQuestion, /180/);
    assert.doesNotMatch(unitQuestion, /próximo passo é medir a compressão|após comparar bobina e vela/);
    await say('PSI', '180 psi em cada cilindro');
    await say('Motor aquecido, seguindo o procedimento do ensaio', 'Condições informadas');
    const compression = await page.evaluate(() => JSON.parse(localStorage.getItem('thiaguinho_history')).find(row => row.caseContext?.compression)?.caseContext);
    assert.equal(compression.compression.unit, 'psi');
    assert.equal(compression.temperature, 'sempre');
    console.log(JSON.stringify({ check: 'pasted-compression-conversation', passed: true, reading: compression.compression.values, unit: compression.compression.unit }));

    await page.locator('#newCaseBtn').click();
    await say('O carro não pega. Me guie pelo diagnóstico passo a passo.', 'motor gira ou nem gira');
    await say('O motor não gira ao tentar ligar.', 'algum clique');
    await say('Dá clique', 'tensão aparece antes e durante');
    await say('12V', 'Os 12 V foram medidos antes');
    await say('P35', 'DTC incompleto');
    await say('1214', 'não identifica uma tensão');
    await say('SADAS', 'Não consegui identificar um resultado');
    const partialBattery = await page.locator('#messages .message.bot').last().innerText();
    assert.match(partialBattery, /Os 12 V foram medidos antes/);
    assert.doesNotMatch(partialBattery, /Envie o código de identificação do motor ou o esquema/);
    await say('Antes da tentativa', 'menor tensão');
    await say('10 V durante', 'terminais da bateria');
    await say('Terminais firmes, sem oxidação', 'código de identificação do motor');
    await say('CHPA', 'O código foi registrado');
    assert.match(await page.locator('#messages .message.bot').last().innerText(), /Código de motor informado: CHPA/);
    await say('Não tenho a referência', 'diagnóstico fica pendente');
    const starting = await page.evaluate(() => JSON.parse(localStorage.getItem('thiaguinho_history')).find(row => row.caseContext?.engineCode === 'CHPA')?.caseContext);
    assert.equal(starting.startingBattery.before, 12);
    assert.equal(starting.startingBattery.during, 10);
    assert.equal(starting.startingBattery.pending, null);
    assert.equal(starting.starterConnections, 'firm');
    assert.equal(starting.noStartReference.status, 'unavailable');
    assert.equal(starting.dtcs.length, 0, 'incomplete code and arbitrary text do not invent a DTC');
    console.log(JSON.stringify({ check: 'pasted-no-start-conversation', passed: true, battery: { before: starting.startingBattery.before, during: starting.startingBattery.during }, reference: starting.noStartReference.status }));

    await page.locator('#newCaseBtn').click();
    await say('O motor gira mas não pega', 'RPM');
    await say('0 RPM', 'continua comunicando');
    await say('Não comunica normalmente', 'comunicação cai');
    const noStart = await page.locator('#messages .message.bot').last().innerText();
    assert.doesNotMatch(noStart, /A ECU comunica, mas/);
    await page.locator('#newCaseBtn').click();
    await say('Está falhando a quente', 'sem código');
    await say('Sem código', 'marcha lenta');
    await say('Em marcha lenta, STFT +15% e LTFT +10%', 'Dados registrados');
    console.log(JSON.stringify({ check: 'diagnostic-regressions', passed: true, scenarios: ['zero-RPM/communication-denied', 'misfire-without-DTC'] }));

    const metadata = await page.evaluate(() => ORACLE_REMOTE_KNOWLEDGE.metadata());
    assert.equal(metadata.mode, 'compact-lexical');
    assert.ok(metadata.records > 1000);
    const results = await page.evaluate(() => ORACLE_REMOTE_KNOWLEDGE.search('correia dentada', { brand: 'Volkswagen', model: 'Golf' }, 3));
    console.log(JSON.stringify({ check: 'remote-knowledge', index: process.env.MECANICO_KNOWLEDGE_DIR ? 'locally-rebuilt' : 'published', records: metadata.records, dtcs: metadata.dtcs, results: results.length, sources: results.slice(0, 2).map(r => ({ path: r.sourcePath, page: r.page, verified: r.verified })) }));
    assert.ok(results.length > 0, 'remote query returns evidence');

    const ocr = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1200; canvas.height = 240;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000000'; ctx.font = 'bold 100px monospace'; ctx.fillText('DTC P0303', 70, 150);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const result = await ORACLE_MEDIA.analyzeFile(new File([blob], 'scanner-smoke.png', { type: 'image/png' }));
      return { result, candidates: ORACLE_MEDIA.codeCandidates(result.text), png: canvas.toDataURL('image/png').split(',')[1] };
    });
    assert.ok(ocr.result.codes.includes('P0303') || ocr.candidates.includes('P0303'), 'OCR reads the DTC or requests its explicit confirmation');
    await page.locator('#newCaseBtn').click();
    await page.locator('#photoInput').setInputFiles({ name: 'scanner-smoke.png', mimeType: 'image/png', buffer: Buffer.from(ocr.png, 'base64') });
    await page.waitForFunction(() => /Você confirma o código P0303|P0303 — Falha de combustão cilindro 3/.test(document.querySelector('#messages').textContent), null, { timeout: 60000 });
    const confirm = page.getByRole('button', { name: 'Confirmar P0303', exact: true });
    const confirmationRequired = await confirm.count() > 0;
    if (confirmationRequired) await confirm.click();
    await page.waitForFunction(() => document.querySelector('#messages').textContent.includes('P0303 — Falha de combustão cilindro 3'));
    console.log(JSON.stringify({ check: 'real-ocr', passed: true, readText: ocr.result.text, codes: ocr.result.codes, candidates: ocr.candidates, confirmationRequired, languages: 'por+eng', failures }));
    assert.equal(failures.length, 0);
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
