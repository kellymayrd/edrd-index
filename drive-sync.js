// drive-sync.js — Google Drive sync layer for ED Recovery Resource Map
// v2: user-gesture triggered auth (fixes Safari popup blocker)

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

  // ── Intercept localStorage so we catch every save from script.js ──────────
  const _setItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key, value) {
    _setItem(key, value);
    if (key === LS_KEY && token) {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(pushToDrive, 2500);
    }
  };

  // ── Sidebar UI ────────────────────────────────────────────────────────────
  function injectUI() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const bar = document.createElement('div');
    bar.id = 'driveBar';
    bar.innerHTML =
      '<span id="syncStatus">○ Not connected</span>' +
      '<button id="btnConnectDrive">Connect Google Drive</button>';
    sidebar.appendChild(bar);

    document.getElementById('btnConnectDrive').addEventListener('click', function () {
      if (!tokenClient) { initAuth(); return; }
      setStatus('syncing', '⟳ Connecting…');
      tokenClient.requestAccessToken({ prompt: 'consent' });
    });

    const style = document.createElement('style');
    style.textContent = `
      #driveBar {
        padding: 10px 16px 14px;
        border-top: 1px solid rgba(0,0,0,0.08);
      }
      #syncStatus {
        display: block;
        font-size: 11px;
        letter-spacing: 0.01em;
        color: rgba(0,0,0,0.35);
        min-height: 15px;
        transition: color 0.3s;
        margin-bottom: 6px;
      }
      #syncStatus.syncing { color: #3a7abf; }
      #syncStatus.saved   { color: #3a8c3a; }
      #syncStatus.error   { color: #b84a2a; cursor: pointer; text-decoration: underline dotted; }
      #btnConnectDrive {
        width: 100%;
        font-size: 11px;
        padding: 5px 10px;
        background: rgba(0,0,0,0.04);
        border: 1px solid rgba(0,0,0,0.15);
        color: rgba(0,0,0,0.55);
        border-radius: 5px;
        cursor: pointer;
        text-align: center;
        transition: background 0.15s;
      }
      #btnConnectDrive:hover { background: rgba(0,0,0,0.08); }
      #btnConnectDrive.hidden { display: none; }
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
      el.onclick = function() { token ? pushToDrive() : tokenClient && tokenClient.requestAccessToken({ prompt: '' }); };
    } else {
      el.title   = '';
      el.onclick = null;
    }
    // Hide button once connected
    if (btn) btn.className = (cls === 'saved' || cls === 'syncing') ? 'hidden' : '';
  }

  // ── Google Identity Services ──────────────────────────────────────────────
  function loadGIS() {
    return new Promise(function(resolve) {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) {
        resolve(); return;
      }
      const s = document.createElement('script');
      s.src    = 'https://accounts.google.com/gsi/client';
      s.async  = true;
      s.onload = resolve;
      s.onerror = resolve;
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
          setStatus('error', '⚠ Sign-in failed — try again');
          return;
        }
        token = resp.access_token;
        document.getElementById('btnConnectDrive').className = 'hidden';
        await pullFromDrive();
      }
    });
  }

  // ── Drive operations ──────────────────────────────────────────────────────
  async function driveRequest(url, options) {
    options = options || {};
    if (!token) throw new Error('no-token');
    const headers = Object.assign({ Authorization: 'Bearer ' + token }, options.headers || {});
    const r = await fetch(url, Object.assign({}, options, { headers: headers }));
    if (r.status === 401 || r.status === 403) {
      token = null;
      setStatus('', '○ Not connected');
      document.getElementById('btnConnectDrive').className = '';
      throw new Error('token-expired');
    }
    return r;
  }

  async function findFile() {
    const q   = "name='" + FILE_NAME + "' and trashed=false";
    const url = 'https://www.googleapis.com/drive/v3/files'
              + '?q=' + encodeURIComponent(q)
              + '&fields=files(id,modifiedTime)&spaces=drive';
    const r = await driveRequest(url);
    if (!r.ok) throw new Error('search:' + r.status);
    const d = await r.json();
    return (d.files && d.files.length > 0) ? d.files[0] : null;
  }

  async function pullFromDrive() {
    setStatus('syncing', '⟳ Loading from Drive…');
    try {
      const file = await findFile();
      if (file) {
        fileId = file.id;
        if (!sessionStorage.getItem(SESSION_KEY)) {
          const r = await driveRequest(
            'https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media'
          );
          if (!r.ok) throw new Error('download:' + r.status);
          const driveData = await r.json();
          sessionStorage.setItem(SESSION_KEY, '1');
          _setItem(LS_KEY, JSON.stringify(driveData));
          location.reload();
          return;
        }
        setStatus('saved', '✓ Drive synced');
      } else {
        // No file yet — push current local state up to Drive
        await pushToDrive();
      }
    } catch (e) {
      console.error('[drive-sync] pull error:', e);
      if (e.message !== 'token-expired') {
        setStatus('error', '⚠ Sync error — click to retry');
      }
    }
  }

  async function pushToDrive() {
    if (!token) return;
    setStatus('syncing', '⟳ Saving…');
    try {
      if (!fileId) {
        const file = await findFile();
        fileId = file ? file.id : null;
      }
      const content  = localStorage.getItem(LS_KEY) || '{}';
      const meta     = JSON.stringify({ name: FILE_NAME, mimeType: 'application/json' });
      const boundary = 'edmap_sync_boundary';
      const body     = [
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

      const url    = fileId
        ? 'https://www.googleapis.com/upload/drive/v3/files/' + fileId + '?uploadType=multipart'
        : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

      const r = await driveRequest(url, {
        method:  fileId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
        body:    body
      });
      if (!r.ok) throw new Error('upload:' + r.status);
      const d = await r.json();
      if (d.id) fileId = d.id;
      setStatus('saved', '✓ Saved to Drive');
    } catch (e) {
      console.error('[drive-sync] push error:', e);
      if (e.message !== 'token-expired') {
        setStatus('error', '⚠ Save failed — click to retry');
      }
    }
  }

  // ── Boot — just inject UI and load GIS, no auto popup ────────────────────
  window.addEventListener('DOMContentLoaded', function () {
    injectUI();
    // Pre-load the GIS library silently so auth is fast when user clicks
    loadGIS().then(function() {
      if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) return;
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope:     SCOPE,
        callback:  async function (resp) {
          if (resp.error) {
            setStatus('error', '⚠ Sign-in failed — try again');
            const btn = document.getElementById('btnConnectDrive');
            if (btn) btn.className = '';
            return;
          }
          token = resp.access_token;
          const btn = document.getElementById('btnConnectDrive');
          if (btn) btn.className = 'hidden';
          await pullFromDrive();
        }
      });
    });
  });

})();
