'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../app-v134.html'),'utf8');
const start=app.indexOf('  function initMedia(){');
const end=app.indexOf('  function initVoice(){',start);
assert.ok(start>0&&end>start,'Bloco de mídia encontrado');
const source=app.slice(start,end);

function setup(){
  const elements=new Map();
  const processed=[];
  let opened=null;
  const node=()=>({
    children:[],listeners:{},value:'',textContent:'',files:[],disabled:false,
    replaceChildren(){this.children=[];},
    appendChild(child){this.children.push(child);},
    append(...items){this.children.push(...items);},
    setAttribute(){},
    addEventListener(name,fn){this.listeners[name]=fn;},
    click(){this.listeners.click?.({});}
  });
  const $=id=>{if(!elements.has(id))elements.set(id,node());return elements.get(id);};
  const init=new Function('$','document','URL','openDialog','closeDialog','toast','processMedia',source+'\nreturn initMedia;')(
    $,{createElement:node},{createObjectURL:file=>'blob:'+file.name,revokeObjectURL:()=>{}},
    el=>{opened=el===$('photoBatchDialog')?'batch':'other';},()=>{opened=null;},()=>{},
    async(file,options)=>{processed.push({name:file.name,localOnly:options?.localOnly===true});}
  );
  init();
  return {$,processed,get opened(){return opened;}};
}
const photo=i=>({name:'imagem-'+i+'.jpg',size:10000,type:'image/jpeg',lastModified:i});

test('galeria permite várias fotos sem exigir captura múltipla da câmera',()=>{
  assert.match(html,/<input id="photoInput"[^>]*multiple/);
  assert.match(html,/<input id="photoBatchMoreInput"[^>]*multiple/);
  assert.match(html,/id="photoBatchPreview"/);
  assert.doesNotMatch(html,/<input id="photoCameraInput"[^>]*multiple/);
});
test('miniaturas, remover e acrescentar fotos funcionam antes de analisar',()=>{
  const ui=setup();
  ui.$('photoInput').files=[photo(1),photo(2),photo(3)];
  ui.$('photoInput').listeners.change.call(ui.$('photoInput'));
  assert.equal(ui.opened,'batch');
  assert.equal(ui.$('photoBatchCount').textContent,'3');
  assert.equal(ui.$('photoBatchPreview').children.length,3);
  ui.$('photoBatchPreview').children[0].children[2].click();
  assert.equal(ui.$('photoBatchCount').textContent,'2');
  ui.$('photoBatchMoreInput').files=[photo(4)];
  ui.$('photoBatchMoreInput').listeners.change.call(ui.$('photoBatchMoreInput'));
  assert.equal(ui.$('photoBatchCount').textContent,'3');
  assert.equal(ui.processed.length,0,'Nada deve ser analisado antes de confirmar');
});
test('análise executa todas as fotos do lote em ordem, sem Gemini',async()=>{
  const ui=setup();
  ui.$('photoInput').files=[photo(1),photo(2),photo(3)];
  ui.$('photoInput').listeners.change.call(ui.$('photoInput'));
  await ui.$('confirmPhotoBatchBtn').listeners.click();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(ui.processed.map(x=>x.name),['imagem-1.jpg','imagem-2.jpg','imagem-3.jpg']);
  assert.ok(ui.processed.every(x=>x.localOnly));
});
test('limite de 12 por lote, câmera individual e vídeo individual',async()=>{
  const ui=setup();
  ui.$('photoInput').files=Array.from({length:18},(_,i)=>photo(i+1));
  ui.$('photoInput').listeners.change.call(ui.$('photoInput'));
  assert.equal(ui.$('photoBatchCount').textContent,'12');
  ui.$('cancelPhotoBatchBtn').click();
  assert.equal(ui.$('photoBatchCount').textContent,'0');
  ui.$('photoCameraInput').files=[photo(30)];
  ui.$('photoCameraInput').listeners.change.call(ui.$('photoCameraInput'));
  assert.equal(ui.processed.length,1);
  assert.equal(ui.processed[0].localOnly,false);
});
test('código principal permanece sintaticamente válido',()=>{
  assert.doesNotThrow(()=>new Function(app));
  assert.match(app,/activeMediaTasks/);
});
