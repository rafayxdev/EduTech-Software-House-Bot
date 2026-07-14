// api/webhook.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json({ limit: '1mb' }));

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ─────────────────────────── ENV ───────────────────────────
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'edutech_secure_token_2026';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

console.log("ENV CHECK:", {
    WHATSAPP_TOKEN: WHATSAPP_TOKEN ? "SET" : "MISSING",
    PHONE_NUMBER_ID: PHONE_NUMBER_ID ? "SET" : "MISSING",
    SUPABASE_URL: SUPABASE_URL ? "SET" : "MISSING",
    SUPABASE_SERVICE_KEY: SUPABASE_SERVICE_KEY ? "SET" : "MISSING",
    GEMINI_API_KEY: GEMINI_API_KEY ? "SET" : "MISSING",
});

// ─────────────────────────── SUPABASE ───────────────────────────
let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY && SUPABASE_SERVICE_KEY !== 'PASTE_YOUR_SERVICE_ROLE_KEY_HERE') {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    console.log("Supabase: CONNECTED");
} else {
    console.log("Supabase: DISCONNECTED (check SUPABASE_URL and SUPABASE_SERVICE_KEY in .env)");
}

// ─────────────────────────── GEMINI AI ───────────────────────────
let genAI = null;
let geminiModel = null;
if (GEMINI_API_KEY && GEMINI_API_KEY.startsWith('AIza')) {
    try {
        genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        geminiModel = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash',
            systemInstruction: `You are EduTech Software House's WhatsApp assistant. You help customers with inquiries about our services:
- Custom Web Development
- E-Commerce Solutions
- Educational Software (School Management, LMS)
- Desktop Applications
- Landing Pages & UI/UX Design
- Android Development
- AI Integration / Agentic AI

Our pricing: Basic Rs.30,000 | Standard Rs.75,000 | Premium Rs.150,000
Contact: furqanali.cs21@gmail.com

Rules:
1. Be polite, professional, and concise (WhatsApp messages should be short)
2. Use emojis moderately
3. If customer wants to talk to a human, tell them to reply "9" or "Contact"
4. Always respond in the same language the customer uses (English or Urdu/Roman Urdu)
5. Keep responses under 300 words for WhatsApp readability`
        });
        console.log("Gemini AI: CONNECTED (model: gemini-2.0-flash)");
    } catch (err) {
        console.error("Gemini AI init error:", err.message);
    }
} else {
    console.log("Gemini AI: SKIPPED (get valid key from https://aistudio.google.com/apikey)");
}

// ─────────────────────────── WHATSAPP SEND ───────────────────────────
async function sendWhatsAppMessage(phoneNumberId, to, text) {
    if (!WHATSAPP_TOKEN || !phoneNumberId || WHATSAPP_TOKEN === 'PASTE_YOUR_NEW_TOKEN_HERE') {
        console.error("WhatsApp not configured — check WHATSAPP_TOKEN and PHONE_NUMBER_ID");
        return false;
    }
    try {
        await axios({
            method: 'POST',
            url: `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
            data: {
                messaging_product: 'whatsapp',
                to: to,
                text: { body: text }
            },
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`
            }
        });
        return true;
    } catch (error) {
        const errData = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error("WhatsApp send error:", errData);
        return false;
    }
}

// ─────────────────────────── SUPABASE HELPERS ───────────────────────────
function dbUpsertConversation(phone, name) {
    if (!supabase) return;
    supabase.from('conversations').upsert({
        id: phone,
        customer_name: name || phone,
        status: 'bot',
        last_message: '',
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString()
    }, { onConflict: 'id' }).then(r => {
        if (r.error) console.error("DB upsert conv:", r.error.message);
    }).catch(e => console.error("DB upsert conv catch:", e.message));
}

function dbStoreMessage(convId, sender, content) {
    if (!supabase) return;
    supabase.from('messages').insert({
        conversation_id: convId,
        sender: sender,
        content: content,
        created_at: new Date().toISOString()
    }).then(r => {
        if (r.error) console.error("DB store msg:", r.error.message);
    }).catch(e => console.error("DB store msg catch:", e.message));
}

function dbUpdateLastMessage(convId, msg) {
    if (!supabase) return;
    supabase.from('conversations').update({
        last_message: msg,
        updated_at: new Date().toISOString()
    }).eq('id', convId).then(r => {
        if (r.error) console.error("DB update conv:", r.error.message);
    }).catch(e => console.error("DB update conv catch:", e.message));
}

function dbGetStatus(convId) {
    if (!supabase) return Promise.resolve('bot');
    return Promise.race([
        supabase.from('conversations').select('status').eq('id', convId).maybeSingle()
            .then(r => {
                if (r.error) console.error("DB get status:", r.error.message);
                return r.data?.status || 'bot';
            }).catch(() => 'bot'),
        new Promise(resolve => setTimeout(() => resolve('bot'), 3000))
    ]);
}

function dbGetConversationHistory(convId, limit = 10) {
    if (!supabase) return Promise.resolve([]);
    return supabase.from('messages')
        .select('sender, content')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: false })
        .limit(limit)
        .then(r => {
            if (r.error) {
                console.error("DB get history:", r.error.message);
                return [];
            }
            return (r.data || []).reverse();
        }).catch(() => []);
}

// ─────────────────────────── GEMINI AI REPLY ───────────────────────────
async function generateAIReply(userMessage, conversationHistory) {
    if (!geminiModel) return null;

    try {
        const chatHistory = conversationHistory.map(msg => ({
            role: msg.sender === 'customer' || msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        }));

        const chat = geminiModel.startChat({ history: chatHistory });
        const result = await chat.sendMessage(userMessage);
        const response = result.response;
        return response.text();
    } catch (error) {
        console.error("Gemini AI error:", error.message);
        return null;
    }
}

// ─────────────────────────── MENU LOGIC ───────────────────────────
function getMenuReply(msgBody) {
    const endOfMenu = `\n\n_Reply 'Contact' to email us, or '0' for the Main Menu._`;
    const contactTemplate = `*Get in Touch with Us!*\n\nPlease copy the template below, fill in your details, and email it to us at:\n*furqanali.cs21@gmail.com*\n\n_--- Copy Below This Line ---_\n\n*Name:* \n*WhatsApp Number:* \n*Email Address:* \n*Purpose/Service Required:* \n*Detailed Description/Requirements:* \n\n_--- Copy Above This Line ---_\n\nWe will get back to you within 24 hours!\n\n_(Reply '0' for Main Menu)_`;

    const greetings = ["hi", "hello", "hey", "salam", "menu", "0", "start", "help", "info", "hlo", "hlw", "aoa", "assalamualaikum"];
    const contactKeywords = ["contact", "contactus", "email", "9"];

    if (greetings.includes(msgBody)) {
        return `*Welcome to EduTech Software House!*\n_Empowering Your Digital Journey_\n\nHow can we assist you today? Please reply with a number:\n\n*1* Custom Web Development\n*2* E-Commerce Solutions\n*3* Educational Software (SMS/LMS)\n*4* Desktop Applications\n*5* Landing Pages & UI/UX\n*6* Android Development\n*7* AI Integration / Agentic AI\n*8* Pricing & Packages\n*9* Contact Us / Human Agent\n\n_(Reply '0' for Main Menu)_`;
    }
    else if (msgBody === '1') return `*Custom Web Development*\nWe build robust, scalable, and secure web apps.\n\n*1A* - Business Websites\n*1B* - Web Applications\n*1C* - API & System Integration\n*1D* - Website Maintenance\n*1E* - Custom Request\n\n_Reply '0' for Main Menu._`;
    else if (msgBody === '1a') return `*Business Websites*\nFast, SEO-optimized, mobile-responsive corporate websites.` + endOfMenu;
    else if (msgBody === '1b') return `*Web Applications*\nCustom portals, inventory systems, dashboards.` + endOfMenu;
    else if (msgBody === '1c') return `*API & System Integration*\nConnect with third-party APIs, payment gateways, CRMs.` + endOfMenu;
    else if (msgBody === '1d') return `*Website Maintenance*\nMonthly maintenance, security updates, bug fixing.` + endOfMenu;
    else if (msgBody === '1e') return contactTemplate;
    else if (msgBody === '2') return `*E-Commerce Solutions*\nHigh-converting online stores.\n\n*2A* - Online Store Setup\n*2B* - Shopping Cart\n*2C* - Payment Gateway\n*2D* - Product Catalog\n*2E* - Custom Request\n\n_Reply '0' for Main Menu._`;
    else if (msgBody === '2a') return `*Online Store Setup*\nComplete e-commerce tailored to your brand.` + endOfMenu;
    else if (msgBody === '2b') return `*Shopping Cart*\nOptimized checkout to reduce abandonment.` + endOfMenu;
    else if (msgBody === '2c') return `*Payment Gateway*\nStripe, PayPal, JazzCash, EasyPaisa integration.` + endOfMenu;
    else if (msgBody === '2d') return `*Product Catalog*\nAdmin panels for products and inventory.` + endOfMenu;
    else if (msgBody === '2e') return contactTemplate;
    else if (msgBody === '3') return `*Educational Software*\nOur flagship services!\n\n*3A* - School Management System\n*3B* - Online Learning (LMS)\n*3C* - Exam Portal\n*3D* - Student & Parent Portal\n*3E* - Custom Request\n\n_Reply '0' for Main Menu._`;
    else if (msgBody === '3a') return `*School Management System*\nComplete SMS for records, attendance, fees.` + endOfMenu;
    else if (msgBody === '3b') return `*Online Learning (LMS)*\nVideo lectures, grading, progress tracking.` + endOfMenu;
    else if (msgBody === '3c') return `*Exam Portal*\nAutomated grading, timers, analytics.` + endOfMenu;
    else if (msgBody === '3d') return `*Student & Parent Portal*\nDashboards for attendance, report cards.` + endOfMenu;
    else if (msgBody === '3e') return contactTemplate;
    else if (msgBody === '4') return `*Desktop Applications*\nNative Windows apps.\n\n*4A* - Business Software\n*4B* - POS & Billing\n*4C* - Inventory Management\n*4D* - Data Tools\n*4E* - Custom Request\n\n_Reply '0' for Main Menu._`;
    else if (msgBody === '4a') return `*Business Software*\nCustom desktop software.` + endOfMenu;
    else if (msgBody === '4b') return `*POS & Billing*\nReliable POS with barcode scanning.` + endOfMenu;
    else if (msgBody === '4c') return `*Inventory Management*\nTrack stock, suppliers, alerts.` + endOfMenu;
    else if (msgBody === '4d') return `*Data Tools*\nDatabases, data entry, reports.` + endOfMenu;
    else if (msgBody === '4e') return contactTemplate;
    else if (msgBody === '5') return `*Landing Pages & UI/UX*\nStunning designs.\n\n*5A* - Landing Page\n*5B* - Website Redesign\n*5C* - Mobile-Friendly\n*5D* - Brand & Logo\n*5E* - Custom Request\n\n_Reply '0' for Main Menu._`;
    else if (msgBody === '5a') return `*Landing Page*\nHigh-conversion single-page sites.` + endOfMenu;
    else if (msgBody === '5b') return `*Website Redesign*\nModern look with better UX.` + endOfMenu;
    else if (msgBody === '5c') return `*Mobile-Friendly*\nPerfect on all screen sizes.` + endOfMenu;
    else if (msgBody === '5d') return `*Brand & Logo*\nLogos, colors, typography.` + endOfMenu;
    else if (msgBody === '5e') return contactTemplate;
    else if (msgBody === '6') return `*Android Development*\nHigh-performance mobile apps.\n\n*6A* - App Development\n*6B* - Updates & Maintenance\n*6C* - Play Store Publishing\n*6D* - App UI/UX\n*6E* - Custom Request\n\n_Reply '0' for Main Menu._`;
    else if (msgBody === '6a') return `*App Development*\nNative Android apps.` + endOfMenu;
    else if (msgBody === '6b') return `*Updates*\nBug-free, secure apps.` + endOfMenu;
    else if (msgBody === '6c') return `*Play Store Publishing*\nFull deployment to Google Play.` + endOfMenu;
    else if (msgBody === '6d') return `*App UI/UX*\nEngaging mobile interfaces.` + endOfMenu;
    else if (msgBody === '6e') return contactTemplate;
    else if (msgBody === '7') return `*AI Integration*\nFuture-proof with AI.\n\n*7A* - Smart Chatbots\n*7B* - Automation\n*7C* - Data Analysis\n*7D* - AI Features\n*7E* - Custom Request\n\n_Reply '0' for Main Menu._`;
    else if (msgBody === '7a') return `*Smart Chatbots*\nLLM-powered chatbots for support.` + endOfMenu;
    else if (msgBody === '7b') return `*Automation*\nAutomate tasks, emails, data entry.` + endOfMenu;
    else if (msgBody === '7c') return `*Data Analysis*\nPredict trends, generate reports.` + endOfMenu;
    else if (msgBody === '7d') return `*AI Features*\nText summarization, sentiment analysis.` + endOfMenu;
    else if (msgBody === '7e') return contactTemplate;
    else if (msgBody === '8') return `*Pricing & Packages*\n\n*8A* - Basic: Rs. 30,000\n*8B* - Standard: Rs. 75,000\n*8C* - Premium: Rs. 150,000\n*8D* - Custom\n*8E* - Other Inquiry\n\n_Reply '0' for Main Menu._`;
    else if (msgBody === '8a') return `*Basic Package*\nLanding Page, Mobile Responsive, Basic SEO.\nStarting from *Rs. 30,000*` + endOfMenu;
    else if (msgBody === '8b') return `*Standard Package*\nCorporate Web, CMS, Performance.\nStarting from *Rs. 75,000*` + endOfMenu;
    else if (msgBody === '8c') return `*Premium Package*\nCustom Web Apps, Database, Security.\nStarting from *Rs. 150,000*` + endOfMenu;
    else if (msgBody === '8d') return `*Custom Solution*\nPrice determined after consultation.` + endOfMenu;
    else if (msgBody === '8e') return contactTemplate;
    else if (contactKeywords.includes(msgBody)) {
        return `*Human Agent Handover*\n\nYou are being connected to a human agent. Please wait while we assign someone to assist you.\n\nYou can also reach us at:\n*furqanali.cs21@gmail.com*\n\n_Reply '0' for Main Menu._`;
    }
    return null; // no menu match — use AI
}

// ─────────────────────────── GET: Webhook Verification ───────────────────────────
app.get('/api/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log("Webhook verified successfully!");
        res.status(200).send(challenge);
    } else {
        console.error("Webhook verification failed. Token:", token);
        res.sendStatus(403);
    }
});

// ─────────────────────────── GET: Health Check ───────────────────────────
app.get('/api/send', (req, res) => {
    res.json({
        status: 'ok',
        version: '2.1.0',
        whatsapp_token: WHATSAPP_TOKEN && WHATSAPP_TOKEN !== 'PASTE_YOUR_NEW_TOKEN_HERE' ? 'SET' : 'MISSING',
        phone_number_id: PHONE_NUMBER_ID && PHONE_NUMBER_ID !== 'PASTE_YOUR_PHONE_NUMBER_ID_HERE' ? 'SET' : 'MISSING',
        supabase: supabase ? 'CONNECTED' : 'DISCONNECTED',
        gemini_ai: geminiModel ? 'CONNECTED' : 'DISCONNECTED'
    });
});

// ─────────────────────────── POST: Agent Send (from Dashboard) ───────────────────────────
app.post('/api/send', async (req, res) => {
    try {
        const { to, text, phone_number_id } = req.body;
        if (!to || !text) return res.status(400).json({ error: 'Missing to or text' });

        const pid = phone_number_id || PHONE_NUMBER_ID;
        console.log(`AGENT SEND to ${to}: ${text.substring(0, 50)}`);
        const sent = await sendWhatsAppMessage(pid, to, text);
        console.log(`AGENT SEND result: ${sent}`);

        if (sent) {
            dbStoreMessage(to, 'agent', text);
            dbUpdateLastMessage(to, text);
        }

        res.status(sent ? 200 : 500).json(sent ? { success: true } : { error: 'WhatsApp API failed' });
    } catch (error) {
        console.error("Send error:", error.message);
        res.status(500).json({ error: 'Internal error' });
    }
});

// ─────────────────────────── POST: Incoming Webhook ───────────────────────────
app.post('/api/webhook', async (req, res) => {
    const body = req.body;

    if (body.object) {
        res.sendStatus(200);

        try {
            const changeValue = body.entry && body.entry[0] && body.entry[0].changes && body.entry[0].changes[0] && body.entry[0].changes[0].value;
            const messages = changeValue && changeValue.messages;

            if (messages && messages[0]) {
                const phone_number_id = changeValue.metadata.phone_number_id;
                const from = messages[0].from;
                const raw_msg = (messages[0].text && messages[0].text.body) || "";

                console.log(`[INCOMING] ${from}: ${raw_msg}`);

                // Get customer name
                let customerName = from;
                try {
                    const contacts = changeValue.contacts;
                    if (contacts && contacts[0] && contacts[0].profile && contacts[0].profile.name) {
                        customerName = contacts[0].profile.name;
                    }
                } catch (e) {}

                // STEP 1: Check status (with 3s timeout)
                const conversationStatus = await dbGetStatus(from);
                console.log(`[${from}] Status: ${conversationStatus}`);

                // STEP 2: If human handoff, just store message, don't reply
                if (conversationStatus === 'human') {
                    console.log(`[${from}] Human handoff active - skipping bot reply`);
                    dbUpsertConversation(from, customerName);
                    dbStoreMessage(from, 'customer', raw_msg);
                    dbUpdateLastMessage(from, raw_msg);
                    return;
                }

                // STEP 3: Generate reply
                const msgBody = raw_msg.replace(/\s+/g, '').toLowerCase();
                let replyText = getMenuReply(msgBody);

                // If no menu match, try Gemini AI
                if (replyText === null) {
                    console.log(`[${from}] No menu match, trying Gemini AI...`);
                    const history = await dbGetConversationHistory(from, 10);
                    const aiReply = await generateAIReply(raw_msg, history);
                    if (aiReply) {
                        replyText = aiReply;
                        console.log(`[${from}] Gemini AI replied`);
                    } else {
                        replyText = `*Invalid Option*\n\nPlease choose a valid option:\n\n*1* Web Dev | *2* E-Commerce\n*3* Education | *4* Desktop Apps\n*5* Landing Pages | *6* Android\n*7* AI | *8* Pricing\n*9* Contact / Human Agent\n\n_(Reply '0' for Main Menu)_`;
                    }
                }

                // STEP 4: Send reply FIRST
                if (replyText) {
                    console.log(`[${from}] Sending reply...`);
                    const sent = await sendWhatsAppMessage(phone_number_id, from, replyText);
                    console.log(`[${from}] Send result: ${sent}`);

                    // STEP 5: Supabase AFTER reply (fire-and-forget)
                    dbUpsertConversation(from, customerName);
                    dbStoreMessage(from, 'customer', raw_msg);
                    if (sent) {
                        dbStoreMessage(from, 'bot', replyText);
                    }
                    dbUpdateLastMessage(from, replyText);
                }
            }
        } catch (error) {
            console.error("Webhook processing error:", error.message);
        }
    } else {
        res.sendStatus(404);
    }
});

module.exports = app;

// ─────────────────────────── LOCAL SERVER ───────────────────────────
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`\nEduTech Bot running locally on http://localhost:${PORT}`);
        console.log(`Health check:  GET  http://localhost:${PORT}/api/send`);
        console.log(`Webhook URL:   POST http://localhost:${PORT}/api/webhook`);
        console.log(`Agent Send:    POST http://localhost:${PORT}/api/send`);
        console.log(`\nTo test WhatsApp webhook locally, use ngrok:`);
        console.log(`  ngrok http ${PORT}`);
        console.log(`  Then set ngrok URL in Meta Developer Portal\n`);
    });
}
