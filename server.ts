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
app.use(express.json({ limit: '50mb' }));

const __dirname = path.resolve();
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
} else {
    app.get('/', (req, res) => {
        res.send('Server is running. Use Vite dev server for UI.');
    });
}

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
