(function(){
  "use strict";
  var KB = window.ORACLE_KNOWLEDGE || {sources:[],rules:[],dtcs:{},philosophy:[]};
  var state = {ranked:[], tests:[], testIndex:0, testLog:[], currentCase:null, deferredInstall:null, mediaAnalyses:[], cloudHistory:null};

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

  function getCase(){
    var mediaText=state.mediaAnalyses.map(function(x){return x.text||"";}).join("\n").trim();
    var mediaCodes=window.ORACLE_MEDIA ? ORACLE_MEDIA.detectCodes(mediaText) : [];
    var manualCodes=uniq(($("dtcs").value.toUpperCase().match(/[A-Z]{1,3}\d{3,5}|DF\d{3,4}/g)||[]));
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
      dtcs:uniq(manualCodes.concat(mediaCodes)),
      measurements:[$("measurements").value.trim(),mediaText ? "Leitura visual temporária do scanner: "+mediaText : ""].filter(Boolean).join("\n"),
      mediaAnalysis:state.mediaAnalyses.map(function(x){return {type:x.kind,text:(x.text||"").slice(0,4000),codes:x.codes||[]};})
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
    var brandMatch=rule.brands.length && rule.brands.some(function(x){return b.indexOf(norm(x))>=0;});
    var modelMatch=rule.models.length && rule.models.some(function(x){return m.indexOf(norm(x))>=0;});
    var engineMatch=rule.engines.length && rule.engines.some(function(x){return e.indexOf(norm(x))>=0;});
    if(rule.brands.length && b && !brandMatch) return {rule:rule,score:-999,reasons:["marca incompatível"]};
    if(rule.models.length && m && !modelMatch) return {rule:rule,score:-999,reasons:["modelo incompatível"]};
    if(rule.engines.length && e && !engineMatch) return {rule:rule,score:-999,reasons:["motor incompatível"]};
    if(brandMatch){score+=14;reasons.push("marca");}
    if(modelMatch){score+=20;reasons.push("modelo");}
    if(engineMatch){score+=16;reasons.push("motor");}
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
    $("diagnosisForm").reset();$("results").hidden=true;state.currentCase=null;state.ranked=[];state.tests=[];state.testLog=[];state.mediaAnalyses=[];
    var q=$("mediaQueue"); if(q) q.innerHTML="";
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
    lines.push("Powered by thIAguinho Soluções Automotiva");
    return lines.join("\n");
  }

  $("diagnosisForm").addEventListener("submit",function(e){e.preventDefault();var c=getCase();renderDiagnosis(c,analyze(c));});
  $("resetBtn").addEventListener("click",resetForm);
  if($("clearHistory")) $("clearHistory").addEventListener("click",function(){
    localStorage.removeItem("oracle_cases");
    state.cloudHistory=[];
    renderHistory([]);
    if(window.ORACLE_FIREBASE){
      ORACLE_FIREBASE.clearCases().then(function(){toast("Histórico apagado");}).catch(function(){toast("Histórico local apagado");});
    }else toast("Histórico local apagado");
  });
  $("copyReport").addEventListener("click",function(){navigator.clipboard.writeText(makeReport()).then(function(){toast("Laudo copiado");});});

  window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();state.deferredInstall=e;$("installBtn").hidden=false;});
  $("installBtn").addEventListener("click",function(){if(state.deferredInstall){state.deferredInstall.prompt();state.deferredInstall=null;$("installBtn").hidden=true;}});

  function initTheme(){
    var btn=$("themeBtn"), meta=$("themeColorMeta");
    if(!btn) return;
    var media=window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
    var mode=localStorage.getItem("oracle_theme") || "auto";
    function resolved(){ return mode==="auto" ? (media && media.matches ? "dark" : "light") : mode; }
    function paint(){
      var r=resolved();
      document.documentElement.dataset.theme=r;
      btn.innerHTML=(mode==="auto"?"◐ <span>Auto</span>":mode==="light"?"☀ <span>Claro</span>":"☾ <span>Escuro</span>");
      btn.title="Tema: "+(mode==="auto"?"automático":mode==="light"?"claro":"escuro");
      btn.setAttribute("aria-label",btn.title+". Toque para alternar.");
      if(meta) meta.setAttribute("content",r==="light"?"#f2f7fb":"#07111f");
    }
    btn.addEventListener("click",function(){
      mode=mode==="auto"?"light":mode==="light"?"dark":"auto";
      localStorage.setItem("oracle_theme",mode); paint(); toast("Tema "+(mode==="auto"?"automático":mode));
    });
    if(media){
      var onChange=function(){if(mode==="auto")paint();};
      if(media.addEventListener) media.addEventListener("change",onChange); else if(media.addListener) media.addListener(onChange);
    }
    paint();
  }

  function initMascot(){
    var panel=$("mascotPanel"), fab=$("mascotFab"), close=$("closeMascotBtn"), form=$("mascotForm"), input=$("mascotInput"), messages=$("mascotMessages"), hero=$("heroAskBtn"), speak=$("speakLastBtn");
    if(!panel || !fab || !form || !input || !messages) return;
    var lastBot="";

    function openPanel(){
      panel.hidden=false;
      fab.setAttribute("aria-expanded","true");
      setTimeout(function(){input.focus();},80);
    }
    function closePanel(){
      panel.hidden=true;
      fab.setAttribute("aria-expanded","false");
      if(window.speechSynthesis) window.speechSynthesis.cancel();
      document.body.classList.remove("mascot-talking");
    }
    function appendMessage(role,text){
      var el=document.createElement("div");
      el.className="msg "+role;
      var b=document.createElement("b");
      b.textContent=role==="bot"?"thIAguinho":"Você";
      var p=document.createElement("p");
      p.textContent=text;
      p.style.whiteSpace="pre-line";
      el.appendChild(b);el.appendChild(p);messages.appendChild(el);
      messages.scrollTop=messages.scrollHeight;
      if(role==="bot") lastBot=text;
      return el;
    }
    function findDtcInfo(codes){
      var hits=[];
      Object.keys(KB.dtcs||{}).forEach(function(code){
        var item=KB.dtcs[code], aliases=(item.aliases||[]).map(function(x){return x.toUpperCase();});
        if(codes.indexOf(code)>=0 || aliases.some(function(a){return codes.indexOf(a)>=0;})){
          hits.push({code:code,label:item.label,source:item.source,aliases:item.aliases||[]});
        }
      });
      return hits;
    }
    function assistantAnswer(question){
      var q=String(question||"").trim();
      var n=norm(q);
      if(!q) return "Escreva o sintoma, o DTC ou a medição que você quer investigar.";
      if(/^(oi|ola|olá|e ai|eai|bom dia|boa tarde|boa noite)\b/.test(n)){
        return "Estou pronto. Me diga o carro e o defeito. Se tiver DTC, tensão, pressão, temperatura ou algo já trocado, mande junto.";
      }
      if(n.indexOf("quem e voce")>=0 || n.indexOf("quem é você")>=0 || n.indexOf("seu nome")>=0){
        return "Sou o thIAguinho, IA mecânico da thIAguinho Soluções Automotiva. Minha função é organizar o diagnóstico por evidências: fonte, hipótese, teste e confirmação.";
      }
      if(n.indexOf("o que sabe")>=0 || n.indexOf("base")>=0 || n.indexOf("fontes")>=0 || n.indexOf("conhecimento")>=0){
        return "Meu conhecimento técnico fica no cérebro interno. Na tela eu mostro apenas o diagnóstico, os testes e a conclusão — sem expor nomes de conteúdo técnico interno.";
      }

      var codes=uniq((q.toUpperCase().match(/[A-Z]{1,3}\d{3,5}|DF\d{3,4}/g)||[]));
      var cse=getCase();
      cse.symptoms=[cse.symptoms,q].filter(Boolean).join(" ");
      cse.dtcs=uniq(cse.dtcs.concat(codes));
      var ranked=analyze(cse);
      var top=ranked[0] && ranked[0].rule;
      var dtcHits=findDtcInfo(cse.dtcs);
      var out=[];

      if(dtcHits.length){
        out.push(dtcHits.slice(0,3).map(function(d){
          return d.code+" — "+d.label+(d.aliases.length?" (equivalência: "+d.aliases.join(", ")+")":"");
        }).join("\n\n"));
      }
      if(top){
        if(top.id==="baseline"){
          out.push("Ainda não encontrei correspondência documental específica suficiente para esse conjunto. Não vou inventar uma peça.");
          out.push("Primeiro passo: "+top.tests[0].procedure);
        }else{
          out.push("Caminho mais aderente agora: "+top.title+".");
          if(top.hypotheses && top.hypotheses.length){
            out.push("Prioridades:\n"+top.hypotheses.slice(0,3).map(function(h,i){return (i+1)+". "+h.name+" — "+h.why;}).join("\n"));
          }
          if(top.tests && top.tests.length){
            out.push("Próximo teste: "+top.tests[0].title+"\n"+top.tests[0].procedure);
          }
          if(top.sourceIds && top.sourceIds.length) out.push("Base técnica interna consultada.");
        }
      }
      out.push("Antes de condenar componente, confirme alimentação, aterramento e sinal quando aplicável.");
      return out.join("\n\n");
    }
    function speakText(text){
      if(!("speechSynthesis" in window) || !text){toast("Leitura por voz não disponível");return;}
      window.speechSynthesis.cancel();
      var u=new SpeechSynthesisUtterance(text);
      u.lang="pt-BR";u.rate=.98;u.pitch=1.02;
      u.onstart=function(){document.body.classList.add("mascot-talking");};
      u.onend=u.onerror=function(){document.body.classList.remove("mascot-talking");};
      window.speechSynthesis.speak(u);
    }

    fab.addEventListener("click",function(){panel.hidden?openPanel():closePanel();});
    if(close) close.addEventListener("click",closePanel);
    if(hero) hero.addEventListener("click",openPanel);
    if(speak) speak.addEventListener("click",function(){speakText(lastBot);});
    form.addEventListener("submit",function(e){
      e.preventDefault();
      var q=input.value.trim();if(!q)return;
      appendMessage("user",q);input.value="";
      var thinking=appendMessage("bot","Analisando");
      thinking.classList.add("thinking");
      setTimeout(function(){
        thinking.remove();
        appendMessage("bot",assistantAnswer(q));
      },260);
    });
    fab.setAttribute("aria-expanded","false");
  }

  function initFirebaseHistory(){
    var status=$("engineStatus");
    if(!window.ORACLE_FIREBASE){
      if(status) status.textContent="histórico local";
      return;
    }
    ORACLE_FIREBASE.ready.then(function(api){
      if(status) status.textContent=api.uid?"histórico online":"histórico local";
      if(!api.uid) return;
      api.watchCases(function(rows){
        state.cloudHistory=rows;
        localStorage.setItem("oracle_cases",JSON.stringify(rows.slice(0,40)));
        renderHistory(rows);
      });
    });
    window.addEventListener("oracle:firebase-ready",function(){
      if(status) status.textContent="histórico online";
    });
  }

  function initMediaAnalysis(){
    var input=$("mediaInput"), queue=$("mediaQueue");
    if(!input || !queue) return;

    function render(){
      queue.innerHTML=state.mediaAnalyses.map(function(x,i){
        var codes=(x.codes||[]).length?'<span>'+esc(x.codes.join(", "))+'</span>':'';
        return '<div class="media-item"><div><strong>'+(x.kind==="video"?"🎥 Vídeo":"📷 Foto")+'</strong><small>'+esc(x.status||"Analisado")+'</small>'+codes+'</div><button type="button" data-remove="'+i+'" aria-label="Remover">×</button></div>';
      }).join("");
      queue.querySelectorAll("[data-remove]").forEach(function(btn){
        btn.addEventListener("click",function(){
          state.mediaAnalyses.splice(Number(btn.dataset.remove),1); render();
        });
      });
    }

    input.addEventListener("change",async function(){
      var files=Array.from(input.files||[]).slice(0,4);
      input.value="";
      for(var i=0;i<files.length;i++){
        var file=files[i];
        var placeholder={kind:(file.type||"").indexOf("video/")===0?"video":"foto",text:"",codes:[],status:"Preparando análise..."};
        state.mediaAnalyses.push(placeholder); var idx=state.mediaAnalyses.length-1; render();
        try{
          if(!window.ORACLE_MEDIA) throw new Error("Motor visual indisponível");
          var result=await ORACLE_MEDIA.analyzeFile(file,function(p){
            state.mediaAnalyses[idx].status="Analisando "+p+"%"; render();
          });
          state.mediaAnalyses[idx]=Object.assign({},result,{status:result.text?"Texto do scanner extraído":"Nenhum texto legível encontrado"});
          render();
          if(result.codes && result.codes.length){
            var current=$("dtcs").value.trim();
            $("dtcs").value=uniq((current?current.split(/[ ,;]+/):[]).concat(result.codes)).filter(Boolean).join(", ");
          }
          toast(result.text?"Mídia analisada; arquivo descartado":"Mídia lida; sem texto legível");
        }catch(err){
          state.mediaAnalyses[idx].status="Falha na análise local";
          render(); console.warn("[Mídia]",err); toast("Não consegui ler esta mídia");
        }
      }
    });
  }

  if("serviceWorker" in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("./sw.js").catch(function(){});});}
  initTheme();initTabs();renderHistory();initMascot();initFirebaseHistory();initMediaAnalysis();
})();