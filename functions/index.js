"use strict";

const {onRequest}=require("firebase-functions/v2/https");
const {initializeApp}=require("firebase-admin/app");
const {getAuth}=require("firebase-admin/auth");
const zlib=require("node:zlib");

initializeApp();

const KNOWLEDGE_BASE="https://raw.githubusercontent.com/tsvalencio-IA/MECANICO/knowledge/";
const APP_ORIGIN="https://tsvalencio-ia.github.io";
let metaPromise=null;
let recordsPromise=null;
const queryCache=new Map();

function cors(req,res){
  const origin=req.headers.origin||"";
  if(origin===APP_ORIGIN||origin==="http://localhost:5000"||origin==="http://127.0.0.1:5000"){
    res.set("Access-Control-Allow-Origin",origin);
  }
  res.set("Vary","Origin");
  res.set("Access-Control-Allow-Headers","Authorization, Content-Type");
  res.set("Access-Control-Allow-Methods","POST, OPTIONS");
  res.set("Cache-Control","no-store");
}

function norm(v){
  return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
}

function codesFrom(text){
  return Array.from(new Set((String(text||"").toUpperCase().match(/\b(?:P|B|C|U)\d{4}\b|\bDF\d{3,4}\b/g)||[])));
}

function tokensFrom(text){
  const stop=new Set(["para","com","sem","que","uma","uns","das","dos","de","da","do","em","no","na","nos","nas","por","pra","pro","carro","veiculo","veículo","motor","quero","como","qual","quais","esta","está"]);
  return Array.from(new Set(norm(text).split(/[^a-z0-9]+/).filter(t=>t.length>=3&&!stop.has(t)))).slice(0,28);
}

async function getJson(path){
  const r=await fetch(KNOWLEDGE_BASE+path,{headers:{"User-Agent":"thiaguinho-automotive-backend"}});
  if(!r.ok) throw new Error("knowledge "+path+" HTTP "+r.status);
  return r.json();
}

async function loadMeta(){
  if(metaPromise) return metaPromise;
  metaPromise=Promise.all([getJson("manifest.json"),getJson("dtc-index.json")]).then(([manifest,dtcIndex])=>({manifest,dtcIndex}));
  return metaPromise;
}

async function loadRecords(){
  if(recordsPromise) return recordsPromise;
  recordsPromise=(async()=>{
    const {manifest}=await loadMeta();
    const rows=[];
    for(const shard of (manifest.shards||[])){
      const r=await fetch(KNOWLEDGE_BASE+"brain/"+shard.file,{headers:{"User-Agent":"thiaguinho-automotive-backend"}});
      if(!r.ok) throw new Error("knowledge shard "+shard.file+" HTTP "+r.status);
      const compressed=Buffer.from(await r.arrayBuffer());
      const text=zlib.gunzipSync(compressed).toString("utf8");
      for(const line of text.split("\n")){
        if(!line.trim()) continue;
        try{rows.push(JSON.parse(line));}catch(e){}
      }
    }
    return rows;
  })();
  return recordsPromise;
}

function score(rec,ctx){
  const text=norm(rec.text||""),path=norm(rec.path||"");
  let s=0;
  if(ctx.qn&&text.includes(ctx.qn)) s+=35;
  for(const code of ctx.codes){
    const c=norm(code);
    if(text.includes(c)) s+=55;
    if(path.includes(c)) s+=15;
  }
  for(const t of ctx.tokens){
    if(text.includes(t)) s+=5;
    if(path.includes(t)) s+=2;
  }
  for(const t of ctx.vehicleTokens){
    if(text.includes(t)) s+=8;
    if(path.includes(t)) s+=7;
  }
  if(ctx.allowed&&ctx.allowed.has(rec.path)) s+=45;
  if(/fio|pino|terminal|conector|esquema|eletric|chicote|cor\b/.test(ctx.qn)&&/fio|pino|terminal|conector|esquema|eletric|chicote|cor\b/.test(text)) s+=18;
  if(/press|tens|resist|ohm|bar|psi|volt/.test(ctx.qn)&&/press|tens|resist|ohm|bar|psi|volt/.test(text)) s+=15;
  return s;
}

function makeSnippet(text,tokens,codes){
  const raw=String(text||"").replace(/\s+/g," ").trim();
  if(!raw) return "";
  const n=norm(raw);
  let pos=-1;
  for(const needle of [...codes,...tokens]){
    const p=n.indexOf(norm(needle));
    if(p>=0&&(pos<0||p<pos)) pos=p;
  }
  if(pos<0) pos=0;
  const start=Math.max(0,pos-180),end=Math.min(raw.length,start+520);
  return (start>0?"…":"")+raw.slice(start,end)+(end<raw.length?"…":"");
}

async function searchKnowledge(question,vehicle,limit=6){
  const vehicleText=[vehicle.brand,vehicle.model,vehicle.year,vehicle.engine,vehicle.transmission].filter(Boolean).join(" ");
  const key=norm(question+"|"+vehicleText+"|"+limit);
  if(queryCache.has(key)) return queryCache.get(key);

  const [{dtcIndex},records]=await Promise.all([loadMeta(),loadRecords()]);
  const q=question+" "+vehicleText;
  const codes=codesFrom(q);
  const tokens=tokensFrom(q);
  const vehicleTokens=tokensFrom(vehicleText);
  let allowed=null;
  for(const code of codes){
    const paths=dtcIndex[code]||[];
    if(paths.length){
      if(!allowed) allowed=new Set();
      for(const p of paths) allowed.add(p);
    }
  }

  const ctx={qn:norm(question).trim(),codes,tokens,vehicleTokens,allowed};
  const ranked=[];
  for(const rec of records){
    const sc=score(rec,ctx);
    if(sc>0) ranked.push({rec,score:sc});
  }
  ranked.sort((a,b)=>b.score-a.score);

  const seen=new Set(),result=[];
  for(const item of ranked){
    if(result.length>=limit) break;
    const rec=item.rec;
    const id=(rec.path||"")+"|"+(rec.page||"")+"|"+(rec.chunk||"");
    if(seen.has(id)) continue;
    seen.add(id);
    result.push({
      id:"E"+(result.length+1),
      score:item.score,
      sourcePath:rec.path||"",
      page:rec.page||null,
      snippet:makeSnippet(rec.text,tokens,codes),
      extraction:rec.extraction||rec.kind||rec.source_type||null
    });
  }
  queryCache.set(key,result);
  if(queryCache.size>100) queryCache.delete(queryCache.keys().next().value);
  return result;
}

async function verifyUser(req){
  const header=String(req.headers.authorization||"");
  const token=header.startsWith("Bearer ")?header.slice(7):"";
  if(!token) throw Object.assign(new Error("missing auth"),{status:401});
  try{
    return await getAuth().verifyIdToken(token);
  }catch(e){
    throw Object.assign(new Error("invalid auth"),{status:401});
  }
}

function buildDeterministicDiagnosis(question,vehicle,evidence){
  const vehicleText=[vehicle.brand,vehicle.model,vehicle.year,vehicle.engine,vehicle.transmission].filter(Boolean).join(" ");
  if(!evidence.length){
    return {
      ruleId:"backend-no-evidence",
      title:"Ainda não encontrei fonte técnica suficiente para afirmar a causa",
      evidence:"evidência insuficiente",
      score:0,
      dtcs:codesFrom(question).map(code=>({code,label:"código informado"})),
      facts:[],
      remoteEvidence:[],
      hypotheses:[],
      tests:[{
        id:"collect-context",
        title:"Complete o contexto antes de condenar peça",
        procedure:"Confirme marca, modelo, ano, motorização e câmbio. Envie o DTC exato e o sintoma. Se houver scanner, mande também os parâmetros relacionados à falha.",
        good:"dados técnicos completos",
        bad:"ainda faltam dados"
      }],
      warnings:["Sem fonte compatível eu não vou inventar pressão, resistência, torque, pinagem ou cor de fio."]
    };
  }
  return {
    ruleId:"backend-evidence",
    title:"Base técnica encontrada"+(vehicleText?" para o contexto informado":""),
    evidence:"fontes recuperadas no servidor",
    score:evidence[0].score||1,
    dtcs:codesFrom(question).map(code=>({code,label:"código informado"})),
    facts:[],
    remoteEvidence:evidence,
    hypotheses:[],
    tests:[{
      id:"review-evidence",
      title:"Confirme o teste indicado pela fonte",
      procedure:"Use as evidências abaixo como referência. O próximo estágio da IA vai transformar essas fontes em um passo a passo curto sem criar valores que não estejam documentados.",
      good:"fonte compatível confirmada",
      bad:"fonte não corresponde exatamente ao veículo/sistema"
    }],
    warnings:["A resposta desta etapa é recuperação de evidência, ainda sem raciocínio generativo."]
  };
}

exports.knowledgeSearch=onRequest({
  region:"southamerica-east1",
  memory:"1GiB",
  timeoutSeconds:120,
  maxInstances:10
},async(req,res)=>{
  cors(req,res);
  if(req.method==="OPTIONS") return res.status(204).send("");
  if(req.method!=="POST") return res.status(405).json({error:"method_not_allowed"});
  try{
    await verifyUser(req);
    const body=req.body&&typeof req.body==="object"?req.body:{};
    const question=String(body.question||"").trim().slice(0,4000);
    const vehicle=body.vehicle&&typeof body.vehicle==="object"?body.vehicle:{};
    if(!question) return res.status(400).json({error:"question_required"});
    const evidence=await searchKnowledge(question,vehicle,6);
    return res.json({
      ok:true,
      mode:"evidence-only",
      diagnosis:buildDeterministicDiagnosis(question,vehicle,evidence),
      evidenceCount:evidence.length
    });
  }catch(err){
    console.error(err);
    return res.status(err.status||500).json({error:err.status===401?"unauthorized":"backend_error"});
  }
});
