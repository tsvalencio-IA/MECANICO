(function(){
  "use strict";

  var BASE="https://raw.githubusercontent.com/tsvalencio-IA/MECANICO/knowledge-compact/";
  var manifest=null,manifestPromise=null,mapPromise=null;
  var jsonCache=new Map();
  var queryCache=new Map();
  var SEARCH_VERSION="2.2.0-focus";

  function norm(v){
    return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  }

  function codesFrom(text){
    if(window.ORACLE_MEDIA) return window.ORACLE_MEDIA.detectCodes(text);
    return Array.from(new Set(String(text||"").toUpperCase().match(/\b(?:[PBCU][0-3][0-9A-F]{3}|DF\d{3,4})\b/g)||[]));
  }

  function tokensFrom(text){
    var stop=new Set(["para","com","sem","que","uma","uns","das","dos","de","da","do","em","no","na","nos","nas","por","pra","pro","carro","veiculo","veículo","motor","quero","como","qual","quais","esta","está","este","essa","esse","isso","aqui"]);
    return Array.from(new Set(norm(text).match(/[a-z0-9][a-z0-9._-]{2,31}/g)||[]))
      .filter(function(t){return !stop.has(t)&&!/^[0-9]+$/.test(t);})
      .slice(0,18);
  }

  function identityTokensFrom(vehicle){
    if(!vehicle||typeof vehicle!=="object") return [];
    var raw=[vehicle.model,vehicle.brand,vehicle.engine].filter(Boolean).join(" ");
    var stop=new Set(["motor","automatico","automático","manual","flex","gasolina","etanol","diesel"]);
    return Array.from(new Set(norm(raw).match(/[a-z0-9][a-z0-9._-]{1,31}/g)||[]))
      .filter(function(t){return !stop.has(t)&&!/^[0-9.]+$/.test(t);})
      .slice(0,8);
  }

  function escaped(v){return String(v).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
  function hasTerm(text,term){
    return new RegExp("(?:^|[^a-z0-9])"+escaped(norm(term))+"(?=$|[^a-z0-9])").test(norm(text));
  }
  function modelTokensFrom(vehicle){
    return Array.from(new Set(norm(vehicle&&vehicle.model).match(/[a-z0-9]+/g)||[]));
  }
  function topicTokensFrom(tokens,vehicleText){
    var vehicleTerms=tokensFrom(vehicleText).concat(identityTokensFrom({model:vehicleText}));
    var generic=new Set(["teste","testes","test","tests","testar","ensaio","ensaios","procedimento","procedimentos","diagnostico","diagnosticar","verificar","verificacao","medir","medicao","manual","fonte","tecnica","tecnico","ajuda","preciso","valor","valores"]);
    return tokens.filter(function(t){return !generic.has(t)&&vehicleTerms.indexOf(t)<0;});
  }
  function matchesTopics(text,topics){
    var groups=[
      ["sensor","sensores"],["injetor","injetores","injector","injectors","bico","bicos"],
      ["compressao","compression"],["pressao","pressure"],["tensao","voltage"],
      ["resistencia","resistance"],["borboleta","throttle"]
    ];
    return topics.every(function(t){
      var alternatives=groups.find(function(group){return group.indexOf(t)>=0;})||[t];
      return alternatives.some(function(term){return hasTerm(text,term);});
    });
  }

  // Applicability and extraction quality are separate. Missing year/engine information
  // stays unspecified; explicit contradictions never become a reference for this car.
  function compatibilityFor(text,path,vehicle){
    var result={model:"unspecified",year:"unspecified",engine:"unspecified"};
    if(!vehicle||typeof vehicle!=="object") return result;
    var normalized=norm(text+" "+path).replace(/[_/\\-]/g," ");
    var models=modelTokensFrom(vehicle);
    if(models.length){
      if(!models.every(function(t){return hasTerm(normalized,t);}))return null;
      result.model="matched";
    }
    // Archive-directory dates are not model years. Only a path segment naming
    // the model or an explicit model/year phrase establishes year applicability.
    var year=Number(vehicle.year),yearParts=norm(path).split(/[/\\]/).filter(function(part){
      return models.length&&models.every(function(t){return hasTerm(part.replace(/_/g," "),t);});
    }).map(function(part){return part.replace(/_/g," ");});
    var modelPattern=models.map(escaped).join("[\\s._-]+");
    if(modelPattern){
      var yearContext=new RegExp("(?:^|[^a-z0-9])"+modelPattern+"[\\s:,-]*(?:(?:modelo|anos?|model year)\\s*[:=]?\\s*)?((?:19[5-9]\\d|20[0-3]\\d)(?:\\s*(?:a|ate|to|[-–—/])\\s*(?:19[5-9]\\d|20[0-3]\\d))?)","g");
      var ym;
      while((ym=yearContext.exec(norm(text))))yearParts.push(ym[1]);
    }
    if(year>=1950&&year<=2039){
      var years=[],ranges=[];
      yearParts.forEach(function(part){
        var range=/\b(19[5-9]\d|20[0-3]\d)\s*(?:a|ate|to|[-–—/])\s*(19[5-9]\d|20[0-3]\d)\b/g,match;
        while((match=range.exec(part)))ranges.push([Number(match[1]),Number(match[2])]);
        (part.match(/\b(?:19[5-9]\d|20[0-3]\d)\b/g)||[]).forEach(function(y){years.push(Number(y));});
      });
      if(years.length){
        if(years.indexOf(year)<0&&!ranges.some(function(r){return year>=r[0]&&year<=r[1];}))return null;
        result.year="matched";
      }
    }
    var engine=norm(vehicle.engine),required=0,matched=0;
    var displacement=engine.match(/\b([1-9])[.,](\d{1,2})\b/);
    if(displacement){
      required++;
      var requested=Number(displacement[1]+"."+displacement[2]),declared=[];
      var engineSize=/\b([1-9][.,]\d{1,2})\s*(?:l\b|litros?\b|tsi\b|tfsi\b|tdi\b|mpi\b|flex\b|turbo\b|16v\b|8v\b)/g,dm;
      while((dm=engineSize.exec(normalized)))declared.push(Number(dm[1].replace(",",".")));
      var named=new RegExp("(?:^|[^a-z0-9])(?:motor|engine"+(modelPattern?"|"+modelPattern:"")+")[\\s:,-]+([1-9][.,]\\d{1,2})(?![0-9])","g");
      while((dm=named.exec(normalized))){
        if(!/^\s*(?:bar|psi|volts?|v\b|ohm|mm\b|ms\b)/.test(normalized.slice(named.lastIndex)))declared.push(Number(dm[1].replace(",",".")));
      }
      if(declared.length){if(declared.indexOf(requested)<0)return null;matched++;}
    }
    var requestedCodes=engine.match(/\b(?:[a-z]\d[a-z]|[a-z]{2}\d{3})\b/g)||[];
    requestedCodes.forEach(function(code){
      required++;
      var family=/^[a-z]\d[a-z]$/.test(code)?/\b[a-z]\d[a-z]\b/g:/\b[a-z]{2}\d{3}\b/g;
      var declaredCodes=normalized.match(family)||[];
      if(declaredCodes.length){if(declaredCodes.indexOf(code)<0)matched=-100;else matched++;}
    });
    if(matched<0)return null;
    var technology=engine.match(/\b(tsi|tfsi|tdi|mpi)\b/);
    if(technology){
      required++;
      var technologies=normalized.match(/\b(?:tsi|tfsi|tdi|mpi)\b/g)||[];
      var group=technology[1]==="tfsi"?"tsi":technology[1];
      if(technologies.length){
        if(!technologies.some(function(t){return (t==="tfsi"?"tsi":t)===group;}))return null;
        matched++;
      }
    }
    var requestedDiesel=/\b(?:tdi|diesel)\b/.test(engine),requestedPetrol=/\b(?:tsi|tfsi|mpi|gasolina|flex|etanol)\b/.test(engine);
    var diesel=/\b(?:tdi|diesel)\b/.test(normalized),petrol=/\b(?:tsi|tfsi|mpi|gasolina|flex|etanol)\b/.test(normalized);
    if((requestedDiesel&&petrol&&!diesel)||(requestedPetrol&&diesel&&!petrol))return null;
    if(!technology&&(requestedDiesel||requestedPetrol)){
      required++;
      if((requestedDiesel&&diesel)||(requestedPetrol&&petrol))matched++;
    }
    if(required&&matched===required)result.engine="matched";
    return result;
  }


  // Match actual subsystem terms rather than shared filler ("sensor", "circuito").
  // Each name resolves to unchanged source windows in the generated focus index.
  function focusTopicsFrom(query){
    var q=norm(query),result=[];
    var patterns={
      detonacao:/\b(?:detonac\w*|knock\s+sensor)\b/,
      map:/\b(?:sensor\s+(?:de\s+)?pressao\s+absoluta|pressao\s+absoluta|sensor\s+map|manifold\s+absolute)\b/,
      lambda:/\b(?:lambda|sonda\s+(?:de\s+)?oxigenio|oxygen\s+sensor)\b/,
      canister:/\b(?:canister|canistor|purga|evaporativ\w*)\b/,
      alimentacao:/\b(?:rele\s+principal|alimentacao\s+(?:da\s+)?(?:ecu|uce|central)|aterramento\s+(?:da\s+)?(?:ecu|uce|central)|fusivel\s+(?:da\s+)?injecao)\b/,
      injetor:/\b(?:injetor(?:es)?|injector(?:s)?|bico\s+injetor)\b/,
      ignicao:/\b(?:bobina(?:s)?\s+(?:de\s+)?ignicao|ignition\s+coil)\b/
    };
    Object.keys(patterns).forEach(function(key){if(patterns[key].test(q))result.push(key);});
    return result.slice(0,3);
  }
  function matchesFocusedWindow(topic,text){
    var q=norm(text);
    var patterns={
      detonacao:/\b(?:detonac\w*|knock\s+sensor)\b/,
      map:/\b(?:sensor\s+(?:de\s+)?pressao\s+absoluta|pressao\s+absoluta|sensor\s+map|manifold\s+absolute)\b/,
      lambda:/\b(?:lambda|sonda\s+(?:de\s+)?oxigenio|oxygen\s+sensor)\b/,
      canister:/\b(?:canister|canistor|purga|evaporativ\w*)\b/,
      alimentacao:/\b(?:rele\s+principal|alimentacao\s+(?:da\s+)?(?:ecu|uce|central)|aterramento\s+(?:da\s+)?(?:ecu|uce|central)|fusivel\s+(?:da\s+)?injecao)\b/,
      injetor:/\b(?:injetor(?:es)?|injector(?:s)?|bico\s+injetor)\b/,
      ignicao:/\b(?:bobina(?:s)?\s+(?:de\s+)?ignicao|ignition\s+coil)\b/
    };
    return !!(patterns[topic]&&patterns[topic].test(q));
  }

  function prefix(term){
    var t=String(term||"").replace(/[^a-z0-9]/g,"");
    if(t.length>=2) return t.slice(0,2);
    if(t.length===1) return t+"0";
    return "__";
  }

  async function fetchJson(path,noStore){
    var revision=manifest&&(manifest.index_revision||manifest.source_archive_sha256)||"";
    var key=path+"|"+revision;
    if(!noStore&&jsonCache.has(key)) return jsonCache.get(key);
    var url=BASE+path;
    if(revision) url+="?v="+encodeURIComponent(revision.slice(0,20));
    var p=fetch(url,{cache:noStore?"no-store":"force-cache"}).then(function(r){
      if(!r.ok) throw new Error("compact knowledge "+path+" HTTP "+r.status);
      return r.json();
    });
    if(!noStore) jsonCache.set(key,p);
    try{return await p;}catch(e){if(!noStore)jsonCache.delete(key);throw e;}
  }

  async function loadManifest(){
    if(manifestPromise) return manifestPromise;
    manifestPromise=fetch(BASE+"manifest.json?ts="+Date.now(),{cache:"no-store"})
      .then(function(r){if(!r.ok)throw new Error("compact manifest HTTP "+r.status);return r.json();})
      .then(function(m){
        if(!m||m.mode!=="compact-lexical"||m.heavy_shards_required_by_client!==false) throw new Error("compact manifest inválido");
        manifest=m;
        window.dispatchEvent(new CustomEvent("oracle:knowledge-status",{detail:{
          online:true,mode:"compact",version:SEARCH_VERSION,records:m.records||0,heavy:false
        }}));
        return m;
      }).catch(function(err){
        manifestPromise=null;
        console.warn("[Compact knowledge]",err);
        window.dispatchEvent(new CustomEvent("oracle:knowledge-status",{detail:{online:false,mode:"local-only",reason:String(err&&err.message||err)}}));
        throw err;
      });
    return manifestPromise;
  }

  async function loadRecordMap(){
    await loadManifest();
    if(!mapPromise) mapPromise=fetchJson("record-map.json",false).catch(function(err){mapPromise=null;throw err;});
    return mapPromise;
  }

  async function postingsForTerm(term){
    await loadManifest();
    try{
      var file=await fetchJson("terms/"+prefix(term)+".json",false);
      return file[term]||[];
    }catch(e){
      if(String(e&&e.message||e).indexOf("HTTP 404")>=0) return [];
      throw e;
    }
  }

  async function postingsForCode(code){
    await loadManifest();
    try{
      var payload=await fetchJson("dtc/"+String(code).toUpperCase()+".json",false);
      if(Array.isArray(payload)) return {ids:payload,direct:{}};
      var rows=payload&&Array.isArray(payload.records)?payload.records:[];
      var direct={};
      var ids=rows.map(function(row){direct[String(row.id)]=row;return row.id;});
      return {ids:ids,direct:direct};
    }catch(e){
      if(String(e&&e.message||e).indexOf("HTTP 404")>=0) return {ids:[],direct:{}};
      throw e;
    }
  }

  function addScores(map,ids,points){
    (ids||[]).forEach(function(id){map.set(Number(id),(map.get(Number(id))||0)+points);});
  }

  function truthWeight(rec){
    var s=rec.truth_status||"";
    if(s==="source_extracted") return 20;
    if(s==="ocr_unverified") return -4;
    if(s==="unverified_strings") return -28;
    return -12;
  }

  function snippet(text,needles){
    var raw=String(text||"").replace(/\s+/g," ").trim();
    if(!raw) return "";
    var n=norm(raw),pos=-1;
    for(var i=0;i<needles.length;i++){
      var p=n.indexOf(norm(needles[i]));
      if(p>=0&&(pos<0||p<pos)) pos=p;
    }
    if(pos<0) pos=0;
    var start=Math.max(0,pos-150),end=Math.min(raw.length,start+500);
    return (start>0?"…":"")+raw.slice(start,end)+(end<raw.length?"…":"");
  }

  function statusLabel(rec){
    if(rec.truth_status==="source_extracted") return "Fonte extraída diretamente";
    if(rec.truth_status==="ocr_unverified") return "OCR — conferir imagem/fonte";
    if(rec.truth_status==="unverified_strings") return "Texto recuperado — não usar sozinho como valor exato";
    return "Evidência não validada";
  }

  async function search(query,vehicle,limit){
    limit=Math.max(1,Math.min(Number(limit)||6,8));
    var vehicleText=vehicle&&typeof vehicle==="object"
      ? [vehicle.brand,vehicle.model,vehicle.year,vehicle.engine,vehicle.transmission].filter(Boolean).join(" ")
      : String(vehicle||"");
    var cacheKey=norm(String(query||"")+"|"+vehicleText+"|"+limit);
    if(queryCache.has(cacheKey)) return queryCache.get(cacheKey);

    var m;
    try{m=await loadManifest();}catch(e){return [];}

    var qTokens=tokensFrom(query);
    var topicTokens=topicTokensFrom(qTokens,vehicleText);
    var vehicleTokens=tokensFrom(vehicleText);
    var codes=codesFrom(String(query||"")+" "+vehicleText);
    var requestedFocus=codes.length?[]:focusTopicsFrom(query);
    var focusKeys=m.focused_topics?requestedFocus.filter(function(key){return Number(m.focused_topics[key])>0;}):[];
    if(!codes.length&&!topicTokens.length&&!focusKeys.length)return [];
    var scores=new Map();
    var directEvidence={};

    window.dispatchEvent(new CustomEvent("oracle:knowledge-search",{detail:{state:"start",mode:"compact"}}));
    try{
      var codeLists=await Promise.all(codes.map(postingsForCode));
      codeLists.forEach(function(pack){
        addScores(scores,pack.ids,95);
        Object.keys(pack.direct||{}).forEach(function(id){
          if(!directEvidence[id])directEvidence[id]=[];
          directEvidence[id].push(pack.direct[id]);
        });
      });

      var terms=qTokens.slice(0,10);
      var termLists=await Promise.all(terms.map(postingsForTerm));
      termLists.forEach(function(ids,i){
        var bonus=/[0-9]/.test(terms[i])?18:12;
        addScores(scores,ids,bonus);
      });

      var vterms=vehicleTokens.slice(0,7);
      var vehicleLists=await Promise.all(vterms.map(postingsForTerm));
      vehicleLists.forEach(function(ids){addScores(scores,ids,18);});

      if(!scores.size&&!focusKeys.length) return [];

      var ranked=Array.from(scores.entries()).sort(function(a,b){return b[1]-a[1];}).slice(0,48);
      var recordMap=ranked.length?await loadRecordMap():{};
      var bucketScore=new Map();
      ranked.forEach(function(x){
        var b=Number(recordMap[x[0]]);
        if(!Number.isInteger(b)||b<0||b>=Number(m.record_buckets||64))return;
        bucketScore.set(b,(bucketScore.get(b)||0)+x[1]);
      });
      var chosenBuckets=Array.from(bucketScore.entries()).sort(function(a,b){return b[1]-a[1];}).slice(0,7).map(function(x){return x[0];});
      var bucketData=await Promise.all(chosenBuckets.map(function(b){return fetchJson("records/r"+String(b).padStart(2,"0")+".json",false);}));
      var records={};
      bucketData.forEach(function(obj){Object.keys(obj||{}).forEach(function(k){records[k]=obj[k];});});

      var needles=codes.concat(qTokens).concat(vehicleTokens);
      var queryText=norm(query),compressionQuery=!codes.length&&/compressao|compression/.test(queryText);
      var injectorLeakQuery=!codes.length&&!compressionQuery&&/estanqueidade|internal leakage/.test(queryText)&&/injetor|injector/.test(queryText);
      var detailed=[];
      // The focused windows are not limited by the generic term posting cap or
      // the first 2600 preview characters. Keep actual path/page/SHA/method.
      // A focused hit must explicitly identify this MODEL. If the source only
      // discusses another model, never promote it as vehicle-specific evidence.
      var focusSets=await Promise.all(focusKeys.map(function(key){
        return fetchJson("focus/"+key+".json",false).then(function(rows){
          return Array.isArray(rows)?rows.map(function(row){return {key:key,row:row};}):[];
        }).catch(function(e){
          if(String(e&&e.message||e).indexOf("HTTP 404")>=0)return [];
          throw e;
        });
      }));
      [].concat.apply([],focusSets).forEach(function(pair){
        var row=pair.row;
        if(!row||!row.path||!row.snippet||!matchesFocusedWindow(pair.key,row.snippet))return;
        var compat=compatibilityFor(row.snippet,row.path,vehicle);
        if(!compat||compat.model!=="matched")return;
        var rec={
          id:row.id,path:row.path,page:row.page,chunk:row.chunk,
          text:row.snippet,method:row.method,truth_status:row.truth_status,
          confidence:row.confidence,sha256:row.sha256
        };
        detailed.push({
          rec:rec,direct:null,compatibility:compat,
          score:145+truthWeight(rec)+(compat.engine==="matched"?28:0)+(compat.year==="matched"?24:0)
        });
      });
      ranked.forEach(function(pair){
        var rec=records[String(pair[0])];
        var direct=(directEvidence[String(pair[0])]||[]).find(function(row){
          return codes.some(function(c){return codesFrom(row.snippet||"").indexOf(c)>=0;});
        })||null;
        if(!rec&&direct)rec=Object.assign({id:pair[0],text:direct.snippet||""},direct);
        if(!rec) return;
        var body=(rec.text||"")+" "+(direct&&direct.snippet||"");
        var sourcePath=direct&&direct.path||rec.path||"";
        var text=norm(body+" "+sourcePath);
        if(codes.length&&!codes.some(function(c){return codesFrom(body).indexOf(c)>=0;})) return;
        if(!codes.length&&!compressionQuery&&!injectorLeakQuery&&!matchesTopics(text,topicTokens))return;
        var compatibility=compatibilityFor(body,sourcePath,vehicle);
        if(!compatibility)return;
        if(injectorLeakQuery&&(!/injetor|injector|\bbicos?\b/.test(text)||!/vazamento|estanqueidade|leak|gotej|vedacao/.test(text)))return;
        if(compressionQuery&&!/compressao|compression/.test(text))return;
        var s=pair[1]+truthWeight(rec);
        qTokens.forEach(function(t){if(text.indexOf(t)>=0)s+=6;});
        vehicleTokens.forEach(function(t){if(text.indexOf(t)>=0)s+=8;});
        codes.forEach(function(c){if(text.indexOf(norm(c))>=0)s+=35;});
        if(/press|tens|resist|ohm|bar|psi|volt|pino|fio|conector|torque/.test(norm(query))&&
           /press|tens|resist|ohm|bar|psi|volt|pino|fio|conector|torque/.test(text)) s+=12;
        detailed.push({rec:rec,direct:direct,compatibility:compatibility,score:s});
      });
      detailed.sort(function(a,b){return b.score-a.score;});

      var out=[],seen=new Set();
      for(var i=0;i<detailed.length&&out.length<limit;i++){
        var rec=detailed[i].rec;
        var direct=detailed[i].direct;
        var evidenceRec=direct?Object.assign({},rec,direct):rec;
        var key=(evidenceRec.path||"")+"|"+(evidenceRec.page||"")+"|"+(evidenceRec.chunk||"");
        if(seen.has(key)) continue;
        seen.add(key);
        out.push({
          score:detailed[i].score,
          page:evidenceRec.page||null,
          sourcePath:evidenceRec.path||rec.path||"",
          snippet:direct&&direct.snippet?direct.snippet:snippet(rec.text,needles),
          extraction:evidenceRec.method||rec.method||null,
          truthStatus:evidenceRec.truth_status||rec.truth_status||"unknown",
          confidence:Number(evidenceRec.confidence||0),
          verified:(evidenceRec.truth_status||rec.truth_status)==="source_extracted",
          statusLabel:statusLabel(evidenceRec),
          sourceSha256:evidenceRec.sha256||rec.sha256||"",
          compatibility:detailed[i].compatibility
        });
      }
      queryCache.set(cacheKey,out);
      if(queryCache.size>30) queryCache.delete(queryCache.keys().next().value);
      return out;
    }finally{
      window.dispatchEvent(new CustomEvent("oracle:knowledge-search",{detail:{state:"end",mode:"compact"}}));
    }
  }

  function prefetch(){
    if("requestIdleCallback" in window) requestIdleCallback(function(){loadManifest().catch(function(){});},{timeout:4000});
    else setTimeout(function(){loadManifest().catch(function(){});},2200);
  }

  window.ORACLE_REMOTE_KNOWLEDGE={
    search:search,
    metadata:loadManifest,
    prefetch:prefetch,
    get status(){return {manifest:manifest,mode:"compact",version:SEARCH_VERSION,cachedFiles:jsonCache.size,cachedQueries:queryCache.size,focusTopics:manifest&&manifest.focused_topics||null};}
  };
})();
