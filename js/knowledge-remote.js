(function(){
  "use strict";

  var BASE="https://raw.githubusercontent.com/tsvalencio-IA/MECANICO/knowledge/";
  var manifest=null,dtcIndex=null,metaPromise=null;
  var queryCache=new Map();
  var SEARCH_VERSION="1.5.0-stream";

  function norm(v){
    return String(v||"")
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase();
  }

  function codesFrom(text){
    return Array.from(new Set((String(text||"").toUpperCase().match(/\b(?:P|B|C|U)\d{4}\b|\bDF\d{3,4}\b/g)||[])));
  }

  function tokensFrom(text){
    var stop=new Set(["para","com","sem","que","uma","uns","das","dos","de","da","do","em","no","na","nos","nas","por","pra","pro","carro","veiculo","veículo","motor","quero","como","qual","quais","esta","está"]);
    return Array.from(new Set(norm(text).split(/[^a-z0-9]+/).filter(function(t){return t.length>=3&&!stop.has(t);}))).slice(0,28);
  }

  async function fetchJson(path){
    var r=await fetch(BASE+path,{cache:"default"});
    if(!r.ok) throw new Error("knowledge "+path+" HTTP "+r.status);
    return r.json();
  }

  async function loadMeta(){
    if(metaPromise) return metaPromise;
    metaPromise=Promise.all([
      fetchJson("manifest.json"),
      fetchJson("dtc-index.json")
    ]).then(function(v){
      manifest=v[0];dtcIndex=v[1]||{};
      window.dispatchEvent(new CustomEvent("oracle:knowledge-status",{detail:{
        online:true,
        mode:"stream",
        version:SEARCH_VERSION,
        files:manifest.extracted_files||0,
        chunks:manifest.extractor&&manifest.extractor.indexed_chunks||0
      }}));
      return {manifest:manifest,dtcIndex:dtcIndex};
    }).catch(function(err){
      console.warn("[Knowledge meta]",err);
      window.dispatchEvent(new CustomEvent("oracle:knowledge-status",{detail:{online:false,reason:String(err&&err.message||err)}}));
      throw err;
    });
    return metaPromise;
  }

  function snippet(text,tokens,codes){
    var raw=String(text||"").replace(/\s+/g," ").trim();
    if(!raw) return "";
    var n=norm(raw),pos=-1;
    var needles=(codes||[]).concat(tokens||[]);
    for(var i=0;i<needles.length;i++){
      var p=n.indexOf(norm(needles[i]));
      if(p>=0&&(pos<0||p<pos)) pos=p;
    }
    if(pos<0) pos=0;
    var start=Math.max(0,pos-150),end=Math.min(raw.length,start+430);
    var s=raw.slice(start,end);
    if(start>0) s="…"+s;
    if(end<raw.length) s=s+"…";
    return s;
  }

  function score(rec,tokens,codes,vehicleTokens,allowedPaths,questionNorm){
    var text=norm(rec.text||""),path=norm(rec.path||"");
    var s=0;
    if(allowedPaths&&allowedPaths.size&&rec.path&&!allowedPaths.has(rec.path)){
      s-=12;
    }
    if(questionNorm&&text.indexOf(questionNorm)>=0) s+=35;
    codes.forEach(function(code){
      var c=norm(code);
      if(text.indexOf(c)>=0) s+=55;
      if(path.indexOf(c)>=0) s+=15;
    });
    tokens.forEach(function(t){
      if(text.indexOf(t)>=0) s+=5;
      if(path.indexOf(t)>=0) s+=2;
    });
    vehicleTokens.forEach(function(t){
      if(text.indexOf(t)>=0) s+=8;
      if(path.indexOf(t)>=0) s+=7;
    });
    if(allowedPaths&&allowedPaths.has(rec.path)) s+=45;
    if(/fio|pino|terminal|conector|esquema|eletric|chicote|cor\b/.test(questionNorm)&&
       /fio|pino|terminal|conector|esquema|eletric|chicote|cor\b/.test(text)) s+=18;
    if(/press|tens|resist|ohm|bar|psi|volt/.test(questionNorm)&&
       /press|tens|resist|ohm|bar|psi|volt/.test(text)) s+=15;
    return s;
  }

  function insertTop(top,item,max){
    var inserted=false;
    for(var i=0;i<top.length;i++){
      if(item.score>top[i].score){
        top.splice(i,0,item);inserted=true;break;
      }
    }
    if(!inserted&&top.length<max) top.push(item);
    if(top.length>max) top.length=max;
  }

  async function scanShard(path,ctx,top,max){
    if(typeof DecompressionStream==="undefined"){
      throw new Error("gzip browser support unavailable");
    }
    var r=await fetch(BASE+path,{cache:"force-cache"});
    if(!r.ok) throw new Error("knowledge shard HTTP "+r.status);
    if(!r.body) throw new Error("knowledge shard stream unavailable");

    var stream=r.body.pipeThrough(new DecompressionStream("gzip"));
    var reader=stream.getReader();
    var decoder=new TextDecoder("utf-8");
    var buffer="",processed=0;

    function processLine(line){
      line=line.trim();
      if(!line) return;
      var rec;
      try{rec=JSON.parse(line);}catch(e){return;}
      var sc=score(rec,ctx.tokens,ctx.codes,ctx.vehicleTokens,ctx.allowed,ctx.qn);
      if(sc<=0) return;
      insertTop(top,{rec:rec,score:sc},max);
    }

    while(true){
      var part=await reader.read();
      if(part.done) break;
      buffer+=decoder.decode(part.value,{stream:true});
      var idx;
      while((idx=buffer.indexOf("\n"))>=0){
        processLine(buffer.slice(0,idx));
        buffer=buffer.slice(idx+1);
        processed++;
        if(processed%350===0){
          await new Promise(function(resolve){setTimeout(resolve,0);});
        }
      }
    }
    buffer+=decoder.decode();
    if(buffer.trim()) processLine(buffer);
  }

  async function search(query,vehicle,limit){
    limit=Math.max(1,Math.min(Number(limit)||5,8));
    var vehicleText=vehicle&&typeof vehicle==="object"
      ? [vehicle.brand,vehicle.model,vehicle.year,vehicle.engine,vehicle.transmission].filter(Boolean).join(" ")
      : String(vehicle||"");
    var cacheKey=norm(String(query||"")+"|"+vehicleText+"|"+limit);
    if(queryCache.has(cacheKey)) return queryCache.get(cacheKey);

    var meta=await loadMeta();
    var q=String(query||"")+" "+vehicleText;
    var tokens=tokensFrom(q);
    var vehicleTokens=tokensFrom(vehicleText);
    var codes=codesFrom(q);
    var allowed=null;
    codes.forEach(function(code){
      var paths=meta.dtcIndex[code]||[];
      if(paths.length){
        if(!allowed) allowed=new Set();
        paths.forEach(function(p){allowed.add(p);});
      }
    });

    var ctx={
      tokens:tokens,
      vehicleTokens:vehicleTokens,
      codes:codes,
      allowed:allowed,
      qn:norm(String(query||"")).trim()
    };
    var top=[];
    var shards=(meta.manifest.shards||[]).map(function(x){return "brain/"+x.file;});

    window.dispatchEvent(new CustomEvent("oracle:knowledge-search",{detail:{state:"start",shards:shards.length}}));
    try{
      for(var i=0;i<shards.length;i++){
        await scanShard(shards[i],ctx,top,Math.max(24,limit*5));
        window.dispatchEvent(new CustomEvent("oracle:knowledge-search",{detail:{state:"progress",done:i+1,total:shards.length}}));
      }
    }finally{
      window.dispatchEvent(new CustomEvent("oracle:knowledge-search",{detail:{state:"end"}}));
    }

    var result=[],seen=new Set();
    for(var j=0;j<top.length&&result.length<limit;j++){
      var r=top[j].rec;
      var key=(r.path||"")+"|"+(r.page||"")+"|"+(r.chunk||"");
      if(seen.has(key)) continue;
      seen.add(key);
      result.push({
        score:top[j].score,
        page:r.page||null,
        sourcePath:r.path||"",
        snippet:snippet(r.text,tokens,codes),
        extraction:r.extraction||r.kind||r.source_type||null
      });
    }

    queryCache.set(cacheKey,result);
    if(queryCache.size>20){
      var first=queryCache.keys().next().value;
      queryCache.delete(first);
    }
    return result;
  }

  function prefetch(){
    if("requestIdleCallback" in window){
      requestIdleCallback(function(){loadMeta().catch(function(){});},{timeout:5000});
    }else{
      setTimeout(function(){loadMeta().catch(function(){});},2500);
    }
  }

  window.ORACLE_REMOTE_KNOWLEDGE={
    search:search,
    metadata:loadMeta,
    prefetch:prefetch,
    get status(){return {manifest:manifest,mode:"stream",version:SEARCH_VERSION,cachedQueries:queryCache.size};}
  };
})();