const { contextBridge, ipcRenderer } = require('electron');

function safeInvoke(channel, ...args) {
  try {
    return ipcRenderer.invoke(channel, ...args);
  } catch (error) {
    console.warn(`[Preload] IPC call failed: ${channel}`, error);
    return Promise.reject(error);
  }
}

contextBridge.exposeInMainWorld('electronAPI', {
  searchMusic: (query, limit) => safeInvoke('search-music', { query, limit }),
  resolveAudio: (song, forceBackup) => safeInvoke('resolve-audio', { song, forceBackup }),
  getLyrics: (artist, title) => safeInvoke('get-lyrics', { artist, title }),
  getSuggestions: (currentSong) => safeInvoke('get-suggestions', { currentSong }),
  getTrending: () => safeInvoke('get-trending'),
  getPublicPlaylists: () => safeInvoke('get-playlists'),
  youtubeLogin: () => safeInvoke('youtube-login'),

  getVibeShiftSuggestions: ({ likedSongs, apiKey }) => safeInvoke('get-vibe-shift-suggestions', { likedSongs, apiKey }),
  selectLocalFolder: () => safeInvoke('select-local-folder'),

  sidecarPlay: (videoId) => safeInvoke('sidecar-play-id', videoId),
  sidecarCmd: (cmd) => safeInvoke('sidecar-cmd', cmd),

  onSidecarState: (callback) => {
    const handler = (event, state) => callback(state);
    ipcRenderer.on('sidecar-state-changed', handler);
    return () => ipcRenderer.removeListener('sidecar-state-changed', handler);
  },

  openExternal: (url) => safeInvoke('open-external', url),
  sendMediaCmd: (cmd) => safeInvoke('send-media-cmd', cmd),

  onMediaCmd: (callback) => {
    const handler = (event, cmd) => callback(cmd);
    ipcRenderer.on('media-cmd', handler);
    return () => ipcRenderer.removeListener('media-cmd', handler);
  },

  setAlwaysOnTop: (flag) => safeInvoke('set-always-on-top', flag),
  revealInExplorer: (path) => safeInvoke('reveal-in-explorer', path),
  updateDiscordRPC: (song, isPlaying) => safeInvoke('update-discord-rpc', { song, isPlaying }),
  toggleMiniPlayer: (enabled) => safeInvoke('toggle-mini-player', { enabled }),
  getPlaybackState: () => safeInvoke('get-playback-state'),
  onPlaybackStateSync: (callback) => {
    const handler = (event, state) => callback(state);
    ipcRenderer.on('playback-state-sync', handler);
    return () => ipcRenderer.removeListener('playback-state-sync', handler);
  },

  watchFolder: (path) => safeInvoke('watch-folder', path),
  onFolderUpdated: (callback) => {
    const handler = (event, path) => callback(path);
    ipcRenderer.on('folder-updated', handler);
    return () => ipcRenderer.removeListener('folder-updated', handler);
  }
});
