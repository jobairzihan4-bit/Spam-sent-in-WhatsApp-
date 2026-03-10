/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode';

/**
 * WhatsApp Marketing Automation Tool
 * Developed by Senior Node.js Developer
 * 
 * এই টুলটি ব্যবহার করে আপনি স্বয়ংক্রিয়ভাবে হোয়াটসঅ্যাপ মার্কেটিং ক্যাম্পেইন চালাতে পারবেন।
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
let currentState = 'Idle';

// --- WhatsApp Client Setup ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--unhandled-rejections=strict'],
    }
});

// QR Code Generation
client.on('qr', (qr) => {
    console.log("QR Received"); // ভেরিফিকেশনের জন্য কনসোল লগ
    qrcode.toDataURL(qr, (err, url) => {
        if (err) return console.error("QR Error:", err);
        io.emit('qr', url); // ফ্রন্টএন্ডে QR ইমেজ পাঠানো
        clientStatus = 'Scan Required';
        io.emit('status', clientStatus);
    });
});

client.on('ready', () => {
    console.log('WhatsApp Client is Ready!');
    clientStatus = 'Connected';
    io.emit('status', clientStatus);
    io.emit('qr', null); // QR কোড হাইড করা
});

client.on('disconnected', () => {
    clientStatus = 'Disconnected';
    io.emit('status', clientStatus);
    client.initialize(); // পুনরায় কানেক্ট করার চেষ্টা
});

client.initialize();

// --- Automation Logic ---
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function startCampaign(numbers: string[], messages: string[], interval: number, limit: number, pauseDuration: number) {
    isRunning = true;
    sentCount = 0;
    totalNumbers = numbers.length;
    io.emit('update_counts', { sentCount, totalNumbers });

    for (let i = 0; i < numbers.length; i++) {
        if (!isRunning) break;

        currentState = 'Sending';
        io.emit('state', currentState);

        const number = numbers[i].trim().replace('+', '');
        const chatId = `${number}@c.us`;
        const message = messages[Math.floor(Math.random() * messages.length)]; // র‍্যান্ডম মেসেজ সিলেকশন

        try {
            await client.sendMessage(chatId, message);
            sentCount++;
            io.emit('update_counts', { sentCount, totalNumbers });
        } catch (error) {
            console.error(`Error sending to ${number}:`, error);
        }

        // ব্যাচ লিমিট এবং বিরতি চেক
        if (sentCount > 0 && sentCount % limit === 0 && i < numbers.length - 1) {
            currentState = 'Paused';
            io.emit('state', currentState);
            await sleep(pauseDuration * 60 * 1000);
        } else if (i < numbers.length - 1) {
            currentState = 'Waiting';
            io.emit('state', currentState);
            await sleep(interval * 1000);
        }
    }

    isRunning = false;
    currentState = 'Finished';
    io.emit('state', currentState);
}

// --- Express & UI ---
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Marketing Tool</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        body { background-color: #0b141a; color: #e9edef; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        .glass { background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); }
        .wa-green { color: #00a884; }
        .wa-bg-green { background-color: #00a884; }
        input, textarea { background: #202c33 !important; border: 1px solid #3b4a54 !important; color: #d1d7db !important; }
        input:focus, textarea:focus { border-color: #00a884 !important; outline: none; }
    </style>
</head>
<body class="p-4 md:p-10">
    <div class="max-w-5xl mx-auto">
        <div class="flex justify-between items-center mb-10">
            <h1 class="text-3xl font-bold wa-green">WhatsApp Marketing Tool</h1>
            <div class="glass px-4 py-2 rounded-full flex items-center gap-2">
                <span id="status-dot" class="w-3 h-3 rounded-full bg-red-500"></span>
                <span id="status-text" class="text-sm font-medium">Disconnected</span>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <!-- Left: Inputs -->
            <div class="lg:col-span-2 space-y-6">
                <div class="glass p-6 rounded-2xl">
                    <label class="block text-sm font-semibold mb-2">Phone Numbers (Comma Separated)</label>
                    <textarea id="numbers" class="w-full h-32 p-3 rounded-lg" placeholder="8801700000000, 8801800000000..."></textarea>
                </div>

                <div class="glass p-6 rounded-2xl">
                    <label class="block text-sm font-semibold mb-2">Messages (One Per Line - Random Selection)</label>
                    <textarea id="messages" class="w-full h-32 p-3 rounded-lg" placeholder="Hello!\nHow are you?\nCheck this out!"></textarea>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="glass p-4 rounded-2xl">
                        <label class="block text-xs font-semibold mb-1">Interval (Seconds)</label>
                        <input type="number" id="interval" value="5" class="w-full p-2 rounded-lg">
                    </div>
                    <div class="glass p-4 rounded-2xl">
                        <label class="block text-xs font-semibold mb-1">Batch Limit</label>
                        <input type="number" id="limit" value="10" class="w-full p-2 rounded-lg">
                    </div>
                    <div class="glass p-4 rounded-2xl">
                        <label class="block text-xs font-semibold mb-1">Pause (Minutes)</label>
                        <input type="number" id="pause" value="5" class="w-full p-2 rounded-lg">
                    </div>
                </div>

                <button id="start-btn" class="wa-bg-green w-full py-4 rounded-xl font-bold text-lg hover:opacity-90 transition-all">
                    Start Campaign
                </button>
            </div>

            <!-- Right: QR & Progress -->
            <div class="space-y-6">
                <div class="glass p-6 rounded-2xl flex flex-col items-center justify-center min-h-[300px]">
                    <h3 class="font-bold mb-4">QR Code Login</h3>
                    <div id="qr-placeholder" class="text-gray-500 text-center">
                        <p>Waiting for QR...</p>
                    </div>
                    <img id="qr-img" class="hidden w-full max-w-[200px] rounded-lg border-4 border-white/10" src="" alt="QR">
                </div>

                <div class="glass p-6 rounded-2xl">
                    <h3 class="font-bold mb-4">Live Progress</h3>
                    <div class="flex justify-between mb-2">
                        <span id="state-text" class="text-xs uppercase wa-green font-bold">Idle</span>
                        <span class="text-xs text-gray-400"><span id="sent-count">0</span> / <span id="total-count">0</span></span>
                    </div>
                    <div class="w-full bg-gray-700 h-2 rounded-full overflow-hidden">
                        <div id="progress-bar" class="wa-bg-green h-full transition-all duration-500" style="width: 0%"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        const socket = io();
        const qrImg = document.getElementById('qr-img');
        const qrPlaceholder = document.getElementById('qr-placeholder');
        const statusText = document.getElementById('status-text');
        const statusDot = document.getElementById('status-dot');
        const stateText = document.getElementById('state-text');
        const sentCount = document.getElementById('sent-count');
        const totalCount = document.getElementById('total-count');
        const progressBar = document.getElementById('progress-bar');
        const startBtn = document.getElementById('start-btn');

        socket.on('qr', (url) => {
            if (url) {
                qrImg.src = url;
                qrImg.classList.remove('hidden');
                qrPlaceholder.classList.add('hidden');
            } else {
                qrImg.classList.add('hidden');
                qrPlaceholder.classList.remove('hidden');
                qrPlaceholder.innerHTML = '<p class="wa-green font-bold">✓ Connected</p>';
            }
        });

        socket.on('status', (status) => {
            statusText.innerText = status;
            statusDot.className = 'w-3 h-3 rounded-full ' + (status === 'Connected' ? 'bg-green-500' : 'bg-red-500');
        });

        socket.on('state', (state) => {
            stateText.innerText = state;
        });

        socket.on('update_counts', (data) => {
            sentCount.innerText = data.sentCount;
            totalCount.innerText = data.totalNumbers;
            const percent = data.totalNumbers > 0 ? (data.sentCount / data.totalNumbers) * 100 : 0;
            progressBar.style.width = percent + '%';
        });

        startBtn.onclick = () => {
            const numbers = document.getElementById('numbers').value.split(',').filter(n => n.trim() !== '');
            const messages = document.getElementById('messages').value.split('\\n').filter(m => m.trim() !== '');
            const interval = parseInt(document.getElementById('interval').value);
            const limit = parseInt(document.getElementById('limit').value);
            const pause = parseInt(document.getElementById('pause').value);

            if (numbers.length === 0 || messages.length === 0) return alert('Please enter numbers and messages');

            socket.emit('start_campaign', { numbers, messages, interval, limit, pause });
            startBtn.disabled = true;
            startBtn.innerText = 'Campaign Running...';
            startBtn.classList.add('opacity-50');
        };
    </script>
</body>
</html>
    `);
});

io.on('connection', (socket) => {
    socket.emit('status', clientStatus);
    socket.emit('state', currentState);
    
    socket.on('start_campaign', (data) => {
        startCampaign(data.numbers, data.messages, data.interval, data.limit, data.pause);
    });
});

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
