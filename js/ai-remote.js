(function(){
"use strict";
var ENDPOINT="https://mecanico-ia-inteligencia.vercel.app/api/diagnose";
var available=null,until=0,denied=false;
async function ready(){
 if(Date.now()<until)return available===true;
 try{
  var r=await fetch(ENDPOINT,{cache:"no-store",signal:AbortSignal.timeout(6000)});
  var j=r.ok?await r.json():null;available=!!(j&&j.ready===true);
 }catch(e){available=false;}
 until=Date.now()+120000;return available;
}
function consent(){
 if(denied)return false;
 try{if(localStorage.getItem("thiaguinho_external_ai_consent")==="yes")return true;}catch(e){}
 var question="Autoriza análise por IA externa? Serão enviados os textos do diagnóstico, dados do veículo, texto extraído do scanner e trechos técnicos ao serviço Vercel/IA. Fotos e vídeos originais não serão enviados. Você pode cancelar e usar o diagnóstico local.";
 if(!window.confirm(question)){denied=true;return false;}
 try{localStorage.setItem("thiaguinho_external_ai_consent","yes");}catch(e){}
 return true;
}
function consentImage(){
 if(!consent())return false;
 try{if(localStorage.getItem("thiaguinho_external_image_consent")==="yes")return true;}catch(e){}
 var message="Autoriza enviar ESTA FOTO para análise visual pela IA externa? A imagem será reduzida e transmitida ao serviço Vercel/AI Gateway. Ela não será gravada no histórico, mas será processada pelo provedor de IA. Se cancelar, o diagnóstico continuará com a leitura local."; 
 if(!window.confirm(message))return false;
 try{localStorage.setItem("thiaguinho_external_image_consent","yes");}catch(e){}
 return true;
}
async function diagnose(payload){
 if(!window.ORACLE_FIREBASE)throw Error("Firebase indisponível");
 await window.ORACLE_FIREBASE.ready;
 var user=window.ORACLE_FIREBASE.auth&&window.ORACLE_FIREBASE.auth.currentUser;
 if(!user)throw Error("Usuário não autenticado");
 var token=await user.getIdToken();
 var r=await fetch(ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(payload),signal:AbortSignal.timeout(25000)});
 if(!r.ok){
  var info={};try{info=await r.json();}catch(e){}
  var code=String(info.error||"erro-de-rede").slice(0,80);
  throw Error("Serviço IA: "+code+" (HTTP "+r.status+").");
 }
 var data=await r.json();
 if(!data||typeof data.answer!=="string")throw Error("Resposta inválida");
 return data;
}
window.ORACLE_AI={ready:ready,consent:consent,consentImage:consentImage,diagnose:diagnose};
})();
