// api/webhook.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.raw({ type: 'audio/*', limit: '16mb' }));

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

console.log("ENV CHECK:", {
    WHATSAPP_TOKEN: WHATSAPP_TOKEN ? "SET" : "MISSING",
    PHONE_NUMBER_ID: PHONE_NUMBER_ID ? "SET" : "MISSING",
    SUPABASE_URL: SUPABASE_URL ? "SET" : "MISSING",
    SUPABASE_SERVICE_KEY: SUPABASE_SERVICE_KEY ? "SET" : "MISSING",
});

// ─────────────────────────── SUPABASE ───────────────────────────
let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY && SUPABASE_SERVICE_KEY !== 'PASTE_YOUR_SERVICE_ROLE_KEY_HERE') {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    console.log("Supabase: CONNECTED");
} else {
    console.log("Supabase: DISCONNECTED");
}

// ─────────────────────────── WHATSAPP SEND ───────────────────────────
async function sendWhatsAppMessage(phoneNumberId, to, text) {
    if (!WHATSAPP_TOKEN || !phoneNumberId || WHATSAPP_TOKEN === 'PASTE_YOUR_NEW_TOKEN_HERE') {
        console.error("WhatsApp not configured");
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
    if (!supabase) return Promise.resolve();
    return supabase.from('conversations').upsert({
        id: phone,
        customer_name: name || phone,
        last_message: '',
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString()
    }, { onConflict: 'id' }).then(r => {
        if (r.error) console.error("DB upsert conv:", r.error.message);
    }).catch(e => console.error("DB upsert conv catch:", e.message));
}

function dbSetStatus(convId, status) {
    if (!supabase) return Promise.resolve();
    return supabase.from('conversations').update({
        status: status,
        updated_at: new Date().toISOString()
    }).eq('id', convId).then(r => {
        if (r.error) console.error("DB set status:", r.error.message);
    }).catch(e => console.error("DB set status catch:", e.message));
}

function dbSetRequestedHuman(convId, value) {
    if (!supabase) return Promise.resolve();
    return supabase.from('conversations').update({
        requested_human: value,
        updated_at: new Date().toISOString()
    }).eq('id', convId).then(r => {
        if (r.error) console.error("DB set requested_human:", r.error.message);
    }).catch(e => console.error("DB set requested_human catch:", e.message));
}

function dbStoreMessage(convId, sender, content) {
    if (!supabase) return Promise.resolve();
    return supabase.from('messages').insert({
        conversation_id: convId,
        sender: sender,
        content: content,
        created_at: new Date().toISOString()
    }).then(r => {
        if (r.error) console.error("DB store msg:", r.error.message);
    }).catch(e => console.error("DB store msg catch:", e.message));
}

function dbUpdateLastMessage(convId, msg) {
    if (!supabase) return Promise.resolve();
    return supabase.from('conversations').update({
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
        new Promise(resolve => setTimeout(() => resolve('bot'), 5000))
    ]);
}

// ─────────────────────────── MEDIA HELPERS ───────────────────────────
async function downloadWhatsAppMedia(mediaId) {
    if (!WHATSAPP_TOKEN) return null;
    try {
        const metaRes = await axios.get(`https://graph.facebook.com/v21.0/${mediaId}`, {
            headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
        });
        const url = metaRes.data.url;
        const mimeType = metaRes.data.mime_type || 'audio/ogg';

        const mediaRes = await axios.get(url, {
            headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
            responseType: 'arraybuffer'
        });
        return { buffer: Buffer.from(mediaRes.data), mimeType, filename: `${mediaId}.ogg` };
    } catch (err) {
        console.error("Media download error:", err.message);
        return null;
    }
}

async function uploadToSupabaseStorage(buffer, filename, mimeType, bucket = 'chat-media') {
    if (!supabase) return null;
    try {
        const path = `voice/${Date.now()}_${filename}`;
        const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
            contentType: mimeType,
            upsert: false
        });
        if (error) {
            console.error("Storage upload error:", error.message);
            return null;
        }
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        return data?.publicUrl || null;
    } catch (err) {
        console.error("Storage upload catch:", err.message);
        return null;
    }
}

function dbStoreMessageTyped(convId, sender, content, messageType = 'text', mediaUrl = null) {
    if (!supabase) return Promise.resolve();
    const row = {
        conversation_id: convId,
        sender: sender,
        content: content,
        message_type: messageType,
        media_url: mediaUrl,
        created_at: new Date().toISOString()
    };
    return supabase.from('messages').insert(row).then(r => {
        if (r.error) console.error("DB store typed msg:", r.error.message);
    }).catch(e => console.error("DB store typed msg catch:", e.message));
}

async function uploadToWhatsAppMedia(phoneNumberId, fileBuffer, mimeType, filename) {
    if (!WHATSAPP_TOKEN || !phoneNumberId) return null;
    try {
        const FormData = require('form-data');
        const form = new FormData();
        form.append('file', fileBuffer, { filename, contentType: mimeType });
        form.append('messaging_product', 'whatsapp');
        form.append('type', mimeType);

        const res = await axios.post(
            `https://graph.facebook.com/v21.0/${phoneNumberId}/media`,
            form,
            {
                headers: {
                    ...form.getHeaders(),
                    'Authorization': `Bearer ${WHATSAPP_TOKEN}`
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            }
        );
        console.log("WhatsApp media upload:", res.data?.id);
        return res.data?.id || null;
    } catch (err) {
        const errData = err.response ? JSON.stringify(err.response.data) : err.message;
        console.error("WhatsApp media upload error:", errData);
        return null;
    }
}

async function sendWhatsAppAudio(phoneNumberId, to, audioUrl) {
    if (!WHATSAPP_TOKEN || !phoneNumberId) return false;

    try {
        // Step 1: Download the audio file from Supabase
        const audioRes = await axios.get(audioUrl, { responseType: 'arraybuffer' });
        const fileBuffer = Buffer.from(audioRes.data);
        const isWebm = audioUrl.endsWith('.webm') || audioUrl.includes('webm');
        const mimeType = isWebm ? 'audio/webm;codecs=opus' : 'audio/ogg;codecs=opus';
        const filename = isWebm ? 'voice-message.webm' : 'voice-message.ogg';

        // Step 2: Upload to WhatsApp media API
        const mediaId = await uploadToWhatsAppMedia(phoneNumberId, fileBuffer, mimeType, filename);
        if (!mediaId) {
            console.log("WhatsApp media upload failed, trying document fallback...");
            // Fallback: send as document
            try {
                await axios({
                    method: 'POST',
                    url: `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
                    data: {
                        messaging_product: 'whatsapp',
                        to: to,
                        type: 'document',
                        document: { link: audioUrl, filename: 'voice-message.webm' }
                    },
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${WHATSAPP_TOKEN}`
                    }
                });
                return true;
            } catch (docErr) {
                const errData = docErr.response ? JSON.stringify(docErr.response.data) : docErr.message;
                console.error("Document fallback also failed:", errData);
                return false;
            }
        }

        // Step 3: Send audio using the media ID
        await axios({
            method: 'POST',
            url: `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
            data: {
                messaging_product: 'whatsapp',
                to: to,
                type: 'audio',
                audio: { id: mediaId }
            },
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`
            }
        });
        console.log("WhatsApp audio sent via media ID:", mediaId);
        return true;
    } catch (err) {
        const errData = err.response ? JSON.stringify(err.response.data) : err.message;
        console.error("WhatsApp audio send error:", errData);
        return false;
    }
}

// ─────────────────────────── MENU LOGIC ───────────────────────────
function getMenuReply(msgBody) {
    const nav = `\n\nReply *0* for Main Menu`;
    const contactTemplate = `*Get in Touch*\n\nFill this template and email us:\n\n*Name:* \n*Number:* \n*Email:* \n*Service:* \n*Details:* \n\n*Email:* furqanali.cs21@gmail.com\nWe reply within 24 hours!` + nav;

    const greetings = ["hi", "hello", "hey", "salam", "menu", "0", "start", "help", "info", "hlo", "hlw", "aoa", "assalamualaikum"];
    const contactKeywords = ["contact", "contactus", "email", "9"];

    if (greetings.includes(msgBody)) {
        return { text: `*EduTech Software House* \n\nHey there! 👋 How can we help you today?\n\n*1*  💻  Custom Web Development\n*2*  🛒  E-Commerce Solutions\n*3*  🏫  Educational Software\n*4*  🖥️  Desktop Applications\n*5*  🚀  Landing Pages & UI/UX\n*6*  📱  Android Development\n*7*  🧠  AI Integration\n*8*  💰  Pricing & Packages\n*9*  👤  Talk to Human Agent\n\n_Reply a number to get started_`, setHuman: false };
    }
    else if (msgBody === '1') return { text: `*💻 Custom Web Development*\n\nRobust, scalable web apps for your business.\n\n*1A*  Business Websites\n*1B*  Web Applications\n*1C*  API & System Integration\n*1D*  Website Maintenance\n*1E*  Custom Request` + nav, setHuman: false };
    else if (msgBody === '1a') return { text: `*🏢 Business Websites*\n\nSEO-optimized, mobile-responsive corporate websites.\n\n✔ Landing pages & corporate sites\n✔ CMS (WordPress, custom)\n✔ SEO & speed optimization\n✔ SSL & security setup` + nav, setHuman: false };
    else if (msgBody === '1b') return { text: `*⚙️ Web Applications*\n\nCustom portals, dashboards & web apps.\n\n✔ Inventory management\n✔ Customer portals\n✔ SaaS platforms\n✔ Real-time data systems` + nav, setHuman: false };
    else if (msgBody === '1c') return { text: `*🔗 API & System Integration*\n\nConnect with third-party services.\n\n✔ Payment gateways (Stripe, JazzCash)\n✔ CRM (Salesforce, HubSpot)\n✔ Social media APIs\n✔ Custom REST/GraphQL` + nav, setHuman: false };
    else if (msgBody === '1d') return { text: `*🛠 Website Maintenance*\n\nKeep your site running smooth.\n\n✔ Monthly security updates\n✔ Bug fixes & optimization\n✔ Content updates\n✔ 24/7 uptime monitoring` + nav, setHuman: false };
    else if (msgBody === '1e') return { text: contactTemplate, setHuman: false };
    else if (msgBody === '2') return { text: `*🛒 E-Commerce Solutions*\n\nHigh-converting online stores.\n\n*2A*  Online Store Setup\n*2B*  Shopping Cart\n*2C*  Payment Gateway\n*2D*  Product Catalog\n*2E*  Custom Request` + nav, setHuman: false };
    else if (msgBody === '2a') return { text: `*🛍 Online Store Setup*\n\nComplete e-commerce for your brand.\n\n✔ Custom storefront\n✔ Product listing & inventory\n✔ Order management\n✔ Mobile checkout` + nav, setHuman: false };
    else if (msgBody === '2b') return { text: `*💳 Shopping Cart*\n\nOptimized checkout to reduce abandonment.\n\n✔ One-click checkout\n✔ Guest checkout\n✔ Cart recovery emails\n✔ Multi-currency` + nav, setHuman: false };
    else if (msgBody === '2c') return { text: `*🏦 Payment Gateway*\n\nSecure payment integration.\n\n✔ Stripe & PayPal\n✔ JazzCash & EasyPaisa\n✔ Bank transfers\n✔ SSL encrypted` + nav, setHuman: false };
    else if (msgBody === '2d') return { text: `*📦 Product Catalog*\n\nPowerful admin panels for products.\n\n✔ Bulk upload\n✔ Categories & filters\n✔ Stock management\n✔ Product variants` + nav, setHuman: false };
    else if (msgBody === '2e') return { text: contactTemplate, setHuman: false };
    else if (msgBody === '3') return { text: `*🏫 Educational Software*\n\nOur flagship services!\n\n*3A*  School Management System\n*3B*  Online Learning (LMS)\n*3C*  Exam Portal\n*3D*  Student & Parent Portal\n*3E*  Custom Request` + nav, setHuman: false };
    else if (msgBody === '3a') return { text: `*📋 School Management System*\n\nComplete digital solution for schools.\n\n✔ Student records & attendance\n✔ Fee management\n✔ Timetable scheduling\n✔ Parent notifications\n✔ Report cards & analytics` + nav, setHuman: false };
    else if (msgBody === '3b') return { text: `*🎓 Online Learning (LMS)*\n\nFull-featured learning platform.\n\n✔ Video lectures & courses\n✔ Quizzes & assignments\n✔ Progress tracking\n✔ Certificates\n✔ Multi-language` + nav, setHuman: false };
    else if (msgBody === '3c') return { text: `*📝 Exam Portal*\n\nSmart examination system.\n\n✔ Auto-grading MCQs\n✔ Timer-based exams\n✔ Anti-cheating\n✔ Detailed analytics\n✔ Result publishing` + nav, setHuman: false };
    else if (msgBody === '3d') return { text: `*👨‍👩‍👧 Student & Parent Portal*\n\nDedicated dashboards for families.\n\n✔ Attendance tracking\n✔ Report cards online\n✔ Fee history\n✔ Teacher messaging\n✔ Event notifications` + nav, setHuman: false };
    else if (msgBody === '3e') return { text: contactTemplate, setHuman: false };
    else if (msgBody === '4') return { text: `*🖥️ Desktop Applications*\n\nProfessional Windows/Mac software.\n\n*4A*  Business Software\n*4B*  POS & Billing\n*4C*  Inventory Management\n*4D*  Data Tools\n*4E*  Custom Request` + nav, setHuman: false };
    else if (msgBody === '4a') return { text: `*💼 Business Software*\n\nCustom desktop software for your needs.\n\n✔ HR management systems\n✔ Accounting software\n✔ Client management\n✔ Custom databases` + nav, setHuman: false };
    else if (msgBody === '4b') return { text: `*💳 POS & Billing*\n\nReliable POS for shops & restaurants.\n\n✔ Barcode scanning\n✔ Receipt printing\n✔ Daily/weekly reports\n✔ Multi-user support` + nav, setHuman: false };
    else if (msgBody === '4c') return { text: `*📦 Inventory Management*\n\nTrack your stock with ease.\n\n✔ Stock-in / Stock-out tracking\n✔ Supplier management\n✔ Low stock alerts\n✔ Barcode integration` + nav, setHuman: false };
    else if (msgBody === '4d') return { text: `*📊 Data Tools*\n\nPowerful tools for data management.\n\n✔ Database design\n✔ Data entry systems\n✔ Auto-generated reports\n✔ Excel/CSV import/export` + nav, setHuman: false };
    else if (msgBody === '4e') return { text: contactTemplate, setHuman: false };
    else if (msgBody === '5') return { text: `*🚀 Landing Pages & UI/UX*\n\nStunning designs that convert.\n\n*5A*  Landing Page\n*5B*  Website Redesign\n*5C*  Mobile-Friendly\n*5D*  Brand & Logo\n*5E*  Custom Request` + nav, setHuman: false };
    else if (msgBody === '5a') return { text: `*📄 Landing Page*\n\nHigh-conversion single-page sites.\n\n✔ A/B testing ready\n✔ Fast loading (under 3s)\n✔ Mobile-first design\n✔ SEO optimized` + nav, setHuman: false };
    else if (msgBody === '5b') return { text: `*🎨 Website Redesign*\n\nTransform your old website.\n\n✔ Modern UI/UX overhaul\n✔ Faster performance\n✔ Better user journey\n✔ Updated branding` + nav, setHuman: false };
    else if (msgBody === '5c') return { text: `*📱 Mobile-Friendly*\n\nPerfect experience on every screen.\n\n✔ Responsive across all devices\n✔ Touch-friendly navigation\n✔ Fast mobile loading\n✔ PWA support` + nav, setHuman: false };
    else if (msgBody === '5d') return { text: `*✨ Brand & Logo*\n\nBuild a brand people remember.\n\n✔ Professional logo design\n✔ Brand color palette\n✔ Typography selection\n✔ Social media kit` + nav, setHuman: false };
    else if (msgBody === '5e') return { text: contactTemplate, setHuman: false };
    else if (msgBody === '6') return { text: `*📱 Android Development*\n\nHigh-performance mobile apps.\n\n*6A*  App Development\n*6B*  Updates & Maintenance\n*6C*  Play Store Publishing\n*6D*  App UI/UX\n*6E*  Custom Request` + nav, setHuman: false };
    else if (msgBody === '6a') return { text: `*📲 App Development*\n\nNative Android apps with latest tech.\n\n✔ Java & Kotlin development\n✔ Firebase integration\n✔ Push notifications\n✔ Offline support` + nav, setHuman: false };
    else if (msgBody === '6b') return { text: `*🔄 Updates & Maintenance*\n\nKeep your app bug-free.\n\n✔ Regular bug fixes\n✔ Security patches\n✔ Performance optimization\n✔ OS compatibility updates` + nav, setHuman: false };
    else if (msgBody === '6c') return { text: `*🚀 Play Store Publishing*\n\nComplete deployment to Play Store.\n\n✔ App listing & description\n✔ Screenshots & graphics\n✔ Store optimization (ASO)\n✔ Release management` + nav, setHuman: false };
    else if (msgBody === '6d') return { text: `*🎨 App UI/UX*\n\nEngaging mobile interfaces.\n\n✔ Wireframing & prototyping\n✔ Material Design guidelines\n✔ Custom animations\n✔ User testing` + nav, setHuman: false };
    else if (msgBody === '6e') return { text: contactTemplate, setHuman: false };
    else if (msgBody === '7') return { text: `*🧠 AI Integration*\n\nFuture-proof with Artificial Intelligence.\n\n*7A*  Smart Chatbots\n*7B*  Automation\n*7C*  Data Analysis\n*7D*  AI Features\n*7E*  Custom Request` + nav, setHuman: false };
    else if (msgBody === '7a') return { text: `*🤖 Smart Chatbots*\n\nAI-powered customer support.\n\n✔ 24/7 automated support\n✔ Natural language understanding\n✔ Multi-language support\n✔ Human handoff capability` + nav, setHuman: false };
    else if (msgBody === '7b') return { text: `*⚡ Automation*\n\nAutomate repetitive tasks.\n\n✔ Email automation\n✔ Data entry automation\n✔ Workflow automation\n✔ Report generation` + nav, setHuman: false };
    else if (msgBody === '7c') return { text: `*📈 Data Analysis*\n\nTurn data into insights.\n\n✔ Trend prediction\n✔ Customer behavior analysis\n✔ Custom dashboards\n✔ Automated reports` + nav, setHuman: false };
    else if (msgBody === '7d') return { text: `*🧩 AI Features*\n\nAdd intelligence to your apps.\n\n✔ Text summarization\n✔ Sentiment analysis\n✔ Image recognition\n✔ Recommendation engines` + nav, setHuman: false };
    else if (msgBody === '7e') return { text: contactTemplate, setHuman: false };
    else if (msgBody === '8') return { text: `*💰 Pricing & Packages*\n\nChoose the plan that fits your needs.\n\n*8A*  Basic  —  Rs. 30,000\n       Landing Page + SEO\n\n*8B*  Standard  —  Rs. 75,000\n       Corporate Web + CMS\n\n*8C*  Premium  —  Rs. 150,000\n       Custom Web App + Database\n\n*8D*  Custom  —  Price after consultation\n*8E*  Other Inquiry` + nav, setHuman: false };
    else if (msgBody === '8a') return { text: `*📋 Basic Package*  _Rs. 30,000_\n\nPerfect for startups.\n\n✔ Single-page landing website\n✔ Mobile responsive design\n✔ Basic SEO setup\n✔ Contact form & social links\n✔ 1 month free support` + nav, setHuman: false };
    else if (msgBody === '8b') return { text: `*📋 Standard Package*  _Rs. 75,000_\n\nIdeal for growing businesses.\n\n✔ Multi-page corporate website\n✔ CMS (update content yourself)\n✔ Advanced SEO\n✔ Performance optimization\n✔ 3 months free support` + nav, setHuman: false };
    else if (msgBody === '8c') return { text: `*📋 Premium Package*  _Rs. 150,000_\n\nComplete solution for enterprises.\n\n✔ Custom web application\n✔ Database design & integration\n✔ Admin dashboard\n✔ Security hardening\n✔ 6 months free support` + nav, setHuman: false };
    else if (msgBody === '8d') return { text: `*📋 Custom Solution*\n\nEvery business is unique. Let's discuss your needs.\n\nReply *9* to talk to our team directly.` + nav, setHuman: false };
    else if (msgBody === '8e') return { text: contactTemplate, setHuman: false };
    else if (contactKeywords.includes(msgBody)) {
        return { text: `*👤 Talk to Our Team*\n\nPlease provide your *Name*, *Location*, and *Purpose*. Our human agent will connect with you shortly.\n\nYou can also email us:\n*Email:* furqanali.cs21@gmail.com`, requestHuman: true, setHuman: false };
    }
    return null;
}

// ─────────────────────────── GET: Webhook Verification ───────────────────────────
app.get('/api/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log("Webhook verified!");
        res.status(200).send(challenge);
    } else {
        console.error("Verification failed. Token:", token);
        res.sendStatus(403);
    }
});

// ─────────────────────────── GET: Health Check ───────────────────────────
app.get('/api/send', (req, res) => {
    res.json({
        status: 'ok',
        version: '3.0.0',
        whatsapp_token: WHATSAPP_TOKEN && WHATSAPP_TOKEN !== 'PASTE_YOUR_NEW_TOKEN_HERE' ? 'SET' : 'MISSING',
        phone_number_id: PHONE_NUMBER_ID && PHONE_NUMBER_ID !== 'PASTE_YOUR_PHONE_NUMBER_ID_HERE' ? 'SET' : 'MISSING',
        supabase: supabase ? 'CONNECTED' : 'DISCONNECTED'
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
            await dbUpdateLastMessage(to, text);
        }

        res.status(sent ? 200 : 500).json(sent ? { success: true } : { error: 'WhatsApp API failed' });
    } catch (error) {
        console.error("Send error:", error.message);
        res.status(500).json({ error: 'Internal error' });
    }
});

// ─────────────────────────── POST: Agent Send Audio (from Dashboard) ───────────────────────────
app.post('/api/send-audio', async (req, res) => {
    try {
        const { to, audio, phone_number_id } = req.body;
        if (!to || !audio) return res.status(400).json({ error: 'Missing to or audio' });

        const pid = phone_number_id || PHONE_NUMBER_ID;
        console.log(`AGENT SEND AUDIO to ${to}, url: ${audio}`);

        const sent = await sendWhatsAppAudio(pid, to, audio);
        console.log(`AGENT SEND AUDIO result: ${sent}`);

        if (sent) {
            await dbUpdateLastMessage(to, '🎙️ Voice Message');
        }

        res.status(sent ? 200 : 500).json(sent ? { success: true } : { error: 'WhatsApp audio API failed — check bot logs for details' });
    } catch (error) {
        console.error("Send audio error:", error.message);
        res.status(500).json({ error: 'Internal error: ' + error.message });
    }
});

// ─────────────────────────── POST: Upload Audio (Dashboard) ───────────────────────────
app.post('/api/upload-audio', async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ error: 'Supabase not connected' });
        const { audio, filename, contentType } = req.body;
        if (!audio) return res.status(400).json({ error: 'Missing audio data' });

        const buffer = Buffer.from(audio, 'base64');
        const path = `voice/${filename || Date.now() + '_agent.webm'}`;

        // Auto-create bucket if it doesn't exist
        try {
            const { data: buckets } = await supabase.storage.listBuckets();
            const exists = buckets?.some(b => b.name === 'chat-media');
            if (!exists) {
                await supabase.storage.createBucket('chat-media', { public: true });
                console.log("Created chat-media bucket");
            }
        } catch (e) {
            console.log("Bucket check/create:", e.message);
        }

        const { error: uploadError } = await supabase.storage
            .from('chat-media')
            .upload(path, buffer, { contentType: contentType || 'audio/webm', upsert: false });

        if (uploadError) {
            console.error("Upload audio error:", uploadError.message);
            return res.status(500).json({ error: uploadError.message });
        }

        const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(path);
        console.log("Audio uploaded:", urlData?.publicUrl);
        res.json({ url: urlData?.publicUrl || null, path });
    } catch (err) {
        console.error("Upload audio catch:", err.message);
        res.status(500).json({ error: 'Internal error' });
    }
});

// ─────────────────────────── POST: Incoming Webhook ───────────────────────────
app.post('/api/webhook', async (req, res) => {
    const body = req.body;

    if (body.object) {
        try {
            const changeValue = body.entry && body.entry[0] && body.entry[0].changes && body.entry[0].changes[0] && body.entry[0].changes[0].value;
            const messages = changeValue && changeValue.messages;

            if (messages && messages[0]) {
                const phone_number_id = changeValue.metadata.phone_number_id;
                const from = messages[0].from;
                const msgType = messages[0].type;
                let raw_msg = '';
                let audioUrl = null;
                let messageType = 'text';

                if (msgType === 'audio' && messages[0].audio) {
                    const audioId = messages[0].audio.id;
                    console.log(`[INCOMING] ${from}: [audio message] id=${audioId}`);
                    raw_msg = '🎙️ Voice Message';
                    messageType = 'audio';

                    try {
                        const media = await downloadWhatsAppMedia(audioId);
                        if (media) {
                            audioUrl = await uploadToSupabaseStorage(media.buffer, media.filename, media.mimeType);
                            console.log(`[INCOMING] Audio stored: ${audioUrl || 'FAILED'}`);
                        }
                    } catch (err) {
                        console.error("Audio processing error:", err.message);
                    }
                } else {
                    raw_msg = (messages[0].text && messages[0].text.body) || "";
                    console.log(`[INCOMING] ${from}: ${raw_msg}`);
                }

                let customerName = from;
                try {
                    const contacts = changeValue.contacts;
                    if (contacts && contacts[0] && contacts[0].profile && contacts[0].profile.name) {
                        customerName = contacts[0].profile.name;
                    }
                } catch (e) {}

                const conversationStatus = await dbGetStatus(from);
                console.log(`[${from}] Status: ${conversationStatus}`);

                if (conversationStatus === 'human') {
                    console.log(`[${from}] Human mode - no bot reply`);
                    await Promise.all([
                        dbUpsertConversation(from, customerName),
                        dbStoreMessageTyped(from, 'customer', raw_msg, messageType, audioUrl),
                        dbUpdateLastMessage(from, raw_msg)
                    ]);
                    return res.sendStatus(200);
                }

                const msgBody = raw_msg.replace(/\s+/g, '').toLowerCase();
                const result = getMenuReply(msgBody);

                let replyText;
                let setHuman = false;
                let requestHuman = false;

                if (result) {
                    replyText = result.text;
                    setHuman = result.setHuman;
                    requestHuman = result.requestHuman || false;
                } else {
                    replyText = `*Invalid Option*\n\nPlease choose:\n\n*1* Web Dev | *2* E-Commerce\n*3* Education | *4* Desktop Apps\n*5* Landing Pages | *6* Android\n*7* AI | *8* Pricing\n*9* Contact / Human Agent\n\n_(Reply '0' for Main Menu)_`;
                }

                console.log(`[${from}] Sending reply...`);
                const sent = await sendWhatsAppMessage(phone_number_id, from, replyText);
                console.log(`[${from}] Send result: ${sent}`);

                const dbOps = [
                    dbUpsertConversation(from, customerName),
                    dbStoreMessageTyped(from, 'customer', raw_msg, messageType, audioUrl),
                    sent ? dbStoreMessageTyped(from, 'bot', replyText) : Promise.resolve(),
                    dbUpdateLastMessage(from, replyText)
                ];

                if (requestHuman) {
                    dbOps.push(dbSetRequestedHuman(from, true));
                    console.log(`[${from}] User requested human agent`);
                }

                await Promise.all(dbOps);
                console.log(`[${from}] DB writes done`);
            }
        } catch (error) {
            console.error("Webhook processing error:", error.message);
        }
        res.sendStatus(200);
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
        console.log(`Agent Send:    POST http://localhost:${PORT}/api/send\n`);
    });
}
