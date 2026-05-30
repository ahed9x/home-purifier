export class AudioEngine {
  constructor() {
    this.context = new (window.AudioContext || window.webkitAudioContext)();
    this.buffers = {};
    
    this.urls = {
      nas: 'https://server11.mp3quran.net/yasser/114.mp3',
      falaq: 'https://server11.mp3quran.net/yasser/113.mp3',
      baqarah: 'https://server11.mp3quran.net/yasser/002.mp3',
    };
    
    this.sources = [];
    
    // Baqarah is too large to decode into RAM (will crash mobile browsers). 
    // We stream it using HTMLAudioElement instead.
    this.baqarahAudio = new Audio(this.urls.baqarah);
    this.baqarahAudio.crossOrigin = 'anonymous';
    this.baqarahAudio.preload = 'auto';
    
    // We can pipe the streaming audio into the AudioContext to keep volume/effects unified
    this.baqarahSourceNode = this.context.createMediaElementSource(this.baqarahAudio);
    this.baqarahSourceNode.connect(this.context.destination);
    
    this.syncLoopId = null;
  }

  async loadAll(onProgress) {
    const keysToDecode = ['nas', 'falaq']; // Only decode the short ones
    let loaded = 0;
    
    for (const key of keysToDecode) {
      try {
        const response = await fetch(this.urls[key]);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const arrayBuffer = await response.arrayBuffer();
        const bufferCopy = arrayBuffer.slice(0); // Safari workaround
        
        const audioBuffer = await new Promise((resolve, reject) => {
          const decodeResult = this.context.decodeAudioData(
            bufferCopy,
            (buffer) => resolve(buffer),
            (err) => reject(err)
          );
          if (decodeResult) {
            decodeResult.then(resolve).catch(reject);
          }
        });
        
        this.buffers[key] = audioBuffer;
        loaded++;
        if (onProgress) onProgress(Math.round((loaded / keysToDecode.length) * 100));
      } catch (error) {
        console.error(`Failed to load audio ${key}:`, error);
        throw error;
      }
    }
    
    // Load Baqarah metadata so we can play it immediately later
    return new Promise((resolve) => {
      this.baqarahAudio.oncanplaythrough = () => resolve();
      this.baqarahAudio.onerror = () => resolve(); // continue even if it doesn't fully buffer
      this.baqarahAudio.load();
      // Resolve after a short timeout if events don't fire quickly
      setTimeout(resolve, 2000);
    });
  }

  resume() {
    if (this.context.state === 'suspended') {
      this.context.resume();
    }
  }

  scheduleSequence(startTimeMs, clockOffsetMs) {
    this.stop();
    this.resume();

    const nasBuffer = this.buffers['nas'];
    const falaqBuffer = this.buffers['falaq'];
    
    if (!nasBuffer || !falaqBuffer) {
      console.error("Buffers not loaded!");
      return;
    }

    const sequence = [
      { key: 'nas', buffer: nasBuffer },
      { key: 'nas', buffer: nasBuffer },
      { key: 'nas', buffer: nasBuffer },
      { key: 'falaq', buffer: falaqBuffer },
      { key: 'falaq', buffer: falaqBuffer },
      { key: 'falaq', buffer: falaqBuffer }
    ];

    const localTimeNow = Date.now();
    const estimatedHostTimeNow = localTimeNow + clockOffsetMs;
    const timeUntilStartMs = startTimeMs - estimatedHostTimeNow;
    
    const contextStartTime = this.context.currentTime + (timeUntilStartMs / 1000);
    let currentSequenceOffset = 0;

    // 1. Schedule all perfectly precise AudioBufferSourceNodes (Nas and Falaq)
    for (const item of sequence) {
      const trackStartContextTime = contextStartTime + currentSequenceOffset;
      
      const source = this.context.createBufferSource();
      source.buffer = item.buffer;
      source.connect(this.context.destination);
      
      const timeInPast = this.context.currentTime - trackStartContextTime;
      
      if (timeInPast > 0) {
        if (timeInPast < item.buffer.duration) {
          source.start(0, timeInPast);
          this.sources.push(source);
        }
      } else {
        source.start(trackStartContextTime);
        this.sources.push(source);
      }
      
      currentSequenceOffset += item.buffer.duration;
    }
    
    // 2. Schedule Baqarah (streaming) to start exactly when Falaq finishes
    const baqarahStartContextTime = contextStartTime + currentSequenceOffset;
    
    const syncLoop = () => {
      const contextNow = this.context.currentTime;
      const expectedBaqarahTime = contextNow - baqarahStartContextTime;
      
      if (expectedBaqarahTime >= 0) {
        // It's time to play Baqarah
        if (this.baqarahAudio.paused) {
          // If we jumped way ahead in time, start at the offset
          if (expectedBaqarahTime > 0.1) {
            this.baqarahAudio.currentTime = expectedBaqarahTime;
          }
          this.baqarahAudio.play().catch(e => console.error("Baqarah play blocked:", e));
        } else {
          // Continuous sync checking (hyper-sync logic)
          const actualTime = this.baqarahAudio.currentTime;
          const drift = expectedBaqarahTime - actualTime;
          
          if (Math.abs(drift) > 0.05) {
            // If we drifted more than 50ms, aggressively snap it back
            this.baqarahAudio.currentTime = expectedBaqarahTime;
          } else if (Math.abs(drift) > 0.01) {
            // If drifted 10ms-50ms, subtly adjust playback speed to catch up smoothly
            // (Creates a pitch-shift but prevents popping)
            this.baqarahAudio.playbackRate = drift > 0 ? 1.05 : 0.95;
          } else {
            this.baqarahAudio.playbackRate = 1.0;
          }
        }
      }
      
      this.syncLoopId = requestAnimationFrame(syncLoop);
    };
    
    this.syncLoopId = requestAnimationFrame(syncLoop);
  }

  stop() {
    this.sources.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    this.sources = [];
    
    if (this.syncLoopId) {
      cancelAnimationFrame(this.syncLoopId);
      this.syncLoopId = null;
    }
    
    this.baqarahAudio.pause();
    this.baqarahAudio.currentTime = 0;
  }
}
