(function(){
  "use strict";

  function fileKind(file){
    if(!file||!file.type)return "arquivo";
    if(file.type.indexOf("image/")===0)return "foto";
    if(file.type.indexOf("video/")===0)return "video";
    return "arquivo";
  }

  function detectCodes(text){
    var matches=String(text||"").toUpperCase().match(/\b(?:[PBCU][ \t]*[0-3](?:[ \t]*[0-9A-F]){3}|DF[ \t]*\d(?:[ \t]*\d){2,3})\b/g)||[];
    return Array.from(new Set(matches.map(function(code){return code.replace(/[ \t]/g,"");})));
  }

  function codeCandidates(text){
    var matches=String(text||"").toUpperCase().match(/\b(?:[PBCU][ \t]*[0-3OIL](?:[ \t]*[0-9A-FOIL]){3}|DF[ \t]*[0-9OIL](?:[ \t]*[0-9OIL]){2,3})\b/g)||[];
    return Array.from(new Set(matches.filter(function(value){return /\d.*\d/.test(value);}).map(function(value){
      return value.replace(/[ \t]/g,"").replace(/O/g,"0").replace(/[IL]/g,"1");
    }).filter(function(code){return detectCodes(code).indexOf(code)>=0;}))).slice(0,2);
  }

  // Scanner-specific numeric identifiers are NOT universal OBD-II codes.
  // Preserve them exactly as displayed instead of fabricating P/DF conversions.
  function scannerRows(text){
    var source=String(text||"").replace(/\r/g," ").replace(/\n/g," ");
    var re=/\b(\d{1,3})\s+(?=(?:circuito|sensor|sonda|falha|v[aá]lvula|valvula|comando)\b)/gi;
    var positions=[],hit;
    while((hit=re.exec(source))&&positions.length<40)positions.push({id:hit[1],start:hit.index,from:re.lastIndex});
    var rows=[];
    positions.forEach(function(pos,index){
      var end=index+1<positions.length?positions[index+1].start:source.length;
      var description=source.slice(pos.from,end).replace(/\s+/g," ").trim().slice(0,210);
      if(/\b(?:circuito|sensor|sonda|falha|valvula|válvula|comando)\b/i.test(description))
        rows.push({id:pos.id,description:description,source:"ocr",verified:false});
    });
    return rows.slice(0,15);
  }

  // Only unambiguous numeric scanner IDs may be considered candidates; never derive a P/DF mapping.
  function scannerRowsWithConfidence(text){
    return scannerRows(text).map(function(row){
      var valid=/^\d{2,3}$/.test(row.id)&&row.description.length>=20;
      return Object.assign({},row,{confidence:valid?"partial":"low"});
    });
  }

  function normalize(text){
    return String(text||"")
      .replace(/\r/g,"")
      .replace(/[ \t]+/g," ")
      .replace(/\n{3,}/g,"\n\n")
      .trim()
      .slice(0,8000);
  }

  function makeCanvas(w,h){
    var c=document.createElement("canvas");
    c.width=Math.max(1,Math.round(w));
    c.height=Math.max(1,Math.round(h));
    return c;
  }

  function enhanceCanvas(source,w,h){
    var maxW=1500,maxH=1100;
    var scale=Math.min(1,maxW/w,maxH/h);
    var c=makeCanvas(w*scale,h*scale);
    var ctx=c.getContext("2d",{willReadFrequently:true});
    ctx.drawImage(source,0,0,c.width,c.height);

    try{
      var img=ctx.getImageData(0,0,c.width,c.height),d=img.data;
      for(var i=0;i<d.length;i+=4){
        var y=.299*d[i]+.587*d[i+1]+.114*d[i+2];
        var v=(y-128)*1.35+128;
        v=Math.max(0,Math.min(255,v));
        d[i]=d[i+1]=d[i+2]=v;
      }
      ctx.putImageData(img,0,0);
    }catch(e){}
    return c;
  }

  async function recognize(canvas,onProgress){
    if(!window.Tesseract)throw new Error("Motor OCR não carregou");
    var result=await Tesseract.recognize(canvas,"por+eng",{
      logger:function(m){
        if(m&&m.status==="recognizing text"&&onProgress)onProgress(Math.round((m.progress||0)*100));
      }
    });
    return normalize(result&&result.data?result.data.text:"");
  }

  async function imageToCanvas(file){
    var url=URL.createObjectURL(file);
    try{
      var img=new Image();
      await new Promise(function(resolve,reject){
        img.onload=resolve;img.onerror=function(){reject(new Error("Imagem inválida"));};img.src=url;
      });
      return enhanceCanvas(img,img.naturalWidth||img.width,img.naturalHeight||img.height);
    }finally{URL.revokeObjectURL(url);}
  }

  async function imageForRemoteVision(file){
    // Preserve actual colors/details for the visual model; OCR enhancement is separate.
    var url=URL.createObjectURL(file);
    try{
      var img=new Image();
      await new Promise(function(resolve,reject){
        img.onload=resolve;img.onerror=function(){reject(new Error("Imagem inválida"));};img.src=url;
      });
      var w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
      var factor=Math.min(1,1450/w,1100/h);
      var canvas=makeCanvas(w*factor,h*factor);
      canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
      var payload=canvas.toDataURL("image/jpeg",.72);
      if(payload.length>1100000)payload=canvas.toDataURL("image/jpeg",.48);
      if(payload.length>1100000)payload=canvas.toDataURL("image/jpeg",.34);
      if(payload.length>1100000)throw new Error("Foto grande demais para o nível gratuito; aproxime a câmera");
      return payload;
    }finally{URL.revokeObjectURL(url);}
  }


  function cropScannerBand(canvas,topFraction,bottomFraction){
    var top=Math.max(0,Math.round(canvas.height*topFraction));
    var bottom=Math.min(canvas.height,Math.round(canvas.height*bottomFraction));
    var width=canvas.width,height=bottom-top;
    var scale=Math.min(1.65,2150/width);
    var out=makeCanvas(width*scale,height*scale);
    var ctx=out.getContext("2d",{willReadFrequently:true});
    ctx.drawImage(canvas,0,top,width,height,0,0,out.width,out.height);
    // A white background with dark text is easier to segment for many scanners.
    // This is only a second pass; preserve the original OCR output independently.
    try{
      var img=ctx.getImageData(0,0,out.width,out.height),pixels=img.data;
      var tile=28,cols=Math.ceil(out.width/tile),rows=Math.ceil(out.height/tile),means=new Float32Array(cols*rows);
      var counts=new Uint32Array(cols*rows);
      for(var y=0;y<out.height;y++){
        for(var x=0;x<out.width;x++){
          var idx=(y*out.width+x)*4,cell=Math.floor(y/tile)*cols+Math.floor(x/tile);
          means[cell]+=.299*pixels[idx]+.587*pixels[idx+1]+.114*pixels[idx+2];counts[cell]++;
        }
      }
      for(var c=0;c<means.length;c++)means[c]/=counts[c]||1;
      for(var yy=0;yy<out.height;yy++){
        for(var xx=0;xx<out.width;xx++){
          var p=(yy*out.width+xx)*4;
          var l=.299*pixels[p]+.587*pixels[p+1]+.114*pixels[p+2];
          var local=means[Math.floor(yy/tile)*cols+Math.floor(xx/tile)];
          var darkBackground=local<140;
          var diff=darkBackground?(l-local):(local-l);
          var result=Math.max(0,Math.min(255,225-diff*3.2));
          pixels[p]=pixels[p+1]=pixels[p+2]=result;
        }
      }
      ctx.putImageData(img,0,0);
    }catch(e){}
    return out;
  }

  function mergeScannerReadings(readings){
    var unique=[];
    (readings||[]).forEach(function(reading){
      scannerRowsWithConfidence(reading||"").forEach(function(row){
        var descr=String(row.description||"").toLowerCase().replace(/[^a-z0-9à-ú]+/gi," ").trim();
        var existing=unique.some(function(previous){
          var other=String(previous.description||"").toLowerCase().replace(/[^a-z0-9à-ú]+/gi," ").trim();
          if(previous.id!==row.id)return false;
          if(descr===other)return true;
          // Similar repeated crops must not duplicate one row. Distinct open-circuit
          // records (e.g. two 99 entries on PDL5500) must NOT be merged.
          if(/controle aberto|circuito aberto/.test(descr)!==/controle aberto|circuito aberto/.test(other))return false;
          return descr.length>20&&other.length>20&&
            (descr.startsWith(other)||other.startsWith(descr)) &&
            Math.min(descr.length,other.length)/Math.max(descr.length,other.length)>.84;
        });
        if(!existing)unique.push(row);
      });
    });
    return unique.slice(0,20);
  }

  async function analyzeImage(file,onProgress){
    var canvas=await imageToCanvas(file);
    if(!window.Tesseract)throw new Error("Motor OCR não carregou");
    // Use one OCR worker for the whole photo and the adaptive regional rereads.
    var worker=await Tesseract.createWorker("por+eng",1,{
      logger:function(m){
        if(m&&m.status==="recognizing text"&&onProgress)
          onProgress(Math.round((m.progress||0)*60));
      }
    });
    var parts=[],passCount=0;
    try{
      var first=await worker.recognize(canvas);
      parts.push(normalize(first&&first.data?first.data.text:""));
      passCount++;
      var confident=mergeScannerReadings(parts).filter(function(row){return row.confidence==="partial";});
      if(!detectCodes(parts[0]).length&&confident.length<3){
        // A single full-frame pass can miss scanner rows behind reflections.
        // Overlap two bands slightly; never infer unreadable numbers.
        var bands=[[.24,.63],[.54,.93]];
        for(var i=0;i<bands.length;i++){
          var band=cropScannerBand(canvas,bands[i][0],bands[i][1]);
          var extra=await worker.recognize(band);
          parts.push(normalize(extra&&extra.data?extra.data.text:""));
          passCount++;
          if(onProgress)onProgress(60+Math.round(40*(i+1)/bands.length));
        }
      }
      var scanRows=mergeScannerReadings(parts);
      var merged=normalize(parts.filter(Boolean).join("\n"));
      if(onProgress)onProgress(100);
      return {kind:"foto",text:merged,codes:detectCodes(merged),scannerRows:scanRows,
        ocrPasses:passCount,frames:1};
    }finally{await worker.terminate();}
  }

  function seek(video,time){
    return new Promise(function(resolve){
      var done=false;
      function finish(){if(done)return;done=true;resolve();}
      video.addEventListener("seeked",finish,{once:true});
      try{video.currentTime=Math.max(0,Math.min(time,Math.max(0,(video.duration||0)-.08)));}catch(e){finish();}
      setTimeout(finish,1400);
    });
  }

  async function analyzeVideo(file,onProgress){
    var url=URL.createObjectURL(file);
    var video=document.createElement("video");
    video.muted=true;video.playsInline=true;video.preload="metadata";video.src=url;

    try{
      await new Promise(function(resolve,reject){
        video.onloadedmetadata=resolve;
        video.onerror=function(){reject(new Error("Não foi possível abrir o vídeo"));};
      });

      var duration=isFinite(video.duration)?video.duration:0;
      var times=duration>2?
        [Math.max(.2,duration*.12),duration*.38,duration*.64,Math.max(.3,duration*.88)]:
        [0];
      var texts=[];

      for(var i=0;i<times.length;i++){
        await seek(video,times[i]);
        var c=enhanceCanvas(video,video.videoWidth||640,video.videoHeight||360);
        var text=await recognize(c,function(p){
          if(onProgress)onProgress(Math.round(((i+p/100)/times.length)*100));
        });
        if(text)texts.push("[quadro "+(i+1)+"] "+text);
      }

      var merged=normalize(texts.join("\n"));
      return {kind:"video",text:merged,codes:detectCodes(merged),frames:times.length,duration:duration};
    }finally{URL.revokeObjectURL(url);}
  }

  async function analyzeFile(file,onProgress){
    var kind=fileKind(file);
    if(kind==="foto")return analyzeImage(file,onProgress);
    if(kind==="video")return analyzeVideo(file,onProgress);
    throw new Error("Formato não suportado");
  }

  window.ORACLE_MEDIA={fileKind:fileKind,detectCodes:detectCodes,codeCandidates:codeCandidates,scannerRows:scannerRowsWithConfidence,mergeScannerReadings:mergeScannerReadings,imageForRemoteVision:imageForRemoteVision,analyzeFile:analyzeFile};
})();
