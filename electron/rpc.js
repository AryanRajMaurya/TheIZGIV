const { Client } = require('discord-rpc');

const clientId = '1489377431772070139'; 
let rpc = null;
let isReady = false;

function initRPC() {
  if (rpc) return;

  try {
    rpc = new Client({ transport: 'ipc' });

    rpc.on('ready', () => {
      isReady = true;
      // Set an initial "Idle" status so user knows it's working
      updatePresence(null, false);
    });

    rpc.on('disconnected', () => {
      isReady = false;
      rpc = null;
      setTimeout(initRPC, 15000);
    });

    rpc.on('error', (err) => {
      // Quietly handle RPC errors
    });

    rpc.login({ clientId }).catch(err => {
      isReady = false;
      rpc = null;
      // Try again in 30s
      setTimeout(initRPC, 30000);
    });
  } catch (err) {
      // Fail silently
  }
}

function updatePresence(song, isPlaying) {
  if (!rpc || !isReady) return;

  try {
    const activity = {
      instance: false,
      largeImageKey: 'icon', 
      largeImageText: 'IZGIV Music Player',
    };

    if (isPlaying && song) {
      activity.details = song.title;
      activity.state = `by ${song.artist}`;
      activity.startTimestamp = Math.floor(Date.now() / 1000);
      // Use cover URL if available, fallback to icon
      if (song.coverUrl && song.coverUrl.startsWith('http')) {
        activity.largeImageKey = song.coverUrl;
      }
      activity.buttons = [
        { label: 'Check IZGIV', url: 'https://izgiv.tech' }
      ];
    } else {
      activity.details = 'Browsing Music';
      activity.state = 'Finding the next vibe...';
    }

    rpc.setActivity(activity).catch(err => {
        // Silent fail for activity updates to prevent spam
    });
  } catch (err) {
    console.error('[Discord] ❌ setActivity error:', err);
  }
}

module.exports = { initRPC, updatePresence };
