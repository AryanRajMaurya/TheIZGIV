// Added React import to top level to fix "Cannot find namespace 'React'" errors throughout the file
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Play, Pause, SkipForward, SkipBack, Search, Home, Library, Heart, ListMusic, Volume2, Mic2, Sparkles, Repeat, Shuffle, Loader2, Settings2, List, X, ChevronDown, Trash2, ArrowUp, Plus, ChevronRight, User, Settings, MessageSquare, LayoutGrid, Palette, Info, Menu, Image as ImageIcon, Github, Instagram, Globe, Music, MessageCircle, Bot, Zap, Cpu, Mail, ShieldAlert, Monitor, Terminal, Camera, Layers, ScrollText, Radio, Maximize2, Minimize2, Gauge, Activity, Folder, Share2, Copy, Timer, Pin, Droplets, Waves, Coffee, Trees, Hash, Crown, CloudLightning, Flame, Wind } from 'lucide-react';
import { GlassCard, GlassButton, GlassInput } from './components/GlassUI';
import { usePlayer } from './hooks/usePlayer';
import { getColorsFromCover } from './utils/colors';
import { getSuggestions, searchMusic, getLyrics, getTrending, getPublicPlaylists, selectLocalFolder, getVibeShiftSuggestions } from './services/api';
import { Song, View, LyricsLine, Playlist } from './types';
import { Equalizer } from './components/Equalizer';
import { Visualizer } from './components/Visualizer';

// --- Components defined inline for file efficiency ---

const SidebarItem = ({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-5 py-3 rounded-[24px] transition-all duration-300 group relative border border-transparent ${active ? 'bg-white/10 text-white border-white/5 shadow-xl' : 'text-white/40 hover:text-white/70 hover:bg-white/5 hover:border-white/5'}`}
  >
    <div className={`transition-transform duration-300 ${active ? 'scale-110' : 'group-hover:scale-110'}`}>{icon}</div>
    <span className="font-bold text-xs tracking-tight">{label}</span>
    {active && <div className="absolute right-4 w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_10px_#fff]" />}
  </button>
);

interface NavBarProps {
  currentView: View;
  setView: (v: View) => void;
  accent: string;
  showLyrics: boolean;
  onToggleLyrics: () => void;
  showAudioControls: boolean;
  onToggleAudioControls: () => void;
}

const NavBar: React.FC<NavBarProps> = ({ 
  currentView, 
  setView, 
  accent, 
  showLyrics, 
  onToggleLyrics,
  showAudioControls,
  onToggleAudioControls
}) => {
  const handleLyricsClick = () => {
    if (currentView !== 'player') setView('player');
    onToggleLyrics();
  };


  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-black/80 backdrop-blur-3xl border border-white/10 rounded-full p-2 flex gap-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
        <GlassButton active={currentView === 'home'} onClick={() => setView('home')} accent={accent}><Home size={20} /></GlassButton>
        <GlassButton active={currentView === 'search'} onClick={() => setView('search')} accent={accent}><Search size={20} /></GlassButton>
        <GlassButton active={currentView === 'library'} onClick={() => setView('library')} accent={accent}><Library size={20} /></GlassButton>
        <div className="w-[1px] h-8 bg-white/10 my-auto mx-1" />
        <GlassButton 
          active={currentView === 'player' && showLyrics} 
          onClick={handleLyricsClick} 
          accent={accent} 
          className="w-12 h-12"
          title="Lyrics"
        >
          <Mic2 size={20} />
        </GlassButton>
      </div>
    </div>
  );
};

interface SongRowProps {
  song: Song;
  onClick: () => void;
  onAddQueue: (song: Song) => void;
  onOpenPlaylistSelector: (song: Song) => void;
  isPlaying?: boolean;
  likedSongs: Song[];
  toggleLike: (song: Song) => void;
}

const SongRow: React.FC<SongRowProps> = ({ song, onClick, onAddQueue, onOpenPlaylistSelector, isPlaying, likedSongs, toggleLike }) => (
  <div 
    className="group flex items-center gap-4 p-3 rounded-2xl hover:bg-white/10 transition-all duration-300 cursor-pointer border border-transparent hover:border-white/5"
    onClick={onClick}
  >
    <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 shadow-md">
      <img src={song.coverUrl} alt={song.title} className="w-full h-full object-cover" />
      {isPlaying && (
        <div className="absolute inset-0 bg-black/50 flex items-end justify-center pb-2 gap-[2px]">
          <div className="wave-bar h-4" style={{ backgroundColor: 'currentColor' }}></div>
          <div className="wave-bar h-5" style={{ backgroundColor: 'currentColor' }}></div>
          <div className="wave-bar h-3" style={{ backgroundColor: 'currentColor' }}></div>
          <div className="wave-bar h-4" style={{ backgroundColor: 'currentColor' }}></div>
        </div>
      )}
    </div>
    <div className="flex-1 min-w-0">
      <h3 className={`font-semibold truncate ${isPlaying ? 'text-green-300' : 'text-white'}`}>{song.title}</h3>
      <p className="text-sm text-white/50 truncate">{song.artist}</p>
    </div>
    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button 
        onClick={(e) => { e.stopPropagation(); toggleLike(song); }}
        className={`p-2.5 bg-white/5 hover:bg-white/20 rounded-full transition-all ${likedSongs.some(s => s.id === song.id) ? 'text-red-500' : 'text-white/80 hover:text-white'}`}
        title={likedSongs.some(s => s.id === song.id) ? "Unlike" : "Like"}
      >
        <Heart size={16} fill={likedSongs.some(s => s.id === song.id) ? "currentColor" : "none"} />
      </button>
      <button 
        onClick={(e) => { e.stopPropagation(); onAddQueue(song); }}
        className="p-2.5 bg-white/5 hover:bg-white/20 rounded-full transition-all text-white/80 hover:text-white"
        title="Add to queue"
      >
        <Plus size={16} />
      </button>
      <button 
        onClick={(e) => { e.stopPropagation(); onOpenPlaylistSelector(song); }}
        className="p-2.5 bg-white/5 hover:bg-white/20 rounded-full transition-all text-white/80 hover:text-white"
        title="Add to playlist"
      >
        <ListMusic size={16} />
      </button>
      {song.source === 'local' && (
        <button 
          onClick={(e) => { e.stopPropagation(); if ((window as any).electronAPI?.revealInExplorer) (window as any).electronAPI.revealInExplorer(song.id); }}
          className="p-2.5 bg-white/5 hover:bg-white/20 rounded-full transition-all text-white/80 hover:text-white"
          title="Reveal in Explorer"
        >
          <Folder size={16} />
        </button>
      )}
      {song.source === 'youtube' && (
        <button 
          onClick={(e) => { 
            e.stopPropagation(); 
            const url = `https://music.youtube.com/watch?v=${song.id}`;
            navigator.clipboard.writeText(url);
          }}
          className="p-2.5 bg-white/5 hover:bg-white/20 rounded-full transition-all text-white/80 hover:text-white"
          title="Copy Link"
        >
          <Copy size={16} />
        </button>
      )}
    </div>
  </div>
);

// --- Queue Overlay ---
interface QueueProps {
  queue: Song[];
  currentSong: Song | null;
  onClose: () => void;
  onRemove: (index: number) => void;
  onMoveUp: (index: number) => void;
  onClear: () => void;
  onPlay: (song: Song) => void;
  primary: string;
  autoPlay: boolean;
}

const QueueOverlay: React.FC<QueueProps> = ({ queue, currentSong, onClose, onRemove, onMoveUp, onClear, onPlay, primary, autoPlay }) => (
  <div className="absolute inset-0 z-[60] bg-black/90 backdrop-blur-3xl animate-in slide-in-from-bottom-full duration-700 flex flex-col">
    <div className="p-6 flex items-center justify-between border-b border-white/10" style={{ borderColor: `${primary}33` }}>
      <div className="flex flex-col">
        <h2 className="text-xl font-bold text-white">Queue</h2>
        {autoPlay && <span className="text-[9px] font-black uppercase tracking-[0.2em] text-green-400 mt-1 animate-pulse">✨ Radio Mode Active</span>}
      </div>
      <div className="flex gap-2">
        {queue.length > 0 && (
          <button onClick={onClear} className="text-xs font-bold text-red-400 px-3 py-2 rounded-full hover:bg-red-400/10 transition-colors uppercase tracking-widest">
            Clear
          </button>
        )}
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <X size={24} />
        </button>
      </div>
    </div>
    <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
      {currentSong && (
        <div>
          <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3">Now Playing</h3>
          <div className="flex items-center gap-4 p-4 rounded-3xl border transition-all duration-500" style={{ backgroundColor: `${primary}22`, borderColor: `${primary}44` }}>
             <img src={currentSong.coverUrl} className="w-14 h-14 rounded-xl shadow-lg" />
             <div className="flex-1 min-w-0">
               <div className="font-bold text-white truncate">{currentSong.title}</div>
               <div className="text-sm text-white/60 truncate">{currentSong.artist}</div>
             </div>
             <div className="w-3 h-3 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)] bg-green-400" />
          </div>
        </div>
      )}

      <div>
        <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3">Next Up</h3>
        <div className="space-y-2">
          {queue.length === 0 ? (
            <div className="text-white/30 italic text-center py-10">Queue is empty</div>
          ) : (
            queue.map((song, idx) => (
              <div key={`${song.id}-${idx}`} className="group flex items-center gap-4 p-3 rounded-2xl hover:bg-white/5 transition-colors">
                <div className="text-white/20 text-sm font-mono w-6 text-center">{idx + 1}</div>
                <img src={song.coverUrl} className="w-11 h-11 rounded-xl opacity-80 group-hover:opacity-100 shrink-0 transition-all shadow-md" />
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { onPlay(song); onClose(); }}>
                  <div className="font-medium truncate text-white/90 group-hover:text-white transition-colors">{song.title}</div>
                  <div className="text-xs text-white/50 truncate">{song.artist}</div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  {idx > 0 && (
                    <button onClick={() => onMoveUp(idx)} className="p-2 hover:bg-white/10 hover:text-green-400 rounded-lg" title="Move Up">
                      <ArrowUp size={16} />
                    </button>
                  )}
                  <button onClick={() => onRemove(idx)} className="p-2 hover:bg-white/10 hover:text-red-400 rounded-lg" title="Remove">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  </div>
);

// --- Main App ---

export default function App() {
  const [autoPlay, setAutoPlay] = useState(true);
  const { 
    state, playSong, togglePlay, nextSong, prevSong, seek, 
    addToQueue, removeFromQueue, reorderQueue, clearQueue, 
    setPlaybackRate, setPreservesPitch, isTransitioning, isLoading: isPlayerLoading,
    setIsDragging, setVolume, eqGains, updateEqGain, analyser, audioContext, syncState
  } = usePlayer(autoPlay);
  
  const [view, setView] = useState<View>('home');
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
       const saved = localStorage.getItem('izgiv_theme');
       return saved ? JSON.parse(saved) : { name: 'Obsidian Indigo', primary: '#4f46e5', secondary: '#818cf8', accent: '#c7d2fe' };
    }
    return { name: 'Obsidian Indigo', primary: '#4f46e5', secondary: '#818cf8', accent: '#c7d2fe' };
  });

  const [ambientVolumes, setAmbientVolumes] = useState<Record<string, number>>({
    rain: 0,
    waves: 0,
    fireplace: 0,
    forest: 0,
    thunder: 0,
    wind: 0
  });
  const [isAmbientMode, setIsAmbientMode] = useState(false);
  const isAudioUnlocked = useRef(false);
  const ambientAudiosRef = useRef<Record<string, HTMLAudioElement>>({});

  useEffect(() => {
    const sounds = [
      { id: 'rain', url: 'https://raw.githubusercontent.com/Muges/ambientsounds/master/heavy-rain.ogg' },
      { id: 'waves', url: 'https://raw.githubusercontent.com/Muges/ambientsounds/master/stream.ogg' },
      { id: 'fireplace', url: 'https://raw.githubusercontent.com/Muges/ambientsounds/master/fireplace.ogg' },
      { id: 'forest', url: 'https://raw.githubusercontent.com/Muges/ambientsounds/master/forest-rain.ogg' },
      { id: 'thunder', url: 'https://raw.githubusercontent.com/Muges/ambientsounds/master/thunderstorm.ogg' },
      { id: 'wind', url: 'https://raw.githubusercontent.com/Muges/ambientsounds/master/wind.ogg' }
    ];
    
    // Note: Replaced Pixabay URLs with SoundHelix placeholders to verify if CORS was the issue. 
    // Usually local assets or dedicated CDNs work best in Electron.

    sounds.forEach(s => {
      const audio = new Audio(s.url);
      audio.loop = true;
      audio.volume = 0;
      audio.preload = 'auto';
      audio.crossOrigin = 'anonymous';
      ambientAudiosRef.current[s.id] = audio;
    });

    return () => {
      Object.values(ambientAudiosRef.current).forEach((a: any) => {
        if (a && typeof a.pause === 'function') a.pause();
      });
    };
  }, []);

  const unlockAudio = useCallback(() => {
    if (isAudioUnlocked.current) return;
    Object.values(ambientAudiosRef.current).forEach((audio: any) => {
      audio.play().then(() => {
        audio.pause();
      }).catch(() => {});
    });
    isAudioUnlocked.current = true;
  }, []);

  const updateAmbientVolume = (id: string, vol: number) => {
    setAmbientVolumes(prev => ({ ...prev, [id]: vol }));
    const audio = ambientAudiosRef.current[id];
    if (audio) {
      audio.volume = vol;
      if (vol > 0 && audio.paused) {
        audio.play().catch(err => {
          console.warn(`[Ambient] Re-activation required for ${id}. Error: ${err.message}`);
          // Attempt to resume AudioContext if it exists (for EQ)
          if (audioContext?.state === 'suspended') audioContext.resume();
        });
      } else if (vol === 0 && !audio.paused) {
        audio.pause();
      }
    }
  };

  const toggleAmbientMode = (enabled: boolean) => {
    setIsAmbientMode(enabled);
    if (enabled && state.isPlaying) {
      togglePlay();
    }
  };

  useEffect(() => {
    localStorage.setItem('izgiv_theme', JSON.stringify(theme));
  }, [theme]);

  const [lyrics, setLyrics] = useState<LyricsLine[]>([]);
  const [suggestions, setSuggestions] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [localPlaylists, setLocalPlaylists] = useState<Playlist[]>([]);
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [isPlaylistsLoading, setIsPlaylistsLoading] = useState(false);
  const [isMini, setIsMini] = useState(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('view') === 'mini';
    }
    return false;
  });

  // Sync state for Mini-Player
  useEffect(() => {
    if (isMini && (window as any).electronAPI) {
      (window as any).electronAPI.getPlaybackState().then((s: any) => {
        if (s.song) {
          syncState({ currentSong: s.song, isPlaying: s.isPlaying });
        }
      });

      const removeListener = (window as any).electronAPI.onPlaybackStateSync((newState: any) => {
          syncState({ currentSong: newState.song, isPlaying: newState.isPlaying });
      });
      return () => removeListener();
    }
  }, [isMini, syncState]);
  
  // Sleep Timer State
  const [sleepTimer, setSleepTimer] = useState<{ active: boolean, timeLeft: number | null }>({ active: false, timeLeft: null });
  const sleepTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (sleepTimer.active && sleepTimer.timeLeft !== null) {
      if (sleepTimer.timeLeft <= 0) {
        if (state.isPlaying) togglePlay();
        setSleepTimer({ active: false, timeLeft: null });
        setVolume(1.0); // Reset volume for next time
        return;
      }

      // Smart Fade: If less than 5 minutes left, gradually lower volume
      if (sleepTimer.timeLeft <= 300) {
        const targetVolume = sleepTimer.timeLeft / 300;
        setVolume(targetVolume);
      }

      sleepTimerRef.current = setTimeout(() => {
        setSleepTimer(prev => ({ ...prev, timeLeft: prev.timeLeft! - 1 }));
      }, 1000);
      return () => { if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current); };
    }
  }, [sleepTimer, state.isPlaying, togglePlay, setVolume]);

  const startSleepTimer = (minutes: number) => {
    setSleepTimer({ active: true, timeLeft: minutes * 60 });
  };
  

  // User Identity State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isYTLoggedIn, setIsYTLoggedIn] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showCreatePlaylistModal, setShowCreatePlaylistModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [songToAddToPlaylist, setSongToAddToPlaylist] = useState<Song | null>(null);
  const [likedSongs, setLikedSongs] = useState<Song[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('izgiv_liked_songs');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('izgiv_liked_songs', JSON.stringify(likedSongs));
  }, [likedSongs]);

  const toggleLike = (song: Song) => {
    setLikedSongs(prev => {
      const isLiked = prev.some(s => s.id === song.id);
      if (isLiked) {
        return prev.filter(s => s.id !== song.id);
      }
      return [song, ...prev];
    });
  };
  
  const [userProfile, setUserProfile] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('izgiv_user_profile');
      return saved ? JSON.parse(saved) : {
        name: 'Guest User',
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200&h=200&auto=format&fit=crop',
        stats: { songsPlayed: 0, minutesListened: 0, favoriteGenre: "Vibe Master" }
      };
    }
    return { name: 'Guest User', avatar: '', stats: { songsPlayed: 0, minutesListened: 0, favoriteGenre: "Vibe Master" } };
  });

  useEffect(() => {
    localStorage.setItem('izgiv_user_profile', JSON.stringify(userProfile));
  }, [userProfile]);

  // UI States
  const [showAudioControls, setShowAudioControls] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  
  const [isDraggingSeek, setIsDraggingSeek] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const [isProjectsExpanded, setIsProjectsExpanded] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  
  // Actually apply AOT state to the Electron window
  useEffect(() => {
    if ((window as any).electronAPI?.setAlwaysOnTop) {
      (window as any).electronAPI.setAlwaysOnTop(alwaysOnTop);
    }
  }, [alwaysOnTop]);
  const [visualizerMode, setVisualizerMode] = useState<'wave' | 'bars'>('bars');
  
  const lyricsRef = useRef<HTMLDivElement>(null);

  // Auto-advance logic (Respects autoPlay toggle)
  useEffect(() => {
    if (autoPlay && state.currentTime > 0 && state.duration > 0 && state.currentTime >= state.duration - 0.5) {
       // Debounce nextSong to avoid spam
       const timer = setTimeout(() => nextSong(), 1000);
       return () => clearTimeout(timer);
    }
  }, [state.currentTime, state.duration, autoPlay, nextSong]);

  // Handle auto-scrolling lyrics
  const currentLyricIndex = useMemo(() => {
    return lyrics.findIndex((l, i) => 
      l.time <= state.currentTime && (lyrics[i+1] ? lyrics[i+1].time > state.currentTime : true)
    );
  }, [lyrics, state.currentTime]);

  useEffect(() => {
    if (showLyrics && autoScroll) {
      const activeLine = lyricsRef.current?.querySelector('.active-lyric');
      if (activeLine) {
        activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentLyricIndex, showLyrics, autoScroll]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile.name.trim()) return;
    setIsLoggedIn(true);
    setShowLoginModal(false);
  };

  const handleYouTubeLogin = async () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      const res = await (window as any).electronAPI.youtubeLogin();
      if (res?.success) setIsYTLoggedIn(true);
    }
  };

  const [isVibeShifting, setIsVibeShifting] = useState(false);
  
  const vibeShift = async () => {
    if (likedSongs.length === 0) return;
    setIsVibeShifting(true);
    try {
      // Pass API KEY from renderer for redundancy (Vite loads it into process.env.API_KEY)
      const apiKey = (process.env as any).API_KEY || (process.env as any).GEMINI_API_KEY || "";
      console.log("[VibeShift] 🚢 Requesting shift for", likedSongs.length, "songs...");
      const suggestions = await getVibeShiftSuggestions(likedSongs, apiKey);
      console.log("[VibeShift] ✨ Received", suggestions.length, "suggestions.");
      const shiftPlaylist: Playlist = {
        id: 'vibe-shift',
        name: '🤖 AI Vibe Shift',
        songs: suggestions
      };
      setSelectedPlaylist(shiftPlaylist);
      setView('library');
    } catch (e) {
      console.error(e);
    } finally {
      setIsVibeShifting(false);
    }
  };

  const importLocalFolder = async () => {
    const res = await (window as any).electronAPI.selectLocalFolder();
    if (res && res.songs && res.songs.length > 0) {
      const localPlaylist: Playlist = {
        id: 'local-files',
        name: '📁 Local Files',
        songs: res.songs
      };
      setLocalPlaylists(prev => {
        const filtered = prev.filter(p => p.id !== 'local-files');
        return [localPlaylist, ...filtered];
      });
      // Start watching the folder for changes
      if (res.path) (window as any).electronAPI.watchFolder(res.path);
    }
  };

  const createPlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    const newPlaylist: Playlist = {
      id: Math.random().toString(36).substring(2, 9),
      name: newPlaylistName,
      songs: [],
    };
    setLocalPlaylists(prev => [...prev, newPlaylist]);
    setNewPlaylistName('');
    setShowCreatePlaylistModal(false);
  };

  const addSongToLocalPlaylist = (song: Song, playlistId: string) => {
    setLocalPlaylists(prev => prev.map(p => {
      if (p.id === playlistId) {
        if (p.songs.some(s => s.id === song.id)) return p;
        return { ...p, songs: [...p.songs, song] };
      }
      return p;
    }));
    setSongToAddToPlaylist(null);
  };

  useEffect(() => {
    const savedProfile = localStorage.getItem('izgiv_user_profile');
    if (savedProfile) {
      setIsLoggedIn(true);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('izgiv_local_playlists');
    if (saved) {
      try { setLocalPlaylists(JSON.parse(saved)); } catch (e) {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('izgiv_local_playlists', JSON.stringify(localPlaylists));
  }, [localPlaylists]);

  useEffect(() => {
    setIsPlaylistsLoading(true);
    getPublicPlaylists().then(res => {
      setPlaylists(res);
      setIsPlaylistsLoading(false);
    });
    getTrending().then(setSuggestions);
  }, []);

  useEffect(() => {
    if (state.currentSong) {
      getColorsFromCover(state.currentSong.coverUrl).then(setTheme);
      getLyrics(state.currentSong.artist, state.currentSong.title).then(setLyrics);
      getSuggestions(state.currentSong).then(s => setSuggestions(s.slice(0, 4)));

      // Update MediaSession for System-level player controls
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: state.currentSong.title,
          artist: state.currentSong.artist,
          artwork: [
            { src: state.currentSong.coverUrl, sizes: '512x512', type: 'image/jpeg' }
          ]
        });

        navigator.mediaSession.setActionHandler('play', togglePlay);
        navigator.mediaSession.setActionHandler('pause', togglePlay);
        navigator.mediaSession.setActionHandler('previoustrack', prevSong);
        navigator.mediaSession.setActionHandler('nexttrack', nextSong);
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime) seek(details.seekTime);
        });
      }
    }
  }, [state.currentSong]);

  // Sync Discord RPC (Main window only)
  useEffect(() => {
    if (!isMini && state.currentSong && (window as any).electronAPI?.updateDiscordRPC) {
      (window as any).electronAPI.updateDiscordRPC(state.currentSong, state.isPlaying);
    }
  }, [state.currentSong, state.isPlaying, isMini]);

  // Listen for folder updates
  useEffect(() => {
    if ((window as any).electronAPI?.onFolderUpdated) {
      const removeListener = (window as any).electronAPI.onFolderUpdated((path: string) => {
        console.log(`[Renderer] 📂 Folder updated: ${path}, re-scanning...`);
      });
      return () => removeListener();
    }
  }, []);

  const handleSearchKey = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery) {
      setIsSearching(true);
      setSearchResults([]);
      const results = await searchMusic(searchQuery);
      setSearchResults(results);
      setIsSearching(false);
    }
  };

  // --- Views ---

  const openLink = (url: string) => {
    if ((window as any).electronAPI?.openExternal) {
      (window as any).electronAPI.openExternal(url);
    } else {
    }
  };

  const renderSettings = () => (
    <div className="space-y-12 pb-40 px-2 animate-in fade-in duration-500">
      <header>
         <h1 className="text-5xl font-black text-white mb-2 tracking-tighter leading-none italic select-none">Settings</h1>
         <p className="text-white/40 font-medium uppercase tracking-widest text-[10px]">Customize your IZGIV experience</p>
      </header>

      <section>
        <div className="flex items-center gap-3 mb-8">
           <User size={20} className="text-white/40" />
           <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">User Profile</h2>
        </div>
        <GlassCard className="!p-8 !rounded-[40px] border-white/5 bg-black/20 flex flex-col md:flex-row gap-8 items-center">
          <img src={userProfile.avatar} className="w-24 h-24 rounded-full border-2 border-white/10 shadow-xl" />
          <div className="flex-1 space-y-4 w-full">
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-white/30 block mb-2 px-1">Display Name</label>
              <input 
                type="text" 
                value={userProfile.name} 
                onChange={(e) => setUserProfile({...userProfile, name: e.target.value})}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-6 text-white font-bold outline-none focus:border-white/20 transition-all"
              />
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-white/30 block mb-2 px-1">Avatar URL</label>
              <input 
                type="text" 
                value={userProfile.avatar} 
                onChange={(e) => setUserProfile({...userProfile, avatar: e.target.value})}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-6 text-white font-bold outline-none focus:border-white/20 transition-all"
              />
            </div>
          </div>
        </GlassCard>
      </section>

      <section>
        <div className="flex items-center gap-3 mb-8">
           <Monitor size={20} className="text-white/40" />
           <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Sleep Timer</h2>
        </div>
        <GlassCard className="!p-8 !rounded-[40px] border-white/5 bg-black/20">
           <div className="flex flex-wrap gap-4">
              {[15, 30, 45, 60, 90].map(mins => (
                <button 
                  key={mins} 
                  onClick={() => startSleepTimer(mins)}
                  className={`px-8 py-4 rounded-3xl font-black text-xs uppercase tracking-widest transition-all ${sleepTimer.active && sleepTimer.timeLeft! <= mins * 60 && sleepTimer.timeLeft! > (mins-15)*60 ? 'bg-white text-black' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                >
                  {mins} min
                </button>
              ))}
              {sleepTimer.active && (
                <button 
                  onClick={() => setSleepTimer({ active: false, timeLeft: null })}
                  className="px-8 py-4 rounded-3xl font-black text-xs uppercase tracking-widest bg-red-500/20 text-red-400 hover:bg-red-500/30"
                >
                  Cancel ({Math.floor(sleepTimer.timeLeft! / 60)}:{(sleepTimer.timeLeft! % 60).toString().padStart(2, '0')})
                </button>
              )}
           </div>
        </GlassCard>
      </section>

      <section>
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
             <Palette size={20} className="text-white/40" />
             <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Theme & Accents</h2>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {[
            { name: 'Obsidian Indigo', primary: '#4f46e5', secondary: '#818cf8', accent: '#c7d2fe' },
            { name: 'Toxic Emerald', primary: '#059669', secondary: '#10b981', accent: '#6ee7b7' },
            { name: 'Rose Gold', primary: '#be123c', secondary: '#e11d48', accent: '#fca5a5' },
            { name: 'Electric Cyan', primary: '#0891b2', secondary: '#06b6d4', accent: '#67e8f9' },
            { name: 'Vibrant Violet', primary: '#7c3aed', secondary: '#8b5cf6', accent: '#c4b5fd' },
            { name: 'Amber Glow', primary: '#d97706', secondary: '#f59e0b', accent: '#fcd34d' },
          ].map(t => (
            <GlassCard 
              key={t.name} 
              onClick={() => setTheme(t)}
              className={`!p-6 !rounded-[40px] cursor-pointer border-2 transition-all duration-500 hover:scale-[1.02] ${theme.name === t.name ? 'border-white/40 bg-white/10 shadow-[0_0_50px_rgba(255,255,255,0.1)]' : 'border-white/5 hover:border-white/20 bg-black/20'}`}
            >
              <div className="w-full h-16 rounded-3xl mb-4 shadow-inner" style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.secondary})` }}></div>
              <span className="font-black text-white text-xs uppercase tracking-widest">{t.name}</span>
            </GlassCard>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-3 mb-8">
           <Radio size={20} className="text-white/40" />
           <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Ambient Atmosphere</h2>
           <div className="flex items-center gap-3 ml-auto">
              <span className="text-[7px] font-black uppercase text-white/20 tracking-widest">Ambient Mode</span>
              <button 
                onClick={() => toggleAmbientMode(!isAmbientMode)}
                className={`w-12 h-6 rounded-full p-1 transition-all duration-300 ${isAmbientMode ? 'bg-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.5)]' : 'bg-white/5 border border-white/10'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-300 ${isAmbientMode ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
           </div>
        </div>
        <GlassCard className={`!p-8 !rounded-[40px] border-white/5 transition-all duration-500 ${isAmbientMode ? 'bg-indigo-500/5 border-indigo-500/20' : 'bg-black/20'}`}>
           {isAmbientMode && (
             <div className="mb-8 p-4 bg-indigo-500/10 rounded-3xl border border-indigo-500/20 flex items-center gap-4 animate-in slide-in-from-top-2">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                   <Sparkles size={20} className="animate-pulse" />
                </div>
                <div>
                   <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200">Ambient Mode Active</p>
                   <p className="text-[9px] text-white/40 font-bold uppercase tracking-tight">Music playback paused for pure atmosphere</p>
                </div>
             </div>
           )}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
              {[
                { id: 'rain', name: 'Heavy Rain', icon: <Droplets size={18} /> },
                { id: 'waves', name: 'River Stream', icon: <Waves size={18} /> },
                { id: 'fireplace', name: 'Warm Fireplace', icon: <Flame size={18} /> },
                { id: 'forest', name: 'Forest Rain', icon: <Trees size={18} /> },
                { id: 'thunder', name: 'Thunderstorm', icon: <CloudLightning size={18} /> },
                { id: 'wind', name: 'Strong Wind', icon: <Wind size={18} /> }
              ].map(s => (
                <div key={s.id} className="space-y-4">
                   <div className="flex justify-between items-center px-1">
                      <div className="flex items-center gap-3">
                         <span className="text-white/40">{s.icon}</span>
                         <span className="text-[10px] font-black uppercase tracking-widest text-white/80">{s.name}</span>
                      </div>
                      <span className="text-[9px] font-black text-white/30 tabular-nums">{Math.round(ambientVolumes[s.id] * 100)}%</span>
                   </div>
                   <input 
                    type="range" min="0" max="1" step="0.01" 
                    value={ambientVolumes[s.id]} 
                    onChange={(e) => updateAmbientVolume(s.id, parseFloat(e.target.value))}
                    className="w-full h-1 bg-white/5 rounded-full appearance-none cursor-pointer accent-white hover:accent-indigo-400 transition-all"
                   />
                </div>
              ))}
           </div>
        </GlassCard>
      </section>

      <section>
        <div className="flex items-center gap-3 mb-8">
           <Activity size={20} className="text-white/40" />
           <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Audio Lab</h2>
           <span className="text-[7px] font-black uppercase bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full tracking-widest ml-auto">Local EQ Engine</span>
        </div>
        <div className="space-y-10">
          <Equalizer 
            gains={eqGains} 
            onGainChange={updateEqGain} 
            accent={theme.accent} 
          />
          
          <div className="pt-10 border-t border-white/5 space-y-8">
            <div className="flex flex-col md:flex-row md:items-center gap-12">
               {/* Speed Control */}
               <div className="flex-1 space-y-6">
                  <div className="flex items-center gap-3 mb-2 px-1">
                     <Gauge size={18} className="text-white/40" />
                     <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30">Sound Speed</h3>
                  </div>
                  <div className="flex items-center gap-6">
                    <input 
                      type="range" min="0.5" max="2.0" step="0.1"
                      value={state.playbackRate}
                      onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                      className="flex-1 h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer accent-white"
                    />
                    <span className="w-14 text-sm font-black text-white text-right tabular-nums">{state.playbackRate.toFixed(2)}x</span>
                  </div>
               </div>

               {/* Visualizer Mode */}
               <div className="space-y-6">
                  <div className="flex items-center gap-3 mb-2 px-1">
                     <Terminal size={18} className="text-white/40" />
                     <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30">Visual Pulse</h3>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setVisualizerMode('bars')}
                      className={`px-8 py-4 rounded-[24px] text-[10px] font-black uppercase tracking-widest transition-all shadow-xl hover:scale-105 active:scale-95 ${visualizerMode === 'bars' ? 'bg-white text-black' : 'bg-white/5 text-white/40 hover:bg-white/10 border border-white/5'}`}
                    >
                      Spectrum
                    </button>
                    <button 
                      onClick={() => setVisualizerMode('wave')}
                      className={`px-8 py-4 rounded-[24px] text-[10px] font-black uppercase tracking-widest transition-all shadow-xl hover:scale-105 active:scale-95 ${visualizerMode === 'wave' ? 'bg-white text-black' : 'bg-white/5 text-white/40 hover:bg-white/10 border border-white/5'}`}
                    >
                      Flux
                    </button>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );

  const renderAbout = () => {
    return (
      <div className="space-y-12 pb-40 px-2 animate-in fade-in duration-500">
        <header>
           <h1 className="text-5xl font-black text-white mb-2 tracking-tighter leading-none italic select-none">About</h1>
           <p className="text-white/40 font-medium uppercase tracking-widest text-[10px]">The IZGIV Multiverse & Ecosystem</p>
        </header>

        <section>
           <div className="flex items-center gap-3 mb-8 px-2">
              <ShieldAlert size={20} className="text-white/40" />
              <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Open Source</h2>
           </div>
          <GlassCard className="!p-8 !rounded-[40px] border-white/5 bg-black/20 group cursor-pointer hover:border-white/20 transition-all" onClick={() => openLink('https://github.com/AryanRajMaurya/TheIZGIV')}>
             <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/60 leading-relaxed max-w-md italic">
                    IZGIV is built on the philosophy of open, high-authority engineering. 
                    The source code for this multiverse node will be available on GitHub.
                  </p>
                  <div className="mt-6 flex items-center gap-4 text-indigo-400 font-black text-[10px] uppercase tracking-widest">
                     <Github size={16} />
                     <span>AryanRajMaurya/TheIZGIV</span>
                  </div>
                </div>
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-white/20 group-hover:text-indigo-400 group-hover:scale-110 transition-all">
                   <ArrowUp size={32} className="rotate-45" />
                </div>
             </div>
          </GlassCard>
        </section>

        <section>
           <div className="flex items-center gap-3 mb-8">
              <Heart size={20} className="text-red-500/60" />
              <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Developer Profile</h2>
           </div>
           <GlassCard className="!p-12 !rounded-[56px] border-white/5 bg-black/40 overflow-hidden relative group">
              <div className="absolute -top-20 -right-20 w-96 h-96 bg-gradient-to-br from-indigo-500/20 to-pink-500/10 blur-[100px] -z-10 group-hover:scale-150 transition-transform duration-[3000ms]"></div>
              <div className="flex flex-col md:flex-row gap-16 items-center md:items-start text-center md:text-left">
                 <div className="relative">
                   <div className="w-40 h-40 rounded-full border-4 border-white/10 p-1 bg-gradient-to-tr from-white/10 to-transparent shadow-2xl relative z-10">
                      <img src="https://github.com/AryanRajMaurya.png" className="w-full h-full rounded-full object-cover" />
                   </div>
                   <div className="absolute inset-x-[-20%] inset-y-[-20%] bg-indigo-500/10 rounded-full blur-3xl animate-pulse -z-10"></div>
                 </div>
                 <div className="flex-1">
                   <h3 className="text-5xl font-black text-white mb-4 tracking-tighter italic select-none">Aryan Raj Maurya</h3>
                   <p className="text-indigo-400 text-xs font-black uppercase tracking-[0.5em] mb-8">Full-Stack AI Architect</p>
                   <p className="text-white/30 leading-relaxed text-sm mb-12 max-w-2xl font-medium italic">
                    "Engineering the future at the intersection of AI, design, and distributed systems. From agentic assistants to high-authority platforms—building the Izgiv multiverse, one node at a time."
                   </p>
                   
                   <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                     {[
                       { text: 'AryanRajMaurya', icon: <Github size={22}/>, url: 'https://github.com/AryanRajMaurya' },
                       { text: '@aryanrajmauryavanshi', icon: <Instagram size={22}/>, url: 'https://instagram.com/aryanrajmauryavanshi' },
                       { text: '-izgiv', icon: <MessageSquare size={22}/>, url: 'https://discord.gg/T2uZnVfQPw' }
                     ].map(s => (
                       <button key={s.text} onClick={() => openLink(s.url)} className="flex items-center gap-4 px-8 py-5 bg-white/5 hover:bg-white/10 rounded-[32px] border border-white/10 transition-all hover:scale-105 active:scale-95 group/link shadow-xl text-left">
                         <span className="text-white/40 group-hover/link:text-white transition-colors">{s.icon}</span>
                         <span className="text-[10px] font-black uppercase tracking-widest text-white/40 group-hover/link:text-white/80">{s.text}</span>
                       </button>
                     ))}
                   </div>
                 </div>
              </div>
           </GlassCard>
        </section>

        <section>
           <div className="flex items-center justify-between mb-8 px-4">
              <div className="flex items-center gap-3">
                 <LayoutGrid size={20} className="text-indigo-400/60" />
                 <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Ecosystem Roadmap</h2>
              </div>
              <button 
                onClick={() => setIsProjectsExpanded(!isProjectsExpanded)}
                className="px-6 py-2 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all flex items-center gap-2"
              >
                <span>{isProjectsExpanded ? 'Show Less' : 'Explore All'}</span>
                <ChevronDown size={14} className={`transition-transform duration-500 ${isProjectsExpanded ? 'rotate-180' : ''}`} />
              </button>
           </div>
           
           <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 transition-all duration-700 overflow-hidden ${isProjectsExpanded ? 'max-h-[2000px]' : 'max-h-[340px]'}`}>
              {[
                { name: 'Friday.izgiv.tech', icon: <Bot size={22} />, desc: 'Modular Agentic Assistant', status: 'Latest', color: 'text-yellow-400', url: 'https://friday.izgiv.tech' },
                { name: 'Izgiv.tech', icon: <Globe size={22} />, desc: 'Main Ecosystem Hub', status: 'Active', color: 'text-indigo-400', url: 'https://izgiv.tech' },
                { name: 'Stream.izgiv.tech', icon: <Music size={22} />, desc: 'High-Fid Music Streaming', status: 'Mainten.', color: 'text-white/40', url: 'https://stream.izgiv.tech' },
                { name: 'Llama.izgiv.tech', icon: <Cpu size={22} />, desc: 'Advanced LLM API Hub', status: 'Prod', color: 'text-green-400', url: 'https://llama.izgiv.tech' },
                { name: 'Image.izgiv.tech', icon: <ImageIcon size={22} />, desc: 'AI Image Gen Hub', status: 'Online', color: 'text-emerald-400', url: 'https://image.izgiv.tech' },
                { name: 'Groq.izgiv.tech', icon: <Zap size={22} />, desc: 'Groq/Llama AI Chat', status: 'Paid', color: 'text-orange-400', url: 'https://groq.izgiv.tech' },
                { name: 'Chat.izgiv.tech', icon: <MessageCircle size={22} />, desc: 'Advanced Social Suite', status: 'Active', color: 'text-blue-400', url: 'https://chat.izgiv.tech' },
                { name: 'Wallpaper.izgiv.tech', icon: <Layers size={22} />, desc: 'Premium HD Wallpapers', status: 'Free', color: 'text-pink-400', url: 'https://wallpaper.izgiv.tech' },
                { name: 'Desktop.izgiv.tech', icon: <Monitor size={22} />, desc: 'OS Simulation & UI', status: 'Portf.', color: 'text-cyan-400', url: 'https://desktop.izgiv.tech' },
                { name: 'Hymn.izgiv.tech', icon: <Music size={22} />, desc: 'Ad-free Music Alt', status: 'Shutdown', color: 'text-red-400', url: 'https://hymn.izgiv.tech' },
                { name: 'Magic Moments', icon: <Camera size={22} />, desc: 'Local Media Board', status: 'Beta', color: 'text-purple-400', url: 'https://chat.izgiv.tech/magic-moments' },
                { name: 'Armage.izgiv.tech', icon: <Terminal size={22} />, desc: 'Desktop AI Bot (PC)', status: 'Alpha', color: 'text-emerald-500', url: 'https://armage.izgiv.tech' },
                { name: 'Chatroom Node', icon: <Hash size={22} />, desc: 'RTC Engine Node', status: 'Dev', color: 'text-white/20', url: 'https://chatroom.izgiv.tech' },
                { name: 'Monarch Node', icon: <Crown size={22} />, desc: 'Future Identity Node', status: 'Dev', color: 'text-yellow-600', url: 'https://monarch.izgiv.tech' },
                { name: 'Studio Node', icon: <Palette size={22} />, desc: 'Multi-Modal Platform', status: 'Legacy', color: 'text-white/10', url: 'https://studio.izgiv.tech' },
                { name: 'Moody Manager', icon: <Activity size={22} />, desc: 'AI Mood Analysis', status: 'Legacy', color: 'text-white/10', url: '#' },
              ].map(p => (
                <GlassCard key={p.name} onClick={() => openLink(p.url)} className="!p-6 !rounded-[40px] border-white/5 bg-black/40 hover:bg-white/5 hover:border-white/20 transition-all group/item cursor-pointer">
                   <div className="flex items-center gap-5">
                      <div className={`p-4 bg-white/5 rounded-3xl group-hover/item:bg-white/10 transition-all ${p.color}`}>
                         {p.icon}
                      </div>
                      <div className="flex-1 overflow-hidden">
                         <div className="flex justify-between items-center mb-1">
                           <span className="text-sm font-bold text-white group-hover/item:text-indigo-400 transition-colors truncate italic">{p.name}</span>
                           <span className="text-[7px] font-black uppercase bg-white/10 px-2 py-0.5 rounded-full text-white/30 whitespace-nowrap">{p.status}</span>
                         </div>
                         <span className="text-[9px] text-white/20 truncate block font-black uppercase tracking-widest">{p.desc}</span>
                      </div>
                   </div>
                </GlassCard>
              ))}
           </div>
        </section>

        <section>
           <div className="flex items-center gap-3 mb-8">
              <Info size={20} className="text-white/40" />
              <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Project Stats</h2>
           </div>
          <GlassCard className="!p-8 !rounded-[40px] border-white/5 bg-black/20">
             <p className="text-white/60 leading-relax">IZGIV is your high-authority personal music space. Powered by AI, Engineering by Aryan Raj Maurya.</p>
             <div className="mt-8 flex flex-wrap gap-4">
                <div className="p-3 px-6 bg-white/5 rounded-2xl border border-white/10">
                   <span className="block text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">Version</span>
                   <span className="text-sm font-bold text-white">1.4.0 High-Authority</span>
                </div>
                <div className="p-3 px-6 bg-white/5 rounded-2xl border border-white/10">
                   <span className="block text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">Status</span>
                   <span className="text-sm font-bold text-green-400">Stable Alpha</span>
                </div>
                <div className="p-3 px-6 bg-white/5 rounded-2xl border border-white/10">
                   <span className="block text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">Architecture</span>
                   <span className="text-sm font-bold text-white">Electron + Sidecar</span>
                </div>
             </div>
          </GlassCard>
        </section>
      </div>
    );
  };

  const renderHome = () => (
    <div className="space-y-8 pb-40">
       <header className="flex justify-between items-center px-2">
        <div>
          <h1 className="text-4xl font-extrabold text-white mb-1 tracking-tight">Your Vibe</h1>
          <p className="text-white/50 font-medium tracking-tight">Listening as <span className="text-white/80">{userProfile.name}</span></p>
        </div>
        <div className="flex items-center gap-4">
           <button 
            disabled={likedSongs.length === 0 || isVibeShifting}
            onClick={vibeShift}
            className={`p-3 px-6 rounded-full font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 border ${isVibeShifting ? 'bg-white/10 text-white/40 border-white/10' : 'bg-white text-black border-white hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.3)]'}`}
           >
             {isVibeShifting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
             <span>{isVibeShifting ? 'Shifting...' : 'Vibe Shift'}</span>
           </button>
           <button onClick={() => setView('settings')} className="w-12 h-12 rounded-full border-2 border-white/10 shadow-lg overflow-hidden transition-transform hover:scale-105 active:scale-95 p-0.5" style={{ backgroundColor: `${theme.primary}44` }}>
              <img src={userProfile.avatar} className="w-full h-full rounded-full object-cover" />
           </button>
        </div>
      </header>

      <section>
        <div className="flex items-center justify-between mb-6 px-2">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-yellow-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Viral Picks</h2>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-2">
           {suggestions.map(s => (
             <GlassCard key={s.id} className="p-4 !rounded-[28px] group cursor-pointer border-transparent hover:border-white/20 relative" onClick={() => { addToQueue(s); playSong(s); }}>
                <div className="absolute top-6 right-6 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={(e) => { e.stopPropagation(); toggleLike(s); }}
                    className={`p-2 bg-black/40 backdrop-blur-md rounded-full border border-white/10 ${likedSongs.some(ls => ls.id === s.id) ? 'text-red-500' : 'text-white/60'}`}
                  >
                    <Heart size={14} fill={likedSongs.some(ls => ls.id === s.id) ? "currentColor" : "none"} />
                  </button>
                </div>
                <img src={s.coverUrl} className="w-full aspect-square rounded-2xl mb-3 shadow-lg object-cover group-hover:scale-105 transition-transform" />
                <h3 className="text-white font-bold truncate text-sm">{s.title}</h3>
                <p className="text-white/30 text-[10px] truncate uppercase tracking-widest font-black">{s.artist}</p>
             </GlassCard>
           ))}
        </div>
      </section>
    </div>
  );

  const renderSearch = () => (
    <div className="space-y-8 pb-40 px-2 animate-in fade-in duration-500">
      <div className="relative group">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-white/30" size={20} />
        <input 
          type="text" 
          placeholder="What's your vibe today?" 
          className="w-full bg-white/5 border border-white/10 rounded-full py-5 pl-14 pr-8 text-white focus:outline-none focus:bg-white/10 transition-all font-bold text-lg"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleSearchKey}
        />
        {isSearching && <Loader2 size={20} className="absolute right-6 top-1/2 -translate-y-1/2 animate-spin text-white/40" />}
      </div>
      <div className="space-y-1">
        {searchResults.map(song => (
          <SongRow 
            key={song.id} song={song} 
            onClick={() => { addToQueue(song); playSong(song); }} 
            onAddQueue={addToQueue} onOpenPlaylistSelector={setSongToAddToPlaylist}
            isPlaying={state.currentSong?.id === song.id}
            likedSongs={likedSongs}
            toggleLike={toggleLike}
          />
        ))}
      </div>
    </div>
  );

  const renderPlayer = () => {
    if (!state.currentSong) return <div className="flex h-full items-center justify-center text-white/50 font-black tracking-widest animate-pulse">Pick a track to start IZGIV</div>;

    const maxSeek = Math.max(state.duration, 1);
    const displayTime = isDraggingSeek ? dragTime : state.currentTime;

    return (
      <div className="h-full grid grid-rows-[auto,1fr,auto] relative overflow-hidden bg-transparent pt-0 pb-24 md:pb-8">
        {/* Row 1: Header Navigation */}
        <div className="relative flex items-center justify-between px-4 lg:px-12 z-40 h-10">
           <button onClick={() => setView('home')} className="p-1.5 text-white/40 hover:text-white transition-all hover:bg-white/10 rounded-xl border border-transparent hover:border-white/10"><ChevronDown size={24} /></button>
           <div className="flex flex-col items-center">
              <span className="text-[11px] font-black tracking-[0.6em] uppercase opacity-40 select-none">Now Playing</span>
           </div>
           <div className="flex items-center gap-1">
             {showLyrics && (
               <button 
                onClick={() => setAutoScroll(!autoScroll)}
                className={`p-1.5 px-3 rounded-xl border transition-all duration-300 text-[9px] font-black uppercase tracking-widest flex items-center gap-2 ${autoScroll ? 'bg-white text-black border-white' : 'text-white/40 border-white/10 hover:bg-white/10'}`}
                title={autoScroll ? 'Auto-scroll: ON' : 'Auto-scroll: OFF'}
               >
                 <ScrollText size={16} />
                 <span className="hidden sm:inline">{autoScroll ? 'On' : 'Off'}</span>
               </button>
             )}
             <button onClick={() => setShowQueue(true)} className="p-1.5 text-white/40 hover:text-white transition-all hover:bg-white/10 rounded-xl border border-transparent hover:border-white/10"><List size={22} /></button>
             <button 
              onClick={() => (window as any).electronAPI?.toggleMiniPlayer(true)} 
              className="p-1.5 text-white/40 hover:text-white transition-all hover:bg-white/10 rounded-xl border border-transparent hover:border-white/10"
              title="Mini-Player"
             >
               <Minimize2 size={22} />
             </button>
           </div>
        </div>

        {/* Row 2: Main Stage (Poster or Lyrics) */}
        <div className="relative flex items-center justify-center overflow-hidden w-full max-w-5xl mx-auto px-4">
           <div className={`transition-all duration-700 w-full flex flex-col items-center justify-center ${isTransitioning ? 'opacity-0 scale-95 blur-sm' : 'opacity-100 scale-100 blur-0'}`}>
            {!showLyrics ? (
              <div className="relative group flex flex-col items-center justify-center gap-[3vh] md:gap-[4vh]">
                {/* Poster with Glow */}
                <div className="relative">
                  <div className="absolute inset-[-40%] rounded-full blur-[100px] opacity-30 animate-blob pointer-events-none" style={{ backgroundColor: theme.primary }}></div>
                  <div className="relative w-[min(25vh,9rem)] h-[min(25vh,9rem)] md:w-[min(38vh,18rem)] md:h-[min(38vh,18rem)] rounded-[clamp(16px,4vh,40px)] overflow-hidden border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.8)] cover-float ring-8 ring-white/5 bg-black/20 transition-all duration-500">
                    <img 
                      key={state.currentSong.coverUrl}
                      src={state.currentSong.coverUrl} 
                      className="w-full h-full object-cover select-none transform transition-all duration-700 group-hover:scale-110"
                    />
                  </div>
                </div>

                {/* Visualizer */}
                <div className="w-full max-w-[20rem] h-[clamp(2rem,10vh,6rem)] relative z-10 cursor-pointer group/viz" onClick={() => setVisualizerMode(visualizerMode === 'bars' ? 'wave' : 'bars')}>
                   <Visualizer analyser={analyser} mode={visualizerMode} accent={theme.accent} />
                   <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 opacity-0 group-hover/viz:opacity-40 transition-opacity text-[8px] font-black uppercase tracking-widest text-white">Mode: {visualizerMode}</div>
                </div>
              </div>
            ) : (
               <div className="relative w-full h-[65vh] flex flex-col items-center">
                <div ref={lyricsRef} className="w-full h-full overflow-y-auto custom-scrollbar mask-gradient lyrics-container text-center py-10 relative z-[10] px-4 md:px-12">
                   {lyrics.length > 0 ? lyrics.map((line, idx) => {
                     const isActive = state.currentTime >= line.time && (!lyrics[idx+1] || state.currentTime < lyrics[idx+1].time);
                     return (
                       <p 
                        key={idx} 
                        onClick={() => seek(line.time)} 
                        className={`text-xl md:text-4xl font-black cursor-pointer transition-all duration-500 py-4 px-6 md:px-12 rounded-[40px] hover:bg-white/[0.03] ${isActive ? 'text-white scale-110 opacity-100 active-lyric' : 'text-white/10'}`} 
                       >
                         {line.text}
                       </p>
                     );
                   }) : <div className="text-white/20 font-black italic mt-20 text-xl">No lyrics found for this vibe...</div>}
                </div>
              </div>
            )}
           </div>
        </div>

        {/* Row 3: Interface Controls */}
        <div className="relative z-[50] px-4 md:px-8 flex items-center justify-center pb-4">
          <div className="w-full max-w-xl">
             <GlassCard className="!p-4 md:!p-6 shadow-[0_40px_80px_rgba(0,0,0,0.8)] border-white/5 bg-black/60 backdrop-blur-3xl !rounded-[48px] transition-all">
                <div className="flex flex-col mb-3 md:mb-4 text-center drop-shadow-2xl">
                  <h2 className="text-lg md:text-2xl font-black text-white mb-0.5 truncate tracking-tighter leading-tight select-none">
                    {state.currentSong.title}
                  </h2>
                  <div className="flex items-center justify-center gap-3">
                     <p className="text-[9px] md:text-xs text-white/40 truncate font-black uppercase tracking-[0.5em] select-none">
                        {state.currentSong.artist}
                     </p>
                  </div>
                </div>

                <div className="mb-4 relative group px-1">
                  <div className="flex justify-between text-[9px] font-black text-white/30 uppercase tracking-widest mb-2 px-1">
                     <span>{formatTime(displayTime)}</span>
                     <span>{formatTime(maxSeek)}</span>
                  </div>
                  <div className="relative h-1.5 flex items-center">
                    <input 
                      type="range" min={0} max={maxSeek} step={0.01} value={displayTime}
                      onMouseDown={() => { setIsDragging(true); setIsDraggingSeek(true); }}
                      onInput={(e) => setDragTime(parseFloat(e.currentTarget.value))}
                      onChange={(e) => { 
                        seek(parseFloat(e.currentTarget.value)); 
                        setIsDragging(false); 
                        setIsDraggingSeek(false);
                      }}
                      className="w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer relative z-10"
                    />
                    <div 
                      className="absolute top-0 left-0 h-1.5 rounded-full pointer-events-none transition-all duration-100" 
                      style={{ width: `${(displayTime / maxSeek) * 100}%`, backgroundColor: theme.accent, boxShadow: `0 0 30px ${theme.accent}aa` }} 
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => toggleLike(state.currentSong!)} 
                      className={`p-2 transition-all duration-300 hover:scale-110 ${likedSongs.some(s => s.id === state.currentSong?.id) ? 'text-red-500 fill-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'text-white/20 hover:text-white/60'}`}
                    >
                      <Heart size={20} />
                    </button>
                    <button onClick={() => setAutoPlay(!autoPlay)} className={`p-2 transition-all duration-300 ${autoPlay ? 'text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.5)]' : 'text-white/10'}`} title="Autoplay Toggle">
                       <Radio size={18} className={autoPlay ? 'animate-pulse' : ''} />
                    </button>
                    {sleepTimer.active && (
                      <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/5 animate-pulse">
                        <Monitor size={12} className="text-white/30" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-white/40">{Math.floor(sleepTimer.timeLeft! / 60)}:{(sleepTimer.timeLeft! % 60).toString().padStart(2, '0')}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <button onClick={prevSong} className="p-2 text-white/60 hover:text-white hover:scale-110 active:scale-95 transition-all"><SkipBack size={28} fill="currentColor" /></button>
                    <button 
                      onClick={() => { if (isAmbientMode) setIsAmbientMode(false); togglePlay(); }} 
                      className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl relative ${state.isPlaying ? 'bg-white/10 text-white border-2 border-white/10 hover:bg-white/20' : 'bg-white text-black hover:scale-105 active:scale-95'}`}
                    >
                      {state.isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
                    </button>
                    <button onClick={nextSong} className="p-2 text-white/60 hover:text-white hover:scale-110 active:scale-95 transition-all"><SkipForward size={28} fill="currentColor" /></button>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="relative group/speed">
                      <button className="p-2 text-white/20 hover:text-white transition-colors"><Gauge size={18} /></button>
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-black/80 backdrop-blur-3xl border border-white/10 rounded-2xl p-1 pb-2 opacity-0 pointer-events-none group-hover/speed:opacity-100 group-hover/speed:pointer-events-auto transition-all scale-90 group-hover/speed:scale-100 flex flex-col gap-1 w-20 z-[60]">
                         {[0.5, 1.0, 1.5, 2.0].map(rate => (
                           <button 
                            key={rate} 
                            onClick={() => setPlaybackRate(rate)}
                            className={`p-2 rounded-xl text-[10px] font-black transition-all ${state.playbackRate === rate ? 'bg-white text-black' : 'hover:bg-white/10 text-white/40'}`}
                           >
                             {rate}x
                           </button>
                         ))}
                      </div>
                    </div>
                    <GlassButton active={showLyrics} onClick={() => setShowLyrics(!showLyrics)} accent={theme.accent} className="w-9 h-9">
                       <Mic2 size={16} />
                    </GlassButton>
                  </div>
                </div>
             </GlassCard>
          </div>
        </div>

        {showQueue && <QueueOverlay queue={state.queue} currentSong={state.currentSong} onClose={() => setShowQueue(false)} onRemove={removeFromQueue} onMoveUp={(i) => reorderQueue(i, i-1)} onClear={clearQueue} onPlay={playSong} primary={theme.primary} autoPlay={autoPlay} />}
      </div>
    );
  };

  return (
    <div 
      className="relative w-full h-screen overflow-hidden bg-[#050505] text-white font-sans selection:bg-white/30"
      onClick={unlockAudio}
    >
      {/* Electron Frameless Titlebar — draggable area */}
      <div className="electron-titlebar" style={{ background: 'linear-gradient(180deg, rgba(5,5,5,0.95) 0%, transparent 100%)' }}>
        <div className="flex items-center h-full px-4 gap-2">
          <span className="text-[10px] font-black tracking-[0.3em] uppercase opacity-20 select-none">IZGIV</span>
        </div>
      </div>
      {/* Deep Background Effects */}
      <div className="absolute top-[-20%] left-[-30%] w-[120%] h-[120%] rounded-full mix-blend-screen filter blur-[140px] opacity-20 animate-blob" style={{ backgroundColor: theme.primary }}></div>
      <div className="absolute bottom-[-20%] right-[-30%] w-[120%] h-[120%] rounded-full mix-blend-screen filter blur-[140px] opacity-20 animate-blob animation-delay-2000" style={{ backgroundColor: theme.secondary }}></div>

      <div className="relative z-10 w-full h-full flex flex-col md:flex-row max-w-7xl mx-auto md:p-6" style={{ paddingTop: '36px' }}>
        <div className="hidden md:flex flex-col w-64 backdrop-blur-3xl border border-white/10 rounded-[48px] p-6 mr-6 h-full shadow-2xl bg-white/5 relative overflow-hidden">
          <div className="text-2xl font-black tracking-tighter mb-10 italic select-none">IZGIV</div>
          <nav className="space-y-2 flex-1">
             <SidebarItem icon={<Home size={22}/>} label="Home" active={view === 'home'} onClick={() => { setView('home'); setSelectedPlaylist(null); }} />
             <SidebarItem icon={<Search size={22}/>} label="Search" active={view === 'search'} onClick={() => { setView('search'); setSelectedPlaylist(null); }} />
             <SidebarItem icon={<Library size={22}/>} label="Library" active={view === 'library'} onClick={() => { setView('library'); setSelectedPlaylist(null); }} />
             <SidebarItem icon={<Settings size={22}/>} label="Settings" active={view === 'settings'} onClick={() => { setView('settings'); setSelectedPlaylist(null); }} />
             <SidebarItem icon={<Info size={22}/>} label="About" active={view === 'about'} onClick={() => { setView('about'); setSelectedPlaylist(null); }} />
          </nav>

          <footer className="mt-8">
             <button 
              onClick={importLocalFolder}
              className="w-full p-4 rounded-3xl border border-dashed border-white/20 text-white/40 hover:text-white hover:border-white/40 hover:bg-white/5 transition-all flex items-center justify-center gap-3 group"
             >
               <Plus size={18} className="group-hover:rotate-90 transition-transform duration-300" />
               <span className="text-xs font-bold uppercase tracking-widest">Local Files</span>
             </button>
          </footer>
          <div className="h-1 shrink-0 hidden md:block border-b border-white/5 mb-4 opacity-0" />
          {state.currentSong && (
            <div className="bg-white/5 border border-white/10 rounded-[24px] md:rounded-[32px] p-3 md:p-5 cursor-pointer hover:bg-white/10 transition-all group mt-auto shadow-2xl relative overflow-hidden" onClick={() => setView('player')}>
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <img src={state.currentSong.coverUrl} className="w-full aspect-square rounded-[18px] md:rounded-[24px] object-cover mb-2 md:mb-3 shadow-2xl group-hover:scale-105 transition-transform relative z-10" />
              <div className="font-bold truncate text-[11px] md:text-sm mb-0.5 md:mb-1">{state.currentSong.title}</div>
              <div className="text-[8px] md:text-[10px] text-white/40 truncate tracking-widest uppercase font-black">{state.currentSong.artist}</div>
            </div>
          )}
        </div>

        <main className={`flex-1 relative md:rounded-[48px] md:border md:border-white/10 md:backdrop-blur-3xl overflow-hidden transition-all duration-1000 ${view === 'player' ? 'bg-transparent' : 'bg-black/20'}`}>
          <div className="h-full overflow-y-auto px-4 md:px-8 py-8 custom-scrollbar">
             {selectedPlaylist ? (
               <div className="space-y-6 animate-in fade-in duration-500">
                  <h1 className="text-5xl font-black tracking-tighter mb-8">{selectedPlaylist.name}</h1>
                  <div className="space-y-1">
                    {selectedPlaylist.songs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-40">
                         <div className="w-20 h-20 bg-white/5 rounded-[32px] flex items-center justify-center mb-8 animate-pulse">
                            <Sparkles size={40} className="text-white/20" />
                         </div>
                         <h3 className="text-xl font-bold text-white/40 mb-2 italic">The vibe is elusive today...</h3>
                         <p className="text-white/20 text-[10px] uppercase tracking-widest font-black mb-8 px-12 text-center">AI could not find matching tracks. Try liking more songs first!</p>
                         <button onClick={() => setSelectedPlaylist(null)} className="px-8 py-3 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 text-white/50 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest">Back to Home</button>
                      </div>
                    ) : (
                      selectedPlaylist.songs.map((s, idx) => <SongRow key={`${s.id}-${idx}`} song={s} onClick={() => { addToQueue(s); playSong(s); }} onAddQueue={addToQueue} onOpenPlaylistSelector={setSongToAddToPlaylist} isPlaying={state.currentSong?.id === s.id} likedSongs={likedSongs} toggleLike={toggleLike} />)
                    )}
                  </div>
               </div>
             ) : (
               <>
                 {view === 'home' && renderHome()}
                 {view === 'search' && renderSearch()}
                 {view === 'settings' && renderSettings()}
                 {view === 'about' && renderAbout()}
                 {view === 'library' && (
                    <div className="space-y-10">
                       <GlassCard className="!p-8 !rounded-[48px] flex items-center gap-8 border-white/10">
                          <img src={userProfile.avatar} className="w-32 h-32 rounded-full border-4 border-white/20 p-1 shadow-2xl" alt="Avatar" />
                          <div>
                             <h1 className="text-3xl font-black text-white">{userProfile.name}</h1>
                             <p className="text-white/30 font-medium uppercase tracking-widest text-[10px] mt-1">Creator</p>
                          </div>
                       </GlassCard>
                       <section>
                          <div className="flex justify-between items-center mb-6 px-4">
                             <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">My Collection</h2>
                             <button onClick={() => setShowCreatePlaylistModal(true)} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-all border border-white/10"><Plus size={20}/></button>
                          </div>
                          <div className="space-y-4">
                             {/* Liked Songs "Virtual" Playlist */}
                             <div 
                                onClick={() => setSelectedPlaylist({ id: 'liked', name: 'Liked Songs', songs: likedSongs })} 
                                className="p-4 bg-gradient-to-br from-red-500/20 to-transparent rounded-[32px] border border-red-500/10 hover:border-red-500/30 cursor-pointer flex items-center justify-between group transition-all"
                              >
                                 <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-400 group-hover:scale-110 transition-transform border border-red-500/10"><Heart size={28} fill="currentColor" /></div>
                                    <div>
                                       <span className="block font-bold text-white text-lg">Liked Songs</span>
                                       <span className="text-[9px] font-black uppercase tracking-widest text-red-400/60">{likedSongs.length} Favorites</span>
                                    </div>
                                 </div>
                                 <ChevronRight size={18} className="text-red-400/20 group-hover:text-red-400 transition-colors"/>
                              </div>

                             {localPlaylists.map(p => (
                               <div key={p.id} onClick={() => setSelectedPlaylist(p)} className="p-4 bg-white/5 rounded-[32px] border border-white/5 hover:border-white/10 cursor-pointer flex items-center justify-between group transition-all">
                                  <div className="flex items-center gap-4">
                                     <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-white/10 group-hover:text-white transition-colors border border-white/5"><ListMusic size={28}/></div>
                                     <div>
                                        <span className="block font-bold text-white">{p.name}</span>
                                        <span className="text-[9px] font-black uppercase tracking-widest text-white/20">{p.songs.length} Tracks</span>
                                     </div>
                                  </div>
                                  <ChevronRight size={18} className="text-white/10 group-hover:text-white transition-colors"/>
                               </div>
                             ))}
                          </div>
                       </section>
                    </div>
                 )}
                 {view === 'player' && renderPlayer()}
               </>
             )}
          </div>
          
          <NavBar 
            currentView={view} 
            setView={(v) => { setView(v); setSelectedPlaylist(null); }} 
            accent={theme.accent} showLyrics={showLyrics}
            onToggleLyrics={() => setShowLyrics(!showLyrics)}
            showAudioControls={showAudioControls}
            onToggleAudioControls={() => setShowAudioControls(!showAudioControls)}
          />

          {/* Mobile Floating Mini-Player */}
          {!isMini && view !== 'player' && state.currentSong && (
            <div 
              onClick={() => setView('player')}
              className="md:hidden fixed bottom-24 left-4 right-4 z-[45] bg-black/60 backdrop-blur-2xl border border-white/10 rounded-full p-2 flex items-center justify-between shadow-2xl animate-in slide-in-from-bottom-10 duration-500"
            >
               <div className="flex items-center gap-3 ml-1">
                  <img src={state.currentSong.coverUrl} className="w-10 h-10 rounded-full border border-white/10 animate-spin-slow shadow-lg" />
                  <div className="max-w-[120px]">
                     <div className="text-[10px] font-black text-white truncate">{state.currentSong.title}</div>
                     <div className="text-[8px] font-bold text-white/40 truncate uppercase tracking-widest">{state.currentSong.artist}</div>
                  </div>
               </div>
               <div className="flex items-center gap-2 mr-1">
                  <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white">
                     {state.isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="translate-x-0.5" />}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); nextSong(); }} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40">
                     <SkipForward size={18} fill="currentColor" />
                  </button>
               </div>
            </div>
          )}
        </main>
      </div>

      {/* AI Vibe Shift Overlay */}
      {isVibeShifting && (
        <div className="fixed inset-0 z-[1000] bg-black/90 backdrop-blur-[100px] flex flex-col items-center justify-center animate-in fade-in duration-700">
           <div className="relative mb-16">
              <div className="absolute inset-[-100%] rounded-full blur-[120px] mix-blend-screen animate-pulse ring-8 ring-white/10" style={{ backgroundColor: theme.primary }}></div>
              <div className="absolute inset-[-100%] rounded-full blur-[120px] mix-blend-screen animate-pulse animation-delay-2000" style={{ backgroundColor: theme.secondary }}></div>
              <Sparkles size={80} className="text-white animate-bounce relative z-10" />
           </div>
           <h2 className="text-5xl font-black text-white italic tracking-tighter mb-4 animate-pulse select-none">Shifting Vibe...</h2>
           <div className="flex items-center gap-4">
              <div className="w-12 h-[1px] bg-white/20"></div>
              <p className="text-white/40 font-black uppercase tracking-[0.5em] text-[10px] select-none">Consulting Gemini AI</p>
              <div className="w-12 h-[1px] bg-white/20"></div>
           </div>
           <div className="mt-12 flex gap-1.5 h-6">
              {[0, 1, 2].map((i) => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-white animate-bounce" style={{ animationDelay: `${i * 0.2}s` }}></div>
              ))}
           </div>
        </div>
      )}

      {/* Identity Setup Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
           <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={() => setShowLoginModal(false)}></div>
           <GlassCard className="relative w-full max-w-md !p-12 !rounded-[64px] animate-in zoom-in-95 duration-300 border-white/10">
             <div className="text-center mb-10">
               <div className="w-24 h-24 bg-white/5 text-white rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-2xl transition-all duration-1000"><User size={48} /></div>
               <h2 className="text-4xl font-black text-white mb-3 tracking-tighter">Your Handle</h2>
               <p className="text-white/40 text-sm font-medium">Choose a name to personalize your experience.</p>
             </div>
             <form onSubmit={handleLogin} className="space-y-8">
               <input 
                 type="text" placeholder="Choose a name..." required autoFocus
                 className="w-full bg-white/5 border border-white/10 rounded-3xl py-5 px-8 text-white focus:outline-none focus:border-red-500/50 transition-all font-bold text-xl text-center" 
                 value={userProfile.name === "Guest Listener" ? "" : userProfile.name}
                 onChange={(e) => setUserProfile({ ...userProfile, name: e.target.value })}
               />
               <button type="submit" className="w-full py-5 bg-white text-black font-black rounded-3xl shadow-2xl hover:scale-[1.02] active:scale-95 transition-all text-lg">
                 Join IZGIV
               </button>
             </form>
           </GlassCard>
        </div>
      )}

      {/* Create Playlist Modal */}
      {showCreatePlaylistModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl" onClick={() => setShowCreatePlaylistModal(false)}>
           <GlassCard className="relative w-full max-w-sm !p-10 !rounded-[48px] animate-in zoom-in-95 border-white/10" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-2xl font-black mb-8 text-center">New Playlist</h2>
              <form onSubmit={createPlaylist} className="space-y-6">
                 <input type="text" placeholder="Vibe Name" required autoFocus className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white text-center font-bold" value={newPlaylistName} onChange={(e) => setNewPlaylistName(e.target.value)} />
                 <button type="submit" className="w-full py-4 bg-white text-black font-black rounded-2xl shadow-xl">Create</button>
              </form>
           </GlassCard>
        </div>
      )}

      {/* Playlist Selector */}
      {songToAddToPlaylist && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl" onClick={() => setSongToAddToPlaylist(null)}>
           <GlassCard className="relative w-full max-w-sm !p-8 !rounded-[48px] animate-in zoom-in-95 border-white/10" onClick={(e) => e.stopPropagation()}>
             <h3 className="text-xl font-black mb-8 text-center text-white/40 uppercase tracking-widest text-[10px]">Add to Collection</h3>
             <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar pr-2">
               {localPlaylists.map(p => (
                 <button key={p.id} onClick={() => addSongToLocalPlaylist(songToAddToPlaylist, p.id)} className="w-full p-4 rounded-[28px] bg-white/5 hover:bg-white/10 text-left flex items-center gap-4 transition-all border border-transparent hover:border-white/10">
                   <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-white/10"><ListMusic size={24}/></div>
                   <span className="font-bold truncate flex-1 text-white">{p.name}</span>
                   <Plus size={16} className="text-white/10" />
                 </button>
               ))}
               {localPlaylists.length === 0 && <p className="text-center text-white/20 py-8 italic">No playlists yet...</p>}
             </div>
           </GlassCard>
        </div>
      )}

       {/* Mini-Player View */}
       {isMini && (
         <div className="fixed inset-0 z-[10000] bg-black/90 backdrop-blur-3xl flex flex-col p-8 select-none drag border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.8)]">
            <div className="flex justify-between items-center mb-8 no-drag">
               <div className="flex items-center gap-2">
                 <button 
                    onClick={() => setAlwaysOnTop(!alwaysOnTop)}
                    className={`p-2 transition-all rounded-xl border ${alwaysOnTop ? 'bg-white/10 text-white border-white/20' : 'text-white/20 hover:text-white bg-white/5 border-transparent'}`}
                    title={alwaysOnTop ? "Always on Top: ON" : "Always on Top: OFF"}
                 >
                    <Pin size={16} className={alwaysOnTop ? "fill-current" : ""}/>
                 </button>
                 <button 
                   onClick={() => (window as any).electronAPI?.toggleMiniPlayer(false)} 
                   className="p-2 text-white/20 hover:text-white transition-all bg-white/5 rounded-xl hover:bg-white/10"
                   title="Exit Mini-Player"
                 >
                   <Maximize2 size={16} />
                 </button>
               </div>
               <div className="text-[9px] font-black uppercase tracking-[0.6em] text-white/30 ml-4">IZGIV</div>
               <div className="w-10" />
            </div>
            
            <div className="flex-1 flex flex-col items-center justify-center gap-6 no-drag">
               <div className="relative w-40 h-40 rounded-[48px] overflow-hidden shadow-[0_40px_80px_rgba(0,0,0,0.5)] ring-1 ring-white/10 group">
                 <img src={state.currentSong?.coverUrl} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                 {!state.isPlaying && <div className="absolute inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center animate-in fade-in"><Pause size={48} className="text-white/60" /></div>}
               </div>
               
               <div className="text-center w-full px-6">
                  <h2 className="font-black text-white truncate text-base mb-1 tracking-tight">{state.currentSong?.title || 'No Track'}</h2>
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/40 truncate">{state.currentSong?.artist || 'Unknown'}</p>
               </div>
            </div>
 
            <div className="mt-auto flex items-center justify-center gap-8 no-drag pb-4">
               <button 
                 onClick={() => (window as any).electronAPI?.sendMediaCmd ? (window as any).electronAPI.sendMediaCmd('prev') : prevSong()} 
                 className="text-white/40 hover:text-white transition-colors"
               >
                 <SkipBack size={24} fill="currentColor" />
               </button>
               <button 
                 onClick={() => (window as any).electronAPI?.sendMediaCmd ? (window as any).electronAPI.sendMediaCmd('toggle') : togglePlay()} 
                 className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform"
               >
                 {state.isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="translate-x-0.5" />}
               </button>
               <button 
                 onClick={() => (window as any).electronAPI?.sendMediaCmd ? (window as any).electronAPI.sendMediaCmd('next') : nextSong()} 
                 className="text-white/40 hover:text-white transition-colors"
               >
                 <SkipForward size={24} fill="currentColor" />
               </button>
            </div>
         </div>
       )}
    </div>
  );
}


const formatTime = (time: number) => {
  if (!time || isNaN(time)) return '0:00';
  const m = Math.floor(time / 60);
  const s = Math.floor(time % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
