import { GoogleGenAI, Type } from '@google/genai';
import { Song, LyricsLine, Playlist } from '../types';

const isElectron = () => typeof window !== 'undefined' && !!(window as any).electronAPI;
const eAPI = () => (window as any).electronAPI;

const getRuntimeApiKey = () => {
  const candidates = [
    typeof process !== 'undefined' ? process.env?.API_KEY : undefined,
    typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : undefined,
    typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_GEMINI_API_KEY : undefined,
    typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_API_KEY : undefined,
    typeof window !== 'undefined' ? (window as any).__GEMINI_API_KEY__ : undefined,
  ];

  return candidates.find((value) => typeof value === 'string' && value.trim().length > 0) || '';
};

const PIPED_MIRRORS = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.moe',
  'https://pipedapi.adminforge.de',
  'https://api.piped.play.rocks'
];

const PROXY_MIRRORS = [
  (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`
];

const extractVideoId = (input: string): string | null => {
  if (!input) return null;
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|music\.youtube\.com\/watch\?v=)([^"&?\/\s]{11})/;
  const match = input.match(regex);
  return match && match[1] ? match[1] : null;
};

const parseLRC = (lrc: string): LyricsLine[] => {
  if (!lrc) return [];
  const lines = lrc.split('\n');
  const result: LyricsLine[] = [];
  const timeRegex = /\[(\d+):(\d+(\.\d+)?)\](.*)/;

  lines.forEach((line) => {
    const match = timeRegex.exec(line);
    if (match) {
      result.push({
        time: parseInt(match[1], 10) * 60 + parseFloat(match[2]),
        text: match[4].trim()
      });
    }
  });

  return result.sort((a, b) => a.time - b.time);
};

const getMetadataViaSonglink = async (itunesId: string): Promise<{ videoId: string | null; spotifyUrl: string | null }> => {
  const targetUrl = `https://api.song.link/v1-alpha.1/links?platform=itunes&type=song&id=${itunesId}&userCountry=IN`;

  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(targetUrl);
      if (res.ok) {
        const data = await res.json();
        return {
          videoId: extractVideoId(data.linksByPlatform?.youtube?.url || data.linksByPlatform?.youtubeMusic?.url || ''),
          spotifyUrl: data.linksByPlatform?.spotify?.url || null
        };
      }
    } catch (err) {
      // try next fallback
    }
  }

  for (const proxyGen of PROXY_MIRRORS) {
    try {
      const res = await fetch(proxyGen(targetUrl));
      if (!res.ok) continue;

      const data = await res.json();
      const body = data.contents ? JSON.parse(data.contents) : data;

      return {
        videoId: extractVideoId(body.linksByPlatform?.youtube?.url || body.linksByPlatform?.youtubeMusic?.url || ''),
        spotifyUrl: body.linksByPlatform?.spotify?.url || null
      };
    } catch (err) {
      // try next fallback
    }
  }

  return { videoId: null, spotifyUrl: null };
};

const getStreamFromZakeSpotify = async (spotifyUrl: string): Promise<string | null> => {
  try {
    const res = await fetch(`https://spotifydl.the-zake.workers.dev/?url=${encodeURIComponent(spotifyUrl)}`);
    const json = await res.json();
    const medias = json.data?.medias || json.medias;
    return Array.isArray(medias) && medias.length > 0 ? medias[0].url : (json.data?.url || json.url);
  } catch (err) {
    return null;
  }
};

const getStreamFromPiped = async (videoId: string): Promise<string | null> => {
  const mirrors = [...PIPED_MIRRORS].sort(() => 0.5 - Math.random()).slice(0, 2);

  for (const baseUrl of mirrors) {
    try {
      const res = await fetch(`${baseUrl}/streams/${videoId}`);
      const data = await res.json();
      const stream = data.audioStreams?.find((s: any) => s.url && !s.url.includes('googlevideo.com')) || data.audioStreams?.[0];
      if (stream?.url) return stream.url;
    } catch (err) {
      // no-op
    }
  }
  return null;
};

export const searchMusic = async (query: string, limit = 25): Promise<Song[]> => {
  if (isElectron()) {
    try {
      return await eAPI().searchMusic(query, limit);
    } catch (err) {
      console.warn('[Electron] searchMusic IPC failed, falling back:', err);
    }
  }

  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=${limit}&country=IN`);
    const data = await res.json();

    if (!data || !Array.isArray(data.results)) return [];

    return data.results.map((item: any) => ({
      id: String(item.trackId),
      title: item.trackName,
      artist: item.artistName,
      album: item.collectionName || 'Single',
      coverUrl: item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb', '600x600bb') : '',
      duration: (item.trackTimeMillis || 0) / 1000,
      source: 'itunes' as const,
    }));
  } catch (err) {
    return [];
  }
};

export const resolveAudioUrl = async (song: Song, forceBackup = false): Promise<string> => {
  if (song.url && !forceBackup && (song.url.includes('127.0.0.1') || song.url.includes('googlevideo.com'))) {
    return song.url;
  }

  if (isElectron()) {
    try {
      const videoId = await eAPI().resolveAudio(song);
      if (videoId) {
        (song as any).videoId = videoId;
        return `sidecar://${videoId}`;
      }
    } catch (err) {
      console.warn('[Electron] resolveAudio IPC failed, falling back:', err);
    }
  }

  const meta = await getMetadataViaSonglink(song.id);

  if (meta.spotifyUrl) {
    const spotifyStream = await getStreamFromZakeSpotify(meta.spotifyUrl);
    if (spotifyStream) {
      song.url = spotifyStream;
      return spotifyStream;
    }
  }

  if (meta.videoId) {
    const pipedStream = await getStreamFromPiped(meta.videoId);
    if (pipedStream) {
      song.url = pipedStream;
      return pipedStream;
    }
  }

  const searchResults = await searchMusic(`${song.title} ${song.artist}`, 1);
  if (searchResults.length > 0 && searchResults[0].id !== song.id) {
    return resolveAudioUrl(searchResults[0]);
  }

  return '';
};

export const getLyrics = async (artist: string, title: string): Promise<LyricsLine[]> => {
  if (isElectron()) {
    try {
      return await eAPI().getLyrics(artist, title);
    } catch (err) {
      // fallback below
    }
  }

  try {
    const res = await fetch(`https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.syncedLyrics) return parseLRC(data.syncedLyrics);
    }
  } catch (err) {
    // fallback below
  }

  return [];
};

export const selectLocalFolder = async (): Promise<{ path: string; songs: Song[] } | null> => {
  if (isElectron()) {
    try {
      return await eAPI().selectLocalFolder();
    } catch (err) {
      // fallback below
    }
  }

  return null;
};

export const getSuggestions = async (currentSong: Song): Promise<Song[]> => {
  if (isElectron()) {
    try {
      return await eAPI().getSuggestions(currentSong);
    } catch (err) {
      // fallback below
    }
  }

  const apiKey = getRuntimeApiKey();

  if (!apiKey) {
    return [];
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Recommend exactly 4 trending Indian songs similar in vibe to "${currentSong.title}" by "${currentSong.artist}". Return as JSON array: [{"title": "...", "artist": "..."}]`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              artist: { type: Type.STRING }
            },
            required: ['title', 'artist']
          }
        }
      }
    });

    const raw = response.text || '[]';
    const recommendations = JSON.parse(raw).slice(0, 4);

    const resolvedSongs: Song[] = [];

    for (const rec of recommendations) {
      const found = await searchMusic(`${rec.title} ${rec.artist}`, 1);
      if (found.length > 0) resolvedSongs.push(found[0]);
    }

    return resolvedSongs;
  } catch (err) {
    return [];
  }
};

export const getVibeShiftSuggestions = async (likedSongs: Song[], apiKey?: string): Promise<Song[]> => {
  if (isElectron()) {
    try {
      return await eAPI().getVibeShiftSuggestions({ likedSongs, apiKey });
    } catch (err) {
      // fallback below
    }
  }

  const safeKey = apiKey || getRuntimeApiKey();

  if (!safeKey) {
    return [];
  }

  try {
    const ai = new GoogleGenAI({ apiKey: safeKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Based on these liked songs: ${likedSongs.slice(0, 10).map((song) => `"${song.title}" by ${song.artist}`).join(', ')}, recommend 8 new songs that fit the same mood. Return ONLY a JSON array: [{"title": "...", "artist": "..."}]`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              artist: { type: Type.STRING }
            },
            required: ['title', 'artist']
          }
        }
      }
    });

    const raw = response.text || '[]';
    const recommendations = JSON.parse(raw);

    const results: Song[] = [];
    for (const rec of recommendations.slice(0, 8)) {
      const found = await searchMusic(`${rec.title} ${rec.artist}`, 1);
      if (found.length > 0) results.push(found[0]);
    }

    return results;
  } catch (err) {
    return [];
  }
};

export const getTrending = async (): Promise<Song[]> => {
  if (isElectron()) {
    try {
      return await eAPI().getTrending();
    } catch (err) {
      // fallback below
    }
  }

  return searchMusic('Latest Trending Hits', 12);
};

export const getPublicPlaylists = async (): Promise<Playlist[]> => {
  if (isElectron()) {
    try {
      return await eAPI().getPublicPlaylists();
    } catch (err) {
      // fallback below
    }
  }

  const categories = [
    { name: 'Global Top 50', query: 'Top Hits 2024' },
    { name: 'Viral Hits', query: 'Viral 50 India' },
    { name: 'Chill Vibes', query: 'Lofi Beats Chill' },
    { name: 'Bollywood Romance', query: 'Arijit Singh Hits' },
    { name: 'Party Anthems', query: 'Punjabi Party' },
  ];

  const playlists: Playlist[] = [];

  for (const cat of categories) {
    const tracks = await searchMusic(cat.query, 10);
    if (tracks.length > 0) {
      playlists.push({
        id: cat.name.toLowerCase().replace(/\s/g, '-'),
        name: cat.name,
        songs: tracks,
      });
    }
  }

  return playlists;
};
