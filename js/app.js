(function(){
  "use strict";

  var KB = window.ORACLE_KNOWLEDGE || {rules:[],dtcs:{},facts:[]};
  var state = {
    vehicle: loadJSON("thiaguinho_vehicle", {}),
    sessionId: newSessionId(),
    createdAt: new Date().toISOString(),
    messages: [],
    mediaAnalyses: [],
    cloudHistory: [],
    currentDiagnosis: null,
    activeTests: [],
    activeTestIndex: 0,
    testResults: [],
    deferredInstall: null,
    recognition: null,
    settings: loadJSON("thiaguinho_settings",{sound:true,autoSpeak:false,motion:true}),
    lastBotText: ""
  };

  function $(id){ return document.getElementById(id); }
  function loadJSON(key,fallback){ try{return JSON.parse(localStorage.getItem(key)||"null")||fallback;}catch(e){return fallback;} }
  function saveJSON(key,value){ try{localStorage.setItem(key,JSON.stringify(value));}catch(e){} }
  function newSessionId(){ return "CASE-"+Date.now()+"-"+Math.random().toString(36).slice(2,7); }
  function now(){ return new Date().toISOString(); }
  function esc(v){ return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c];}); }
  function norm(v){ return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim(); }
  function uniq(arr){ return Array.from(new Set((arr||[]).filter(Boolean))); }
  function extractCodes(text){ return uniq((String(text||"").toUpperCase().match(/[A-Z]{1,3}\d{3,5}|DF\d{3,4}/g)||[])); }
  function firstNonEmpty(){ for(var i=0;i<arguments.length;i++){if(arguments[i])return arguments[i];} return ""; }

  function toast(msg){
    var el=document.querySelector(".toast");
    if(!el){el=document.createElement("div");el.className="toast";document.body.appendChild(el);}
    el.textContent=msg; el.classList.add("show");
    clearTimeout(el._t); el._t=setTimeout(function(){el.classList.remove("show");},1900);
  }

  function vehicleText(v){
    return [v.brand,v.model,v.year,v.engine,v.transmission].filter(Boolean).join(" ");
  }

  function updateVehicleUI(){
    var text=vehicleText(state.vehicle);
    $("vehicleSummary").textContent=text||"Informar veículo";
    ["brand","model","year","engine","transmission","mileage"].forEach(function(k){
      if($(k)) $(k).value=state.vehicle[k]||"";
    });
  }

  function openDialog(el){
    if(!el) return;
    if(typeof el.showModal==="function") el.showModal(); else el.setAttribute("open","");
  }
  function closeDialog(el){
    if(!el) return;
    if(typeof el.close==="function") el.close(); else el.removeAttribute("open");
  }

  function contextHay(c){
    return norm([c.brand,c.model,c.engine,c.transmission,c.question,c.mediaText].join(" "));
  }

  function scopeCompatible(scope,c){
    if(!scope||!scope.length)return true;
    var hay=contextHay(c);
    return scope.some(function(token){return hay.indexOf(norm(token))>=0;});
  }

  function expandDtcs(dtcs,c){
    var out=(dtcs||[]).map(function(x){return String(x).toUpperCase();});
    Object.keys(KB.dtcs||{}).forEach(function(code){
      var item=KB.dtcs[code]||{};
      var aliases=(item.aliases||[]).map(function(x){return String(x).toUpperCase();});
      var scoped=!item.scope||!item.scope.length||scopeCompatible(item.scope,c||{});
      if(!scoped)return;
      if(out.indexOf(code)>=0) out=out.concat(aliases);
      aliases.forEach(function(a){if(out.indexOf(a)>=0)out.push(code);});
    });
    return uniq(out);
  }

  function matchesScope(list,value){
    if(!list || !list.length) return true;
    if(!value) return false;
    var n=norm(value);
    return list.some(function(x){return n.indexOf(norm(x))>=0 || norm(x).indexOf(n)>=0;});
  }

  function scoreRule(rule,c){
    var score=0, reasons=[];
    var b=norm(c.brand),m=norm(c.model),e=norm(c.engine);
    var text=norm([c.question,c.mediaText,c.testText,c.measurements].join(" "));
    var hay=contextHay(c);
    var allDtcs=expandDtcs(c.dtcs,c);

    function listedInText(list){
      return !!(list&&list.length&&list.some(function(x){return hay.indexOf(norm(x))>=0;}));
    }

    if(rule.brands && rule.brands.length){
      if(b && !matchesScope(rule.brands,b)) return {rule:rule,score:-999,reasons:["marca incompatível"]};
      var brandHit=matchesScope(rule.brands,b)||listedInText(rule.brands);
      if(brandHit){score+=15;reasons.push("marca");}
      else if(!m && !(rule.models&&listedInText(rule.models))) return {rule:rule,score:-999,reasons:["marca não informada"]};
    }
    if(rule.models && rule.models.length){
      if(m && !matchesScope(rule.models,m)) return {rule:rule,score:-999,reasons:["modelo incompatível"]};
      var modelHit=matchesScope(rule.models,m)||listedInText(rule.models);
      if(modelHit){score+=22;reasons.push("modelo");}
      else if(rule.brands&&rule.brands.length&&!listedInText(rule.brands)&&!b) return {rule:rule,score:-999,reasons:["modelo não informado"]};
    }
    if(rule.engines && rule.engines.length){
      if(e && !matchesScope(rule.engines,e)) return {rule:rule,score:-999,reasons:["motor incompatível"]};
      if(matchesScope(rule.engines,e)||listedInText(rule.engines)){score+=17;reasons.push("motor");}
    }

    var dtcHits=(rule.dtcs||[]).filter(function(x){return allDtcs.indexOf(String(x).toUpperCase())>=0;});
    if(dtcHits.length){score+=Math.min(46,28+(dtcHits.length-1)*7);reasons.push("dtc");}

    var keyHits=(rule.keywords||[]).filter(function(k){return text.indexOf(norm(k))>=0;});
    if(keyHits.length){score+=Math.min(36,keyHits.length*7);reasons.push("sintoma");}

    return {rule:rule,score:score,reasons:reasons,dtcHits:dtcHits,keyHits:keyHits};
  }

  function scoreFact(fact,c){
    var score=0, scopeHay=contextHay(c);
    function textHas(list){return !!(list&&list.some(function(x){return scopeHay.indexOf(norm(x))>=0;}));}
    if(fact.brands && fact.brands.length){
      if(c.brand && !matchesScope(fact.brands,c.brand)) return -999;
      if(matchesScope(fact.brands,c.brand)||textHas(fact.brands)) score+=12;
      else if(!c.model&&!textHas(fact.models||[])) return -999;
    }
    if(fact.models && fact.models.length){
      if(c.model && !matchesScope(fact.models,c.model)) return -999;
      if(matchesScope(fact.models,c.model)||textHas(fact.models)) score+=16;
    }
    if(fact.engines && fact.engines.length){
      if(c.engine && !matchesScope(fact.engines,c.engine)) return -999;
      if(matchesScope(fact.engines,c.engine)||textHas(fact.engines)) score+=14;
    }
    var hay=norm([c.question,c.mediaText,c.measurements,c.dtcs.join(" ")].join(" "));
    (fact.keywords||[]).forEach(function(k){if(hay.indexOf(norm(k))>=0)score+=9;});
    return score;
  }

  function buildContext(question){
    var mediaText=state.mediaAnalyses.map(function(x){return x.text||"";}).join("\n");
    var mediaCodes=extractCodes(mediaText);
    var qCodes=extractCodes(question);
    var testText=state.testResults.map(function(x){return x.title+" "+x.result;}).join(" ");
    return {
      brand:state.vehicle.brand||"",
      model:state.vehicle.model||"",
      year:state.vehicle.year||"",
      engine:state.vehicle.engine||"",
      transmission:state.vehicle.transmission||"",
      mileage:state.vehicle.mileage||"",
      question:String(question||"").trim(),
      mediaText:mediaText,
      measurements:"",
      testText:testText,
      dtcs:uniq(qCodes.concat(mediaCodes))
    };
  }

  function fallbackRule(){
    return {
      id:"baseline",evidence:"heuristic",title:"Triagem técnica inicial",sourceIds:[],
      hypotheses:[
        {name:"Reproduzir e definir a condição da falha",why:"Sem saber quando a falha aparece, qualquer peça vira apenas palpite.",weight:80},
        {name:"Alimentação, aterramento e sinais básicos",why:"Antes de componente caro, confirme as condições que permitem o sistema funcionar.",weight:76}
      ],
      tests:[
        {id:"baseline-scan",title:"Registrar a falha antes de apagar",procedure:"Leia todos os módulos, anote DTCs presentes/armazenados e parâmetros que mudam quando o sintoma aparece. Informe frio/quente, marcha lenta/carga e o que já foi trocado.",good:"falha reproduzida e dados registrados",bad:"falha ainda não reproduzida"}
      ],
      warnings:["Sem veículo/sistema específico eu não vou inventar torque, pressão, pinagem ou tolerância."]
    };
  }

  function evidenceLabel(score,rule){
    if(rule.evidence==="documented" && score>=45) return "procedimento técnico compatível";
    if(rule.evidence==="documented+shop" && score>=45) return "documentação + sequência de oficina";
    if(score>=55) return "alta aderência";
    if(score>=30) return "aderência moderada";
    return "triagem";
  }

  function buildDiagnosis(question){
    var c=buildContext(question);
    var ranked=(KB.rules||[]).map(function(r){return scoreRule(r,c);})
      .filter(function(x){return x.score>0;})
      .sort(function(a,b){return b.score-a.score;});
    if(!ranked.length) ranked=[{rule:fallbackRule(),score:10,reasons:["triagem"],dtcHits:[],keyHits:[]}];

    var top=ranked[0];
    var rule=top.rule;
    var dtcExpanded=expandDtcs(c.dtcs,c);
    var dtcInfo=[];
    Object.keys(KB.dtcs||{}).forEach(function(code){
      var item=KB.dtcs[code]||{};
      var aliases=item.aliases||[];
      var direct=c.dtcs.indexOf(code)>=0;
      var scoped=!item.scope||!item.scope.length||scopeCompatible(item.scope,c);
      var aliasHit=scoped&&aliases.some(function(a){return dtcExpanded.indexOf(String(a).toUpperCase())>=0;});
      if(direct||aliasHit){
        dtcInfo.push({code:code,label:item.label,aliases:scoped?aliases:[]});
      }
    });

    var facts=(KB.facts||[]).map(function(f){return {fact:f,score:scoreFact(f,c)};})
      .filter(function(x){return x.score>0;})
      .sort(function(a,b){return b.score-a.score;})
      .slice(0,4)
      .map(function(x){return x.fact;});

    var hypotheses=[];
    ranked.slice(0,3).forEach(function(item){
      (item.rule.hypotheses||[]).forEach(function(h){
        if(!hypotheses.some(function(x){return x.name===h.name;})) hypotheses.push(h);
      });
    });
    hypotheses=hypotheses.slice(0,4);

    var tests=[];
    ranked.slice(0,2).forEach(function(item){
      (item.rule.tests||[]).forEach(function(t){
        if(!tests.some(function(x){return x.id===t.id;})) tests.push(t);
      });
    });

    var warnings=uniq([].concat.apply([],ranked.slice(0,2).map(function(x){return x.rule.warnings||[];}))).slice(0,4);

    return {
      context:c,
      ruleId:rule.id,
      title:rule.title,
      evidence:evidenceLabel(top.score,rule),
      score:top.score,
      dtcs:dtcInfo,
      facts:facts,
      hypotheses:hypotheses,
      tests:tests,
      warnings:warnings
    };
  }

  function recordMessage(role,text,extra){
    var msg={role:role,text:String(text||""),at:now()};
    if(extra) Object.keys(extra).forEach(function(k){msg[k]=extra[k];});
    state.messages.push(msg);
    if(state.messages.length>80) state.messages=state.messages.slice(-80);
    return msg;
  }

  function scrollMessages(){
    var box=$("messages");
    requestAnimationFrame(function(){box.scrollTop=box.scrollHeight;});
  }

  function appendTextMessage(role,text,opts){
    opts=opts||{};
    var article=document.createElement("article");
    article.className="message "+role+(opts.typing?" typing":"");
    if(role==="bot"){
      var av=document.createElement("div");av.className="message-avatar";av.setAttribute("aria-hidden","true");
      av.setAttribute("aria-hidden","true");
      article.appendChild(av);
    }
    var bubble=document.createElement("div");bubble.className="bubble";
    if(role==="bot") bubble.innerHTML='<strong>th<span class="ia">IA</span>guinho</strong>';
    var p=document.createElement("p");p.textContent=text;bubble.appendChild(p);
    article.appendChild(bubble);
    $("messages").appendChild(article);
    if(role==="bot" && !opts.typing){
      state.lastBotText=String(text||"");
      if(state.settings.sound && state.settings.autoSpeak) speakText(state.lastBotText);
    }
    scrollMessages();
    return article;
  }

  function appendDiagnosis(diag){
    var article=document.createElement("article");
    article.className="message bot";
    article.innerHTML='<div class="message-avatar" aria-hidden="true"></div>';
    var bubble=document.createElement("div");bubble.className="bubble";
    bubble.innerHTML='<strong>th<span class="ia">IA</span>guinho</strong>';

    var lead=document.createElement("p");
    var vehicle=vehicleText(state.vehicle);
    lead.textContent=(vehicle?vehicle+": ":"")+diag.title+".";
    bubble.appendChild(lead);

    if(diag.dtcs.length){
      var sec=document.createElement("div");sec.className="answer-section";
      sec.innerHTML='<span class="answer-title">Códigos identificados</span><ul>'+
        diag.dtcs.slice(0,5).map(function(d){
          var aliases=d.aliases&&d.aliases.length?' <small>('+esc(d.aliases.join(", "))+')</small>':'';
          return '<li><b>'+esc(d.code)+'</b> — '+esc(d.label)+aliases+'</li>';
        }).join("")+'</ul>';
      bubble.appendChild(sec);
    }

    if(diag.facts.length){
      var fsec=document.createElement("div");fsec.className="answer-section";
      fsec.innerHTML='<span class="answer-title">Valores / procedimentos confirmados para este contexto</span><ul>'+
        diag.facts.slice(0,3).map(function(f){return '<li>'+esc(f.value)+'</li>';}).join("")+'</ul>';
      bubble.appendChild(fsec);
    }

    if(diag.remoteEvidence && diag.remoteEvidence.length){
      var rsec=document.createElement("div");rsec.className="answer-section";
      rsec.innerHTML='<span class="answer-title">Base técnica interna relacionada</span><ul>'+
        diag.remoteEvidence.slice(0,3).map(function(e){return '<li>'+esc(e.snippet)+'</li>';}).join("")+'</ul>';
      bubble.appendChild(rsec);
    }

    if(diag.hypotheses.length){
      var hsec=document.createElement("div");hsec.className="answer-section";
      hsec.innerHTML='<span class="answer-title">Prioridades agora</span><ul>'+
        diag.hypotheses.slice(0,4).map(function(h,i){return '<li><b>'+(i+1)+'. '+esc(h.name)+'</b> — '+esc(h.why)+'</li>';}).join("")+'</ul>';
      bubble.appendChild(hsec);
    }

    if(diag.tests.length){
      var t=diag.tests[0];
      var box=document.createElement("div");box.className="test-box";
      box.innerHTML='<b>Faça agora: '+esc(t.title)+'</b><p>'+esc(t.procedure)+'</p>'+
        '<div class="test-actions">'+
        '<button type="button" class="good" data-test-result="good">Dentro do esperado</button>'+
        '<button type="button" class="bad" data-test-result="bad">Fora do esperado</button>'+
        '<button type="button" class="skip" data-test-result="skip">Não testei</button>'+
        '</div>';
      box.dataset.testId=t.id;
      bubble.appendChild(box);
    }

    if(diag.warnings.length){
      var wsec=document.createElement("div");wsec.className="answer-section";
      wsec.innerHTML='<span class="answer-title">Antes de trocar peça</span><ul>'+
        diag.warnings.slice(0,3).map(function(w){return '<li>'+esc(w)+'</li>';}).join("")+'</ul>';
      bubble.appendChild(wsec);
    }

    var tag=document.createElement("span");tag.className="evidence-tag";tag.textContent="✓ "+diag.evidence;
    bubble.appendChild(tag);
    article.appendChild(bubble);
    $("messages").appendChild(article);

    state.currentDiagnosis=diag;
    state.activeTests=diag.tests.slice();
    state.activeTestIndex=0;

    article.querySelectorAll("[data-test-result]").forEach(function(btn){
      btn.addEventListener("click",function(){handleTestResult(btn.dataset.testResult);});
    });

    scrollMessages();
  }

  function handleTestResult(result){
    if(!state.activeTests.length) return;
    var t=state.activeTests[state.activeTestIndex]||state.activeTests[0];
    var label=result==="good"?firstNonEmpty(t.good,"dentro do esperado"):result==="bad"?firstNonEmpty(t.bad,"fora do esperado"):"não realizado";
    state.testResults.push({id:t.id,title:t.title,result:label,at:now()});
    var userText='Resultado do teste "'+t.title+'": '+label+".";
    appendTextMessage("user",userText);
    recordMessage("user",userText,{testResult:true});

    state.activeTestIndex++;
    if(state.activeTestIndex<state.activeTests.length){
      var next=state.activeTests[state.activeTestIndex];
      var bot='Registrei. Próximo teste: '+next.title+".\n"+next.procedure;
      appendTextMessage("bot",bot);
      recordMessage("bot",bot,{testStep:true});
      state.currentDiagnosis.tests=state.activeTests.slice(state.activeTestIndex);
    }else{
      var bot2="Registrei o resultado. Agora me diga se o sintoma mudou, permaneceu igual ou se apareceu algum novo DTC/parâmetro.";
      appendTextMessage("bot",bot2);
      recordMessage("bot",bot2,{testStep:true});
    }
    persistSession();
  }

  function isGreeting(text){
    return /^(oi|ola|olá|e ai|eai|bom dia|boa tarde|boa noite|fala)\b/.test(norm(text));
  }

  function handleQuestion(text,options){
    options=options||{};
    text=String(text||"").trim();
    if(!text) return;

    appendTextMessage("user",text);
    recordMessage("user",text);
    $("chatInput").value=""; autoResize();

    var typing=appendTextMessage("bot","Consultando a base técnica interna",{typing:true});
    setTimeout(async function(){
      if(isGreeting(text)){
        typing.remove();
        var greeting="Estou pronto. Me diga o veículo e o defeito. Se tiver código, tensão, pressão, temperatura ou algo já trocado, mande junto.";
        appendTextMessage("bot",greeting);recordMessage("bot",greeting);persistSession();return;
      }

      if(norm(text).indexOf("quem e voce")>=0 || norm(text).indexOf("seu nome")>=0){
        typing.remove();
        var who="Sou o thIAguinho, IA Mecânico da thIAguinho Soluções Automotiva. Cruzo o contexto do veículo com a base técnica interna e organizo o diagnóstico por evidências, sem condenar peça sem teste.";
        appendTextMessage("bot",who);recordMessage("bot",who);persistSession();return;
      }

      var diag=buildDiagnosis(text);
      if(window.ORACLE_REMOTE_KNOWLEDGE){
        try{
          var hits=await ORACLE_REMOTE_KNOWLEDGE.search(text,state.vehicle,6);
          if(hits && hits.length){
            diag.remoteEvidence=hits;
            diag.evidence="base técnica interna + "+diag.evidence;
            if(diag.ruleId==="baseline") diag.title="Diagnóstico orientado pela base técnica interna";
          }
        }catch(err){
          console.warn("[Knowledge search]",err);
        }
      }

      typing.remove();
      appendDiagnosis(diag);

      var summary=diag.title;
      if(diag.tests[0]) summary+=" | Próximo: "+diag.tests[0].title;
      recordMessage("bot",summary,{diagnosis:diag.ruleId,knowledgeHits:diag.remoteEvidence?diag.remoteEvidence.length:0});
      persistSession();
    },options.immediate?20:180);
  }

  function buildSessionPayload(){
    var allCodes=[];
    state.messages.forEach(function(m){allCodes=allCodes.concat(extractCodes(m.text));});
    state.mediaAnalyses.forEach(function(m){allCodes=allCodes.concat(m.codes||[]);});
    var firstUser=state.messages.find(function(m){return m.role==="user" && !m.testResult;});
    return {
      id:state.sessionId,
      createdAt:state.createdAt,
      updatedAt:now(),
      vehicle:vehicleText(state.vehicle)||"Veículo não informado",
      vehicleData:state.vehicle,
      title:(firstUser?firstUser.text:"Novo diagnóstico").slice(0,140),
      messages:state.messages.slice(-60).map(function(m){return {role:m.role,text:(m.text||"").slice(0,5000),at:m.at};}),
      dtcs:uniq(allCodes),
      tests:state.testResults.slice(-20),
      lastDiagnosis:state.currentDiagnosis?{
        ruleId:state.currentDiagnosis.ruleId,
        title:state.currentDiagnosis.title,
        evidence:state.currentDiagnosis.evidence,
        nextTest:state.currentDiagnosis.tests&&state.currentDiagnosis.tests[0]?state.currentDiagnosis.tests[0].title:""
      }:null,
      mediaAnalysis:state.mediaAnalyses.map(function(m){
        return {kind:m.kind,text:(m.text||"").slice(0,5000),codes:m.codes||[],frames:m.frames||1};
      })
    };
  }

  function persistSession(){
    if(!state.messages.length) return;
    var item=buildSessionPayload();
    var local=loadJSON("thiaguinho_history",[]).filter(function(x){return x.id!==item.id;});
    local.unshift(item);local=local.slice(0,50);saveJSON("thiaguinho_history",local);
    renderHistory(state.cloudHistory.length?state.cloudHistory:local);
    if(window.ORACLE_FIREBASE){
      ORACLE_FIREBASE.saveCase(item).catch(function(err){
        console.warn("[Realtime]",err);
        toast("Histórico salvo neste aparelho; nuvem indisponível");
      });
    }
  }

  function renderHistory(rows){
    rows=Array.isArray(rows)?rows:[];
    var list=$("historyList");
    $("historyStatus").textContent=rows.length+" diagnóstico(s)";
    if(!rows.length){
      list.innerHTML='<div class="empty">Seu histórico ainda está vazio.</div>';return;
    }
    list.innerHTML=rows.map(function(x,i){
      var dtcs=x.dtcs&&x.dtcs.length?" • "+x.dtcs.slice(0,4).join(", "):"";
      return '<button type="button" class="history-item" data-history-index="'+i+'">'+
        '<div><strong>'+esc(x.vehicle||"Veículo não informado")+'</strong>'+
        '<p>'+esc((x.title||x.lastDiagnosis&&x.lastDiagnosis.title||"Diagnóstico").slice(0,150))+esc(dtcs)+'</p></div>'+
        '<time>'+esc(formatDate(x.updatedAt||x.createdAt))+'</time></button>';
    }).join("");
    list.querySelectorAll("[data-history-index]").forEach(function(btn){
      btn.addEventListener("click",function(){loadHistoryItem(rows[Number(btn.dataset.historyIndex)]);});
    });
  }

  function formatDate(v){
    try{return new Date(v).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});}catch(e){return "";}
  }

  function loadHistoryItem(item){
    closeDialog($("historyDialog"));
    state.sessionId=item.id||newSessionId();
    state.createdAt=item.createdAt||now();
    state.vehicle=item.vehicleData||{};
    state.messages=(item.messages||[]).slice();
    state.testResults=(item.tests||[]).slice();
    state.mediaAnalyses=(item.mediaAnalysis||[]).map(function(m){return Object.assign({status:"Análise recuperada do histórico"},m);});
    state.currentDiagnosis=null;state.activeTests=[];state.activeTestIndex=0;
    saveJSON("thiaguinho_vehicle",state.vehicle);updateVehicleUI();renderMediaQueue();

    $("messages").innerHTML="";
    if(!state.messages.length){
      appendTextMessage("bot","Histórico aberto. Continue me contando o que aconteceu depois.");
    }else{
      state.messages.forEach(function(m){appendTextMessage(m.role==="user"?"user":"bot",m.text);});
    }
    scrollMessages();
    toast("Diagnóstico reaberto");
  }

  function startNewCase(){
    state.sessionId=newSessionId();state.createdAt=now();state.messages=[];state.mediaAnalyses=[];state.currentDiagnosis=null;
    state.activeTests=[];state.activeTestIndex=0;state.testResults=[];
    $("messages").innerHTML='<article class="message bot welcome"><div class="message-avatar" aria-hidden="true"></div><div class="bubble"><strong>th<span class="ia">IA</span>guinho</strong><p>Novo diagnóstico. Me diga o sintoma, DTC ou mande a tela do scanner.</p></div></article>';
    renderMediaQueue();$("chatInput").focus();toast("Novo diagnóstico");
  }

  function speakText(text){
    if(!state.settings.sound){toast("Som desativado nas configurações");return;}
    if(!("speechSynthesis" in window) || !text){toast("Leitura por voz não disponível neste navegador");return;}
    window.speechSynthesis.cancel();
    var u=new SpeechSynthesisUtterance(String(text));
    u.lang="pt-BR";u.rate=.98;u.pitch=1.02;
    u.onstart=function(){document.body.classList.add("mascot-talking");};
    u.onend=u.onerror=function(){document.body.classList.remove("mascot-talking");};
    window.speechSynthesis.speak(u);
  }

  function applyMotionSetting(){
    document.documentElement.dataset.motion=state.settings.motion===false?"off":"on";
  }

  function loadSavedVehicles(){ return loadJSON("thiaguinho_saved_vehicles",[]); }
  function saveSavedVehicles(list){ saveJSON("thiaguinho_saved_vehicles",list||[]); }

  function vehicleFromForm(){
    var v={};
    ["brand","model","year","engine","transmission","mileage"].forEach(function(k){v[k]=$(k).value.trim();});
    return v;
  }

  function fillVehicleForm(v){
    v=v||{};
    ["brand","model","year","engine","transmission","mileage"].forEach(function(k){$(k).value=v[k]||"";});
  }

  function renderSavedVehicles(){
    var box=$("savedVehiclesList"); if(!box)return;
    var list=loadSavedVehicles();
    if(!list.length){box.innerHTML='<div class="empty saved-empty">Nenhum veículo salvo.</div>';return;}
    box.innerHTML=list.map(function(v,i){
      var title=vehicleText(v)||("Veículo "+(i+1));
      return '<article class="saved-vehicle"><div><strong>'+esc(title)+'</strong><small>'+esc(v.mileage?("KM "+v.mileage):"")+'</small></div><div class="saved-vehicle-actions"><button type="button" class="ghost-btn" data-use-vehicle="'+i+'">Usar</button><button type="button" class="ghost-btn danger" data-delete-vehicle="'+i+'">Excluir</button></div></article>';
    }).join("");
    box.querySelectorAll("[data-use-vehicle]").forEach(function(btn){
      btn.addEventListener("click",function(){
        var v=loadSavedVehicles()[Number(btn.dataset.useVehicle)];
        if(!v)return;fillVehicleForm(v);state.vehicle=Object.assign({},v);saveJSON("thiaguinho_vehicle",state.vehicle);updateVehicleUI();toast("Veículo carregado");
      });
    });
    box.querySelectorAll("[data-delete-vehicle]").forEach(function(btn){
      btn.addEventListener("click",function(){
        var list=loadSavedVehicles();list.splice(Number(btn.dataset.deleteVehicle),1);saveSavedVehicles(list);renderSavedVehicles();toast("Veículo excluído");
      });
    });
  }

  function saveCurrentVehicleProfile(){
    var v=vehicleFromForm();
    if(!vehicleText(v)){toast("Preencha ao menos marca ou modelo");return;}
    var list=loadSavedVehicles();
    var key=norm([v.brand,v.model,v.year,v.engine].join("|"));
    var idx=list.findIndex(function(x){return norm([x.brand,x.model,x.year,x.engine].join("|"))===key;});
    if(idx>=0) list[idx]=v; else list.unshift(v);
    saveSavedVehicles(list.slice(0,30));renderSavedVehicles();toast(idx>=0?"Veículo atualizado":"Veículo salvo");
  }

  function initSettings(){
    applyMotionSetting();
    var open=function(){
      $("soundEnabled").checked=state.settings.sound!==false;
      $("autoSpeakEnabled").checked=!!state.settings.autoSpeak;
      $("motionEnabled").checked=state.settings.motion!==false;
      openDialog($("settingsDialog"));
    };
    if($("settingsBtn")) $("settingsBtn").addEventListener("click",open);
    if($("closeSettingsBtn")) $("closeSettingsBtn").addEventListener("click",function(){closeDialog($("settingsDialog"));});
    if($("soundBtn")) $("soundBtn").addEventListener("click",function(){speakText(state.lastBotText||"Estou pronto para diagnosticar.");});
    if($("speakLastSettingsBtn")) $("speakLastSettingsBtn").addEventListener("click",function(){speakText(state.lastBotText||"Estou pronto para diagnosticar.");});

    ["soundEnabled","autoSpeakEnabled","motionEnabled"].forEach(function(id){
      if(!$(id))return;
      $(id).addEventListener("change",function(){
        state.settings.sound=$("soundEnabled").checked;
        state.settings.autoSpeak=$("autoSpeakEnabled").checked;
        state.settings.motion=$("motionEnabled").checked;
        saveJSON("thiaguinho_settings",state.settings);applyMotionSetting();
        if(!state.settings.sound && window.speechSynthesis) window.speechSynthesis.cancel();
      });
    });
    if($("clearSavedVehiclesBtn")) $("clearSavedVehiclesBtn").addEventListener("click",function(){
      if(!confirm("Apagar todos os veículos salvos?"))return;
      saveSavedVehicles([]);renderSavedVehicles();toast("Veículos salvos apagados");
    });
  }

  function initVehicle(){
    updateVehicleUI();
    var open=function(){updateVehicleUI();renderSavedVehicles();openDialog($("vehicleDialog"));};
    $("vehicleBtn").addEventListener("click",open);
    $("vehicleComposerBtn").addEventListener("click",open);
    $("saveVehicleBtn").addEventListener("click",function(e){
      e.preventDefault();
      state.vehicle=vehicleFromForm();
      saveJSON("thiaguinho_vehicle",state.vehicle);updateVehicleUI();closeDialog($("vehicleDialog"));
      toast("Veículo aplicado");
      if(state.messages.length) persistSession();
    });
    $("clearVehicleBtn").addEventListener("click",function(){
      state.vehicle={};saveJSON("thiaguinho_vehicle",state.vehicle);updateVehicleUI();fillVehicleForm({});
    });
    if($("saveVehicleProfileBtn")) $("saveVehicleProfileBtn").addEventListener("click",saveCurrentVehicleProfile);
    renderSavedVehicles();
  }

  function initTheme(){
    var btn=$("themeBtn"),meta=$("themeColorMeta");
    var media=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)");
    var mode=localStorage.getItem("thiaguinho_theme")||"auto";
    function resolved(){return mode==="auto"?(media&&media.matches?"dark":"light"):mode;}
    function paint(){
      var r=resolved();document.documentElement.dataset.theme=r;
      btn.textContent=mode==="auto"?"◐":mode==="light"?"☀":"☾";
      btn.title="Tema: "+(mode==="auto"?"automático":mode==="light"?"claro":"escuro");
      if(meta)meta.content=r==="light"?"#eef5fa":"#07111f";
    }
    btn.addEventListener("click",function(){mode=mode==="auto"?"light":mode==="light"?"dark":"auto";localStorage.setItem("thiaguinho_theme",mode);paint();});
    if(media){
      var fn=function(){if(mode==="auto")paint();};
      if(media.addEventListener)media.addEventListener("change",fn);else if(media.addListener)media.addListener(fn);
    }
    paint();
  }

  function autoResize(){
    var el=$("chatInput");el.style.height="auto";el.style.height=Math.min(el.scrollHeight,112)+"px";
  }

  function renderMediaQueue(){
    var q=$("mediaQueue");
    if(!state.mediaAnalyses.length){q.innerHTML="";return;}
    q.innerHTML=state.mediaAnalyses.map(function(x,i){
      var pct=typeof x.progress==="number"?x.progress:100;
      var status=x.status||"Analisado";
      var codes=x.codes&&x.codes.length?'<span class="media-codes">'+esc(x.codes.join(", "))+'</span>':'';
      return '<div class="media-item"><div class="media-item-main"><span class="media-icon">'+(x.kind==="video"?"🎥":"📷")+'</span>'+
        '<div><strong>'+(x.kind==="video"?"Vídeo":"Foto")+'</strong><small>'+esc(status)+'</small>'+codes+
        (pct<100?'<div class="progress"><i style="width:'+pct+'%"></i></div>':'')+
        '</div></div><button type="button" class="media-remove" data-remove-media="'+i+'" aria-label="Remover">×</button></div>';
    }).join("");
    q.querySelectorAll("[data-remove-media]").forEach(function(btn){
      btn.addEventListener("click",function(){state.mediaAnalyses.splice(Number(btn.dataset.removeMedia),1);renderMediaQueue();});
    });
  }

  async function processMedia(file){
    if(!file) return;
    if(file.size>120*1024*1024){toast("Vídeo/foto acima de 120 MB. Grave um trecho menor.");return;}
    if(!window.ORACLE_MEDIA){toast("Motor visual não carregou");return;}

    var idx=state.mediaAnalyses.length;
    state.mediaAnalyses.push({
      kind:(file.type||"").indexOf("video/")===0?"video":"foto",
      text:"",codes:[],status:"Preparando análise...",progress:0
    });
    renderMediaQueue();

    try{
      var result=await ORACLE_MEDIA.analyzeFile(file,function(p){
        if(!state.mediaAnalyses[idx]) return;
        state.mediaAnalyses[idx].progress=p;
        state.mediaAnalyses[idx].status="Lendo tela do scanner... "+p+"%";
        renderMediaQueue();
      });
      if(!state.mediaAnalyses[idx]) return;
      state.mediaAnalyses[idx]=Object.assign({},result,{
        progress:100,
        status:result.text?"Leitura concluída; arquivo descartado":"Sem texto legível; arquivo descartado"
      });
      renderMediaQueue();

      var codes=result.codes||[];
      var text="";
      if(codes.length) text="Identifiquei na mídia: "+codes.join(", ")+".";
      else if(result.text) text="Consegui extrair informações da tela. Vou usar essa leitura no diagnóstico.";
      else text="Analisei os quadros, mas não consegui extrair texto confiável da tela. Tente uma imagem mais próxima e sem reflexo.";
      appendTextMessage("bot",text);recordMessage("bot",text,{mediaRead:true});

      if(codes.length || result.text){
        handleQuestion("Analise a mídia do scanner que acabei de enviar e me diga o próximo teste.",{immediate:true});
      }else persistSession();
    }catch(err){
      console.warn("[Mídia]",err);
      if(state.mediaAnalyses[idx]){
        state.mediaAnalyses[idx].progress=100;
        state.mediaAnalyses[idx].status="Não consegui ler esta mídia; arquivo descartado";
        renderMediaQueue();
      }
      toast("Não consegui ler esta mídia");
    }
  }

  function initMedia(){
    $("photoBtn").addEventListener("click",function(){$("photoInput").click();});
    $("videoBtn").addEventListener("click",function(){$("videoInput").click();});
    $("photoInput").addEventListener("change",function(){var f=this.files&&this.files[0];this.value="";processMedia(f);});
    $("videoInput").addEventListener("change",function(){var f=this.files&&this.files[0];this.value="";processMedia(f);});
  }

  function initVoice(){
    var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    var btn=$("micBtn");
    if(!SR){btn.style.display="none";return;}
    var rec=new SR();state.recognition=rec;rec.lang="pt-BR";rec.interimResults=true;rec.continuous=false;
    var finalText="";
    btn.addEventListener("click",function(){
      if(btn.classList.contains("listening")){rec.stop();return;}
      finalText=$("chatInput").value.trim();
      try{rec.start();}catch(e){}
    });
    rec.onstart=function(){btn.classList.add("listening");toast("Pode falar");};
    rec.onresult=function(e){
      var interim="",finalPart="";
      for(var i=e.resultIndex;i<e.results.length;i++){
        if(e.results[i].isFinal) finalPart+=e.results[i][0].transcript; else interim+=e.results[i][0].transcript;
      }
      if(finalPart) finalText=(finalText+" "+finalPart).trim();
      $("chatInput").value=(finalText+" "+interim).trim();autoResize();
    };
    rec.onend=function(){btn.classList.remove("listening");};
    rec.onerror=function(){btn.classList.remove("listening");};
  }

  function initFirebase(){
    var status=$("engineStatus"),pill=$("cloudStatus");
    var local=loadJSON("thiaguinho_history",[]);
    renderHistory(local);

    if(!window.ORACLE_FIREBASE){status.textContent="histórico local";return;}
    ORACLE_FIREBASE.ready.then(function(api){
      if(api.uid){
        status.textContent="histórico online";pill.classList.add("online");
        api.watchCases(function(rows){
          state.cloudHistory=rows||[];
          saveJSON("thiaguinho_history",state.cloudHistory.slice(0,50));
          renderHistory(state.cloudHistory);
        });
      }else{
        status.textContent="histórico local";pill.classList.remove("online");
      }
    });
    window.addEventListener("oracle:firebase-status",function(e){
      var online=!!(e.detail&&e.detail.online);
      status.textContent=online?"histórico online":"sem conexão";
      pill.classList.toggle("online",online);
    });
  }

  function initHistory(){
    $("historyBtn").addEventListener("click",function(){renderHistory(state.cloudHistory.length?state.cloudHistory:loadJSON("thiaguinho_history",[]));openDialog($("historyDialog"));});
    $("closeHistoryBtn").addEventListener("click",function(){closeDialog($("historyDialog"));});
    $("clearHistoryBtn").addEventListener("click",function(){
      if(!confirm("Apagar todo o seu histórico deste usuário anônimo?")) return;
      saveJSON("thiaguinho_history",[]);state.cloudHistory=[];renderHistory([]);
      if(window.ORACLE_FIREBASE){
        ORACLE_FIREBASE.clearCases().then(function(){toast("Histórico apagado");}).catch(function(){toast("Histórico local apagado");});
      }
    });
  }

  function initChat(){
    $("chatInput").addEventListener("input",autoResize);
    $("chatInput").addEventListener("keydown",function(e){
      if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("chatForm").requestSubmit();}
    });
    $("chatForm").addEventListener("submit",function(e){
      e.preventDefault();var text=$("chatInput").value.trim();if(text)handleQuestion(text);
    });
    $("quickPrompts").querySelectorAll("[data-prompt]").forEach(function(btn){
      btn.addEventListener("click",function(){handleQuestion(btn.dataset.prompt);});
    });
    $("newCaseBtn").addEventListener("click",startNewCase);
    if($("startChatBtn")) $("startChatBtn").addEventListener("click",function(){
      document.querySelector(".chat-card").scrollIntoView({behavior:"smooth",block:"start"});
      setTimeout(function(){$("chatInput").focus();},420);
    });
  }

  function initPwa(){
    var BUILD="1.4.0";
    window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();state.deferredInstall=e;$("installBtn").hidden=false;});
    $("installBtn").addEventListener("click",function(){
      if(!state.deferredInstall)return;
      state.deferredInstall.prompt();state.deferredInstall=null;$("installBtn").hidden=true;
    });

    if(!("serviceWorker" in navigator)) return;

    var refreshing=false,registration=null;
    navigator.serviceWorker.addEventListener("controllerchange",function(){
      if(refreshing)return;
      refreshing=true;
      // A nova versão já assumiu o PWA: recarrega uma única vez sem exigir reinstalação.
      window.location.reload();
    });

    function activateWaiting(reg){
      if(reg && reg.waiting) reg.waiting.postMessage({type:"SKIP_WAITING",build:BUILD});
    }

    function watchRegistration(reg){
      registration=reg;
      activateWaiting(reg);
      reg.addEventListener("updatefound",function(){
        var worker=reg.installing;
        if(!worker)return;
        worker.addEventListener("statechange",function(){
          if(worker.state==="installed" && navigator.serviceWorker.controller){
            worker.postMessage({type:"SKIP_WAITING",build:BUILD});
          }
        });
      });
    }

    async function checkUpdate(){
      if(!registration)return;
      try{
        await registration.update();
        activateWaiting(registration);
      }catch(err){console.warn("[SW update]",err);}
    }

    window.addEventListener("load",async function(){
      try{
        var reg=await navigator.serviceWorker.register("./sw-v134.js?v="+BUILD,{scope:"./",updateViaCache:"none"});
        watchRegistration(reg);
        await checkUpdate();
      }catch(err){console.warn("[SW]",err);}
    });

    document.addEventListener("visibilitychange",function(){
      if(document.visibilityState==="visible") checkUpdate();
    });
    window.addEventListener("focus",checkUpdate);
  }

  initTheme();
  initSettings();
  initVehicle();
  initChat();
  initMedia();
  initVoice();
  initHistory();
  initFirebase();
  initPwa();
  updateVehicleUI();
  autoResize();
  if(window.ORACLE_REMOTE_KNOWLEDGE) ORACLE_REMOTE_KNOWLEDGE.prefetch();
})();