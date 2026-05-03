const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const admin = require("firebase-admin");
require('dotenv').config();

// 1. إعداد Firebase (تأكد من إضافة ملف الـ JSON الخاص بـ Service Account إذا كنت ستستخدمه على سيرفر خارجي)
// حالياً سنعتمد على الرابط المباشر للـ Realtime Database
admin.initializeApp({
  databaseURL: process.env.FIREBASE_DB_URL
});
const db = admin.database();

// 2. إعداد Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "أنت المساعد الذكي لبراند (طلة - Talla). رد بلهجة مصرية ودودة جداً. ساعد العميلات في اختيار الملابس والمقاسات. إذا سألت العميلة عن السعر، اطلب منها تحديد الموديل. هدفك هو تحويل الاستفسار إلى عملية بيع ناجحة."
});

// 3. إعداد واتساب (يعمل من اللابتوب)
const client = new Client({
    authStrategy: new LocalAuth(), // يحفظ الجلسة لكي لا تضطر لمسح QR كل مرة
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('--- برجاء مسح رمز QR التالي لربط واتساب براند طلة ---');
    qrcode.generate(qr, {small: true});
});

client.on('ready', () => {
    console.log('تم الاتصال بنجاح! البوت الآن جاهز لاستلام الرسائل والرد عليها.');
});

// 4. معالجة الرسائل
client.on('message', async (msg) => {
    // الرد فقط على المحادثات الفردية وتجاهل المجموعات
    if (msg.from.includes('@g.us')) return;

    try {
        const chat = await msg.getChat();
        await chat.sendStateTyping(); // إظهار 'يطلب الآن...'

        // إرسال الرسالة لـ Gemini
        const result = await model.generateContent(msg.body);
        const response = await result.response;
        const botReply = response.text();

        // حفظ سجل المحادثة في Firebase
        const phone = msg.from.replace('@c.us', '');
        const chatRef = db.ref('talla_chats/' + phone);
        await chatRef.push({
            timestamp: Date.now(),
            user_message: msg.body,
            bot_response: botReply
        });

        // إرسال الرد للعميلة
        await msg.reply(botReply);

    } catch (error) {
        console.error("خطأ أثناء معالجة الرسالة:", error);
    }
});

client.initialize();
