const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
test('frontend IA keeps private credentials outside JS and requires permission',()=>{
 const code=fs.readFileSync(path.join(root,'js/ai-remote.js'),'utf8');
 assert.doesNotMatch(code,/gsk_[A-Za-z0-9]{15,}/);
 const w={confirm:()=>false};
 vm.runInNewContext(code,{window:w,localStorage:{getItem:()=>null,setItem(){}}});
 assert.equal(w.ORACLE_AI.consent(),false);
});
test('frontend IA is loaded after Firebase and before app engine',()=>{
 const html=fs.readFileSync(path.join(root,'app-v134.html'),'utf8');
 const f=html.indexOf('src="./js/firebase.js'),b=html.indexOf('src="./js/ai-remote.js'),app=html.indexOf('src="./js/app.js');
 assert.ok(f>=0&&b>f&&app>b);
 assert.match(html,/IA externa só recebe textos após sua autorização/);
});
test('backend rejects calls without authentication',async()=>{
 const mod=await import('../backend/api/diagnose.mjs');
 const res={setHeader(){},end(x){this.body=JSON.parse(x)},statusCode:0};
 await mod.default({method:'POST',headers:{origin:'https://tsvalencio-ia.github.io'},body:{question:'Falha'}},res);
 assert.ok([401,503].includes(res.statusCode));
});

test('image transfer requires additional specific permission',()=>{
 const code=fs.readFileSync(path.join(root,'js/ai-remote.js'),'utf8');
 const decisions=[];const w={confirm:prompt=>{decisions.push(prompt);return true;}};
 const store=new Map([['thiaguinho_external_ai_consent','yes']]);
 vm.runInNewContext(code,{window:w,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)}});
 assert.equal(w.ORACLE_AI.consentImage(),true);
 assert.equal(decisions.length,1);
 assert.match(decisions[0],/FOTO/);
});
test('frontend keeps vision image out of persisted case data',()=>{
 const app=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
 const start=app.indexOf('function buildSessionPayload()'),end=app.indexOf('function mergeHistory(',start);
 assert.ok(start>0&&end>start);
 assert.doesNotMatch(app.slice(start,end),/imageDataUrl|data:image\/jpeg/);
});
