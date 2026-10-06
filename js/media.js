(function(){
  "use strict";

  function fileKind(file){
    if(!file||!file.type)return "arquivo";
    if(file.type.indexOf("image/")===0)return "foto";
    if(file.type.indexOf("video/")===0)return "video";
    return "arquivo";
  }

  function detectCodes(text){
    return Array.from(new Set((String(text||"").toUpperCase().match(/[A-Z]{1,3}\d{3,5}|DF\d{3,4}/g)||[])));
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

  async function analyzeImage(file,onProgress){
    var canvas=await imageToCanvas(file);
    var text=await recognize(canvas,onProgress);
    return {kind:"foto",text:text,codes:detectCodes(text),frames:1};
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

  window.ORACLE_MEDIA={fileKind:fileKind,detectCodes:detectCodes,analyzeFile:analyzeFile};
})();