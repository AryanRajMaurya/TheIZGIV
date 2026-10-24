export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  duration: number;
  url?: string;
  source: 'youtube' | 'local' | 'mock' | 'spotify' | 'itunes' | 'unknown';
}

export interface Playlist {
  id: string;
  name: string;
  songs: Song[];
  isSystem?: boolean;
}

export interface LyricsLine {
  time: number;
  text: string;
}

export interface PlayerState {
  currentSong: Song | null;
  isPlaying: boolean;
  queue: Song[];
  volume: number;
  currentTime: number;
  duration: number;
  shuffled: boolean;
  repeat: 'off' | 'all' | 'one';
  playbackRate: number;
  preservesPitch: boolean;
}

export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
}

export type View = 'home' | 'search' | 'library' | 'player' | 'settings' | 'about';
