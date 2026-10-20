const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/knowledge-remote.js'), 'utf8');
const golf = { brand: 'Volkswagen', model: 'Golf', year: '2014', engine: '1.4 TSI' };

function record(id, text, extra = {}) {
  return { id, text, path: 'Volkswagen/Golf.pdf', page: id, method: 'pdf_text', truth_status: 'source_extracted', confidence: 1, sha256: 'source-hash', ...extra };
}

function harness({ records = {}, dtcs = {}, terms = {}, focus = {}, failures = {}, buckets = {}, revision } = {}) {
  const calls = [], events = [], urls = [];
  const remaining = { ...failures };
  const context = {
    window: { dispatchEvent(event) { events.push(event); } },
    console: { warn() {} }, Date, Map, Set, URL,
    CustomEvent: function (type, options) { this.type = type; this.detail = options.detail; },
    setTimeout() {},
    async fetch(url) {
      urls.push(url);
      const file = new URL(url).pathname.split('/knowledge-compact/')[1];
      calls.push(file);
      if (remaining[file]) { remaining[file]--; throw new Error('transient offline: ' + file); }
      let body;
      if (file === 'manifest.json') body = { mode: 'compact-lexical', heavy_shards_required_by_client: false, records: Object.keys(records).length, source_archive_sha256: 'archive-hash', index_revision: revision, focused_topics: Object.fromEntries(Object.entries(focus).map(([k,v])=>[k,v.length])) };
      else if (file === 'record-map.json') body = Object.fromEntries(Object.keys(records).map(id => [id, buckets[id] || 0]));
      else if (file.startsWith('records/r')) {
        const bucket = Number(file.match(/r(\d+)/)[1]);
        body = Object.fromEntries(Object.entries(records).filter(([id]) => (buckets[id] || 0) === bucket));
      } else if (file.startsWith('dtc/')) body = dtcs[file.slice(4, -5)];
      else if(file.startsWith('focus/')) body = focus[file.slice(6,-5)];
      else if (file.startsWith('terms/')) body = terms;
      if (body === undefined) return { ok: false, status: 404 };
      return { ok: true, async json() { return JSON.parse(JSON.stringify(body)); } };
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { api: context.window.ORACLE_REMOTE_KNOWLEDGE, calls, events, urls };
}

test('rebuilt index revisions change artifact URLs even when the source archive is unchanged', async () => {
  const records = { 1: record(1, 'Golf 1.4 TSI P0301 falha.') };
  for (const revision of ['first-build-revision', 'second-build-revision']) {
    const h = harness({ records, dtcs: { P0301: [1] }, revision });
    assert.equal((await h.api.search('P0301', golf)).length, 1);
    const urls = h.urls.filter(url => !url.includes('manifest.json'));
    assert.ok(urls.length > 0);
    assert.ok(urls.every(url => new URL(url).searchParams.get('v') === revision.slice(0, 20)));
  }
});

test('a DTC window beyond the truncated record preview remains usable and retains its provenance', async () => {
  const records = { 1: record(1, 'Golf 1.4 TSI: introdução do manual, sem códigos no preview.') };
  const direct = { id: 1, path: records[1].path, page: 19, chunk: 2, snippet: 'P0301: falha de combustão no cilindro 1. Verificar as condições registradas.', method: 'ocr', truth_status: 'ocr_unverified', confidence: 0.84, sha256: 'original-source-hash' };
  const h = harness({ records, dtcs: { P0301: { records: [direct] } } });
  const hits = await h.api.search('P0301', golf);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].snippet, direct.snippet);
  assert.equal(hits[0].page, 19);
  assert.equal(hits[0].sourceSha256, direct.sha256);
  assert.equal(hits[0].verified, false);
  assert.match(hits[0].statusLabel, /OCR/);
});

test('DTC postings alone never become evidence when neither preview nor direct window contains that code', async () => {
  const records = { 1: record(1, 'Golf 1.4 TSI P0700: teste de transmissão.') };
  const h = harness({ records, dtcs: { P0301: { records: [{ ...records[1], snippet: 'P0700 teste de estol' }] } } });
  assert.equal((await h.api.search('P0301', golf)).length, 0);
});

test('multiple DTC windows from one record keep the matching code instead of overwriting it', async () => {
  const records = { 1: record(1, 'Golf 1.4 TSI introdução.') };
  const h = harness({ records, dtcs: {
    P0301: { records: [{ ...records[1], snippet: 'P0301 falha no cilindro 1.' }] },
    P0302: { records: [{ ...records[1], snippet: 'Janela sem o código solicitado.' }] }
  } });
  const hits = await h.api.search('P0301 P0302', golf);
  assert.equal(hits.length, 1);
  assert.match(hits[0].snippet, /P0301/);
});

test('a vehicle-only posting cannot answer an unrelated technical question', async () => {
  const records = { 1: record(1, 'Golf 1.4 TSI: teste da transmissão e pressão de linha.') };
  const h = harness({ records, terms: { golf: [1], teste: [1] } });
  assert.equal((await h.api.search('teste sensor borboleta', golf)).length, 0);
  assert.equal((await h.api.search('Golf', golf)).length, 0);
});

test('actual query terms are required even if stale term postings nominate another topic', async () => {
  const records = { 1: record(1, 'Golf 1.4 TSI: ar condicionado e compressor.') };
  const h = harness({ records, terms: { borboleta: [1], golf: [1] } });
  assert.equal((await h.api.search('sensor borboleta', golf)).length, 0);
});

test('a shared component word does not substitute a different sensor for the requested subsystem', async () => {
  const records = {
    1: record(1, 'Golf 1.4 TSI sensor de fase e sincronismo.'),
    2: record(2, 'Golf 1.4 TSI sensor de posição da borboleta.')
  };
  const h = harness({ records, terms: { sensor: [1, 2], borboleta: [2] } });
  assert.deepEqual(Array.from(await h.api.search('teste sensor borboleta', golf), hit => hit.page), [2]);
});

test('a compatible procedure can match without repeating a DTC', async () => {
  const records = { 1: record(1, 'Golf 1.4 TSI: ensaio de estanqueidade do injetor.') };
  const h = harness({ records, terms: { injetor: [1], estanqueidade: [1] } });
  const hits = await h.api.search('injetor estanqueidade vazamento injector internal leakage', golf);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].compatibility.engine, 'matched');
  assert.equal(hits[0].compatibility.year, 'unspecified');
});

test('model names use complete words and do not confuse Gol with Golf or Ka with arbitrary text', async () => {
  const records = {
    1: record(1, 'Golf P0301 falha', { path: 'Volkswagen/Golf.pdf' }),
    2: record(2, 'Ford P0301 falha de kart', { path: 'Ford/Manual.pdf' })
  };
  const h = harness({ records, dtcs: { P0301: [1, 2] } });
  assert.equal((await h.api.search('P0301', { model: 'Gol' })).length, 0);
  assert.equal((await h.api.search('P0301', { model: 'Ka' })).length, 0);
});

test('numeric and multiword models cannot silently match another model', async () => {
  const records = {
    1: record(1, 'Peugeot 308 P0301 falha', { path: 'Peugeot/308.pdf' }),
    2: record(2, 'Fiat Grand Siena P0301 falha', { path: 'Fiat/Grand-Siena.pdf' }),
    3: record(3, 'Fiat Grand Cherokee P0301 falha', { path: 'Jeep/Grand-Cherokee.pdf' })
  };
  const h = harness({ records, dtcs: { P0301: [1, 2, 3] } });
  assert.equal((await h.api.search('P0301', { model: '208' })).length, 0);
  assert.deepEqual(Array.from(await h.api.search('P0301', { model: 'Grand Siena' }), hit => hit.page), [2]);
});

test('source paths can establish the model when a page only contains the actual technical topic', async () => {
  const records = { 1: record(1, 'P0301: falha de combustão no cilindro 1.') };
  const h = harness({ records, dtcs: { P0301: [1] } });
  const hits = await h.api.search('P0301', golf);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].compatibility.model, 'matched');
  assert.equal(hits[0].compatibility.engine, 'unspecified');
});

test('explicit engine conflicts are rejected for DTC searches as well as procedure searches', async () => {
  const records = {
    1: record(1, 'Golf 1.6 MPI P0301: sensor e falha.'),
    2: record(2, 'Golf 1.4 TDI diesel P0301: sensor e falha.'),
    3: record(3, 'Golf 1.4 TSI P0301: sensor e falha.')
  };
  const h = harness({ records, dtcs: { P0301: [1, 2, 3] }, terms: { sensor: [1, 2, 3] } });
  assert.deepEqual(Array.from(await h.api.search('P0301', golf), hit => hit.page), [3]);
  assert.deepEqual(Array.from(await h.api.search('sensor', golf), hit => hit.page), [3]);
});

test('engine codes distinguish K4M from K7M without treating a pressure reading as displacement', async () => {
  const records = {
    1: record(1, 'Duster motor K7M P0301 falha.', { path: 'Renault/Duster.pdf' }),
    2: record(2, 'Duster motor K4M P0301: pressão observada 1.4 bar.', { path: 'Renault/Duster.pdf' })
  };
  const h = harness({ records, dtcs: { P0301: [1, 2] } });
  assert.deepEqual(Array.from(await h.api.search('P0301', { model: 'Duster', engine: '1.6 K4M' }), hit => hit.page), [2]);
});

test('model years outside an explicit application range are rejected', async () => {
  const records = {
    1: record(1, 'Golf 2010 a 2013 1.4 TSI P0301 falha.'),
    2: record(2, 'Golf 2014–2017 1.4 TSI P0301 falha.'),
    3: record(3, 'P0301 falha.', { path: 'Volkswagen/Golf_2018.pdf' })
  };
  const h = harness({ records, dtcs: { P0301: [1, 2, 3] } });
  const hits = await h.api.search('P0301', golf);
  assert.deepEqual(Array.from(hits, hit => hit.page), [2]);
  assert.equal(hits[0].compatibility.year, 'matched');
});

test('a generic matching source does not claim a year or engine it never declares', async () => {
  const records = { 1: record(1, 'P0301 falha no cilindro 1.') };
  const h = harness({ records, dtcs: { P0301: [1] } });
  const hit = (await h.api.search('P0301', golf))[0];
  assert.equal(hit.compatibility.year, 'unspecified');
  assert.equal(hit.compatibility.engine, 'unspecified');
  assert.equal(hit.verified, true); // Extraction status, not a claim about vehicle application.
});

test('archive directory dates and pressure readings do not assert model year or engine displacement', async () => {
  const records = { 1: record(1, 'Golf 1.6 bar: leitura observada no circuito. P0301 falha.', { path: 'archive/2024/Volkswagen/Golf.pdf' }) };
  const h = harness({ records, dtcs: { P0301: [1] } });
  const hits = await h.api.search('P0301', golf);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].compatibility.year, 'unspecified');
  assert.equal(hits[0].compatibility.engine, 'unspecified');
});

test('the compression-stage bilingual query requires compression, without forcing an injector-leak page', async () => {
  const records = { 1: record(1, 'Golf 1.4 TSI: ensaio de compressão dos cilindros.') };
  const h = harness({ records, terms: { compressao: [1], compression: [1] } });
  const hits = await h.api.search('injetor estanqueidade vazamento injector internal leakage compressao compression', golf);
  assert.equal(hits.length, 1);
});

test('a transient manifest failure can recover on the next operation', async () => {
  const records = { 1: record(1, 'Golf 1.4 TSI P0301 falha.') };
  const h = harness({ records, dtcs: { P0301: [1] }, failures: { 'manifest.json': 1 } });
  assert.equal((await h.api.search('P0301', golf)).length, 0);
  assert.equal((await h.api.search('P0301', golf)).length, 1);
  assert.equal(h.calls.filter(file => file === 'manifest.json').length, 2);
  assert.ok(h.events.some(event => event.detail.online === false));
  assert.ok(h.events.some(event => event.detail.online === true));
});

test('a transient record-map failure is retried instead of poisoning all later searches', async () => {
  const records = { 1: record(1, 'Golf 1.4 TSI P0301 falha.') };
  const h = harness({ records, dtcs: { P0301: [1] }, failures: { 'record-map.json': 1 } });
  await assert.rejects(h.api.search('P0301', golf), /transient offline/);
  assert.equal((await h.api.search('P0301', golf)).length, 1);
  assert.equal(h.calls.filter(file => file === 'record-map.json').length, 2);
});

test('a failed search closes its status event and does not cache an invented result', async () => {
  const records = { 1: record(1, 'Golf 1.4 TSI P0301 falha.') };
  const h = harness({ records, dtcs: { P0301: [1] }, failures: { 'dtc/P0301.json': 1 } });
  await assert.rejects(h.api.search('P0301', golf), /transient offline/);
  assert.equal(h.api.status.cachedQueries, 0);
  assert.equal(h.events.at(-1).detail.state, 'end');
  assert.equal((await h.api.search('P0301', golf)).length, 1);
});

test('missing coverage returns no sources rather than borrowing a different code from the same vehicle', async () => {
  const records = { 1: record(1, 'Golf 1.4 TSI P0301 falha.') };
  const h = harness({ records, terms: { golf: [1] } });
  assert.equal((await h.api.search('DF026', golf)).length, 0);
});

test('focus excerpt beyond compact preview retrieves precise Clio sensor data with path, page and SHA',async()=>{
 const model={brand:'Renault',model:'Clio',year:'2003',engine:'1.6 16V K4M'};
 const plain=record(1,'Renault Clio: general introduction '.repeat(170),{
  path:'Renault/Clio_2003_K4M.pdf',page:34
 });
 const realText='Renault Clio 2003 motor K4M circuito do sensor de detonação: comparar chicote com o esquema da ECU.';
 const focus={detonacao:[{
  id:1,path:plain.path,page:34,chunk:2,snippet:realText,
  truth_status:'source_extracted',method:'pdf_text',sha256:'source-hash'
 }]};
 const h=harness({records:{1:plain},focus,terms:{detonacao:[1],clio:[1],sensor:[1]}});
 const result=await h.api.search('1.6 16V K4M circuito do sensor de detonação',model,4);
 assert.equal(result.length,1);
 assert.equal(result[0].page,34);
 assert.equal(result[0].sourcePath,plain.path);
 assert.equal(result[0].truthStatus,'source_extracted');
 assert.equal(result[0].sourceSha256,'source-hash');
 assert.match(result[0].snippet,/sensor de detonação/);
 assert.equal(result[0].compatibility.model,'matched');
 assert.ok(h.calls.includes('focus/detonacao.json'));
});
test('focused search rejects another model or incompatible engine, even if component matches',async()=>{
 const model={brand:'Renault',model:'Clio',year:'2003',engine:'1.6 16V K4M'};
 const focus={canister:[
  {id:11,path:'Renault/Duster_2018_K4M.pdf',page:10,snippet:'Duster 2018 K4M circuito do canister.',truth_status:'source_extracted'},
  {id:12,path:'Renault/Clio_2003_K7M.pdf',page:15,snippet:'Clio 2003 motor K7M circuito do canister.',truth_status:'source_extracted'}
 ]};
 const h=harness({focus});
 assert.equal((await h.api.search('válvula de purga do canister',model)).length,0);
 assert.ok(h.calls.includes('focus/canister.json'));
});
test('focused OCR evidence keeps its unverified label, never becomes authoritative',async()=>{
 const model={brand:'Renault',model:'Clio',engine:'1.6 16V K4M'};
 const h=harness({focus:{lambda:[
  {id:4,path:'Renault/Clio_K4M.pdf',page:3,chunk:1,
   snippet:'Clio motor K4M circuito da sonda lambda anterior.',method:'ocr',
   truth_status:'ocr_unverified',confidence:0.8,sha256:'ocr-source'}
 ]}});
 const r=await h.api.search('sonda lambda dianteira',model,4);
 assert.equal(r.length,1);assert.equal(r[0].verified,false);
 assert.match(r[0].statusLabel,/OCR/);
 assert.equal(r[0].sourceSha256,'ocr-source');
});

test('a table-of-contents page cannot masquerade as a Clio MAP diagnostic procedure',async()=>{
 const vehicle={brand:'Renault',model:'Clio',year:'2003',engine:'1.6 K4M'};
 const fake={
  id:45,path:'Treinamento/Oficina/INJECAO/ind12.htm',page:null,
  snippet:'Índice Megane 1.4: esquema elétrico do Clio. 10)- Como testar sensor de Pressão Absoluta (MAP).',
  truth_status:'source_extracted',method:'html_text'
 };
 const h=harness({focus:{map:[fake]},records:{45:record(45,fake.snippet,{path:fake.path})},
   terms:{clio:[45],sensor:[45],pressao:[45],map:[45]}});
 const out=await h.api.search('sensor de pressão absoluta MAP',vehicle);
 assert.equal(out.length,0);
 assert.ok(h.calls.includes('focus/map.json'));
});
test('a genuine Clio MAP procedure is not excluded by the table-of-contents filter',async()=>{
 const vehicle={brand:'Renault',model:'Clio',year:'2003',engine:'1.6 K4M'};
 const snippet='Renault Clio 2003 K4M: sensor de pressão absoluta MAP. Inspecionar o chicote e conector antes de trocar peças.';
 const source={id:45,path:'Renault/Clio_2003_K4M/procedimento-map.pdf',
   page:8,chunk:1,snippet,truth_status:'source_extracted',method:'pdf_text',sha256:'real-src'};
 const h=harness({focus:{map:[source]}});
 const hits=await h.api.search('sensor MAP pressão absoluta',vehicle);
 assert.equal(hits.length,1);
 assert.equal(hits[0].sourceSha256,'real-src');
 assert.equal(hits[0].compatibility.model,'matched');
 assert.match(hits[0].snippet,/Inspecionar o chicote/);
});
