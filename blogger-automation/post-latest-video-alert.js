import fs from 'fs';
import path from 'path';
import https from 'https';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const {
  GEMINI_API_KEY,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHANNEL_ID,
  YOUTUBE_HANDLE
} = process.env;

const handle = YOUTUBE_HANDLE || '@PITCHWATCH01';
const cleanHandle = handle.startsWith('@') ? handle : `@${handle}`;

function fetchUrl(url) {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(url);
      https.get({
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8'
        },
        timeout: 10000
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          statusText: res.statusMessage,
          text: () => Promise.resolve(data)
        }));
      }).on('error', (err) => resolve({ ok: false, statusText: err.message, text: () => '' }));
    } catch (err) {
      resolve({ ok: false, statusText: err.message, text: () => '' });
    }
  });
}

// Scrape YouTube videos
async function fetchLatestYouTubeVideos(channelHandle) {
  console.log(`[YouTube] Fetching latest videos for: ${channelHandle}...`);
  try {
    const url = `https://www.youtube.com/${channelHandle}`;
    const res = await fetchUrl(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch channel page: ${res.statusText}`);
    }
    const html = await res.text();
    const videos = [];
    let pos = 0;
    
    while (true) {
      pos = html.indexOf('"videoId":"', pos);
      if (pos === -1) break;
      const id = html.slice(pos + 11, pos + 22);
      
      // Find video title
      let titlePos = html.indexOf('"title":{"content":"', pos);
      let titleStart = -1;
      if (titlePos !== -1 && titlePos - pos < 8000) {
        titleStart = titlePos + 20;
      } else {
        titlePos = html.indexOf('"title":{"runs":[{"text":"', pos);
        if (titlePos !== -1 && titlePos - pos < 8000) {
          titleStart = titlePos + 26;
        }
      }
      
      if (titleStart !== -1) {
        const titleEnd = html.indexOf('"', titleStart);
        const title = html.slice(titleStart, titleEnd);
        
        if (id.length === 11 && !videos.some(v => v.id === id)) {
          const cleanTitle = title.replace(/\\u([0-9a-fA-F]{4})/g, (match, grp) => {
            return String.fromCharCode(parseInt(grp, 16));
          });
          videos.push({ id, title: cleanTitle });
        }
      }
      pos += 22;
    }
    console.log(`[YouTube] Scraped ${videos.length} videos.`);
    return videos;
  } catch (err) {
    console.error(`[YouTube] Error scraping videos:`, err.message);
    return [];
  }
}

// Send Telegram Message
function sendTelegramMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML'
  };
  
  return new Promise((resolve) => {
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
        resolve(res.statusCode >= 200 && res.statusCode < 300);
      });
    });
    req.on('error', () => resolve(false));
    req.write(data);
    req.end();
  });
}

async function run() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID) {
    console.error('Blogger Telegram credentials missing in .env');
    process.exit(1);
  }

  const videos = await fetchLatestYouTubeVideos(cleanHandle);
  if (videos.length === 0) {
    console.error('No videos found on YouTube channel.');
    process.exit(1);
  }

  const latestVideo = videos[0];
  console.log(`\nLatest Video Detected:`);
  console.log(`Title: ${latestVideo.title}`);
  console.log(`URL: https://www.youtube.com/watch?v=${latestVideo.id}\n`);

  console.log('Generating engaging Hinglish promo caption using Gemini AI...');
  const ai = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

  const prompt = `
    You are a social media manager for a viral cricket news channel.
    Write a high-energy, viral, extremely engaging Telegram promotional caption in Hinglish (Hindi written in English alphabet, e.g. "Doston, ye video bilkul miss mat karna!") for the following YouTube video:
    Video Title: "${latestVideo.title}"
    Video URL: https://www.youtube.com/watch?v=${latestVideo.id}

    Guidelines:
    - Use cricket emojis, exclamation marks, and dramatic spacing.
    - Start with a hot hook or question.
    - Explain in a fast-paced tone why they must watch it right now.
    - Include a clear call-to-action (CTA) to click the link and watch.
    - End with a prompt to like, comment and subscribe.
    - Return ONLY the final formatted message text, ready to be sent. Do NOT include any intro or outro commentary in your response.
  `;

  let responseText = '';
  try {
    const result = await model.generateContent(prompt);
    responseText = result.response.text().trim();
  } catch (err) {
    console.warn('Gemini call failed or rate limited, falling back to default caption.');
    responseText = `🚨 <b>NEW VIDEO IS LIVE!</b> 🚨\n\n🔥 <b>${latestVideo.title}</b>\n\nDoston, humara naya video abhi abhi live ho chuka hai! Ekdum Fatafat news aur analytics ke liye abhi click karke poora video dekhein! 👇\n\n🎥 <b>Watch Now:</b> https://www.youtube.com/watch?v=${latestVideo.id}\n\nLike aur share karna mat bhoolna! 🏏`;
  }

  // Ensure link is inside caption if not present
  if (!responseText.includes(latestVideo.id)) {
    responseText += `\n\n🎥 <b>Watch Now:</b> https://www.youtube.com/watch?v=${latestVideo.id}`;
  }

  console.log('------------------------------');
  console.log(responseText);
  console.log('------------------------------');

  console.log(`Sending to Telegram channel: ${TELEGRAM_CHANNEL_ID}...`);
  const success = await sendTelegramMessage(TELEGRAM_CHANNEL_ID, responseText);
  if (success) {
    console.log('Success! Video promotional alert posted to Telegram.');
  } else {
    console.error('Failed to send Telegram message.');
  }
}

run();
