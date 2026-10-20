import { createPublicKey, verify as cryptoVerify } from "node:crypto";

const ORIGIN = "https://tsvalencio-ia.github.io";
const PROJECT = "mecanico-b222e";
let jwksCache = null;
let jwksAt = 0;
const buckets = new Map();

function json(res, status, value) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(value));
}
function clean(s, max = 500) { return String(s ?? "").trim().slice(0, max); }
function b64(s) { return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"); }
async function firebaseUser(token) {
  if (!token || token.length > 8000) return null;
  const chunks = token.split(".");
  if (chunks.length !== 3) return null;
  let h, payload;
  try { h = JSON.parse(b64(chunks[0])); payload = JSON.parse(b64(chunks[1])); } catch { return null; }
  const epoch = Date.now() / 1000;
  if (h.alg !== "RS256" || !h.kid || payload.aud !== PROJECT ||
      payload.iss !== "https://securetoken.google.com/" + PROJECT ||
      typeof payload.sub !== "string" || payload.sub.length < 1 || payload.sub.length > 128 ||
      !Number.isFinite(payload.exp) || payload.exp <= epoch ||
      !Number.isFinite(payload.iat) || payload.iat > epoch + 60) return null;
  if (!jwksCache || Date.now() - jwksAt > 3600000) {
    const resp = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com", {signal: AbortSignal.timeout(5000)});
    if (!resp.ok) return null;
    jwksCache = await resp.json();
    jwksAt = Date.now();
  }
  const key = (jwksCache.keys || []).find(k => k.kid === h.kid && k.kty === "RSA");
  if (!key) return null;
  try {
    const publicKey = createPublicKey({key, format:"jwk"});
    return cryptoVerify("RSA-SHA256", Buffer.from(chunks[0] + "." + chunks[1]), publicKey, b64(chunks[2])) ? payload.sub : null;
  } catch { return null; }
}
function allowed(uid, ip) {
  const now = Date.now();
  if (buckets.size > 3000) buckets.clear(); // Best-effort only; distributed rate limits remain a deployment requirement.
  const id = uid + "|" + ip;
  const recent = (buckets.get(id) || []).filter(x => now - x < 15 * 60000);
  if (recent.length >= 8) return false;
  recent.push(now);
  buckets.set(id, recent);
  return true;
}
function structuredInput(body) {
  const vehicle = body.vehicle && typeof body.vehicle === "object" ? body.vehicle : {};
  const safeVehicle = Object.fromEntries(["brand","model","year","engine","transmission"].map(k => [k, clean(vehicle[k],70)]));
  const evidence = (Array.isArray(body.evidence) ? body.evidence : []).slice(0,6).map((e,i) => ({
    id: "F" + (i+1), path: clean(e.sourcePath,260), page: clean(e.page,15),
    snippet: clean(e.snippet,1300), extraction: clean(e.truthStatus || e.extraction,50),
    compatibility: e.compatibility && typeof e.compatibility === "object" ? e.compatibility : {}
  })).filter(x=>x.snippet && x.path);
  return {
    vehicle:safeVehicle,
    question:clean(body.question,2000),
    mediaText:clean(body.mediaText,2500),
    scannerRows:(Array.isArray(body.scannerRows)?body.scannerRows:[]).slice(0,15).map(x=>({id:clean(x.id,8),description:clean(x.description,200),source:"OCR não confirmado"})),
    history:(Array.isArray(body.history)?body.history:[]).slice(-12).map(x=>({role:x.role==="user"?"mecanico":"assistente",text:clean(x.text,400)})),
    tests:(Array.isArray(body.tests)?body.tests:[]).slice(-10).map(x=>({id:clean(x.id,100),outcome:clean(x.outcome,80),report:clean(x.report || x.result,300)})),
    evidence
  };
}
const POLICY = `Você é thIAguinho, auxiliar técnico de diagnóstico automotivo. Responda em português brasileiro claro, direto e prático.
Trate a entrada OCR como NÃO confirmada; códigos numéricos do scanner (12, 08, 13, 99...) NÃO equivalem a DTC P/DF por inferência.
Separe relato, evidência, interpretação, hipótese e teste. Não invente modelo de ECU, pinagem, cor de fio, tabela de código, pressão, torque, número de peça, fonte ou reparo confirmado.
Fontes fornecidas são trechos recuperados, podem estar errados ou não ser compatíveis. Cite no corpo SOMENTE IDs F1-F6 que comprovem uma afirmação técnica, com aplicação; se não houver, diga 'Sem referência específica confirmada'.
Não considere "source_extracted" prova de conteúdo validado. Não trate hipótese como causa.
Quando há vários defeitos de circuito, verifique alimentação, aterramento e chicote comum como hipótese a medir, sem afirmar circuito compartilhado sem diagrama.
Oriente 1 próximo teste executável e seguro, peça só o dado que falta. Evite desconectar sistemas de segurança e abrir combustível pressurizado.
Estrutura: O que a imagem/relato mostra; hipótese não confirmada; próximo teste; dado pendente; referências utilizáveis.`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
  const oidc = clean(req.headers["x-vercel-oidc-token"] || process.env.VERCEL_OIDC_TOKEN || "",4096);
  const active = !!(process.env.GROQ_API_KEY || oidc || process.env.AI_GATEWAY_API_KEY);
  if (req.method === "GET") return json(res,200,{service:"mecanico-ia",ready:active,mode:active?"gateway":"not-configured",version:"1.0"});
  if (req.method !== "POST") return json(res,405,{error:"method-not-allowed"});
  if (req.headers.origin !== ORIGIN) return json(res,403,{error:"origin-not-allowed"});
  if (!active) return json(res,503,{error:"ai-unavailable"});
  const rawAuth = String(req.headers.authorization || "");
  if (!rawAuth.startsWith("Bearer ")) return json(res,401,{error:"authentication-required"});
  let uid;
  try { uid = await firebaseUser(rawAuth.slice(7)); } catch { return json(res,503,{error:"authentication-service-unavailable"}); }
  if (!uid) return json(res,401,{error:"invalid-token"});
  if (!allowed(uid, clean(req.headers["x-forwarded-for"] || "unknown",80).split(",")[0]))
    return json(res,429,{error:"rate-limited"});
  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; } catch { return json(res,400,{error:"invalid-json"}); }
  if (!body || typeof body !== "object" || JSON.stringify(body).length > 18000)
    return json(res,413,{error:"payload-too-large"});
  const input = structuredInput(body);
  if (!input.question && !input.mediaText && !input.scannerRows.length)
    return json(res,422,{error:"missing-diagnostic-data"});
  const apiKey = process.env.GROQ_API_KEY || "";
  const useGroq = !!apiKey;
  const token = apiKey || process.env.AI_GATEWAY_API_KEY || oidc;
  const endpoint = useGroq
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://ai-gateway.vercel.sh/v1/chat/completions";
  const model = process.env.MECANICO_IA_MODEL || "openai/gpt-oss-120b";
  try {
    const reply = await fetch(endpoint, {
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},
      body:JSON.stringify({
        model,
        messages:[
          {role:"system",content:POLICY},
          {role:"user",content:JSON.stringify(input)}
        ],
        temperature:0.2,max_completion_tokens:850
      }),
      signal:AbortSignal.timeout(18000)
    });
    if (!reply.ok) return json(res,502,{error:"upstream-unavailable",status:reply.status});
    const data = await reply.json();
    const answer = clean(data?.choices?.[0]?.message?.content,3800);
    if (!answer) return json(res,502,{error:"empty-model-response"});
    return json(res,200,{answer,model,referenceIds:input.evidence.map(x=>x.id),disclaimer:"Análise assistida por IA; confirmar medições e aplicação das fontes."});
  } catch {
    return json(res,504,{error:"ai-timeout-or-network-failure"});
  }
}
