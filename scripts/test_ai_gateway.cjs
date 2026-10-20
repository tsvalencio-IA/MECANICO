const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const code=fs.readFileSync(path.join(root,"js/ai-local.js"),"utf8");
function load(w){vm.runInNewContext(code,{window:w});return w.ORACLE_AI;}
test("IA local is free by architecture: no network endpoint or API key",()=>{
 assert.doesNotMatch(code,/https?:\/\//);
 assert.doesNotMatch(code,/fetch\(|XMLHttpRequest|WebSocket|Authorization|Bearer|GROQ_|API_KEY/);
 assert.doesNotMatch(code,/vercel|groq|gemini-api|openai\.com/i);
 const html=fs.readFileSync(path.join(root,"app-v134.html"),"utf8");
 assert.doesNotMatch(html,/src="\.\/js\/ai-remote\.js/);
 assert.ok(html.includes("src=\"./js/ai-local.js"));
});
test("unsupported browsers do not simulate an AI response",async()=>{
 const ai=load({});
 assert.equal(await ai.ready(),false);
 const answer=await ai.analyze({question:"teste"});
 assert.equal(answer.available,false);
 assert.match(ai.takeUnavailableNotice(),/não disponibilizou uma configuração executável/);
 assert.equal(ai.takeUnavailableNotice(),"");
});
test("model download is opt-in and cancelling keeps diagnosis free",async()=>{
 const w={LanguageModel:{availability:async()=> "downloadable",create:()=>{throw Error("should not create")}},confirm:()=>false};
 const ai=load(w);
 assert.equal(await ai.ready(),true);
 const r=await ai.analyze({question:"Falha motor"});
 assert.equal(r.available,false);
 assert.equal(r.declined,true);
});
test("on-device text generation uses no remote calls and destroys model session",async()=>{
 let created=0,destroyed=0,asked=0;
 const w={LanguageModel:{availability:async()=>"available",create:async()=>{created++;return {prompt:async()=>"Inspect power and ground before replacing the component.",destroy:()=>destroyed++};}}};
 const ai=load(w);
 const r=await ai.analyze({question:"Falha motor",vehicle:{brand:"Renault",model:"Clio"},evidence:[]});
 assert.equal(r.available,true);
 assert.equal(r.vision,false);
 assert.equal(created,1);assert.equal(destroyed,1);
 assert.match(r.answer,/Inspect power/);
});
test("on-device image generation reads actual image without persisting it",async()=>{
 let received=null;
 const image={type:"image/jpeg"};
 const w={LanguageModel:{availability:async()=>"available",create:async()=>({prompt:async x=>{received=x;return "There are 5 scanner entries.";},destroy(){}})}};
 const ai=load(w);
 const r=await ai.analyze({imageFile:image,question:"Scanner"});
 assert.equal(r.vision,true);
 assert.equal(received[0].content[1].value,image);
 const app=fs.readFileSync(path.join(root,"js/app.js"),"utf8");
 const start=app.indexOf("function buildSessionPayload()"),end=app.indexOf("function mergeHistory(",start);
 assert.ok(start>0&&end>start);
 assert.doesNotMatch(app.slice(start,end),/imageFile|data:image\/jpeg/);
});
test("browser local translation supports real Portuguese output",async()=>{
 const calls=[];
 const w={LanguageModel:{availability:async()=>"available",create:async()=>({prompt:async()=> "Inspect the electrical circuit.",destroy(){}})},Translator:{availability:async()=> "available",create:async({sourceLanguage,targetLanguage})=>({translate:async t=>{calls.push([sourceLanguage,targetLanguage]);return sourceLanguage==="en"?"Verifique o circuito elétrico.":t;},destroy(){}})}};
 const out=await load(w).analyze({question:"verifique circuito"});
 assert.equal(out.translationAvailable,true);
 assert.match(out.answer,/Verifique/);
 assert.ok(calls.some(x=>x[0]==="en"&&x[1]==="pt"));
});
test("frontend loading order respects existing Firebase/media and PWA",()=>{
 const html=fs.readFileSync(path.join(root,"app-v134.html"),"utf8");
 const firebase=html.indexOf('src="./js/firebase.js'),media=html.indexOf('src="./js/media.js'),ai=html.indexOf('src="./js/ai-local.js'),app=html.indexOf('src="./js/app.js');
 assert.ok(firebase>=0&&media>firebase&&ai>media&&app>ai);
});
test("backend retained for possible future opt-in but never called by frontend",async()=>{
 const mod=await import("../backend/api/diagnose.mjs");
 const res={setHeader(){},end(s){this.body=JSON.parse(s);},statusCode:0};
 await mod.default({method:"POST",headers:{origin:"https://tsvalencio-ia.github.io"},body:{question:"Falha"}},res);
 assert.ok([401,503].includes(res.statusCode));
});
test('Gemini free bridge has no API key and does not call when no free project configured',async()=>{
 const code=fs.readFileSync(path.join(root,'js/ai-gemini.js'),'utf8');
 assert.doesNotMatch(code,/AIza[A-Za-z0-9_-]{25,}|x-goog-api-key|GEMINI_API_KEY|ai-gateway\.vercel\.sh/);
 const win={};
 vm.runInNewContext(code,{window:win,fetch:async()=>({ok:true,json:async()=>({ready:false,mode:'free-tier-only'})}),Date,AbortSignal});
 assert.equal(await win.ORACLE_GEMINI.ready(),false);
});
test('Gemini text and image each require user permission',()=>{
 const code=fs.readFileSync(path.join(root,'js/ai-gemini.js'),'utf8');
 const calls=[];
 const w={confirm:msg=>{calls.push(msg);return true;}};
 const store={};
 vm.runInNewContext(code,{window:w,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}}});
 assert.equal(w.ORACLE_GEMINI.consentText(),true);
 assert.equal(w.ORACLE_GEMINI.consentImage(),true);
 assert.equal(calls.length,2);
 assert.match(calls[0],/melhorar seus produtos/);
 assert.match(calls[1],/DESTA fotografia/);
});
test('Gemini photo is sent only to protected endpoint and not persisted',()=>{
 const html=fs.readFileSync(path.join(root,'app-v134.html'),'utf8');
 const f=html.indexOf('src="./js/firebase.js'),g=html.indexOf('src="./js/ai-gemini.js'),a=html.indexOf('src="./js/app.js');
 assert.ok(f>=0&&g>f&&a>g);
 const app=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
 const start=app.indexOf('function buildSessionPayload()'),end=app.indexOf('function mergeHistory(',start);
 assert.ok(start>=0&&end>start);
 assert.doesNotMatch(app.slice(start,end),/imageDataUrl/);
 assert.match(app,/ORACLE_GEMINI\.consentText\(\)&&ORACLE_GEMINI\.consentImage\(\)/);
});
test('Gemini backend is free-tier only with no paid AI Gateway fallback',()=>{
 const content=fs.readFileSync(path.join(root,'backend/api/diagnose.mjs'),'utf8');
 assert.match(content,/const MODELS=\["gemini-3\.8-flash","gemini-3\.5-flash-lite"\]/);
 assert.match(content,/process\.env\.GEMINI_API_KEY/);
 assert.doesNotMatch(content,/ai-gateway\.vercel\.sh|api\.groq\.com|GROQ_API_KEY/);
 assert.match(content,/inline_data/);
 assert.match(content,/firebaseUser\(auth\.slice\(7\)\)/);
});

test('new-project model compatibility: 404 only falls back to another free model',async()=>{
 const {generateKeyPairSync,sign}=require('node:crypto');
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const b64=t=>Buffer.from(typeof t==='string'?t:JSON.stringify(t)).toString('base64url');
 const epoch=Math.floor(Date.now()/1000);
 const head=b64({alg:'RS256',typ:'JWT',kid:'local-test'});
 const data=b64({aud:'mecanico-b222e',iss:'https://securetoken.google.com/mecanico-b222e',sub:'test-anon-user',iat:epoch-10,exp:epoch+3600});
 const raw=head+'.'+data;const signature=sign('RSA-SHA256',Buffer.from(raw),privateKey).toString('base64url');
 const token=raw+'.'+signature;
 const oldFetch=global.fetch,oldEnv=process.env.GEMINI_API_KEY;
 const calls=[];process.env.GEMINI_API_KEY='TEST-ONLY-NOT-REAL';
 global.fetch=async(url,opts)=>{
   const addr=String(url);
   if(addr.includes('service_accounts/v1/jwk/'))return {ok:true,json:async()=>({keys:[{...publicKey.export({format:'jwk'}),kid:'local-test'}]})};
   calls.push(addr);
   if(addr.includes('gemini-3.8-flash'))return {ok:false,status:404,json:async()=>({error:{status:'NOT_FOUND'}})};
   if(addr.includes('gemini-3.5-flash-lite'))return {ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:'Confirmar códigos numéricos pelo scanner, sem inventar DTC.'}]}}]})};
   throw Error('Unexpected network destination');
 };
 try{
  const mod=await import('../backend/api/diagnose.mjs');
  const res={statusCode:0,setHeader(){},end(s){this.body=JSON.parse(s)}};
  await mod.default({method:'POST',headers:{origin:'https://tsvalencio-ia.github.io',authorization:'Bearer '+token},body:{question:'Clio falhando',vehicle:{brand:'Renault',model:'Clio'}}},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.model,'gemini-3.5-flash-lite');
  assert.equal(calls.length,2);
 }finally{global.fetch=oldFetch;if(oldEnv===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldEnv;}
});

test('Gemini 503 switches once to the free Lite model without paid gateway',async()=>{
 const {generateKeyPairSync,sign}=require('node:crypto');
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const epoch=Math.floor(Date.now()/1000),header=enc({alg:'RS256',kid:'fallback-test'}),body=enc({aud:'mecanico-b222e',iss:'https://securetoken.google.com/mecanico-b222e',sub:'mock',iat:epoch-1,exp:epoch+2000});
 const signed=header+'.'+body;const token=signed+'.'+sign('RSA-SHA256',Buffer.from(signed),privateKey).toString('base64url');
 const original=global.fetch,old=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='TEST-NO-REAL-CREDENTIAL';
 const calls=[];
 global.fetch=async(url)=>{
  const u=String(url);
  if(u.includes('service_accounts/v1/jwk'))return {ok:true,json:async()=>({keys:[{...publicKey.export({format:'jwk'}),kid:'fallback-test'}]})};
  calls.push(u);
  if(u.includes('gemini-3.8-flash'))return {ok:false,status:503,json:async()=>({error:{status:'UNAVAILABLE'}})};
  if(u.includes('gemini-3.5-flash-lite'))return {ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:'Resultado do scanner: não converter identificadores sem confirmar tabela.'}]}}]})};
  throw Error('Unexpected network call');
 };
 try{
  const mod=await import('../backend/api/diagnose.mjs?fallback-503-fixture');
  const response={statusCode:0,setHeader(){},end(s){this.body=JSON.parse(s)}};
  await mod.default({method:'POST',headers:{origin:'https://tsvalencio-ia.github.io',authorization:'Bearer '+token},body:{question:'Registro do Clio',visionRows:[{id:'99',description:'Circuito do cânister'}]}},response);
  assert.equal(response.statusCode,200);
  assert.equal(response.body.model,'gemini-3.5-flash-lite');
  assert.equal(calls.length,2);
 }finally{global.fetch=original;if(old===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=old;}
});
test('Gemini policies never seed a known screenshot with specific numeric scanner rows',()=>{
 const source=fs.readFileSync(path.join(root,'backend/api/diagnose.mjs'),'utf8');
 assert.doesNotMatch(source,/12\/08\/13\/99\/99/);
 assert.match(source,/visionRows/);
 assert.match(source,/origin:"ai_visual_unverified"/);
});

test('Gemini vision rows are parsed only from model reply, never seeded by fixed code list',()=>{
 const code=fs.readFileSync(path.join(root,'js/ai-gemini.js'),'utf8');
 const w={};
 vm.runInNewContext(code,{window:w});
 const reply='1) Observações:\n* **12**: "Circuito do sensor de detonação"\n* **08**: "Sensor de pressão absoluta do coletor"\n* **99**: "Circuito da válvula de purga do cânister"\n* **99**: "Circuito da válvula de purga do cânister Circuito aberto"';
 const out=w.ORACLE_GEMINI.extractVisionRows(reply);
 assert.deepEqual(Array.from(out,r=>r.id),['12','08','99','99']);
 assert.equal(out.every(r=>r.confirmed===false),true);
 assert.equal(w.ORACLE_GEMINI.extractVisionRows('1) Observações\n2) Hipóteses\n3) Próximo teste').length,0);
});
