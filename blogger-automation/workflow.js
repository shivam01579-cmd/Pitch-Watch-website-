import fs from 'fs';
import path from 'path';
import https from 'https';
import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import GoogleNewsDecoder from 'google-news-decoder';

// Load environment variables
dotenv.config();

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  BLOG_ID,
  SPREADSHEET_ID,
  GEMINI_API_KEY,
  UNSPLASH_ACCESS_KEY,
  PEXELS_API_KEY,
  YOUTUBE_HANDLE,
  FACEBOOK_PAGE_URL,
  FACEBOOK_GROUPS,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHANNEL_ID,
  FACEBOOK_PAGE_ID,
  FACEBOOK_PAGE_ACCESS_TOKEN
} = process.env;


// Parse CLI flags
const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(`--${flag}`);
const getFlagValue = (flag) => {
  const arg = args.find(a => a.startsWith(`--${flag}=`));
  return arg ? arg.split('=')[1] : null;
};

const isDryRun = hasFlag('dry-run');
const loopMode = hasFlag('loop');
const discoverMode = hasFlag('discover');
const processMode = hasFlag('process-one');

const loopIntervalMs = parseInt(getFlagValue('interval'), 10) * 60 * 1000 || 30 * 60 * 1000; // default 30 minutes

// RSS Feed settings
const FEED_URL = 'https://news.google.com/rss/search?q=cricket+news&hl=en-IN&gl=IN&ceid=IN:en';

function cleanText(htmlText) {
  if (!htmlText) return '';
  return htmlText
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<[^>]*>/g, '')
    .trim();
}

function fetchUrl(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          ...extraHeaders
        }
      };
      https.get(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            statusText: res.statusMessage,
            text: () => Promise.resolve(data)
          });
        });
      }).on('error', (err) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function decodeUrl(url) {
  try {
    const decoder = new GoogleNewsDecoder();
    const decodedResult = await decoder.decodeGoogleNewsUrl(url);
    if (decodedResult && decodedResult.status && decodedResult.decodedUrl) {
      return decodedResult.decodedUrl;
    }
  } catch (err) {
    console.warn(`[Decoder] Warning during URL resolution: ${err.message}`);
  }
  return url;
}


// All images below are real, high-quality, free-to-use cricket photos from Unsplash and Wikimedia.
// ZERO AI-generated images. Fallback only used when og:image scraping from source article fails.
const CURATED_CRICKET_IMAGES = [
  // General stadium / match atmosphere
  {
    url: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=850&auto=format&fit=crop&q=80',
    caption: 'Cricket match in progress at a packed stadium. Photo via Unsplash.',
    keywords: ['stadium', 'match', 'ipl', 't20', 'odi', 'international', 'lights', 'crowd', 'run', 'score', 'final', 'qualifier']
  },
  // Batsman at crease
  {
    url: 'https://images.unsplash.com/photo-1593341606579-7f97d02474d4?w=850&auto=format&fit=crop&q=80',
    caption: 'A cricket batsman in action at the crease. Photo via Unsplash.',
    keywords: ['batsman', 'batting', 'run', 'score', 'century', 'fifty', 'partnership', 'opener', 'innings', 'dhoni', 'kohli', 'sharma', 'csk', 'mi', 'rcb', 'gt', 'srh', 'hundred', 'six', 'four']
  },
  // Cricket pitch wide view
  {
    url: 'https://images.unsplash.com/photo-1512412086890-a7ecb9152b22?w=850&auto=format&fit=crop&q=80',
    caption: 'A wide view of the cricket ground and pitch. Photo via Unsplash.',
    keywords: ['pitch', 'outfield', 'ground', 'stadium', 'weather', 'rain', 'toss', 'conditions', 'wicket', 'spin', 'grass']
  },
  // Floodlit evening match
  {
    url: 'https://images.unsplash.com/photo-1589801258579-18e0ae1d7ad7?w=850&auto=format&fit=crop&q=80',
    caption: 'Stadium floodlights illuminate the evening match. Photo via Unsplash.',
    keywords: ['lights', 'floodlights', 'evening', 'night', 'd/n', 'stadium', 'ipl', 't20', 'powerplay', 'death overs']
  },
  // Stadium crowd/fans
  {
    url: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=850&auto=format&fit=crop&q=80',
    caption: 'Cricket fans cheering from the stands. Photo via Unsplash.',
    keywords: ['crowd', 'fans', 'spectators', 'cheering', 'audience', 'atmosphere', 'home', 'wankhede', 'eden', 'chinnaswamy']
  },
  // Team huddle / strategy
  {
    url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=850&auto=format&fit=crop&q=80',
    caption: 'Players discuss team strategy ahead of the match. Photo via Unsplash.',
    keywords: ['team', 'coach', 'huddle', 'captain', 'meeting', 'squad', 'selection', 'contract', 'bcci', 'selector', 'press conference']
  },
  // Ball release / bowling action
  {
    url: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=850&auto=format&fit=crop&q=80',
    caption: 'A bowler delivers the ball at full pace. Photo via Unsplash.',
    keywords: ['bowling', 'bowler', 'paceman', 'spinner', 'wicket', 'caught', 'lbw', 'dismissal', 'fifer', 'five-wicket', 'yorker', 'bumper', 'seam', 'swing', 'spin']
  },
  // Cricket match aerial / overhead shot
  {
    url: 'https://images.unsplash.com/photo-1624880357913-a8539238245b?w=850&auto=format&fit=crop&q=80',
    caption: 'Aerial view of a cricket ground during a live match. Photo via Unsplash.',
    keywords: ['aerial', 'helicopter', 'overview', 'wankhede', 'chepauk', 'test', 'day', 'session', 'outfield', 'ground']
  },
  // Trophy / celebration
  {
    url: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=850&auto=format&fit=crop&q=80',
    caption: 'Players celebrate a hard-fought cricket victory. Photo via Unsplash.',
    keywords: ['celebration', 'trophy', 'win', 'victory', 'champion', 'title', 'winner', 'final', 'series', 'icc', 'world cup']
  },
  // Team in field / catching
  {
    url: 'https://images.unsplash.com/photo-1599474924187-334a4ae5bd3c?w=850&auto=format&fit=crop&q=80',
    caption: 'Fielders in position during a tense cricket match. Photo via Unsplash.',
    keywords: ['fielding', 'slip', 'catch', 'fielder', 'dive', 'run out', 'direct hit', 'boundary', 'deep square', 'point']
  },
  // Cricket ball close-up
  {
    url: 'https://images.unsplash.com/photo-1575361204480-aadea25e6e68?w=850&auto=format&fit=crop&q=80',
    caption: 'A red cricket ball ready for play. Photo via Unsplash.',
    keywords: ['ball', 'red ball', 'pink ball', 'test match', 'day night test', 'new ball', 'reverse swing', 'old ball']
  },
  // Cricket bat and equipment
  {
    url: 'https://images.unsplash.com/photo-1629818651924-abf22fde5af2?w=850&auto=format&fit=crop&q=80',
    caption: 'Cricket bat and gear laid out before a match. Photo via Unsplash.',
    keywords: ['bat', 'gear', 'equipment', 'pad', 'gloves', 'helmet', 'preparation', 'net session', 'practice', 'training']
  },
  // DRS / Decision Review / tech
  {
    url: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=850&auto=format&fit=crop&q=80',
    caption: 'Players and umpires during a tense on-field moment. Photo via Unsplash.',
    keywords: ['umpire', 'drs', 'review', 'decision', 'controversy', 'appeal', 'not out', 'out', 'hawkeye', 'hotspot', 'snickometer']
  },
  // Team India / green jersey / asia cup / test whites
  {
    url: 'https://images.unsplash.com/photo-1569517282132-25d22f4573e6?w=850&auto=format&fit=crop&q=80',
    caption: 'Cricket action from an international fixture. Photo via Unsplash.',
    keywords: ['india', 'team india', 'virat', 'rohit', 'bumrah', 'pakistan', 'england', 'australia', 'asia cup', 'icc', 'bilateral', 'test', 'whites', 'india vs']
  },
  // IPL / T20 batting powerplay
  {
    url: 'https://images.unsplash.com/photo-1606925797300-0b35e9d1794e?w=850&auto=format&fit=crop&q=80',
    caption: 'Explosive batting display in a T20 match. Photo via Unsplash.',
    keywords: ['t20', 'ipl', 'powerplay', 'six', 'four', 'big hit', 'attack', 'smash', 'rcb', 'csk', 'mi', 'dc', 'rr', 'kkr', 'srh', 'lsg', 'pbks', 'gt']
  }
];

async function getStockImage(queryText, seoTitle, tags) {
  // 1. Try Unsplash API if configured
  if (UNSPLASH_ACCESS_KEY) {
    console.log('[Stock Image] Querying Unsplash API...');
    try {
      const res = await fetchUrl(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(queryText + ' cricket')}&per_page=10&orientation=landscape`,
        { 'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}` }
      );
      if (res.ok) {
        const data = JSON.parse(await res.text());
        if (data.results && data.results.length > 0) {
          const randomIndex = Math.floor(Math.random() * data.results.length);
          const photo = data.results[randomIndex];
          const photographer = photo.user ? ` by ${photo.user.name}` : '';
          return {
            url: photo.urls.regular,
            caption: `Photo${photographer} via Unsplash.`
          };
        }
      }
    } catch (err) {
      console.warn('[Stock Image] Unsplash API search failed:', err.message);
    }
  }

  // 2. Try Pexels API if configured
  if (PEXELS_API_KEY) {
    console.log('[Stock Image] Querying Pexels API...');
    try {
      const res = await fetchUrl(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(queryText + ' cricket')}&per_page=10&orientation=landscape`,
        { 'Authorization': PEXELS_API_KEY }
      );
      if (res.ok) {
        const data = JSON.parse(await res.text());
        if (data.photos && data.photos.length > 0) {
          const randomIndex = Math.floor(Math.random() * data.photos.length);
          const photo = data.photos[randomIndex];
          const photographer = photo.photographer ? ` by ${photo.photographer}` : '';
          return {
            url: photo.src.large || photo.src.medium,
            caption: `Photo${photographer} via Pexels.`
          };
        }
      }
    } catch (err) {
      console.warn('[Stock Image] Pexels API search failed:', err.message);
    }
  }

  // 3. Fallback to Curated Real Cricket Photos (NO AI images)
  console.log('[Stock Image] Falling back to curated high-quality real cricket stock images...');
  const combinedText = `${seoTitle} ${tags.join(' ')}`.toLowerCase();
  
  // Find curated images that match keywords in the text
  const matches = CURATED_CRICKET_IMAGES.filter(img => 
    img.keywords.some(kw => combinedText.includes(kw))
  );

  const selectedList = matches.length > 0 ? matches : CURATED_CRICKET_IMAGES;
  const randomIndex = Math.floor(Math.random() * selectedList.length);
  return selectedList[randomIndex];
}

// Scrape RSS feed
async function getRSSStories() {
  console.log('[Scraper] Fetching live cricket stories from RSS feed...');
  const res = await fetchUrl(FEED_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch RSS: ${res.statusText}`);
  }
  const xml = await res.text();
  
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  const stories = [];
  
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemContent = match[1];
    const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(itemContent);
    const linkMatch = /<link>([\s\S]*?)<\/link>/.exec(itemContent);
    const descMatch = /<description>([\s\S]*?)<\/description>/.exec(itemContent);
    const dateMatch = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(itemContent);
    
    if (titleMatch && linkMatch) {
      stories.push({
        title: cleanText(titleMatch[1]),
        link: cleanText(linkMatch[1]),
        description: descMatch ? cleanText(descMatch[1]) : '',
        pubDate: dateMatch ? cleanText(dateMatch[1]) : ''
      });
    }
  }
  return stories;
}

// Setup OAuth2 client & Google APIs clients
let bloggerClient = null;
let sheetsClient = null;
let indexingClient = null;

function initGoogleClients() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error('OAuth2 variables (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI) must be set in .env');
  }

  const tokenPath = path.resolve('tokens.json');
  if (!fs.existsSync(tokenPath)) {
    throw new Error(`Authentication token file 'tokens.json' not found. Please run 'npm run auth' first.`);
  }

  const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));

  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials(tokens);

  oauth2Client.on('tokens', (newTokens) => {
    const currentTokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    const updatedTokens = { ...currentTokens, ...newTokens };
    fs.writeFileSync(tokenPath, JSON.stringify(updatedTokens, null, 2));
    console.log('[OAuth2] Tokens successfully refreshed and saved.');
  });

  bloggerClient = google.blogger({ version: 'v3', auth: oauth2Client });
  sheetsClient = google.sheets({ version: 'v4', auth: oauth2Client });
  indexingClient = google.indexing({ version: 'v3', auth: oauth2Client });
  console.log('[Google Client] Google APIs initialized successfully.');
}

// Google Sheets Operations
async function initSheetDatabase() {
  if (!SPREADSHEET_ID) {
    throw new Error('SPREADSHEET_ID is missing in .env. Cannot use Google Sheets queue database.');
  }

  console.log('[Sheets] Verifying and initializing Google Sheet queue...');
  
  try {
    // Read the first sheet to verify
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A1:F1',
    });
    
    const rows = response.data.values || [];
    if (rows.length === 0) {
      console.log('[Sheets] Sheet is empty. Initializing column headers...');
      await sheetsClient.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Sheet1!A1:F1',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['Topic Title', 'Original Link', 'Publish Date', 'Status', 'Post URL', 'Timestamp']]
        }
      });
      console.log('[Sheets] Headers created: Topic Title, Original Link, Publish Date, Status, Post URL, Timestamp.');
    }
  } catch (error) {
    console.error(`[Sheets] Failed to initialize Google Sheet. Make sure the Sheet ID is correct and you ran 'npm run auth' with the spreadsheets scope:`);
    console.error(error.message);
    throw error;
  }
}

// Check for duplicates and add new topics to the sheet
async function discoverAndQueueNews() {
  await initSheetDatabase();
  const stories = await getRSSStories();
  
  console.log('[Sheets] Reading existing queue rows...');
  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Sheet1!A2:A500' // read the first 500 rows to check for duplicates
  });
  
  const existingTitles = (response.data.values || []).map(row => row[0].toLowerCase().trim());
  const rowsToAppend = [];
  
  for (const story of stories) {
    const cleanTitle = story.title.toLowerCase().trim();
    
    // Check if title is already queued
    const isDuplicate = existingTitles.includes(cleanTitle);
    
    if (!isDuplicate) {
      rowsToAppend.push([story.title, story.link, story.pubDate, 'PENDING', '', new Date().toISOString()]);
      console.log(`[Queue] Discovered new topic: "${story.title}"`);
      existingTitles.push(cleanTitle);
    }
  }
  
  if (rowsToAppend.length > 0) {
    console.log(`[Queue] Appending ${rowsToAppend.length} new topic(s) to Google Sheets...`);
    await sheetsClient.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:A',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: rowsToAppend
      }
    });
  }
  
  console.log(`[Queue] Discover complete. Added ${rowsToAppend.length} new topic(s) to the pending queue.`);
}

// Fetch latest videos from YouTube public handle page (robust, bypasses RSS 404s)
async function fetchLatestYouTubeVideos(handle) {
  if (!handle) return [];
  const cleanHandle = handle.startsWith('@') ? handle : `@${handle}`;
  console.log(`[YouTube] Fetching latest videos for handle: ${cleanHandle}...`);
  try {
    const url = `https://www.youtube.com/${cleanHandle}`;
    const res = await fetchUrl(url);
    if (!res.ok) {
      console.warn(`[YouTube] Failed to fetch channel page: ${res.statusText}`);
      return [];
    }
    const html = await res.text();
    const videos = [];
    let pos = 0;
    while (true) {
      pos = html.indexOf('"videoId":"', pos);
      if (pos === -1) break;
      const id = html.slice(pos + 11, pos + 22);
      
      // Find the next title block (try new content format first, fallback to runs format)
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
          // Decode unicode escape sequences
          const cleanTitle = title.replace(/\\u([0-9a-fA-F]{4})/g, (match, grp) => {
            return String.fromCharCode(parseInt(grp, 16));
          });
          videos.push({ id, title: cleanTitle });
        }
      }
      pos += 22;
    }
    console.log(`[YouTube] Scraped ${videos.length} videos from channel page.`);
    return videos;
  } catch (err) {
    console.warn(`[YouTube] Error scraping videos:`, err.message);
    return [];
  }
}

// Find matching YouTube video by matching title keywords with article metadata
function findMatchingYouTubeVideo(videos, articleTitle, tags) {
  if (!videos || videos.length === 0) return null;
  const combinedTerms = [...tags, articleTitle].map(t => t.toLowerCase());
  
  for (const video of videos) {
    const videoTitleLower = video.title.toLowerCase();
    let matchCount = 0;
    for (const term of combinedTerms) {
      const words = term.split(/\s+/).filter(w => w.length > 3);
      for (const word of words) {
        if (videoTitleLower.includes(word)) {
          matchCount++;
        }
      }
    }
    // If we have at least 2 word matches, we consider it a match
    if (matchCount >= 2) {
      console.log(`[YouTube] Matched video: "${video.title}" (ID: ${video.id})`);
      return video;
    }
  }
  return null;
}

// Generate a local HTML dashboard helper for Facebook sharing
function generateShareAssistant(livePostUrl, seoData, matchedVideo) {
  const pageUrl = FACEBOOK_PAGE_URL || 'https://www.facebook.com';
  const groupsStr = FACEBOOK_GROUPS || '';
  const groups = groupsStr ? groupsStr.split(',').map(g => g.trim()).filter(Boolean) : [];

  const videoUrl = matchedVideo ? `https://www.youtube.com/watch?v=${matchedVideo.id}` : '';
  const videoTitle = matchedVideo ? matchedVideo.title : '';

  const groupsHtml = groups.length > 0 ? groups.map((group, idx) => {
    let cleanName = group.replace('https://www.facebook.com/groups/', '').replace(/\//g, '');
    if (cleanName.length > 25) cleanName = cleanName.slice(0, 25) + '...';
    return `
          <div class="group-item">
            <div class="group-name">Group #${idx+1}: <strong>${cleanName}</strong></div>
            <a href="${group}" target="_blank" class="btn btn-outline group-btn">Open Group</a>
          </div>`;
  }).join('') : `
          <p style="color: var(--text-muted); font-size: 0.9rem; font-style: italic;">No Facebook groups configured in your .env. Add them as comma-separated URLs in FACEBOOK_GROUPS.</p>`;

  const videoHtml = matchedVideo ? `
      <!-- YouTube Embed Copy Box -->
      <div class="copy-box" style="border-color: rgba(168, 85, 247, 0.3);">
        <div class="copy-box-label" style="color: #a855f7;">Matched YouTube Video (Optional Promo)</div>
        <div style="font-size:0.85rem; margin-bottom:8px; color: var(--text-muted);"><strong>Video Title:</strong> ${videoTitle}</div>
        <div class="copy-content-box" style="white-space: nowrap; overflow-x: auto; max-height: 60px;" id="youtube-link">${videoUrl}</div>
        <button class="btn btn-outline" style="border-color: #a855f7; color: #d8b4fe;" onclick="copyText('youtube-link', 'YouTube link copied!')">Copy YouTube Link</button>
      </div>` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pitch Watch Share Assistant</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b1329;
      --card-bg: rgba(26, 38, 57, 0.65);
      --border: rgba(255, 255, 255, 0.08);
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #38bdf8;
      --primary-hover: #0ea5e9;
      --accent: #f43f5e;
      --success: #10b981;
      --font: 'Outfit', sans-serif;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg);
      background-image: radial-gradient(circle at 10% 20%, rgba(4, 21, 45, 1) 0%, rgba(11, 19, 41, 1) 90%);
      color: var(--text);
      font-family: var(--font);
      line-height: 1.5;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }

    .container {
      width: 100%;
      max-width: 800px;
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 30px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
    }

    header {
      text-align: center;
      margin-bottom: 25px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 20px;
    }

    header h1 {
      font-size: 2.2rem;
      font-weight: 800;
      background: linear-gradient(135deg, #38bdf8 0%, #a855f7 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 5px;
    }

    header p {
      color: var(--text-muted);
      font-size: 0.95rem;
    }

    .meta-badge {
      display: inline-block;
      padding: 4px 10px;
      background: rgba(56, 189, 248, 0.1);
      color: var(--primary);
      border-radius: 30px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 15px;
    }

    .section {
      margin-bottom: 25px;
    }

    .section-title {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--primary);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .post-info-card {
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
    }

    .post-title {
      font-size: 1.3rem;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--text);
    }

    .post-link-display {
      font-size: 0.85rem;
      color: var(--text-muted);
      word-break: break-all;
      background: rgba(255, 255, 255, 0.03);
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .copy-box {
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 15px;
      margin-bottom: 15px;
      position: relative;
    }

    .copy-box-label {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .copy-content-box {
      font-size: 0.95rem;
      color: var(--text);
      max-height: 120px;
      overflow-y: auto;
      white-space: pre-wrap;
      background: rgba(0, 0, 0, 0.15);
      padding: 12px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.03);
      margin-bottom: 10px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 20px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.9rem;
      cursor: pointer;
      transition: all 0.2s ease;
      border: none;
      text-decoration: none;
      width: 100%;
    }

    .btn-primary {
      background: var(--primary);
      color: #0b1329;
    }

    .btn-primary:hover {
      background: var(--primary-hover);
      box-shadow: 0 4px 12px rgba(56, 189, 248, 0.3);
    }

    .btn-outline {
      background: transparent;
      color: var(--text);
      border: 1px solid var(--border);
    }

    .btn-outline:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: var(--primary);
    }

    .btn-facebook {
      background: #1877f2;
      color: white;
    }

    .btn-facebook:hover {
      background: #166fe5;
      box-shadow: 0 4px 12px rgba(24, 119, 242, 0.3);
    }

    .btn-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
    }

    @media (min-width: 600px) {
      .btn-grid {
        grid-template-columns: 1fr 1fr;
      }
    }

    .groups-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .group-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(0, 0, 0, 0.15);
      border: 1px solid var(--border);
      padding: 12px 18px;
      border-radius: 10px;
    }

    .group-name {
      font-size: 0.9rem;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 70%;
    }

    .group-btn {
      width: auto;
      padding: 6px 12px;
      font-size: 0.8rem;
    }

    /* Toast Notification */
    .toast {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: var(--success);
      color: white;
      padding: 12px 24px;
      border-radius: 30px;
      font-weight: 600;
      font-size: 0.9rem;
      box-shadow: 0 10px 25px rgba(16, 185, 129, 0.4);
      transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      z-index: 1000;
      pointer-events: none;
    }

    .toast.show {
      transform: translateX(-50%) translateY(0);
    }

    /* Tips box styling */
    .tips-callout {
      background: rgba(244, 63, 94, 0.05);
      border-left: 4px solid var(--accent);
      padding: 15px;
      border-radius: 4px;
      margin-top: 15px;
      font-size: 0.85rem;
    }

    .tips-callout strong {
      color: var(--accent);
    }
  </style>
</head>
<body>

  <div class="container">
    <header>
      <div class="meta-badge">Facebook Reach Hack</div>
      <h1>Pitch Watch Share Assistant</h1>
      <p>Easily post engaging updates and drive traffic from your Facebook page & groups.</p>
    </header>

    <div class="section">
      <div class="section-title">📌 Published Post Details</div>
      <div class="post-info-card">
        <div class="post-title">${seoData.discoverTitle || seoData.seoTitle}</div>
        <div class="post-link-display" id="post-link">${livePostUrl}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">📋 Copy Engagement Content</div>
      
      <!-- Facebook Caption Copy Box -->
      <div class="copy-box">
        <div class="copy-box-label">Engaging Caption (Optimized for Facebook)</div>
        <div class="copy-content-box" id="fb-caption">${seoData.socialCaptions.facebook}</div>
        <button class="btn btn-primary" onclick="copyText('fb-caption', 'Caption copied to clipboard!')">Copy Caption</button>
      </div>

      <!-- Blogger Link Copy Box -->
      <div class="copy-box">
        <div class="copy-box-label">Blogger Post Link (To paste in the Comments!)</div>
        <div class="copy-content-box" style="white-space: nowrap; overflow-x: auto; max-height: 60px;" id="blogger-link">${livePostUrl}</div>
        <button class="btn btn-outline" onclick="copyText('blogger-link', 'Blogger link copied!')">Copy Blogger Link</button>
      </div>

      ${videoHtml}

      <div class="tips-callout">
        📢 <strong>PRO GROWTH HACK:</strong> Do <strong>NOT</strong> put the blog link inside your Facebook post text! Facebook's reach algorithm penalizes outbound links. Instead:
        <br>1. Copy the <strong>Caption</strong> and post it on your Page or in Groups.
        <br>2. Immediately comment on your own post with the <strong>Blogger Post Link</strong>.
        <br>This keeps your post reach high and gets maximum clicks!
      </div>
    </div>

    <div class="section">
      <div class="section-title">🌐 Step 1: Post to Your Page</div>
      <a href="${pageUrl}" target="_blank" class="btn btn-facebook">
        Open My Facebook Page
      </a>
    </div>

    <div class="section">
      <div class="section-title">👥 Step 2: Share in Cricket Groups</div>
      <div class="groups-list">
        ${groupsHtml}
      </div>
    </div>
  </div>

  <div class="toast" id="toast">Copied to clipboard!</div>

  <script>
    function copyText(elementId, successMsg) {
      const text = document.getElementById(elementId).innerText || document.getElementById(elementId).textContent;
      navigator.clipboard.writeText(text).then(() => {
        showToast(successMsg);
      }).catch(err => {
        console.error('Could not copy text: ', err);
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand('copy');
          showToast(successMsg);
        } catch (e) {
          alert('Failed to copy. Please manually select and copy.');
        }
        document.body.removeChild(textarea);
      });
    }

    function showToast(message) {
      const toast = document.getElementById('toast');
      toast.innerText = message;
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 2500);
    }
  </script>
</body>
</html>`;

  const outputPath = path.resolve('share-assistant.html');
  fs.writeFileSync(outputPath, html, 'utf8');
  console.log(`[Share Assistant] Dashboard written successfully to: ${outputPath}`);
}

// Post to Telegram Channel using Telegram Bot API
// matchedVideo: { id, title } object or null
async function sendToTelegram(livePostUrl, seoData, imageUrl, matchedVideo) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID) {
    console.log('[Telegram] Automated posting skipped (TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID missing in .env).');
    return;
  }

  console.log(`[Telegram] Sending automated update to channel: ${TELEGRAM_CHANNEL_ID}...`);

  const escapeHtml = (text) => {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  const title = escapeHtml(seoData.discoverTitle || seoData.seoTitle);

  // Build engaging Hinglish caption
  // Use AI-generated telegram caption if available, otherwise build a good default
  const rawCaption = seoData.socialCaptions
    ? (seoData.socialCaptions.telegram || seoData.socialCaptions.facebook || '')
    : '';
  const escapedCaption = escapeHtml(rawCaption);

  // YouTube section if video is available
  const youtubeChannelUrl = YOUTUBE_HANDLE
    ? `https://www.youtube.com/${YOUTUBE_HANDLE.startsWith('@') ? YOUTUBE_HANDLE : '@' + YOUTUBE_HANDLE}`
    : null;
  const youtubeVideoUrl = matchedVideo ? `https://www.youtube.com/watch?v=${matchedVideo.id}` : null;
  const youtubeLink = youtubeVideoUrl || youtubeChannelUrl;
  const youtubeLine = youtubeLink
    ? `\n\n🎥 <b>Video Analysis:</b> <a href="${youtubeLink}">${matchedVideo ? escapeHtml(matchedVideo.title) : 'Watch on YouTube'}</a>`
    : '';

  // Construct full message
  let messageText = `🔥 <b>${title}</b>\n\n${escapedCaption}${youtubeLine}\n\n👉 <a href="${livePostUrl}">Puri analysis aur Dream11 tips padhein!</a>`;

  // Safe slice to keep caption under 1024 characters for photos (Telegram limit)
  const LIMIT = imageUrl ? 1020 : 4090;
  if (messageText.length > LIMIT) {
    const overflowLength = messageText.length - LIMIT;
    const truncatedCaption = escapedCaption.slice(0, Math.max(0, escapedCaption.length - overflowLength - 5)) + '...';
    messageText = `🔥 <b>${title}</b>\n\n${truncatedCaption}${youtubeLine}\n\n👉 <a href="${livePostUrl}">Puri analysis aur Dream11 tips padhein!</a>`;
  }

  const sendTelegramPayload = (endpoint, payload) => {
    return new Promise((resolve) => {
      const postData = JSON.stringify(payload);
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${endpoint}`;
      const urlObj = new URL(url);
      const reqOptions = {
        hostname: urlObj.hostname,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };
      const req = https.request(reqOptions, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          const parsed = (() => { try { return JSON.parse(body); } catch { return {}; } })();
          if (res.statusCode >= 200 && res.statusCode < 300 && parsed.ok) {
            console.log(`[Telegram] ${endpoint} sent successfully.`);
            resolve({ success: true });
          } else {
            console.warn(`[Telegram] ${endpoint} failed. Code: ${res.statusCode}. Body: ${body}`);
            resolve({ success: false, body });
          }
        });
      });
      req.on('error', (err) => {
        console.warn(`[Telegram] Connection error (${endpoint}): ${err.message}`);
        resolve({ success: false });
      });
      req.write(postData);
      req.end();
    });
  };

  // Try with image first; if it fails (e.g. Telegram can't fetch the URL), fallback to text
  if (imageUrl) {
    const photoResult = await sendTelegramPayload('sendPhoto', {
      chat_id: TELEGRAM_CHANNEL_ID,
      photo: imageUrl,
      caption: messageText,
      parse_mode: 'HTML'
    });
    if (!photoResult.success) {
      console.warn('[Telegram] sendPhoto failed, falling back to sendMessage with link preview...');
      await sendTelegramPayload('sendMessage', {
        chat_id: TELEGRAM_CHANNEL_ID,
        text: messageText,
        parse_mode: 'HTML',
        disable_web_page_preview: false
      });
    }
  } else {
    await sendTelegramPayload('sendMessage', {
      chat_id: TELEGRAM_CHANNEL_ID,
      text: messageText,
      parse_mode: 'HTML',
      disable_web_page_preview: false
    });
  }
}

// Post automatically to your Facebook Page using the Meta Graph API
async function sendToFacebookPage(livePostUrl, seoData, imageUrl) {
  if (!FACEBOOK_PAGE_ID || !FACEBOOK_PAGE_ACCESS_TOKEN) {
    console.log('[Facebook Page] Automated posting skipped (FACEBOOK_PAGE_ID or FACEBOOK_PAGE_ACCESS_TOKEN missing in .env).');
    return;
  }

  console.log(`[Facebook Page] Sending automated post to page ID: ${FACEBOOK_PAGE_ID}...`);

  const captionText = seoData.socialCaptions ? seoData.socialCaptions.facebook : '';
  const endpoint = imageUrl ? 'photos' : 'feed';
  const url = `https://graph.facebook.com/v19.0/${FACEBOOK_PAGE_ID}/${endpoint}`;

  const payload = imageUrl ? {
    url: imageUrl,
    caption: captionText,
    access_token: FACEBOOK_PAGE_ACCESS_TOKEN
  } : {
    message: captionText,
    access_token: FACEBOOK_PAGE_ACCESS_TOKEN
  };

  return new Promise((resolve) => {
    const postData = JSON.stringify(payload);
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', async () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const resJson = JSON.parse(body);
            const createdId = resJson.post_id || resJson.id;
            console.log(`[Facebook Page] Post successfully created (ID: ${createdId}).`);

            // Post Blogger link in the first comment
            if (createdId) {
              console.log(`[Facebook Page] Posting Blogger link in comments of post: ${createdId}...`);
              await postFacebookComment(createdId, `👉 Pura detail aur Dream11 Team analysis yahan padhein: ${livePostUrl}`);
            }
          } catch (jsonErr) {
            console.warn(`[Facebook Page] Warning: Error parsing response body: ${jsonErr.message}`);
          }
        } else {
          console.warn(`[Facebook Page] Failed to post. Code: ${res.statusCode}. Response: ${body}`);
        }
        resolve();
      });
    });

    req.on('error', (err) => {
      console.warn(`[Facebook Page] Connection error: ${err.message}`);
      resolve();
    });

    req.write(postData);
    req.end();
  });
}

// Helper to post a comment on a Facebook post
function postFacebookComment(postId, message) {
  const url = `https://graph.facebook.com/v19.0/${postId}/comments`;
  const payload = {
    message: message,
    access_token: FACEBOOK_PAGE_ACCESS_TOKEN
  };

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('[Facebook Page] Blogger link successfully posted in the first comment.');
          resolve();
        } else {
          reject(new Error(`Code: ${res.statusCode}. Response: ${body}`));
        }
      });
    });
    req.on('error', (err) => {
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

// Process a single topic: generate article, publish to Blogger, share on socials, and log in Sheets
async function processSingleTopic(topic) {
  const topicTitle = topic.title;
  const topicLink = topic.link;
  const topicPubDate = topic.pubDate;

  if (!BLOG_ID) {
    throw new Error('BLOG_ID is missing in .env. Cannot post to Blogger.');
  }

  await initSheetDatabase();
  
  console.log(`\n======================================================`);
  console.log(`[Processor] Processing topic: "${topicTitle}"`);
  console.log(`======================================================\n`);
  
  try {
    // 1. Fetch recent posts for internal linking context
    let oldPostsList = [];
    let oldPosts = [];
    try {
      console.log('[Blogger] Fetching recent posts for internal linking context...');
      const postsResponse = await bloggerClient.posts.list({
        blogId: BLOG_ID,
        maxResults: 15,
        status: 'LIVE'
      });
      oldPosts = postsResponse.data.items || [];
      oldPostsList = oldPosts.map((post, idx) => ({
        index: idx,
        title: post.title,
        url: post.url
      }));
      console.log(`[Blogger] Found ${oldPostsList.length} recent posts for context.`);
    } catch (err) {
      console.warn(`[Blogger] Warning: Could not fetch recent posts for context: ${err.message}`);
    }

    // 2. Content Generation (Gemini AI with high burstiness & humanized tone in JSON mode)
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is missing in .env. Cannot write humanized post.');
    }
    
    console.log('[Gemini] Generating SEO structured news analysis in JSON mode...');
    const ai = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = ai.getGenerativeModel({ 
      model: 'gemini-2.5-flash-lite',
      generationConfig: { responseMimeType: 'application/json' }
    });
    
    const prompt = `
      You are a passionate, professional cricket journalist and SEO specialist writing for the premium sports news portal "Pitch Watch".
      Write a comprehensive, engaging cricket news analysis article about:
      Topic: "${topicTitle}"
      Published originally on: ${topicPubDate}
      Original context source: ${topicLink}
      
      Here is a list of the last 15 posts published on this website for internal linking:
      ${JSON.stringify(oldPostsList)}
      
      Instructions for output:
      You must respond in raw JSON format with the following keys. Do NOT include markdown code fences or backticks.
      
      JSON Keys:
      1. "seoTitle": String (Highly engaging, keyword-rich SEO title, 50-60 characters. Must contain key terms).
      2. "discoverTitle": String (Click-worthy, high-CTR headline for Google Discover, 60-85 characters. Sensational but accurate, using cricket emotions).
      3. "metaDescription": String (Compelling meta description, 140-155 characters, including the focus keyword naturally).
      4. "urlSlug": String (Clean, keyword-rich URL slug, lowercase, separated by hyphens, e.g. "rohit-sharma-bcci-contract-news").
      5. "primaryKeyword": String (The single most valuable cricket search term for this topic).
      6. "tags": Array of 3-5 strings (Blogger labels, e.g. ["IPL", "T20", "ODI", "Test Match"]).
      7. "introduction": String (Hook paragraph, 60-80 words. Start with a dramatic question or statement. Natural Hinglish vibe).
      8. "articleBodyHtml": String (The full article body in HTML format. Write 3-4 sections. Use H2/H3 tags. Include bold texts, lists, and tables where relevant. Length: 400-600 words).
      9. "socialCaptions": Object with keys "facebook", "twitter", "telegram", "whatsapp" (Engaging Hinglish social media updates. The facebook caption must start with a question, use cricket emojis, and end with: "Pura detail comments me hai! 👇". Do NOT include links in the facebook/instagram captions. The telegram caption must be in Hinglish and end with a link-click prompt).
      10. "faq": Array of 2-3 FAQ objects (Keys: "question", "answer").
      11. "fantasyTips": Object or null (If match preview, otherwise null).
      12. "oldPostToUpdate": Object with keys:
          - "index": Number or null (Index of the old post to link to. If none, return null).
          - "recommendationText": String or null (HTML paragraph with link placeholder "__NEW_POST_URL__" and "__NEW_POST_TITLE__").
    `;
    
    let result = null;
    let retries = 3;
    while (retries > 0) {
      try {
        result = await model.generateContent(prompt);
        break;
      } catch (err) {
        const is503 = err.status === 503 || err.message.includes('503');
        const is429 = err.status === 429 || err.message.includes('429');
        if ((is503 || is429) && retries > 1) {
          const delay = is429 ? 45000 : 5000;
          console.warn(`[Gemini] Error ${err.status || 'Request'}. Retrying in ${delay / 1000} seconds... (${retries - 1} retries left)`);
          await new Promise(r => setTimeout(r, delay));
          retries--;
        } else {
          throw err;
        }
      }
    }
    
    let responseJsonText = result.response.text().trim();
    if (responseJsonText.startsWith('```')) {
      responseJsonText = responseJsonText.replace(/^```json\s*/i, '').replace(/```\s*$/g, '');
    }
    
    const seoData = JSON.parse(responseJsonText);
    console.log('[Gemini] Parsed SEO and Article content successfully.');

    // 3. Image Selection: Try to scrape og:image from original article, fallback to high-quality stock photo
    let imageUrl = null;
    let imageCaption = "Photo representing the event coverage.";
    
    console.log(`[Decoder] Resolving Google News redirect URL: ${topicLink}`);
    let realArticleLink = await decodeUrl(topicLink);

    try {
      console.log(`[Scraper] Attempting to scrape Open Graph image from: ${realArticleLink}`);
      const scrapeRes = await fetchUrl(realArticleLink);
      if (scrapeRes.ok) {
        const html = await scrapeRes.text();
        const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
        if (ogMatch && ogMatch[1]) {
          imageUrl = ogMatch[1].trim();
        }
      }
    } catch (err) {
      console.warn(`[Scraper] Warning: Could not scrape image: ${err.message}`);
    }

    if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('http')) {
      const FALLBACKS = [
        'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=850&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1593341606579-7f97d02474d4?w=850&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=850&auto=format&fit=crop&q=80'
      ];
      imageUrl = FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];
      imageCaption = 'Cricket action photo via Unsplash.';
    }
    console.log(`[Image] Final image URL confirmed: ${imageUrl}`);
    
    // Check for matching recent YouTube video to embed
    let matchedVideo = null;
    if (YOUTUBE_HANDLE) {
      try {
        const youtubeVideos = await fetchLatestYouTubeVideos(YOUTUBE_HANDLE);
        matchedVideo = findMatchingYouTubeVideo(youtubeVideos, seoData.seoTitle, seoData.tags);
      } catch (ytErr) {
        console.warn('[YouTube] Matches check skipped due to error:', ytErr.message);
      }
    }

    // 4. Build post HTML with image, body, EEAT, and Schema JSON-LD
    const embeddedImageHtml = `
      <div style="margin-bottom: 25px; text-align: center;">
        <img src="${imageUrl}" alt="${seoData.seoTitle} - Pitch Watch Coverage" title="${seoData.seoTitle}" style="width: 100%; max-width: 850px; height: auto; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);" />
        <p style="font-size: 0.85em; color: #666; margin-top: 8px; font-style: italic;">${imageCaption}</p>
      </div>
    `;

    if (seoData.fantasyTips) {
      const tips = seoData.fantasyTips;
      const fantasyHtml = `
        <div class="fantasy-tips-box" style="margin: 30px 0; padding: 20px; border: 2px dashed #0284c7; background: #f0f9ff; border-radius: 6px; font-family: sans-serif;">
          <h3 style="margin-top: 0; color: #0284c7; font-size: 1.25em; border-bottom: 1px solid #bae6fd; padding-bottom: 8px;">🏏 Dream11 / Fantasy Cricket Guide</h3>
          <p style="margin: 15px 0 0 0; font-size: 0.85em; color: #64748b; font-style: italic; text-align: center;">Disclaimer: Fantasy cricket involves financial risk. Form your teams based on your own research.</p>
        </div>
      `;
      seoData.articleBodyHtml += fantasyHtml;
    }
    
    const eeatHtml = `
      <div class="eeat-box" style="margin-top: 30px; padding: 20px; border-top: 1px solid #eee; font-size: 0.9em; color: #555; background: #fafafa; border-radius: 4px;">
        <p style="margin: 0 0 8px 0;"><strong>Published on:</strong> ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} | <strong>Author:</strong> Pitch Watch Editorial Team</p>
      </div>
    `;
    
    const mainCategory = seoData.tags.find(t => ['IPL', 'T20', 'ODI', 'Test Match'].includes(t)) || 'Cricket';
    
    const todayStr = new Date().toISOString();
    const articleSchema = {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      "headline": seoData.seoTitle,
      "description": seoData.metaDescription,
      "image": [imageUrl],
      "datePublished": todayStr,
      "author": { "@type": "Organization", "name": "Pitch Watch Editorial Team" },
      "publisher": {
        "@type": "Organization",
        "name": "Pitch Watch",
        "logo": {
          "@type": "ImageObject",
          "url": "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhTLxahyphenhy"
        }
      }
    };
    
    const breadcrumbSchema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://crickettrendsnews.blogspot.com/" },
        { "@type": "ListItem", "position": 2, "name": mainCategory, "item": `https://crickettrendsnews.blogspot.com/search/label/${encodeURIComponent(mainCategory)}` }
      ]
    };
    
    let schemaHtml = `
      <script type="application/ld+json">${JSON.stringify(articleSchema)}</script>
      <script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>
    `;
    
    if (seoData.faq && seoData.faq.length > 0) {
      const faqSchema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": seoData.faq.map(item => ({
          "@type": "Question",
          "name": item.question,
          "acceptedAnswer": { "@type": "Answer", "text": item.answer }
        }))
      };
      schemaHtml += `\n<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>`;
      
      let faqVisibleHtml = `<div class="post-faq-section" style="margin-top: 30px; border-top: 2px solid #ddd; padding-top: 20px;"><h2>Frequently Asked Questions</h2>`;
      seoData.faq.forEach(item => {
        faqVisibleHtml += `<div style="margin-bottom: 15px;"><p><strong>Q: ${item.question}</strong></p><p>A: ${item.answer}</p></div>`;
      });
      seoData.articleBodyHtml += faqVisibleHtml;
    }
    
    const finalHtmlContent = schemaHtml + embeddedImageHtml + seoData.introduction + seoData.articleBodyHtml + eeatHtml;
    
    const sanitizedSlug = seoData.urlSlug.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
    const finalBloggerTitle = seoData.discoverTitle || seoData.seoTitle;

    console.log(`[Blogger] Publishing live post: "${finalBloggerTitle}"...`);
    const bloggerResponse = await bloggerClient.posts.insert({
      blogId: BLOG_ID,
      requestBody: {
        title: finalBloggerTitle,
        content: finalHtmlContent,
        labels: seoData.tags,
        customUrl: sanitizedSlug,
        status: 'LIVE'
      },
      isDraft: false
    });
    
    const livePostUrl = bloggerResponse.data.url;
    console.log(`[Blogger] Post published successfully: ${livePostUrl}`);
    
    // 6. Bidirectional Interlinking (Update Old Post)
    if (seoData.oldPostToUpdate && seoData.oldPostToUpdate.index !== null && seoData.oldPostToUpdate.index !== undefined) {
      const oldPostIndex = seoData.oldPostToUpdate.index;
      if (oldPostIndex >= 0 && oldPostIndex < oldPosts.length) {
        const targetOldPost = oldPosts[oldPostIndex];
        try {
          const recommendation = seoData.oldPostToUpdate.recommendationText
            .replace(/__NEW_POST_URL__/g, livePostUrl)
            .replace(/__NEW_POST_TITLE__/g, seoData.seoTitle);
          const updatedContent = targetOldPost.content + `\n\n<div class="recommended-update">${recommendation}</div>`;
          await bloggerClient.posts.update({ blogId: BLOG_ID, postId: targetOldPost.id, requestBody: { title: targetOldPost.title, content: updatedContent, labels: targetOldPost.labels } });
        } catch (linkBackErr) {
          console.warn(`[SEO LinkBack] Failed to update old post: ${linkBackErr.message}`);
        }
      }
    }

    // 7. Submit to Google Indexing API
    try {
      await indexingClient.urlNotifications.publish({ requestBody: { url: livePostUrl, type: 'URL_UPDATED' } });
      console.log('[Search Console] Indexing API request submitted successfully.');
    } catch (indexingErr) {
      console.warn(`[Search Console] Indexing warning: ${indexingErr.message}`);
    }
    
    // 8. Ping Search Engines
    try {
      const sitemapUrl = 'https://crickettrendsnews.blogspot.com/sitemap.xml';
      await fetchUrl(`https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`);
      await fetchUrl(`https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`);
    } catch (pingErr) {
      console.warn(`[Sitemap] Warning: Failed to ping sitemap: ${pingErr.message}`);
    }

    // Post to Socials
    try { await sendToTelegram(livePostUrl, seoData, imageUrl, matchedVideo); } catch (e) { console.warn(e.message); }
    try { await sendToFacebookPage(livePostUrl, seoData, imageUrl); } catch (e) { console.warn(e.message); }

    // 9. Append to Google Sheets log
    console.log('[Queue] Logging published post to Google Sheets...');
    await sheetsClient.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:A',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[topicTitle, topicLink, topicPubDate, 'COMPLETED', livePostUrl, new Date().toISOString()]]
      }
    });
    
  } catch (error) {
    console.error(`[Processor] Failed to process topic:`, error);
  }
}

// Clean up Sheets database to keep only completed logs
async function cleanSheetDatabase() {
  if (!SPREADSHEET_ID) return;
  console.log('[Sheets] Cleaning up database to keep only completed logs...');
  try {
    const res = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A1:F500'
    });
    
    const rows = res.data.values || [];
    if (rows.length <= 1) {
      console.log('[Sheets] Sheet is empty or only has header row. No clean up needed.');
      return;
    }
    
    const header = rows[0];
    const completedRows = rows.slice(1).filter(row => row[3] === 'COMPLETED');
    
    console.log(`[Sheets] Found ${rows.length - 1} total rows. Keeping ${completedRows.length} completed rows.`);
    
    // Clear the range
    await sheetsClient.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A1:F500'
    });
    
    // Write back only header and completed rows
    const updatedValues = [header, ...completedRows];
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Sheet1!A1:F${updatedValues.length}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: updatedValues
      }
    });
    console.log('[Sheets] Google Sheet successfully cleaned.');
  } catch (err) {
    console.warn(`[Sheets] Warning: Could not clean Google Sheet: ${err.message}`);
  }
}

// Complete automated workflow logic (On-Demand 1-Post Execution)
async function runWorkflowStep() {
  console.log(`\n======================================================`);
  console.log(`[Workflow] Starting simplified posting run at ${new Date().toLocaleString('en-IN')}`);
  console.log(`======================================================`);
  
  try {
    const postsResponse = await bloggerClient.posts.list({ blogId: BLOG_ID, maxResults: 50, status: 'LIVE' });
    const livePosts = postsResponse.data.items || [];
    const publishedTitles = livePosts.map(p => p.title.toLowerCase().trim());

    console.log('[Discover] Fetching stories from Google News RSS...');
    const stories = await getRSSStories();
    
    const uniqueStories = [];
    for (const story of stories) {
      const cleanTitle = story.title.toLowerCase().trim();
      if (!publishedTitles.some(liveTitle => liveTitle.includes(cleanTitle.substring(0, 10)))) {
        try {
          const decodedLink = await decodeUrl(story.link);
          uniqueStories.push({ title: story.title, link: decodedLink, pubDate: story.pubDate, description: story.description });
        } catch (err) {
          uniqueStories.push({ title: story.title, link: story.link, pubDate: story.pubDate, description: story.description });
        }
      }
    }

    if (uniqueStories.length === 0) {
      console.log('[Workflow] No new unique stories found. Exiting.');
      return;
    }

    console.log('[Gemini] Requesting AI selection of the single best story...');
    const ai = new GoogleGenerativeAI(GEMINI_API_KEY);
    const selectionModel = ai.getGenerativeModel({ model: 'gemini-2.5-flash-lite', generationConfig: { responseMimeType: 'application/json' } });

    const selectionPrompt = `Select the single most viral cricket story from this list (focus on India/IPL): ${JSON.stringify(uniqueStories)}. Output as {"selectedIndex": number, "reason": "string"}`;
    const selectionResult = await selectionModel.generateContent(selectionPrompt);
    const selectionData = JSON.parse(selectionResult.response.text());

    const selectedStory = uniqueStories[selectionData.selectedIndex];
    console.log(`[Selection] Selected Story: "${selectedStory.title}"`);
    await processSingleTopic(selectedStory);

    // Clean up Google Sheets to keep it clean and lightweight
    await cleanSheetDatabase();

  } catch (err) {
    console.error('[Workflow] Error during step execution:', err.message);
  }
}

async function main() {
  const startTime = Date.now();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Workflow] Run started at: ${new Date().toLocaleString('en-IN')}`);
  console.log(`${'='.repeat(60)}`);

  try {
    // Initialize Google API Clients
    initGoogleClients();

    // Default: Run single workflow step
    await runWorkflowStep();
  } catch (err) {
    console.error('[FATAL] Execution error:', err.message);
    // Try to send Telegram alert for fatal errors
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHANNEL_ID) {
      const alertPayload = JSON.stringify({
        chat_id: TELEGRAM_CHANNEL_ID,
        text: `⚠️ <b>Pitch Watch Automation Error</b>\n\n<code>${err.message.slice(0, 500)}</code>\n\nTime: ${new Date().toLocaleString('en-IN')}`,
        parse_mode: 'HTML'
      });
      try {
        const alertUrl = new URL(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`);
        const alertReq = https.request({ hostname: alertUrl.hostname, path: alertUrl.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(alertPayload) } });
        alertReq.write(alertPayload);
        alertReq.end();
        console.log('[Alert] Fatal error notification sent to Telegram.');
      } catch (_) { /* ignore alert failures */ }
    }
    process.exit(1);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n[Workflow] Run completed in ${elapsed}s. Process exiting.`);
  console.log(`${'='.repeat(60)}\n`);
  process.exit(0);
}

main();
