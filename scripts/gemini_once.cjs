'use strict';
const fs=require('node:fs');
const url='https://mecanico-ia-inteligencia.vercel.app/api/diagnose';
const firebase=fs.readFileSync('js/firebase.js','utf8');
const publicKey=firebase.match(/apiKey:"([^"]+)"/)?.[1];
if(!publicKey)throw Error('Public Firebase client configuration missing');
const authBase='https://identitytoolkit.googleapis.com/v1/accounts';
async function post(url,body,headers){
 const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(38000)});
 const parsed=await res.json().catch(()=>({}));
 return {res,status:res.status,data:parsed};
}
async function main(){
 let token='';
 try{
  const r=await post(authBase+':signUp?key='+encodeURIComponent(publicKey),{returnSecureToken:true});
  if(!r.data.idToken)throw Error('FIREBASE_ANONYMOUS_AUTH status='+r.status+' error='+String(r.data.error?.message||'unknown').slice(0,90));
  token=r.data.idToken;
  console.log('PASS Temporary Firebase test identity created');
  const input={
   question:'Diagnóstico automotivo seguro: scanner com IDs 12, 08, 13, 99, 99. Motor falha continuamente. Não converta IDs em DTC sem tabela verificada. Diga uma hipótese e um único teste antes de substituir componentes.',
   vehicle:{brand:'Renault',model:'Clio',year:'2003',engine:'1.6 16V K4M',transmission:'Manual'},
   visionRows:[
    {id:'12',description:'Circuito do sensor de detonação'},
    {id:'08',description:'Sensor de pressão absoluta do coletor'},
    {id:'13',description:'Circuito da sonda lambda dianteira'},
    {id:'99',description:'Circuito da válvula de purga do cânister, controle aberto'},
    {id:'99',description:'Circuito da válvula de purga do cânister'}
   ],
   evidence:[]
  };
  const rr=await post(url,input,{Origin:'https://tsvalencio-ia.github.io',Authorization:'Bearer '+token});
  console.log('HTTP_STATUS',rr.status,'ERROR_CODE',String(rr.data.error||'none').slice(0,65),'MODEL',rr.data.model||'none');
  if(rr.status!==200||!rr.data.answer)throw Error('GEMINI_REQUEST_FAILED '+rr.status+' '+String(rr.data.error||'empty').slice(0,65));
  if(!/sensor|circuito|c[oó]digo|scanner|c[aâ]nister/i.test(rr.data.answer))throw Error('RESPONSE_NOT_DIAGNOSTIC');
  console.log('PASS Authentic Firebase token accepted by Vercel backend');
  console.log('PASS Real Gemini generated a response through free-tier-only API');
  console.log('ANSWER_FIRST_350_CHARS',rr.data.answer.replace(/\s+/g,' ').slice(0,350));
  console.log('SOURCE_COUNT',rr.data.sourceCount);
 }finally{
  if(token){
   try{
    const d=await post(authBase+':delete?key='+encodeURIComponent(publicKey),{idToken:token});
    console.log('TEMP_TEST_ACCOUNT_DELETED',d.status===200);
   }catch(e){console.log('TEMP_TEST_ACCOUNT_DELETED unknown');}
  }
 }
}
main().catch(error=>{console.error('PROBE_FAILED',String(error.message||error).slice(0,180));process.exitCode=1;});
