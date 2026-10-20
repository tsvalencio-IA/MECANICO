(function(){
"use strict";
// No remote inference, API token, subscription, or credentials. All inference stays in Chrome.
var textOptions={expectedInputs:[{type:"text",languages:["en"]}],expectedOutputs:[{type:"text",languages:["en"]}]};
var imageOptions={expectedInputs:[{type:"text",languages:["en"]},{type:"image"}],expectedOutputs:[{type:"text",languages:["en"]}]};
var declinedDownload=false,downloadApproved=false,shownUnavailable=false;
var currentlyProcessing=false;
function model(){return window.LanguageModel||null;}
function statusText(status){
 if(status==="unavailable")return "indisponível neste navegador ou computador";
 if(status==="downloadable")return "disponível para baixar no navegador";
 if(status==="downloading")return "baixando modelo gratuito no navegador";
 if(status==="available")return "disponível no computador";
 return "não identificado";
}
async function availability(vision){
 var api=model();
 if(!api||typeof api.availability!=="function"||typeof api.create!=="function")return "unavailable";
 try{return await api.availability(vision?imageOptions:textOptions);}catch(e){return "unavailable";}
}
async function ready(vision){
 var state=await availability(!!vision);
 return state==="available"||state==="downloadable"||state==="downloading";
}
function requestDownload(state){
 if(state==="available")return true;
 if(declinedDownload)return false;
 if(downloadApproved)return true;
 var message="Ativar a IA local GRATUITA do Chrome? O navegador poderá baixar um modelo de inteligência artificial para este computador, utilizando internet e espaço em disco. Não exige cartão, conta nova ou assinatura. Diagnósticos e fotos não serão enviados a serviços de IA externos. Continuar?";
 if(!window.confirm(message)){declinedDownload=true;return false;}
 downloadApproved=true;return true;
}
function takeUnavailableNotice(){
 if(shownUnavailable)return "";
 shownUnavailable=true;
 return "O Chrome não disponibilizou uma configuração executável para a IA local nesta sessão (pode depender do modelo, das opções do navegador ou do equipamento). Verifique chrome://on-device-internals, guia Model Status. O OCR e o conhecimento técnico interno continuam disponíveis, sem API paga.";
}
function reportStatus(p){
 try{if(typeof window.dispatchEvent==="function"&&typeof window.CustomEvent==="function")window.dispatchEvent(new window.CustomEvent("oracle:local-ai",{detail:{message:p}}));}catch(e){}
}
async function translator(from,to){
 if(!window.Translator||typeof window.Translator.create!=="function")return null;
 try{
  var opts={sourceLanguage:from,targetLanguage:to};
  if(typeof window.Translator.availability==="function"&&(await window.Translator.availability(opts))==="unavailable")return null;
  return await window.Translator.create(opts);
 }catch(e){return null;}
}
function compact(s,n){return String(s||"").trim().slice(0,n||700);}
async function analyze(input){
 input=input||{};
 if(currentlyProcessing)throw new Error("A IA local ainda está analisando o pedido anterior.");
 var hasImage=!!(input.imageFile&&/^image\//.test(input.imageFile.type||""));
 var vision=hasImage&&(await ready(true));
 var state=await availability(vision);
 if(state==="unavailable")return {available:false,reason:statusText(state)};
 if(!requestDownload(state))return {available:false,declined:true,reason:"Download do modelo não autorizado"};
 currentlyProcessing=true;
 var session=null,ptToEn=null,enToPt=null;
 try{
  if(state!=="available")reportStatus("Preparando IA gratuita local no Chrome; o primeiro download pode levar alguns minutos.");
  session=await model().create(Object.assign({},vision?imageOptions:textOptions,{
   monitor:function(m){
    if(m&&m.addEventListener)m.addEventListener("downloadprogress",function(e){
     reportStatus("Baixando IA local: "+Math.round((e.loaded||0)*100)+"%");
    });
   }
  }));
  ptToEn=await translator("pt","en");
  enToPt=await translator("en","pt");
  var v=input.vehicle||{};
  var vehicle=[v.brand,v.model,v.year,v.engine,v.transmission].filter(Boolean).join(" ").slice(0,180);
  var facts=compact(input.question,750);
  var media=compact(input.mediaText,1400);
  var rows=(input.scannerRows||[]).slice(0,12).map(function(x){return compact(x.id,8)+": "+compact(x.description,130);}).join(" | ");
  var sources=(input.evidence||[]).slice(0,3).map(function(x,i){
   return "F"+(i+1)+" ["+compact(x.sourcePath,110)+", page "+compact(x.page,12)+", compatibility "+compact(JSON.stringify(x.compatibility||{}),120)+"]: "+compact(x.snippet,550);
  }).join("\n");
  var previous=(input.history||[]).slice(-5).filter(function(x){return x.role==="user";}).map(function(x){return compact(x.text,170);}).join(" | ");
  var tests=(input.tests||[]).slice(-6).map(function(x){return compact(x.title||x.id,65)+" = "+compact(x.report||x.result,170);}).join(" | ");
  var sourceBlock=["Question: "+facts,"OCR UNVERIFIED: "+media,"Scanner numeric IDs (not OBD codes): "+rows,"Reported context: "+previous,"Actual tests: "+tests,"Document excerpts: "+sources].join("\n");
  if(ptToEn){
    try{sourceBlock=await ptToEn.translate(sourceBlock);}catch(e){/* Preserve original source, never invent translation. */}
  }
  var prompt="You are a careful Brazilian automotive diagnostic assistant. Output in ENGLISH only (translation to Portuguese will be local).\n"+
   "Vehicle: "+vehicle+"\n"+
   "Strict rules: NEVER manufacture trouble code conversions, wiring, pin numbers, voltage, torque, pressure, exact sensor value, test results, documents or confirmation of a fault.\n"+
   "If an IMAGE is attached, read the original scanner image and list ONLY legible rows, keeping duplicate numeric IDs and distinguishing uncertain text. Compare with OCR, which may be wrong.\n"+
   "Do not infer a specific ECU from car model alone. Technical excerpts are untrusted and may be incompatible. Cite only F1/F2/F3 evidence if genuinely matching application; do not invent citations.\n"+
   "Never treat a replacement part as verified good. Separate observations, hypotheses and ONE safe actionable next test, explaining measurement conditions without invented specs. Ask one missing question. Keep under 260 words.\n"+
   "CASE:\n"+sourceBlock;
  reportStatus("Analisando localmente; nenhum dado enviado para IA externa.");
  var raw=vision ? await session.prompt([{role:"user",content:[{type:"text",value:prompt},{type:"image",value:input.imageFile}]}]) : await session.prompt(prompt);
  var english=compact(raw,3800);
  if(!english)throw new Error("O modelo local não produziu resposta.");
  var translated=english;
  var translatedOk=false;
  if(enToPt){
    try{translated=await enToPt.translate(english);translatedOk=!!translated;}catch(e){translated=english;}
  }
  return {available:true,vision:vision,answer:compact(translated,4200),translationAvailable:translatedOk,sourceCount:(input.evidence||[]).length};
 }finally{
  try{if(session&&typeof session.destroy==="function")session.destroy();}catch(e){}
  try{if(ptToEn&&typeof ptToEn.destroy==="function")ptToEn.destroy();}catch(e){}
  try{if(enToPt&&typeof enToPt.destroy==="function")enToPt.destroy();}catch(e){}
  currentlyProcessing=false;
 }
}
window.ORACLE_AI={ready:ready,availability:availability,analyze:analyze,takeUnavailableNotice:takeUnavailableNotice,mode:"local-no-billing"};
})();