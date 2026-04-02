/**
 * main.js — Electron Main Process
 * Advanced "Under-the-Hood" Architecture for reliable YouTube integration.
 */

const { app, BrowserWindow, ipcMain, session, protocol, WebContentsView, dialog, net, shell, globalShortcut } = require('electron');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const resolver = require('./audioResolver');
const rpc = require('./rpc');

const isDev = !app.isPackaged;

// Helper to load .env.local manually for the main process
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const [key, ...value] = line.split('=');
      if (key && value.length > 0) {
        process.env[key.trim()] = value.join('=').trim();
      }
    });
  }
}
loadEnv();

let win;
let miniWin;
let currentPlaybackState = { song: null, isPlaying: false };
let sidecarView;

// ─── High-Authority Environment (ytmdesktop2 inspired) ────────────────────────
app.commandLine.appendSwitch('disable-site-isolation-trials');
if (isDev) {
    app.commandLine.appendSwitch('disable-web-security');
}

protocol.registerSchemesAsPrivileged([
    { scheme: 'http', privileges: { standard: true, bypassCSP: true, corsEnabled: true, stream: true } },
    { scheme: 'https', privileges: { standard: true, bypassCSP: true, corsEnabled: true, stream: true } },
    { scheme: 'local-audio', privileges: { standard: true, bypassCSP: true, corsEnabled: true, stream: true, secure: true } }
]);

const crypto = require('crypto');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || '';

// ─── Local Audio Proxy Server ─────────────────────────────────────────────────

let proxyPort = 0;
let proxyServer = null;

function startProxyServer() {
  proxyServer = http.createServer((req, res) => {
    const reqUrl = new URL(req.url, `http://localhost`);
    const targetUrlEncoded = reqUrl.searchParams.get('u');
    if (!targetUrlEncoded) { res.writeHead(400); res.end(); return; }
    const targetUrl = decodeURIComponent(targetUrlEncoded);

    const proxyRequest = async (currentUrl) => {
      try {
        const parsed = new URL(currentUrl);
        const lib = parsed.protocol === 'https:' ? https : http;
        
        // ─── AUTH BRIDGE ───
        // Capture cookies and SAPISID from the authorized YouTube partition
        const auth = await getInnerTubeAuth();
        const cookies = await session.fromPartition('persist:youtube').cookies.get({ domain: '.youtube.com' });
        const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

        const headers = { 
            ...req.headers, 
            host: parsed.hostname, 
            referer: parsed.origin,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        };
        if (cookieStr) headers['Cookie'] = cookieStr;
        if (auth) headers['Authorization'] = auth;
        
        // Remove electron-specific and conflicting headers
        delete headers.connection;
        delete headers['sec-ch-ua'];

        const pReq = lib.request(currentUrl, { headers, servername: parsed.hostname }, (pRes) => {
          // Handle Redirects
          if (pRes.statusCode >= 300 && pRes.statusCode < 400 && pRes.headers.location) {
            return proxyRequest(new URL(pRes.headers.location, currentUrl).href);
          }
          const resHeads = { 
            'Access-Control-Allow-Origin': '*', 
            'Access-Control-Allow-Headers': '*', 
            'Access-Control-Expose-Headers': '*' 
          };
          Object.keys(pRes.headers).forEach(h => {
             if (!['access-control', 'content-security', 'set-cookie'].some(x => h.toLowerCase().includes(x))) {
               resHeads[h] = pRes.headers[h];
             }
          });
          res.writeHead(pRes.statusCode, resHeads);
          pRes.pipe(res, { end: true });
        });
        pReq.on('error', (e) => { 
           console.error('[Proxy] !! Stream Error:', e.message);
           if (!res.headersSent) { res.writeHead(500); res.end(); } 
        });
        req.on('close', () => pReq.destroy());
        pReq.end();
      } catch (e) { 
        console.error('[Proxy] Error:', e.message);
        if (!res.headersSent) { res.writeHead(500); res.end(); }
      }
    };
    proxyRequest(targetUrl);
  });

  return new Promise((resolve) => {
    proxyServer.listen(0, '127.0.0.1', () => {
      proxyPort = proxyServer.address().port;
      console.log(`[Proxy] ✅ Listening at http://127.0.0.1:${proxyPort}`);
      resolve(proxyPort);
    });
  });
}

function makeProxyUrl(realUrl) {
  if (!realUrl) return '';
  return `http://127.0.0.1:${proxyPort}/stream?u=${encodeURIComponent(realUrl)}`;
}

// ─── Window & Security ────────────────────────────────────────────────────────

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 680,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#050505', symbolColor: '#ffffff', height: 40 },
    backgroundColor: '#050505',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
    show: isDev,
  });

  console.log('[Main] 🚀 Window object created.');

  win.once('ready-to-show', () => {
    console.log('[Main] ✨ Window is ready to show.');
    win.show();
  });
  win.on('closed', () => (win = null));

  // ─── High-Authority Sidecar (ytmdesktop2 inspired) ─────────────────────────
  
  sidecarView = new WebContentsView({
    webPreferences: {
      partition: 'persist:youtube',
      preload: path.join(__dirname, 'sidecarPreload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required',
      webSecurity: true, // Sidecar should be secure
      sandbox: false
    }
  });

  // Hide sidecar but keep it alive for playback
  sidecarView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  win.contentView.addChildView(sidecarView);

  // Initial load
  sidecarView.webContents.loadURL('https://music.youtube.com', {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
  });

  // Forward sidecar state to the renderer
  ipcMain.on('sidecar-state-update', (event, state) => {
    if (win && !win.isDestroyed()) {
        win.webContents.send('sidecar-state-changed', state);
    }
  });

  // Controls for the sidecar
  ipcMain.handle('sidecar-cmd', (_, { type, value }) => {
    if (!sidecarView || sidecarView.webContents.isDestroyed()) return;
    sidecarView.webContents.send('sidecar-command', { type, value });
  });

  ipcMain.handle('sidecar-play-id', (_, videoId) => {
    if (!sidecarView || sidecarView.webContents.isDestroyed()) return;
    sidecarView.webContents.send('sidecar-play', videoId);
  });

  const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
  if (isDev) {
    console.log('[Main] 🌐 Loading http://localhost:5173');
    win.loadURL('http://localhost:5173', { userAgent: chromeUA }).catch((err) => {
        console.log('[Main] ⚠️ Failed to load :5173, trying :5174', err.message);
        win.loadURL('http://localhost:5174', { userAgent: chromeUA });
    });
  } else {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    console.log('[Main] 📦 Loading production build:', indexPath);
    if (!fs.existsSync(indexPath)) {
      console.error('[Main] ❌ Production index.html NOT FOUND at:', indexPath);
      // Fallback attempt in case of different folder structure
      const fallbackPath = path.join(__dirname, 'dist', 'index.html');
      if (fs.existsSync(fallbackPath)) {
        win.loadFile(fallbackPath, { userAgent: chromeUA });
      } else {
        dialog.showErrorBox('Initialization Error', `Could not find application files at:\n${indexPath}`);
      }
    } else {
      win.loadFile(indexPath, { userAgent: chromeUA });
    }
  }

  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.youtube.com/*', '*://*.google.com/*', '*://api.song.link/*', '*://accounts.google.com/*'] },
    (details, callback) => {
      details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  session.defaultSession.webRequest.onHeadersReceived({ urls: ['*://*.youtube.com/*', '*://*.googlevideo.com/*', '*://*.spotify.com/*', '*://127.0.0.1:*/*'] }, (details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    delete responseHeaders['content-security-policy'];
    delete responseHeaders['content-security-policy-report-only'];
    delete responseHeaders['x-frame-options'];
    responseHeaders['Access-Control-Allow-Origin'] = ['*'];
    callback({ responseHeaders });
  });

  win.webContents.on('console-message', (e, level, message) => {
    console.log(`[Renderer] ${message}`);
  });
}

// ─── YouTube Advanced Helpers ─────────────────────────────────────────────────

async function getInnerTubeAuth() {
  const cookiesDefault = await session.defaultSession.cookies.get({ domain: '.youtube.com' });
  const cookiesAuth = await session.fromPartition('persist:youtube').cookies.get({ domain: '.youtube.com' });
  const allCookies = [...cookiesDefault, ...cookiesAuth];
  
  // Prefer __Secure-3PAPISID over SAPISID
  const sapisid = allCookies.find(c => c.name === '__Secure-3PAPISID')?.value || 
                  allCookies.find(c => c.name === 'SAPISID')?.value;
                  
  if (!sapisid) return null;

  const origin = 'https://www.youtube.com';
  const time = Math.floor(Date.now() / 1000);
  const hash = crypto.createHash('sha1').update(`${time} ${sapisid} ${origin}`).digest('hex');
  return `SAPISIDHASH ${time}_${hash}`;
}

async function youtubeInnerTubeRequest(endpoint, body = {}) {
  const auth = await getInnerTubeAuth();
  
  // High-reliability client context (merging rather than overriding)
  const defaultClient = {
    clientName: 'WEB_REMIX',
    clientVersion: '1.20250311.01.00',
    hl: 'en',
    gl: 'IN',
    utcOffsetMinutes: 330,
  };

  const context = {
    client: {
      ...defaultClient,
      ...(body.context?.client || {})
    },
    user: {
        lockedSafetyMode: false
    },
    ...body.context
  };

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Origin': 'https://music.youtube.com',
    'Referer': 'https://music.youtube.com/',
    'X-Goog-AuthUser': '0',
    'X-Youtube-Client-Name': String(context.client.clientName === 'WEB_REMIX' ? 67 : 1),
    'X-Youtube-Client-Version': context.client.clientVersion,
  };

  if (auth) headers['Authorization'] = auth;

  const authSession = session.fromPartition('persist:youtube');
  
  // Cleaning body to avoid double context
  const cleanBody = { ...body };
  delete cleanBody.context;

  const response = await authSession.fetch(`https://www.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({ ...cleanBody, context })
  });

  if (!response.ok) {
     const errorText = await response.text();
     console.error(`[InnerTube] Request failed (${response.status}): ${errorText}`);
     throw new Error(`InnerTube error: ${response.status}`);
  }

  return response.json();
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('open-external', async (_, url) => {
  if (url.startsWith('http')) {
    await shell.openExternal(url);
  }
});

ipcMain.handle('search-music', async (_, { query, limit }) => resolver.searchMusic(query, limit));

ipcMain.handle('resolve-audio', async (_, { song }) => {
  console.log(`[IPC] ← Locating song: "${song.title}"`);
  const videoId = await resolver.resolveAudio(song);
  return videoId; // Returns just the ID for the Sidecar
});

ipcMain.handle('get-lyrics', async (_, { artist, title }) => resolver.getLyrics(artist, title));
ipcMain.handle('get-suggestions', async (_, { currentSong }) => resolver.getSuggestions(currentSong, GEMINI_API_KEY));
ipcMain.handle('get-trending', async () => resolver.getTrending());
ipcMain.handle('get-playlists', async () => resolver.getPublicPlaylists());
ipcMain.handle('get-vibe-shift-suggestions', async (_, { likedSongs, apiKey }) => {
  const key = apiKey || process.env.GEMINI_API_KEY || process.env.API_KEY || '';
  return resolver.getVibeShiftSuggestions(likedSongs, key);
});

try {
  ipcMain.handle('update-discord-rpc', async (_, { song, isPlaying }) => {
      currentPlaybackState = { song, isPlaying };
      rpc.updatePresence(song, isPlaying);
      if (miniWin) {
          miniWin.webContents.send('playback-state-sync', currentPlaybackState);
      }
  });
} catch (e) {
  console.warn('[Main] ⚠️ Skipping duplicate Discord RPC handler registration.');
}

ipcMain.handle('get-playback-state', async () => currentPlaybackState);

ipcMain.handle('toggle-mini-player', async (_, { enabled }) => {
    if (enabled) {
        if (!miniWin) {
            miniWin = new BrowserWindow({
                width: 320,
                height: 480,
                frame: false,
                resizable: false,
                alwaysOnTop: true,
                backgroundColor: '#050505',
                webPreferences: {
                    preload: path.join(__dirname, 'preload.js'),
                    nodeIntegration: false,
                    contextIsolation: true,
                    webSecurity: false, // Allow YouTube music cover art
                }
            });

            const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
            const miniUrl = isDev ? 'http://localhost:5173/?view=mini' : `file://${path.join(__dirname, '../dist/index.html')}?view=mini`;
            
            miniWin.loadURL(miniUrl, { userAgent: chromeUA });
            miniWin.on('closed', () => (miniWin = null));
            win.hide();
        }
    } else {
        if (miniWin) {
            miniWin.close();
            win.show();
        }
    }
});

const watchedFolders = new Map();

ipcMain.handle('watch-folder', async (event, folderPath) => {
  if (watchedFolders.has(folderPath)) return true;
  try {
    const watcher = fs.watch(folderPath, (eventType, filename) => {
      if (filename && /\.(mp3|wav|flac|m4a|ogg)$/i.test(filename)) {
        win.webContents.send('folder-updated', folderPath);
      }
    });
    watchedFolders.set(folderPath, watcher);
    return true;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('select-local-folder', async (event) => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory']
  });
  
  if (result.canceled) return null;
  
  const folderPath = result.filePaths[0];
  const files = fs.readdirSync(folderPath);
  const audioFiles = files.filter(f => /\.(mp3|wav|flac|m4a|ogg)$/i.test(f));
  
  const songs = audioFiles.map(filename => {
    const filePath = path.join(folderPath, filename);
    return {
      id: `local-${crypto.createHash('md5').update(filePath).digest('hex')}`,
      title: filename.replace(/\.[^/.]+$/, ""),
      artist: "Local File",
      album: path.basename(folderPath),
      coverUrl: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=600&h=600&auto=format&fit=crop",
      duration: 0,
      url: `local-audio://${encodeURIComponent(filePath)}`,
      source: 'local'
    };
  });

  return { path: folderPath, songs };
});

// ─── Auth Handlers ────────────────────────────────────────────────────────────

ipcMain.handle('youtube-login', async () => {
    const mobileUA = 'Mozilla/5.0 (Linux; Android 13; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36';
    const loginWin = new BrowserWindow({
        width: 480,
        height: 680,
        title: 'YouTube Login - IZGIV Sidecar',
        autoHideMenuBar: true,
        webPreferences: { 
            nodeIntegration: false, 
            contextIsolation: true,
            partition: 'persist:youtube'
        }
    });

    loginWin.webContents.setUserAgent(mobileUA);
    loginWin.loadURL('https://accounts.google.com/ServiceLogin?service=youtube&hl=en&continue=https%3A%2F%2Fwww.youtube.com%2Fsignin%3Faction_handle_signin%3Dtrue', {
       userAgent: mobileUA
    });
    
    loginWin.webContents.session.setUserAgent(mobileUA);

    return new Promise((resolve) => {
        loginWin.webContents.on('did-navigate', async (event, url) => {
            if (url.includes('youtube.com') && !url.includes('accounts.google.com')) {
                const cookies = await loginWin.webContents.session.cookies.get({ domain: '.youtube.com' });
                const isLoggedIn = cookies.some(c => c.name === 'SAPISID');
                if (isLoggedIn) {
                    setTimeout(() => { loginWin.close(); resolve({ success: true }); }, 2000);
                }
            }
        });
        loginWin.on('closed', () => resolve({ success: false }));
    });
});

ipcMain.handle('innertube-request', async (_, { endpoint, body }) => youtubeInnerTubeRequest(endpoint, body));

ipcMain.handle('set-always-on-top', async (event, flag) => {
    if (win && !win.isDestroyed()) {
        win.setAlwaysOnTop(flag);
        return true;
    }
    return false;
});

ipcMain.handle('send-media-cmd', async (_, cmd) => {
    if (win && !win.isDestroyed()) {
        win.webContents.send('media-cmd', cmd);
    }
});

ipcMain.handle('reveal-in-explorer', async (_, filePath) => {
    if (!filePath) return;
    shell.showItemInFolder(filePath);
});

// ─── App Lifecycle ───────────────────────────────────────────────────────────
resolver.setInnerTubeRequester(youtubeInnerTubeRequest);

app.whenReady().then(async () => {
  protocol.handle('local-audio', (request) => {
    const rawPath = decodeURIComponent(request.url.replace('local-audio://', ''));
    return net.fetch('file://' + rawPath);
  });

  await startProxyServer();
  rpc.initRPC();
  createWindow();

  // Global Media Hotkeys
  globalShortcut.register('MediaPlayPause', () => {
    if (win && !win.isDestroyed()) win.webContents.send('media-cmd', 'toggle');
  });
  globalShortcut.register('MediaNextTrack', () => {
    if (win && !win.isDestroyed()) win.webContents.send('media-cmd', 'next');
  });
  globalShortcut.register('MediaPreviousTrack', () => {
    if (win && !win.isDestroyed()) win.webContents.send('media-cmd', 'prev');
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (proxyServer) proxyServer.close();
  if (process.platform !== 'darwin') app.quit();
});
