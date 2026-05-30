import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Square, Users, Radio, Loader2, Music, CheckCircle2 } from 'lucide-react';
import { AudioEngine } from './audioEngine';
import { SyncManager } from './audioSync';

export default function App() {
  const [appState, setAppState] = useState('welcome'); // welcome, loading, menu, host, client
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [roomId, setRoomId] = useState('');
  const [joinId, setJoinId] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState('');
  
  const engineRef = useRef(null);
  const syncRef = useRef(null);

  // We initialize only on user click to bypass browser Audio autoplay policies
  const initApp = async () => {
    setAppState('loading');
    setError('');
    try {
      engineRef.current = new AudioEngine();
      await engineRef.current.loadAll((progress) => {
        setLoadingProgress(progress);
      });
      setAppState('menu');
    } catch (err) {
      console.error("Failed to load audio:", err);
      setError(`Failed to load audio files: ${err.message}. Please check your connection and reload.`);
      setAppState('welcome');
    }
  };

  useEffect(() => {

    return () => {
      if (syncRef.current) syncRef.current.disconnect();
      if (engineRef.current) engineRef.current.stop();
    };
  }, []);

  const handleMessage = (data, offset) => {
    if (data.type === 'play') {
      setIsPlaying(true);
      engineRef.current.scheduleSequence(data.startTime, offset);
    } else if (data.type === 'stop') {
      setIsPlaying(false);
      engineRef.current.stop();
    }
  };

  const createSession = async () => {
    setAppState('host');
    try {
      syncRef.current = new SyncManager(true, handleMessage);
      const id = await syncRef.current.initialize();
      setRoomId(id);
    } catch (err) {
      setError("Failed to create session.");
      setAppState('menu');
    }
  };

  const joinSession = async (e) => {
    e.preventDefault();
    if (!joinId.trim()) return;
    
    setAppState('client');
    try {
      syncRef.current = new SyncManager(false, handleMessage);
      await syncRef.current.initialize(); // Get client ID first
      await syncRef.current.joinRoom(joinId);
    } catch (err) {
      setError("Failed to join session. Please check the code.");
      setAppState('menu');
    }
  };

  const startPlayback = () => {
    if (isPlaying) {
      syncRef.current.broadcastStop();
    } else {
      // Small interaction to unlock Web Audio API on host if needed
      engineRef.current.resume();
      syncRef.current.broadcastPlay(2000); // 2 seconds delay to ensure sync
    }
  };

  // UI Components
  const WelcomeScreen = () => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center justify-center p-8 glass-card rounded-3xl text-center max-w-md w-full"
    >
      <Music className="w-16 h-16 text-primary-500 mb-6" />
      <h2 className="text-3xl font-bold mb-4">Welcome to QuranSync</h2>
      <p className="text-gray-400 mb-8">
        Experience hyper-synchronized recitation of Surah Al-Nas, Al-Falaq, and Al-Baqarah across all your devices.
      </p>
      <button 
        onClick={initApp}
        className="w-full py-4 rounded-xl bg-primary-600 hover:bg-primary-500 transition-colors font-semibold text-lg shadow-lg shadow-primary-500/30"
      >
        Enter App
      </button>
    </motion.div>
  );

  const LoadingScreen = () => (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center p-8 glass-card rounded-3xl"
    >
      <Loader2 className="w-16 h-16 text-primary-500 animate-spin mb-6" />
      <h2 className="text-2xl font-semibold mb-2">Preparing Audio Files</h2>
      <p className="text-gray-400 mb-6 text-center max-w-md">
        Downloading high-quality recitations of Surah Al-Nas, Al-Falaq, and Al-Baqarah.
      </p>
      <div className="w-full max-w-sm bg-gray-800 rounded-full h-2.5 overflow-hidden">
        <motion.div 
          className="bg-primary-500 h-2.5 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${loadingProgress}%` }}
        />
      </div>
      <p className="mt-4 text-sm font-medium text-primary-400">{loadingProgress}%</p>
    </motion.div>
  );

  const MenuScreen = () => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      className="flex flex-col gap-6 w-full max-w-md"
    >
      <div className="glass-card p-8 rounded-3xl text-center">
        <div className="mx-auto w-16 h-16 bg-primary-500/20 rounded-full flex items-center justify-center mb-6">
          <Radio className="w-8 h-8 text-primary-400" />
        </div>
        <h2 className="text-3xl font-bold mb-2">Host a Session</h2>
        <p className="text-gray-400 mb-8">Create a room and control synchronized playback across all devices.</p>
        <button 
          onClick={createSession}
          className="w-full py-4 rounded-xl bg-primary-600 hover:bg-primary-500 transition-colors font-semibold text-lg shadow-lg shadow-primary-500/30"
        >
          Create Room
        </button>
      </div>

      <div className="flex items-center gap-4">
        <div className="h-px bg-gray-800 flex-1"></div>
        <span className="text-gray-500 text-sm font-medium uppercase tracking-wider">or join</span>
        <div className="h-px bg-gray-800 flex-1"></div>
      </div>

      <form onSubmit={joinSession} className="glass-card p-8 rounded-3xl text-center">
        <Users className="w-8 h-8 text-gray-400 mx-auto mb-6" />
        <h2 className="text-2xl font-bold mb-6">Join Session</h2>
        <input 
          type="text" 
          placeholder="Enter Room Code"
          value={joinId}
          onChange={(e) => setJoinId(e.target.value)}
          className="w-full bg-gray-900/50 border border-gray-700 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 rounded-xl px-4 py-4 text-center text-lg tracking-wider outline-none transition-all mb-4"
        />
        <button 
          type="submit"
          className="w-full py-4 rounded-xl bg-white/10 hover:bg-white/20 transition-colors font-semibold text-lg border border-white/5"
        >
          Connect
        </button>
      </form>
    </motion.div>
  );

  const HostScreen = () => (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      className="glass-card p-8 rounded-3xl w-full max-w-lg relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary-600 to-indigo-500"></div>
      
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-sm uppercase tracking-widest text-primary-400 font-bold mb-1">Room Code</h2>
          <div className="text-3xl font-mono tracking-wider font-light bg-black/30 px-4 py-2 rounded-lg select-all">
            {roomId || 'Generating...'}
          </div>
        </div>
        <div className="flex flex-col items-center">
          <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse mb-2"></div>
          <span className="text-xs text-gray-400 uppercase font-bold tracking-wider">Live</span>
        </div>
      </div>

      <div className="bg-black/20 rounded-2xl p-6 mb-8 border border-white/5">
        <h3 className="text-gray-300 font-medium mb-4 flex items-center gap-2">
          <Music className="w-4 h-4" /> Queue
        </h3>
        <ul className="space-y-3">
          <li className="flex items-center gap-3 text-sm"><CheckCircle2 className="w-4 h-4 text-primary-400"/> Surah Al-Nas (3x)</li>
          <li className="flex items-center gap-3 text-sm"><CheckCircle2 className="w-4 h-4 text-primary-400"/> Surah Al-Falaq (3x)</li>
          <li className="flex items-center gap-3 text-sm"><CheckCircle2 className="w-4 h-4 text-primary-400"/> Surah Al-Baqarah</li>
        </ul>
      </div>

      <button 
        onClick={startPlayback}
        disabled={!roomId}
        className={`w-full py-5 rounded-2xl transition-all duration-300 flex justify-center items-center gap-3 font-bold text-xl shadow-2xl ${
          isPlaying 
            ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30' 
            : 'bg-primary-600 hover:bg-primary-500 text-white shadow-primary-500/40 hover:shadow-primary-500/60'
        } ${!roomId ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {isPlaying ? <><Square fill="currentColor" /> Stop Playback</> : <><Play fill="currentColor" /> Broadcast Play</>}
      </button>
    </motion.div>
  );

  const ClientScreen = () => (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      className="glass-card p-10 rounded-3xl text-center w-full max-w-md relative overflow-hidden"
    >
      <div className={`absolute top-0 left-0 w-full h-1 ${isPlaying ? 'bg-primary-500' : 'bg-gray-600'}`}></div>
      
      <div className="mb-8 relative">
        <div className={`mx-auto w-24 h-24 rounded-full flex items-center justify-center transition-all duration-700 ${isPlaying ? 'bg-primary-500/20 shadow-[0_0_40px_rgba(59,130,246,0.3)]' : 'bg-gray-800'}`}>
          {isPlaying ? (
            <Music className="w-10 h-10 text-primary-400 animate-pulse-slow" />
          ) : (
            <Radio className="w-10 h-10 text-gray-400" />
          )}
        </div>
        {isPlaying && (
          <>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full border border-primary-500/30 animate-ping" style={{ animationDuration: '3s' }}></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full border border-primary-500/10 animate-ping" style={{ animationDuration: '3s', animationDelay: '1s' }}></div>
          </>
        )}
      </div>

      <h2 className="text-2xl font-bold mb-3">
        {isPlaying ? 'Synchronized Playback' : 'Connected to Host'}
      </h2>
      <p className="text-gray-400">
        {isPlaying 
          ? 'Receiving hyper-synced audio stream...' 
          : 'Waiting for host to initiate playback...'}
      </p>
      
      {!isPlaying && (
         <div className="mt-8 pt-6 border-t border-white/5">
           <button 
            onClick={() => engineRef.current.resume()} 
            className="text-xs text-primary-400/80 hover:text-primary-300 underline"
           >
             Click here if audio doesn't start automatically
           </button>
         </div>
      )}
    </motion.div>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background aesthetics */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary-600/20 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/20 blur-[120px] pointer-events-none"></div>

      <div className="z-10 w-full flex flex-col items-center">
        <div className="mb-12 text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-3">
            Quran<span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-indigo-400">Sync</span>
          </h1>
          <p className="text-gray-400 max-w-md mx-auto">Hyper-synchronized playback across all your devices simultaneously.</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-400 px-6 py-3 rounded-xl max-w-md text-center">
            {error}
          </div>
        )}

        <AnimatePresence mode="wait">
          {appState === 'welcome' && <WelcomeScreen key="welcome" />}
          {appState === 'loading' && <LoadingScreen key="loading" />}
          {appState === 'menu' && <MenuScreen key="menu" />}
          {appState === 'host' && <HostScreen key="host" />}
          {appState === 'client' && <ClientScreen key="client" />}
        </AnimatePresence>
      </div>
    </div>
  );
}
