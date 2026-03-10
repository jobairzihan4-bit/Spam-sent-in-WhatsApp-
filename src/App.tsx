/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export default function App() {
  const [status, setStatus] = useState('Disconnected');
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [state, setState] = useState('Idle');
  const [sentCount, setSentCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  
  const [numbers, setNumbers] = useState('');
  const [messages, setMessages] = useState('');
  const [interval, setIntervalVal] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pause, setPause] = useState(5);
  const [selectedMedia, setSelectedMedia] = useState<{ mimetype: string; data: string; filename: string } | null>(null);
  const [fileName, setFileName] = useState('Choose File (Photo/PDF/Doc)');

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Connect to the same host
    const socket = io();
    socketRef.current = socket;

    socket.on('status', (s) => setStatus(s));
    socket.on('qr', (url) => setQrUrl(url));
    socket.on('state', (s) => {
      setState(s);
      if (s === 'Finished' || s === 'Stopped' || s === 'Idle') setIsRunning(false);
      else setIsRunning(true);
    });
    socket.on('update_counts', ({ sentCount, totalNumbers }) => {
      setSentCount(sentCount);
      setTotalCount(totalNumbers);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setSelectedMedia({
            mimetype: file.type,
            data: (event.target.result as string).split(',')[1],
            filename: file.name
          });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const startCampaign = () => {
    if (status !== 'Connected') return alert('Please scan QR code first!');
    const numList = numbers.split(',').filter(n => n.trim() !== '');
    const msgList = messages.split('\n').filter(m => m.trim() !== '');

    if (numList.length === 0 || msgList.length === 0) return alert('Enter numbers and messages!');

    socketRef.current?.emit('start_campaign', {
      numbers: numList,
      messages: msgList,
      interval,
      limit,
      pause,
      media: selectedMedia
    });
    setIsRunning(true);
  };

  const stopCampaign = () => {
    socketRef.current?.emit('stop_campaign');
    setIsRunning(false);
  };

  const progress = totalCount > 0 ? (sentCount / totalCount) * 100 : 0;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#1a1a2e,#16213e)] text-white p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
              WhatsApp Auto Sender
            </h1>
            <p className="text-gray-400 text-sm">Professional Automation Dashboard</p>
          </div>
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl px-6 py-3 flex items-center">
            <span className={`w-2.5 h-2.5 rounded-full mr-3 shadow-[0_0_10px] ${status === 'Connected' ? 'bg-emerald-500 shadow-emerald-500' : 'bg-rose-500 shadow-rose-500'}`}></span>
            <span className="font-semibold">{status}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-[20px] p-8">
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                <span className="text-indigo-400">⚡</span> Campaign Setup
              </h2>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Phone Numbers (Comma separated)</label>
                  <textarea 
                    value={numbers}
                    onChange={(e) => setNumbers(e.target.value)}
                    className="w-full h-32 p-4 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 outline-none transition-all resize-none" 
                    placeholder="8801700000000, 8801800000000..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Messages (New line separated)</label>
                  <textarea 
                    value={messages}
                    onChange={(e) => setMessages(e.target.value)}
                    className="w-full h-32 p-4 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 outline-none transition-all resize-none" 
                    placeholder="Hello there!&#10;How are you?"
                  />
                </div>

                <div className="bg-white/5 border-2 border-dashed border-white/10 p-4 rounded-xl">
                  <label className="block text-sm font-medium text-gray-400 mb-2">Attach Photo or File (Optional)</label>
                  <div className="relative overflow-hidden inline-block w-full">
                    <button className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white flex items-center justify-center gap-2">
                      <span>📤</span> {fileName}
                    </button>
                    <input 
                      type="file" 
                      onChange={handleFileChange}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Interval (Min)</label>
                    <input type="number" value={interval} onChange={(e) => setIntervalVal(Number(e.target.value))} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Limit (Count)</label>
                    <input type="number" value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Pause (Min)</label>
                    <input type="number" value={pause} onChange={(e) => setPause(Number(e.target.value))} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 focus:border-indigo-500 outline-none" />
                  </div>
                </div>

                {!isRunning ? (
                  <button onClick={startCampaign} className="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-indigo-600 to-purple-600 shadow-lg hover:scale-[1.01] transition-transform">
                    Start Campaign
                  </button>
                ) : (
                  <button onClick={stopCampaign} className="w-full py-4 rounded-xl font-bold text-lg bg-rose-500/20 border border-rose-500/50 text-rose-500">
                    Stop Campaign
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-8">
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-[20px] p-8 flex flex-col items-center justify-center min-h-[300px]">
              <h3 className="text-lg font-semibold mb-4">Login with QR</h3>
              {qrUrl ? (
                <img src={qrUrl} className="w-full max-w-[200px] rounded-lg shadow-2xl border-4 border-white/10" alt="QR" />
              ) : (
                <div className="text-center text-gray-500">
                  {status === 'Connected' ? (
                    <p className="text-emerald-400 font-bold">✓ Logged In Successfully</p>
                  ) : (
                    <p>Waiting for QR code...</p>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-[20px] p-8">
              <h3 className="text-lg font-semibold mb-6">Live Statistics</h3>
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">State</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${state === 'Sending' ? 'bg-emerald-500/20 text-emerald-500' : state === 'Waiting' ? 'bg-amber-500/20 text-amber-500' : 'bg-white/10 text-gray-400'}`}>
                    {state}
                  </span>
                </div>
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-gray-400 text-sm">Sent</p>
                    <p className="text-4xl font-bold">{sentCount}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400 text-sm">Total</p>
                    <p className="text-xl font-bold text-gray-500">{totalCount}</p>
                  </div>
                </div>
                <div className="w-full bg-white/5 rounded-full h-2">
                  <div className="bg-indigo-500 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

