export class AudioEngine {
  constructor() {
    this.context = new (window.AudioContext || window.webkitAudioContext)();
    this.buffers = {};
    // Using high quality Mishary Alafasy recitations from QuranicAudio
    this.urls = {
      nas: 'https://server8.mp3quran.net/afs/114.mp3',
      falaq: 'https://server8.mp3quran.net/afs/113.mp3',
      baqarah: 'https://server8.mp3quran.net/afs/002.mp3',
    };
    this.sources = [];
  }

  async loadAll(onProgress) {
    const keys = Object.keys(this.urls);
    let loaded = 0;
    
    // We fetch one by one to give accurate progress and avoid overwhelming network
    for (const key of keys) {
      try {
        const response = await fetch(this.urls[key]);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const arrayBuffer = await response.arrayBuffer();
        
        // Slice the buffer (workaround for some Safari versions where fetch detaches the buffer)
        const bufferCopy = arrayBuffer.slice(0);
        
        const audioBuffer = await new Promise((resolve, reject) => {
          const decodeResult = this.context.decodeAudioData(
            bufferCopy,
            (buffer) => resolve(buffer),
            (err) => reject(err)
          );
          // If it returns a promise (modern browsers), handle it
          if (decodeResult) {
            decodeResult.then(resolve).catch(reject);
          }
        });
        
        this.buffers[key] = audioBuffer;
        loaded++;
        if (onProgress) onProgress(Math.round((loaded / keys.length) * 100));
      } catch (error) {
        console.error(`Failed to load audio ${key}:`, error);
        throw error;
      }
    }
  }

  resume() {
    if (this.context.state === 'suspended') {
      this.context.resume();
    }
  }

  scheduleSequence(startTimeMs, clockOffsetMs) {
    this.stop();
    this.resume();

    const sequence = [
      'nas', 'nas', 'nas',
      'falaq', 'falaq', 'falaq',
      'baqarah'
    ];

    const localTimeNow = Date.now();
    const estimatedHostTimeNow = localTimeNow + clockOffsetMs;
    const timeUntilStartMs = startTimeMs - estimatedHostTimeNow;
    
    const contextStartTime = this.context.currentTime + (timeUntilStartMs / 1000);
    let currentSequenceOffset = 0;

    for (const key of sequence) {
      const buffer = this.buffers[key];
      const trackStartContextTime = contextStartTime + currentSequenceOffset;
      
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.context.destination);
      
      const timeInPast = this.context.currentTime - trackStartContextTime;
      
      if (timeInPast > 0) {
        if (timeInPast < buffer.duration) {
          source.start(0, timeInPast);
          this.sources.push(source);
        }
      } else {
        source.start(trackStartContextTime);
        this.sources.push(source);
      }
      
      currentSequenceOffset += buffer.duration;
    }
  }

  stop() {
    this.sources.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    this.sources = [];
  }
}
