(function(){
  "use strict";

  var BASE="https://raw.githubusercontent.com/tsvalencio-IA/MECANICO/knowledge-compact/";
  var manifest=null,manifestPromise=null,mapPromise=null;
  var jsonCache=new Map();
  var queryCache=new Map();
  var SEARCH_VERSION="2.0.0-compact";

  function norm(v){
    return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  }

  function codesFrom(text){
    return Array.from(new Set((String(text||"").toUpperCase().match(/\b(?:P|B|C|U)\d{4}\b|\bDF\d{3,4}\b/g)||[])));
  }

  function tokensFrom(text){
    var stop=new Set(["para","com","sem","que","uma","uns","das","dos","de","da","do","em","no","na","nos","nas","por","pra","pro","carro","veiculo","veículo","motor","quero","como","qual","quais","esta","está","este","essa","esse","isso","aqui"]);
    return Array.from(new Set(norm(text).match(/[a-z0-9][a-z0-9._-]{2,31}/g)||[]))
      .filter(function(t){return !stop.has(t)&&!/^[0-9]+$/.test(t);})
      .slice(0,18);
  }

  function prefix(term){
    var t=String(term||"").replace(/[^a-z0-9]/g,"");
    if(t.length>=2) return t.slice(0,2);
    if(t.length===1) return t+"0";
    return "__";
  }

  async function fetchJson(path,noStore){
    var key=path+"|"+(manifest&&manifest.source_archive_sha256||"");
    if(!noStore&&jsonCache.has(key)) return jsonCache.get(key);
    var url=BASE+path;
    if(manifest&&manifest.source_archive_sha256) url+="?v="+manifest.source_archive_sha256.slice(0,12);
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
        console.warn("[Compact knowledge]",err);
        window.dispatchEvent(new CustomEvent("oracle:knowledge-status",{detail:{online:false,mode:"local-only",reason:String(err&&err.message||err)}}));
        throw err;
      });
    return manifestPromise;
  }

  async function loadRecordMap(){
    await loadManifest();
    if(!mapPromise) mapPromise=fetchJson("record-map.json",false);
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
    try{return await fetchJson("dtc/"+String(code).toUpperCase()+".json",false);}
    catch(e){if(String(e&&e.message||e).indexOf("HTTP 404")>=0)return [];throw e;}
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
    var vehicleTokens=tokensFrom(vehicleText);
    var codes=codesFrom(String(query||"")+" "+vehicleText);
    var scores=new Map();

    window.dispatchEvent(new CustomEvent("oracle:knowledge-search",{detail:{state:"start",mode:"compact"}}));
    try{
      var codeLists=await Promise.all(codes.map(postingsForCode));
      codeLists.forEach(function(ids){addScores(scores,ids,95);});

      var terms=qTokens.slice(0,10);
      var termLists=await Promise.all(terms.map(postingsForTerm));
      termLists.forEach(function(ids,i){
        var bonus=/[0-9]/.test(terms[i])?18:12;
        addScores(scores,ids,bonus);
      });

      var vterms=vehicleTokens.slice(0,7);
      var vehicleLists=await Promise.all(vterms.map(postingsForTerm));
      vehicleLists.forEach(function(ids){addScores(scores,ids,18);});

      if(!scores.size) return [];

      var ranked=Array.from(scores.entries()).sort(function(a,b){return b[1]-a[1];}).slice(0,48);
      var recordMap=await loadRecordMap();
      var bucketScore=new Map();
      ranked.forEach(function(x){
        var b=Number(recordMap[x[0]]);
        bucketScore.set(b,(bucketScore.get(b)||0)+x[1]);
      });
      var chosenBuckets=Array.from(bucketScore.entries()).sort(function(a,b){return b[1]-a[1];}).slice(0,7).map(function(x){return x[0];});
      var bucketData=await Promise.all(chosenBuckets.map(function(b){return fetchJson("records/r"+String(b).padStart(2,"0")+".json",false);}));
      var records={};
      bucketData.forEach(function(obj){Object.keys(obj||{}).forEach(function(k){records[k]=obj[k];});});

      var needles=codes.concat(qTokens).concat(vehicleTokens);
      var detailed=[];
      ranked.forEach(function(pair){
        var rec=records[String(pair[0])];
        if(!rec) return;
        var text=norm((rec.text||"")+" "+(rec.path||""));
        var s=pair[1]+truthWeight(rec);
        qTokens.forEach(function(t){if(text.indexOf(t)>=0)s+=6;});
        vehicleTokens.forEach(function(t){if(text.indexOf(t)>=0)s+=8;});
        codes.forEach(function(c){if(text.indexOf(norm(c))>=0)s+=35;});
        if(/press|tens|resist|ohm|bar|psi|volt|pino|fio|conector|torque/.test(norm(query))&&
           /press|tens|resist|ohm|bar|psi|volt|pino|fio|conector|torque/.test(text)) s+=12;
        detailed.push({rec:rec,score:s});
      });
      detailed.sort(function(a,b){return b.score-a.score;});

      var out=[],seen=new Set();
      for(var i=0;i<detailed.length&&out.length<limit;i++){
        var rec=detailed[i].rec;
        var key=(rec.path||"")+"|"+(rec.page||"")+"|"+(rec.chunk||"");
        if(seen.has(key)) continue;
        seen.add(key);
        out.push({
          score:detailed[i].score,
          page:rec.page||null,
          sourcePath:rec.path||"",
          snippet:snippet(rec.text,needles),
          extraction:rec.method||null,
          truthStatus:rec.truth_status||"unknown",
          confidence:Number(rec.confidence||0),
          verified:rec.truth_status==="source_extracted",
          statusLabel:statusLabel(rec),
          sourceSha256:rec.sha256||""
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
    get status(){return {manifest:manifest,mode:"compact",version:SEARCH_VERSION,cachedFiles:jsonCache.size,cachedQueries:queryCache.size};}
  };
})();