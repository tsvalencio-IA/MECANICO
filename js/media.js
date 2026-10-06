(function(){
  "use strict";

  function fileKind(file){
    if(!file || !file.type) return "arquivo";
    if(file.type.indexOf("image/")===0) return "foto";
    if(file.type.indexOf("video/")===0) return "video";
    return "arquivo";
  }

  function detectCodes(text){
    return Array.from(new Set((String(text||"").toUpperCase().match(/[A-Z]{1,3}\d{3,5}|DF\d{3,4}/g)||[])));
  }

  function normalizeOcr(text){
    return String(text||"")
      .replace(/\r/g,"")
      .replace(/[ \t]+/g," ")
      .replace(/\n{3,}/g,"\n\n")
      .trim()
      .slice(0,6000);
  }

  async function ocrCanvas(canvas,onProgress){
    if(!window.Tesseract) throw new Error("Motor de leitura visual não carregou");
    var result=await Tesseract.recognize(canvas,"eng",{
      logger:function(m){
        if(m && m.status==="recognizing text" && onProgress){
          onProgress(Math.round((m.progress||0)*100));
        }
      }
    });
    return normalizeOcr(result && result.data ? result.data.text : "");
  }

  async function analyzeImage(file,onProgress){
    if(!window.Tesseract) throw new Error("Leitura de imagem indisponível");
    var result=await Tesseract.recognize(file,"eng",{
      logger:function(m){
        if(m && m.status==="recognizing text" && onProgress){
          onProgress(Math.round((m.progress||0)*100));
        }
      }
    });
    var text=normalizeOcr(result && result.data ? result.data.text : "");
    return {kind:"foto",text:text,codes:detectCodes(text),frames:1};
  }

  function seek(video,time){
    return new Promise(function(resolve,reject){
      var done=false;
      function finish(){ if(done)return; done=true; video.removeEventListener("seeked",finish); resolve(); }
      video.addEventListener("seeked",finish,{once:true});
      try{video.currentTime=Math.max(0,Math.min(time,Math.max(0,video.duration-.05)));}catch(e){reject(e);}
      setTimeout(finish,1200);
    });
  }

  async function analyzeVideo(file,onProgress){
    var url=URL.createObjectURL(file);
    var video=document.createElement("video");
    video.muted=true;video.playsInline=true;video.preload="metadata";video.src=url;
    await new Promise(function(resolve,reject){
      video.onloadedmetadata=resolve;
      video.onerror=function(){reject(new Error("Não foi possível abrir o vídeo"));};
    });

    var duration=isFinite(video.duration)?video.duration:0;
    var times=duration>1?[Math.min(.5,duration*.1),duration*.5,Math.max(.5,duration*.9)]:[0];
    var texts=[];
    for(var i=0;i<times.length;i++){
      await seek(video,times[i]);
      var maxW=1280;
      var scale=Math.min(1,maxW/(video.videoWidth||maxW));
      var canvas=document.createElement("canvas");
      canvas.width=Math.max(1,Math.round((video.videoWidth||640)*scale));
      canvas.height=Math.max(1,Math.round((video.videoHeight||360)*scale));
      var ctx=canvas.getContext("2d",{willReadFrequently:true});
      ctx.drawImage(video,0,0,canvas.width,canvas.height);
      if(onProgress) onProgress(Math.round((i/times.length)*100));
      var t=await ocrCanvas(canvas,function(p){
        if(onProgress) onProgress(Math.round(((i+(p/100))/times.length)*100));
      });
      if(t) texts.push("[quadro "+(i+1)+"] "+t);
    }
    URL.revokeObjectURL(url);
    var text=normalizeOcr(texts.join("\n"));
    return {kind:"video",text:text,codes:detectCodes(text),frames:times.length,duration:duration};
  }

  async function analyzeFile(file,onProgress){
    var kind=fileKind(file);
    if(kind==="foto") return analyzeImage(file,onProgress);
    if(kind==="video") return analyzeVideo(file,onProgress);
    throw new Error("Use foto ou vídeo");
  }

  window.ORACLE_MEDIA={analyzeFile:analyzeFile,detectCodes:detectCodes,fileKind:fileKind};
})();