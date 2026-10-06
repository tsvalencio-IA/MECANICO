(function(){
  "use strict";
  var KB = window.ORACLE_KNOWLEDGE || {sources:[],rules:[],dtcs:{},philosophy:[]};
  var state = {ranked:[], tests:[], testIndex:0, testLog:[], currentCase:null, deferredInstall:null};

  function $(id){ return document.getElementById(id); }
  function esc(v){ return String(v == null ? "" : v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c];});}
  function norm(v){ return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim(); }
  function words(v){ return norm(v).split(/[^a-z0-9]+/).filter(Boolean); }
  function uniq(arr){ return Array.from(new Set(arr)); }
  function now(){ return new Date().toISOString(); }
  function sourceById(id){ return KB.sources.find(function(s){return s.id===id;}); }

  function toast(msg){
    var el=document.querySelector(".toast");
    if(!el){el=document.createElement("div");el.className="toast";document.body.appendChild(el);}
    el.textContent=msg;el.classList.add("show");setTimeout(function(){el.classList.remove("show");},1800);
  }

  function initTabs(){
    document.querySelectorAll(".tab").forEach(function(btn){
      btn.addEventListener("click",function(){
        document.querySelectorAll(".tab").forEach(function(x){x.classList.remove("active");});
        document.querySelectorAll(".tab-panel").forEach(function(x){x.classList.remove("active");});
        btn.classList.add("active");
        $(btn.dataset.tab).classList.add("active");
      });
    });
  }

  function initInventory(){
    var indexed=KB.sources.filter(function(s){return s.state==="indexed";}).length;
    var registered=KB.sources.filter(function(s){return s.state==="registered";}).length;
    $("libraryCount").textContent=KB.sources.length+" fontes";
    $("libraryWeight").textContent=indexed+" indexadas • "+registered+" aguardando extração";
    $("kbStats").textContent=indexed+" indexadas / "+registered+" registradas";
    renderSources();
  }

  function renderSources(){
    var q=norm($("kbSearch").value);
    var filter=$("kbFilter").value;
    var items=KB.sources.filter(function(s){
      if(filter!=="all" && s.state!==filter) return false;
      var hay=norm([s.title,s.type,s.ref,s.notes,(s.vehicles||[]).join(" "),(s.systems||[]).join(" ")].join(" "));
      return !q || hay.indexOf(q)>=0 || words(q).every(function(w){return hay.indexOf(w)>=0;});
    });
    $("sourceCards").innerHTML=items.map(function(s){
      var meta=[];
      if(s.pages) meta.push(s.pages+" páginas");
      if(s.size) meta.push(s.size);
      if(s.ref) meta.push(s.ref);
      return '<article class="source-card"><div class="source-top"><div><h3>'+esc(s.title)+'</h3><div class="source-type">'+esc(s.type)+'</div></div><span class="badge '+s.state+'">'+(s.state==="indexed"?"INDEXADA":"REGISTRADA")+'</span></div><p>'+esc(s.notes)+'</p><div class="source-meta">'+meta.map(function(m){return "<span>"+esc(m)+"</span>";}).join("")+'</div></article>';
    }).join("") || '<div class="empty">Nenhuma fonte encontrada.</div>';
  }

  function getCase(){
    return {
      id:"CASE-"+Date.now(),
      createdAt:now(),
      brand:$("brand").value.trim(),
      model:$("model").value.trim(),
      year:$("year").value.trim(),
      engine:$("engine").value.trim(),
      transmission:$("transmission").value.trim(),
      mileage:$("mileage").value.trim(),
      symptoms:$("symptoms").value.trim(),
      dtcs:uniq(($("dtcs").value.toUpperCase().match(/[A-Z]{1,3}\d{3,5}|DF\d{3,4}/g)||[])),
      measurements:$("measurements").value.trim()
    };
  }

  function expandDtcs(dtcs){
    var out=dtcs.slice();
    Object.keys(KB.dtcs||{}).forEach(function(code){
      var d=KB.dtcs[code];
      if(dtcs.indexOf(code)>=0) out=out.concat(d.aliases||[]);
      (d.aliases||[]).forEach(function(a){ if(dtcs.indexOf(a)>=0) out.push(code); });
    });
    return uniq(out);
  }

  function scoreRule(rule,c){
    var score=0, reasons=[];
    var b=norm(c.brand),m=norm(c.model),e=norm(c.engine),text=norm(c.symptoms+" "+c.measurements),allDtcs=expandDtcs(c.dtcs);
    if(rule.brands.length && rule.brands.some(function(x){return b.indexOf(norm(x))>=0;})){score+=14;reasons.push("marca");}
    if(rule.models.length && rule.models.some(function(x){return m.indexOf(norm(x))>=0;})){score+=20;reasons.push("modelo");}
    if(rule.engines.length && rule.engines.some(function(x){return e.indexOf(norm(x))>=0;})){score+=16;reasons.push("motor");}
    var dtcHits=(rule.dtcs||[]).filter(function(x){return allDtcs.indexOf(x.toUpperCase())>=0;});
    if(dtcHits.length){score+=Math.min(42,26+(dtcHits.length-1)*8);reasons.push("DTC "+dtcHits.join("/"));}
    var keyHits=(rule.keywords||[]).filter(function(k){return text.indexOf(norm(k))>=0;});
    if(keyHits.length){score+=Math.min(32,keyHits.length*8);reasons.push("sintoma");}
    if(!rule.brands.length && !rule.models.length && (keyHits.length||dtcHits.length)) score+=5;
    return {rule:rule,score:score,reasons:reasons};
  }

  function analyze(c){
    var ranked=KB.rules.map(function(r){return scoreRule(r,c);}).filter(function(x){return x.score>0;}).sort(function(a,b){return b.score-a.score;});
    if(!ranked.length){
      ranked=[{rule:{
        id:"baseline",title:"Triagem técnica inicial",sourceIds:[],hypotheses:[
          {name:"Alimentação / aterramento / condição básica",why:"Ainda não há correspondência documental suficiente. Comece pelas condições fundamentais do sistema afetado.",weight:70},
          {name:"Reprodução controlada do sintoma",why:"Sem reproduzir ou medir o evento, qualquer peça seria apenas hipótese.",weight:65}
        ],
        tests:[{id:"baseline-observe",title:"Definir condição exata da falha",procedure:"Registre quando ocorre (frio/quente, carga, marcha, rotação), leia todos os módulos e anote parâmetros relevantes antes de apagar códigos.",good:"condição reproduzida e registrada",bad:"falha não reproduzida"}],
        warnings:["A base atual ainda não encontrou fonte específica para este conjunto veículo/sintoma.","Não use esta triagem como autorização para substituir peça."]
      },score:12,reasons:["triagem"]}];
    }
    return ranked;
  }

  function renderDiagnosis(c,ranked){
    state.currentCase=c;state.ranked=ranked;state.testLog=[];state.testIndex=0;
    var top=ranked.slice(0,3);
    var chips=[c.brand,c.model,c.year,c.engine,c.transmission,c.dtcs.join(" • ")].filter(Boolean);
    $("vehicleFingerprint").innerHTML=chips.map(function(x){return '<span class="chip">'+esc(x)+'</span>';}).join("");
    $("resultTitle").textContent=(c.brand||c.model)?((c.brand+" "+c.model+" "+c.year).trim()):"Diagnóstico priorizado";

    var hypotheses=[];
    top.forEach(function(item,ri){
      (item.rule.hypotheses||[]).forEach(function(h,hi){
        var match=Math.min(99,Math.max(38,Math.round((item.score*0.62)+(h.weight*0.38))));
        hypotheses.push({name:h.name,why:h.why,score:match,rank:ri*10+hi});
      });
    });
    hypotheses.sort(function(a,b){return b.score-a.score;});
    var seen={};hypotheses=hypotheses.filter(function(h){if(seen[h.name])return false;seen[h.name]=1;return true;}).slice(0,5);
    $("hypotheses").innerHTML=hypotheses.map(function(h,i){
      return '<div class="hypothesis"><div class="hypothesis-head"><strong>'+(i+1)+'. '+esc(h.name)+'</strong><span class="score">'+h.score+'%</span></div><p>'+esc(h.why)+'</p><div class="bar"><i style="width:'+h.score+'%"></i></div></div>';
    }).join("");

    state.tests=[];
    top.forEach(function(item){ (item.rule.tests||[]).forEach(function(t){if(!state.tests.some(function(x){return x.id===t.id;}))state.tests.push(t);}); });
    renderNextTest();

    var sourceIds=uniq([].concat.apply([],top.map(function(x){return x.rule.sourceIds||[];})));
    var sources=sourceIds.map(sourceById).filter(Boolean);
    $("usedSources").innerHTML=sources.length?sources.map(function(s){
      return '<div class="source-mini"><strong>'+esc(s.title)+'</strong><small>'+esc(s.ref+" • "+s.type)+'</small></div>';
    }).join(""):'<div class="source-mini"><strong>Heurística de triagem</strong><small>Sem fonte documental específica selecionada.</small></div>';

    var warns=uniq([].concat.apply([],top.map(function(x){return x.rule.warnings||[];})));
    $("warnings").innerHTML=warns.concat(["Confiança exibida = aderência das evidências; não é probabilidade estatística de defeito."]).map(function(w){return "<div>⚠ "+esc(w)+"</div>";}).join("");
    $("results").hidden=false;$("results").scrollIntoView({behavior:"smooth",block:"start"});
    saveCase(c,top,hypotheses);
  }

  function renderNextTest(){
    var wrap=$("nextTest");
    if(!state.tests.length || state.testIndex>=state.tests.length){
      wrap.innerHTML='<div class="test-title">Ciclo de testes concluído</div><div class="test-procedure">Revise os resultados registrados. Se o defeito persistir, adicione novas medições/códigos e rode a análise novamente.</div>';
      return;
    }
    var t=state.tests[state.testIndex];
    wrap.innerHTML='<div class="test-title">'+(state.testIndex+1)+'. '+esc(t.title)+'</div><div class="test-procedure">'+esc(t.procedure)+'</div><div class="test-actions"><button class="test-answer good" data-answer="good">Dentro do esperado</button><button class="test-answer bad" data-answer="bad">Fora do esperado</button><button class="test-answer skip" data-answer="skip">Não testei</button></div><div class="test-log">'+(state.testLog.length?state.testLog.map(function(x){return esc(x);}).join(" • "):"Aguardando resultado do teste.")+'</div>';
    wrap.querySelectorAll(".test-answer").forEach(function(btn){
      btn.addEventListener("click",function(){
        var ans=btn.dataset.answer;
        var msg=t.title+": "+(ans==="good"?t.good:ans==="bad"?t.bad:"não realizado");
        state.testLog.push(msg);
        state.testIndex++;
        renderNextTest();
        toast("Resultado registrado");
      });
    });
  }

  function saveCase(c,top,hypotheses){
    var history=loadHistory();
    var item={id:c.id,createdAt:c.createdAt,vehicle:[c.brand,c.model,c.year,c.engine].filter(Boolean).join(" "),symptoms:c.symptoms,dtcs:c.dtcs,top:hypotheses[0]?hypotheses[0].name:"Triagem",sourceIds:uniq([].concat.apply([],top.map(function(x){return x.rule.sourceIds||[];})))};
    history.unshift(item);history=history.slice(0,40);
    localStorage.setItem("oracle_cases",JSON.stringify(history));renderHistory();
  }
  function loadHistory(){try{return JSON.parse(localStorage.getItem("oracle_cases")||"[]");}catch(e){return[];}}
  function renderHistory(){
    var h=loadHistory();
    $("historyList").innerHTML=h.length?h.map(function(x){
      return '<article class="history-item"><div><strong>'+esc(x.vehicle||"Veículo não informado")+'</strong><p>'+esc(x.top)+(x.dtcs&&x.dtcs.length?" • "+esc(x.dtcs.join(", ")):"")+'</p><time>'+new Date(x.createdAt).toLocaleString("pt-BR")+'</time></div><span class="badge indexed">SALVO</span></article>';
    }).join(""):'<div class="empty">Nenhum caso salvo neste dispositivo ainda.</div>';
  }

  function resetForm(){
    $("diagnosisForm").reset();$("results").hidden=true;state.currentCase=null;state.ranked=[];state.tests=[];state.testLog=[];
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function makeReport(){
    if(!state.currentCase)return "";
    var c=state.currentCase, lines=[];
    lines.push("ORÁCULO AUTOMOTIVO — RELATÓRIO DE TRIAGEM");
    lines.push("Veículo: "+[c.brand,c.model,c.year,c.engine,c.transmission].filter(Boolean).join(" "));
    if(c.dtcs.length)lines.push("DTCs: "+c.dtcs.join(", "));
    lines.push("Sintomas: "+(c.symptoms||"não informado"));
    if(c.measurements)lines.push("Medições: "+c.measurements);
    lines.push("");
    lines.push("PRIORIDADES:");
    document.querySelectorAll(".hypothesis").forEach(function(el){lines.push("- "+el.innerText.replace(/\n/g," — "));});
    if(state.testLog.length){lines.push("");lines.push("TESTES REGISTRADOS:");state.testLog.forEach(function(x){lines.push("- "+x);});}
    lines.push("");lines.push("Aviso: diagnóstico deve ser confirmado por testes e documentação aplicável.");
    lines.push("Powered by thIAguinho Soluções Digitais");
    return lines.join("\n");
  }

  $("diagnosisForm").addEventListener("submit",function(e){e.preventDefault();var c=getCase();renderDiagnosis(c,analyze(c));});
  $("resetBtn").addEventListener("click",resetForm);
  $("kbSearch").addEventListener("input",renderSources);
  $("kbFilter").addEventListener("change",renderSources);
  $("clearHistory").addEventListener("click",function(){localStorage.removeItem("oracle_cases");renderHistory();toast("Histórico local limpo");});
  $("copyReport").addEventListener("click",function(){navigator.clipboard.writeText(makeReport()).then(function(){toast("Laudo copiado");});});

  window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();state.deferredInstall=e;$("installBtn").hidden=false;});
  $("installBtn").addEventListener("click",function(){if(state.deferredInstall){state.deferredInstall.prompt();state.deferredInstall=null;$("installBtn").hidden=true;}});

  if("serviceWorker" in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("./sw.js").catch(function(){});});}
  initTabs();initInventory();renderHistory();
})();