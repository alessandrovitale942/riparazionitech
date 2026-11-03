/* ============================================================
   RepairPro CLOUD: accesso con email e password + stessi dati su ogni dispositivo
   Se la configurazione qui sotto resta vuota, RepairPro funziona come prima (senza login).

   CONFIGURAZIONE (una volta sola) su https://console.firebase.google.com
   1. Crea un progetto (puoi disattivare Google Analytics).
   2. Build > Authentication > Inizia > Email/password > Abilita.
      Poi scheda "Users" > Aggiungi utente: crea tu email e password di chi deve entrare.
      Authentication > Impostazioni > Domini autorizzati: aggiungi il tuo sito (es. nome.github.io).
   3. Build > Realtime Database > Crea database > posizione Belgio (europe-west1) > modalita bloccata.
   4. Realtime Database > Regole: incolla questo, mettendo gli UID che vedi nella scheda Users:
      { "rules": { "negozio": {
          ".read":  "auth.uid === 'UID_PRIMO' || auth.uid === 'UID_SECONDO'",
          ".write": "auth.uid === 'UID_PRIMO' || auth.uid === 'UID_SECONDO'" } } }
   5. Impostazioni progetto (ingranaggio) > Le tue app > Web (</>) > registra l'app e copia qui sotto
      apiKey, authDomain, databaseURL, projectId, appId.
   ============================================================ */
var RP_FIREBASE = {
  apiKey: 'AIzaSyCxxhBlYKHbLMm9eikm8vcnfi-obd5Aqss',
  authDomain: 'repair-pro-cc900.firebaseapp.com',
  databaseURL: 'https://repair-pro-cc900-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'repair-pro-cc900',
  appId: '1:773780067819:web:d393ee4583185a061035ae'
};

(function () {
  if (!RP_FIREBASE.apiKey || !RP_FIREBASE.databaseURL) return;   // cloud spento

  var CHIAVI = ['rp_rl', 'rp_fl', 'rp_ml', 'rp_rid', 'rp_fid', 'rp_ol', 'rp_oid', 'rp_set', 'rp_logo'];
  var APPLY = {
    rp_rl:  function (v) { RL = JSON.parse(v || '[]'); },
    rp_fl:  function (v) { FL = JSON.parse(v || '[]'); },
    rp_ml:  function (v) { if (v) ML = JSON.parse(v); },
    rp_rid: function (v) { RID = parseInt(v || '0', 10) || 0; },
    rp_fid: function (v) { FID = parseInt(v || '0', 10) || 0; },
    rp_ol:  function (v) { OL = JSON.parse(v || '[]'); },
    rp_oid: function (v) { OID = parseInt(v || '0', 10) || 0; },
    rp_set: function (v) { if (v) SET = JSON.parse(v); }
  };
  var ready = false, applying = false, attached = false, auth, db, pend = {}, tm = null;

  // ogni salvataggio locale viene copiato online (solo a sincronizzazione avvenuta)
  var _si = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    _si.apply(this, arguments);
    if (ready && !applying && this === localStorage && CHIAVI.indexOf(k) > -1) push(k, String(v));
  };
  // salvataggi fatti da Jarvis (altra finestra) -> online
  window.addEventListener('storage', function (e) {
    if (ready && e.storageArea === localStorage && CHIAVI.indexOf(e.key) > -1 && e.newValue !== null) push(e.key, e.newValue);
  });

  var IN = 'width:100%;padding:12px 14px;border-radius:10px;border:1px solid #252c3b;background:#0f131b;color:#eef1f6;font-size:15px;outline:none;box-sizing:border-box';
  var ui = document.createElement('div');
  ui.id = 'rp-login';
  ui.style.cssText = 'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:20px;background:radial-gradient(900px 420px at 80% -10%,rgba(255,122,26,.18),transparent 60%),#0c0e13;font-family:"DM Sans",Arial,sans-serif;color:#eef1f6';
  ui.innerHTML = '<form id="rp-lf" style="width:100%;max-width:360px;background:#141821;border:1px solid #252c3b;border-radius:20px;padding:30px 28px;box-shadow:0 30px 80px rgba(0,0,0,.6)">'
    + '<div style="font:800 26px Syne,Arial,sans-serif;letter-spacing:-.02em">RepairPro</div>'
    + '<div style="color:#8b94a7;font-size:14px;margin:6px 0 22px">Accedi per ritrovare i tuoi dati su qualsiasi dispositivo.</div>'
    + '<input id="rp-em" type="email" autocomplete="username" placeholder="Email" required style="' + IN + '">'
    + '<input id="rp-pw" type="password" autocomplete="current-password" placeholder="Password" required style="' + IN + ';margin-top:10px">'
    + '<button type="submit" style="width:100%;margin-top:16px;padding:12px;border:0;border-radius:10px;background:linear-gradient(135deg,#ff5a2a,#ff8a1f);color:#fff;font-family:inherit;font-weight:600;font-size:15px;cursor:pointer">Accedi</button>'
    + '<div id="rp-msg" style="min-height:20px;margin:14px 0 8px;font-size:13px;color:#ffb273"></div>'
    + '<a href="#" id="rp-rs" style="color:#8b94a7;font-size:13px">Password dimenticata?</a></form>';
  document.documentElement.appendChild(ui);
  function msg(t) { ui.querySelector('#rp-msg').textContent = t || ''; }
  function errore(e) {
    var m = { 'auth/invalid-credential': 'Email o password non corrette.', 'auth/wrong-password': 'Email o password non corrette.', 'auth/user-not-found': 'Email o password non corrette.', 'auth/invalid-email': 'Email non valida.', 'auth/too-many-requests': 'Troppi tentativi: riprova tra qualche minuto.', 'auth/network-request-failed': 'Nessuna connessione a internet.' }[e && e.code];
    return m || ('Errore: ' + ((e && e.message) || e));
  }

  function push(k, v) { pend[k] = v; clearTimeout(tm); tm = setTimeout(flush, 700); }
  function flush() {
    var p = pend; pend = {};
    if (!Object.keys(p).length) return Promise.resolve();
    return db.ref('negozio').update(p).catch(function (e) { alert('Salvataggio online non riuscito: ' + e.message); });
  }
  function applica(k, v) { try { if (APPLY[k]) APPLY[k](v); if (window.syncDaJarvis) syncDaJarvis(); } catch (e) {} }
  function remoto(s) {
    var k = s.key, v = s.val();
    if (CHIAVI.indexOf(k) < 0 || typeof v !== 'string' || v === localStorage.getItem(k)) return;
    applying = true; _si.call(localStorage, k, v); applying = false;
    applica(k, v);   // un altro dispositivo ha modificato i dati: si aggiornano subito qui
  }
  function backup(obj, nome) {
    try { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: 'application/json' })); a.download = nome + '-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); } catch (e) {}
  }

  function fine(u) {
    ready = true; ui.style.display = 'none';
    var out = document.getElementById('nb-logout');
    if (out) { out.style.display = ''; out.textContent = '\u{1F6AA} Esci (' + (u.email || '') + ')'; }
    if (!attached) { attached = true; db.ref('negozio').on('child_added', remoto); db.ref('negozio').on('child_changed', remoto); }
  }
  function avvia(u) {
    msg('Sincronizzo i dati...');
    db.ref('negozio').once('value').then(function (snap) {
      var cloud = snap.val() || {}, loc = {}, up = {}, cambiato = false, uso = 'online';
      CHIAVI.forEach(function (k) { var v = localStorage.getItem(k); if (v !== null) loc[k] = v; });
      var conflitto = CHIAVI.some(function (k) { return k !== 'rp_logo' && k in loc && k in cloud && loc[k] !== cloud[k]; });
      if (conflitto && !sessionStorage.getItem('rp_cloud_ok')) {
        if (confirm('Su questo dispositivo ci sono dati DIVERSI da quelli online.\n\nOK = usa i dati ONLINE (scarico prima una copia di sicurezza di quelli di questo dispositivo).\nAnnulla = altre opzioni.')) backup(loc, 'backup-questo-dispositivo');
        else if (confirm('Vuoi allora CARICARE online i dati di QUESTO dispositivo, sostituendo quelli online?\n\nOK = si, sostituisci (scarico prima una copia di quelli online).\nAnnulla = no, usa i dati online.')) { backup(cloud, 'backup-dati-online'); uso = 'locale'; }
        else backup(loc, 'backup-questo-dispositivo');
      }
      sessionStorage.setItem('rp_cloud_ok', '1');
      CHIAVI.forEach(function (k) {
        if (uso === 'locale' && k in loc) { if (loc[k] !== cloud[k]) up[k] = loc[k]; }
        else if (k in cloud) { if (loc[k] !== cloud[k]) { applying = true; _si.call(localStorage, k, cloud[k]); applying = false; cambiato = true; } }
        else if (k in loc) up[k] = loc[k];
      });
      return (Object.keys(up).length ? db.ref('negozio').update(up) : Promise.resolve()).then(function () {
        if (cambiato && !sessionStorage.getItem('rp_cloud_reloaded')) { sessionStorage.setItem('rp_cloud_reloaded', '1'); location.reload(); return; }
        if (cambiato) CHIAVI.forEach(function (k) { var v = localStorage.getItem(k); if (v !== null) applica(k, v); });
        fine(u);
      });
    }).catch(function (e) { msg('Non riesco a leggere i dati online: ' + ((e && e.message) || e)); });
  }

  window.rpLogout = function () {
    if (!confirm('Uscire? I dati restano al sicuro online e verranno rimossi da questo dispositivo.')) return;
    flush().then(function () { return auth.signOut(); }).then(function () {
      CHIAVI.forEach(function (k) { localStorage.removeItem(k); });
      sessionStorage.removeItem('rp_cloud_ok'); sessionStorage.removeItem('rp_cloud_reloaded');
      location.reload();
    });
  };

  function inizia() {
    firebase.initializeApp(RP_FIREBASE);
    auth = firebase.auth(); db = firebase.database();
    auth.onAuthStateChanged(function (u) { if (u) avvia(u); else { ready = false; ui.style.display = 'grid'; msg(''); } });
    ui.querySelector('#rp-lf').onsubmit = function (ev) {
      ev.preventDefault(); msg('Accesso in corso...');
      auth.signInWithEmailAndPassword(ui.querySelector('#rp-em').value.trim(), ui.querySelector('#rp-pw').value).catch(function (e) { msg(errore(e)); });
    };
    ui.querySelector('#rp-rs').onclick = function (ev) {
      ev.preventDefault();
      var em = ui.querySelector('#rp-em').value.trim();
      if (!em) { msg('Scrivi prima la tua email.'); return; }
      auth.sendPasswordResetEmail(em).then(function () { msg('Ti ho inviato una email per reimpostare la password.'); }).catch(function (e) { msg(errore(e)); });
    };
  }
  function carica(urls, cb) {
    var i = 0;
    (function next() {
      if (i >= urls.length) return cb();
      var s = document.createElement('script');
      s.src = urls[i++]; s.onload = next;
      s.onerror = function () { msg('Servizio online non raggiungibile. Controlla la connessione.'); };
      document.head.appendChild(s);
    })();
  }
  var V = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-';
  if (window.firebase && firebase.database) inizia(); else carica([V + 'app-compat.js', V + 'auth-compat.js', V + 'database-compat.js'], inizia);
})();
