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
    caseContext: emptyCaseContext(),
    requestSequence: 0,
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
    return norm([c.brand,c.model,c.engine,c.transmission,c.caseText,c.question,c.mediaText].join(" "));
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

  function referenceYearCompatible(sourceIds,year){
    if(!/^(?:19|20)\d{2}$/.test(String(year||"")))return true;
    var ranges=(sourceIds||[]).map(function(id){return (KB.sources||[]).find(function(source){return source.id===id;});})
      .filter(function(source){return source&&source.referenceYears;});
    return !ranges.length||ranges.some(function(source){return Number(year)>=source.referenceYears[0]&&Number(year)<=source.referenceYears[1];});
  }

  function scoreRule(rule,c){
    var score=0, reasons=[];
    var b=norm(c.brand),m=norm(c.model),e=norm(c.engine);
    var text=norm([c.caseText,c.question,c.mediaText,c.testText,c.measurements].join(" "));
    text=text.replace(/\b(?:[pbcu][0-3][0-9a-f]{3}|df\d{3,4})\b/g,function(code){return c.dtcs.indexOf(code.toUpperCase())>=0?code:"";});
    var hay=contextHay(c);
    var allDtcs=expandDtcs(c.dtcs,c);
    if(!referenceYearCompatible(rule.sourceIds,c.year))return {rule:rule,score:-999,reasons:["ano fora da referência local"]};
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
    if(!referenceYearCompatible(fact.sourceIds,c.year))return -999;
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
    var hay=norm([c.caseText,c.question,c.mediaText,c.measurements,c.dtcs.join(" ")].join(" "));
    hay=hay.replace(/\b(?:[pbcu][0-3][0-9a-f]{3}|df\d{3,4})\b/g,function(code){return c.dtcs.indexOf(code.toUpperCase())>=0?code:"";});
    var hits=(fact.keywords||[]).filter(function(k){return hay.indexOf(norm(k))>=0;});
    if(!hits.length) return -999;
    if((fact.sourceIds||[]).indexOf("duster-workshop")>=0&&!scopeCompatible(["duster","v42"],c)) return -999;
    var engines=(fact.engines||[]).filter(function(e){return /[a-z]/i.test(e);});
    if(engines.length&&!engines.some(function(e){return scopeHay.indexOf(norm(e))>=0;})) return -999;
    score+=hits.length*9;
    return score;
  }

  function emptyCaseContext(){
    return {dtcs:[],symptom:"",temperature:"",cranking:"",details:[],candidateCode:"",incompleteCode:"",observedCylinder:0,
      observedCylinders:[],otherCodesKnown:false,awaiting:"",flowVersion:0,rpm:null,rpmPresent:false,rpmUnavailable:false,
      startAuthorized:"",ecuCommunication:"",starterSound:"",ambiguousCylinderReply:false,vehicleDetails:{},observations:{},dtcDescriptions:{},awaitingDtc:"",
      lastInputKind:"",confirmedCodeReminder:false,coilAppearance:null,engineCode:"",engineIdentificationUnavailable:false,repairVerified:false,
      componentRepair:"",noCodesReported:false,fuelType:"",interventions:[],noCodeScannerDataUnavailable:false,visionRows:[],scannerFaultStatus:"",compression:null,startingBattery:null,starterConnections:"",noStartReference:null,noStartFeedback:"",factVersion:1,continuityVersion:2};
  }

  function plugObservation(text,allowBare){
    var q=norm(text), status="(?:ok|normal|normais|boas?|secas?|molhadas?|encharcadas?|danificadas?|trincadas?|quebradas?|novas?)";
    var match=q.match(new RegExp("\\bvelas?\\s*(?:(?:esta|estao|ta|:|do cilindro \\d+)\\s*)?"+status+"\\b"));
    if(match)return text.slice(match.index,match.index+match[0].length).trim();
    if(allowBare&&new RegExp("^"+status+"[.! ]*$").test(q))return text;
    return "";
  }

  // Preserve reported fuel and workshop services without treating hypothetical work as performed.
  function captureWorkshopFacts(c,text){
    var parts=norm(text).split(/[,;]|\s+e\s+(?=(?:as?|os?)?\s*(?:velas?|bicos?|injetores?|cabos?))/);
    parts.forEach(function(part){
      part=part.trim();
      if(!part||/[?]/.test(part)||/\b(?:se eu|se fosse|sera que|poderia|deveria|talvez|pode ser|nao|nunca|sem)\b/.test(part))return;
      var fuel=part.match(/^(?:(?:combustivel\s*(?::|e)?\s*|uso\s+|abastecido\s+com\s+))?(gasolina|etanol|alcool|diesel|gnv)\b/);
      if(fuel)c.fuelType=fuel[1]==="alcool"?"etanol":fuel[1];
      var patterns=[
        ["velas",/\bvelas?\s+(?:novas?|trocadas?|substituidas?)\b|\b(?:troquei|substitui|coloquei)\s+(?:as?\s+)?velas?\b/],
        ["bicos",/\b(?:bicos?|injetores?)\s+(?:limpos?|limpados?|trocados?|substituidos?)\b|\b(?:limpei|limpamos|troquei|substitui)\s+(?:os?\s+)?(?:bicos?|injetores?)\b/],
        ["cabos",/\bcabos?(?:\s+de\s+(?:vela|ignicao))?\s+(?:novos?|trocados?|substituidos?)\b|\b(?:troquei|substitui|coloquei)\s+(?:os?\s+)?cabos?\b/]
      ];
      patterns.forEach(function(item){
        if(item[1].test(part)&&!c.interventions.some(function(record){return record.component===item[0]&&record.description===part;}))
          c.interventions.push({component:item[0],description:part,status:"relatado"});
      });
    });
  }

  function relevantObservation(slot,text){
    var q=norm(text);
    var patterns={
      "misfire-common-data":/(?:stft|ltft|curto|longo).*\d|[+-]?\d+(?:[.,]\d+)?\s*%/,
      "misfire-no-code-data":/marcha lenta|acelerando|sob carga|stft|ltft|\d+(?:[.,]\d+)?\s*%/,
      "misfire-plug-fluid":/\b(?:combustivel|gasolina|oleo)\b/,
      "misfire-compression-readings":/\d+(?:[.,]\d+)?\s*(?:bar|psi|kpa)\b/,
      "misfire-ignition-layout":/bobinas? individuais?|codigo do motor|motor [a-z0-9]{3,6}\b/,
      "no-start-tools":/multimetro|scanner|testador|osciloscopio|nenhum equipamento|nao tenho/,
      "no-start-battery":/\d+(?:[.,]\d+)?\s*(?:v\b|volts?\b)|bateria.*\d|antes.*\d|durante.*\d/,
      "no-start-ecu-power":/\d+(?:[.,]\d+)?\s*(?:v\b|volts?\b)|tensao.*\d/,
      "no-start-next-evidence":/centelha|faisca|injetor|sem codigos|[pbcu][0-3][0-9a-f]{3}/,
      "no-start-immobilizer-codes":/sem codigos|[pbcu][0-3][0-9a-f]{3}|imobilizador|chave/,
      "no-start-rotation-signal":/conector|chicote|sensor|sinal|[pbcu][0-3][0-9a-f]{3}/
    };
    return !!(patterns[slot]&&patterns[slot].test(q));
  }

  function cylinderReply(text,allowBare){
    var q=norm(text).replace(/[.!?]+$/g,"");
    var explicit=/^(?:(?:so|somente|apenas)\s+)?(?:(?:no|nos|o|os)\s+)?cilindros?\s+/.test(q)||/^(?:so|somente|apenas)\s+(?:no\s+)?\d/.test(q);
    if(!explicit&&!allowBare)return [];
    q=q.replace(/^(?:(?:so|somente|apenas)\s+)?(?:(?:no|nos|o|os)\s+)?(?:cilindros?\s+)?/,"");
    if(!/^(?:[1-9]|1[0-2])(?:\s*(?:,|e|\/|&)\s*(?:[1-9]|1[0-2]))*$/.test(q))return [];
    return uniq(q.match(/\d+/g).map(Number));
  }

  function unmeasuredReport(text){
    return /\b(?:pode ser|poderia|deveria|seria|sera que|se (?:eu |o scanner )?(?:medir|aparecer|mostrar|der|acusar)|nao (?:consegui |consigo )?(?:medir|medi|testei|verifiquei)|ainda nao)\b/.test(norm(text));
  }

  // A code in a question or an explicit denial is not a current scanner reading.
  function codeReport(text){
    var q=norm(text), present=[],absent=[];
    var pattern=/\b(?:[pbcu][ \t]*[0-3](?:[ \t]*[0-9a-f]){3}|df[ \t]*\d(?:[ \t]*\d){2,3})\b/g,match;
    while((match=pattern.exec(q))){
      var code=match[0].replace(/[ \t]/g,"").toUpperCase();
      var before=q.slice(0,match.index).split(/[;,!?.]/).pop();
      var after=q.slice(pattern.lastIndex).split(/[;,!?.]/)[0];
      var denied=/\b(?:nao (?:e|era|foi|tem|tenho|tinha|aparece|consta|acusa|apresenta)\s*(?:o codigo\s*|codigo\s*)?|sem (?:o )?(?:codigo )?)\s*$/.test(before)||/^\s*(?:nao (?:aparece|consta|voltou)|ausente|descartado)\b/.test(after);
      if(denied)absent.push(code);
      else if(!unmeasuredReport(before)&&!/^\s*(?:pode|poderia|seria|causaria)\b/.test(after))present.push(code);
    }
    return {present:uniq(present),absent:uniq(absent)};
  }

  function compressionScope(data,results,code){
    return JSON.stringify([data.flowVersion||0,code,(results||[]).filter(function(result){
      return result.code===code&&/^misfire-(?:coil|plug|injector-leak)-/.test(result.id);
    }).map(function(result){return [result.id,result.outcome,result.toCylinder||0,result.at||""];})]);
  }

  function compressionReport(text,previous){
    var q=norm(text),unit=(q.match(/(?:^|[^a-z])(psi|bar|kpa)\b/)||[])[1]||"";
    if(unmeasuredReport(text)||/\b(?:nao (?:testei|medi|e|deu|marcou|mediu)|se (?:fosse|desse|tiver)|supondo|hipotese)\b|(?:^|\s)-\s*\d/.test(q))return null;
    if(previous&&/^(?:(?:e|em|unidade|a unidade e|corrigindo)[: ,]*)?(?:psi|bar|kpa)[.! ]*$/.test(q)){
      return Object.assign({},previous,{unit:unit});
    }
    var condition=q.match(/\b(?:motor\s+)?(?:frio|quente|aquecido)\b|\b(?:seguindo|conforme)\s+(?:(?:o|ao)\s+)?procedimento\b/);
    // Cylinder counts and engine temperature are context, not pressure readings.
    var measurement=condition&&condition.index>q.search(/\d/)?q.slice(0,condition.index):q;
    if(/\b(?:volts?|rpm|ohms?)\b|\d\s*v\b|Ω|°\s*c\b/.test(measurement))return null;
    var perCylinder=measurement.match(/(\d+(?:[.,]\d+)?)\s*(?:psi|bar|kpa)?\s*(?:no|do)\s+(?:cilindro\s+)?(\d{1,2})\b/);
    var labeled=Array.from(measurement.matchAll(/\b(?:cilindro|cil\.?|c)\s*(\d{1,2})(?:\s*[:=]\s*|\s+)(\d+(?:[.,]\d+)?)/g));
    var numeric=measurement.replace(/^(?:(?:corrigindo|na verdade|correcao)[: ,]*|nao\s*,\s*)/,"")
      .split(/\b(?:em cada|em todos|todos os cilindros|por cilindro|nos\s+\d+\s+cilindros)\b/)[0];
    var measured=/^\d|^(?:medi|mediu|medimos|deu|deram|marcou|compressao|pressao|resultado)\b/.test(numeric);
    if(perCylinder||labeled.length||measured){
      var values=(numeric.match(/\d+(?:[.,]\d+)?/g)||[]).map(function(value){return Number(value.replace(",","."));});
      var cylinder=perCylinder?Number(perCylinder[2]):labeled.length===1?Number(labeled[0][1]):0;
      if(labeled.length)values=labeled.map(function(entry){return Number(entry[2].replace(",","."));});
      else if(cylinder)values=[Number(perCylinder[1].replace(",","."))];
      if(!values.length)return null;
      return {raw:String(text).slice(0,500),values:values,unit:unit||(previous&&previous.unit)||"",cylinder:cylinder,
        cylinders:labeled.map(function(entry){return Number(entry[1]);}),
        allCylinders:!cylinder&&/em cada|cada cilindro|em todos|todos os cilindros|por cilindro|nos\s+\d+\s+cilindros/.test(q),
        conditions:condition?String(text).slice(0,500):""};
    }
    if(previous&&/\b(?:frio|quente|aquecido|procedimento|ensaio|borboleta|bateria|arranque)\b/.test(q)){
      return Object.assign({},previous,{unit:unit||previous.unit,conditions:String(text).slice(0,500)});
    }
    return null;
  }

  function recordCompressionReport(text){
    var data=state.caseContext;
    if(!/^misfire-compression-/.test(data.awaiting))return false;
    var code=data.dtcs.filter(function(value){return /^P030[0-8]$/.test(value);}).join("-");
    var results=currentTestResults(state.testResults,data.flowVersion);
    if(!results.some(function(result){return result.id==="misfire-injector-leak-"+code&&result.outcome==="sealed";}))return false;
    var scope=compressionScope(data,results,code);
    var previous=data.compression&&data.compression.scope===scope?data.compression:null;
    var reading=compressionReport(text,previous);
    if(!reading)return false;
    data.compression=Object.assign({},reading,{scope:scope});
    return true;
  }

  function compressionText(reading){
    if(reading.cylinders&&reading.cylinders.length)return reading.cylinders.map(function(cylinder,index){
      return "C"+cylinder+" "+String(reading.values[index]).replace(".",",")+(reading.unit?" "+reading.unit:"");
    }).join("; ");
    var values=reading.values.map(function(value){return String(value).replace(".",",");}).join(" / ");
    return values+(reading.unit?" "+(reading.unit==="kpa"?"kPa":reading.unit):"")+
      (reading.cylinder?" no cilindro "+reading.cylinder:reading.allCylinders?" em cada cilindro":"");
  }

  function recoverCompressionReport(){
    var data=state.caseContext;
    if(!/^misfire-compression-/.test(data.awaiting))return false;
    var code=data.dtcs.filter(function(value){return /^P030[0-8]$/.test(value);}).join("-");
    var results=currentTestResults(state.testResults,data.flowVersion);
    var injector=results.find(function(result){return result.id==="misfire-injector-leak-"+code&&result.outcome==="sealed";});
    var scope=compressionScope(data,results,code);
    if(!injector||data.compression&&data.compression.scope===scope)return false;
    var cutoff=Date.parse(injector.at);
    if(!Number.isFinite(cutoff))return false;
    var recovered=false;
    state.messages.forEach(function(message){
      if(message.role==="user"&&!message.testResult&&Date.parse(message.at)>=cutoff&&recordCompressionReport(message.text))recovered=true;
    });
    return recovered;
  }

  function noStartInputFeedback(text){
    var q=norm(text);
    if(/\b[pbcu]\d{1,3}\b/.test(q))return "‘"+text.slice(0,60)+"’ parece um DTC incompleto. Copie a letra e os quatro caracteres do scanner; não vou completar o código por conta própria.";
    if(/^\d{3,}$/.test(q))return "‘"+text.slice(0,60)+"’ não identifica uma tensão com unidade nem sua condição. Use, por exemplo, ‘12 V antes’ ou ‘10 V durante’.";
    return "Não consegui identificar um resultado em ‘"+text.slice(0,80)+"’. Os dados anteriores foram preservados.";
  }

  function startingBatteryState(value){
    // Realtime Database omits null-valued properties when it returns a saved case.
    return Object.assign({before:null,during:null,pending:null,unavailable:false,raw:""},value||{});
  }

  function startingBatteryReport(previous,text,slot){
    var b=startingBatteryState(previous),q=norm(text);
    if(/nao tenho (?:o )?multimetro|sem multimetro|nao (?:consigo|consegui) medir|nao medi|nao testei/.test(q)){
      b.unavailable=true;return b;
    }
    if(/^(?:vou medir agora|tenho (?:o )?multimetro)[.! ]*$/.test(q)){b.unavailable=false;return b;}
    if(unmeasuredReport(text)||/\b(?:rpm|psi|bar|ohms?)\b|(?:^|\s)-\s*\d/.test(q))return null;
    var phaseBefore=/\bantes\b|\brepouso\b|sem (?:tentar|dar) partida/.test(q);
    var phaseDuring=/\bdurante\b|\bminim[ao]\b|na tentativa|enquanto.*partida/.test(q);
    var matches=Array.from(q.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(?:v(?:olts?)?)\b/g));
    var bare=q.match(/^(\d+(?:[.,]\d+)?)[.! ]*$/);
    if(!matches.length&&bare)matches=[bare];
    var values=matches.map(function(m){return Number(m[1].replace(",","."));});
    if(values.some(function(value){return value>60;}))return null;
    if(!values.length){
      if(b.pending!==null&&(phaseBefore!==phaseDuring)){
        b[phaseBefore?"before":"during"]=b.pending;b.pending=null;b.unavailable=false;return b;
      }
      return null;
    }
    if(values.length===2&&phaseBefore&&phaseDuring){
      var duringFirst=q.search(/\bdurante\b|\bminim[ao]\b|na tentativa/) < q.search(/\bantes\b|\brepouso\b/);
      b.before=values[duringFirst?1:0];b.during=values[duringFirst?0:1];b.pending=null;
    }else if(values.length===1){
      if(phaseBefore&&phaseDuring&&/antes e durante|nos dois|mesm[ao]/.test(q)){b.before=values[0];b.during=values[0];b.pending=null;}
      else if(phaseBefore!==phaseDuring){b[phaseBefore?"before":"during"]=values[0];b.pending=null;}
      else if(slot==="no-start-battery-before"||slot==="no-start-battery-during"){b[slot.endsWith("before")?"before":"during"]=values[0];b.pending=null;}
      else b.pending=values[0];
    }else return null;
    b.raw=text.slice(0,500);b.unavailable=false;return b;
  }

  function extendNoStartEvidence(c,text){
    var slot=c.awaiting,q=norm(text);
    c.noStartFeedback="";
    if(!c.startingBattery&&c.observations["no-start-battery"]){
      c.startingBattery=startingBatteryReport(null,c.observations["no-start-battery"],"");
    }
    if(!text)return;
    if(/^no-start-battery(?:-|$)/.test(slot)){
      var battery=startingBatteryReport(c.startingBattery,text,slot);
      if(battery){c.startingBattery=battery;if(!battery.unavailable)c.observations["no-start-battery"]=battery.raw||text;}
      else c.noStartFeedback=noStartInputFeedback(text);
    }else if(/\bbateria\b/.test(q)&&/\b(?:antes|durante|repouso)\b/.test(q)&&/\d+(?:[.,]\d+)?\s*v(?:olts?)?\b/.test(q)){
      // A later battery correction must replace its current value, not only its transcript.
      var correction=startingBatteryReport(c.startingBattery,text,"");
      if(correction&&!correction.unavailable){
        c.startingBattery=correction;c.observations["no-start-battery"]=correction.raw;c.noStartReference=null;
      }
    }
    if(slot==="no-start-terminals"){
      var connections=q.replace(/\b(?:sem (?:oxidacao|zinabre|danos)|nao (?:estao |esta )?(?:soltos?|oxidados?|danificados?))\b/g,"");
      if(/nao (?:conferi|testei|verifiquei)|nao consigo/.test(q))c.starterConnections="unavailable";
      else if(/solt|danific|oxid|zinabre|nao (?:estao |esta )?firmes?/.test(connections))c.starterConnections="problem";
      else if(/firmes?/.test(connections))c.starterConnections="firm";
      else c.noStartFeedback=noStartInputFeedback(text);
    }
    if(/^no-start-(?:power-diagram|signal-reference|engine-procedure)$/.test(slot)){
      var ref=c.noStartReference&&c.noStartReference.slot===slot?Object.assign({},c.noStartReference):{slot:slot,status:"",text:"",engineCode:""};
      if(/nao (?:sei|tenho|achei|encontrei|consigo)|sem (?:esquema|referencia|manual)/.test(q)){ref.status="unavailable";ref.text="";}
      else if(/quero registrar novas medicoes/.test(q))ref.status="collecting";
      else{
        var engine=text.toUpperCase().match(/^(?:(?:MOTOR|CÓDIGO DO MOTOR)[: ]+)?([A-Z][A-Z0-9]{2,3})[.! ]*$/);
        if(engine&&!/^(?:[PBCU]\d|(?:NAO|SIM|RPM|ECU|GOLF|TSI|SECA|VELA)$)/.test(engine[1])){ref.engineCode=engine[1];ref.status="code";c.engineCode=engine[1];}
        else if(!unmeasuredReport(text)&&(/\d+(?:[.,]\d+)?\s*(?:v(?:olts?)?|mv|hz|ms)\b/.test(q)||/\b(?:manual|esquema|procedimento|pagina)\b/.test(q)&&/\d/.test(q)||codeReport(text).present.length||/^sem codigos?[.! ]*$/.test(q))){
          ref.status="evidence";ref.text=text.slice(0,500);
        }else c.noStartFeedback=noStartInputFeedback(text);
      }
      c.noStartReference=ref;
    }
  }

  // Only the mechanic's statements and explicitly confirmed media enter the case.
  // Bot questions and suggested codes must never become diagnostic evidence.
  function extendCaseContext(previous,text){
    var c=Object.assign(emptyCaseContext(),previous||{});
    c.dtcs=(c.dtcs||[]).slice();c.details=(c.details||[]).slice();c.interventions=(c.interventions||[]).slice();c.visionRows=(c.visionRows||[]).slice();
    c.observedCylinders=(c.observedCylinders||[]).slice();
    c.vehicleDetails=Object.assign({},c.vehicleDetails||{});
    c.observations=Object.assign({},c.observations||{});
    c.dtcDescriptions=Object.assign({},c.dtcDescriptions||{});
    c.coilAppearance=c.coilAppearance?Object.assign({},c.coilAppearance):null;
    c.compression=c.compression?Object.assign({},c.compression,{values:(c.compression.values||[]).slice(),cylinders:(c.compression.cylinders||[]).slice()}):null;
    c.startingBattery=c.startingBattery?startingBatteryState(c.startingBattery):null;
    c.noStartReference=c.noStartReference?Object.assign({},c.noStartReference):null;
    if(c.observations["misfire-plug-observation"]&&!plugObservation(c.observations["misfire-plug-observation"],true))delete c.observations["misfire-plug-observation"];
    if(c.candidateCode&&c.dtcs.indexOf(c.candidateCode)>=0){c.candidateCode="";c.incompleteCode="";}
    text=String(text||"").trim();
    var q=norm(text), report=codeReport(text),codes=report.present;
    if(report.absent.length)c.dtcs=c.dtcs.filter(function(code){return report.absent.indexOf(code)<0;});
    if(/^(?:scanner )?(?:sem codigos?|nao (?:ha|tem|aparece) codigos?)[.! ]*$/.test(q)){c.noCodesReported=true;c.dtcs=[];}
    var noStart=/\bnao pega\b|\bsem partida\b|^nao liga\b|\b(?:motor|carro|veiculo|ele) nao liga\b|\bmotor nao gira\b/.test(q);
    var misfire=/\bfalhando\b|\brateia\b|\bengasga\b|\bfalha (?:de ignicao|de combustao|a |quando)/.test(q);
    var symptom=noStart?"no-start":misfire?"misfire":!c.symptom&&codes.some(function(code){return /^P030[0-8]$/.test(code);})?"misfire":"";
    c.lastInputKind="";c.confirmedCodeReminder=false;
    if(c.awaiting&&!/^no-start-battery(?:-|$)/.test(c.awaiting)&&text&&!unmeasuredReport(text)&&!isGreeting(text)&&!(symptom&&symptom!==c.symptom)&&relevantObservation(c.awaiting,text))c.observations[c.awaiting]=text;
    var plug=plugObservation(text,c.awaiting==="misfire-plug-observation");
    if(plug){c.observations["misfire-plug-observation"]=plug;c.lastInputKind="plug-observation";}
    if(/\bbobina\b.*\b(?:verde|azul|vermelha|preta|amarela|branca)\b|\bconector\b.*(?:verde|oxid|zinabre)/.test(q)){
      c.coilAppearance={text:text,meaning:/oxid|zinabre/.test(q)?"corrosion":"unknown"};c.lastInputKind="coil-appearance";
    }
    if(c.awaiting==="coil-appearance"&&c.coilAppearance){
      if(/cor da peca|cor do plastico|so a cor/.test(q))c.coilAppearance.meaning="piece-color";
      else if(/oxidacao|zinabre/.test(q))c.coilAppearance.meaning="corrosion";
      else if(/^nao sei[.! ]*$/.test(q))c.coilAppearance.meaning="unconfirmed";
    }
    if(/misfire-(?:engine-identification|engine-code|ignition-layout|injector)/.test(c.awaiting)||/\bmotor\s+[a-z]{3,5}\b/.test(q)){
      var motorCode=text.toUpperCase().match(/^(?:MOTOR\s+|CÓDIGO DO MOTOR[: ]+)?([A-Z][A-Z0-9]{2,5})[.! ]*$/);
      var identifyingEngine=/^misfire-(?:engine-identification|engine-code|ignition-layout)$/.test(c.awaiting)||/^(?:motor\s+|c[oó]digo do motor[: ]+)/i.test(text);
      if(motorCode&&identifyingEngine&&!/^(?:[PBCU]\d|VELA|BOBINA|SCANNER|NORMAL|SEMPRE|QUENTE|MOTOR|GOLF|SECA|TSI|SIM|NAO|ECU)/.test(motorCode[1])){
        c.engineCode=motorCode[1];c.observations[c.awaiting]=motorCode[1];c.lastInputKind="engine-code";
      }
      if(/nao sei|nao consigo|nao achei/.test(q))c.engineIdentificationUnavailable=true;
    }
    if(/^misfire-component-/.test(c.awaiting)){
      if(/\bsem falhas?\b|parou de falhar/.test(q)&&/corrigi|reparei|substitui|testei|apos o reparo/.test(q)&&!/nao (?:corrigi|reparei|testei)/.test(q))c.componentRepair="verified";
      else if(/corrigi|reparei|substitui|apos o reparo/.test(q)&&/continua|continuou|permanece|ainda falha/.test(q))c.componentRepair="remains";
    }
    if(c.awaiting==="misfire-repair-verification"&&!/\bnao\b/.test(q)&&/\bsem falhas?\b/.test(q))c.repairVerified=true;
    if(c.awaiting==="dtc-description"&&c.awaitingDtc&&text&&!isGreeting(text)&&!noStart){
      var description=text.replace(/\b(?:[PBCU][0-3][0-9A-F]{3}|DF\d{3,4})\b/gi,"").trim();
      if(/circuito|pressao|tensao|sinal|mistura|comunicacao|resistencia|desempenho|fora da faixa|descricao.*modulo/.test(norm(description)))c.dtcDescriptions[c.awaitingDtc]=description.slice(0,500);
    }
    if(symptom&&symptom!==c.symptom){
      if(c.symptom)c.flowVersion++;
      c.symptom=symptom;c.awaiting="";
      if(noStart){
        c.cranking="";c.rpm=null;c.rpmPresent=false;c.rpmUnavailable=false;c.startAuthorized="";c.ecuCommunication="";c.starterSound="";c.startingBattery=null;c.starterConnections="";c.noStartReference=null;
        Object.keys(c.observations).forEach(function(key){if(/^no-start-/.test(key))delete c.observations[key];});
      }
    }
    if(c.symptom==="misfire")captureWorkshopFacts(c,text);
    if(c.visionRows.length){
      if(/^(?:presente|presentes|ativa|ativas|ativo|ativos|estao presentes|estao ativos)[.! ]*$/.test(q)||/\bfalhas? (?:presentes?|ativas?)\b/.test(q))c.scannerFaultStatus="presentes";
      else if(/^(?:memorizado|memorizados|historico|armazenado|armazenados|passado|passados)[.! ]*$/.test(q)||/\bfalhas? (?:memorizadas?|armazenadas?)\b/.test(q))c.scannerFaultStatus="memorizados";
    }
    if(c.awaiting==="misfire-no-code-data"&&/\b(?:nao tenho|nao aparece|nao mostra|nao consigo|indisponivel|sem acesso)\b.*\b(?:parametro|scanner|stft|ltft|correcao|leitura|dados)\b|\bscanner\b.*\bnao (?:tem|mostra|exibe)\b/.test(q))c.noCodeScannerDataUnavailable=true;
    c.ambiguousCylinderReply=false;
    if(/\bgolf\b/.test(q)){c.vehicleDetails.model="Golf";c.vehicleDetails.brand="Volkswagen";}
    if(/\bgolf\b|\bano\b/.test(q)){
      var year=q.match(/\b((?:19|20)\d{2})\b/);if(year)c.vehicleDetails.year=year[1];
    }
    var engine=q.match(/\b(?:motor\s*)?([1-9][.,]\d)\s*(tsi|tfsi|tdi|mpi|flex|turbo|16v|8v|gasolina)\b/)||q.match(/\b(?:motor|golf)\s*([1-9][.,]\d)\b/);
    if(engine){c.vehicleDetails.engine=engine[1].replace(",",".")+(engine[2]?" "+engine[2].toUpperCase():"");c.lastInputKind="engine-description";}
    if(/^misfire-(?:engine|injector)/.test(c.awaiting)&&/^[1-9][.,]\d[.! ]*$/.test(q))c.lastInputKind="engine-description";
    if(c.candidateCode&&c.awaiting==="code-confirmation"&&/^(sim|isso|correto|confirmo)[.! ]*$/.test(q)) codes=[c.candidateCode];
    if(codes.length){
      c.noCodesReported=false;
      c.confirmedCodeReminder=codes.every(function(code){return c.dtcs.indexOf(code)>=0;})&&!symptom;
      c.dtcs=c.awaiting==="misfire-other-codes"||/\b(tambem|outro codigo|mais o)\b/.test(q)?uniq(c.dtcs.concat(codes)):codes;
      c.candidateCode="";c.incompleteCode="";
      if(!c.confirmedCodeReminder)c.observedCylinder=0;
      if(c.awaiting==="misfire-other-codes"||c.awaiting==="misfire-code-or-cylinder")c.otherCodesKnown=true;
    }else{
      var shortCode=text.toUpperCase().match(/\b([PBCU])(\d{3})\b/);
      if(shortCode){
        var candidate=shortCode[1]+"0"+shortCode[2];
        if(c.dtcs.indexOf(candidate)>=0){c.confirmedCodeReminder=true;c.candidateCode="";c.incompleteCode="";}
        else{c.incompleteCode=shortCode[0];c.candidateCode=candidate;}
      }
      if(/^(nao|codigo incorreto|vou digitar)[.! ]*$/.test(q)){c.candidateCode="";c.incompleteCode="";}
    }
    var condition=/^misfire-compression-/.test(c.awaiting)&&!/\b(?:falha|falhando|defeito)\s+(?:so\s+)?a\s+(?:frio|quente)\b/.test(q)
      ?"":q.replace(/\bnao\s+(?:(?:e|falha|acontece)\s+)?(?:a\s+)?(?:quente|frio)\b/g,"");
    if(/\b(tempo todo|sempre|frio e quente|frio ou quente)\b/.test(condition)) c.temperature="sempre";
    else if(/\bquente\b/.test(condition)) c.temperature="quente";
    else if(/\bfrio\b/.test(condition)) c.temperature="frio";
    if(c.symptom==="no-start"){
      var cranking=/\b(?:nao|nem) (?:gira|girou)\b/.test(q)?"nao gira":/\b(?:gira|girando|girou)\b/.test(q)?"gira":"";
      if(cranking&&cranking!==c.cranking){
        c.cranking=cranking;c.rpm=null;c.rpmPresent=false;c.rpmUnavailable=false;c.startAuthorized="";c.ecuCommunication="";c.startingBattery=null;c.starterConnections="";c.noStartReference=null;c.starterSound="";c.awaiting="";
        Object.keys(c.observations).forEach(function(key){if(/^no-start-/.test(key))delete c.observations[key];});
      }
      if(c.awaiting==="no-start-rpm"||/\brpm\b/.test(q)){
        var rpm=q.match(/\b(\d{1,4})\s*rpm\b/)||q.match(/\b(?:rpm|rotacao)\s*(?:de|:)?\s*(\d{1,4})\b/)||q.match(/^(\d{1,4})[.! ]*$/);
        if(rpm&&!unmeasuredReport(text)){
          if(c.rpm!==Number(rpm[1])){c.startAuthorized="";c.ecuCommunication="";}
          c.rpm=Number(rpm[1]);c.rpmPresent=c.rpm>0;c.rpmUnavailable=false;
        }
        else if(/nao consigo|nao consegui|nao sei|sem scanner|nao tenho scanner|nao aparece|nao mostra rotacao/.test(q))c.rpmUnavailable=true;
        else if(!unmeasuredReport(text)&&/mostra rotacao|tem rotacao/.test(q)){c.rpmPresent=true;c.rpmUnavailable=false;}
      }
      if(c.awaiting==="no-start-authorization"){
        if(/nao (?:sei|encontrei|achei)|sem (?:esse|o) parametro/.test(q))c.startAuthorized="unknown";
        else if(/bloquead|nao (?:esta )?autoriz|nao (?:esta )?permit/.test(q))c.startAuthorized="blocked";
        else if(/autorizad|liberad|permitid/.test(q))c.startAuthorized="allowed";
      }
      if(c.awaiting==="no-start-communication"){
        if(/nao sei|nao (?:medi|testei|conferi)|talvez|sera que/.test(q))c.ecuCommunication="";
        else if(/^nao\b|nao (?:esta )?comunic|perde comunicacao/.test(q))c.ecuCommunication="no";
        else if(/^sim\b|comunica normalmente|esta comunicando/.test(q))c.ecuCommunication="yes";
      }
      if(c.awaiting==="no-start-sound"){
        if(/painel apaga|luzes.*enfraquec/.test(q))c.starterSound="panel";
        else if(/sem clique|nenhum clique|nao.*clique/.test(q))c.starterSound="silent";
        else if(/clique/.test(q))c.starterSound="click";
      }
      extendNoStartEvidence(c,text);
    }else{
      var observed=cylinderReply(text,/^misfire-(?:cylinders|coil-movement|plug-movement|component-current)$/.test(c.awaiting));
      if(observed.length){c.observedCylinders=observed;c.observedCylinder=observed.length===1?observed[0]:0;}
      if(c.awaiting==="misfire-other-codes"&&/^\d[.! ]*$/.test(q))c.ambiguousCylinderReply=true;
      if((c.awaiting==="misfire-other-codes"||c.awaiting==="misfire-code-or-cylinder")&&/^(?:nao|nenhum|sem outros codigos|so (?:esse|este|o p\d{4}|p\d{4}))[.! ]*$/.test(q))c.otherCodesKnown=true;
    }
    if(text&&!isGreeting(text)&&c.details[c.details.length-1]!==text) c.details.push(text);
    c.details=c.details.slice(-12);
    return c;
  }

  function recoverCaseContext(messages){
    return (messages||[]).filter(function(m){return m.role==="user"&&!m.testResult;})
      .reduce(function(c,m){return extendCaseContext(c,m.text);},emptyCaseContext());
  }

  function comparisonStage(result){
    return /^misfire-coil-P/.test(result.id)?1:/^misfire-plug-P/.test(result.id)?2:/^misfire-injector-leak-/.test(result.id)?3:/^misfire-migration-verify-/.test(result.id)?4:0;
  }

  // Keep every report in the history. Only the latest compatible result drives the next step.
  function currentTestResults(results,flowVersion){
    var current=[];
    (results||[]).filter(function(r){return (r.flowVersion||0)===(flowVersion||0);}).forEach(function(r){
      var previous=current.find(function(x){return x.id===r.id;});
      var stage=comparisonStage(r);
      if(previous&&stage>0&&stage<3&&(previous.outcome!==r.outcome||Number(previous.toCylinder||0)!==Number(r.toCylinder||0)||(previous.scope||"")!==(r.scope||""))){
        current=current.filter(function(x){return !(x.code===r.code&&comparisonStage(x)>stage);});
      }
      current=current.filter(function(x){return x.id!==r.id;});current.push(r);
    });
    return current;
  }

  function comparisonReport(text,activeComponent){
    var q=norm(text);
    if(/\bse (?:eu )?(?:trocar|mudar)|\b(?:vou|vai|devo|posso|poderia) (?:trocar|mudar)|\bnao (?:troquei|comparei)|\bsera que\b/.test(q))return null;
    if(/\?\s*$/.test(q)&&!/\b(?:troquei|inverti|comparei|fiz)\b/.test(q))return null;
    if(!/\bfalha\b|\bdefeito\b|\bcodigo\b|\bcilindro\b|acompanhou|seguiu|mudou com/.test(q))return null;
    q=q.replace(/\b(?:sem (?:mexer|trocar|mudar)|nao (?:mexi|troquei|mudei))\s+(?:n[ao]s?\s+|[ao]s?\s+)?(?:bobinas?|velas?)\b/g,"");
    var ordinals={primeiro:"1",segundo:"2",terceiro:"3",quarto:"4",quinto:"5",sexto:"6",setimo:"7",oitavo:"8"};
    q=q.replace(/\b(primeiro|segundo|terceiro|quarto|quinto|sexto|setimo|oitavo)\s+cilindro\b/g,function(_,n){return "cilindro "+ordinals[n];});
    var coil=/\bbobinas?\b/.test(q),plug=/\bvelas?\b/.test(q);
    if(!coil&&!plug){coil=activeComponent==="coil";plug=activeComponent==="plug";}
    if(!coil&&!plug)return null;
    var stayed=/\bnao (?:mudou|migrou|acompanhou|seguiu)\b|\b(?:continuou|continua|permaneceu|permanece|ficou) (?:no|no mesmo)\b/.test(q);
    var moved=!stayed&&/\b(?:mudou|migrou|acompanhou|seguiu|passou)\b|\bfoi (?:para|pro)\b|\bagora (?:esta|falha|falhando) no\b/.test(q);
    if(!stayed&&!moved)return null;
    var destination=q.match(/\b(?:para|pro|agora esta no)\s+(?:o\s+)?(?:cilindro\s+)?([1-8])(?:\s*[º°o]?\s*cilindro)?\b/)
      ||q.match(/\b(?:passou a falhar|agora (?:falha|esta))\s+(?:no\s+)?(?:cilindro\s+)?([1-8])\b/);
    var code=extractCodes(text).filter(function(x){return /^P030[1-8]$/.test(x);});
    return {component:coil?"coil":"plug",outcome:stayed?"stayed":"moved",toCylinder:moved?(destination?Number(destination[1]):code.length===1?Number(code[0].slice(-1)):0):0,
      scope:coil&&plug?"multiple":/\b(?:so|somente|apenas)\s+(?:a |as |uma )?(?:bobinas?|velas?)\b/.test(q)?"single":""};
  }

  function recordComparisonReport(text,at,historyOnly){
    if(state.caseContext.symptom!=="misfire")return false;
    if(!historyOnly&&/^misfire-component-repair$/.test(state.caseContext.awaiting)&&/substitui|por (?:uma |outra )?nova|apos o reparo/.test(norm(text))&&!/inverti|comparei|de posicao|corrigindo (?:o teste|o resultado)/.test(norm(text)))return false;
    var active=historyOnly?null:state.activeTests[state.activeTestIndex];
    var hint=active&&/^misfire-(?:coil|plug)-P/.test(active.id)?active.component||(/^misfire-plug-/.test(active.id)?"plug":"coil"):"";
    var report=comparisonReport(text,hint);if(!report)return false;
    var results=currentTestResults(state.testResults.filter(function(r){return !historyOnly||!at||!r.at||r.at<=at;}),state.caseContext.flowVersion);
    var prefix="misfire-"+report.component+"-P";
    var test=active&&active.id.indexOf(prefix)===0?active:results.filter(function(r){return r.id.indexOf(prefix)===0;}).slice(-1)[0];
    if(!test)return false;
    if(historyOnly&&results.some(function(r){return r.report===text&&r.source==="history-user-report";}))return false;
    var cylinder=test.cylinder||Number(String(test.code||"").slice(-1));
    if(report.outcome==="moved"&&report.toCylinder===cylinder)return false;
    state.testResults.push({id:test.id,title:test.title,result:report.outcome==="moved"?"Mudou"+(report.toCylinder?" para o cilindro "+report.toCylinder:""):"Continuou no "+cylinder,
      outcome:report.outcome,code:test.code,cylinder:cylinder,toCylinder:report.toCylinder,component:report.component,scope:report.scope,
      flowVersion:state.caseContext.flowVersion||0,at:at||now(),report:text,source:historyOnly?"history-user-report":"user-report"});
    state.caseContext.componentRepair="";state.caseContext.lastInputKind="comparison-result";
    return true;
  }

  function recordUnconfirmedMigration(text){
    if(state.caseContext.awaiting!=="misfire-component-current")return;
    var results=currentTestResults(state.testResults,state.caseContext.flowVersion);
    var moved=results.filter(function(r){return /^misfire-(?:coil|plug)-P/.test(r.id)&&r.outcome==="moved";}).slice(-1)[0];
    var cylinders=cylinderReply(text,true),codes=extractCodes(text).filter(function(code){return /^P030[1-8]$/.test(code);});
    if(!cylinders.length&&codes.length===1)cylinders=[Number(codes[0].slice(-1))];
    if(!moved||cylinders.length!==1)return;
    var origin=moved.cylinder||Number(moved.code.slice(-1));
    state.testResults.push(Object.assign({},moved,{outcome:cylinders[0]===origin?"stayed":"moved",toCylinder:cylinders[0]===origin?0:cylinders[0],
      result:"Leitura atual: cilindro "+cylinders[0],report:text,source:"user-current-reading",at:now()}));
  }

  function buildContext(question,suppliedCase){
    var mediaText=state.mediaAnalyses.map(function(x){return x.text||"";}).join("\n");
    var caseData=suppliedCase||extendCaseContext(state.caseContext,question);
    // processMedia submits a readable code (or asks for confirmation). Old OCR
    // text must never restore a code the mechanic has subsequently withdrawn.
    if(!caseData.dtcs.length&&!caseData.visionRows.length)mediaText="";
    var currentResults=currentTestResults(state.testResults,caseData.flowVersion);
    var testText=currentResults.map(function(x){return x.title+" "+x.result;}).join(" ");
    var context={
      brand:state.vehicle.brand||caseData.vehicleDetails.brand||"",
      model:state.vehicle.model||caseData.vehicleDetails.model||"",
      year:state.vehicle.year||caseData.vehicleDetails.year||"",
      engine:state.vehicle.engine||caseData.vehicleDetails.engine||"",
      transmission:state.vehicle.transmission||"",
      mileage:state.vehicle.mileage||"",
      question:String(question||"").trim(),
      caseData:caseData,
      caseText:caseData.details.join("\n"),
      mediaText:mediaText,
      measurements:"",
      testText:testText,
      dtcs:caseData.dtcs,
      testResults:currentResults
    };
    var provided=norm(context.caseText+" "+mediaText);
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
    if(rule.evidence==="documented") return "referência técnica local; conferir aplicação na fonte";
    if(rule.evidence==="documented+shop") return "referência local e sequência de oficina; causa não confirmada";
    return "triagem por hipótese; causa não confirmada";
  }

  function buildDiagnosis(question,suppliedCase){
    var c=buildContext(question,suppliedCase);
    var ranked=(KB.rules||[]).map(function(r){return scoreRule(r,c);})
      .filter(function(x){return x.score>0;})
      .sort(function(a,b){return b.score-a.score;});
    if(c.caseData.symptom==="no-start")ranked=[];
    if(c.caseData.symptom==="misfire"&&expandDtcs(c.dtcs,c).some(function(code){return /^P030[0-8]$/.test(code);})){
      ranked=ranked.filter(function(item){return (item.rule.dtcs||[]).some(function(code){return /^P030[0-8]$/.test(code);});});
    }
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
    if(c.caseData.symptom==="no-start")facts=[];

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
    tests=tests.filter(function(test){return !c.testResults.some(function(result){return result.id===test.id&&result.outcome==="good";});});

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

  function misfireStep(diag,answer){
    var c=diag.context, data=c.caseData, codes=c.dtcs.filter(function(code){return /^P030[0-8]$/.test(code);});
    var codedCylinder=codes.length===1&&/^P030[1-8]$/.test(codes[0])?Number(codes[0].slice(-1)):0;
    var observed=data.observedCylinders||[];
    var cylinder=observed.length===1?observed[0]:codedCylinder;
    if(!data.temperature){
      answer.awaiting="misfire-temperature";
      answer.question="A falha acontece a frio, a quente ou o tempo todo?";
      answer.actions=[{label:"A frio",text:"A falha acontece a frio."},{label:"A quente",text:"A falha acontece a quente."},{label:"O tempo todo",text:"A falha acontece o tempo todo."}];
      return;
    }
    var condition=data.temperature==="sempre"?"o tempo todo":"a "+data.temperature;
    answer.explanation=[c.model,c.engine].filter(Boolean).join(" ")+": falha "+condition+".";
    if(!codes.length){
      if(!data.noCodesReported){
        answer.awaiting="misfire-no-code";
        answer.question="Qual código aparece no scanner? Se não houver código, diga ‘sem código’.";
      }else{
        answer.awaiting="misfire-no-code-data";
        var serviceReports=(data.interventions||[]).map(function(item){return item.description;});
        var facts=[data.fuelType?"Combustível relatado: "+data.fuelType+".":"",serviceReports.length?"Peças e serviços relatados: "+serviceReports.join(", ")+".":""].filter(Boolean).join(" ");
        if(data.noCodeScannerDataUnavailable){
          answer.question=(facts?facts+" ":"")+"Entendi que essas leituras não estão disponíveis no scanner. A falha também ocorre em marcha lenta ou somente ao acelerar? Informe a comparação observada, sem inventar valores ausentes.";
        }else if(data.observations["misfire-no-code-data"]){
          answer.question=facts
            ?facts+" Peças novas ou limpas não comprovam o funcionamento. A falha também aparece em marcha lenta? Se o scanner disponibilizar, informe STFT/LTFT na condição do defeito; se não houver esse parâmetro, diga isso."
            :"Dados registrados: "+data.observations["misfire-no-code-data"].slice(0,180)+". Para separar mistura, ignição e condição mecânica, envie o código do motor e uma leitura comparativa pelo procedimento dessa aplicação. Ainda não há causa confirmada.";
        }else{
          answer.question="Sem código registrado. A falha aparece em marcha lenta, acelerando ou sob carga? Envie também as correções de combustível e os contadores de falha, se o scanner oferecer; não vou escolher um cilindro ou peça sem essa evidência.";
        }
      }
      return;
    }
    var code=codes.join("-"), liveId="misfire-live-"+code, coilId="misfire-coil-"+code;
    var results=c.testResults||[], live=results.filter(function(r){return r.id===liveId;}).slice(-1)[0];
    var coil=results.filter(function(r){return r.id===coilId;}).slice(-1)[0];
    answer.customTest=true;
    var moved=results.filter(function(r){return /^misfire-(?:coil|plug)-/.test(r.id)&&r.outcome==="moved";}).slice(-1)[0];
    var movedFrom=moved?(moved.cylinder||Number(String(moved.code||"").slice(-1))):0;
    var movedTo=moved&&(moved.toCylinder||(observed.length===1&&observed[0]!==movedFrom?observed[0]:0)||(codedCylinder&&codedCylinder!==movedFrom?codedCylinder:0));
    if(moved&&movedFrom&&(movedTo||moved.scope==="multiple")){
      misfireMovedStep(c,answer,moved,movedFrom,movedTo,results);
    }else if(data.ambiguousCylinderReply){
      answer.awaiting="misfire-code-or-cylinder";
      answer.question="Esse número é uma correção para só o cilindro 1, ou você quis dizer que há só o código "+codes[0]+"?";
      answer.actions=[{label:"Só cilindro 1",text:"Só cilindro 1"},{label:"Só "+codes[0],text:"Só "+codes[0]}];
    }else if(codedCylinder&&observed.length===1&&cylinder!==codedCylinder){
      answer.awaiting="misfire-current-codes";
      answer.question="Anotei falhas atuais no cilindro "+cylinder+", mas "+codes[0]+" indica o cilindro "+codedCylinder+". Faça uma nova leitura e envie os códigos atuais para separar falha presente de histórico.";
    }else if(!live&&!observed.length){
      answer.awaiting="misfire-cylinders";
      answer.test={id:liveId,title:cylinder?"Confirmar a falha no cilindro "+cylinder:"Localizar os cilindros com falha",
        procedure:"Com o motor "+(data.temperature==="frio"?"frio":data.temperature==="quente"?"quente":"na condição da falha")+", veja no scanner o contador de falhas de combustão. Anote quais cilindros acumulam falhas agora e os outros códigos, sem apagar.",
        good:"identificar se a falha está em um cilindro ou em vários",code:code,cylinder:cylinder,
        choices:cylinder?[{value:"single",label:"Só no "+cylinder},{value:"multiple",label:"Em vários"}]:[{value:"single",label:"Um cilindro"},{value:"multiple",label:"Vários cilindros"}]};
    }else if((live&&live.outcome==="multiple"||observed.length>1)&&!observed.length){
      answer.awaiting="misfire-cylinders";
      answer.question="Quais cilindros acumulam falhas agora? Pode responder, por exemplo, ‘1 e 2’.";
    }else if(observed.length>1){
      var cylinderNames=observed.slice(0,-1).join(", ")+" e "+observed[observed.length-1];
      answer.explanation+=" Anotei falhas nos cilindros "+cylinderNames+".";
      if(!data.otherCodesKnown){
        answer.awaiting="misfire-other-codes";
        answer.question="Além de "+codes.join(", ")+", aparece outro código no scanner?";
        answer.actions=[{label:"Sem outros códigos",text:"Sem outros códigos"},{label:"Informar código",input:true}];
      }else{
        var connections=results.filter(function(r){return r.id==="misfire-connections";}).slice(-1)[0];
        if(!connections){
          answer.awaiting="misfire-connections";
          answer.test={id:"misfire-connections",title:"Conferir as conexões dos cilindros "+cylinderNames,
            procedure:"Com o motor desligado e frio, confira conectores e chicotes visíveis desses cilindros. Procure plugue solto, fio danificado ou umidade. Não desconecte nada com o motor funcionando.",
            good:"conexões firmes e sem dano visível",code:code,
            choices:[{value:"intact",label:"Conexões firmes"},{value:"damaged",label:"Achei dano ou mau contato"}]};
        }else if(connections.outcome==="damaged"){
          answer.awaiting="misfire-damage";
          answer.question="Em qual conector ou fio você encontrou o problema? Envie o local e, se puder, uma foto. Vamos confirmar essa ligação antes de trocar peça.";
        }else if(!data.observations["misfire-common-data"]){
          answer.awaiting="misfire-common-data";
          answer.question="Conexões visuais conferidas. No scanner, veja as correções de combustível de curto e longo prazo, com a falha presente. Envie os valores e diga se está em marcha lenta ou acelerado; não vou definir pressão ou tolerância sem o procedimento desse motor.";
        }else{
          answer.explanation+=" Leitura informada: "+data.observations["misfire-common-data"].slice(0,180)+".";
          answer.awaiting="misfire-engine-identification";
          answer.question=data.observations["misfire-engine-identification"]
            ?"Dados registrados. Para decidir entre mistura, ignição e condição mecânica, precisamos do procedimento e dos valores de referência desse motor. Envie a página técnica ou uma leitura comparativa; ainda não há causa confirmada."
            :"Qual é o código de identificação do motor? Precisamos dele para conferir os valores de referência antes de interpretar essas correções.";
        }
      }
    }else if(!cylinder){
      answer.awaiting="misfire-cylinders";
      answer.question="Qual cilindro está acumulando falhas? Envie o número ou o código específico mostrado no scanner.";
    }else{
      // This bulletin covers VW gasoline engines, model years 2008–2023.
      // Do not apply its coil procedure to diesel engines or unknown ignition systems.
      var vwGas=/volkswagen|^vw$/.test(norm(c.brand))&&!/routan|id\.?4/.test(norm(c.model))&&/\b(?:tsi|tfsi|gasolina)\b/.test(norm(c.engine))&&Number(c.year)>=2008&&Number(c.year)<=2023;
      if(!vwGas){
        answer.awaiting="misfire-ignition-layout";
        answer.question=data.observations["misfire-ignition-layout"]
          ?"Configuração informada: "+data.observations["misfire-ignition-layout"].slice(0,150)+". Precisamos do procedimento desse sistema para comparar alimentação, comando e componente. Envie o esquema ou o resultado de um teste já feito; ainda não há peça confirmada."
          :"Falha localizada no cilindro "+cylinder+". Qual é o código do motor e ele usa bobinas individuais? Isso define o próximo teste sem aplicar o procedimento de outro sistema.";
      }else{
        answer.sourceIds=["vw-misfire-2033805"];
        if(!coil){
          answer.explanation+=" Vamos verificar se a falha acompanha a bobina.";
          answer.test={id:coilId,title:"Comparar a bobina do cilindro "+cylinder,
            procedure:"Com o motor desligado e frio, confira o conector. Se estiver firme e as bobinas forem iguais, troque só a bobina do cilindro "+cylinder+" de posição com outra. Confirme a numeração no manual. Reproduza a condição da falha e confira os contadores atuais no scanner.",
            good:"observar se a falha muda de cilindro ou permanece no "+cylinder,code:code,cylinder:cylinder,component:"coil",
            choices:[{value:"moved",label:"Mudou de cilindro"},{value:"stayed",label:"Continuou no "+cylinder}]};
        }else if(coil.outcome==="moved"){
          answer.awaiting="misfire-coil-movement";
          answer.question="A falha acompanhou a bobina. Isso aponta para ela. Qual cilindro passou a falhar e qual código apareceu? Confirme antes de fechar o reparo.";
        }else{
          answer.explanation+=" A falha ficou no mesmo cilindro; a bobina ainda não foi confirmada como causa.";
          misfirePlugStep(c,answer,cylinder,code,results);
        }
      }
    }
    if(data.lastInputKind==="coil-appearance"&&data.coilAppearance&&data.coilAppearance.meaning==="unknown"){
      answer.pendingTest=answer.test;answer.test=null;
      answer.explanation=data.observations["misfire-plug-observation"]?"A vela permanece registrada: "+data.observations["misfire-plug-observation"]+".":"Anotei sua observação sobre a bobina.";
      answer.question="Você está falando da cor da bobina ou encontrou oxidação no conector? A cor sozinha não confirma defeito.";
      answer.awaiting="coil-appearance";
      answer.actions=[{label:"Cor da peça",text:"Verde é a cor da peça"},{label:"Oxidação no conector",text:"Há oxidação no conector"},{label:"Não sei",text:"Não sei"}];
    }
    var contact=results.filter(function(r){return /^misfire-coil-contact-/.test(r.id);}).slice(-1)[0];
    if(data.coilAppearance&&data.coilAppearance.meaning==="corrosion"&&!contact){
      answer.awaiting="misfire-coil-contact";answer.pendingTest=null;answer.actions=[];
      answer.explanation="Oxidação no conector registrada. Vamos verificar esse contato antes de continuar a comparação.";
      answer.test={id:"misfire-coil-contact-"+code,title:"Conferir o conector da bobina",
        procedure:"Com a ignição desligada, confira oxidação, danos nos terminais e firmeza do encaixe. Se houver reparo, siga o procedimento do conector e depois confira no scanner se a falha permanece. Não desconecte a bobina com o motor funcionando.",
        good:"registrar o comportamento após conferir ou corrigir o contato",code:code,
        choices:[{value:"remains",label:"Conector conferido; falha permanece"},{value:"cleared",label:"Contato corrigido; falha sumiu"}]};
    }else if(contact&&contact.outcome==="cleared"){
      answer.test=null;answer.pendingTest=null;answer.actions=[];answer.awaiting="misfire-repair-verification";
      answer.explanation="Você informou que a falha sumiu após corrigir o contato.";
      answer.question=data.repairVerified
        ?"Verificação sem falhas registrada. O reparo ficou validado nas condições de teste que você informou; mantenha esses resultados no histórico."
        :"Reproduza as condições originais e confira contadores e códigos atuais. Informe se continuou sem falhas para validar o reparo na condição testada.";
    }
    if(data.confirmedCodeReminder){
      answer.explanation=codes.join(", ")+" já está confirmado."+(/^misfire-component-/.test(answer.awaiting)?" "+answer.explanation:data.observations["misfire-plug-observation"]?" A vela segue registrada: "+data.observations["misfire-plug-observation"]+".":"");
      // Keep the current test and its controls; do not restart code confirmation.
      if(answer.test){
        answer.briefTest=true;
        if(/^misfire-(?:coil|plug)-P/.test(answer.test.id)){
          var compared=/^misfire-plug-/.test(answer.test.id)?"vela":"bobina";
          answer.question="Após trocar somente a "+compared+" de posição, a falha mudou de cilindro ou continuou no "+(answer.test.cylinder||cylinder)+"?";
        }else answer.question="Qual foi o resultado de ‘"+answer.test.title+"’?";
      }
    }
    answer.warning="Se a luz de injeção piscar, interrompa o teste para evitar dano ao catalisador.";
  }

  function misfireMovedStep(c,answer,moved,from,to,results){
    var component=/^misfire-plug-/.test(moved.id)?"vela":"bobina",data=c.caseData;
    var verification=results.find(function(r){return r.id==="misfire-migration-verify-"+moved.code;});
    answer.sourceIds=["vw-misfire-2033805"];
    answer.awaiting="misfire-component-verification";
    if(to&&c.dtcs.length===1&&c.dtcs[0]===moved.code)answer.lead="Falha mudou: cilindro "+from+" → "+to;
    answer.explanation="Antes: cilindro "+from+". Após comparar a "+component+": cilindro "+to+".";
    if(moved.scope==="multiple"||verification&&verification.outcome==="multiple-changes"){
      answer.explanation="A falha mudou, mas mais de um componente foi alterado. Ainda não dá para atribuir a causa à "+component+".";
      answer.question="Retome as posições identificadas e compare somente uma peça por vez, se forem compatíveis e sem dano.";
      answer.test={id:moved.id,title:"Comparar somente a "+component+" do cilindro "+from,
        procedure:"Com o motor desligado e frio, mantenha as outras peças nas posições identificadas. Compare somente a "+component+" do cilindro "+from+" com uma equivalente de um cilindro sem falha, seguindo o manual. Confira no scanner se a falha acompanha essa peça.",
        good:"uma única peça comparada e o cilindro atual identificado",code:moved.code,cylinder:from,component:moved.component,scope:"single",
        choices:[{value:"moved",label:"Acompanhou a "+component},{value:"stayed",label:"Continuou no "+from}]};
    }else if(verification&&verification.outcome==="not-followed"){
      answer.awaiting="misfire-component-current";
      answer.question="A mudança anterior não se confirmou. Qual cilindro acumula falhas agora e quais códigos estão presentes? Envie a leitura atual antes de condenar a peça.";
    }else if(verification&&verification.outcome==="confirmed"){
      answer.awaiting="misfire-component-repair";
      answer.explanation="No teste confirmado, a falha acompanhou a "+component+" que saiu do cilindro "+from+" para o "+to+".";
      if(data.componentRepair==="verified"){
        answer.question="Verificação sem falhas registrada. O reparo ficou validado nas condições que você informou. Guarde os resultados no histórico.";
      }else if(data.componentRepair==="remains"){
        answer.question="Você informou que a falha continua após o reparo. O que foi corrigido e quais cilindros e códigos estão ativos agora? Vamos revisar essa evidência antes de indicar outra peça.";
      }else{
        answer.question="Substitua somente a "+component+" identificada, conforme a especificação e a montagem do motor, e confira sua conexão. Depois reproduza as condições originais e veja os contadores e códigos atuais. Ficou sem falhas ou a falha continua?";
        answer.actions=[{label:"Reparo feito; sem falhas",text:"Corrigi e testei nas mesmas condições; sem falhas"},{label:"Reparo feito; continua",text:"Após o reparo, a falha continua"}];
      }
    }else{
      answer.question="Isso aponta para a "+component+" que saiu do cilindro "+from+". Confirme a mudança no scanner antes de fechar o reparo.";
      answer.test={id:"misfire-migration-verify-"+moved.code,title:"Confirmar se a falha acompanhou a "+component,
        procedure:"Confira se o contador de falhas agora aumenta no cilindro "+to+". Considere a comparação de somente uma peça, com as outras nas posições. Se mexeu em mais peças, informe isso abaixo.",
        good:"comparação de uma única peça e falha atual confirmada no cilindro "+to,code:moved.code,cylinder:from,
        choices:[{value:"confirmed",label:"Só a "+component+"; confirmou no "+to},{value:"not-followed",label:"A mudança não se confirmou"},{value:"multiple-changes",label:"Mexi em outras peças também"}]};
    }
  }

  function misfirePlugStep(c,answer,cylinder,code,results){
    var data=c.caseData, visual=data.observations["misfire-plug-observation"];
    var plugId="misfire-plug-"+code, plug=results.filter(function(r){return r.id===plugId;}).slice(-1)[0];
    if(!visual){
      answer.awaiting="misfire-plug-observation";
      answer.question="Agora confira a vela desse cilindro com o motor frio. Ela está seca, molhada de combustível/óleo ou danificada? Envie o que encontrou para escolher o próximo teste.";
      return;
    }
    if(!plug){
      answer.explanation="Vela registrada: "+visual+". Se já fez a comparação com outra vela, informe o resultado abaixo.";
      answer.awaiting="misfire-plug-result";
      answer.test={id:plugId,title:"Comparar a vela do cilindro "+cylinder,
            procedure:"Com o motor desligado e frio, troque de posição somente a vela do cilindro "+cylinder+" com a de um cilindro sem falha, da mesma especificação e sem dano. Siga a montagem e o torque do manual. Reproduza a falha e veja no scanner se ela acompanhou a vela.",
        good:"registrar se a falha acompanha a vela ou fica no cilindro "+cylinder,code:code,cylinder:cylinder,component:"plug",
        choices:[{value:"moved",label:"Mudou com a vela"},{value:"stayed",label:"Continuou no "+cylinder}]};
      if(/danific|trinc|quebrad/.test(norm(visual))){
        answer.test=null;answer.awaiting="misfire-plug-damage";
        answer.question="Você relatou dano na vela. Não reinstale uma vela trincada ou quebrada para fazer a comparação. Confirme a especificação e envie uma foto do dano antes de decidir a substituição.";
      }else if(/molhad|encharcad/.test(norm(visual))){
        answer.test=null;answer.awaiting="misfire-plug-fluid";
        var fluid=data.observations["misfire-plug-fluid"];
        if(fluid&&/combustivel|gasolina/.test(norm(fluid))){
          answer.explanation="Combustível na vela registrado; isso ainda não confirma injetor defeituoso.";
          misfireInjectorStep(c,answer,cylinder,code,results);
        }else if(fluid){
          answer.awaiting="misfire-oil-evidence";
          answer.question="Óleo na vela registrado. Antes de condenar componente, confira se há óleo no poço da vela ou na ponta que fica dentro do cilindro e envie uma foto do local.";
        }else answer.question="Vela molhada registrada. Você identificou combustível ou óleo nela? Envie essa informação antes de continuar.";
      }
      return;
    }
    if(plug.outcome==="moved"){
      answer.awaiting="misfire-plug-movement";
      answer.explanation="A falha acompanhou a vela no teste informado.";
      answer.question="Qual cilindro passou a acumular falhas e qual código apareceu depois da comparação? Vamos confirmar essa mudança antes de fechar o reparo.";
      return;
    }
    answer.explanation="A falha permaneceu no cilindro "+cylinder+" após comparar bobina e vela.";
    misfireInjectorStep(c,answer,cylinder,code,results);
  }

  function misfireInjectorStep(c,answer,cylinder,code,results){
    var data=c.caseData;
    var injector=results.filter(function(r){return r.id==="misfire-injector-leak-"+code;}).slice(-1)[0];
    var motor=data.engineCode||[c.model,c.engine].filter(Boolean).join(" ");
    if(!injector){
      answer.awaiting="misfire-injector-leak-result";
      if(data.lastInputKind==="engine-description")answer.explanation="Motor registrado: "+motor+". O próximo teste é a estanqueidade do injetor "+cylinder+"; não é preciso repetir a identificação para registrar o resultado.";
      if(data.engineIdentificationUnavailable&&!data.engineCode)answer.question="O motor "+c.engine+" já está registrado. O código específico aparece nos dados da ECU, na etiqueta ou na consulta pelo chassi; ele serve para selecionar o procedimento e os valores exatos do ensaio.";
      answer.test={id:"misfire-injector-leak-"+code,title:"Verificar estanqueidade do injetor "+cylinder,
        procedure:"Motor informado: "+motor+". Use o procedimento e o equipamento especificados no manual desse motor para verificar vazamento interno do injetor "+cylinder+". Uma queda de pressão do sistema, sozinha, não identifica qual injetor vaza. Não abra tubulações de combustível pressurizadas. Se não tiver procedimento ou equipamento, marque ‘Não testei’.",
        good:"registrar o resultado do ensaio de vazamento interno",code:code,cylinder:cylinder,
        choices:[{value:"leak",label:"Vazamento confirmado no ensaio"},{value:"sealed",label:"Sem vazamento no ensaio"}]};
    }else if(injector.outcome==="leak"){
      answer.awaiting="misfire-injector-repair";
      answer.question="O ensaio indicou vazamento interno no injetor "+cylinder+". Corrija a causa conforme o procedimento do motor e repita a leitura nas mesmas condições da falha. Informe os contadores e códigos após a verificação.";
    }else{
      var reading=data.compression&&data.compression.scope===compressionScope(data,results,code)?data.compression:null;
      answer.awaiting="misfire-compression-readings";
      if(!reading){
        answer.question="O ensaio do injetor não apontou vazamento. O próximo passo é medir a compressão dos cilindros pelo procedimento do motor "+motor+". Envie o valor de cada cilindro e a unidade; não vou inventar a pressão de referência.";
      }else{
        answer.explanation="Compressão informada: "+compressionText(reading)+".";
        if(!reading.unit){
          answer.awaiting="misfire-compression-unit";
          answer.question="A leitura está em psi, bar ou kPa?";
          answer.actions=[{label:"psi",text:"psi"},{label:"bar",text:"bar"},{label:"kPa",text:"kPa"}];
        }else if(!reading.conditions){
          answer.awaiting="misfire-compression-conditions";
          answer.question="A medição foi feita com o motor frio ou aquecido e seguindo o procedimento do ensaio? Precisamos dessas condições para interpretar os valores, sem presumir compressão normal.";
        }else{
          answer.awaiting="misfire-compression-reference";
          answer.explanation+=" Condições informadas: "+reading.conditions+".";
          answer.question="Agora precisamos comparar com os limites e as condições do manual do motor "+motor+". Envie a referência ou o resultado do ensaio de estanqueidade dos cilindros, se indicado no procedimento. O ensaio anterior do injetor só não apontou vazamento; ainda não confirma comando ou vazão corretos.";
        }
      }
    }
  }

  function noStartBatteryStep(data,answer){
    var b=data.startingBattery?startingBatteryState(data.startingBattery):null;
    if(b&&b.raw)answer.explanation+=(answer.explanation?" ":"")+"Leitura informada: "+b.raw+".";
    if(b&&b.unavailable){
      answer.awaiting="no-start-battery-unavailable";
      answer.question="Sem medir a bateria nas duas condições, ainda não podemos avaliar a alimentação da partida. Providencie um multímetro ou apoio de uma oficina. Retome com as leituras; não há peça condenada.";
      answer.actions=[{label:"Já posso medir",text:"Vou medir agora"}];
    }else if(b&&b.pending!==null){
      answer.awaiting="no-start-battery-stage";
      answer.question="Os "+b.pending+" V foram medidos antes de tentar ligar ou durante a tentativa?";
      answer.actions=[{label:"Antes",text:"Antes da tentativa"},{label:"Durante",text:"Durante a tentativa"}];
    }else if(!b||b.before===null||b.during===null){
      answer.awaiting=!b||b.before===null&&b.during===null?"no-start-battery":b.before===null?"no-start-battery-before":"no-start-battery-during";
      answer.question=answer.awaiting==="no-start-battery-before"?"Já registrei a tensão durante a tentativa. Qual tensão aparece nos polos da bateria antes de tentar ligar?"
        :answer.awaiting==="no-start-battery-during"?"Já registrei a tensão antes da tentativa. Qual é a menor tensão nos polos da bateria durante a tentativa de partida?"
        :"Com um multímetro nos polos da bateria, qual tensão aparece antes e durante a tentativa de partida? Identifique cada leitura e a unidade; se não tiver multímetro, diga isso.";
    }else{
      answer.explanation+=" Leituras identificadas: "+b.before+" V antes e "+b.during+" V durante a tentativa. Esses valores, sozinhos, não confirmam uma peça defeituosa.";
      return false;
    }
    return true;
  }

  function noStartReferenceStep(data,answer,slot){
    answer.awaiting=slot;
    var ref=data.noStartReference&&data.noStartReference.slot===slot?data.noStartReference:null;
    var target=slot==="no-start-power-diagram"?(data.cranking==="nao gira"?"cabos da bateria e circuito de comando do arranque":"alimentação e aterramento da ECU")
      :slot==="no-start-signal-reference"?"alimentação e sinal de rotação":"alimentação, sinal e autorização de partida";
    if(ref&&ref.engineCode)answer.explanation+=" Código de motor informado: "+ref.engineCode+"; a compatibilidade do procedimento ainda precisa ser conferida.";
    if(ref&&ref.status==="unavailable"){
      answer.question="Ficou registrado que você não tem a referência. Ainda não há causa confirmada. Para testar "+target+" nos pontos corretos, obtenha o esquema e o procedimento aplicáveis ao veículo. O diagnóstico fica pendente dessa informação; você pode retomar com a referência ou registrar novas medições com unidade e ponto de medição.";
      answer.actions=[{label:"Registrar novas medições",text:"Quero registrar novas medições"}];
    }else if(ref&&ref.status==="collecting"){
      answer.question="Envie a nova medição com unidade, os pontos onde mediu e a condição da tentativa de partida. Não faça pontes no arranque nem alimente pinos sem o procedimento correto.";
      answer.actions=[{label:"Não consegui medir",text:"Não tenho a referência para medir"}];
    }else if(ref&&ref.status==="evidence"){
      answer.explanation+=" Informação adicional registrada: "+ref.text+". Esse relato ainda não confirma uma causa.";
      answer.question="A referência de "+target+" ainda precisa ser conferida na documentação aplicável ao veículo. A interpretação desse teste elétrico exige essa conferência ou apoio técnico antes de condenar uma peça. O caso permanece aberto; retome com o resultado da verificação ou uma mudança do sintoma.";
      answer.actions=[{label:"Não tenho a referência",text:"Não tenho a referência"}];
    }else{
      answer.question=ref&&ref.status==="code"?"O código foi registrado. Agora envie o trecho textual do esquema ou procedimento de "+target+", com os pontos e as condições do ensaio. Só o nome do motor não determina pinagem ou limites."
        :"Para conferir "+target+", informe o código de identificação do motor ou o trecho textual do esquema/procedimento aplicável. Se não tiver a referência, use a opção abaixo.";
      answer.actions=[{label:"Não tenho a referência",text:"Não tenho a referência"}];
    }
  }

  function noStartStep(diag,answer){
    var c=diag.context,data=c.caseData;
    var observations=data.observations||{};
    answer.lead=data.cranking==="gira"?"O motor gira, mas não pega.":"O motor não pega.";
    if(!data.cranking){
      answer.awaiting="no-start-cranking";
      answer.question="Quando você tenta ligar, o motor gira ou nem gira?";
      answer.actions=[{label:"Gira",text:"O motor gira, mas não pega."},{label:"Não gira",text:"O motor não gira ao tentar ligar."}];
    }else if(!(c.model&&c.engine)){
      answer.question="Qual é o veículo? Informe modelo, ano e motor.";answer.needsVehicle=true;
    }else if(data.cranking==="nao gira"){
      if(!data.starterSound){
        answer.awaiting="no-start-sound";
        answer.question="Ao tentar ligar, você ouve algum clique ou as luzes do painel enfraquecem?";
        answer.actions=[{label:"Dá clique",text:"Dá clique"},{label:"Sem clique",text:"Sem clique"},{label:"Painel apaga",text:"O painel apaga"}];
      }else{
        if(!noStartBatteryStep(data,answer)){
          if(!data.starterConnections){
            answer.awaiting="no-start-terminals";
            answer.question="Com a ignição desligada, os terminais da bateria estão firmes e sem oxidação aparente? Não aproxime ferramentas entre os polos.";
            answer.actions=[{label:"Firmes, sem oxidação",text:"Terminais firmes, sem oxidação"},{label:"Soltos ou oxidados",text:"Terminais soltos ou oxidados"},{label:"Não conferi",text:"Não conferi os terminais"}];
          }else if(data.starterConnections==="problem"||data.starterConnections==="unavailable"){
            answer.awaiting="no-start-terminals";
            answer.question=data.starterConnections==="problem"?"Conexão solta ou oxidada foi relatada. Providencie a correção conforme o procedimento do veículo, com a ignição desligada e apoio técnico se necessário. Depois, repita a tentativa e informe se o motor passou a girar; isso ainda não confirma defeito no arranque."
              :"Sem conferir as conexões, falta essa verificação básica. Peça apoio para avaliar os terminais com a ignição desligada e retome com o que encontrou.";
            answer.actions=[{label:"Conferi: estão firmes",text:"Terminais firmes, sem oxidação"}];
          }else noStartReferenceStep(data,answer,"no-start-power-diagram");
        }
      }
    }else if(data.rpm===null&&!data.rpmPresent&&!data.rpmUnavailable){
      answer.awaiting="no-start-rpm";
      answer.question="Qual rotação (RPM) o scanner mostra enquanto o motor gira na partida? Envie o valor observado.";
      answer.actions=[{label:"0 RPM",text:"0 RPM"},{label:"Mostra rotação",text:"O scanner mostra rotação"},{label:"Não consigo medir",text:"Não consigo medir a rotação"}];
    }else if(data.rpmUnavailable&&!observations["no-start-tools"]){
      answer.awaiting="no-start-tools";
      answer.question="Sem essa leitura, vamos escolher um teste possível. Você tem multímetro, testador de centelha ou outro scanner disponível?";
    }else if(data.rpmUnavailable){
      answer.explanation="Equipamento informado: "+observations["no-start-tools"].slice(0,120)+".";
      if(!noStartBatteryStep(data,answer))noStartReferenceStep(data,answer,"no-start-power-diagram");
    }else if(data.rpm===0){
      answer.explanation="Anotei 0 RPM durante a partida. Isso ainda não confirma sensor defeituoso.";
      if(!data.ecuCommunication){
        answer.awaiting="no-start-communication";
        answer.question="O scanner continua comunicando com a ECU do motor enquanto você tenta dar partida?";
        answer.actions=[{label:"Sim",text:"Sim, comunica normalmente"},{label:"Não",text:"Não, perde comunicação"}];
      }else if(data.ecuCommunication==="no"&&!observations["no-start-ecu-power"]){
        answer.awaiting="no-start-ecu-power";
        answer.question="A comunicação cai durante a partida. Meça a tensão da bateria nessa tentativa e envie o menor valor. Antes de testar sensor, precisamos conferir alimentação e aterramento da ECU pelo esquema desse motor.";
      }else if(data.ecuCommunication==="yes"&&!observations["no-start-rotation-signal"]){
        answer.awaiting="no-start-rotation-signal";
        answer.question="A ECU comunica, mas não registra rotação. Confira conector e chicote do sensor de rotação com a ignição desligada. Envie os códigos atuais e o código do motor para localizar o teste de sinal correto.";
      }else{
        answer.explanation+=" Registrei a informação enviada: "+(observations["no-start-rotation-signal"]||observations["no-start-ecu-power"]||"").slice(0,160)+".";
        noStartReferenceStep(data,answer,"no-start-signal-reference");
      }
    }else{
      answer.explanation=data.rpm!==null?"Anotei "+data.rpm+" RPM durante a partida.":"O scanner registra rotação durante a partida.";
      if(!data.startAuthorized){
        answer.awaiting="no-start-authorization";
        answer.question="No scanner, o imobilizador mostra partida autorizada ou bloqueada?";
        answer.actions=[{label:"Autorizada",text:"Partida autorizada"},{label:"Bloqueada",text:"Partida bloqueada"},{label:"Não achei",text:"Não achei esse parâmetro"}];
      }else if(data.startAuthorized==="blocked"&&!observations["no-start-immobilizer-codes"]){
        answer.awaiting="no-start-immobilizer-codes";
        answer.question="A partida está bloqueada. Leia os códigos do imobilizador e do motor e envie a descrição completa. Não vamos condenar chave ou módulo só por esse estado.";
      }else if(!observations["no-start-next-evidence"]&&!observations["no-start-immobilizer-codes"]){
        answer.awaiting="no-start-next-evidence";
        answer.question="A rotação foi registrada. Informe os códigos atuais do motor e diga se já verificou faísca com testador e comando dos injetores. Com isso, escolhemos o próximo teste compatível com o motor.";
      }else{
        answer.explanation+=" Dados informados: "+(observations["no-start-immobilizer-codes"]||observations["no-start-next-evidence"]).slice(0,180)+".";
        noStartReferenceStep(data,answer,"no-start-engine-procedure");
      }
    }
    if(data.noStartFeedback)answer.explanation+=(answer.explanation?" ":"")+data.noStartFeedback;
  }

  function practicalAnswer(diag){
    var c=diag.context, data=c.caseData, q=norm(c.caseText+" "+c.question), known=diag.dtcs.filter(function(d){return !!d.label;});
    var lead=diag.dtcs.length?diag.dtcs.slice(0,3).map(function(d){return d.code+(d.label?" — "+d.label:"");}).join("\n"):diag.title;
    if(diag.fromMedia&&diag.dtcs.length) lead="Li na tela:\n"+lead;
    if(diag.dtcs.length>3) lead+="\nMais "+(diag.dtcs.length-3)+" código(s) na leitura.";
    var answer={lead:lead,explanation:"",question:"",actions:[],needsVehicle:false,test:null,warning:""};
    var vehicleKnown=!!(c.model&&c.engine);
    var noStart=data.symptom==="no-start";
    var shortCode=String(c.question).toUpperCase().match(/\b[PBCU]\d{3}\b/);
    if(noStart){
      noStartStep(diag,answer);
    }else if(data.candidateCode&&(shortCode||!data.symptom||data.temperature)){
      answer.awaiting="code-confirmation";
      answer.lead="Código incompleto: "+data.incompleteCode+".";
      answer.question=(data.temperature?"Anotei: falha "+(data.temperature==="sempre"?"o tempo todo":"a "+data.temperature)+". ":"")+"O código completo no scanner é "+data.candidateCode+"? Confirme sem adivinhar.";
      answer.actions=[{label:"Confirmar "+data.candidateCode,text:data.candidateCode},{label:"Digitar código",input:true}];
    }else if(diag.dtcs.length&&!vehicleKnown){
      answer.question="Qual é o veículo? Informe modelo, ano e motor para eu escolher o teste correto.";
      answer.needsVehicle=true;
    }else if(diag.dtcs.some(function(d){return !d.label&&!data.dtcDescriptions[d.code];})){
      answer.awaiting="dtc-description";
      answer.awaitingDtc=diag.dtcs.find(function(d){return !d.label&&!data.dtcDescriptions[d.code];}).code;
      answer.question="Qual é a descrição completa desse código no scanner e em qual módulo ele aparece?";
    }else if(diag.ruleId==="baseline"&&(data.symptom==="misfire"||c.dtcs.some(function(code){return /^P030[0-8]$/.test(code);}))) {
      if(!diag.dtcs.length) answer.lead="Vamos localizar a falha.";
      misfireStep(diag,answer);
    }else if(c.dtcs.indexOf("P0420")>=0&&!/sem forca|perda|entup|abaf|nao sobe/.test(q)){
      answer.question="Além da luz de injeção, o carro perde força? P0420 sozinho não comprova catalisador entupido.";
    }else if(diag.ruleId==="baseline"){
      answer.lead=known.length?lead:"Vamos por partes.";
      answer.question=/falha|falhando|rateia|engasga/.test(q)
        ?"A falha acontece a frio, a quente ou o tempo todo? Se houver código no scanner, envie também."
        :"Me diga o sintoma e a descrição do scanner. Ainda não tenho dados suficientes para indicar um teste específico.";
    }else{
      answer.explanation=known.length?"O código indica uma condição de falha; sozinho, não confirma uma peça defeituosa.":"Comece por este teste e me diga o resultado.";
      answer.test=diag.tests[0]||null;
      var previous=answer.test&&(c.testResults||[]).find(function(result){return result.id===answer.test.id;});
      if(previous&&(previous.outcome==="measured"||previous.outcome==="bad")){
        answer.briefTest=true;
        answer.explanation="Anotei no teste ‘"+answer.test.title+"’: "+(previous.report||previous.result)+".";
        answer.question=previous.outcome==="measured"
          ?"Confira essa leitura com o procedimento do motor e as condições do ensaio. O resultado ficou normal ou alterado? Informe a unidade e a condição da medição antes de concluir sobre a peça."
          :"O resultado alterado ainda não confirma uma peça defeituosa. Qual foi a leitura, a unidade e a condição do ensaio? Confira o procedimento da aplicação antes de avançar.";
      }else if(!answer.test){
        answer.explanation="Os resultados dos testes foram registrados.";
        answer.question="Como o veículo está se comportando agora? Se houve reparo, repita a condição original e a leitura do scanner; ainda precisamos dessa verificação para encerrar o caso.";
      }
      answer.warning=(diag.warnings||[]).find(function(w){return /nao abrir|ruido mecanico|pressao real baixa|atencao imediata|nao prova/.test(norm(w));})||"";
      if(answer.test&&/\d.*(?:Ω|%|°|bar\b|psi\b|kpa\b)/i.test(answer.test.procedure)&&!c.year){
        answer.test=null;answer.question="Qual é o ano do veículo? Confirme também o motor e o sistema para conferir a aplicação do procedimento antes de usar valores de referência.";
        answer.needsVehicle=true;
      }
    }
    if(/(?:vc|voce).*(?:repet|travad)|nao (?:da|deu) sequencia|ja (?:falei|informei)|nao entendi/.test(norm(c.question))&&answer.test){
      answer.briefTest=true;
      answer.question=/^misfire-migration-verify-/.test(answer.test.id)
        ?"Seu relato de mudança já foi considerado. Falta confirmar no scanner se mudou após alterar só essa peça; escolha o resultado abaixo."
        :/^misfire-injector-leak-/.test(answer.test.id)
        ?"O veículo e o código já estão registrados. Falta o resultado do ensaio de vazamento interno do injetor. Se ainda não conseguiu fazer, marque ‘Não testei’ e diga qual equipamento tem."
        :"Para seguir, falta o resultado de ‘"+answer.test.title+"’. Escolha abaixo ou conte o que encontrou; se não conseguiu fazer, marque ‘Não testei’.";
    }
    if((data.visionRows||[]).length&&!data.dtcs.length){
      var visualCodes=data.visionRows.map(function(row){return row.id+" — "+row.description;}).slice(0,8).join("; ");
      answer.explanation=[answer.explanation,"Registros lidos na fotografia pela IA (ainda não confirmados pelo mecânico): "+visualCodes+"."].filter(Boolean).join(" ");
      if(/qual (?:codigo|c[oó]digo)|diga.*sem c[oó]digo|c[oó]digo.*scanner|qual.*descri[cç][aã]o.*scanner/i.test(answer.question)){
        answer.awaiting="vision-scanner-status";
        answer.question=data.scannerFaultStatus
          ?"Já registrei que os registros do scanner são "+data.scannerFaultStatus+". Qual o próximo teste medido, com resultado e condições?"
          :"Já registrei os identificadores da fotografia. Eles estão presentes/ativos ou apenas memorizados? Nenhuma peça está condenada.";
        answer.actions=[];
      }
    }
    answer.text=[answer.lead,answer.explanation,answer.question,answer.test&&!answer.briefTest?"Teste agora: "+answer.test.title+". "+answer.test.procedure+" Esperado: "+(answer.test.good||"informe a leitura observada")+".":"",answer.warning].filter(Boolean).join("\n\n");
    return answer;
  }

  function diagnosticSearchQuery(diag){
    if((diag.context.caseData.visionRows||[]).length){
      return [diag.context.engine,diag.context.caseData.visionRows.slice(0,3).map(function(r){return r.description;}).join(" ")].filter(Boolean).join(" ").slice(0,300);
    }
    if(diag.context.caseData.symptom==="no-start")return "";
    if(!diag.context.model)return "";
    if(!diag.context.dtcs.length){
      return diag.context.caseData.symptom==="misfire"
        ?[diag.context.engine,"falha combustao ignicao mistura"].filter(Boolean).join(" "):"";
    }
    var answer=practicalAnswer(diag);
    if(/^misfire-compression-/.test(answer.awaiting))return answer.awaiting==="misfire-compression-unit"?""
      :[diag.context.caseData.engineCode,"compressao compression"].filter(Boolean).join(" ");
    if(/^misfire-injector/.test(answer.awaiting))return [diag.context.caseData.engineCode,"injetor estanqueidade vazamento injector internal leakage"].filter(Boolean).join(" ");
    if(answer.actions.length) return "";
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

  function appendTestBox(bubble,test,brief){
    var box=document.createElement("div");box.className="test-box";
    var choices=test.choices||[{value:"good",label:"Normal"},{value:"bad",label:"Alterado"}];
    box.innerHTML=(brief?'':'<b>Teste agora: '+esc(test.title)+'</b><p>'+esc(test.procedure)+'</p>'+
      '<p class="test-expected"><b>Esperado:</b> '+esc(test.good||"Informe a leitura observada.")+'</p>')+
      '<div class="test-actions">'+choices.map(function(choice){
        return '<button type="button" data-test-result="'+esc(choice.value)+'">'+esc(choice.label)+'</button>';
      }).join("")+
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
    $("messages").querySelectorAll("[data-test-result]").forEach(function(btn){btn.disabled=true;});
    state.caseContext=Object.assign({},state.caseContext,{awaiting:answer.awaiting||"",awaitingDtc:answer.awaitingDtc||""});
    var article=document.createElement("article");article.className="message bot";
    article.innerHTML='<div class="message-avatar" aria-hidden="true"></div>';
    var bubble=document.createElement("div");bubble.className="bubble practical-answer";
    bubble.innerHTML='<strong>th<span class="ia">IA</span>guinho</strong>';
    [answer.lead,answer.explanation,answer.question].filter(Boolean).forEach(function(text){
      var p=document.createElement("p");p.textContent=text;bubble.appendChild(p);
    });

    state.currentDiagnosis=diag;
    state.activeTests=answer.test?(answer.customTest?[answer.test]:diag.tests.slice()):answer.pendingTest?[answer.pendingTest]:[];
    state.activeTestIndex=0;
    if(answer.test) appendTestBox(bubble,answer.test,answer.briefTest);
    if(answer.warning){
      var warning=document.createElement("p");warning.className="diagnosis-warning";
      warning.textContent=answer.warning;bubble.appendChild(warning);
    }
    if(answer.actions.length||answer.needsVehicle){
      var actions=document.createElement("div");actions.className="test-actions";
      answer.actions.forEach(function(action){
        var btn=document.createElement("button");btn.type="button";btn.textContent=action.label;
        var caseId=state.sessionId;
        btn.addEventListener("click",function(){
          if(state.sessionId!==caseId||state.currentDiagnosis!==diag)return;
          if(action.input){$("chatInput").focus();return;}
          actions.querySelectorAll("button").forEach(function(b){b.disabled=true;});
          handleQuestion(action.text);
        });actions.appendChild(btn);
      });
      if(answer.needsVehicle){
        var vehicleBtn=document.createElement("button");vehicleBtn.type="button";vehicleBtn.textContent="Informar veículo";
        vehicleBtn.addEventListener("click",function(){
          if(state.currentDiagnosis!==diag)return;
          state.pendingQuestion=diag.context.question;$("vehicleBtn").click();
        });
        actions.appendChild(vehicleBtn);
      }
      bubble.appendChild(actions);
    }
    var refs=(diag.remoteEvidence||[]).slice(0,2).map(function(e){
      var compatibility=e.compatibility||{},pending=[];
      if(compatibility.year==="unspecified")pending.push("ano");
      if(compatibility.engine==="unspecified")pending.push("motor");
      return {text:(e.sourcePath||"Documento técnico").split(/[\\/]/).pop()+(e.page?" • pág. "+e.page:"")+" — "+(e.statusLabel||"extração não informada")+(pending.length?"; aplicação de "+pending.join(" e ")+" a conferir":"")};
    });
    uniq((diag.sourceIds||[]).concat(answer.sourceIds||[])).forEach(function(id){
      var source=(KB.sources||[]).find(function(x){return x.id===id;});
      if(source) refs.push({text:source.vehicle+" — "+source.system+(!source.url?"; referência local, conferir no manual da aplicação":""),url:source.url});
    });
    if(refs.length){
      var details=document.createElement("details");details.className="diagnosis-sources";
      details.innerHTML='<summary>Ver referências</summary><ul>'+refs.map(function(ref){
        return '<li>'+(ref.url&&/^https:\/\//.test(ref.url)?'<a href="'+esc(ref.url)+'" target="_blank" rel="noopener noreferrer">'+esc(ref.text)+'</a>':esc(ref.text))+'</li>';
      }).join("")+'</ul>';
      bubble.appendChild(details);
    }
    article.appendChild(bubble);$("messages").appendChild(article);
    state.lastBotText=answer.text;
    if(state.settings.sound&&state.settings.autoSpeak) speakText(answer.text);
    scrollMessages();
  }

  function handleTestResult(result,observedText){
    var t=state.activeTests[state.activeTestIndex];
    if(!t) return;
    if(result==="skip"){
      var skipped=/^misfire-injector-leak-/.test(t.id)
        ?"O ensaio do injetor continua pendente. Qual equipamento você tem disponível? Envie também a identificação da ECU ou a página do procedimento, se tiver; precisamos escolher um ensaio compatível antes de abrir o sistema de combustível."
        :"Tudo bem. Diga o que impede esse teste ou o que você consegue medir agora.";
      appendTextMessage("bot",skipped);recordMessage("bot",skipped);persistSession();return;
    }
    var choice=(t.choices||[]).find(function(item){return item.value===result;});
    if(t.choices&&!choice)return;
    var label=choice?choice.label:result==="good"?firstNonEmpty(t.good,"normal"):firstNonEmpty(t.bad,"alterado");
    state.testResults.push({id:t.id,title:t.title,result:label,outcome:result,code:t.code||"",cylinder:t.cylinder||0,component:t.component||"",scope:t.scope||"",flowVersion:state.caseContext.flowVersion||0,at:now()});
    if(/^misfire-live-/.test(t.id)&&result==="single"&&t.cylinder){
      state.caseContext=Object.assign({},state.caseContext,{observedCylinders:[t.cylinder],observedCylinder:t.cylinder});
    }
    var userText=observedText||t.title+": "+label+".";
    appendTextMessage("user",userText);recordMessage("user",userText,{testResult:true});
    if(choice){
      state.activeTests=[];state.activeTestIndex=0;
      handleQuestion(userText,{silentUser:true,immediate:true,testReply:true});
      return;
    }
    if(result==="bad"){
      var failed="Resultado alterado registrado em ‘"+t.title+"’. Qual foi a leitura, a unidade e a condição do ensaio? O resultado sozinho não confirma qual componente está defeituoso.";
      var failedArticle=appendTextMessage("bot",failed);recordMessage("bot",failed,{testStep:true});
      appendTestBox(failedArticle.querySelector(".bubble"),t,true);
      persistSession();return;
    }
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
    return /^(?:oi|ola|e ai|eai|bom dia|boa tarde|boa noite|fala)(?:[!,.:\s]+(?:thiaguinho|amigo|cara))?[!.?\s]*$/.test(norm(text));
  }

  function testReplyChoice(text){
    var test=state.activeTests[state.activeTestIndex];
    if(!test)return "";
    var q=norm(text).replace(/[.!?]+$/g,"");
    if(!test.choices){
      if(/^(?:normal|ok|dentro da faixa|dentro do esperado|resultado normal)$/.test(q))return "good";
      if(/^(?:alterado|fora da faixa|fora do esperado|resultado alterado)$/.test(q))return "bad";
      return "";
    }
    var exact=test.choices.find(function(choice){return norm(choice.label)===q;});
    if(exact)return exact.value;
    if(/^misfire-live-/.test(test.id)){
      var cylinders=cylinderReply(text,state.caseContext.awaiting==="misfire-cylinders");
      if(cylinders.length>1)return "multiple";
      if(/^(?:em )?(?:varios(?: cilindros)?|mais de um(?: cilindro)?)$/.test(q))return "multiple";
      var single=q.match(/^(?:so|somente|apenas) (?:no |o )?(?:cilindro )?(\d)$/);
      if(single&&test.code==="P030"+single[1])return "single";
    }
    if(/^misfire-(?:coil|plug)-/.test(test.id)){
      var component=/^misfire-plug-/.test(test.id)?"vela":"bobina";
      if(new RegExp("^(?:a falha )?(?:mudou de cilindro|mudou com a "+component+"|acompanhou a "+component+")$").test(q))return "moved";
      if(/^(?:a falha )?(?:continuou|continua|ficou) (?:no mesmo cilindro|no (?:cilindro )?\d)$/.test(q))return "stayed";
    }
    if(test.id==="misfire-connections"){
      if(/^(?:conexoes firmes|tudo firme|normal|sem dano|sem danos)$/.test(q))return "intact";
      if(/mau contato|fio danificado|conector solto/.test(q))return "damaged";
    }
    return "";
  }

  function handleQuestion(text,options){
    options=options||{};
    text=String(text||"").trim();
    if(!text) return;
    var previousFlow=state.caseContext.flowVersion||0;
    state.caseContext=extendCaseContext(state.caseContext,text);
    var statedVehicle=state.caseContext.vehicleDetails;
    if(!state.vehicle.model||statedVehicle.model&&norm(state.vehicle.model)===norm(statedVehicle.model)){
      ["brand","model","year","engine"].forEach(function(key){if(!state.vehicle[key]&&statedVehicle[key])state.vehicle[key]=statedVehicle[key];});
      saveJSON("thiaguinho_vehicle",state.vehicle);updateVehicleUI();
    }
    if((state.caseContext.flowVersion||0)!==previousFlow){state.activeTests=[];state.activeTestIndex=0;state.currentDiagnosis=null;}
    if(!options.testReply&&state.caseContext.awaiting==="misfire-component-repair"&&state.caseContext.componentRepair==="remains"&&extractCodes(text).length){
      // A post-repair reading is a new physical condition, not a revision of the earlier swap.
      state.caseContext.flowVersion++;state.caseContext.awaiting="";state.caseContext.observedCylinders=[];state.caseContext.observedCylinder=0;
      state.caseContext.componentRepair="";state.activeTests=[];state.activeTestIndex=0;state.currentDiagnosis=null;
    }
    if(!options.testReply)recordUnconfirmedMigration(text);
    var reportedComparison=!options.testReply&&recordComparisonReport(text);
    if(!options.testReply)recordCompressionReport(text);
    var testChoice=options.testReply||reportedComparison?"":testReplyChoice(text);
    if(testChoice){
      $("chatInput").value="";autoResize();
      handleTestResult(testChoice,text);return;
    }
    var pending=state.activeTests[state.activeTestIndex];
    if(pending&&!pending.choices&&!options.testReply&&!unmeasuredReport(text)){
      var subject=norm(pending.title+" "+pending.procedure),unit;
      if(/resist|ohm|Ω/.test(subject))unit=/\d+(?:[.,]\d+)?\s*(?:ohms?\b|Ω)/i;
      else if(/temperatura|ect|arrefecimento/.test(subject))unit=/\d+(?:[.,]\d+)?\s*°\s*c\b/i;
      else if(/pressao|compressao/.test(subject))unit=/\d+(?:[.,]\d+)?\s*(?:bar|psi|kpa)\b/i;
      else if(/alimentacao|tensao|bateria|carga/.test(subject))unit=/\d+(?:[.,]\d+)?\s*(?:v(?:olts?)?|mv)\b/i;
      var measured=unit&&unit.test(text);
      if(measured)state.testResults.push({id:pending.id,title:pending.title,result:text,report:text,outcome:"measured",flowVersion:state.caseContext.flowVersion||0,at:now()});
    }
    var caseData=state.caseContext;
    var caseId=state.sessionId;
    var requestId=++state.requestSequence;

    if(!options.silentUser){
      appendTextMessage("user",text);recordMessage("user",text,reportedComparison?{testResult:true}:null);
      $("chatInput").value="";autoResize();
    }

    var typing=appendTextMessage("bot","Consultando a base técnica interna",{typing:true});
    setTimeout(async function(){
      if(state.sessionId!==caseId||state.requestSequence!==requestId){typing.remove();return;}
      if(isGreeting(text)){
        typing.remove();
        var greeting=vehicleText(state.vehicle)
          ?"Estou acompanhando o "+vehicleText(state.vehicle)+". Me diga o sintoma ou o resultado do teste para continuar."
          :"Estou pronto. Me diga o sintoma e o veículo. Se tiver um código no scanner, mande junto.";
        appendTextMessage("bot",greeting);recordMessage("bot",greeting);persistSession();return;
      }

      if(norm(text).indexOf("quem e voce")>=0 || norm(text).indexOf("seu nome")>=0){
        typing.remove();
        var who="Sou o thIAguinho, IA Mecânico da thIAguinho Soluções Automotiva. Cruzo o contexto do veículo com a base técnica interna e organizo o diagnóstico por evidências, sem condenar peça sem teste.";
        appendTextMessage("bot",who);recordMessage("bot",who);persistSession();return;
      }

      var diag=buildDiagnosis(text,caseData);
      diag.fromMedia=options.fromMedia===true;
      var query=diagnosticSearchQuery(diag);
      if(query&&window.ORACLE_REMOTE_KNOWLEDGE){
        try{
          var readings=(diag.context.caseData.visionRows||[]).slice(0,4);
          if(readings.length){
            var searches=readings.map(function(row){return ORACLE_REMOTE_KNOWLEDGE.search(
              [diag.context.engine,row.description].filter(Boolean).join(" ").slice(0,220),diag.context,3
            );});
            var portions=await Promise.all(searches);
            var seenPaths=new Set(),balanced=[];
            // Select one reference from each identified circuit first.
            // Otherwise three detonation excerpts could crowd out the MAP,
            // lambda and purge-valve circuits in the five-source budget.
            for(var rank=0;rank<3&&balanced.length<5;rank++){
              for(var group=0;group<portions.length&&balanced.length<5;group++){
                var item=portions[group][rank];
                if(!item||!item.sourcePath||!item.snippet)continue;
                var key=[item.sourcePath,item.page,item.snippet].join("|");
                if(seenPaths.has(key))continue;
                seenPaths.add(key);balanced.push(item);
              }
            }
            diag.remoteEvidence=balanced;
          }else diag.remoteEvidence=await ORACLE_REMOTE_KNOWLEDGE.search(query,diag.context,2);
        }catch(err){console.warn("[Knowledge search]",err);}
      }
      if(state.sessionId!==caseId||state.requestSequence!==requestId){typing.remove();return;}
      typing.remove();
      appendDiagnosis(diag);
      recordMessage("bot",practicalAnswer(diag).text,{diagnosis:diag.ruleId,knowledgeHits:diag.remoteEvidence?diag.remoteEvidence.length:0});
      persistSession();
      // The cloud option is free-tier-only, explicit opt-in, with no paid fallback.
      var geminiAnswered=false;
      if(window.ORACLE_GEMINI){
        try{
          if(await ORACLE_GEMINI.ready()&&ORACLE_GEMINI.consentText()){
            var geminiReply=await ORACLE_GEMINI.diagnose({
              question:text,vehicle:state.vehicle,history:state.messages.slice(-12),
              tests:state.testResults.slice(-10),
              mediaText:state.mediaAnalyses.map(function(m){return m.text||"";}).slice(-2).join("\n").slice(0,2200),
              scannerRows:state.caseContext.scannerRows||[],
              visionRows:state.caseContext.visionRows||[],
              evidence:(diag.remoteEvidence||[]).slice(0,5)
            });
            if(state.sessionId===caseId&&state.requestSequence===requestId){
              var entries=(diag.remoteEvidence||[]).slice(0,5);
              var audit=entries.length
                ?"Trechos do acervo encaminhados à IA (não equivalem a diagnóstico confirmado): "+entries.map(function(e,i){
                    var scope=e.compatibility||{};
                    var application=scope.model==="matched"&&scope.year==="matched"&&scope.engine==="matched"
                      ?"modelo/ano/motor identificados"
                      :"aplicação incompleta — NÃO confirmar ano/motor por esta fonte";
                    return "F"+(i+1)+": "+e.sourcePath+(e.page?" · p. "+e.page:"")+" ["+(e.truthStatus||"extração não classificada")+"; "+application+"]";
                  }).join("; ")+"."
                :"Consulta ao acervo: nenhuma referência compatível foi recuperada nesta busca. Não há fonte técnica específica confirmada para esta resposta.";
              var guidance="Análise Gemini gratuita (conferir evidências):\n"+geminiReply.answer+"\n\n"+audit;
              appendTextMessage("bot",guidance);
              recordMessage("bot",guidance,{aiAssisted:true,provider:"gemini-free",knowledgeHits:geminiReply.sourceCount});
              persistSession();geminiAnswered=true;
            }
          }
        }catch(error){
          console.warn("[Gemini gratuito] diagnóstico determinístico preservado",error);
          if(state.sessionId===caseId&&state.requestSequence===requestId){
            var note="A consulta Gemini gratuita não foi concluída: "+String(error.message||"erro não identificado")+". O diagnóstico técnico local continua disponível.";
            appendTextMessage("bot",note);recordMessage("bot",note,{aiError:true});persistSession();
          }
        }
      }
      // Optional local Chrome AI augments the existing deterministic diagnosis, without cloud billing.
      if(!geminiAnswered&&window.ORACLE_AI){
        try{
          var localAnswer=await ORACLE_AI.analyze({
            question:text,vehicle:state.vehicle,history:state.messages.slice(-12),
            tests:state.testResults.slice(-10),
            mediaText:state.mediaAnalyses.map(function(m){return m.text||"";}).slice(-2).join("\n").slice(0,1400),
            scannerRows:state.caseContext.scannerRows||[],
            evidence:(diag.remoteEvidence||[]).slice(0,3)
          });
          if(state.sessionId===caseId&&state.requestSequence===requestId&&localAnswer.available){
            var localNote="IA local gratuita (conferir testes):\n"+localAnswer.answer+(localAnswer.translationAvailable?"":"\nTradução automática para português não disponível neste dispositivo.");
            appendTextMessage("bot",localNote);
            recordMessage("bot",localNote,{aiAssisted:true,aiMode:"on-device",knowledgeHits:localAnswer.sourceCount});
            persistSession();
          }
        }catch(error){
          console.warn("[IA local] mantendo diagnóstico técnico",error);
        }
      }
    },options.immediate?20:180);
  }

  function buildSessionPayload(){
    var firstUser=state.messages.find(function(m){return m.role==="user" && !m.testResult;});
    return {
      id:state.sessionId,
      createdAt:state.createdAt,
      updatedAt:now(),
      vehicle:vehicleText(state.vehicle)||"Veículo não informado",
      vehicleData:state.vehicle,
      caseContext:state.caseContext,
      title:(firstUser?firstUser.text:"Novo diagnóstico").slice(0,140),
      messages:state.messages.slice(-60).map(function(m){return {role:m.role,text:(m.text||"").slice(0,5000),at:m.at,testResult:m.testResult===true};}),
      dtcs:(state.caseContext.dtcs||[]).slice(),
      tests:state.testResults.slice(-20),
      lastDiagnosis:state.currentDiagnosis?{
        ruleId:state.currentDiagnosis.ruleId,
        title:state.currentDiagnosis.title,
        evidence:state.currentDiagnosis.evidence,
        nextTest:state.currentDiagnosis.tests&&state.currentDiagnosis.tests[0]?state.currentDiagnosis.tests[0].title:""
      }:null,
      mediaAnalysis:state.mediaAnalyses.map(function(m){
        return {kind:m.kind,text:(m.text||"").slice(0,5000),codes:m.codes||[],scannerRows:m.scannerRows||[],visionRows:m.visionRows||[],frames:m.frames||1};
      })
    };
  }

  function mergeHistory(local,cloud){
    var byId=new Map();
    function timestamp(item){return Date.parse(item.updatedAt||item.createdAt)||Number(item.updatedAtMs)||0;}
    (Array.isArray(cloud)?cloud:[]).concat(Array.isArray(local)?local:[]).forEach(function(item){
      if(!item||!item.id)return;
      var previous=byId.get(item.id);
      if(!previous||timestamp(item)>=timestamp(previous))byId.set(item.id,item);
    });
    return Array.from(byId.values()).sort(function(a,b){return timestamp(b)-timestamp(a);}).slice(0,50);
  }

  function persistSession(){
    if(!state.messages.length) return;
    var item=buildSessionPayload();
    var local=loadJSON("thiaguinho_history",[]).filter(function(x){return x.id!==item.id;});
    local.unshift(item);local=local.slice(0,50);saveJSON("thiaguinho_history",local);
    renderHistory(mergeHistory(local,state.cloudHistory));
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
    state.requestSequence++;
    closeDialog($("historyDialog"));
    state.sessionId=item.id||newSessionId();
    state.createdAt=item.createdAt||now();
    state.vehicle=item.vehicleData||{};
    state.messages=(item.messages||[]).slice();
    state.caseContext=item.caseContext?extendCaseContext(item.caseContext,""):recoverCaseContext(state.messages);
    // Previous builds stored Gemini's readable scanner results as a bot message.
    // Recover only explicitly labelled visual reports; never promote OCR or hypotheses.
    if(!(state.caseContext.visionRows||[]).length&&window.ORACLE_GEMINI&&window.ORACLE_GEMINI.extractVisionRows){
      var oldVisual=state.messages.filter(function(m){
        return m.role==="bot"&&/^Leitura e orientação por Gemini gratuito \(imagem original; conferir\):/.test(m.text||"");
      }).slice(-1)[0];
      if(oldVisual){
        var recoveredVisual=window.ORACLE_GEMINI.extractVisionRows(oldVisual.text||"");
        if(recoveredVisual.length)state.caseContext.visionRows=recoveredVisual;
      }
    }
    if(item.caseContext&&item.caseContext.factVersion!==1){
      // Older snapshots may have overwritten a plug fact with an unrelated reply.
      // Recover only explicit user statements, never generated bot text.
      var recovered=recoverCaseContext(state.messages);
      if(recovered.observations["misfire-plug-observation"])state.caseContext.observations["misfire-plug-observation"]=recovered.observations["misfire-plug-observation"];
      if(recovered.coilAppearance)state.caseContext.coilAppearance=recovered.coilAppearance;
    }
    state.pendingQuestion=null;
    state.testResults=(item.tests||[]).slice();
    var recoveredComparison=false;
    if(!item.caseContext||item.caseContext.continuityVersion!==2){
      state.messages.filter(function(m){return m.role==="user"&&!m.testResult;}).forEach(function(m){
        if(recordComparisonReport(m.text,m.at,true))recoveredComparison=true;
      });
      state.testResults.sort(function(a,b){return String(a.at||"").localeCompare(String(b.at||""));});
    }
    state.mediaAnalyses=(item.mediaAnalysis||[]).map(function(m){return Object.assign({status:"Análise recuperada do histórico"},m);});
    var resumed=practicalAnswer(buildDiagnosis(""));
    state.caseContext=Object.assign({},state.caseContext,{awaiting:resumed.awaiting||"",awaitingDtc:resumed.awaitingDtc||"",continuityVersion:2});
    var recoveredCompression=recoverCompressionReport();
    if(recoveredCompression)resumed=practicalAnswer(buildDiagnosis(""));
    var recoveredState=recoveredComparison||recoveredCompression;
    var restoreControls=!!(resumed.test||resumed.pendingTest||resumed.actions.length);
    state.currentDiagnosis=null;state.activeTests=[];state.activeTestIndex=0;
    saveJSON("thiaguinho_vehicle",state.vehicle);updateVehicleUI();renderMediaQueue();

    $("messages").innerHTML="";
    if(!state.messages.length){
      appendTextMessage("bot","Histórico aberto. Continue me contando o que aconteceu depois.");
    }else{
      state.messages.forEach(function(m,index){
        // Re-render the last answer with live controls instead of duplicating it as plain text.
        if(restoreControls&&!recoveredState&&index===state.messages.length-1&&m.role==="bot"&&m.text===resumed.text)return;
        appendTextMessage(m.role==="user"?"user":"bot",m.text);
      });
    }
    if(recoveredState||restoreControls)appendDiagnosis(buildDiagnosis(""));
    if(recoveredState){recordMessage("bot",practicalAnswer(state.currentDiagnosis).text,{historyRecovery:true});persistSession();}
    scrollMessages();
    toast("Diagnóstico reaberto");
  }

  function startNewCase(){
    state.requestSequence++;
    state.sessionId=newSessionId();state.createdAt=now();state.messages=[];state.mediaAnalyses=[];state.currentDiagnosis=null;
    state.activeTests=[];state.activeTestIndex=0;state.testResults=[];state.pendingQuestion=null;
    state.caseContext=emptyCaseContext();
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

  function applyVehicle(v){
    var different=["brand","model","engine"].some(function(key){
      var oldValue=norm(state.vehicle[key]),newValue=norm(v[key]);
      return oldValue&&newValue&&oldValue.indexOf(newValue)<0&&newValue.indexOf(oldValue)<0;
    });
    if(different&&state.messages.length){persistSession();startNewCase();}
    state.vehicle=Object.assign({},v);
    saveJSON("thiaguinho_vehicle",state.vehicle);updateVehicleUI();
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
        if(!v)return;fillVehicleForm(v);applyVehicle(v);toast("Veículo carregado");
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
      applyVehicle(vehicleFromForm());
      closeDialog($("vehicleDialog"));
      toast("Veículo aplicado");
      if(state.messages.length) persistSession();
      if(state.pendingQuestion){
        var question=state.pendingQuestion;state.pendingQuestion=null;
        handleQuestion(question,{silentUser:true,immediate:true});
      }
    });
    $("clearVehicleBtn").addEventListener("click",function(){
      if(state.messages.length){persistSession();startNewCase();}
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
        var scannerRows=Array.isArray(result.scannerRows)?result.scannerRows:(ORACLE_MEDIA.scannerRows?ORACLE_MEDIA.scannerRows(result.text||""):[]);
        if(scannerRows.length){
          state.mediaAnalyses[idx].scannerRows=scannerRows;
          state.caseContext.scannerRows=(state.caseContext.scannerRows||[]).concat(scannerRows).slice(-30);
        }
        var message=scannerRows.length
          ?"Leitura local parcial do scanner ("+(result.ocrPasses||1)+" etapa(s) de OCR). Identificadores POSSÍVEIS, ainda não confirmados:\n"+scannerRows.map(function(row){return row.id+" — "+row.description+(row.confidence==="low"?" [leitura incerta]":" [conferir na foto]");}).join("\n")+"\nA leitura pode omitir linhas ou confundir números, especialmente com reflexos. Não converti identificadores do aparelho em DTC P/DF. Confira os registros; os defeitos são presentes ou memorizados?"
          :candidates.length
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
        // Visual Gemini free tier: original image ONLY after separate consent.
        var geminiRead=false;
        if(file.type&&file.type.indexOf("image/")===0&&window.ORACLE_GEMINI){
          var waitGemini=null;
          try{
            if(await ORACLE_GEMINI.ready()&&ORACLE_GEMINI.consentText()&&ORACLE_GEMINI.consentImage()){
              waitGemini=appendTextMessage("bot","Consultando Gemini gratuito para ler a fotografia do scanner...");
              // The OCR may be wrong. Do not invent the pictured circuits by
              // searching fixed Clio components before the image has been read.
              var imageDataUrl=await ORACLE_MEDIA.imageForRemoteVision(file);
              var geminiImage=await ORACLE_GEMINI.diagnose({
                question:"Interprete cada linha visível na fotografia ORIGINAL do scanner. O OCR enviado pode estar severamente errado. Preserve números repetidos e não traduza para P/DF sem tabela comprovada.",
                vehicle:state.vehicle,mediaText:result.text,scannerRows:scannerRows,
                evidence:[],history:state.messages.slice(-9),
                tests:state.testResults.slice(-8),imageDataUrl:imageDataUrl
              });
              if(state.mediaAnalyses[idx]&&state.mediaAnalyses[idx].text===result.text){
                var foundRows=ORACLE_GEMINI.extractVisionRows?ORACLE_GEMINI.extractVisionRows(geminiImage.answer):[];
                if(foundRows.length){
                  state.mediaAnalyses[idx].visionRows=foundRows;
                  state.caseContext.visionRows=foundRows;
                  state.caseContext.scannerFaultStatus="";
                }
                var visionText="Leitura e orientação por Gemini gratuito (imagem original; conferir):\n"+geminiImage.answer;
                if(waitGemini){waitGemini.remove();waitGemini=null;}
                appendTextMessage("bot",visionText);
                recordMessage("bot",visionText,{aiAssisted:true,provider:"gemini-free",visionUsed:true});
                persistSession();geminiRead=true;
                // Now use the actual circuits read from this photograph to
                // retrieve source windows; this happens AFTER the visual model
                // reply, and therefore cannot be described as evidence the
                // model saw during its initial image interpretation.
                if(foundRows.length&&window.ORACLE_REMOTE_KNOWLEDGE){
                  try{
                    var searched=await Promise.race([
                      Promise.all(foundRows.slice(0,5).map(function(row){
                        return ORACLE_REMOTE_KNOWLEDGE.search(row.description,state.vehicle,2);
                      })),
                      new Promise(function(resolve){setTimeout(function(){resolve(null);},7500);})
                    ]);
                    if(Array.isArray(searched)){
                      var uniqueEvidence=[],usedEvidence=new Set();
                      searched.forEach(function(group){
                        (group||[]).slice(0,2).forEach(function(hit){
                          if(!hit||!hit.sourcePath||!hit.snippet)return;
                          var hash=[hit.sourcePath,hit.page,hit.snippet].join("|");
                          if(usedEvidence.has(hash)||uniqueEvidence.length>=5)return;
                          usedEvidence.add(hash);uniqueEvidence.push(hit);
                        });
                      });
                      var sourceNote=uniqueEvidence.length
                        ?"Consulta posterior ao acervo (NÃO utilizada na leitura inicial da foto): "+uniqueEvidence.map(function(hit){
                          var target=hit.compatibility||{};
                          var complete=target.model==="matched"&&target.engine==="matched"&&target.year==="matched";
                          return hit.sourcePath+(hit.page?" p. "+hit.page:"")+" ["+(hit.truthStatus||"sem classificação")+
                            (complete?"; aplicação identificada":"; aplicação ano/motor NÃO confirmada")+"]";
                        }).join("; ")+"."
                        :"Consulta ao acervo após identificar os circuitos: não foi encontrada referência com aplicação comprovada para este veículo. Não utilizarei esquemas de outro modelo.";
                      appendTextMessage("bot",sourceNote);
                      recordMessage("bot",sourceNote,{knowledgeAudit:true,knowledgeHits:uniqueEvidence.length});
                      persistSession();
                    }
                  }catch(searchError){console.warn("[Conhecimento após imagem]",searchError);}
                }
              }else if(waitGemini){waitGemini.remove();}
            }
          }catch(error){
            if(waitGemini){waitGemini.remove();waitGemini=null;}
            console.warn("[Gemini gratuito: foto]",error);
            var visionErr="Gemini gratuito não concluiu a leitura visual: "+String(error.message||"erro técnico")+". O OCR acima permanece não confirmado.";
            appendTextMessage("bot",visionErr);recordMessage("bot",visionErr,{aiError:true});persistSession();
          }
        }
        // Local multimodal analysis sees original file only if Chrome supports it.
        if(!geminiRead&&file.type&&file.type.indexOf("image/")===0&&window.ORACLE_AI){
          var pending=null;
          try{
            var localState=await ORACLE_AI.availability(true);
            var textualState=localState==="unavailable"?await ORACLE_AI.availability(false):localState;
            if(textualState!=="unavailable"){
              pending=appendTextMessage("bot","Analisando a imagem com a IA local gratuita do navegador...");
              var refs=[];
              if(window.ORACLE_REMOTE_KNOWLEDGE){
                try{refs=await Promise.race([
                  Promise.all([
                    ORACLE_REMOTE_KNOWLEDGE.search("sensor detonação motor",state.vehicle,3),
                    ORACLE_REMOTE_KNOWLEDGE.search("MAP lambda cânister circuito elétrico",state.vehicle,3)
                  ]).then(function(rows){return rows[0].concat(rows[1]).slice(0,3);}),
                  new Promise(function(resolve){setTimeout(function(){resolve([]);},4000);})
                ]);}catch(e){refs=[];}
              }
              var localResult=await ORACLE_AI.analyze({
                imageFile:localState!=="unavailable"?file:null,
                question:"Leia a fotografia de scanner preservando cada linha visível. Não invente DTCs ou números ocultos.",
                vehicle:state.vehicle,mediaText:result.text,scannerRows:scannerRows,
                evidence:refs,history:state.messages.slice(-10),tests:state.testResults.slice(-10)
              });
              if(localResult.available&&state.mediaAnalyses[idx]&&state.mediaAnalyses[idx].text===result.text){
                var answerText="Análise pela IA local gratuita"+(localResult.vision?" (imagem original)":" (texto OCR)")+":\n"+localResult.answer+(localResult.translationAvailable?"":"\nTradução para português indisponível neste navegador.");
                if(pending){pending.remove();pending=null;}
                appendTextMessage("bot",answerText);
                recordMessage("bot",answerText,{aiAssisted:true,aiMode:"on-device",visionUsed:localResult.vision});persistSession();
              }else if(pending){pending.remove();pending=null;}
            }else{
              var note=ORACLE_AI.takeUnavailableNotice();
              if(note){appendTextMessage("bot",note);recordMessage("bot",note,{aiStatus:"unavailable"});persistSession();}
            }
          }catch(error){
            console.warn("[IA local: scanner]",error);
            if(pending){pending.remove();pending=null;}
            var notice="A IA local não concluiu a análise: "+String(error.message||"erro do navegador")+". A leitura OCR não foi confirmada.";
            appendTextMessage("bot",notice);recordMessage("bot",notice,{aiStatus:"error"});persistSession();
          }
        }
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
          var merged=mergeHistory(loadJSON("thiaguinho_history",[]),state.cloudHistory);
          saveJSON("thiaguinho_history",merged);
          renderHistory(merged);
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
    $("historyBtn").addEventListener("click",function(){renderHistory(mergeHistory(loadJSON("thiaguinho_history",[]),state.cloudHistory));openDialog($("historyDialog"));});
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
