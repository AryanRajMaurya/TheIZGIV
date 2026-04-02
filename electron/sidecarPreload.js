/**
 * sidecarPreload.js — High-Precision Pro-Sync Bridge.
 * Dedicated to smooth seeking and perfect queue advancement.
 */
const { ipcRenderer } = require('electron');

// ─── DOM UTILS ─────────────────────────────────────────────────────────────

function getVideo() {
    return document.querySelector('video');
}

function clickControl(selector) {
    const btn = document.querySelector(selector);
    if (btn) btn.click();
}

// ─── AD BLOCKER & QUEUE PROTECTION ─────────────────────────────────────────

function runProScripts() {
    // 1. Force engagement (no pause)
    setInterval(() => {
        const confirmBtn = document.querySelector('ytmusic-you-there-renderer .yt-spec-button-shape-next--filled');
        if (confirmBtn) confirmBtn.click();
        
        const autoplayToggle = document.querySelector('ytmusic-player-bar .autoplay-toggle');
        if (autoplayToggle && autoplayToggle.getAttribute('aria-pressed') === 'true') {
            autoplayToggle.click();
        }
    }, 1000);

    // 2. High-speed Ad-Blocking
    setInterval(() => {
        const skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern');
        if (skipBtn) skipBtn.click();

        const video = getVideo();
        if (video) {
            const isAd = document.querySelector('.ad-showing, .ytp-ad-player-overlay');
            if (isAd) {
                video.muted = true;
                if (video.currentTime > 0) video.currentTime = video.duration - 0.1;
            } else if (video.muted && !window.shouldBeMuted) {
                video.muted = false;
            }
        }
    }, 100);
}

// ─── IPC CONTROLS ──────────────────────────────────────────────────────────

ipcRenderer.on('sidecar-play', (_, videoId) => {
    window.location.href = `https://music.youtube.com/watch?v=${videoId}`;
});

ipcRenderer.on('sidecar-command', (_, { type, value }) => {
    const video = getVideo();
    if (!video) return;

    switch (type) {
        case 'play': video.play(); break;
        case 'pause': video.pause(); break;
        case 'toggle': video.paused ? video.play() : video.pause(); break;
        case 'seek': video.currentTime = value; break;
        case 'volume': 
            video.volume = value;
            window.shouldBeMuted = (value === 0);
            break;
        case 'speed': video.playbackRate = value; break;
        case 'next': clickControl('.next-button'); break;
        case 'prev': clickControl('.previous-button'); break;
    }
});

// ─── ULTRA-SMOOTH STATE SYNC (20Hz) ────────────────────────────────────────

setInterval(() => {
    try {
        const video = getVideo();
        if (!video) return;

        const metadata = navigator.mediaSession.metadata;
        const state = {
            isPlaying: !video.paused,
            currentTime: video.currentTime,
            duration: video.duration || 0,
            ended: video.ended,
            videoId: new URLSearchParams(window.location.search).get('v'),
            isAd: !!document.querySelector('.ad-showing, .ytp-ad-player-overlay'),
            title: metadata?.title || '',
            artist: metadata?.artist || '',
            thumbnail: metadata?.artwork?.[0]?.src || ''
        };
        ipcRenderer.send('sidecar-state-update', state);
    } catch (e) {}
}, 100);

window.addEventListener('DOMContentLoaded', runProScripts);
