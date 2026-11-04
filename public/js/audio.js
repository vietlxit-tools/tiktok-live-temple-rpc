/**
 * TempleAudioEngine
 * - Nhạc nền: Phát file "Nam Mô A Di Đà Phật.mp3" (/assets/sutra_nammoadida.mp3) lặp vô tận trang nghiêm,
 *   tự động hạ nhỏ âm lượng êm ái (smooth crossfade ducking) khi có giọng đọc lời khấn nghi lễ.
 * - Pháp khí: Web Audio API synthesis tiếng Mõ gỗ, Đại Hồng Chung, Ống xăm, Chuông ngọc
 *   qua Master Dynamics Compressor/Limiter để chống rè, chống vỡ tiếng và chống chói tai.
 * - Giọng đọc: Hàng đợi ZeroTTS có phân cấp ưu tiên (Priority Queue):
 *   Nghi lễ tâm linh (Khấn nguyện, Thỉnh chuông, Xin xăm) luôn được ưu tiên cao nhất,
 *   Lời chào viewer vào live (nếu bật) là ưu tiên phụ và KHÔNG BAO GIỜ làm giảm âm lượng MP3.
 */
class TempleAudioEngine {
  constructor() {
    this.ctx = null;
    this.compressor = null;
    this.unlocked = false;
    this.sfxEnabled = true;
    this.bgMusicEnabled = true;
    this.ttsEnabled = true;
    this.ttsVoice = 'maichi';

    // Nhạc nền & Tụng kinh MP3 — mặc định 65%, cho phép chỉnh 0% - 100%
    const savedMusicVol = parseFloat(localStorage.getItem('temple_music_vol'));
    const savedTtsVol = parseFloat(localStorage.getItem('temple_tts_vol'));
    const savedSutraVol = parseFloat(localStorage.getItem('temple_sutra_vol'));
    const initialVol = Number.isFinite(savedMusicVol)
      ? Math.max(0, Math.min(1, savedMusicVol))
      : (Number.isFinite(savedSutraVol) ? Math.max(0, Math.min(1, savedSutraVol)) : 0.65);

    this.bgBaseVolume = initialVol;
    this.sutraVolume = initialVol;
    this.ttsVolume = Number.isFinite(savedTtsVol) ? Math.max(0, Math.min(1, savedTtsVol)) : 0.95;

    this.useSynthMusicFallback = false;
    this.synthBgTimer = null;
    this.chantInterval = null;
    this.duckingRaf = null;
    this.isDuckingActive = false;
    this.defaultBgUrl = '/assets/sutra_nammoadida.mp3';
    this.currentSutraUrl = null;

    // Singleton audio elements to avoid Chromium WebMediaPlayer leak (limit 75)
    this.sutraAudio = null;
    this.ttsAudio = typeof Audio !== 'undefined' ? new Audio() : null;
    this._ttsUnlocked = false;

    this.ttsQueue = [];
    this.ttsPlaying = false;
    this.currentTtsItem = null;
    this.currentAudio = null;
    this.onTtsStateChange = null;
    this.lastPlayedItem = null;
  }

  // --------------------------------------------------------------------------
  // 0. KHỞI TẠO WEB AUDIO CONTEXT & MASTER COMPRESSOR / LIMITER
  // --------------------------------------------------------------------------
  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.initMasterCompressor();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this.unlocked = true;
    this.unlockTtsAudio();
    return this.ctx;
  }

  unlockTtsAudio() {
    if (this._ttsUnlocked) return;
    try {
      if (!this.ttsAudio && typeof Audio !== 'undefined') {
        this.ttsAudio = new Audio();
      }
      if (this.ttsAudio) {
        this.ttsAudio.preload = 'auto';
        this.ttsAudio.volume = this.ttsVolume;
        // Silent payload nạp quyền Autoplay cho phần tử ttsAudio trong User Gesture
        this.ttsAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
        const p = this.ttsAudio.play();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            this.ttsAudio.pause();
            this.ttsAudio.currentTime = 0;
            this._ttsUnlocked = true;
          }).catch(() => {});
        } else {
          this._ttsUnlocked = true;
        }
      }
    } catch (_) {}
  }

  initMasterCompressor() {
    if (!this.ctx || this.compressor) return;
    try {
      // Bộ nén và giới hạn động lực học giúp âm thanh trang nghiêm, ấm áp, không bị vỡ tiếng (0dBFS clip)
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.setValueAtTime(-6, this.ctx.currentTime);
      comp.knee.setValueAtTime(10, this.ctx.currentTime);
      comp.ratio.setValueAtTime(8, this.ctx.currentTime);
      comp.attack.setValueAtTime(0.005, this.ctx.currentTime);
      comp.release.setValueAtTime(0.12, this.ctx.currentTime);
      comp.connect(this.ctx.destination);
      this.compressor = comp;
    } catch (_) {
      this.compressor = null;
    }
  }

  getOutputNode() {
    this.ensureContext();
    return this.compressor || (this.ctx ? this.ctx.destination : null);
  }

  // --------------------------------------------------------------------------
  // 1. NHẠC NỀN & FILE MP3 TỤNG KINH (PHÁT XUYÊN SUỐT, AUTO-DUCKING KHI CÓ GIỌNG ĐỌC)
  // --------------------------------------------------------------------------
  getDuckedVolume() {
    return Math.max(0.06, +(this.bgBaseVolume * 0.25).toFixed(2));
  }

  getDuckedSutraVolume() {
    return Math.max(0.06, +(this.sutraVolume * 0.25).toFixed(2));
  }

  smoothSetVolume(audioEl, targetVol, durationMs = 250) {
    if (!audioEl) return;
    if (this.duckingRaf) {
      cancelAnimationFrame(this.duckingRaf);
      this.duckingRaf = null;
    }
    const target = Math.max(0, Math.min(1, targetVol));
    const startVol = audioEl.volume;
    const diff = target - startVol;
    if (Math.abs(diff) < 0.01) {
      audioEl.volume = target;
      return;
    }
    const startTime = performance.now();
    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      audioEl.volume = Math.max(0, Math.min(1, startVol + diff * progress));
      if (progress < 1) {
        this.duckingRaf = requestAnimationFrame(step);
      } else {
        this.duckingRaf = null;
      }
    };
    this.duckingRaf = requestAnimationFrame(step);
  }

  setMusicVolume(vol) {
    const v = Math.max(0, Math.min(1, Number(vol)));
    if (!Number.isFinite(v)) return;
    this.bgBaseVolume = v;
    this.sutraVolume = v;
    try {
      localStorage.setItem('temple_music_vol', String(v));
      localStorage.setItem('temple_sutra_vol', String(v));
    } catch (_) {}
    if (this.sutraAudio) {
      this.sutraAudio.volume = this.isDuckingActive ? this.getDuckedSutraVolume() : this.sutraVolume;
    }
  }

  setSutraVolume(vol) {
    this.setMusicVolume(vol);
  }

  setTtsVolume(vol) {
    const v = Math.max(0, Math.min(1, Number(vol)));
    if (!Number.isFinite(v)) return;
    this.ttsVolume = v;
    try {
      localStorage.setItem('temple_tts_vol', String(v));
    } catch (_) {}
    if (this.ttsAudio) {
      this.ttsAudio.volume = this.ttsVolume;
    }
  }

  startZenAmbience() {
    this.bgMusicEnabled = true;
    if (this.sutraAudio) {
      if (this.sutraAudio.paused && this.currentSutraUrl) {
        this.sutraAudio.volume = this.isDuckingActive ? this.getDuckedSutraVolume() : this.sutraVolume;
        const p = this.sutraAudio.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
      return;
    }
    this.playSutraAudio(this.defaultBgUrl, {
      loop: true,
      isBackgroundDefault: true
    });
  }

  startDefaultZenSynthLoop() {
    if (!this.bgMusicEnabled || this.synthBgTimer) return;
    const PENTATONIC = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
    let step = 0;
    const playZenNote = () => {
      if (!this.bgMusicEnabled || !this.ctx || this.isSutraPlaying()) return;
      try {
        const out = this.getOutputNode();
        if (!out) return;
        const now = this.ctx.currentTime;
        const freq = PENTATONIC[step % PENTATONIC.length];
        step++;
        const vol = (this.isDuckingActive ? this.getDuckedVolume() : this.bgBaseVolume) * 0.15;
        if (vol <= 0.002) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(vol, now + 0.6);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 4.2);

        osc.connect(gain);
        gain.connect(out);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
        osc.start(now);
        osc.stop(now + 4.25);
      } catch (_) {}
    };
    playZenNote();
    this.synthBgTimer = setInterval(playZenNote, 3600);
  }

  stopZenAmbience() {
    this.bgMusicEnabled = false;
    this.stopSutraAudio(false);
    if (this.synthBgTimer) {
      clearInterval(this.synthBgTimer);
      this.synthBgTimer = null;
    }
  }

  setBgDucking(ducked) {
    try {
      this.isDuckingActive = Boolean(ducked);
      const targetVol = this.isDuckingActive ? this.getDuckedSutraVolume() : this.sutraVolume;
      if (this.sutraAudio) {
        this.smoothSetVolume(this.sutraAudio, targetVol, 250);
      }
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 2. TIẾNG MÕ GỖ TỤNG KINH (WOODEN FISH PERCUSSION SYNTH)
  // --------------------------------------------------------------------------
  playWoodenFish(pitchMultiplier = 1.0) {
    if (!this.sfxEnabled) return;
    try {
      const out = this.getOutputNode();
      if (!out || !this.ctx) return;
      const now = this.ctx.currentTime;

      const osc1 = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      const baseFreq = 620 * pitchMultiplier * (0.98 + Math.random() * 0.04);
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(baseFreq * 1.4, now);
      osc1.frequency.exponentialRampToValueAtTime(baseFreq, now + 0.018);
      osc1.frequency.exponentialRampToValueAtTime(baseFreq * 0.82, now + 0.14);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(baseFreq * 1.15, now);
      filter.Q.setValueAtTime(3.6, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.24, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc1.connect(filter);
      filter.connect(gain);
      gain.connect(out);

      osc1.onended = () => {
        osc1.disconnect();
        filter.disconnect();
        gain.disconnect();
      };

      osc1.start(now);
      osc1.stop(now + 0.16);
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 3. TIẾNG ĐẠI HỒNG CHUNG (TEMPLE BRONZE BELL)
  // --------------------------------------------------------------------------
  playTempleBell(intensity = 1.0) {
    if (!this.sfxEnabled) return;
    try {
      const out = this.getOutputNode();
      if (!out || !this.ctx) return;
      const now = this.ctx.currentTime;

      const base = 174;
      const partials = [
        { ratio: 0.5, amp: 0.20, decay: 4.0 },
        { ratio: 1.0, amp: 0.30, decay: 3.5 },
        { ratio: 1.506, amp: 0.14, decay: 2.2 },
        { ratio: 2.0, amp: 0.16, decay: 1.8 }
      ];

      const master = this.ctx.createGain();
      master.gain.setValueAtTime(0.25 * Math.min(1.0, intensity), now);
      master.connect(out);

      partials.forEach((p, idx) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(base * p.ratio, now);

        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(p.amp, now + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);

        osc.connect(g);
        g.connect(master);
        osc.onended = () => {
          osc.disconnect();
          g.disconnect();
          if (idx === 0) master.disconnect();
        };
        osc.start(now);
        osc.stop(now + p.decay + 0.05);
      });
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 4. TIẾNG LẮC ỐNG XĂM TRE (FORTUNE STICK SHAKER)
  // --------------------------------------------------------------------------
  playFortuneShake() {
    if (!this.sfxEnabled) return;
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        this.playWoodenFish(1.32 + (i % 2) * 0.16);
      }, i * 120);
    }
  }

  // --------------------------------------------------------------------------
  // 4B. TIẾNG MÕ & CHUÔNG HÒA NHỊP TỤNG KINH (SUTRA CHANTING ACCOMPANIMENT)
  // --------------------------------------------------------------------------
  startSutraChantAccompaniment(durationMs = 12000) {
    if (!this.sfxEnabled) return;
    try {
      if (this.chantInterval) {
        clearInterval(this.chantInterval);
        this.chantInterval = null;
      }
      // 1 tiếng chuông mở màn trang nghiêm
      this.playTempleBell(0.85);

      const startTime = Date.now();
      this.chantInterval = setInterval(() => {
        if (Date.now() - startTime >= durationMs) {
          if (this.chantInterval) {
            clearInterval(this.chantInterval);
            this.chantInterval = null;
          }
          // Tiếng chuông kết thúc thời kinh
          this.playTempleBell(0.70);
          return;
        }
        // Gõ mõ nhịp nhàng ~820ms / tiếng
        this.playWoodenFish(0.95);
      }, 820);
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 5. TIẾNG CHUÔNG NGỌC DÂNG LỄ / THẮP HƯƠNG (SINGING CHIME)
  // --------------------------------------------------------------------------
  playIncenseChime() {
    if (!this.sfxEnabled) return;
    try {
      const out = this.getOutputNode();
      if (!out || !this.ctx) return;
      const now = this.ctx.currentTime;
      const notes = [528, 660];
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.1);

        gain.gain.setValueAtTime(0.0001, now + idx * 0.1);
        gain.gain.linearRampToValueAtTime(0.08, now + idx * 0.1 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.1 + 1.1);

        osc.connect(gain);
        gain.connect(out);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
        osc.start(now + idx * 0.1);
        osc.stop(now + idx * 0.1 + 1.15);
      });
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 6. ZEROTTS VOICE QUEUE VỚI PHÂN CẤP ƯU TIÊN (PRIORITY QUEUE)
  // --------------------------------------------------------------------------
  enqueueTts(text, options = {}) {
    const onStart = typeof options.onStart === 'function' ? options.onStart : null;
    const onEnd = typeof options.onEnd === 'function' ? options.onEnd : null;

    if (!this.ttsEnabled) {
      if (onStart) onStart();
      if (onEnd) setTimeout(onEnd, 3500);
      return;
    }
    const clean = String(text || '').trim();
    if (!clean) {
      if (onStart) onStart();
      if (onEnd) setTimeout(onEnd, 3500);
      return;
    }

    const isWelcome = Boolean(options.isWelcome);
    // Lời chào viewer vào live TUYỆT ĐỐI không làm giảm âm lượng nhạc MP3!
    const duckBg = options.duckBg !== false && !isWelcome;
    const priority = options.priority || (isWelcome ? 'low' : 'high');

    // Giữ hàng đợi lên đến 150 câu để đảm bảo đọc hết toàn bộ danh sách, không bỏ sót ai
    if (this.ttsQueue.length >= 150) {
      const dropped = this.ttsQueue.shift();
      if (dropped?.onStart) dropped.onStart();
      if (dropped?.onEnd) dropped.onEnd();
    }

    const item = {
      id: `tts_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: clean,
      voice: (options.voice || this.ttsVoice || 'maichi').toLowerCase(),
      url: options.url || null,
      isWelcome,
      duckBg,
      priority,
      onStart,
      onEnd,
      fetchPromise: null
    };

    if (!item.url) {
      item.fetchPromise = this.fetchZeroTtsAudio(item.text, item.voice);
    }

    if (priority === 'high') {
      const firstLowIdx = this.ttsQueue.findIndex(q => q.priority === 'low');
      if (firstLowIdx !== -1) {
        this.ttsQueue.splice(firstLowIdx, 0, item);
      } else {
        this.ttsQueue.push(item);
      }
    } else {
      this.ttsQueue.push(item);
    }
    this.processTtsQueue();
  }

  isWelcomePlaying() {
    return Boolean(this.currentTtsItem?.isWelcome && this.ttsPlaying);
  }

  hasQueuedWelcome() {
    return this.ttsQueue.some(item => item && item.isWelcome);
  }

  getWelcomePipelineCount() {
    let count = 0;
    if (this.currentTtsItem && this.currentTtsItem.isWelcome && this.ttsPlaying) {
      count++;
    }
    for (const it of this.ttsQueue) {
      if (it && it.isWelcome) count++;
    }
    return count;
  }

  async fetchZeroTtsAudio(text, voice = 'maichi') {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice })
      });
      const data = await res.json();
      if (data && data.ok && data.url) {
        // Tải trước file wav vào bộ nhớ đệm trình duyệt để phát không độ trễ mạng
        try {
          fetch(data.url, { cache: 'force-cache' }).catch(() => {});
        } catch (_) {}
        return data;
      }
      return { ok: false, error: data?.error || 'ZeroTTS unavailable' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async processTtsQueue() {
    if (this.ttsPlaying || this.ttsQueue.length === 0) return;
    this.ttsPlaying = true;
    const item = this.ttsQueue.shift();
    this.currentTtsItem = item;

    try {
      let audioUrl = item.url;
      if (!audioUrl && item.fetchPromise) {
        if (this.onTtsStateChange) {
          this.onTtsStateChange({ speaking: false, synthesizing: true, text: item.text });
        }
        const res = await item.fetchPromise;
        if (res && res.ok && res.url) {
          audioUrl = res.url;
        }
      }

      if (audioUrl) {
        this.lastPlayedItem = { text: item.text, voice: item.voice, url: audioUrl };
        if (item.duckBg) {
          this.setBgDucking(true);
        }
        if (this.onTtsStateChange) {
          this.onTtsStateChange({ speaking: true, synthesizing: false, text: item.text });
        }
        if (item.onStart) {
          try { item.onStart(); } catch (_) {}
        }
        await this.playWavUrl(audioUrl);
      } else {
        if (item.onStart) {
          try { item.onStart(); } catch (_) {}
        }
      }
    } catch (err) {
      console.warn('[ZeroTTS Playback Warning]', err);
    } finally {
      this.currentTtsItem = null;
      if (item && item.onEnd) {
        try { item.onEnd(); } catch (_) {}
      }
      this.ttsPlaying = false;
      const nextItem = this.ttsQueue[0];
      // Nếu không còn câu nào cần ducking: phục hồi âm lượng nhạc nền ngay
      if (!nextItem || !nextItem.duckBg) {
        this.setBgDucking(false);
      }
      if (this.ttsQueue.length === 0) {
        if (this.onTtsStateChange) {
          this.onTtsStateChange({ speaking: false, synthesizing: false, text: '' });
        }
      } else {
        // Nghỉ 50ms giữa các câu đọc để giọng đọc chuyển tiếp tức thì, liền mạch và tự nhiên
        setTimeout(() => this.processTtsQueue(), 50);
      }
    }
  }

  replayLastAudio() {
    if (!this.lastPlayedItem) return false;
    this.enqueueTts(this.lastPlayedItem.text, {
      voice: this.lastPlayedItem.voice,
      duckBg: true,
      priority: 'high'
    });
    return true;
  }

  playWavUrl(url) {
    return new Promise((resolve) => {
      try {
        if (!this.ttsAudio && typeof Audio !== 'undefined') {
          this.ttsAudio = new Audio();
        }
        const audio = this.ttsAudio;
        if (!audio) {
          return resolve();
        }

        try {
          audio.pause();
          audio.currentTime = 0;
          audio.onended = null;
          audio.onerror = null;
          audio.onabort = null;
          audio.onloadedmetadata = null;
        } catch (_) {}

        this.currentAudio = audio;
        audio.preload = 'auto';
        audio.volume = this.ttsVolume;
        audio.playbackRate = 1.0;
        audio.defaultPlaybackRate = 1.0;

        let finished = false;
        let watchdogTimer = null;

        const cleanup = () => {
          if (watchdogTimer) {
            clearTimeout(watchdogTimer);
            watchdogTimer = null;
          }
          audio.onended = null;
          audio.onerror = null;
          audio.onabort = null;
          audio.onloadedmetadata = null;
          this.currentAudio = null;
        };

        const onFinished = () => {
          if (finished) return;
          finished = true;
          cleanup();
          resolve();
        };

        audio.onended = onFinished;
        audio.onerror = (e) => {
          console.warn('[TTS Playback Error]', e?.type || e);
          onFinished();
        };
        // TUYỆT ĐỐI KHÔNG GÁN: audio.onabort = onFinished;
        // Trình duyệt luôn phát sinh event 'abort' khi gán audio.src mới (do hủy nạp tài nguyên cũ).
        // Nếu gán onabort = onFinished, Promise sẽ resolve ngay ở 0ms khiến câu sau nhảy vào cắt ngang câu trước!

        // Watchdog: Tự động kết thúc nếu file audio phát xong nhưng browser không bắn event onended
        audio.onloadedmetadata = () => {
          if (Number.isFinite(audio.duration) && audio.duration > 0) {
            const safeMs = Math.min(30000, Math.ceil((audio.duration + 2.5) * 1000));
            if (watchdogTimer) clearTimeout(watchdogTimer);
            watchdogTimer = setTimeout(onFinished, safeMs);
          }
        };
        watchdogTimer = setTimeout(onFinished, 15000);

        audio.src = url;
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch((err) => {
            console.warn('[TTS Playback Warning]', err?.message || err);
            onFinished();
          });
        }
      } catch (err) {
        console.warn('[TTS Play Exception]', err);
        resolve();
      }
    });
  }

  // --------------------------------------------------------------------------
  // 7. PHÁT BẢN THU TỤNG KINH MP3 CHÂN THỰC (REAL SUTRA AUDIO ENGINE)
  // --------------------------------------------------------------------------
  playSutraAudio(url, options = {}) {
    if (!url) {
      if (typeof options.onStart === 'function') options.onStart();
      if (typeof options.onEnd === 'function') options.onEnd();
      return null;
    }

    this.ensureContext();
    this.bgMusicEnabled = true;

    // 1. Nếu bài MP3 này đang phát rồi: GIỮ NGUYÊN, PHÁT XUYÊN SUỐT KHÔNG NGẮT HAY KHỞI ĐỘNG LẠI!
    if (this.sutraAudio && this.currentSutraUrl === url && !this.sutraAudio.paused) {
      if (typeof options.onStart === 'function') options.onStart();
      return this.sutraAudio;
    }

    // 2. Nếu bài đang bị tạm dừng: tiếp tục phát tiếp từ đoạn tạm dừng
    if (this.sutraAudio && this.currentSutraUrl === url && this.sutraAudio.paused) {
      this.sutraAudio.volume = this.isDuckingActive ? this.getDuckedSutraVolume() : this.sutraVolume;
      const p = this.sutraAudio.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
      if (typeof options.onStart === 'function') options.onStart();
      return this.sutraAudio;
    }

    // 3. Nếu chuyển sang bài khác hoặc bắt đầu bài mới: Dừng bài cũ an toàn
    this.stopSutraAudio(false);

    try {
      this.currentSutraUrl = url;
      const audio = new Audio();
      this.sutraAudio = audio;
      // Dùng 'metadata' thay vì 'auto' để stream từng đoạn theo nhu cầu phát,
      // chống nghẽn băng thông mạng và tránh lag khi tải file âm thanh dài.
      audio.preload = 'metadata';
      audio.loop = options.loop !== undefined ? Boolean(options.loop) : (url === this.defaultBgUrl);
      audio.volume = this.isDuckingActive ? this.getDuckedSutraVolume() : this.sutraVolume;

      let started = false;
      audio.onplay = () => {
        if (!started) {
          started = true;
          if (typeof options.onStart === 'function') options.onStart();
        }
      };

      audio.onended = () => {
        if (typeof options.onEnd === 'function') options.onEnd();
        // Nếu bài kinh kết thúc và không lặp: tự động chuyển về bài niệm Phật nền nếu còn bật nhạc
        if (!audio.loop && this.bgMusicEnabled && url !== this.defaultBgUrl) {
          this.currentSutraUrl = null;
          this.sutraAudio = null;
          this.startZenAmbience();
        }
      };

      audio.onerror = (e) => {
        const now = Date.now();
        if (!this._lastAudioErrorLog || now - this._lastAudioErrorLog > 4000) {
          this._lastAudioErrorLog = now;
          console.warn('[Sutra Audio Error]', e?.type || e);
        }
        // Khi lỗi tải file: Dừng bài, không kích hoạt onEnd đệ quy để tránh bão log
        this.currentSutraUrl = null;
        this.sutraAudio = null;
        if (typeof options.onError === 'function') options.onError(e);
      };

      audio.src = url;
      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch((err) => {
          const now = Date.now();
          if (!this._lastPlayWarnLog || now - this._lastPlayWarnLog > 4000) {
            this._lastPlayWarnLog = now;
            console.warn('[Sutra Audio Play Failed - Waiting for user interaction]', err?.name || err?.message || err);
          }
          if (!started && typeof options.onStart === 'function') {
            options.onStart();
          }
        });
      }
      return audio;
    } catch (err) {
      console.warn('[Sutra Audio Exception]', err);
      if (typeof options.onStart === 'function') options.onStart();
      if (typeof options.onEnd === 'function') options.onEnd();
      return null;
    }
  }

  stopSutraAudio(restoreDucking = true) {
    if (this.sutraAudio) {
      try {
        this.sutraAudio.pause();
        this.sutraAudio.currentTime = 0;
        this.sutraAudio.onplay = null;
        this.sutraAudio.onended = null;
        this.sutraAudio.onerror = null;
        this.sutraAudio.removeAttribute('src');
        this.sutraAudio.load();
      } catch (_) {}
      this.sutraAudio = null;
    }
    this.currentSutraUrl = null;
    if (this.chantInterval) {
      clearInterval(this.chantInterval);
      this.chantInterval = null;
    }
    if (restoreDucking && !this.ttsPlaying) {
      this.setBgDucking(false);
    }
  }

  toggleSutraAudio() {
    if (!this.sutraAudio) return false;
    try {
      if (this.sutraAudio.paused) {
        this.sutraAudio.play();
        return true;
      } else {
        this.sutraAudio.pause();
        return false;
      }
    } catch (_) {
      return false;
    }
  }

  isSutraPlaying() {
    return Boolean(this.sutraAudio && !this.sutraAudio.paused);
  }
}

window.TempleAudioEngine = TempleAudioEngine;
