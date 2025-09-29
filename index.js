// =====================================================================================
// ====== קוד הבוט הסופי עם האבטחה החזקה ביותר (רישוי + OTP + Pairing Code) ======
// =====================================================================================

// --- ייבוא ספריות ---
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const fs = require("fs");
const path = require("path");
const yts = require("yt-search");
const qrcode = require("qrcode-terminal");
const YTDlpWrap = require('yt-dlp-wrap').default;
const axios = require('axios');
const readline = require('readline');

// ====================== הגדרות ללקוח ======================
// הלקוח יצטרך למלא רק את 3 השורות האלה
// -----------------------------------------------------------
const MY_API_KEY = "SHIRBOT-USER1-A4B8C1";
const MY_WHATSAPP_NUMBER = "972556796563"; 
const LICENSE_SERVER_IP = "38.242.195.144"; // <-- החלף ב-IP של ה-VPS שלך!
// -----------------------------------------------------------
// ============================================================


// --- הגדרות פנימיות ---
const OTP_REQUEST_URL = `http://${LICENSE_SERVER_IP}:9070/api/request-otp`;
const LICENSE_VALIDATE_URL = `http://${LICENSE_SERVER_IP}:9070/api/validate-license`;
const ytDlpBinaryPath = path.resolve(__dirname, 'yt-dlp');
let ytDlpWrap;
const userState = new Map();
const formatSelectionState = new Map();
const tempDir = './temp';

if (!fs.existsSync('./cookies.txt')) {
    console.error("שגיאה: קובץ הקוקיז (cookies.txt) לא נמצא.");
    process.exit(1);
}
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}

// --- מערכת הרישוי ו-OTP ---
function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

async function validateLicense() {
    console.log("שלב 1: בקשת קוד אימות מהשרת...");
    if (MY_API_KEY.startsWith("כאן-") || MY_WHATSAPP_NUMBER.startsWith("כאן-") || LICENSE_SERVER_IP === "YOUR_SERVER_IP") {
        console.error("!!! שגיאת הגדרה !!! אנא ודא שמילאת את כל הפרטים הנדרשים (API Key, מספר ווטסאפ וכתובת שרת) בקוד.");
        return false;
    }
    try {
        await axios.post(OTP_REQUEST_URL, {
            apiKey: MY_API_KEY,
            whatsappNumber: MY_WHATSAPP_NUMBER
        });
        console.log("✅ נשלחה הודעת אימות למספר הווטסאפ שלך. אנא בדוק את ההודעות.");
    } catch (error) {
        console.error("❌ שגיאה בבקשת קוד האימות:", error.response?.data?.message || "לא ניתן היה להתחבר לשרת.");
        return false;
    }
    const otpCode = await askQuestion("אנא הזן את הקוד בן 6 הספרות שקיבלת בווטסאפ: ");
    if (!otpCode || otpCode.length < 6) {
        console.error("קוד לא תקין. התהליך בוטל.");
        return false;
    }
    console.log("\nשלב 2: אימות הקוד מול השרת...");
    try {
        await axios.post(LICENSE_VALIDATE_URL, {
            apiKey: MY_API_KEY,
            whatsappNumber: MY_WHATSAPP_NUMBER,
            otpCode: otpCode.trim()
        });
        console.log("✅ אימות הרישיון הושלם בהצלחה! הבוט מתחיל לפעול...");
        return true;
    } catch (error) {
        console.error("❌ שגיאת אימות:", error.response?.data?.message || "האימות נכשל.");
        return false;
    }
}

async function main() {
    const isLicenseValid = await validateLicense();
    if (isLicenseValid) {
        await initializeAndStartBot();
    } else {
        console.error("הבוט לא יופעל עקב בעיית רישוי. התוכנית תסגר.");
        process.exit(1);
    }
}

async function initializeAndStartBot() {
    try {
        console.log("מתחיל בתהליך אתחול הבוט...");
        if (!fs.existsSync(ytDlpBinaryPath)) {
            console.log("קובץ yt-dlp לא נמצא, מתחיל הורדה...");
            await YTDlpWrap.downloadFromGithub(ytDlpBinaryPath);
            fs.chmodSync(ytDlpBinaryPath, '755');
            console.log("הורדה והגדרת הרשאות הושלמו.");
        } else {
            console.log("קובץ yt-dlp כבר קיים.");
        }
        ytDlpWrap = new YTDlpWrap(ytDlpBinaryPath);
        console.log("yt-dlp-wrap אותחל בהצלחה.");
        await startWhatsAppBot();
    } catch (error) {
        console.error("שגיאה קריטית במהלך האתחול:", error);
        process.exit(1);
    }
}

async function startWhatsAppBot() {
    const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_info");

    const sock = makeWASocket({
        logger: pino({ level: "silent" }),
        auth: state,
        browser: Browsers.macOS("Desktop"),
        printQRInTerminal: false,
    });

    if (!sock.authState.creds.registered) {
        console.log("נדרש חיבור ראשוני באמצעות קוד...");

        if (!MY_WHATSAPP_NUMBER || MY_WHATSAPP_NUMBER.startsWith("כאן-")) {
            console.error("שגיאה: מספר הווטסאפ לא הוגדר בקובץ. לא ניתן לבקש קוד חיבור.");
            process.exit(1);
        }

        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(MY_WHATSAPP_NUMBER);
                console.log("------------------------------------------------");
                console.log("בטלפון שלך, עבור אל 'מכשירים מקושרים' > 'קישור מכשיר' > 'קישור באמצעות מספר טלפון'");
                console.log(`קוד החיבור שלך הוא: ${code}`);
                console.log("------------------------------------------------");
            } catch (error) {
                console.error("נכשל ביצירת קוד חיבור:", error);
                process.exit(1);
            }
        }, 3000);
    }

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log("החיבור נסגר. מתחבר מחדש:", shouldReconnect);
            if (shouldReconnect) {
                startWhatsAppBot();
            } else {
                console.log("החיבור נסגר באופן סופי (Logged Out), לא ניתן להתחבר מחדש. ייתכן שתצטרך למחוק את תיקיית baileys_auth_info.");
            }
        } else if (connection === "open") {
            console.log("✅ הבוט מחובר בהצלחה לוואטסאפ!");
        }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();

        if (text.startsWith("!הורדת-שיר")) {
            const searchQuery = text.replace("!הורדת-שיר", "").trim();
            if (!searchQuery) {
                await sock.sendMessage(from, { text: "🤔 אנא ספק שם של שיר לחיפוש." }, { quoted: msg });
                return;
            }
            try {
                await sock.sendMessage(from, { react: { text: '🔎', key: msg.key } });
                const { videos } = await yts(searchQuery);
                const top10 = videos.slice(0, 10).filter(v => v.seconds > 0);
                if (top10.length === 0) {
                    await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                    await sock.sendMessage(from, { text: "לא נמצאו תוצאות עבור החיפוש שלך." }, { quoted: msg });
                    return;
                }
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
                userState.set(from, top10);
                let responseText = "נמצאו התוצאות הבאות, אנא בחר מספר (1-10) כדי להוריד:\n\n";
                top10.forEach((video, index) => {
                    responseText += `*${index + 1}.* ${video.title} *(${video.timestamp})*\n`;
                });
                responseText += "\n*הערה:* הבחירה שלך תהיה תקפה ל-2 הדקות הקרובות.";
                await sock.sendMessage(from, { text: responseText }, { quoted: msg });
                setTimeout(() => {
                    if (userState.has(from)) userState.delete(from);
                }, 120000);
            } catch (error) {
                console.error("שגיאה בחיפוש:", error);
                await sock.sendMessage(from, { react: { text: '⚠️', key: msg.key } });
                await sock.sendMessage(from, { text: "אופס, משהו השתבש במהלך החיפוש." }, { quoted: msg });
            }
        } else if (userState.has(from) && /^\d+$/.test(text)) {
            const choiceIndex = parseInt(text) - 1;
            const userResults = userState.get(from);
            if (choiceIndex >= 0 && choiceIndex < userResults.length) {
                const chosenVideo = userResults[choiceIndex];
                userState.delete(from);

                let countdown = 60;
                let menuText = `*השיר שנבחר:* ${chosenVideo.title}\n\n*איך תרצה לקבל את השיר?*\n\n0️⃣ קובץ שמע (ברירת מחדל)\n1️⃣ הקלטה קולית\n2️⃣ כמסמך (קובץ)\n\n9️⃣ לביטול\n\nהבחירה תתבטל בעוד *${countdown}* שניות.`;
                const menuMessage = await sock.sendMessage(from, { text: menuText }, { quoted: msg });

                const timerId = setInterval(async () => {
                    countdown--;
                    if (countdown > 0) {
                        const newText = `*השיר שנבחר:* ${chosenVideo.title}\n\n*איך תרצה לקבל את השיר?*\n\n0️⃣ קובץ שמע (ברירת מחדל)\n1️⃣ הקלטה קולית\n2️⃣ כמסמך (קובץ)\n\n9️⃣ לביטול\n\nהבחירה תתבטל בעוד *${countdown}* שניות.`;
                        if (formatSelectionState.has(from)) {
                            await sock.sendMessage(from, { text: newText, edit: menuMessage.key });
                        }
                    } else {
                        clearInterval(timerId);
                        if (formatSelectionState.has(from)) {
                            formatSelectionState.delete(from);
                            await sock.sendMessage(from, { text: "⏳ *הזמן אזל, השליחה בוטלה.*", edit: menuMessage.key });
                        }
                    }
                }, 1000);
                formatSelectionState.set(from, { chosenVideo, menuKey: menuMessage.key, timerId });
            } else {
                await sock.sendMessage(from, { text: "🤔 בחירה לא חוקית. אנא בחר מספר מהרשימה שנשלחה אליך." }, { quoted: msg });
            }
        } else if (formatSelectionState.has(from) && /^[0129]$/.test(text)) {
            const { chosenVideo, menuKey, timerId } = formatSelectionState.get(from);
            clearInterval(timerId);
            formatSelectionState.delete(from);

            const formatChoice = text;
            if (formatChoice === '9') {
                await sock.sendMessage(from, { text: "✅ *השליחה בוטלה לבקשתך.*", edit: menuKey });
                return;
            }

            await sock.sendMessage(from, {
                text: `*השיר שבחרת:* ${chosenVideo.title}\n\n📥 *מוריד את השיר מהשרת...*`,
                edit: menuKey
            });
            await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

            try {
                const filePath = path.join(tempDir, `${Date.now()}.mp3`);
                await ytDlpWrap.execPromise([
                    chosenVideo.url, '--cookies', './cookies.txt', '-f', 'bestaudio', '--audio-format', 'mp3', '-o', filePath
                ]);

                await sock.sendMessage(from, {
                    text: `*השיר שבחרת:* ${chosenVideo.title}\n\n📤 *מעלה את השיר לוואטסאפ...*`,
                    edit: menuKey
                });

                let messageOptions = {
                    caption: `🎶 ${chosenVideo.title}\n\nנשלח על ידי *שירובוט* ✨`,
                    fileName: `${chosenVideo.title}.mp3`,
                };

                switch (formatChoice) {
                    case '0':
                        messageOptions.audio = { url: filePath };
                        messageOptions.mimetype = 'audio/mpeg';
                        messageOptions.ptt = false;
                        break;
                    case '1':
                        messageOptions.audio = { url: filePath };
                        messageOptions.mimetype = 'audio/mpeg';
                        messageOptions.ptt = true;
                        break;
                    case '2':
                        messageOptions.document = { url: filePath };
                        messageOptions.mimetype = 'audio/mpeg';
                        break;
                }

                await sock.sendMessage(from, messageOptions);

                const successText = `*השיר שבחרת:* ${chosenVideo.title}\n\n✅ *השיר נשלח בהצלחה!*

🎶 *שירבוט* - רובוט להורדת שירים בוואטסאפ.
🔗 להצטרפות לקבוצה ולקבלת עדכונים:
https://chat.whatsapp.com/I9roHQDN0Y06VvDLGd18oj`;

                await sock.sendMessage(from, { text: successText, edit: menuKey });
                await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

                fs.unlinkSync(filePath);

            } catch (error) {
                console.error("שגיאה בהורדה/שליחה:", error);
                await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
                await sock.sendMessage(from, {
                    text: `*השיר שבחרת:* ${chosenVideo.title}\n\n⚠️ *אופס, שגיאה בהורדה.*\nייתכן שהסרטון ארוך מדי, פרטי, או שיש בעיה אחרת. נסה שיר אחר.`,
                    edit: menuKey
                });
            }
        }
    });
}

main();
