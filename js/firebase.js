(function(){
  "use strict";

  var firebaseConfig = {
    apiKey: "AIzaSyBJNAJFYmTKeYODbyRv_jc5dgc_A-GV7lA",
    authDomain: "mecanico-b222e.firebaseapp.com",
    databaseURL: "https://mecanico-b222e-default-rtdb.firebaseio.com",
    projectId: "mecanico-b222e",
    storageBucket: "mecanico-b222e.firebasestorage.app",
    messagingSenderId: "704618772238",
    appId: "1:704618772238:web:10c05c30bc1fe001fa495f"
  };

  var api = {
    uid: null,
    db: null,
    auth: null,
    ready: null,
    online: false,
    saveCase: function(){ return Promise.reject(new Error("Firebase não inicializado")); },
    watchCases: function(){ return function(){}; },
    clearCases: function(){ return Promise.reject(new Error("Firebase não inicializado")); }
  };

  api.ready = new Promise(function(resolve){
    if(!window.firebase){
      console.warn("[Firebase] SDK não carregado.");
      resolve(api);
      return;
    }

    try{
      if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      api.auth = firebase.auth();
      api.db = firebase.database();

      api.auth.onAuthStateChanged(function(user){
        if(user){
          api.uid = user.uid;
          api.online = true;
          window.dispatchEvent(new CustomEvent("oracle:firebase-ready",{detail:{uid:user.uid}}));
          resolve(api);
          return;
        }
        api.auth.signInAnonymously().catch(function(err){
          console.error("[Firebase] Falha no login anônimo:",err);
          api.online = false;
          resolve(api);
        });
      });

      if(!api.auth.currentUser){
        api.auth.signInAnonymously().catch(function(err){
          console.error("[Firebase] Falha no login anônimo:",err);
          api.online = false;
          resolve(api);
        });
      }
    }catch(err){
      console.error("[Firebase] Inicialização falhou:",err);
      resolve(api);
    }
  });

  function path(){
    if(!api.db || !api.uid) throw new Error("Firebase ainda não autenticado");
    return api.db.ref("usuarios/"+api.uid+"/casos");
  }

  api.saveCase = function(item){
    return api.ready.then(function(){
      if(!api.uid) throw new Error("Usuário anônimo indisponível");
      var clean = JSON.parse(JSON.stringify(item || {}));
      clean.updatedAt = new Date().toISOString();
      return path().child(clean.id).set(clean);
    });
  };

  api.watchCases = function(callback){
    var ref = null;
    var handler = null;
    api.ready.then(function(){
      if(!api.uid) return;
      ref = path().orderByChild("createdAt").limitToLast(60);
      handler = function(snapshot){
        var rows=[];
        snapshot.forEach(function(child){
          var value=child.val();
          if(value) rows.push(value);
        });
        rows.sort(function(a,b){return String(b.createdAt||"").localeCompare(String(a.createdAt||""));});
        callback(rows);
      };
      ref.on("value",handler,function(err){ console.error("[Firebase] Histórico:",err); });
    });
    return function(){ if(ref && handler) ref.off("value",handler); };
  };

  api.clearCases = function(){
    return api.ready.then(function(){
      if(!api.uid) throw new Error("Usuário anônimo indisponível");
      return path().remove();
    });
  };

  window.ORACLE_FIREBASE = api;
})();