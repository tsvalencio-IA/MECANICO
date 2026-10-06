(function(){
  "use strict";

  var BASE="https://raw.githubusercontent.com/tsvalencio-IA/MECANICO/knowledge/";
  var manifest=null, dtcIndex=null, records=null;
  var metaPromise=null, recordsPromise=null;

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
    var r=await fetch(BASE+path,{cache:"force-cache"});
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
        files:manifest.extracted_files||0,
        chunks:manifest.extractor&&manifest.extractor.indexed_chunks||0
      }}));
      return {manifest:manifest,dtcIndex:dtcIndex};
    }).catch(function(err){
      console.warn("[Knowledge meta]",err);
      window.dispatchEvent(new CustomEvent("oracle:knowledge-status",{detail:{online:false}}));
      throw err;
    });
    return metaPromise;
  }

  async function gunzipText(path){
    var r=await fetch(BASE+path,{cache:"force-cache"});
    if(!r.ok) throw new Error("knowledge shard HTTP "+r.status);
    if(typeof DecompressionStream==="undefined"){
      throw new Error("gzip browser support unavailable");
    }
    var stream=r.body.pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text();
  }

  async function loadRecords(){
    if(records) return records;
    if(recordsPromise) return recordsPromise;
    recordsPromise=loadMeta().then(async function(meta){
      var shards=(meta.manifest.shards||[]).map(function(x){return "brain/"+x.file;});
      var all=[];
      for(var i=0;i<shards.length;i++){
        var txt=await gunzipText(shards[i]);
        txt.split("\n").forEach(function(line){
          if(!line.trim()) return;
          try{ all.push(JSON.parse(line)); }catch(e){}
        });
      }
      records=all;
      return records;
    }).catch(function(err){
      recordsPromise=null;
      throw err;
    });
    return recordsPromise;
  }

  function snippet(text,tokens,codes){
    var raw=String(text||"").replace(/\s+/g," ").trim();
    if(!raw) return "";
    var n=norm(raw), pos=-1;
    var needles=(codes||[]).concat(tokens||[]);
    for(var i=0;i<needles.length;i++){
      var p=n.indexOf(norm(needles[i]));
      if(p>=0 && (pos<0||p<pos)) pos=p;
    }
    if(pos<0) pos=0;
    var start=Math.max(0,pos-150),end=Math.min(raw.length,start+430);
    var s=raw.slice(start,end);
    if(start>0) s="…"+s;
    if(end<raw.length) s=s+"…";
    return s;
  }

  function score(rec,tokens,codes,vehicleTokens,allowedPaths,questionNorm){
    var text=norm(rec.text||""), path=norm(rec.path||"");
    var s=0;
    if(questionNorm && text.indexOf(questionNorm)>=0) s+=35;
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
    if(allowedPaths && allowedPaths.has(rec.path)) s+=45;
    if(/fio|pino|terminal|conector|esquema|eletric|chicote|cor\b/.test(questionNorm) &&
       /fio|pino|terminal|conector|esquema|eletric|chicote|cor\b/.test(text)) s+=18;
    if(/press|tens|resist|ohm|bar|psi|volt/.test(questionNorm) &&
       /press|tens|resist|ohm|bar|psi|volt/.test(text)) s+=15;
    return s;
  }

  async function search(query,vehicle,limit){
    limit=Math.max(1,Math.min(Number(limit)||5,8));
    var meta=await loadMeta();
    var all=await loadRecords();
    var vehicleText=vehicle && typeof vehicle==="object"
      ? [vehicle.brand,vehicle.model,vehicle.year,vehicle.engine,vehicle.transmission].filter(Boolean).join(" ")
      : String(vehicle||"");
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
    var qn=norm(String(query||"")).trim();
    var ranked=[];
    for(var i=0;i<all.length;i++){
      var rec=all[i];
      var sc=score(rec,tokens,codes,vehicleTokens,allowed,qn);
      if(sc>0) ranked.push({rec:rec,score:sc});
    }
    ranked.sort(function(a,b){return b.score-a.score;});

    var result=[],seen=new Set();
    for(var j=0;j<ranked.length && result.length<limit;j++){
      var r=ranked[j].rec;
      var key=(r.path||"")+"|"+(r.page||"")+"|"+(r.chunk||"");
      if(seen.has(key)) continue;
      seen.add(key);
      result.push({
        score:ranked[j].score,
        page:r.page||null,
        sourcePath:r.path||"",
        snippet:snippet(r.text,tokens,codes)
      });
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
    get status(){return {manifest:manifest,loadedRecords:records?records.length:0};}
  };
})();