/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode';
import path from 'path';

/**
 * WhatsApp Auto Message Sender - Professional Tool
 * Developed for Node.js with Express and Socket.io
 * 
 * এই টুলটি ব্যবহার করে আপনি স্বয়ংক্রিয়ভাবে হোয়াটসঅ্যাপ মেসেজ এবং ফাইল পাঠাতে পারবেন।
 */

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const PORT = 3000;

// --- State Management ---
let clientStatus = 'Disconnected';
let isRunning = false;
let sentCount = 0;
let totalNumbers = 0;
let currentState = 'Idle'; // Idle, Sending, Paused, Waiting

// --- WhatsApp Client Setup ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ],
    }
});

client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrcode.toDataURL(qr, (err, url) => {
        io.emit('qr', url);
        clientStatus = 'Scan Required';
        io.emit('status', clientStatus);
    });
});

client.on('ready', () => {
    console.log('Client is ready!');
    clientStatus = 'Connected';
    io.emit('status', clientStatus);
    io.emit('qr', null); // Clear QR
});

client.on('authenticated', () => {
    console.log('Authenticated');
});

client.on('auth_failure', msg => {
    console.error('AUTHENTICATION FAILURE', msg);
    clientStatus = 'Auth Failed';
    io.emit('status', clientStatus);
});

client.on('disconnected', (reason) => {
    console.log('Client was logged out', reason);
    clientStatus = 'Disconnected';
    io.emit('status', clientStatus);
    // Re-initialize to get new QR
    client.initialize();
});

client.initialize();

// --- Automation Logic ---
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface MediaData {
    mimetype: string;
    data: string;
    filename: string;
}

async function startSending(numbers: string[], messages: string[], interval: number, limit: number, pauseDuration: number, media: MediaData | null) {
    isRunning = true;
    sentCount = 0;
    totalNumbers = numbers.length;
    
    io.emit('update_counts', { sentCount, totalNumbers });

    let messageMedia: MessageMedia | null = null;
    if (media) {
        messageMedia = new MessageMedia(media.mimetype, media.data, media.filename);
    }

    for (let i = 0; i < numbers.length; i++) {
        if (!isRunning) break;

        currentState = 'Sending';
        io.emit('state', currentState);

        const number = numbers[i].trim().replace('+', '');
        const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
        const message = messages[Math.floor(Math.random() * messages.length)];

        try {
            if (messageMedia) {
                await client.sendMessage(chatId, messageMedia, { caption: message });
            } else {
                await client.sendMessage(chatId, message);
            }
            sentCount++;
            io.emit('update_counts', { sentCount, totalNumbers });
            console.log(`Message sent to ${number}`);
        } catch (error) {
            console.error(`Failed to send to ${number}:`, error);
        }

        // Check Message Limit for Pause
        if (sentCount > 0 && sentCount % limit === 0 && i < numbers.length - 1) {
            currentState = 'Paused';
            io.emit('state', currentState);
            console.log(`Limit reached. Pausing for ${pauseDuration} minutes...`);
            await sleep(pauseDuration * 60 * 1000);
        } else if (i < numbers.length - 1) {
            currentState = 'Waiting';
            io.emit('state', currentState);
            console.log(`Waiting for ${interval} minutes...`);
            await sleep(interval * 60 * 1000);
        }
    }

    isRunning = false;
    currentState = 'Finished';
    io.emit('state', currentState);
    console.log('Task Completed');
}

// --- Express Routes ---
app.use(express.json({ limit: '50mb' })); // Increase limit for file uploads

// Dashboard UI (Glassmorphism)
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Auto Sender</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="/socket.io/socket.io.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Inter', sans-serif;
            background: radial-gradient(circle at top left, #1a1a2e, #16213e);
            color: #fff;
            min-height: 100vh;
        }
        .glass {
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 20px;
        }
        .input-glass {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #fff;
            transition: all 0.3s ease;
        }
        .input-glass:focus {
            background: rgba(255, 255, 255, 0.07);
            border-color: #4f46e5;
            outline: none;
        }
        .btn-primary {
            background: linear-gradient(135deg, #6366f1, #a855f7);
            transition: transform 0.2s ease;
        }
        .btn-primary:hover {
            transform: translateY(-2px);
        }
        .status-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            display: inline-block;
            margin-right: 8px;
        }
        .status-online { background: #10b981; box-shadow: 0 0 10px #10b981; }
        .status-offline { background: #ef4444; box-shadow: 0 0 10px #ef4444; }
        .status-waiting { background: #f59e0b; box-shadow: 0 0 10px #f59e0b; }
        
        /* Custom File Input */
        .file-input-wrapper {
            position: relative;
            overflow: hidden;
            display: inline-block;
            width: 100%;
        }
        .file-input-wrapper input[type=file] {
            font-size: 100px;
            position: absolute;
            left: 0;
            top: 0;
            opacity: 0;
            cursor: pointer;
        }
    </style>
</head>
<body class="p-4 md:p-8">
    <div class="max-w-6xl mx-auto">
        <!-- Header -->
        <div class="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
            <div>
                <h1 class="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">WhatsApp Auto Sender</h1>
                <p class="text-gray-400 text-sm">Professional Automation Dashboard</p>
            </div>
            <div class="glass px-6 py-3 flex items-center">
                <span id="status-dot" class="status-dot status-offline"></span>
                <span id="status-text" class="font-semibold">Disconnected</span>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <!-- Left Column: Settings -->
            <div class="lg:col-span-2 space-y-8">
                <div class="glass p-8">
                    <h2 class="text-xl font-semibold mb-6 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Campaign Setup
                    </h2>
                    
                    <div class="space-y-6">
                        <div>
                            <label class="block text-sm font-medium text-gray-400 mb-2">Phone Numbers (Comma separated)</label>
                            <textarea id="numbers" class="input-glass w-full h-32 p-4 rounded-xl resize-none" placeholder="8801700000000, 8801800000000..."></textarea>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-400 mb-2">Messages (New line separated for random selection)</label>
                            <textarea id="messages" class="input-glass w-full h-32 p-4 rounded-xl resize-none" placeholder="Hello there!\nHow are you?\nCheck out our new offer!"></textarea>
                        </div>

                        <div class="glass p-4 border-dashed border-2 border-white/10">
                            <label class="block text-sm font-medium text-gray-400 mb-2">Attach Photo or File (Optional)</label>
                            <div class="file-input-wrapper">
                                <button class="input-glass w-full py-3 rounded-xl text-gray-400 hover:text-white flex items-center justify-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                    </svg>
                                    <span id="file-name-display">Choose File (Photo/PDF/Doc)</span>
                                </button>
                                <input type="file" id="media-file" accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document">
                            </div>
                            <p class="text-[10px] text-gray-500 mt-2">Max size: 16MB. Supported: Images, PDF, Docs.</p>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-400 mb-2">Interval (Minutes)</label>
                                <input type="number" id="interval" class="input-glass w-full p-3 rounded-xl" value="1" min="0.1" step="0.1">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-400 mb-2">Limit (Count)</label>
                                <input type="number" id="limit" class="input-glass w-full p-3 rounded-xl" value="10">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-400 mb-2">Pause (Minutes)</label>
                                <input type="number" id="pause" class="input-glass w-full p-3 rounded-xl" value="5">
                            </div>
                        </div>

                        <button id="start-btn" class="btn-primary w-full py-4 rounded-xl font-bold text-lg shadow-lg">
                            Start Campaign
                        </button>
                        <button id="stop-btn" class="hidden w-full py-4 rounded-xl font-bold text-lg bg-red-500/20 border border-red-500/50 text-red-500">
                            Stop Campaign
                        </button>
                    </div>
                </div>
            </div>

            <!-- Right Column: Status & QR -->
            <div class="space-y-8">
                <!-- QR Code Card -->
                <div id="qr-container" class="glass p-8 flex flex-col items-center justify-center min-h-[300px]">
                    <h3 class="text-lg font-semibold mb-4">Login with QR</h3>
                    <div id="qr-placeholder" class="text-center text-gray-500">
                        <p>Waiting for QR code...</p>
                        <p class="text-xs mt-2">Make sure the server is running</p>
                    </div>
                    <img id="qr-image" class="hidden w-full max-w-[200px] rounded-lg shadow-2xl border-4 border-white/10" src="" alt="QR Code">
                </div>

                <!-- Stats Card -->
                <div class="glass p-8">
                    <h3 class="text-lg font-semibold mb-6">Live Statistics</h3>
                    <div class="space-y-6">
                        <div class="flex justify-between items-center">
                            <span class="text-gray-400">Current State</span>
                            <span id="state-badge" class="px-3 py-1 bg-gray-800 rounded-full text-xs font-bold uppercase tracking-wider">Idle</span>
                        </div>
                        <div class="flex justify-between items-end">
                            <div>
                                <p class="text-gray-400 text-sm">Sent Messages</p>
                                <p id="sent-count" class="text-4xl font-bold">0</p>
                            </div>
                            <div class="text-right">
                                <p class="text-gray-400 text-sm">Total Target</p>
                                <p id="total-count" class="text-xl font-bold text-gray-500">0</p>
                            </div>
                        </div>
                        <div class="w-full bg-gray-800 rounded-full h-2">
                            <div id="progress-bar" class="bg-indigo-500 h-2 rounded-full transition-all duration-500" style="width: 0%"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        const socket = io();
        
        const qrImage = document.getElementById('qr-image');
        const qrPlaceholder = document.getElementById('qr-placeholder');
        const statusText = document.getElementById('status-text');
        const statusDot = document.getElementById('status-dot');
        const stateBadge = document.getElementById('state-badge');
        const sentCountEl = document.getElementById('sent-count');
        const totalCountEl = document.getElementById('total-count');
        const progressBar = document.getElementById('progress-bar');
        const startBtn = document.getElementById('start-btn');
        const stopBtn = document.getElementById('stop-btn');
        const fileInput = document.getElementById('media-file');
        const fileNameDisplay = document.getElementById('file-name-display');

        let selectedMedia = null;

        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                fileNameDisplay.innerText = file.name;
                const reader = new FileReader();
                reader.onload = (event) => {
                    selectedMedia = {
                        mimetype: file.type,
                        data: event.target.result.split(',')[1],
                        filename: file.name
                    };
                };
                reader.readAsDataURL(file);
            }
        };

        // Socket Listeners
        socket.on('qr', (url) => {
            if (url) {
                qrImage.src = url;
                qrImage.classList.remove('hidden');
                qrPlaceholder.classList.add('hidden');
            } else {
                qrImage.classList.add('hidden');
                qrPlaceholder.classList.remove('hidden');
                qrPlaceholder.innerHTML = '<p class="text-green-400">✓ Logged In</p>';
            }
        });

        socket.on('status', (status) => {
            statusText.innerText = status;
            statusDot.className = 'status-dot ' + (status === 'Connected' ? 'status-online' : 'status-offline');
        });

        socket.on('state', (state) => {
            stateBadge.innerText = state;
            if (state === 'Sending') stateBadge.className = 'px-3 py-1 bg-green-500/20 text-green-500 rounded-full text-xs font-bold uppercase';
            else if (state === 'Waiting') stateBadge.className = 'px-3 py-1 bg-yellow-500/20 text-yellow-500 rounded-full text-xs font-bold uppercase';
            else if (state === 'Paused') stateBadge.className = 'px-3 py-1 bg-red-500/20 text-red-500 rounded-full text-xs font-bold uppercase';
            else stateBadge.className = 'px-3 py-1 bg-gray-800 rounded-full text-xs font-bold uppercase';
        });

        socket.on('update_counts', ({ sentCount, totalNumbers }) => {
            sentCountEl.innerText = sentCount;
            totalCountEl.innerText = totalNumbers;
            const percent = totalNumbers > 0 ? (sentCount / totalNumbers) * 100 : 0;
            progressBar.style.width = percent + '%';
        });

        // Actions
        startBtn.onclick = () => {
            const numbers = document.getElementById('numbers').value.split(',').filter(n => n.trim() !== '');
            const messages = document.getElementById('messages').value.split('\\n').filter(m => m.trim() !== '');
            const interval = parseFloat(document.getElementById('interval').value);
            const limit = parseInt(document.getElementById('limit').value);
            const pause = parseFloat(document.getElementById('pause').value);

            if (numbers.length === 0 || messages.length === 0) return alert('Please enter numbers and messages');

            socket.emit('start_campaign', { numbers, messages, interval, limit, pause, media: selectedMedia });
            startBtn.classList.add('hidden');
            stopBtn.classList.remove('hidden');
        };

        stopBtn.onclick = () => {
            socket.emit('stop_campaign');
            startBtn.classList.remove('hidden');
            stopBtn.classList.add('hidden');
        };
    </script>
</body>
</html>
    `);
});

// --- Socket Events ---
io.on('connection', (socket) => {
    console.log('User connected');
    socket.emit('status', clientStatus);
    socket.emit('state', currentState);
    socket.emit('update_counts', { sentCount, totalNumbers });

    socket.on('start_campaign', (data) => {
        if (clientStatus !== 'Connected') return;
        startSending(data.numbers, data.messages, data.interval, data.limit, data.pause, data.media);
    });

    socket.on('stop_campaign', () => {
        isRunning = false;
        currentState = 'Stopped';
        io.emit('state', currentState);
    });
});

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
