// drive-sync.js — Google Drive sync layer for ED Recovery Resource Map
// Drop this file in the same folder as index.html, script.js, style.css, data.js
// Then add <script src="drive-sync.js"></script> as the FIRST script in index.html

(function () {
  const CLIENT_ID   = '291656416517-7d2j1orsut7avigpdkhspm83gl2lea07.apps.googleusercontent.com';
  const FILE_NAME   = 'ed-recovery-index.json';
  const LS_KEY      = 'edRecoveryMap2';
  const SCOPE       = 'https://www.googleapis.com/auth/drive.file';
  const SESSION_KEY = 'dsync_loaded';

  let token       = null;
  let fileId      = null;
  let syncTimer   = null;
  let tokenClient = null;

  // ── Intercept localStorage.setItem so we detect every save ───────────────
  // script.js calls localStorage.setItem('edRecoveryMap2', ...) on every change.
  // We catch that here and schedule a Drive push automatically.
  const _setItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key, value) {
    _setItem(key, value);
    if (key === LS_KEY && token) {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(pushToDrive, 2500); // debounce: 2.5s after last change
    }
  };

  // ── Sidebar UI ────────────────────────────────────────────────────────────
  function injectUI() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const bar = document.createElement('div');
    bar.id = 'driveBar';
    bar.innerHTML =
      '<span id="syncStatus"></span>' +
      '<button id="btnConnectDrive" style="display:none">Connect Google Drive</button>';
    sidebar.appendChild(bar);

    document.getElementById('btnConnectDrive').addEventListener('click', () => {
      tokenClient && tokenClient.requestAccessToken({ prompt: 'consent' });
    });

    const style = document.createElement('style');
    style.textContent = `
      #driveBar {
        padding: 10px 16px 14px;
        border-top: 1px solid rgba(255,255,255,0.07);
        margin-top: auto;
      }
      #syncStatus {
        display: block;
        font-size: 11px;
        letter-spacing: 0.01em;
        color: rgba(255,255,255,0.35);
        min-height: 15px;
        transition: color 0.3s;
      }
      #syncStatus.syncing { color: #8ab8e8; }
      #syncStatus.saved   { color: #7ec47e; }
      #syncStatus.error   { color: #e08888; cursor: pointer; text-decoration: underline dotted; }
      #btnConnectDrive {
        display: none;
        margin-top: 7px;
        width: 100%;
        font-size: 11px;
        padding: 5px 10px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.13);
        color: rgba(255,255,255,0.55);
        border-radius: 5px;
        cursor: pointer;
        text-align: center;
        transition: background 0.15s;
      }
      #btnConnectDrive:hover { background: rgba(255,255,255,0.11); }
    `;
    document.head.appendChild(style);
  }

  function setStatus(cls, msg) {
    const el  = document.getElementById('syncStatus');
    const btn = document.getElementById('btnConnectDrive');
    if (!el) return;
    el.className   = cls;
    el.textContent = msg;
    if (cls === 'error') {
      el.title   = 'Click to retry';
      el.onclick = () => token ? pushToDrive() : tokenClient && tokenClient.requestAccessToken({ prompt: '' });
    } else {
      el.title   = '';
      el.onclick = null;
    }
    if (btn) btn.style.display = (cls === 'disconnected') ? 'block' : 'none';
  }

  // ── Google Identity Services auth ─────────────────────────────────────────
  function loadGIS() {
    return new Promise(resolve => {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) {
        resolve(); return;
      }
      const s = document.createElement('script');
      s.src    = 'https://accounts.google.com/gsi/client';
      s.async  = true;
      s.onload = resolve;
      s.onerror = resolve; // resolve even on error so we can show a message
      document.head.appendChild(s);
    });
  }

  async function initAuth() {
    await loadGIS();
    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      setStatus('error', '⚠ Could not load Google auth');
      return;
    }
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope:     SCOPE,
      callback:  async function (resp) {
        if (resp.error) {
          if (resp.error === 'interaction_required' || resp.error === 'access_denied') {
            // Silent auth failed — show button so user can click to connect
            setStatus('disconnected', '');
          } else {
            setStatus('error', '⚠ Auth error — click to retry');
          }
          return;
        }
        token = resp.access_token;
        await pullFromDrive();
      }
    });
    setStatus('syncing', '⟳ Connecting…');
    tokenClient.requestAccessToken({ prompt: '' }); // try silent first
  }

  // ── Drive API helpers ─────────────────────────────────────────────────────
  async function driveRequest(url, options) {
    options = options || {};
    if (!token) throw new Error('no-token');
    var headers = Object.assign({ Authorization: 'Bearer ' + token }, options.headers || {});
    var r = await fetch(url, Object.assign({}, options, { headers: headers }));
    if (r.status === 401 || r.status === 403) {
      token = null;
      if (tokenClient) tokenClient.requestAccessToken({ prompt: '' });
      throw new Error('token-expired');
    }
    return r;
  }

  async function findFile() {
    var q   = "name='" + FILE_NAME + "' and trashed=false";
    var url = 'https://www.googleapis.com/drive/v3/files'
            + '?q=' + encodeURIComponent(q)
            + '&fields=files(id,modifiedTime)&spaces=drive';
    var r = await driveRequest(url);
    if (!r.ok) throw new Error('search:' + r.status);
    var d = await r.json();
    return (d.files && d.files.length > 0) ? d.files[0] : null;
  }

  // ── Pull from Drive (runs once per browser session) ───────────────────────
  async function pullFromDrive() {
    setStatus('syncing', '⟳ Loading from Drive…');
    try {
      var file = await findFile();
      if (file) {
        fileId = file.id;
        // Only reload with Drive data once per session (prevents reload loop)
        if (!sessionStorage.getItem(SESSION_KEY)) {
          var r = await driveRequest(
            'https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media'
          );
          if (!r.ok) throw new Error('download:' + r.status);
          var driveData = await r.json();
          // Save Drive data to localStorage, then reload so the app picks it up cleanly
          sessionStorage.setItem(SESSION_KEY, '1');
          _setItem(LS_KEY, JSON.stringify(driveData));
          location.reload();
          return;
        }
        // Already reloaded this session — just confirm we're synced
        setStatus('saved', '✓ Drive synced');
      } else {
        // No Drive file yet — push what's in localStorage to create it
        await pushToDrive();
      }
    } catch (e) {
      console.error('[drive-sync] pull error:', e);
      if (e.message !== 'token-expired') {
        setStatus('error', '⚠ Sync error — click to retry');
      }
    }
  }

  // ── Push to Drive (fires 2.5s after any save) ─────────────────────────────
  async function pushToDrive() {
    if (!token) return;
    setStatus('syncing', '⟳ Saving…');
    try {
      if (!fileId) {
        var file = await findFile();
        fileId = file ? file.id : null;
      }
      var content  = localStorage.getItem(LS_KEY) || '{}';
      var meta     = JSON.stringify({ name: FILE_NAME, mimeType: 'application/json' });
      var boundary = 'edmap_sync_boundary';
      var body     = [
        '--' + boundary,
        'Content-Type: application/json; charset=UTF-8',
        '',
        meta,
        '--' + boundary,
        'Content-Type: application/json',
        '',
        content,
        '--' + boundary + '--'
      ].join('\r\n');

      var url    = fileId
        ? 'https://www.googleapis.com/upload/drive/v3/files/' + fileId + '?uploadType=multipart'
        : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      var method = fileId ? 'PATCH' : 'POST';

      var r = await driveRequest(url, {
        method:  method,
        headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
        body:    body
      });
      if (!r.ok) {
        var errText = await r.text();
        throw new Error('upload:' + r.status + ' ' + errText);
      }
      var d = await r.json();
      if (d.id) fileId = d.id;
      setStatus('saved', '✓ Saved to Drive');
    } catch (e) {
      console.error('[drive-sync] push error:', e);
      if (e.message !== 'token-expired') {
        setStatus('error', '⚠ Save failed — click to retry');
      }
    }
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', function () {
    injectUI();
    initAuth().catch(function (e) {
      console.error('[drive-sync] init error:', e);
      setStatus('disconnected', '');
    });
  });

})();
