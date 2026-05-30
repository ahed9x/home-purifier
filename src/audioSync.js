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
      } else if (data.type === 'play' || data.type === 'stop' || data.type === 'sync') {
        if (this.onMessageReceived) {
          this.onMessageReceived(data, this.currentOffset);
        }
      }
    });
  }

  startPinging() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    // Ping every 1000ms to keep offset accurate
    this.pingInterval = setInterval(() => {
      if (this.connection && this.connection.open) {
        this.connection.send({ type: 'ping', cTime: Date.now() });
      }
    }, 1000);
  }

  broadcastPlay(delayMs = 2000) {
    if (!this.isHost) return;
    
    // Schedule playback slightly in the future so all clients have time to receive the message
    this.currentStartTime = Date.now() + delayMs;
    
    const playMsg = { type: 'play', startTime: this.currentStartTime };
    this.broadcastMessage(playMsg);
    
    if (this.onMessageReceived) {
      this.onMessageReceived(playMsg, 0);
    }

    // Periodic Sync Heartbeat to catch up dropped clients or asleep devices
    if (this.syncHeartbeat) clearInterval(this.syncHeartbeat);
    this.syncHeartbeat = setInterval(() => {
      this.broadcastMessage({ type: 'sync', startTime: this.currentStartTime });
    }, 10000); // Every 10 seconds
  }

  broadcastMessage(msg) {
    this.connections.forEach(conn => {
      if (conn.open) {
        conn.send(msg);
      }
    });
  }

  broadcastStop() {
    if (!this.isHost) return;
    this.currentStartTime = null;
    if (this.syncHeartbeat) clearInterval(this.syncHeartbeat);

    const stopMsg = { type: 'stop' };
    this.broadcastMessage(stopMsg);
    if (this.onMessageReceived) {
      this.onMessageReceived(stopMsg, 0);
    }
  }

  disconnect() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.syncHeartbeat) clearInterval(this.syncHeartbeat);
    if (this.connection) this.connection.close();
    this.connections.forEach(conn => conn.close());
    if (this.peer) this.peer.destroy();
  }
}
