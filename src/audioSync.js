import Peer from 'peerjs';

export class SyncManager {
  constructor(isHost, onMessageReceived) {
    this.isHost = isHost;
    this.peer = new Peer({
      debug: 2,
    });
    this.connections = []; // For host to keep track of clients
    this.connection = null; // For client to keep track of host
    this.roomId = null;
    this.clockOffsets = [];
    this.currentOffset = 0;
    this.onMessageReceived = onMessageReceived;
    this.pingInterval = null;
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      this.peer.on('open', (id) => {
        this.roomId = id;
        
        if (this.isHost) {
          this.setupHostListeners();
        }
        resolve(id);
      });

      this.peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        reject(err);
      });
    });
  }

  setupHostListeners() {
    this.peer.on('connection', (conn) => {
      this.connections.push(conn);
      
      conn.on('data', (data) => {
        if (data.type === 'ping') {
          // Respond to ping with host's current time
          conn.send({
            type: 'pong',
            cTime: data.cTime,
            hTime: Date.now()
          });
        }
      });

      conn.on('close', () => {
        this.connections = this.connections.filter(c => c.peer !== conn.peer);
      });
    });
  }

  joinRoom(hostId) {
    return new Promise((resolve, reject) => {
      this.connection = this.peer.connect(hostId, {
        reliable: true
      });

      this.connection.on('open', () => {
        this.setupClientListeners();
        this.startPinging();
        resolve();
      });

      this.connection.on('error', (err) => {
        reject(err);
      });
    });
  }

  setupClientListeners() {
    this.connection.on('data', (data) => {
      if (data.type === 'pong') {
        const localTimeNow = Date.now();
        const rtt = localTimeNow - data.cTime;
        // Host time when it sent the message, assuming symmetric latency
        const offset = data.hTime - data.cTime - (rtt / 2);
        
        this.clockOffsets.push(offset);
        if (this.clockOffsets.length > 20) {
          this.clockOffsets.shift(); // Keep last 20
        }
        
        // Use median to avoid outliers from GC pauses or network spikes
        const sorted = [...this.clockOffsets].sort((a, b) => a - b);
        this.currentOffset = sorted[Math.floor(sorted.length / 2)];
      } else if (data.type === 'play' || data.type === 'stop') {
        if (this.onMessageReceived) {
          this.onMessageReceived(data, this.currentOffset);
        }
      }
    });
  }

  startPinging() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    // Ping every 500ms to establish accurate offset quickly
    this.pingInterval = setInterval(() => {
      if (this.connection && this.connection.open) {
        this.connection.send({ type: 'ping', cTime: Date.now() });
      }
    }, 500);
  }

  broadcastPlay(delayMs = 2000) {
    if (!this.isHost) return;
    
    // Schedule playback slightly in the future so all clients have time to receive the message
    const startTime = Date.now() + delayMs;
    
    const playMsg = { type: 'play', startTime };
    this.connections.forEach(conn => {
      if (conn.open) {
        conn.send(playMsg);
      }
    });
    
    // Also trigger on the host locally (offset is 0 since host is the source of truth)
    if (this.onMessageReceived) {
      this.onMessageReceived(playMsg, 0);
    }
  }

  broadcastStop() {
    if (!this.isHost) return;
    const stopMsg = { type: 'stop' };
    this.connections.forEach(conn => {
      if (conn.open) {
        conn.send(stopMsg);
      }
    });
    if (this.onMessageReceived) {
      this.onMessageReceived(stopMsg, 0);
    }
  }

  disconnect() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.connection) this.connection.close();
    this.connections.forEach(conn => conn.close());
    if (this.peer) this.peer.destroy();
  }
}
