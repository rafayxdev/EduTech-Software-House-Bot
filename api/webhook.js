// api/webhook.js
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// Environment Variables
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'edutech_secure_token_2026'; 
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN; 

// GET Request: Webhook Verification
app.get('/api/webhook', (req, res) => {
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.status(400).send('Bad Request');
    }
});

// Helper Function: Send Message via WhatsApp API
async function sendMessage(phoneNumberId, to, text) {
    try {
        await axios({
            method: 'POST',
            url: `https://graph.facebook.com/v25.0/${phoneNumberId}/messages`,
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
    } catch (error) {
        console.error("Error sending message:", error.response ? error.response.data : error);
    }
}

// POST Request: Process Incoming Messages
app.post('/api/webhook', async (req, res) => {
    let body = req.body;

    if (body.object) {
        if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
            let phone_number_id = body.entry[0].changes[0].value.metadata.phone_number_id;
            let from = body.entry[0].changes[0].value.messages[0].from; 
            
            // Extract message and format it (remove spaces and convert to lowercase for easy matching e.g., '1 a' becomes '1a')
            let raw_msg = body.entry[0].changes[0].value.messages[0].text.body || "";
            let msg_body = raw_msg.replace(/\s+/g, '').toLowerCase(); 

            let replyText = "";
            const greetings = ["hi", "hello", "hey", "salam", "menu", "0", "start", "help", "info"];
            const contactKeywords = ["contact", "contactus", "email", "9"];

            // --- REUSABLE CONTACT TEMPLATE ---
            const contactTemplate = `📞 *Get in Touch with Us!*\n\nPlease copy the template below, fill in your details, and email it to us at:\n📧 *furqanali.cs21@gmail.com*\n\n_--- Copy Below This Line ---_\n\n*Name:* \n*WhatsApp Number:* \n*Email Address:* \n*Purpose/Service Required:* \n*Detailed Description/Requirements:* \n\n_--- Copy Above This Line ---_\n\nWe will get back to you within 24 hours!\n\n_(Reply '0' for Main Menu)_`;

            const endOfMenuText = `\n\n_Reply 'Contact' to email us, or '0' for the Main Menu._`;

            // ---------------------------------------------------------
            // 🚀 MAIN MENU
            // ---------------------------------------------------------
            if (greetings.includes(msg_body)) {
                replyText = `*Welcome to EduTech Software House!* 🚀\n_Empowering Your Digital Journey_\n\nHow can we assist you today? Please reply with a number to explore our services:\n\n*1️⃣ Custom Web Development*\n*2️⃣ E-Commerce Solutions*\n*3️⃣ Educational Software (SMS/LMS)*\n*4️⃣ Desktop Applications*\n*5️⃣ Landing Pages & UI/UX*\n*6️⃣ Android Development*\n*7️⃣ AI Integration / Agentic AI*\n*8️⃣ Pricing & Packages*\n*9️⃣ Contact Us / Human Agent*\n\n_(Reply with '0' at any time to return to this Main Menu)_`;
            } 
            // ---------------------------------------------------------
            // 📂 1. CUSTOM WEB DEVELOPMENT
            // ---------------------------------------------------------
            else if (msg_body === '1') {
                replyText = `💻 *Custom Web Development*\nWe build robust, scalable, and secure web applications tailored to your business needs.\n\n*Select an option for details (e.g., 1A):*\n*1A* - Business Websites\n*1B* - Web Applications\n*1C* - API & System Integration\n*1D* - Website Maintenance & Support\n*1E* - Other (Custom Request)\n\n_Reply '0' for Main Menu._`;
            }
            else if (msg_body === '1a') {
                replyText = `🏢 *Business Websites*\nEstablish a strong digital presence with our fast, SEO-optimized, and mobile-responsive corporate websites. Perfect for agencies, real estate, and B2B services.` + endOfMenuText;
            }
            else if (msg_body === '1b') {
                replyText = `⚙️ *Web Applications*\nNeed something complex? We develop custom backend portals, inventory systems, and client dashboards using modern frameworks.` + endOfMenuText;
            }
            else if (msg_body === '1c') {
                replyText = `🔗 *API & System Integration*\nWe seamlessly connect your existing software with third-party APIs, payment gateways, and CRM systems to automate workflows.` + endOfMenuText;
            }
            else if (msg_body === '1d') {
                replyText = `🛠️ *Website Maintenance & Support*\nAlready have a website? We provide monthly maintenance, security updates, and bug fixing services to keep your platform running smoothly.` + endOfMenuText;
            }
            else if (msg_body === '1e') {
                replyText = contactTemplate;
            }

            // ---------------------------------------------------------
            // 🛒 2. E-COMMERCE SOLUTIONS
            // ---------------------------------------------------------
            else if (msg_body === '2') {
                replyText = `🛒 *E-Commerce Solutions*\nTake your sales online! We build high-converting online stores with secure payment gateways.\n\n*Select an option (e.g., 2A):*\n*2A* - Online Store Setup\n*2B* - Shopping Cart & Checkout\n*2C* - Payment Gateway Integration\n*2D* - Product Catalog Management\n*2E* - Other (Custom Request)\n\n_Reply '0' for Main Menu._`;
            }
            else if (msg_body === '2a') {
                replyText = `🛍️ *Online Store Setup*\nComplete e-commerce systems tailored exactly to your brand, from design to launch.` + endOfMenuText;
            }
            else if (msg_body === '2b') {
                replyText = `💳 *Shopping Cart & Checkout*\nOptimized and seamless checkout flows to reduce cart abandonment and increase your sales conversions.` + endOfMenuText;
            }
            else if (msg_body === '2c') {
                replyText = `🏦 *Payment Gateway Integration*\nSecure integration of local and international payment methods like Stripe, PayPal, JazzCash, or EasyPaisa.` + endOfMenuText;
            }
            else if (msg_body === '2d') {
                replyText = `📦 *Product Catalog Management*\nEasy-to-use admin panels for you to add, edit, or manage thousands of products and track inventory.` + endOfMenuText;
            }
            else if (msg_body === '2e') {
                replyText = contactTemplate;
            }

            // ---------------------------------------------------------
            // 🏫 3. EDUCATIONAL SOFTWARE (SMS/LMS)
            // ---------------------------------------------------------
            else if (msg_body === '3') {
                replyText = `🏫 *Educational Software (EduTech)*\nOur flagship services! We digitize schools, colleges, and academies.\n\n*Select an option (e.g., 3A):*\n*3A* - School Management System\n*3B* - Online Learning Platform (LMS)\n*3C* - Exam & Assessment Portal\n*3D* - Student & Parent Portal\n*3E* - Other (Custom Request)\n\n_Reply '0' for Main Menu._`;
            }
            else if (msg_body === '3a') {
                replyText = `📋 *School Management System (SMS)*\nA complete C#/.NET or Web-based solution for managing student records, attendance, fee generation, and staff payroll.` + endOfMenuText;
            }
            else if (msg_body === '3b') {
                replyText = `🎓 *Online Learning Platform (LMS)*\nOnline course delivery platforms featuring video lectures, grading, and student progress tracking.` + endOfMenuText;
            }
            else if (msg_body === '3c') {
                replyText = `📝 *Exam & Assessment Portal*\nSecure online testing environments with automated grading, timers, and detailed result analytics.` + endOfMenuText;
            }
            else if (msg_body === '3d') {
                replyText = `👨‍👩‍👧‍👦 *Student & Parent Portal*\nDedicated dashboards for parents and students to view attendance, report cards, and fee challans online.` + endOfMenuText;
            }
            else if (msg_body === '3e') {
                replyText = contactTemplate;
            }

            // ---------------------------------------------------------
            // 🖥️ 4. DESKTOP APPLICATIONS
            // ---------------------------------------------------------
            else if (msg_body === '4') {
                replyText = `🖥️ *Desktop Applications*\nPowerful native Windows applications built with C# and .NET for offline or secure localized environments.\n\n*Select an option (e.g., 4A):*\n*4A* - Business Software Solutions\n*4B* - POS & Billing Systems\n*4C* - Inventory Management\n*4D* - Data Management Tools\n*4E* - Other (Custom Request)\n\n_Reply '0' for Main Menu._`;
            }
            else if (msg_body === '4a') {
                replyText = `💼 *Business Software Solutions*\nCustom desktop software tailored to automate your specific office workflows and internal operations.` + endOfMenuText;
            }
            else if (msg_body === '4b') {
                replyText = `🧾 *POS & Billing Systems*\nFast and reliable Point of Sale software for retail stores, restaurants, and pharmacies with barcode scanning and receipt printing.` + endOfMenuText;
            }
            else if (msg_body === '4c') {
                replyText = `📦 *Inventory Management*\nTrack stock levels, manage suppliers, and generate low-stock alerts with our desktop inventory solutions.` + endOfMenuText;
            }
            else if (msg_body === '4d') {
                replyText = `📊 *Data Management Tools*\nSecure local databases and utilities to handle large amounts of records, data entry, and report generation.` + endOfMenuText;
            }
            else if (msg_body === '4e') {
                replyText = contactTemplate;
            }

            // ---------------------------------------------------------
            // 🚀 5. LANDING PAGES & UI/UX
            // ---------------------------------------------------------
            else if (msg_body === '5') {
                replyText = `🚀 *Landing Pages & UI/UX*\nFirst impressions matter. We design stunning, high-conversion interfaces.\n\n*Select an option (e.g., 5A):*\n*5A* - Landing Page Design\n*5B* - Website Redesign\n*5C* - Mobile-Friendly Design\n*5D* - Brand & Logo Design\n*5E* - Other (Custom Request)\n\n_Reply '0' for Main Menu._`;
            }
            else if (msg_body === '5a') {
                replyText = `🎯 *Landing Page Design*\nHigh-conversion, single-page websites optimized to turn your visitors into leads or customers.` + endOfMenuText;
            }
            else if (msg_body === '5b') {
                replyText = `🔄 *Website Redesign*\nGive your old website a modern, fresh look with improved user experience and faster load times.` + endOfMenuText;
            }
            else if (msg_body === '5c') {
                replyText = `📱 *Mobile-Friendly Design*\nEnsuring your platform looks and works perfectly on all screen sizes, from mobile phones to large desktops.` + endOfMenuText;
            }
            else if (msg_body === '5d') {
                replyText = `🎨 *Brand & Logo Design*\nCreating a unique visual identity, including logos, color palettes, and typography for your business.` + endOfMenuText;
            }
            else if (msg_body === '5e') {
                replyText = contactTemplate;
            }

            // ---------------------------------------------------------
            // 📱 6. ANDROID DEVELOPMENT
            // ---------------------------------------------------------
            else if (msg_body === '6') {
                replyText = `📱 *Android Development*\nWe create high-performance, user-friendly mobile applications.\n\n*Select an option (e.g., 6A):*\n*6A* - Mobile App Development\n*6B* - App Updates & Maintenance\n*6C* - App Store Publishing\n*6D* - App UI/UX Design\n*6E* - Other (Custom Request)\n\n_Reply '0' for Main Menu._`;
            }
            else if (msg_body === '6a') {
                replyText = `🤖 *Mobile App Development*\nNative Android applications ensuring optimal performance and seamless integration with hardware features.` + endOfMenuText;
            }
            else if (msg_body === '6b') {
                replyText = `🔄 *App Updates & Maintenance*\nKeeping your existing apps bug-free, secure, and updated with the latest Android OS requirements.` + endOfMenuText;
            }
            else if (msg_body === '6c') {
                replyText = `🚀 *App Store Publishing*\nHandling the entire process of deploying your app to the Google Play Store, adhering to all guidelines.` + endOfMenuText;
            }
            else if (msg_body === '6d') {
                replyText = `✨ *App UI/UX Design*\nDesigning intuitive and engaging mobile app interfaces that keep users coming back.` + endOfMenuText;
            }
            else if (msg_body === '6e') {
                replyText = contactTemplate;
            }

            // ---------------------------------------------------------
            // 🧠 7. AI INTEGRATION / AGENTIC AI
            // ---------------------------------------------------------
            else if (msg_body === '7') {
                replyText = `🧠 *AI Integration / Agentic AI*\nFuture-proof your business by integrating cutting-edge Artificial Intelligence.\n\n*Select an option (e.g., 7A):*\n*7A* - Smart Chatbots\n*7B* - Automation Solutions\n*7C* - Data Analysis & Insights\n*7D* - AI-Powered Features\n*7E* - Other (Custom Request)\n\n_Reply '0' for Main Menu._`;
            }
            else if (msg_body === '7a') {
                replyText = `💬 *Smart Chatbots*\nIntelligent chatbots powered by advanced LLMs (like ChatGPT) tailored to your data for customer support or lead generation.` + endOfMenuText;
            }
            else if (msg_body === '7b') {
                replyText = `⚙️ *Automation Solutions*\nStreamline business operations by automating repetitive tasks, emails, and data entry using AI workflows.` + endOfMenuText;
            }
            else if (msg_body === '7c') {
                replyText = `📈 *Data Analysis & Insights*\nLeverage AI to analyze large datasets, predict trends, and generate actionable reports for your business.` + endOfMenuText;
            }
            else if (msg_body === '7d') {
                replyText = `✨ *AI-Powered Features*\nAdding specific AI capabilities to your existing software, such as text summarization, image generation, or sentiment analysis.` + endOfMenuText;
            }
            else if (msg_body === '7e') {
                replyText = contactTemplate;
            }

            // ---------------------------------------------------------
            // 💰 8. PRICING & PACKAGES (PKR)
            // ---------------------------------------------------------
            else if (msg_body === '8') {
                replyText = `💰 *Pricing & Packages*\nEvery project is unique, but here are our general starting packages Depending on your specific requirements and features, the actual cost may adjust higher or lower to fit your custom needs.\n\n*Select an option (e.g., 8A):*\n*8A* - Basic Package\n*8B* - Standard Package\n*8C* - Premium Package\n*8D* - Custom Solution\n*8E* - Other Inquiry\n\n_Reply '0' for Main Menu._`;
            }
            else if (msg_body === '8a') {
                replyText = `🥉 *Basic Package*\n• Simple Landing Page or Portfolio\n• Mobile Responsive\n• Basic SEO\n• Starting from: *Rs. 30,000*` + endOfMenuText;
            }
            else if (msg_body === '8b') {
                replyText = `🥈 *Standard Package*\n• Corporate Website / Basic E-commerce\n• CMS (Admin Panel)\n• Performance Optimized\n• Starting from: *Rs. 75,000*` + endOfMenuText;
            }
            else if (msg_body === '8c') {
                replyText = `🥇 *Premium Package*\n• Custom Web Apps / Advanced E-commerce\n• Custom Database & Backend\n• High Security & Scalability\n• Starting from: *Rs. 150,000*` + endOfMenuText;
            }
            else if (msg_body === '8d') {
                replyText = `⚙️ *Custom Solution*\nFor large-scale platforms, AI integration, or complex desktop software (SMS/POS). Price will be determined after detailed requirement analysis.` + endOfMenuText;
            }
            else if (msg_body === '8e') {
                replyText = contactTemplate;
            }

            // ---------------------------------------------------------
            // 📞 9. CONTACT US / HUMAN AGENT
            // ---------------------------------------------------------
            else if (contactKeywords.includes(msg_body)) {
                replyText = contactTemplate;
            }

            // ---------------------------------------------------------
            // 📝 FALLBACK (User types a long message, detail, or invalid command)
            // ---------------------------------------------------------
            else {
                if (raw_msg.length > 10) {
                    replyText = `✅ *Message Received!*\n\nThank you for reaching out. We have received your message. If it is an inquiry, please ensure you use the template provided in the Contact Us section and email it to furqanali.cs21@gmail.com.\n\nMeanwhile, you can explore more of our services by replying with a number below:\n\n*1️⃣ Custom Web Development*\n*2️⃣ E-Commerce Solutions*\n*3️⃣ Educational Software (SMS/LMS)*\n*4️⃣ Desktop Applications*\n*5️⃣ Landing Pages & UI/UX*\n*6️⃣ Android Development*\n*7️⃣ AI Integration / Agentic AI*\n*8️⃣ Pricing & Packages*\n*9️⃣ Contact Us / Human Agent*`;
                } else {
                    replyText = `⚠️ *Invalid Option*\n\nI didn't quite catch that. Please type a valid number or letter from the menu.\n\nType *'0'* or *'Menu'* to see all options again.`;
                }
            }

            // Send the final reply
            if (replyText !== "") {
                await sendMessage(phone_number_id, from, replyText);
            }
        }
        res.sendStatus(200); 
    } else {
        res.sendStatus(404);
    }
});

module.exports = app;