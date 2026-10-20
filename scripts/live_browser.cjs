'use strict';
const { chromium }=require('playwright-core');
const fs=require('node:fs');
const assert=require('node:assert/strict');
async function main(){
 const url='https://tsvalencio-ia.github.io/MECANICO/app-v134.html?v=1.6.2&browser-e2e=1';
 const report={checks:[],queries:[],errors:[]};
 function ok(name,val,info=''){report.checks.push({name,pass:!!val,details:String(info).slice(0,350)});console.log((val?'PASS':'FAIL')+' '+name+' '+String(info).slice(0,160));assert.ok(val,name+' '+info);}
 const reply='Leitura e orientação por Gemini gratuito (imagem original; conferir):\n'
 + 'A base não recuperou referência compatível nesta consulta.\n'
 + 'As observações confirmáveis na fotografia:\n'
 + '\\- Identificador 12 com a descrição "Circuito do sensor de detonação"\n'
 + '- Identificador 08 com a descrição "Sensor de pressão absoluta do coletor do circuito"\n'
 + '- Identificador 13 com a descrição "Circuito do sensor de Lambda Sensor dianteiro com defeito"\n'
 + '- Identificador 99 com a descrição "Circuito da válvula de purga do canister Circuito de controle aberto"\n'
 + '- Identificador 99 com a descrição "Circuito da válvula de purga do canister"\n';
 const fixture={
  id:'TESTE-ISOLADO-CLIO',createdAt:'2026-10-20T15:00:00Z',updatedAt:'2026-10-20T15:02:00Z',
  vehicle:'Renault Clio 2003 1.6 16V K4M Manual',
  vehicleData:{brand:'Renault',model:'Clio',year:'2003',engine:'1.6 16V K4M',transmission:'Manual'},
  title:'Teste isolado do scanner Clio',caseContext:{visionRows:[]},dtcs:[],tests:[],
  messages:[{role:'bot',text:'Leitura OCR: 6 — cânister [incerta]',at:'2026-10-20T15:00:00Z'},
            {role:'bot',text:reply,at:'2026-10-20T15:01:00Z'}],
  mediaAnalysis:[{kind:'foto',text:'6 — canister',scannerRows:[{id:'6',description:'canister',confidence:'low'}]}]
 };
 fs.mkdirSync('artifacts',{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const ctx=await browser.newContext({locale:'pt-BR',viewport:{width:1440,height:900},serviceWorkers:'block'});
 const page=await ctx.newPage();
 page.on('dialog',async d=>d.dismiss());page.on('pageerror',error=>report.errors.push(error.message));
 await page.route(/\/js\/firebase\.js(\?|$)/,route=>route.fulfill({status:200,contentType:'text/javascript',body:'window.ORACLE_FIREBASE={uid:null,auth:null,ready:Promise.resolve({uid:null}),saveCase:async()=>{},watchCases:()=>()=>{},clearCases:async()=>{}};'}));
 await page.route('**/mecanico-ia-inteligencia.vercel.app/api/diagnose**',route=>route.fulfill({status:200,contentType:'application/json',body:'{"ready":false,"provider":"gemini","mode":"free-tier-only"}'}));
 try{
  const res=await page.goto(url,{waitUntil:'domcontentloaded',timeout:50000});
  ok('Published site returns 200',res.status()===200,res.status());
  await page.locator('#historyBtn').waitFor({timeout:25000});
  const loaded=await page.evaluate(()=>({gemini:!!window.ORACLE_GEMINI,media:!!window.ORACLE_MEDIA,knowledge:!!window.ORACLE_REMOTE_KNOWLEDGE}));
  ok('Published JS bundles loaded',loaded.gemini&&loaded.media&&loaded.knowledge,JSON.stringify(loaded));
  await page.evaluate(item=>localStorage.setItem('thiaguinho_history',JSON.stringify([item])),fixture);
  await page.reload({waitUntil:'domcontentloaded',timeout:50000});
  await page.locator('#historyBtn').click();
  await page.locator('#historyList button.history-item').first().click();
  const parsed=await page.evaluate(text=>window.ORACLE_GEMINI.extractVisionRows(text),reply);
  ok('Real Gemini reply yields 5 distinct rows',JSON.stringify(parsed.map(r=>r.id))==='["12","08","13","99","99"]',parsed.map(r=>r.id).join(','));
  await page.evaluate(()=>{
   window.__knowledgeProbe=[];
   const fn=window.ORACLE_REMOTE_KNOWLEDGE.search;
   window.ORACLE_REMOTE_KNOWLEDGE.search=async function(q,v,n){const rows=await fn.call(this,q,v,n);window.__knowledgeProbe.push({q,count:rows.length,sources:rows.slice(0,2).map(x=>x.sourcePath)});return rows;};
  });
  async function ask(text){
   const n=await page.locator('#messages article.message').count();
   await page.locator('#chatInput').fill(text);
   await page.locator('#chatInput').press('Enter');
   await page.waitForFunction(previous=>document.querySelectorAll('#messages article.message').length>previous+1,n,{timeout:24000});
   await page.waitForTimeout(1500);
   return await page.locator('#messages article.message.bot .bubble p').last().innerText();
  }
  const first=await ask('O motor está falhando. Quero começar o diagnóstico sem trocar peça no chute.');
  ok('First follow-up asks a symptom question without losing history',/falha|frio|quente|diagnóstic/i.test(first),first.slice(0,300));
  ok('First follow-up does not re-ask scanner codes',!/Qual código aparece no scanner|diga .sem código./i.test(first),first.slice(-250));
  const second=await ask('A falha acontece o tempo todo.');
  ok('Second follow-up recognizes scanner was already read',/j[aá] registrei os identificadores|12 — Circuito do sensor de detonação/i.test(second),second.slice(0,320));
  ok('Second follow-up does not re-ask scanner codes',!/Qual código aparece no scanner|diga .sem código./i.test(second),second.slice(-250));
  const damaged=await ask('O CHICOTE DO CANISTER ESTAVA QUEBRADO');
  ok('Broken harness registered, no inferred repair',/chicote|cânister|canister/i.test(damaged)&&!/reparo concluído|reparado e testado/i.test(damaged),damaged.slice(0,220));
  const update=await ask('TROCAMOS VELA,,BOBINA, FIZEMOS LIMPEZA DE BICOS, E LIMPEZA DE TBI.. ELE MELHOROU MAS NAO PARA EM MARCHA LENTA');
  ok('Idle complaint changes next test',/marcha lenta/i.test(update)&&/pedal|acelerador/i.test(update)&&!/Manipulação monitorada/i.test(update),update.slice(-260));
  const current=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiaguinho_history')).find(x=>x.id==='TESTE-ISOLADO-CLIO')?.caseContext);
  ok('Workshop facts and vision rows persisted',current?.serviceLog?.length===4&&current?.visionRows?.length===5&&current?.canisterHarnessDamage==='relatado'&&!current?.canisterHarnessRepaired,JSON.stringify(current?.serviceLog?.map(x=>x.component)));
  const pedal=await ask('Com o pedal pressionado ele fica ligado.');
  ok('Next step advances to intake',/mangueira|admissão/i.test(pedal)&&!/Manipulação monitorada/i.test(pedal),pedal.slice(-280));
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiaguinho_history')).find(x=>x.id==='TESTE-ISOLADO-CLIO'));
  ok('History persists five lines',stored?.caseContext?.visionRows?.length===5,stored?.caseContext?.visionRows?.map(r=>r.id).join(','));
  report.queries=await page.evaluate(()=>window.__knowledgeProbe||[]);
  ok('Knowledge search was actually invoked',report.queries.length>=2,JSON.stringify(report.queries));
  const coverage=await page.evaluate(async()=>{
    const api=window.ORACLE_REMOTE_KNOWLEDGE;
    const manifest=await api.metadata();
    const cases=[
      {name:'Clio K4M detonação',q:'circuito do sensor de detonação',vehicle:{brand:'Renault',model:'Clio',year:'2003',engine:'1.6 16V K4M'}},
      {name:'Clio K4M cânister',q:'válvula de purga do canister',vehicle:{brand:'Renault',model:'Clio',year:'2003',engine:'1.6 16V K4M'}},
      {name:'Clio K4M lambda',q:'sonda lambda dianteira',vehicle:{brand:'Renault',model:'Clio',year:'2003',engine:'1.6 16V K4M'}},
      {name:'Duster K4M detonação',q:'sensor de detonação',vehicle:{brand:'Renault',model:'Duster',year:'2015',engine:'1.6 K4M'}}
    ];
    const results=[];
    for(const test of cases){
      const hits=await api.search(test.q,test.vehicle,4);
      results.push({name:test.name,count:hits.length,sources:hits.map(x=>({path:x.sourcePath,page:x.page,truth:x.truthStatus,compatibility:x.compatibility,verified:x.verified}))});
    }
    return {indexed:manifest.records,focus:manifest.focused_topics,results};
  });
  report.coverage=coverage;
  ok('Focused index was rebuilt and served on the live website',coverage.indexed>=20000&&coverage.focus?.detonacao>=400&&coverage.focus?.canister>=800,JSON.stringify(coverage.focus));
  console.log('LIVE_INDEX_COVERAGE '+JSON.stringify(coverage).slice(0,7000));
  await page.screenshot({path:'artifacts/clio-browser-desktop.png',fullPage:true});
  await page.reload({waitUntil:'domcontentloaded',timeout:50000});
  await page.locator('#historyBtn').click();await page.locator('#historyList button.history-item').first().click();
  const old=await page.locator('#messages').innerText();
  ok('Browser reload restores the prior case',old.includes('O motor está falhando')&&old.includes('Identificador 99'),old.slice(-160));
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'artifacts/clio-browser-mobile.png',fullPage:true});
  console.log('RESULT: COMPLETE SUCCESS');
 }catch(e){report.failure=String(e.stack||e);console.log('RESULT: FAILED '+e.message);try{await page.screenshot({path:'artifacts/clio-browser-failure.png',fullPage:true});}catch{}process.exitCode=1;}
 finally{fs.writeFileSync('artifacts/report.json',JSON.stringify(report,null,2));await ctx.close();await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
