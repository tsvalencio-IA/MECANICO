import http from 'node:http';
import {createVerify} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {loadKnowledge, findEvidence, buildInstruction, replyText} from './core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = {
  port: Number(process.env.PORT || 8787),
  key: process.env.OPENAI_API_KEY || '',
  model: process.env.OPENAI_MODEL || 'gpt-6.1-terra',
  firebaseProject: 'mecanico-b222e',
  uids: new Set((process.env.AUTHORIZED_FIREBASE_UIDS || '').split(',').map(s=>s.trim()).filter(Boolean)),
  origins: new Set((process.env.ALLOWED_ORIGINS || 'https://tsvalencio-ia.github.io,http://localhost:8000,http://127.0.0.1:8000').split(',').map(s=>s.trim()).filter(Boolean)),
  knowledgeDir: process.env.MECANICO_PRIVATE_KNOWLEDGE_DIR || path.join(HERE,'private')
};
const knowledge = loadKnowledge(CONFIG.knowledgeDir);
const rate = new Map();
let certCache = {expires:0, certs:{}};
function send(res,status,body,origin) {
  res.writeHead(status, {
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
    'Vary':'Origin',
    ...(origin && CONFIG.origins.has(origin) ? {'Access-Control-Allow-Origin':origin}: {})
  });
  res.end(JSON.stringify(body));
}
async function fetchCerts() {
  if (Date.now()<certCache.expires) return certCache.certs;
  const r = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com', {signal:AbortSignal.timeout(7000)});
  if (!r.ok) throw Error('Certificados indisponíveis');
  const certs = await r.json();
  const sec = Number((r.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1] || 600);
  certCache = {certs,expires:Date.now()+Math.max(60,Math.min(sec,3600))*1000};
  return certs;
}
function parseJWTPart(part) {return JSON.parse(Buffer.from(part,'base64url').toString('utf8'));}
async function verifyFirebaseToken(raw) {
  if (!raw || raw.length > 5000) throw Error('Token inválido');
  const p = raw.split('.'); if (p.length !== 3) throw Error('Token inválido');
  const header = parseJWTPart(p[0]), claims = parseJWTPart(p[1]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw Error('Assinatura inválida');
  const t = Math.floor(Date.now()/1000);
  if (!Number.isInteger(claims.exp) || claims.exp<=t || !Number.isInteger(claims.iat) || claims.iat>t ||
      !Number.isInteger(claims.auth_time) || claims.auth_time>t ||
      claims.aud!==CONFIG.firebaseProject || claims.iss!==`https://securetoken.google.com/${CONFIG.firebaseProject}` ||
      typeof claims.sub!=='string' || claims.sub.length===0 || claims.sub.length>128) throw Error('Credenciais não válidas');
  const cert = (await fetchCerts())[header.kid];
  if (!cert) throw Error('Chave pública não encontrada');
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${p[0]}.${p[1]}`); verifier.end();
  if (!verifier.verify(cert, Buffer.from(p[2],'base64url'))) throw Error('Assinatura incorreta');
  return claims.sub;
}
function cappedRead(req,maxSize=4_000_000) {
  return new Promise((resolve,reject)=>{
    let total=0;const chunks=[];
    req.on('data',chunk=>{total+=chunk.length;if(total>maxSize){reject(Error('Corpo maior que o permitido'));req.destroy();} else chunks.push(chunk);});
    req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(Error('JSON inválido'));}});
    req.on('error',reject);
  });
}
function rateOK(uid) {
  const day = new Date().toISOString().slice(0,10);
  const key=day+':'+uid;const item=rate.get(key)||{calls:0,at:[]};
  const now=Date.now();item.at=item.at.filter(x=>now-x<300000);
  if(item.calls>=40 || item.at.length>=5) return false;
  item.calls++;item.at.push(now);rate.set(key,item);
  if(rate.size>2000) for (const k of rate.keys()) if(!k.startsWith(day+':')) rate.delete(k);
  return true;
}
function validateInput(data) {
  if (!data || typeof data!=='object' || !Array.isArray(data.messages)) throw Error('Mensagens ausentes');
  if(data.messages.length<1 || data.messages.length>18) throw Error('Quantidade de mensagens inválida');
  const messages=data.messages.map(m=>{
    if(!m || !['user','assistant'].includes(m.role) || typeof m.text!=='string' || m.text.length>2800 || !m.text.trim()) throw Error('Mensagem inválida');
    return {role:m.role,text:m.text.trim()};
  });
  if(messages.at(-1).role!=='user') throw Error('Última mensagem precisa ser do mecânico');
  let image=null;
  if(data.image != null){
    if(typeof data.image !== 'string' || data.image.length>2_800_000 ||
       !/^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(data.image)) throw Error('Imagem inválida');
    image=data.image;
  }
  const vehicle=typeof data.vehicle==='string'?data.vehicle.slice(0,220):'';
  return {messages,image,vehicle};
}
async function diagnose(data) {
  const parsed=validateInput(data);
  const inquiry=parsed.vehicle+' '+parsed.messages.slice(-4).filter(m=>m.role==='user').map(m=>m.text).join(' ');
  const evidence=findEvidence(knowledge,inquiry,3);
  const instructions=buildInstruction(knowledge.skill,evidence,knowledge.available);
  const input=parsed.messages.map((m,i)=>({role:m.role,content:m.role==='user' && i===parsed.messages.length-1
    ? [{type:'input_text',text:m.text},...(parsed.image?[{type:'input_image',image_url:parsed.image,detail:'high'}]:[])]
    :m.text}));
  if(parsed.vehicle) input.unshift({role:'user',content:'Identificação do veículo informada: '+parsed.vehicle});
  const response=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',headers:{'Authorization':'Bearer '+CONFIG.key,'Content-Type':'application/json'},
    body:JSON.stringify({model:CONFIG.model,store:false,instructions,input,max_output_tokens:1300}),
    signal:AbortSignal.timeout(60000)
  });
  if(!response.ok){const body=await response.text();
    console.error('[OpenAI API]',response.status,body.slice(0,180).replace(/sk-[\w-]+/g,'[oculto]'));
    const err = new Error('O provedor não concluiu a análise');err.status = response.status===429?429:502;throw err;}
  const body=await response.json();const answer=replyText(body);
  if(!answer)throw Error('O provedor retornou uma resposta sem texto');
  return {answer,evidence:evidence.map(({texto,...rest})=>rest),knowledgeReady:knowledge.available,model:CONFIG.model};
}
export const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin || '';
  if(origin && !CONFIG.origins.has(origin))return send(res,403,{error:'Origem não autorizada'});
  if(req.method==='OPTIONS') {
    res.writeHead(204,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type','Vary':'Origin'});
    res.end();return;
  }
  const pathname=new URL(req.url||'/', 'http://localhost').pathname;
  if(req.method==='GET' && pathname==='/health')return send(res,200,{service:'mecanico-openai-staging',configured:Boolean(CONFIG.key&&CONFIG.uids.size&&knowledge.available),knowledgeReady:knowledge.available,libraryRecords:knowledge.count},origin);
  if(req.method!=='POST' || pathname!=='/api/chat')return send(res,404,{error:'Não encontrado'},origin);
  if(!CONFIG.key || !CONFIG.uids.size || !knowledge.available)return send(res,503,{error:'Servidor ainda não configurado: API, UIDs autorizados e biblioteca privada obrigatórios'},origin);
  const token=(req.headers.authorization||'').match(/^Bearer (\S+)$/)?.[1];
  if(!token)return send(res,401,{error:'Autenticação obrigatória'},origin);
  let uid;
  try{uid=await verifyFirebaseToken(token);}catch{return send(res,401,{error:'Autenticação não validada'},origin);}
  if(!CONFIG.uids.has(uid))return send(res,403,{error:'Usuário não autorizado'},origin);
  if(!rateOK(uid))return send(res,429,{error:'Limite temporário de diagnósticos atingido'},origin);
  try{
    const data=await cappedRead(req);
    const out=await diagnose(data);
    return send(res,200,out,origin);
  }catch(error){
    console.error('[diagnose]',error.message);
    return send(res,error.status||400,{error:error.status?'Serviço temporariamente indisponível':error.message},origin);
  }
});
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  server.listen(CONFIG.port,()=>console.log(`MECANICO IA staging: localhost:${CONFIG.port} | biblioteca=${knowledge.count} | API=${CONFIG.key?'configurada':'pendente'}`));
}
