import https from 'https';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const TELEGRAM_BOT_TOKEN = '8967596110:AAElrSr7gBQKdYZF__IA7WiqxdRgwAitiSY';
const TARGET_CHANNEL = '@ytnewsscript';

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sendTelegramMessage(chatId, htmlContent) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: htmlContent,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  };
  
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  console.log('Compiling RCB IPL 2026 Victory SEO Package...');

  let htmlMsg = `🚀 <b>RCB IPL 2026 VICTORY — VIRAL SEO SUITE</b> 🚀\n`;
  htmlMsg += `<i>Ye SEO data use karke aapki video search aur recommendations me top par aayegi!</i>\n\n`;

  htmlMsg += `🔥 <b>TOP 5 VIRAL TITLE OPTIONS (Select 1 for High CTR):</b>\n`;
  htmlMsg += `--------------------------------------------\n`;
  htmlMsg += `1️⃣ <code>RCB vs GT IPL 2026 Final Highlights: Virat Kohli wins it with a SIX! 🏆</code>\n`;
  htmlMsg += `2️⃣ <code>RCB CHOCKED GT! 👑 Virat Kohli 75* Unbeaten in IPL 2026 Final Highlights | RCB Champions Again</code>\n`;
  htmlMsg += `3️⃣ <code>HISTORY! RCB Defends the Title! 🏆 RCB vs GT IPL 2026 Final Highlights | Virat Kohli GOAT Knock</code>\n`;
  htmlMsg += `4️⃣ <code>RCB vs GT IPL 2026 Final Match Highlights | Royal Challengers Bengaluru Won Back-to-Back Titles</code>\n`;
  htmlMsg += `5️⃣ <code>Virat Kohli's Historic 75* & Winning Six! 🏆 RCB vs GT IPL 2026 Final Trophy Celebration Highlights</code>\n`;
  htmlMsg += `--------------------------------------------\n\n`;

  htmlMsg += `📝 <b>HIGH-SEO YOUTUBE DESCRIPTION (Copy-paste fully):</b>\n`;
  htmlMsg += `<pre>`;
  htmlMsg += `RCB Won IPL 2026! Royal Challengers Bengaluru defeated Gujarat Titans by 5 wickets at the Narendra Modi Stadium to win their second consecutive IPL title! \n\n`;
  htmlMsg += `In this video, we bring you the full highlights and analysis of the historic RCB vs GT IPL 2026 Final. Chasing 156, Virat Kohli proved why he is the ultimate GOAT, smashing an unbeaten 75* off 42 balls and sealing the trophy with a sensational six in the 18th over!\n\n`;
  htmlMsg += `Watch the key moments, Rajat Patidar's captaincy brilliance, Rasikh Salam's 3-wicket spell, and the emotional trophy presentation. RCB has now joined CSK and MI as the only teams to successfully defend their IPL title!\n\n`;
  htmlMsg += `Timestamps:\n`;
  htmlMsg += `0:00 - RCB vs GT IPL 2026 Final Intro\n`;
  htmlMsg += `1:15 - GT Innings & Washington Sundar 50\n`;
  htmlMsg += `3:45 - Rasikh Salam, Bhuvi & Hazlewood Spells\n`;
  htmlMsg += `5:20 - RCB Chase & Virat Kohli 75* Masterclass\n`;
  htmlMsg += `8:10 - Winning Moments & Trophy Celebration\n\n`;
  htmlMsg += `What do you think about Virat Kohli's legacy? Comment below! 👇\n\n`;
  htmlMsg += `#IPL2026 #RCB #ViratKohli #RCBvsGT #IPL2026Final #CricketNews #PlayBold #IPLHighlights`;
  htmlMsg += `</pre>\n\n`;

  htmlMsg += `🏷️ <b>VIRAL TAGS (Direct Copy-Paste into YouTube Tags box):</b>\n`;
  htmlMsg += `<code>rcb vs gt ipl 2026 final highlights, rcb wins ipl 2026, virat kohli 75 vs gt, rcb vs gt final highlights, rcb champions again, ipl 2026 final highlights, virat kohli winning six highlights, rcb back to back ipl titles, rajat patidar ipl final trophy, rcb trophy celebration 2026, rcb vs gt ipl final 2026, cricket news, play bold, ipl winner 2026, virat kohli ipl 2026 highlights, gt vs rcb final highlights, rasikh salam wickets final, bhuvi wickets final</code>\n\n`;

  htmlMsg += `💡 <b>COMPETITOR VIDEO SEO TARGETS (To get in Recommendations):</b>\n`;
  htmlMsg += `• <b>Cricbuzz / Sports Yaari format:</b> <i>Include keywords like "IPL 2026 prize money", "Virat Kohli Anushka celebration", "Sunil Gavaskar GT final criticism" to match search queries from big channel news.</i>\n`;
  htmlMsg += `• <b>Star Sports Highlights match:</b> <i>Use exact phrases "RCB vs GT, Final Analysis - ESPNcricinfo" and "Kagiso Rabada Purple Cap" in your video tags to hook onto their search traffic.</i>\n\n`;

  htmlMsg += `📌 <b>THUMBNAIL TIP:</b>\n`;
  htmlMsg += `• Red & Gold high-contrast background use karein. Left me Virat Kohli ki celebration photo (screaming/emotional) aur right side me IPL Trophy ki photo lagayein. Bold text: <b>"CHAMPIONS AGAIN! 🏆"</b> ya <b>"BACK-TO-BACK! 🔥"</b> yellow font me likhein.\n`;

  try {
    console.log(`Sending SEO package to Telegram channel: ${TARGET_CHANNEL}...`);
    const success = await sendTelegramMessage(TARGET_CHANNEL, htmlMsg);
    if (success) {
      console.log('Success! SEO Package delivered to Telegram.');
    } else {
      console.error('Failed to send message.');
    }
  } catch (err) {
    console.error('Error sending message:', err.message);
  }
}

run();
