/**
 * preload.js — Runs in renderer context but has access to Node.js ipcRenderer.
 * Uses contextBridge to safely expose APIs to the React app (window.electronAPI).
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  searchMusic: (query, limit) => ipcRenderer.invoke('search-music', { query, limit }),
  resolveAudio: (song, forceBackup) => ipcRenderer.invoke('resolve-audio', { song, forceBackup }),
  getLyrics: (artist, title) => ipcRenderer.invoke('get-lyrics', { artist, title }),
  getSuggestions: (currentSong) => ipcRenderer.invoke('get-suggestions', { currentSong }),
  getTrending: () => ipcRenderer.invoke('get-trending'),
  getPublicPlaylists: () => ipcRenderer.invoke('get-playlists'),
  youtubeLogin: () => ipcRenderer.invoke('youtube-login'),
  
  // New Features
  getVibeShiftSuggestions: ({ likedSongs, apiKey }) => ipcRenderer.invoke('get-vibe-shift-suggestions', { likedSongs, apiKey }),
  selectLocalFolder: () => ipcRenderer.invoke('select-local-folder'),
  
  // High-Authority Sidecar Controls
  sidecarPlay: (videoId) => ipcRenderer.invoke('sidecar-play-id', videoId),
  sidecarCmd: (cmd) => ipcRenderer.invoke('sidecar-cmd', cmd),
  onSidecarState: (callback) => {
    const handler = (event, state) => callback(state);
    ipcRenderer.on('sidecar-state-changed', handler);
    return () => ipcRenderer.removeListener('sidecar-state-changed', handler);
  },
  
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  sendMediaCmd: (cmd) => ipcRenderer.invoke('send-media-cmd', cmd),
  onMediaCmd: (callback) => {
    const handler = (event, cmd) => callback(cmd);
    ipcRenderer.on('media-cmd', handler);
    return () => ipcRenderer.removeListener('media-cmd', handler);
  },
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('set-always-on-top', flag),
  revealInExplorer: (path) => ipcRenderer.invoke('reveal-in-explorer', path),
  updateDiscordRPC: (song, isPlaying) => ipcRenderer.invoke('update-discord-rpc', { song, isPlaying }),
  toggleMiniPlayer: (enabled) => ipcRenderer.invoke('toggle-mini-player', { enabled }),
  getPlaybackState: () => ipcRenderer.invoke('get-playback-state'),
  onPlaybackStateSync: (callback) => {
    const handler = (event, state) => callback(state);
    ipcRenderer.on('playback-state-sync', handler);
    return () => ipcRenderer.removeListener('playback-state-sync', handler);
  },
  watchFolder: (path) => ipcRenderer.invoke('watch-folder', path),
  onFolderUpdated: (callback) => {
    const handler = (event, path) => callback(path);
    ipcRenderer.on('folder-updated', handler);
    return () => ipcRenderer.removeListener('folder-updated', handler);
  }
});
