import { useState, useRef, useEffect, useCallback } from 'react';
import { Song, PlayerState } from '../types';
import { resolveAudioUrl, searchMusic, getSuggestions } from '../services/api';

export const usePlayer = (autoPlay: boolean = true) => {
  const audioRef = useRef<HTMLAudioElement>(new Audio());
  const activeRequestId = useRef<number>(0);
  const retryCount = useRef<number>(0);
  const isUserDraggingRef = useRef<boolean>(false);
  const lastSeekTimeRef = useRef<number>(0);
  const lastManualActionRef = useRef<number>(0);
  const historyRef = useRef<Song[]>([]);
  
  // ─── Web Audio API (EQ & Visualizer) ───────────────────────────────────────
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const eqFiltersRef = useRef<BiquadFilterNode[]>([]);
  const gainNodeRef = useRef<GainNode | null>(null);

  const [eqGains, setEqGains] = useState<number[]>(new Array(10).fill(0));
  const [isAudioContextInitialized, setIsAudioContextInitialized] = useState(false);

  const initAudioContext = useCallback(() => {
    if (audioContextRef.current) return;
    
    const context = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = context;

    // Create 10-band EQ
    const frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    const filters = frequencies.map(freq => {
      const filter = context.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = 1.41;
      filter.gain.value = 0;
      return filter;
    });
    eqFiltersRef.current = filters;

    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyserNodeRef.current = analyser;

    const gainNode = context.createGain();
    gainNodeRef.current = gainNode;

    const source = context.createMediaElementSource(audioRef.current);
    sourceNodeRef.current = source;

    // Connect: Source -> Filters -> Analyser -> Gain -> Destination
    let lastNode: AudioNode = source;
    filters.forEach(filter => {
      lastNode.connect(filter);
      lastNode = filter;
    });
    lastNode.connect(analyser);
    analyser.connect(gainNode);
    gainNode.connect(context.destination);

    setIsAudioContextInitialized(true);
  }, []);

  const updateEqGain = useCallback((index: number, gain: number) => {
    if (eqFiltersRef.current[index]) {
      eqFiltersRef.current[index].gain.value = gain;
      setEqGains(prev => {
        const next = [...prev];
        next[index] = gain;
        return next;
      });
    }
  }, []);

  const [state, setState] = useState<PlayerState>({
    currentSong: null,
    isPlaying: false,
    queue: [],
    volume: 1,
    currentTime: 0,
    duration: 0,
    shuffled: false,
    repeat: 'off',
    playbackRate: 1.0,
    preservesPitch: true,
  });
  const [isTransitioning, setIsTransitioning] = useState(false);
  const isElectron = !!(window as any).electronAPI;
  const [isLoading, setIsLoading] = useState(false);
  const [useSidecar, setUseSidecar] = useState(isElectron);

  const handlePlaybackError = useCallback((song: Song) => {
      setIsLoading(false);
      if (retryCount.current < 2) {
          retryCount.current++;
          setTimeout(() => playSong(song, true), 500);
      } else {
          retryCount.current = 0;
          nextSong();
      }
  }, [state.queue, state.currentSong, state.repeat, autoPlay]);

  const playSong = useCallback(async (song: Song, isRetry = false) => {
    const reqId = Date.now();
    activeRequestId.current = reqId;
    lastManualActionRef.current = reqId;
    lastSeekTimeRef.current = reqId;
    setIsLoading(true);

    if (!isRetry) {
        retryCount.current = 0;
        setIsTransitioning(true);
        
        // Add current to history before switching
        if (state.currentSong) {
          historyRef.current = [state.currentSong, ...historyRef.current].slice(0, 50);
        }

        // FETCH HIGH-RES POSTER FROM ITUNES
        const itunesResults = await searchMusic(`${song.title} ${song.artist}`, 1).catch(() => []);
        const highResCover = itunesResults.length > 0 ? itunesResults[0].coverUrl : song.coverUrl;

        setState(prev => {
            const newQueue = prev.queue.filter(s => s.id !== song.id);
            return { 
                ...prev, 
                currentSong: { ...song, coverUrl: highResCover }, 
                isPlaying: false, 
                duration: song.duration, 
                currentTime: 0,
                queue: newQueue
            };
        });

        setTimeout(() => setIsTransitioning(false), 400); 
    }

    const audio = audioRef.current;
    audio.pause();
    
    const isElectron = !!(window as any).electronAPI;
    setUseSidecar(isElectron);

    if (isElectron) {
        try {
            let videoId = (song as any).videoId;
            if (!videoId) {
                const result = await resolveAudioUrl(song);
                videoId = (song as any).videoId || result?.split('://')[1];
            }
            if (!videoId) throw new Error("Could not locate videoId");
            await (window as any).electronAPI.sidecarPlay(videoId);
            // Apply current speed preference to the new track
            setTimeout(() => {
                if (useSidecar && (window as any).electronAPI.sidecarCmd) {
                    (window as any).electronAPI.sidecarCmd({ type: 'speed', value: state.playbackRate });
                }
            }, 1500); 
            setIsLoading(false);
            return;
        } catch (err) {
            setUseSidecar(false);
        }
    }

    let url = song.url;
    try {
      if (!url || isRetry) url = await resolveAudioUrl(song, isRetry);
      if (activeRequestId.current !== reqId) return;
      if (!url) { handlePlaybackError(song); return; }
      
      audio.src = url;
      audio.load();
      audio.playbackRate = state.playbackRate;
      await audio.play();
      
      setState(prev => ({ 
        ...prev, 
        isPlaying: true, 
        duration: audio.duration && audio.duration !== Infinity ? audio.duration : song.duration 
    }));
    } catch (err: any) { 
       handlePlaybackError(song); 
    } 
    finally { if (activeRequestId.current === reqId) setIsLoading(false); }
  }, [state.playbackRate, state.currentSong]); 

  const togglePlay = useCallback(() => {
    if (useSidecar) {
        (window as any).electronAPI.sidecarCmd({ type: 'toggle' });
        return;
    }
    if (state.isPlaying) {
      audioRef.current.pause();
      setState(prev => ({ ...prev, isPlaying: false }));
    } else {
      if (audioRef.current.src) {
         if (!isAudioContextInitialized) initAudioContext();
         if (audioContextRef.current?.state === 'suspended') audioContextRef.current.resume();
         
         audioRef.current.play()
           .then(() => setState(prev => ({ ...prev, isPlaying: true })))
           .catch(() => { if (state.currentSong) playSong(state.currentSong); });
      } else if (state.currentSong) {
        if (!isAudioContextInitialized) initAudioContext();
        playSong(state.currentSong);
      }
    }
  }, [state.isPlaying, state.currentSong, useSidecar, playSong]);

  const nextSong = useCallback(async () => {
    lastManualActionRef.current = Date.now();
    if (state.queue.length > 0) {
      const next = state.queue[0];
      setState(prev => ({ ...prev, queue: prev.queue.slice(1) }));
      playSong(next);
      return;
    }
    if (autoPlay && state.currentSong) {
      setIsLoading(true);
      try {
        const results = await getSuggestions(state.currentSong);
        // Avoid skipping to the SAME song again
        const filtered = results.filter((s: Song) => s.id !== state.currentSong?.id);
        if (filtered.length > 0) playSong(filtered[0]);
        else if (results.length > 0) playSong(results[0]); // fallback if all same
      } catch (err) {
      } finally {
        setIsLoading(false);
      }
      return;
    }
    audioRef.current.pause();
    setState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
  }, [state.queue, state.currentSong, autoPlay, playSong]);

  const prevSong = useCallback(() => {
    if (historyRef.current.length > 0) {
      const prev = historyRef.current[0];
      historyRef.current = historyRef.current.slice(1);
      playSong(prev);
    } else {
      seek(0);
    }
  }, [playSong]);

  // ─── Sidecar State Sync —————————————————————————————————————————————————──
  useEffect(() => {
    if (!isElectron) return;
    const removeListener = (window as any).electronAPI.onSidecarState((sidecarState: any) => {
      if (useSidecar) {
        const now = Date.now();
        const isRecentlySeeking = now - lastSeekTimeRef.current < 1000;
        const isRecentlyCommanded = now - lastManualActionRef.current < 4500;
        setState(prev => {
            const currentVideoId = (prev.currentSong as any)?.videoId || prev.currentSong?.id;
            const mismatch = sidecarState.videoId && currentVideoId && sidecarState.videoId !== currentVideoId;
            if (mismatch) {
                if (isRecentlyCommanded) return { ...prev, isPlaying: sidecarState.isPlaying && !sidecarState.isAd };
                if (!sidecarState.isAd && sidecarState.title && sidecarState.title !== prev.currentSong?.title) {
                    searchMusic(`${sidecarState.title} ${sidecarState.artist}`, 1).then(results => {
                        if (results.length > 0) {
                            setState(current => ({
                                ...current,
                                currentSong: current.currentSong?.title === sidecarState.title ? { ...current.currentSong, coverUrl: results[0].coverUrl } : current.currentSong
                            } as any));
                        }
                    });
                    return {
                        ...prev,
                        currentSong: { ...prev.currentSong, id: sidecarState.videoId, videoId: sidecarState.videoId, title: sidecarState.title, artist: sidecarState.artist, duration: sidecarState.duration || prev.currentSong?.duration } as Song,
                        currentTime: sidecarState.currentTime,
                        duration: sidecarState.duration || prev.duration,
                        isPlaying: sidecarState.isPlaying && !sidecarState.isAd
                    };
                }
            }
            return {
                ...prev,
                currentTime: isRecentlySeeking ? prev.currentTime : sidecarState.currentTime,
                duration: (sidecarState.duration && sidecarState.duration > 0) ? sidecarState.duration : prev.duration,
                isPlaying: sidecarState.isPlaying && !sidecarState.isAd
            };
        });
      }
    });
    return () => removeListener();
  }, [useSidecar, isElectron]);

  // ─── Global Media Keys ————————————————————————————————————————————————————
  useEffect(() => {
    if (!isElectron) return;
    const removeMediaListener = (window as any).electronAPI.onMediaCmd((cmd: string) => {
      if (cmd === 'toggle') togglePlay();
      else if (cmd === 'next') nextSong();
      else if (cmd === 'prev') prevSong();
    });
    return () => removeMediaListener();
  }, [isElectron, togglePlay, nextSong, prevSong]);

  const setPlaybackRate = useCallback((rate: number) => {
    audioRef.current.playbackRate = rate;
    const isElectron = !!(window as any).electronAPI;
    if (isElectron && useSidecar) {
        (window as any).electronAPI.sidecarCmd({ type: 'speed', value: rate });
    }
    setState(prev => ({ ...prev, playbackRate: rate }));
  }, [useSidecar]);

  const setPreservesPitch = useCallback((preserve: boolean) => {
    const audio = audioRef.current as any;
    if ('preservesPitch' in audio) audio.preservesPitch = preserve;
    else if ('mozPreservesPitch' in audio) audio.mozPreservesPitch = preserve;
    setState(prev => ({ ...prev, preservesPitch: preserve }));
  }, []);

  const seek = useCallback((time: number) => {
    lastSeekTimeRef.current = Date.now();
    if (useSidecar) {
        (window as any).electronAPI.sidecarCmd({ type: 'seek', value: time });
        setState(prev => ({ ...prev, currentTime: time }));
        return;
    }
    const audio = audioRef.current;
    if (audio && !isNaN(time)) {
      try {
        lastSeekTimeRef.current = Date.now();
        audio.currentTime = time;
        setState(prev => ({ ...prev, currentTime: time }));
      } catch (err) {}
    }
  }, [useSidecar]);

  const setIsDragging = useCallback((dragging: boolean) => {
    isUserDraggingRef.current = dragging;
  }, []);

  const addToQueue = useCallback((s: Song) => {
    setState(prev => ({ ...prev, queue: [...prev.queue, s] }));
    resolveAudioUrl(s).then(resolvedUrl => {
      if (resolvedUrl) {
        setState(prev => ({
          ...prev,
          queue: prev.queue.map(item => item.id === s.id ? { ...item, url: resolvedUrl } : item)
        }));
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    const onEnded = () => {
      if (state.repeat === 'one') {
        if (useSidecar) {
          (window as any).electronAPI.sidecarCmd({ type: 'seek', value: 0 });
          (window as any).electronAPI.sidecarCmd({ type: 'play' });
        } else {
          audio.currentTime = 0;
          audio.play().catch(() => {});
        }
      } else nextSong();
    };
    const onDurationChange = () => {
       if (audio.duration && audio.duration !== Infinity && audio.duration > 0) {
         setState(prev => ({ ...prev, duration: audio.duration }));
       }
    };
    const onTimeUpdate = () => {
      if (isUserDraggingRef.current) return;
      if (audio.seeking) return;
      if (Date.now() - lastSeekTimeRef.current < 500) return;
      setState(prev => ({ ...prev, currentTime: audio.currentTime }));
    };
    const onError = () => {
        if (state.currentSong && activeRequestId.current && audio.src) {
            if (audio.error?.code === MediaError.MEDIA_ERR_ABORTED) return;
            handlePlaybackError(state.currentSong);
        }
    };
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('error', onError);
    };
  }, [state.currentSong, state.repeat, nextSong, handlePlaybackError, useSidecar]); 

  return {
    state,
    isLoading,
    isTransitioning,
    playSong,
    togglePlay,
    addToQueue,
    removeFromQueue: (i: number) => setState(prev => ({ ...prev, queue: prev.queue.filter((_, idx) => idx !== i) })),
    reorderQueue: (f: number, t: number) => setState(prev => {
      const q = [...prev.queue];
      const [r] = q.splice(f, 1);
      q.splice(t, 0, r);
      return { ...prev, queue: q };
    }),
    clearQueue: () => setState(prev => ({ ...prev, queue: [] })),
    nextSong,
    prevSong,
    seek,
    setIsDragging,
    setPlaybackRate,
    setPreservesPitch,
    // EQ & Viz Exports
    eqGains,
    updateEqGain,
    analyser: analyserNodeRef.current,
    audioContext: audioContextRef.current,
    syncState: (newState: any) => setState(prev => ({ ...prev, ...newState }))
  };
};