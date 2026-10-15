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
    pendingQuestion: null,
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
  function extractCodes(text){
    if(window.ORACLE_MEDIA) return window.ORACLE_MEDIA.detectCodes(text);
    return uniq(String(text||"").toUpperCase().match(/\b(?:[PBCU][0-3][0-9A-F]{3}|DF\d{3,4})\b/g)||[]);
  }
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
    if(scope.indexOf("duster")>=0&&c.model&&norm(c.model).indexOf("duster")<0) return false;
    if(scope.indexOf("renault")>=0&&c.brand&&!/renault|dacia/.test(norm(c.brand))) return false;
    var hay=contextHay(c);
    if(scope.indexOf("v42")>=0) return /\bv42\b/.test(hay)&&/duster/.test(hay);
    var models=scope.filter(function(token){return !/^(renault|dacia|lexus)$/i.test(token);});
    return (models.length?models:scope).some(function(token){return hay.indexOf(norm(token))>=0;});
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
    if(/^duster-v42-/.test(rule.id)&&!scopeCompatible(["duster","v42"],c)) return {rule:rule,score:-999};

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
      var namedEngines=rule.engines.filter(function(engine){return /[a-z]/i.test(engine);});
      if(namedEngines.length&&!namedEngines.some(function(engine){return (e||hay).indexOf(norm(engine))>=0;})) return {rule:rule,score:-999};
      if(matchesScope(rule.engines,e)||listedInText(rule.engines)){score+=17;reasons.push("motor");}
    }

    var dtcHits=(rule.dtcs||[]).filter(function(x){return allDtcs.indexOf(String(x).toUpperCase())>=0;});
    if(c.dtcs.length&&(rule.dtcs||[]).length&&!dtcHits.length) return {rule:rule,score:-999};
    if(dtcHits.length){score+=Math.min(46,28+(dtcHits.length-1)*7);reasons.push("dtc");}

    var keyHits=(rule.keywords||[]).filter(function(k){return text.indexOf(norm(k))>=0;});
    if(keyHits.length){score+=Math.min(36,keyHits.length*7);reasons.push("sintoma");}
    if(!dtcHits.length&&!keyHits.length) return {rule:rule,score:-999};

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
    var hits=(fact.keywords||[]).filter(function(k){return hay.indexOf(norm(k))>=0;});
    if(!hits.length) return -999;
    if((fact.sourceIds||[]).indexOf("duster-workshop")>=0&&!scopeCompatible(["duster","v42"],c)) return -999;
    var engines=(fact.engines||[]).filter(function(e){return /[a-z]/i.test(e);});
    if(engines.length&&!engines.some(function(e){return scopeHay.indexOf(norm(e))>=0;})) return -999;
    score+=hits.length*9;
    return score;
  }

  function buildContext(question){
    var mediaText=state.mediaAnalyses.map(function(x){return x.text||"";}).join("\n");
    var mediaCodes=extractCodes(mediaText);
    var qCodes=extractCodes(question);
    var testText=state.testResults.map(function(x){return x.title+" "+x.result;}).join(" ");
    var context={
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
      dtcs:qCodes.length?qCodes:mediaCodes
    };
    var provided=norm(String(question||"")+" "+mediaText);
    if(!context.model){
      var models=uniq([].concat.apply([],(KB.rules||[]).map(function(rule){return rule.models||[];})));
      context.model=models.find(function(model){return provided.indexOf(norm(model))>=0;})||"";
    }
    if(!context.engine){
      var engine=provided.match(/\b(k4m|k7m)\b/);
      if(engine) context.engine=engine[1].toUpperCase();
    }
    return context;
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
    var dtcInfo=c.dtcs.map(function(code){
      var item=KB.dtcs[code];
      if(item&&!/^[PBCU]0/.test(code)&&!scopeCompatible(item.scope,c)) item=null;
      if(!item){
        Object.keys(KB.dtcs||{}).some(function(key){
          var candidate=KB.dtcs[key];
          if((candidate.aliases||[]).indexOf(code)>=0&&scopeCompatible(candidate.scope,c)){
            item=candidate;return true;
          }
          return false;
        });
      }
      return {code:code,label:item?item.label:"",aliases:[]};
    });

    var facts=(KB.facts||[]).map(function(f){return {fact:f,score:scoreFact(f,c)};})
      .filter(function(x){return x.score>0;})
      .sort(function(a,b){return b.score-a.score;})
      .slice(0,4)
      .map(function(x){return x.fact;});

    var hypotheses=[];
    ranked.slice(0,1).forEach(function(item){
      (item.rule.hypotheses||[]).forEach(function(h){
        if(!hypotheses.some(function(x){return x.name===h.name;})) hypotheses.push(h);
      });
    });
    hypotheses=hypotheses.slice(0,4);

    var tests=[];
    ranked.slice(0,1).forEach(function(item){
      (item.rule.tests||[]).forEach(function(t){
        if(!tests.some(function(x){return x.id===t.id;})) tests.push(t);
      });
    });
    tests=tests.map(function(test){
      if(test.id!=="k4m-coil-check") return test;
      return Object.assign({},test,{
        title:"Verificar a faísca da bobina",
        procedure:"Confira o conector, a alimentação e o comando da bobina. Use um testador de centelha para verificar se há faísca.",
        good:"centelha presente e alimentação/comando corretos"
      });
    });

    var warnings=uniq(rule.warnings||[]);

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
      warnings:warnings,
      sourceIds:rule.sourceIds||[]
    };
  }

  function practicalAnswer(diag){
    var c=diag.context, q=norm(c.question), known=diag.dtcs.filter(function(d){return !!d.label;});
    var lead=diag.dtcs.length?diag.dtcs.slice(0,3).map(function(d){return d.code+(d.label?" — "+d.label:"");}).join("\n"):diag.title;
    if(diag.fromMedia&&diag.dtcs.length) lead="Li na tela:\n"+lead;
    if(diag.dtcs.length>3) lead+="\nMais "+(diag.dtcs.length-3)+" código(s) na leitura.";
    var answer={lead:lead,explanation:"",question:"",actions:[],needsVehicle:false,test:null,warning:""};
    var vehicleKnown=!!(c.model&&c.engine);
    var noStart=/nao (?:pega|liga)|sem partida/.test(q);
    if(noStart&&!/\bgira\b|\bgirando\b|\bclique\b/.test(q)){
      answer.lead="O motor não pega.";
      answer.question="Quando você tenta ligar, o motor gira ou nem gira?";
      answer.actions=[{label:"Gira",text:"O motor gira, mas não pega."},{label:"Não gira",text:"O motor não gira ao tentar ligar."}];
    }else if(diag.dtcs.length&&!vehicleKnown){
      answer.question="Qual é o veículo? Informe modelo, ano e motor para eu escolher o teste correto.";
      answer.needsVehicle=true;
    }else if(diag.dtcs.some(function(d){return !d.label;})){
      answer.question="Qual é a descrição completa desse código no scanner e em qual módulo ele aparece?";
    }else if((noStart||/motor nao gira/.test(q))&&!vehicleKnown){
      answer.question="Qual é o veículo? Informe modelo, ano e motor.";
      answer.needsVehicle=true;
    }else if(c.dtcs.indexOf("P0420")>=0&&!/sem forca|perda|entup|abaf|nao sobe/.test(q)){
      answer.question="Além da luz de injeção, o carro perde força? P0420 sozinho não comprova catalisador entupido.";
    }else if(diag.ruleId==="baseline"){
      answer.lead=known.length?lead:"Vamos por partes.";
      if(/motor nao gira/.test(q)){
        answer.question="Ao tentar ligar, você ouve algum clique ou as luzes do painel enfraquecem?";
      }else if(noStart){
        answer.question="Qual rotação (RPM) o scanner mostra enquanto o motor gira na partida?";
      }else{
        answer.question=/falha|falhando|rateia|engasga/.test(q)
          ?"A falha acontece a frio, a quente ou o tempo todo? Se houver código no scanner, envie também."
          :"Me diga o sintoma e a descrição do scanner. Ainda não tenho dados suficientes para indicar um teste específico.";
      }
    }else{
      answer.explanation=known.length?"O código indica uma condição de falha; sozinho, não confirma uma peça defeituosa.":"Comece por este teste e me diga o resultado.";
      answer.test=diag.tests[0]||null;
      answer.warning=(diag.warnings||[]).find(function(w){return /nao abrir|ruido mecanico|pressao real baixa|atencao imediata|nao prova/.test(norm(w));})||"";
    }
    answer.text=[answer.lead,answer.explanation,answer.question,answer.test?"Teste agora: "+answer.test.title+". "+answer.test.procedure+" Esperado: "+(answer.test.good||"informe a leitura observada")+".":"",answer.warning].filter(Boolean).join("\n\n");
    return answer;
  }

  function diagnosticSearchQuery(diag){
    if(!diag.context.model||!diag.context.dtcs.length) return "";
    if(practicalAnswer(diag).actions.length) return "";
    return diag.context.dtcs.join(" ");
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

  function appendTestBox(bubble,test){
    var box=document.createElement("div");box.className="test-box";
    box.innerHTML='<b>Teste agora: '+esc(test.title)+'</b><p>'+esc(test.procedure)+'</p>'+
      '<p class="test-expected"><b>Esperado:</b> '+esc(test.good||"Informe a leitura observada.")+'</p>'+
      '<div class="test-actions">'+
      '<button type="button" class="good" data-test-result="good">Normal</button>'+
      '<button type="button" class="bad" data-test-result="bad">Alterado</button>'+
      '<button type="button" class="skip" data-test-result="skip">Não testei</button></div>';
    var caseId=state.sessionId;
    box.querySelectorAll("[data-test-result]").forEach(function(btn){
      btn.addEventListener("click",function(){
        if(state.sessionId!==caseId||state.activeTests[state.activeTestIndex]!==test) return;
        if(btn.dataset.testResult!=="skip") box.querySelectorAll("button").forEach(function(b){b.disabled=true;});
        handleTestResult(btn.dataset.testResult);
      });
    });
    bubble.appendChild(box);
  }

  function appendDiagnosis(diag){
    var answer=practicalAnswer(diag);
    var article=document.createElement("article");article.className="message bot";
    article.innerHTML='<div class="message-avatar" aria-hidden="true"></div>';
    var bubble=document.createElement("div");bubble.className="bubble practical-answer";
    bubble.innerHTML='<strong>th<span class="ia">IA</span>guinho</strong>';
    [answer.lead,answer.explanation,answer.question].filter(Boolean).forEach(function(text){
      var p=document.createElement("p");p.textContent=text;bubble.appendChild(p);
    });

    state.currentDiagnosis=diag;
    state.activeTests=answer.test?diag.tests.slice():[];
    state.activeTestIndex=0;
    if(answer.test) appendTestBox(bubble,answer.test);
    if(answer.warning){
      var warning=document.createElement("p");warning.className="diagnosis-warning";
      warning.textContent=answer.warning;bubble.appendChild(warning);
    }
    if(answer.actions.length||answer.needsVehicle){
      var actions=document.createElement("div");actions.className="test-actions";
      answer.actions.forEach(function(action){
        var btn=document.createElement("button");btn.type="button";btn.textContent=action.label;
        btn.addEventListener("click",function(){handleQuestion(action.text);});actions.appendChild(btn);
      });
      if(answer.needsVehicle){
        var vehicleBtn=document.createElement("button");vehicleBtn.type="button";vehicleBtn.textContent="Informar veículo";
        vehicleBtn.addEventListener("click",function(){state.pendingQuestion=diag.context.question;$("vehicleBtn").click();});
        actions.appendChild(vehicleBtn);
      }
      bubble.appendChild(actions);
    }
    var refs=(diag.remoteEvidence||[]).slice(0,2).map(function(e){
      return (e.sourcePath||"Documento técnico").split(/[\\/]/).pop()+(e.page?" • pág. "+e.page:"");
    });
    (diag.sourceIds||[]).forEach(function(id){
      var source=(KB.sources||[]).find(function(x){return x.id===id;});
      if(source) refs.push(source.vehicle+" — "+source.system);
    });
    if(refs.length){
      var details=document.createElement("details");details.className="diagnosis-sources";
      details.innerHTML='<summary>Ver referências</summary><ul>'+uniq(refs).map(function(ref){return '<li>'+esc(ref)+'</li>';}).join("")+'</ul>';
      bubble.appendChild(details);
    }
    article.appendChild(bubble);$("messages").appendChild(article);
    state.lastBotText=answer.text;
    if(state.settings.sound&&state.settings.autoSpeak) speakText(answer.text);
    scrollMessages();
  }

  function handleTestResult(result){
    var t=state.activeTests[state.activeTestIndex];
    if(!t) return;
    if(result==="skip"){
      var skipped="Tudo bem. Diga o que impede esse teste ou o que você consegue medir agora.";
      appendTextMessage("bot",skipped);recordMessage("bot",skipped);persistSession();return;
    }
    var label=result==="good"?firstNonEmpty(t.good,"normal"):firstNonEmpty(t.bad,"alterado");
    state.testResults.push({id:t.id,title:t.title,result:label,at:now()});
    var userText=t.title+": "+label+".";
    appendTextMessage("user",userText);recordMessage("user",userText,{testResult:true});
    state.activeTestIndex++;
    var next=state.activeTests[state.activeTestIndex];
    if(next){
      var article=appendTextMessage("bot","Anotado. Vamos ao próximo teste.");
      appendTestBox(article.querySelector(".bubble"),next);
      var text="Teste agora: "+next.title+". "+next.procedure+" Esperado: "+(next.good||"informe a leitura")+".";
      state.lastBotText=text;recordMessage("bot",text,{testStep:true});
    }else{
      var followup="Anotado. Qual foi o valor medido e como o carro está se comportando agora?";
      appendTextMessage("bot",followup);recordMessage("bot",followup,{testStep:true});
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

    if(!options.silentUser){
      appendTextMessage("user",text);recordMessage("user",text);
      $("chatInput").value="";autoResize();
    }

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
      diag.fromMedia=options.fromMedia===true;
      var query=diagnosticSearchQuery(diag);
      if(query&&window.ORACLE_REMOTE_KNOWLEDGE){
        try{
          diag.remoteEvidence=await ORACLE_REMOTE_KNOWLEDGE.search(query,diag.context,2);
        }catch(err){console.warn("[Knowledge search]",err);}
      }
      typing.remove();
      appendDiagnosis(diag);
      recordMessage("bot",practicalAnswer(diag).text,{diagnosis:diag.ruleId,knowledgeHits:diag.remoteEvidence?diag.remoteEvidence.length:0});
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
    state.activeTests=[];state.activeTestIndex=0;state.testResults=[];state.pendingQuestion=null;
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
      if(state.pendingQuestion){
        var question=state.pendingQuestion;state.pendingQuestion=null;
        handleQuestion(question,{silentUser:true,immediate:true});
      }
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

      var codes=extractCodes(result.text||"");
      state.mediaAnalyses[idx].codes=codes;
      if(codes.length){
        var question=codes.join(" ");
        recordMessage("user","Código lido na mídia: "+codes.join(", "),{mediaRead:true});
        handleQuestion(question,{immediate:true,silentUser:true,fromMedia:true});
      }else{
        var candidates=ORACLE_MEDIA.codeCandidates(result.text||"");
        var message=candidates.length
          ?"A leitura ficou incerta. Você confirma o código "+candidates.join(" ou ")+"?"
          :result.text?"Li texto, mas não consegui confirmar um código. Digite o código e a descrição que aparecem no scanner."
          :"Não consegui ler a tela. Envie uma foto mais próxima, nítida e sem reflexo.";
        var article=appendTextMessage("bot",message),bubble=article.querySelector(".bubble");
        if(candidates.length){
          var actions=document.createElement("div");actions.className="test-actions";
          candidates.forEach(function(code){
            var btn=document.createElement("button");btn.type="button";btn.textContent="Confirmar "+code;
            btn.addEventListener("click",function(){
              actions.querySelectorAll("button").forEach(function(b){b.disabled=true;});
              handleQuestion(code);
            });actions.appendChild(btn);
          });
          var correct=document.createElement("button");correct.type="button";correct.textContent="Digitar código";
          correct.addEventListener("click",function(){$("chatInput").focus();});actions.appendChild(correct);
          bubble.appendChild(actions);
        }
        if(result.text){
          var reading=document.createElement("details");reading.className="diagnosis-sources";
          reading.innerHTML='<summary>Conferir o texto lido</summary>';
          var raw=document.createElement("p");raw.textContent=result.text.slice(0,240);reading.appendChild(raw);bubble.appendChild(reading);
        }
        recordMessage("bot",message,{mediaRead:true});persistSession();
      }

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
    var kind="photo";
    var dialog=$("mediaSourceDialog");

    function chooseSource(nextKind){
      kind=nextKind;
      var video=kind==="video";
      $("mediaSourceTitle").textContent=video?"Enviar vídeo":"Enviar foto";
      $("mediaCameraLabel").textContent=video?"Gravar vídeo":"Tirar foto";
      $("mediaCameraIcon").textContent=video?"🎥":"📷";
      $("mediaGalleryHint").textContent=video?"Vídeos salvos neste aparelho":"Fotos salvas neste aparelho";
      openDialog(dialog);
    }

    function openPicker(camera){
      closeDialog(dialog);
      $(kind+(camera?"CameraInput":"Input")).click();
    }

    $("photoBtn").addEventListener("click",function(){chooseSource("photo");});
    $("videoBtn").addEventListener("click",function(){chooseSource("video");});
    $("mediaCameraBtn").addEventListener("click",function(){openPicker(true);});
    $("mediaGalleryBtn").addEventListener("click",function(){openPicker(false);});
    $("closeMediaSourceBtn").addEventListener("click",function(){closeDialog(dialog);});

    ["photoInput","videoInput","photoCameraInput","videoCameraInput"].forEach(function(id){
      $(id).addEventListener("change",function(){
        var file=this.files&&this.files[0];
        this.value="";
        if(file) processMedia(file);
      });
    });
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

  // Instalação do PWA; o worker atual não intercepta requisições nem guarda o shell.
  function initPwa(){
    var BUILD="1.6.2";
    var btn=$("installBtn");
    var prompting=false;
    var installed=isStandalone();

    function isStandalone(){
      return !!(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches ||
                window.navigator.standalone===true);
    }

    function updateInstallUI(){
      if(btn){
        btn.hidden=false;
        btn.disabled=prompting;
        btn.title=installed?"thIAguinho instalado":"Instalar thIAguinho";
        btn.setAttribute("aria-label",btn.title);
        btn.setAttribute("aria-busy",String(prompting));
      }
      var action=$("installHelpBtn");
      if(action){
        action.disabled=prompting;
        action.textContent=state.deferredInstall&&!installed?"Instalar agora":"Entendi";
      }
      var hint=$("installHint");
      if(hint){
        var ua=navigator.userAgent||"";
        var ios=/iphone|ipad|ipod/i.test(ua)||navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1;
        if(state.deferredInstall&&!installed){
          hint.textContent="A instalação está disponível. Toque em “Instalar agora” e confirme no navegador para adicionar o thIAguinho como aplicativo.";
        }else if(ios){
          hint.textContent="Toque em Compartilhar no navegador e depois em “Adicionar à Tela de Início”. Confirme em “Adicionar”.";
        }else if(/android/i.test(ua)){
          hint.textContent="No navegador, abra o menu ⋮ e escolha “Instalar app” ou “Adicionar à tela inicial”.";
        }else if(/macintosh/i.test(ua)&&/safari/i.test(ua)&&!/chrome|chromium|crios|edg/i.test(ua)){
          hint.textContent="No Safari do Mac, abra Arquivo > Adicionar ao Dock e confirme em “Adicionar”.";
        }else{
          hint.textContent="No Chrome ou Edge, use o ícone de instalar na barra de endereço ou o menu do navegador > Instalar thIAguinho.";
        }
      }
    }

    function showInstallHelp(){
      updateInstallUI();
      if($("installDialog")) openDialog($("installDialog"));
      else toast("Use o menu do navegador para instalar o thIAguinho.");
    }

    async function requestInstall(){
      if(prompting) return;
      if(installed||isStandalone()){
        installed=true;
        updateInstallUI();
        toast("O thIAguinho já está instalado neste dispositivo");
        return;
      }
      if(!state.deferredInstall){showInstallHelp();return;}

      // Cada convite só pode ser usado uma vez, inclusive após cancelamento ou erro.
      var invite=state.deferredInstall;
      state.deferredInstall=null;
      prompting=true;
      updateInstallUI();
      try{
        var choice=await invite.prompt();
        if(!choice||!choice.outcome) choice=await invite.userChoice;
        if($("installDialog")) closeDialog($("installDialog"));
        if(!installed){
          toast(choice&&choice.outcome==="accepted"
            ?"Instalação solicitada ao navegador"
            :"Instalação cancelada. Você pode tentar novamente pelo menu do navegador.");
        }
      }catch(err){
        console.warn("[PWA install]",err);
        if(!installed) showInstallHelp();
      }finally{
        prompting=false;
        updateInstallUI();
      }
    }

    window.addEventListener("beforeinstallprompt",function(e){
      e.preventDefault();
      if(installed||isStandalone()) return;
      state.deferredInstall=e;
      updateInstallUI();
    });

    window.addEventListener("appinstalled",function(){
      installed=true;
      state.deferredInstall=null;
      updateInstallUI();
      toast("thIAguinho instalado neste dispositivo");
      if($("installDialog")) closeDialog($("installDialog"));
    });

    if(btn) btn.addEventListener("click",requestInstall);
    if($("closeInstallBtn")) $("closeInstallBtn").addEventListener("click",function(){closeDialog($("installDialog"));});
    if($("installHelpBtn")) $("installHelpBtn").addEventListener("click",function(){
      if(state.deferredInstall&&!installed) return requestInstall();
      closeDialog($("installDialog"));
    });
    updateInstallUI();

    if(!("serviceWorker" in navigator)) return;
    async function registerWorker(){
      try{
        await navigator.serviceWorker.register("./sw-v134.js?v="+BUILD,{scope:"./",updateViaCache:"none"});
      }catch(err){
        console.warn("[SW]",err);
      }
    }
    if(document.readyState==="complete") registerWorker();
    else window.addEventListener("load",registerWorker,{once:true});
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
