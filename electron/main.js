/**
 * main.js — Electron Main Process
 * Hardened startup + IPC lifecycle for reliable runtime behavior.
 */

const { app, BrowserWindow, ipcMain, session, protocol, WebContentsView, dialog, net, shell, globalShortcut } = require('electron');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');

const resolver = require('./audioResolver');
const rpc = require('./rpc');

const isDev = !app.isPackaged;

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;

  try {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach((line) => {
      if (!line || line.trim().startsWith('#')) return;
      const idx = line.indexOf('=');
      if (idx === -1) return;

      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (key) process.env[key] = value;
    });
  } catch (error) {
    console.warn('[Main] Failed to load .env.local:', error.message);
  }
}
loadEnv();

let win = null;
let miniWin = null;
let sidecarView = null;
let currentPlaybackState = { song: null, isPlaying: false };
const watchedFolders = new Map();

app.commandLine.appendSwitch('disable-site-isolation-trials');
if (isDev) {
  app.commandLine.appendSwitch('disable-web-security');
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'http', privileges: { standard: true, bypassCSP: true, corsEnabled: true, stream: true } },
  { scheme: 'https', privileges: { standard: true, bypassCSP: true, corsEnabled: true, stream: true } },
  { scheme: 'local-audio', privileges: { standard: true, bypassCSP: true, corsEnabled: true, stream: true, secure: true } }
]);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || '';

let proxyPort = 0;
let proxyServer = null;

function cleanupWatchers() {
  for (const watcher of watchedFolders.values()) {
    try {
      watcher.close();
    } catch (err) {
      console.warn('[Main] Failed to close folder watcher:', err.message);
    }
  }
  watchedFolders.clear();
}

function startProxyServer() {
  if (proxyServer) {
    return Promise.resolve(proxyPort);
  }

  proxyServer = http.createServer((req, res) => {
    const reqUrl = new URL(req.url, 'http://localhost');
    const targetUrlEncoded = reqUrl.searchParams.get('u');
    if (!targetUrlEncoded) {
      res.writeHead(400, { 'Access-Control-Allow-Origin': '*' });
      res.end('Missing stream target');
      return;
    }

    const targetUrl = decodeURIComponent(targetUrlEncoded);

    const proxyRequest = async (currentUrl) => {
      try {
        const parsed = new URL(currentUrl);
        const lib = parsed.protocol === 'https:' ? https : http;

        const auth = await getInnerTubeAuth();
        const cookies = await session.fromPartition('persist:youtube').cookies.get({ domain: '.youtube.com' });
        const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

        const headers = {
          ...req.headers,
          host: parsed.hostname,
          referer: parsed.origin,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        };

        if (cookieStr) headers.Cookie = cookieStr;
        if (auth) headers.Authorization = auth;

        delete headers.connection;
        delete headers['sec-ch-ua'];

        const pReq = lib.request(currentUrl, { headers, servername: parsed.hostname }, (pRes) => {
          if (pRes.statusCode >= 300 && pRes.statusCode < 400 && pRes.headers.location) {
            try {
              return proxyRequest(new URL(pRes.headers.location, currentUrl).href);
            } catch (err) {
              console.error('[Proxy] Redirect failed:', err.message);
              if (!res.headersSent) {
                res.writeHead(500);
                res.end('Proxy redirect failed');
              }
            }
            return;
          }

          const resHeads = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Expose-Headers': '*'
          };

          Object.keys(pRes.headers).forEach((h) => {
            const lower = h.toLowerCase();
            if (!['access-control', 'content-security', 'set-cookie'].includes(lower)) {
              resHeads[h] = pRes.headers[h];
            }
          });

          res.writeHead(pRes.statusCode || 200, resHeads);
          pRes.pipe(res, { end: true });
        });

        pReq.on('error', (e) => {
          console.error('[Proxy] Stream error:', e.message);
          if (!res.headersSent) {
            res.writeHead(500);
            res.end('Proxy stream error');
          }
        });

        req.on('close', () => {
          try {
            pReq.destroy();
          } catch (err) {
            // no-op
          }
        });

        pReq.end();
      } catch (e) {
        console.error('[Proxy] Error:', e && e.message ? e.message : e);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end('Proxy failed');
        }
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

function createWindow() {
  if (win && !win.isDestroyed()) return win;

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

  win.once('ready-to-show', () => {
    if (!win || win.isDestroyed()) return;
    win.show();
    console.log('[Main] ✨ Window is ready to show.');
  });

  win.on('closed', () => {
    win = null;
  });

  sidecarView = new WebContentsView({
    webPreferences: {
      partition: 'persist:youtube',
      preload: path.join(__dirname, 'sidecarPreload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required',
      webSecurity: true,
      sandbox: false
    }
  });

  try {
    sidecarView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    if (win && win.contentView) {
      win.contentView.addChildView(sidecarView);
    }
  } catch (err) {
    console.warn('[Main] Sidecar view setup failed:', err.message);
  }

  sidecarView.webContents.loadURL('https://music.youtube.com', {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
  }).catch((err) => {
    console.warn('[Main] Sidecar load failed:', err.message);
  });

  ipcMain.removeAllListeners('sidecar-state-update');
  ipcMain.on('sidecar-state-update', (event, state) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('sidecar-state-changed', state);
    }
  });

  ipcMain.removeHandler('sidecar-cmd');
  ipcMain.handle('sidecar-cmd', async (_, { type, value }) => {
    if (!sidecarView || sidecarView.webContents.isDestroyed()) return null;
    sidecarView.webContents.send('sidecar-command', { type, value });
    return true;
  });

  ipcMain.removeHandler('sidecar-play-id');
  ipcMain.handle('sidecar-play-id', async (_, videoId) => {
    if (!sidecarView || sidecarView.webContents.isDestroyed()) return null;
    sidecarView.webContents.send('sidecar-play', videoId);
    return true;
  });

  const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

  if (isDev) {
    console.log('[Main] 🌐 Loading http://localhost:5173');
    win.loadURL('http://localhost:5173', { userAgent: chromeUA }).catch((err) => {
      console.log('[Main] ⚠️ Failed to load :5173, trying :5174', err.message);
      win.loadURL('http://localhost:5174', { userAgent: chromeUA }).catch((loadErr) => {
        console.warn('[Main] Fallback load also failed:', loadErr.message);
      });
    });
  } else {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    console.log('[Main] 📦 Loading production build:', indexPath);

    if (!fs.existsSync(indexPath)) {
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
    {
      urls: ['*://*.youtube.com/*', '*://*.google.com/*', '*://api.song.link/*', '*://accounts.google.com/*']
    },
    (details, callback) => {
      if (!details.requestHeaders) details.requestHeaders = {};
      details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['*://*.youtube.com/*', '*://*.googlevideo.com/*', '*://*.spotify.com/*', '*://127.0.0.1:*/*'] },
    (details, callback) => {
      const responseHeaders = { ...(details.responseHeaders || {}) };
      delete responseHeaders['content-security-policy'];
      delete responseHeaders['content-security-policy-report-only'];
      delete responseHeaders['x-frame-options'];
      responseHeaders['Access-Control-Allow-Origin'] = ['*'];
      callback({ responseHeaders });
    }
  );

  win.webContents.on('console-message', (event, level, message) => {
    console.log(`[Renderer] ${message}`);
  });

  return win;
}

async function getInnerTubeAuth() {
  const cookiesDefault = await session.defaultSession.cookies.get({ domain: '.youtube.com' });
  const cookiesAuth = await session.fromPartition('persist:youtube').cookies.get({ domain: '.youtube.com' });
  const allCookies = [...cookiesDefault, ...cookiesAuth];

  const sapisid = allCookies.find((c) => c.name === '__Secure-3PAPISID')?.value ||
    allCookies.find((c) => c.name === 'SAPISID')?.value;

  if (!sapisid) return null;

  const origin = 'https://www.youtube.com';
  const time = Math.floor(Date.now() / 1000);
  const hash = crypto.createHash('sha1').update(`${time} ${sapisid} ${origin}`).digest('hex');
  return `SAPISIDHASH ${time}_${hash}`;
}

async function youtubeInnerTubeRequest(endpoint, body = {}) {
  const auth = await getInnerTubeAuth();

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

  if (auth) headers.Authorization = auth;

  const authSession = session.fromPartition('persist:youtube');

  const cleanBody = { ...body };
  delete cleanBody.context;

  const response = await authSession.fetch(`https://www.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...cleanBody, context })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[InnerTube] Request failed (${response.status}): ${errorText}`);
    throw new Error(`InnerTube error: ${response.status}`);
  }

  return response.json();
}

ipcMain.removeHandler('open-external');
ipcMain.handle('open-external', async (_, url) => {
  if (typeof url === 'string' && url.startsWith('http')) {
    await shell.openExternal(url);
  }
  return true;
});

ipcMain.removeHandler('search-music');
ipcMain.handle('search-music', async (_, { query, limit = 25 }) => {
  return resolver.searchMusic(query, limit);
});

ipcMain.removeHandler('resolve-audio');
ipcMain.handle('resolve-audio', async (_, { song }) => {
  if (!song || !song.title) {
    return null;
  }
  console.log(`[IPC] ← Locating song: "${song.title}"`);
  return resolver.resolveAudio(song);
});

ipcMain.removeHandler('get-lyrics');
ipcMain.handle('get-lyrics', async (_, { artist, title }) => resolver.getLyrics(artist, title));

ipcMain.removeHandler('get-suggestions');
ipcMain.handle('get-suggestions', async (_, { currentSong }) => resolver.getSuggestions(currentSong, GEMINI_API_KEY));

ipcMain.removeHandler('get-trending');
ipcMain.handle('get-trending', async () => resolver.getTrending());

ipcMain.removeHandler('get-playlists');
ipcMain.handle('get-playlists', async () => resolver.getPublicPlaylists());

ipcMain.removeHandler('get-vibe-shift-suggestions');
ipcMain.handle('get-vibe-shift-suggestions', async (_, { likedSongs, apiKey }) => {
  const key = apiKey || process.env.GEMINI_API_KEY || process.env.API_KEY || '';
  return resolver.getVibeShiftSuggestions(likedSongs, key);
});

ipcMain.removeHandler('update-discord-rpc');
try {
  ipcMain.handle('update-discord-rpc', async (_, { song, isPlaying }) => {
    currentPlaybackState = { song, isPlaying };
    rpc.updatePresence(song, isPlaying);
    if (miniWin && !miniWin.isDestroyed()) {
      miniWin.webContents.send('playback-state-sync', currentPlaybackState);
    }
    return true;
  });
} catch (e) {
  console.warn('[Main] ⚠️ Duplicate Discord RPC handler registration skipped:', e.message);
}

ipcMain.removeHandler('get-playback-state');
ipcMain.handle('get-playback-state', async () => currentPlaybackState);

ipcMain.removeHandler('toggle-mini-player');
ipcMain.handle('toggle-mini-player', async (_, { enabled }) => {
  if (enabled) {
    if (!miniWin || miniWin.isDestroyed()) {
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
          webSecurity: false,
        }
      });

      const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
      const miniUrl = isDev
        ? 'http://localhost:5173/?view=mini'
        : `file://${path.join(__dirname, '../dist/index.html')}?view=mini`;

      miniWin.loadURL(miniUrl, { userAgent: chromeUA }).catch((err) => {
        console.warn('[MiniPlayer] load failed:', err.message);
      });

      miniWin.on('closed', () => {
        miniWin = null;
      });

      if (win && !win.isDestroyed()) {
        win.hide();
      }
    }
  } else {
    if (miniWin && !miniWin.isDestroyed()) {
      miniWin.close();
    }
    if (win && !win.isDestroyed()) {
      win.show();
    }
  }

  return true;
});

ipcMain.removeHandler('watch-folder');
ipcMain.handle('watch-folder', async (event, folderPath) => {
  if (!folderPath || typeof folderPath !== 'string') return false;

  if (watchedFolders.has(folderPath)) return true;

  try {
    const watcher = fs.watch(folderPath, (eventType, filename) => {
      if (filename && /\.(mp3|wav|flac|m4a|ogg)$/i.test(filename)) {
        if (win && !win.isDestroyed()) {
          win.webContents.send('folder-updated', folderPath);
        }
      }
    });

    watchedFolders.set(folderPath, watcher);
    return true;
  } catch (e) {
    console.warn('[Main] Watch folder failed:', e.message);
    return false;
  }
});

ipcMain.removeHandler('select-local-folder');
ipcMain.handle('select-local-folder', async () => {
  if (!win || win.isDestroyed()) return null;

  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory']
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) return null;

  const folderPath = result.filePaths[0];
  const files = fs.readdirSync(folderPath);

  const audioFiles = files.filter((f) => /\.(mp3|wav|flac|m4a|ogg)$/i.test(f));
  const songs = audioFiles.map((filename) => {
    const filePath = path.join(folderPath, filename);
    return {
      id: `local-${crypto.createHash('md5').update(filePath).digest('hex')}`,
      title: filename.replace(/\.[^/.]+$/, ''),
      artist: 'Local File',
      album: path.basename(folderPath),
      coverUrl: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=600&h=600&auto=format&fit=crop',
      duration: 0,
      url: `local-audio://${encodeURIComponent(filePath)}`,
      source: 'local'
    };
  });

  return { path: folderPath, songs };
});

ipcMain.removeHandler('youtube-login');
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
  }).catch((err) => {
    console.warn('[Main] Login window failed to load:', err.message);
  });

  loginWin.webContents.session.setUserAgent(mobileUA);

  return new Promise((resolve) => {
    loginWin.webContents.on('did-navigate', async (event, url) => {
      if (url && url.includes('youtube.com') && !url.includes('accounts.google.com')) {
        const cookies = await loginWin.webContents.session.cookies.get({ domain: '.youtube.com' });
        const isLoggedIn = cookies.some((c) => c.name === 'SAPISID' || c.name === '__Secure-3PAPISID');
        if (isLoggedIn) {
          setTimeout(() => {
            try {
              loginWin.close();
            } catch (err) {
              // no-op
            }
            resolve({ success: true });
          }, 2000);
        }
      }
    });

    loginWin.on('closed', () => resolve({ success: false }));
  });
});

ipcMain.removeHandler('innertube-request');
ipcMain.handle('innertube-request', async (_, { endpoint, body }) => youtubeInnerTubeRequest(endpoint, body));

ipcMain.removeHandler('set-always-on-top');
ipcMain.handle('set-always-on-top', async (_, flag) => {
  if (win && !win.isDestroyed()) {
    win.setAlwaysOnTop(Boolean(flag));
    return true;
  }
  return false;
});

ipcMain.removeHandler('send-media-cmd');
ipcMain.handle('send-media-cmd', async (_, cmd) => {
  if (win && !win.isDestroyed()) {
    win.webContents.send('media-cmd', cmd);
  }
  return true;
});

ipcMain.removeHandler('reveal-in-explorer');
ipcMain.handle('reveal-in-explorer', async (_, filePath) => {
  if (!filePath) return false;
  shell.showItemInFolder(filePath);
  return true;
});

resolver.setInnerTubeRequester(youtubeInnerTubeRequest);

app.whenReady().then(async () => {
  try {
    protocol.handle('local-audio', (request) => {
      const rawPath = decodeURIComponent(request.url.replace('local-audio://', ''));
      return net.fetch('file://' + rawPath);
    });

    await startProxyServer();
    rpc.initRPC();
    createWindow();

    globalShortcut.register('MediaPlayPause', () => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('media-cmd', 'toggle');
      }
    });

    globalShortcut.register('MediaNextTrack', () => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('media-cmd', 'next');
      }
    });

    globalShortcut.register('MediaPreviousTrack', () => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('media-cmd', 'prev');
      }
    });
  } catch (error) {
    console.error('[Main] Startup failed:', error);
  }
});

app.on('before-quit', () => {
  cleanupWatchers();
  if (proxyServer) {
    proxyServer.close();
    proxyServer = null;
  }
  try {
    globalShortcut.unregisterAll();
  } catch (err) {
    // no-op
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
