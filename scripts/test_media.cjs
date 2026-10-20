const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const init = source.slice(source.indexOf('  function initMedia(){'), source.indexOf('\n  function initVoice(){'));

function harness() {
  const elements = {}, picks = [], processed = [];
  const ids = ['photoBtn', 'videoBtn', 'mediaSourceDialog', 'mediaSourceTitle',
    'mediaCameraLabel', 'mediaCameraIcon', 'mediaGalleryHint', 'mediaCameraBtn',
    'mediaGalleryBtn', 'closeMediaSourceBtn', 'photoInput', 'videoInput',
    'photoCameraInput', 'videoCameraInput'];
  for (const id of ids) elements[id] = {
    open: false, textContent: '', value: '', files: [], handlers: {},
    click() { picks.push(id); },
    addEventListener(type, fn) { this.handlers[type] = fn; }
  };
  vm.runInNewContext(init + '\ninitMedia();', {
    $: id => elements[id],
    openDialog: el => { el.open = true; },
    closeDialog: el => { el.open = false; },
    processMedia: file => processed.push(file)
  });
  return {
    elements, picks, processed,
    click: id => elements[id].handlers.click.call(elements[id]),
    change(id, file) {
      const input = elements[id];
      input.files = file ? [file] : [];
      input.value = file ? file.name : '';
      input.handlers.change.call(input);
    }
  };
}

test('camera and gallery are distinct inputs with the correct media type', () => {
  const html = fs.readFileSync(path.join(root, 'app-v134.html'), 'utf8');
  for (const kind of ['photo', 'video']) {
    for (const camera of [false, true]) {
      const id = kind + (camera ? 'CameraInput' : 'Input');
      const tag = html.match(new RegExp('<input\\b[^>]*\\bid="' + id + '"[^>]*>'));
      assert.ok(tag, id);
      assert.match(tag[0], /type="file"/);
      assert.ok(tag[0].includes('accept="' + (kind === 'photo' ? 'image/*' : 'video/*') + '"'));
      assert.equal(/\bcapture\s*=/.test(tag[0]), camera, id);
    }
  }
  assert.match(html, /id="mediaSourceDialog"[^>]*aria-labelledby="mediaSourceTitle"/);
  assert.match(html, /Escolher da galeria/);
});

for (const kind of ['photo', 'video']) {
  test(`${kind}: show an explicit choice before opening any picker`, () => {
    const h = harness();
    h.click(kind + 'Btn');
    assert.equal(h.elements.mediaSourceDialog.open, true);
    assert.equal(h.elements.mediaCameraLabel.textContent, kind === 'photo' ? 'Tirar foto' : 'Gravar vídeo');
    assert.deepEqual(h.picks, []);
    h.click('closeMediaSourceBtn');
    assert.equal(h.elements.mediaSourceDialog.open, false);
    assert.deepEqual(h.picks, []);
    assert.deepEqual(h.processed, []);
  });

  for (const camera of [false, true]) {
    test(`${kind}: ${camera ? 'camera' : 'gallery'} opens only the selected source`, () => {
      const h = harness(), input = kind + (camera ? 'CameraInput' : 'Input');
      h.click(kind + 'Btn');
      h.click(camera ? 'mediaCameraBtn' : 'mediaGalleryBtn');
      assert.deepEqual(h.picks, [input]);
      assert.equal(h.elements.mediaSourceDialog.open, false);
      const file = { name: kind === 'photo' ? 'scanner.jpg' : 'scanner.mp4' };
      h.change(input, file);
      h.change(input, file);
      assert.deepEqual(h.processed, [file, file]);
      assert.equal(h.elements[input].value, '');
      h.change(input, null);
      assert.equal(h.processed.length, 2);
    });
  }
}

test('switching from video to photo does not keep the previous picker type', () => {
  const h = harness();
  h.click('videoBtn');
  h.click('closeMediaSourceBtn');
  h.click('photoBtn');
  h.click('mediaCameraBtn');
  assert.deepEqual(h.picks, ['photoCameraInput']);
});

test('numeric PDL5500 scanner rows are preserved without inventing P/DF codes', () => {
  const w = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/media.js'), 'utf8'), {window:w});
  const source = '2003 Renault Clio II 1.6 K4M\n12 Circuito do sensor de detonação\n08 Sensor de pressão absoluta do coletor do circuito\n13 Circuito do sensor de Lambda dianteiro com defeito\n99 Circuito da válvula de purga do cânister Circuito de controle aberto\n99 Circuito da válvula de purga do cânister';
  const rows = w.ORACLE_MEDIA.scannerRows(source);
  assert.deepEqual(Array.from(rows, x => x.id), ['12','08','13','99','99']);
  assert.match(rows[0].description, /detonação/);
  assert.match(rows[3].description, /controle aberto/);
  assert.deepEqual(Array.from(w.ORACLE_MEDIA.detectCodes(source)),[]);
  assert.ok(rows.every(x=>x.verified===false));
});

test('scanner identifiers and unrelated measurements never become generic DTCs', () => {
  const w = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/media.js'), 'utf8'), {window:w});
  assert.equal(w.ORACLE_MEDIA.scannerRows('Motor 2003 com 12 volts e 99 graus').length,0);
  assert.deepEqual(Array.from(w.ORACLE_MEDIA.detectCodes('P0301 e DF026')),['P0301','DF026']);
});

test('multi-pass OCR accepts rows from separate crops without inventing DTCs',()=>{
 const w={};
 vm.runInNewContext(fs.readFileSync(path.join(root,'js/media.js'),'utf8'),{window:w});
 const reading=[
 '2003 Renault Clio II K4M 12 Circuito do sensor de detonação',
 '08 Sensor de pressão absoluta do coletor 13 Circuito do sensor de Lambda com defeito',
 '99 Circuito da válvula de purga do cânister Circuito de controle aberto 99 Circuito da válvula de purga do cânister'
 ];
 const rows=w.ORACLE_MEDIA.mergeScannerReadings(reading);
 assert.deepEqual(Array.from(rows,r=>r.id),['12','08','13','99','99']);
 assert.equal(rows.filter(r=>r.id==='99').length,2);
 assert.ok(rows.every(r=>r.verified===false));
 assert.deepEqual(Array.from(w.ORACLE_MEDIA.detectCodes(reading.join(' '))),[]);
});
test('multi-pass OCR does not convert fragmented digits into confirmed numeric codes',()=>{
 const w={};vm.runInNewContext(fs.readFileSync(path.join(root,'js/media.js'),'utf8'),{window:w});
 const rows=w.ORACLE_MEDIA.mergeScannerReadings(['6 Circuito válvula de purga','6 Circuito válvula de purga']);
 assert.equal(rows.length,1);
 assert.equal(rows[0].id,'6');
 assert.equal(rows[0].confidence,'low');
});

test('image OCR reuses one worker for regional rereads and releases it',async()=>{
 const responses=[
  '6 Circuito válvula de purga',
  '12 Circuito do sensor de detonação 08 Sensor de pressão absoluta do coletor',
  '13 Circuito do sensor de Lambda dianteiro com defeito 99 Circuito de controle aberto da válvula purga do canister'
 ];
 let calls=0,terminated=0,revoked=0,created=0;
 const fakeCtx={
  drawImage(){},putImageData(){},
  getImageData(){return {data:new Uint8ClampedArray(4*48*48)};}
 };
 const makeCanvas=()=>({width:48,height:48,getContext:()=>fakeCtx});
 const doc={createElement:()=>makeCanvas()};
 function Image(){this.naturalWidth=48;this.naturalHeight=48;this.width=48;this.height=48;}
 Object.defineProperty(Image.prototype,'src',{set(){this.onload();}});
 const W={
  Tesseract:{createWorker:async()=>{created++;return {
   recognize:async()=>({data:{text:responses[calls++]||''}}),
   terminate:async()=>{terminated++;}
  };}}
 };
 const ctx={
  window:W,Tesseract:W.Tesseract,document:doc,Image,Uint8ClampedArray,Uint32Array,Float32Array,
  URL:{createObjectURL:()=>'blob:local',revokeObjectURL:()=>{revoked++;}}
 };
 vm.runInNewContext(fs.readFileSync(path.join(root,'js/media.js'),'utf8'),ctx);
 const file={type:'image/jpeg'};
 const result=await W.ORACLE_MEDIA.analyzeFile(file);
 assert.equal(calls,3);assert.equal(result.ocrPasses,3);
 assert.equal(created,1);assert.equal(terminated,1);assert.equal(revoked,1);
 assert.deepEqual(Array.from(result.scannerRows,r=>r.id),['6','12','08','13','99']);
 assert.ok(result.scannerRows.every(r=>r.verified===false));
});
