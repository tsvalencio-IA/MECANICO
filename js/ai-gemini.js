(function(){
 "use strict";
 // Public bridge contains no provider key; protected endpoint validates Firebase JWT.
 var URL="https://mecanico-ia-inteligencia.vercel.app/api/diagnose";
 var available=false,nextCheck=0,declinedThisSession=false;
 async function ready(){
   if(Date.now()<nextCheck)return available;
   try{
     var r=await fetch(URL,{method:"GET",cache:"no-store",signal:AbortSignal.timeout(7000)});
     var result=r.ok?await r.json():{};
     available=!!(result.ready===true&&result.provider==="gemini"&&result.mode==="free-tier-only");
   }catch(e){available=false;}
   nextCheck=Date.now()+60000;
   return available;
 }
 function consentText(){
   if(declinedThisSession)return false;
   try{if(localStorage.getItem("thiaguinho_gemini_text_consent") === "yes")return true;}catch(e){}
   var msg="Autoriza usar a IA Gemini no nível GRATUITO, sem cartão? Serão enviados ao Google os textos de diagnóstico, dados técnicos do veículo e trechos da biblioteca pesquisada. O Google informa que informações do nível gratuito podem ser usadas para melhorar seus produtos. NÃO inclua dados pessoais, placas ou informações identificáveis de clientes. Você pode cancelar e continuar com diagnóstico local.";
   if(!window.confirm(msg)){declinedThisSession=true;return false;}
   try{localStorage.setItem("thiaguinho_gemini_text_consent","yes");}catch(e){}
   return true;
 }
 function consentImage(){
   var msg="Autoriza o envio DESTA fotografia ao Gemini gratuito do Google para leitura visual? A foto original será reduzida e transmitida somente para processamento, sem gravá-la no histórico do MECÂNICO IA. No nível gratuito, o Google pode usar os dados para melhorar produtos. Não envie placas ou dados pessoais visíveis. Cancelar mantém o OCR local.";
   return !!window.confirm(msg);
 }
 function extractVisionRows(reply){
 var out=[];
 String(reply||"").split(/\r?\n/).forEach(function(line){
  var m=line.match(/^\s*(?:[-*•]\s*)?(?:\*\*|__)?(\d{1,3})(?:\*\*|__)?\s*[:—–-]\s*["“]?([^"”\n]{12,220})/);
  if(!m)return;
  var description=m[2].replace(/["”*]+\s*$/,"").trim();
  if(!/circuito|sensor|sonda|lambda|detona|press[aã]o|coletor|v[aá]lvula|canister|c[aâ]nister|injetor/i.test(description))return;
  if(out.some(function(row){return row.id===m[1]&&row.description===description;}))return;
  out.push({id:m[1],description:description,confirmed:false,origin:"ai_visual_unverified"});
 });
 return out.slice(0,20);
}
async function diagnose(data){
   if(!window.ORACLE_FIREBASE)throw Error("Firebase indisponível");
   await window.ORACLE_FIREBASE.ready;
   var user=window.ORACLE_FIREBASE.auth&&window.ORACLE_FIREBASE.auth.currentUser;
   if(!user)throw Error("Autenticação do histórico não concluída");
   var token=await user.getIdToken();
   var response=await fetch(URL,{
     method:"POST",
     headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},
     body:JSON.stringify(data),
     signal:AbortSignal.timeout(36000)
   });
   if(!response.ok){
     var error={};try{error=await response.json();}catch(e){}
     var id=String(error.error||"serviço-indisponível");
     if(response.status===429)throw Error("Limite gratuito do Gemini atingido; tente depois");
     if(id==="free-tier-not-configured")throw Error("Chave Gemini gratuita ainda não instalada");
     throw Error("Gemini gratuito: "+id+" (HTTP "+response.status+")");
   }
   var result=await response.json();
   if(!result||typeof result.answer!=="string"||!result.answer.trim())throw Error("Resposta vazia do Gemini");
   return result;
 }
 window.ORACLE_GEMINI={ready:ready,consentText:consentText,consentImage:consentImage,diagnose:diagnose,extractVisionRows:extractVisionRows,mode:"free-tier-only"};
})();
