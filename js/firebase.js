(function(){
  "use strict";

  var firebaseConfig={
    apiKey:"AIzaSyBJNAJFYmTKeYODbyRv_jc5dgc_A-GV7lA",
    authDomain:"mecanico-b222e.firebaseapp.com",
    databaseURL:"https://mecanico-b222e-default-rtdb.firebaseio.com",
    projectId:"mecanico-b222e",
    storageBucket:"mecanico-b222e.firebasestorage.app",
    messagingSenderId:"704618772238",
    appId:"1:704618772238:web:10c05c30bc1fe001fa495f"
  };

  var api={
    uid:null,db:null,auth:null,ready:null,online:false,
    saveCase:function(){return Promise.reject(new Error("Firebase não inicializado"));},
    watchCases:function(){return function(){};},
    clearCases:function(){return Promise.reject(new Error("Firebase não inicializado"));}
  };

  function emitStatus(online){
    api.online=!!online;
    window.dispatchEvent(new CustomEvent("oracle:firebase-status",{detail:{online:api.online,uid:api.uid}}));
  }

  api.ready=new Promise(function(resolve){
    if(!window.firebase){console.warn("[Firebase] SDK não carregado");resolve(api);return;}
    try{
      if(!firebase.apps.length)firebase.initializeApp(firebaseConfig);
      api.auth=firebase.auth();
      api.db=firebase.database();

      api.db.ref(".info/connected").on("value",function(snap){emitStatus(snap.val()===true);});

      var resolved=false;
      function finish(){if(!resolved){resolved=true;resolve(api);}}

      api.auth.onAuthStateChanged(function(user){
        if(user){
          api.uid=user.uid;
          window.dispatchEvent(new CustomEvent("oracle:firebase-ready",{detail:{uid:user.uid}}));
          finish();
        }
      });

      if(api.auth.currentUser){
        api.uid=api.auth.currentUser.uid;finish();
      }else{
        api.auth.signInAnonymously().catch(function(err){
          console.error("[Firebase] Login anônimo:",err);
          finish();
        });
      }

      setTimeout(finish,7000);
    }catch(err){
      console.error("[Firebase] Inicialização:",err);resolve(api);
    }
  });

  function casesRef(){
    if(!api.db||!api.uid)throw new Error("Usuário anônimo ainda não autenticado");
    return api.db.ref("usuarios/"+api.uid+"/casos");
  }

  api.saveCase=function(item){
    return api.ready.then(function(){
      if(!api.uid)throw new Error("Usuário anônimo indisponível");
      var clean=JSON.parse(JSON.stringify(item||{}));
      if(!clean.id)throw new Error("Caso sem ID");
      clean.updatedAt=new Date().toISOString();
      clean.updatedAtMs=firebase.database.ServerValue.TIMESTAMP;
      return casesRef().child(clean.id).set(clean);
    });
  };

  api.watchCases=function(callback){
    var ref=null,handler=null;
    api.ready.then(function(){
      if(!api.uid)return;
      ref=casesRef().orderByChild("createdAt").limitToLast(60);
      handler=function(snapshot){
        var rows=[];
        snapshot.forEach(function(child){
          var value=child.val();
          if(value)rows.push(value);
        });
        rows.sort(function(a,b){
          var av=Number(a.updatedAtMs||0),bv=Number(b.updatedAtMs||0);
          if(av||bv)return bv-av;
          return String(b.updatedAt||b.createdAt||"").localeCompare(String(a.updatedAt||a.createdAt||""));
        });
        callback(rows);
      };
      ref.on("value",handler,function(err){console.error("[Firebase] Histórico:",err);});
    });
    return function(){if(ref&&handler)ref.off("value",handler);};
  };

  api.clearCases=function(){
    return api.ready.then(function(){
      if(!api.uid)throw new Error("Usuário anônimo indisponível");
      return casesRef().remove();
    });
  };

  window.ORACLE_FIREBASE=api;
})();