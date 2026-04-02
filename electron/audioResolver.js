/**
 * audioResolver.js — Specialized for finding YouTube Video IDs.
 * Integrated with the High-Authority Sidecar architecture.
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');

let ipcInnerTubeRequest = null;

function setInnerTubeRequester(req) {
  ipcInnerTubeRequest = req;
}

// ─── UTILS ────────────────────────────────────────────────────────────────────

function fetchJSON(url, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, { method, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`Status ${res.statusCode}`));
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function extractVideoId(input) {
  if (!input) return null;
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|music\.youtube\.com\/(?:watch\?v=|v\/))([^"&?\/\s]{11})/;
  const m = input.match(regex);
  return (m && m[1]) ? m[1] : null;
}

function findVideoIdDeep(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.videoId) return obj.videoId;
  for (const key in obj) {
    const result = findVideoIdDeep(obj[key]);
    if (result) return result;
  }
  return null;
}

// ─── SEARCH ───────────────────────────────────────────────────────────────────

async function searchYouTube(query) {
  if (!ipcInnerTubeRequest) return null;
  try {
    const data = await ipcInnerTubeRequest('search', { query });
    return findVideoIdDeep(data);
  } catch (e) {
    return null;
  }
}

async function resolveMetadataFromSonglink(song) {
  const inputUrl = song.url && song.url.includes('apple.com') ? song.url : `https://music.apple.com/in/album/${song.id}`;
  const slUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(inputUrl)}&userCountry=IN`;

  try {
    const data = await fetchJSON(slUrl);
    return extractVideoId(data.linksByPlatform?.youtube?.url || data.linksByPlatform?.youtubeMusic?.url || '');
  } catch (e) {
    return null;
  }
}

// ─── MAIN INTERFACE ───────────────────────────────────────────────────────────

async function resolveAudio(song) {
  // 1. Try Metadata match (High precision)
  let videoId = await resolveMetadataFromSonglink(song);

  // 2. Try Search match (Fallback)
  if (!videoId) {
    videoId = await searchYouTube(`${song.title} ${song.artist}`);
  }

  if (videoId) {
    song.videoId = videoId;
    return videoId;
  }

  return null;
}

async function searchMusic(query, limit = 25) {
  try {
    const data = await fetchJSON(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=${limit}&country=IN`);
    return data.results.map(item => ({
      id: String(item.trackId),
      title: item.trackName,
      artist: item.artistName,
      album: item.collectionName || 'Single',
      coverUrl: item.artworkUrl100?.replace('100x100bb', '600x600bb') || '',
      duration: (item.trackTimeMillis || 0) / 1000,
      url: item.trackViewUrl,
      source: 'itunes',
    }));
  } catch (e) {
    return [];
  }
}

async function getLyrics(artist, title) {
  try {
    const data = await fetchJSON(`https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`);
    if (data.syncedLyrics) {
      const re = /\[(\d+):(\d+(\.\d+)?)\](.*)/;
      return data.syncedLyrics.split('\n').filter(l => re.test(l)).map(l => {
        const m = re.exec(l);
        return { time: parseInt(m[1]) * 60 + parseFloat(m[2]), text: m[4].trim() };
      }).sort((a, b) => a.time - b.time);
    }
  } catch { }
  return [];
}

async function getSuggestions(currentSong) {
  const results = await searchMusic(`${currentSong.artist} popular songs`, 10);
  // Filter out current song by title matching (since IDs might differ between sources)
  return results.filter(s => 
    s.title.toLowerCase() !== currentSong.title.toLowerCase()
  ).slice(0, 4);
}

async function getTrending() {
  return searchMusic('Top Hits 2025', 12);
}

async function getPublicPlaylists() {
  return [
    { id: 'top-50', name: 'Global Top 50', songs: await searchMusic('Top 50 Global', 10) },
    { id: 'hits', name: 'Hot Hits', songs: await searchMusic('Hot Hits', 10) }
  ];
}

async function getVibeShiftSuggestions(likedSongs, apiKey) {
  if (!likedSongs || likedSongs.length === 0) return searchMusic('Trending Hits', 8);

  const ctx = likedSongs.slice(0, 10).map(s => `"${s.title}" by ${s.artist}`).join(', ');

  const models = ["gemini-2.5-flash", "gemini-3.0-flash-preview", "gemini-3.1-flash-preview", "gemini-2.0-flash"];

  for (const model of models) {
    try {
      const itf = await fetchJSON(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`, 'POST', JSON.stringify({
        contents: [{ parts: [{ text: `Based on these liked songs: ${ctx}, recommend 8 new unique songs that fit the same mood/genre. Return ONLY a JSON array: [{"title": "...", "artist": "..."}]. DO NOT include any text before or after the JSON.` }] }],
        generationConfig: { responseMimeType: "application/json" }
      }));

      if (!itf || !itf.candidates || !itf.candidates[0].content.parts[0].text) {
        continue;
      }

      let text = itf.candidates[0].content.parts[0].text;
      // Clean potential markdown formatting
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();

      const recs = JSON.parse(text);

      const results = [];
      for (const r of recs.slice(0, 8)) {
        const found = await searchMusic(`${r.title} ${r.artist}`, 1);
        if (found.length > 0) results.push(found[0]);
      }
      return results;
    } catch (e) {
    }
  }

  return searchMusic('Popular Global Hits', 8);
}

module.exports = {
  searchMusic, resolveAudio, getLyrics, getSuggestions, getTrending, getPublicPlaylists, setInnerTubeRequester, getVibeShiftSuggestions
};
