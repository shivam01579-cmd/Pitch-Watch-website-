import fs from 'fs';
import path from 'path';
import https from 'https';
import { GoogleGenerativeAI } from '@google/generative-ai';
import GoogleNewsDecoder from 'google-news-decoder';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const {
  GEMINI_API_KEY,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_SCRIPT_GROUP_ID,
  TELEGRAM_CHANNEL_ID // Fallback
} = process.env;

// Google News RSS feed for cricket search
const FEED_URL = 'https://news.google.com/rss/search?q=cricket+news+india&hl=en-IN&gl=IN&ceid=IN:en';

const FRIENDLY_DOMAINS = [
  'timesofindia.indiatimes.com',
  'cricbuzz.com',
  'livemint.com',
  'news18.com',
  'indianexpress.com',
  'timesofindia.com',
  'moneycontrol.com',
  'abplive.com'
];

const BLOCKED_DOMAINS = [
  'sports.ndtv.com',
  'ndtv.com',
  'olympics.com',
  'facebook.com',
  'twitter.com',
  'instagram.com',
  'hindustantimes.com',
  'espncricinfo.com',
  'espn.com',
  'reddit.com',
  'youtube.com'
];

// Helper to escape HTML characters for Telegram
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Helper to clean HTML text
function cleanText(htmlText) {
  if (!htmlText) return '';
  return htmlText
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<[^>]*>/g, '')
    .trim();
}

// Fetch URL content
function fetchUrl(url, extraHeaders = {}) {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
          'Cache-Control': 'max-age=0',
          ...extraHeaders
        },
        timeout: 8000
      };
      https.get(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchUrl(new URL(res.headers.location, url).href, extraHeaders).then(resolve);
        }
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          statusCode: res.statusCode,
          text: () => data
        }));
      }).on('error', (err) => resolve({ ok: false, statusCode: 500, text: () => err.message }))
        .on('timeout', () => resolve({ ok: false, statusCode: 504, text: () => 'timeout' }));
    } catch (err) {
      resolve({ ok: false, statusCode: 500, text: () => err.message });
    }
  });
}

// Decode Google News URL
async function decodeUrl(redirectUrl) {
  if (!redirectUrl.includes('news.google.com')) return redirectUrl;
  try {
    const decoder = new GoogleNewsDecoder();
    const result = await decoder.decodeGoogleNewsUrl(redirectUrl);
    if (result && result.status && result.decodedUrl) {
      return result.decodedUrl;
    }
  } catch (e) {
    // Ignore decoding failure, return original redirect URL
  }
  return redirectUrl;
}

// Scrape og:image from article URL
async function scrapeOgImage(articleUrl) {
  const realUrl = await decodeUrl(articleUrl);
  const domain = new URL(realUrl).hostname.toLowerCase();
  
  if (BLOCKED_DOMAINS.some(blocked => domain.includes(blocked))) {
    throw new Error(`Domain ${domain} is blocked.`);
  }

  const res = await fetchUrl(realUrl);
  if (!res.ok) {
    throw new Error(`HTTP ${res.statusCode}`);
  }
  const html = res.text();

  const ogMatch =
    html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i) ||
    html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);

  if (!ogMatch || !ogMatch[1]) {
    throw new Error('No image tag');
  }

  const imageUrl = ogMatch[1].trim();

  const isGeneric =
    imageUrl.includes('logo') ||
    imageUrl.includes('default') ||
    imageUrl.includes('fallback') ||
    imageUrl.includes('placeholder') ||
    imageUrl.includes('IE-OGimage') ||
    imageUrl.includes('facebook-share') ||
    imageUrl.endsWith('mc_logo_200x200.png');

  if (!imageUrl.startsWith('http') || isGeneric) {
    throw new Error('Generic image URL');
  }

  return imageUrl;
}

// Search RSS feed for a query
async function searchRSS(query) {
  const searchUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
  try {
    const res = await fetchUrl(searchUrl);
    if (!res.ok) return [];
    const xml = res.text();
    const matches = [...xml.matchAll(/<item>[\s\S]*?<link>([^<]+)<\/link>/gi)];
    return matches.map(m => m[1].trim());
  } catch (err) {
    console.warn(`[Search Error] ${err.message}`);
    return [];
  }
}

// Scrape related images for a story
async function getRelatedImages(postTitle, sourceUrl) {
  const images = [];
  
  // 1. Try selected story source URL
  if (sourceUrl) {
    try {
      console.log(`Scraping source URL: ${sourceUrl}`);
      const img = await scrapeOgImage(sourceUrl);
      if (img && !images.includes(img)) {
        images.push(img);
      }
    } catch (err) {
      console.warn(`Failed to scrape image from source URL: ${err.message}`);
    }
  }

  // 2. Clean title and search friendly domains for more images
  const cleanTitle = postTitle
    .replace(/#[a-zA-Z0-9]+/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (images.length < 4 && cleanTitle) {
    const friendlyFilter = `(${FRIENDLY_DOMAINS.map(d => `site:${d}`).join(' OR ')})`;
    const query = `"${cleanTitle}" ${friendlyFilter}`;
    console.log(`Searching for related articles: ${query}`);
    const links = await searchRSS(query);
    
    for (const link of links) {
      if (images.length >= 4) break;
      try {
        const img = await scrapeOgImage(link);
        if (img && !images.includes(img)) {
          images.push(img);
        }
      } catch (err) {
        // Ignore individual failures
      }
    }
  }

  // 3. Fallback broader search if still not enough images
  if (images.length < 4 && cleanTitle) {
    const broaderQuery = `${cleanTitle} cricket`;
    console.log(`Searching broader articles: ${broaderQuery}`);
    const links = await searchRSS(broaderQuery);
    
    for (const link of links) {
      if (images.length >= 4) break;
      try {
        const img = await scrapeOgImage(link);
        if (img && !images.includes(img)) {
          images.push(img);
        }
      } catch (err) {
        // Ignore
      }
    }
  }

  return images;
}

// Send HTML message to Telegram group/channel
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
          reject(new Error(`Telegram API Error ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Main execution workflow
async function run() {
  console.log('Starting Cricket YouTube Script Generator...');

  if (!GEMINI_API_KEY) {
    console.error('CRITICAL: GEMINI_API_KEY is not defined in environment.');
    process.exit(1);
  }
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('CRITICAL: TELEGRAM_BOT_TOKEN is not defined in environment.');
    process.exit(1);
  }

  // Determine target chat ID
  let targetChatId = TELEGRAM_SCRIPT_GROUP_ID || TELEGRAM_CHANNEL_ID;
  if (!targetChatId) {
    console.error('CRITICAL: Neither TELEGRAM_SCRIPT_GROUP_ID nor TELEGRAM_CHANNEL_ID is defined in environment.');
    process.exit(1);
  }

  if (!TELEGRAM_SCRIPT_GROUP_ID) {
    console.warn(`[Warning] TELEGRAM_SCRIPT_GROUP_ID missing. Falling back to default channel ID: ${targetChatId}`);
  }

  try {
    console.log(`Fetching trending news from Google News RSS feed...`);
    const feedRes = await fetchUrl(FEED_URL);
    if (!feedRes.ok) {
      throw new Error(`Failed to fetch RSS feed: ${feedRes.statusCode}`);
    }
    const xml = feedRes.text();

    // Parse items
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    const rawStories = [];
    
    while ((match = itemRegex.exec(xml)) !== null) {
      const itemContent = match[1];
      const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(itemContent);
      const linkMatch = /<link>([\s\S]*?)<\/link>/.exec(itemContent);
      const descMatch = /<description>([\s\S]*?)<\/description>/.exec(itemContent);
      const dateMatch = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(itemContent);
      
      if (titleMatch && linkMatch) {
        rawStories.push({
          title: cleanText(titleMatch[1]),
          link: cleanText(linkMatch[1]),
          description: descMatch ? cleanText(descMatch[1]) : '',
          pubDate: dateMatch ? cleanText(dateMatch[1]) : ''
        });
      }
    }

    if (rawStories.length === 0) {
      throw new Error('No articles found in Google News feed.');
    }

    console.log(`Discovered ${rawStories.length} raw articles. Decoding top 15 redirect links...`);
    
    const stories = [];
    // Only decode top 15 to keep it fast
    for (let i = 0; i < Math.min(15, rawStories.length); i++) {
      const story = rawStories[i];
      try {
        const decoded = await decodeUrl(story.link);
        stories.push({
          title: story.title,
          link: decoded,
          description: story.description,
          pubDate: story.pubDate
        });
      } catch (err) {
        stories.push(story);
      }
    }

    console.log(`Formatting list of articles for Gemini AI...`);
    const headlinesList = stories.map((s, idx) => {
      return `Story #${idx + 1}:
Title: ${s.title}
Link: ${s.link}
PubDate: ${s.pubDate}
Description: ${s.description}`;
    }).join('\n\n');

    console.log(`Calling Gemini AI to select top story and generate YouTube Fatafat scripts...`);
    const ai = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = ai.getGenerativeModel({
      model: 'gemini-flash-latest',
      generationConfig: { responseMimeType: 'application/json' }
    });

    const systemInstruction = `
You are a highly successful, creative producer and scriptwriter for a viral cricket news YouTube channel.
Your writing style is heavily inspired by "Neon Man" or "Ekdum Fatafat" - super high energy, fast-paced narration, very engaging hooks, and brief, dramatic reports.
The channel targets Indian fans. 90% of your choices must be Indian cricket (Team India, IPL, BCCI updates, controversial decisions, captaincy changes, selection drama, dressing room secrets).
If there is a major international cricket story (record or controversy) that is too big to ignore, you may select it.

Given a list of trending cricket stories, you must choose the SINGLE most viral, controversial, or record-breaking story, and output a complete production suite.

The video script must fit exactly in a 2-minute video (spoken word count must be strictly between 270 and 320 words, excluding editor visual cues).
You must write the script in Hinglish (Hindi spoken language written in Latin script, e.g., "Doston, kya Virat Kohli sach me retire hone wale hain?").

Your output must be a valid JSON matching this schema:
{
  "selected_story": {
    "title": "Clean, original title of the selected story",
    "source_url": "Direct link of the selected story"
  },
  "titles": [
    "Viral Title Option 1 (high CTR, numbers, emojis)",
    "Viral Title Option 2",
    "Viral Title Option 3",
    "Viral Title Option 4"
  ],
  "description": "SEO optimized brief description for YouTube containing summary of the topic and 3 relevant hashtags.",
  "tags": "Comma-separated list of 15-20 viral YouTube tags for cricket SEO",
  "script": "The video script. Structure:
- Hook (first 10 seconds, extremely catchy)
- Body (explaining the controversy, stats, or gossip with high energy)
- Outro (Call to Action to like, subscribe and comment their opinion)
CRITICAL: Embed editor directions/visual cues inside square brackets like [Visual: Show Virat Kohli looking angry], [Visual: Show GT vs RCB scorecard], [Visual: Text overlay 'DRESSING ROOM LEAKED!'] at the exact points they should appear.
The words inside brackets [Visual: ...] are for the editor and are NOT read aloud. The remaining spoken Hinglish text MUST be between 270 and 320 words."
}
`;

    const prompt = `
Trending stories list:
${headlinesList}

Please review the stories, select the absolute best candidate for a viral 2-minute video, and generate the JSON package exactly as specified.
`;

    let result;
    let attempts = 0;
    const maxAttempts = 3;
    const retryDelayMs = 45000; // 45 seconds

    while (attempts < maxAttempts) {
      try {
        result = await model.generateContent([
          { text: systemInstruction },
          { text: prompt }
        ]);
        break; // Success, break the loop
      } catch (geminiErr) {
        attempts++;
        if (geminiErr.status === 429 && attempts < maxAttempts) {
          console.warn(`[Gemini] Rate limited (429). Retrying attempt ${attempts}/${maxAttempts} in ${retryDelayMs / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        } else {
          throw geminiErr; // Rethrow if not a 429 or max attempts reached
        }
      }
    }

    const responseText = result.response.text();
    console.log('Gemini raw response received.');
    
    let suiteData;
    try {
      suiteData = JSON.parse(responseText);
    } catch (jsonErr) {
      console.error('Failed to parse Gemini JSON response:', responseText);
      throw new Error(`Gemini JSON parse failed: ${jsonErr.message}`);
    }

    console.log(`Top story selected: "${suiteData.selected_story.title}"`);
    console.log(`Starting image scraping for topic...`);

    const imageLinks = await getRelatedImages(
      suiteData.selected_story.title,
      suiteData.selected_story.source_url
    );

    console.log(`Scraped ${imageLinks.length} image links for editing.`);

    // Format Telegram message using HTML
    const escTitle = escapeHtml(suiteData.selected_story.title);
    const escUrl = suiteData.selected_story.source_url;
    
    let htmlMsg = `🔥 <b>CRICKET FATAFAT VIDEO SUITE</b> 🔥\n\n`;
    htmlMsg += `📌 <b>SELECTED STORY:</b>\n<a href="${escUrl}">${escTitle}</a>\n\n`;
    
    htmlMsg += `🎬 <b>VIRAL TITLE OPTIONS:</b>\n`;
    suiteData.titles.forEach((t, i) => {
      htmlMsg += `${i + 1}️⃣ <code>${escapeHtml(t)}</code>\n`;
    });
    htmlMsg += `\n`;

    htmlMsg += `📝 <b>SEO DESCRIPTION:</b>\n<pre>${escapeHtml(suiteData.description)}</pre>\n\n`;
    htmlMsg += `🏷️ <b>SEO TAGS:</b>\n<code>${escapeHtml(suiteData.tags)}</code>\n\n`;
    
    htmlMsg += `🎙️ <b>NEON MAN STYLE SCRIPT (~2 Min):</b>\n`;
    htmlMsg += `--------------------------------------------\n`;
    htmlMsg += `${escapeHtml(suiteData.script)}\n`;
    htmlMsg += `--------------------------------------------\n\n`;

    htmlMsg += `🖼️ <b>RECOMMENDED IMAGES FOR EDITING:</b>\n`;
    if (imageLinks.length > 0) {
      imageLinks.forEach((img, i) => {
        htmlMsg += `${i + 1}. <a href="${img}">Image Link ${i + 1}</a>\n`;
      });
    } else {
      htmlMsg += `<i>No direct image links found. Please search Google for visual assets.</i>\n`;
    }

    console.log(`Sending complete video suite to Telegram: ${targetChatId}...`);
    await sendTelegramMessage(targetChatId, htmlMsg);
    console.log('Success! Video suite delivered successfully to Telegram.');

  } catch (error) {
    console.error('Execution failed:', error);
    process.exit(1);
  }
}

run();
