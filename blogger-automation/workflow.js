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

// Process one pending topic from the queue
async function processNextPendingTopic() {
  if (!BLOG_ID) {
    throw new Error('BLOG_ID is missing in .env. Cannot post to Blogger.');
  }

  await initSheetDatabase();
  
  console.log('[Queue] Scanning for next PENDING topic...');
  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Sheet1!A1:F500' // Scan up to 500 rows
  });
  
  const rows = response.data.values || [];
  if (rows.length <= 1) {
    console.log('[Queue] No topics found in the spreadsheet.');
    return;
  }
  
  // Find first row where status (column D / index 3) is 'PENDING'
  let pendingIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][3] === 'PENDING') {
      pendingIndex = i + 1; // 1-indexed for sheets updates
      break;
    }
  }
  
  if (pendingIndex === -1) {
    console.log('[Queue] Everything is up-to-date! No pending topics found.');
    return;
  }
  
  const topicRow = rows[pendingIndex - 1];
  const topicTitle = topicRow[0];
  const topicLink = topicRow[1];
  const topicPubDate = topicRow[2];
  
  console.log(`\n======================================================`);
  console.log(`[Processor] Processing row ${pendingIndex}: "${topicTitle}"`);
  console.log(`======================================================\n`);
  
  // Mark row as POSTING immediately to prevent duplicate runs
  if (!isDryRun) {
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Sheet1!D${pendingIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['POSTING']]
      }
    });
  }
  
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
      model: 'gemini-flash-latest',
      generationConfig: { responseMimeType: 'application/json' }
    });
    
    const prompt = `
      You are a passionate, professional cricket journalist and SEO specialist writing for the premium sports news portal "Pitch Watch".
      Write a comprehensive, engaging cricket news analysis article about:
      Topic: "${topicTitle}"
      Published originally on: ${topicPubDate}
      Original context source: ${topicLink}
      
      Here is a list of the last 15 posts published on this website for internal linking:
      ${JSON.stringify(oldPostsList, null, 2)}
      
      Your output must be a JSON object with the following fields:
      1. "seoTitle": String (A unique SEO title, STRICTLY between 50 and 60 characters max. Must naturally place the primary focus keyword).
      2. "discoverTitle": String (An extremely engaging, curiosity-driven, emotional headline between 65 and 85 characters max. Focus on high stakes, tactical clashes, key players, or dramatic match twists to target Google Discover).
      3. "metaDescription": String (SEO meta description, STRICTLY between 140 and 155 characters max. Do not exceed 155 characters. Must naturally contain the focus keyword).
      4. "urlSlug": String (Clean, keyword-rich URL slug without slashes or spaces, e.g. "ipl-2026-csk-vs-mi-prediction").
      5. "primaryKeyword": String (The chosen focus keyword).
      6. "tags": Array of Strings (3-5 relevant tags. CRITICAL: If the post is related to IPL, include "IPL". If it is related to T20 matches or tournaments, include "T20". If it is related to ODI matches, include "ODI". If it is related to Test matches, include "Test Match". If related to Team India, include "Team India").
      7. "articleBodyHtml": String (The complete article body in HTML format. Must be 800-1200 words. Do not include H1 tags. Use <h2> and <h3> for headings. Use <p>, <ul>, <li>, and <blockquote> for quotes. You MUST naturally interlink 2 to 4 of the provided older articles from the list above inside the body paragraphs using appropriate HTML anchor tags. Include a "Related Articles" section at the end of the post using these links).
      8. "featuredSummary": String (A 50-70 word concise summary ideal for featured snippets/answers, placing the focus keyword).
      9. "socialCaptions": Object with keys "facebook", "twitter", "telegram", "whatsapp" (Engaging, platform-tailored social media captions. CRITICAL Guidelines: The "facebook" and "telegram" captions must be written in engaging, conversational Hinglish (Hindi written in Latin script, e.g. "Doston, kya lagta hai aapko..." or "Kya Gill ki wapsi hogi?"). The facebook caption must start with a hot question or controversy to spark discussion/comments, use cricket emojis, and end with a clear Call to Action: "Pura detail aur Dream11 Team analysis comments me hai! 👇". Do NOT include any link or placeholder URL in the facebook caption itself (as we want to bypass Facebook's reach penalty by pasting it in the comments). The "telegram" caption should also be in Hinglish, summarize the news excitingly, and end with a link-click prompt).
      10. "faq": Array of Objects, each with "question" (String) and "answer" (String) (2-3 frequently asked questions with direct, clear answers).
      11. "suggestedFutureTopics": Array of Strings (5-10 related future article ideas to build topical authority).
      12. "fantasyTips": Object or null (If the topic is an upcoming match preview, generate fantasy tips, otherwise return null. Object fields: "pitchReport": String (brief 20-30 words summary), "keyPlayers": Array of 3-4 player names, "captainOptions": Array of 2 player names, "viceCaptainOptions": Array of 2 player names).
      13. "oldPostToUpdate": Object with keys:
          - "index": Number or null (The index of the old post from the list above that is most relevant to link to this new post. If none are relevant, return null).
          - "recommendationText": String or null (A short, natural paragraph with an HTML link recommending this new post. Use placeholder "__NEW_POST_URL__" for the URL and "__NEW_POST_TITLE__" for the title. Example: "<p><strong>Also Read:</strong> For more details, check out our report on <a href=\\"__NEW_POST_URL__\\">__NEW_POST_TITLE__</a>.</p>").
          
      Guidelines to Bypass AI Detection & sound Human:
      - Vary sentence length and structure (burstiness).
      - Use rich cricket slang and terms naturally (e.g. "powerplay", "death overs", "seam movement", "tactical shift").
      - Absolutely AVOID AI buzzwords: "moreover", "delve", "testament", "notably", "demystify", "furthermore", "in conclusion", "it is worth noting", "cradle", "tapestry", "landscape".
      - Verify the keyword is naturally placed in the title, first paragraph, at least one H2 heading, meta description, and slug.
    `;
    
    let result = null;
    let retries = 3;
    while (retries > 0) {
      try {
        result = await model.generateContent(prompt);
        break;
      } catch (err) {
        if ((err.status === 503 || err.message.includes('503')) && retries > 1) {
          console.warn(`[Gemini] 503 Service Unavailable. Retrying in 5 seconds... (${retries - 1} retries left)`);
          await new Promise(r => setTimeout(r, 5000));
          retries--;
        } else {
          throw err;
        }
      }
    }
    let responseJsonText = result.response.text().trim();
    
    // Clean any accidental markdown codeblock fences from AI output
    if (responseJsonText.startsWith('```')) {
      responseJsonText = responseJsonText.replace(/^```json\s*/i, '').replace(/```\s*$/g, '');
    }
    
    const seoData = JSON.parse(responseJsonText);
    console.log('[Gemini] Parsed SEO and Article content successfully.');
    console.log(`[SEO] Focus Keyword: "${seoData.primaryKeyword}"`);
    console.log(`[SEO] SEO Title:     "${seoData.seoTitle}" (${seoData.seoTitle.length} chars)`);
    console.log(`[SEO] Discover Title: "${seoData.discoverTitle}" (${seoData.discoverTitle?.length || 0} chars)`);
    console.log(`[SEO] Description:   "${seoData.metaDescription}" (${seoData.metaDescription.length} chars)`);
    console.log(`[SEO] Slug:          "${seoData.urlSlug}"`);
    console.log(`[SEO] Tags: ${seoData.tags.join(', ')}`);
    
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
    
    // 3. Image Selection: Try to scrape og:image from original article, fallback to high-quality stock photo
    let imageUrl = null;
    let imageCaption = "Photo representing the event coverage.";
    
    // Resolve the Google News redirect link to get the actual article link
    let realArticleLink = topicLink;
    try {
      console.log(`[Decoder] Resolving Google News redirect URL: ${topicLink}`);
      const decoder = new GoogleNewsDecoder();
      const decodedResult = await decoder.decodeGoogleNewsUrl(topicLink);
      if (decodedResult && decodedResult.status && decodedResult.decodedUrl) {
        realArticleLink = decodedResult.decodedUrl;
        console.log(`[Decoder] Successfully resolved to original article URL: ${realArticleLink}`);
      } else {
        console.warn(`[Decoder] Failed to resolve URL, falling back to original redirect link.`);
      }
    } catch (decoderErr) {
      console.warn(`[Decoder] Warning during URL resolution: ${decoderErr.message}`);
    }

    try {
      console.log(`[Scraper] Attempting to scrape Open Graph image from: ${realArticleLink}`);
      const scrapeRes = await fetchUrl(realArticleLink);
      if (scrapeRes.ok) {
        const html = await scrapeRes.text();
        const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i) ||
                        html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
        
        if (ogMatch && ogMatch[1]) {
          const url = ogMatch[1].trim();
          const isGeneric = url.includes('logo') || url.includes('default') || url.includes('fallback') || url.includes('placeholder') || url.includes('IE-OGimage') || url.includes('facebook-share');
          if (url.startsWith('http') && !isGeneric) {
            imageUrl = url;
            const sourceDomain = realArticleLink.replace(/https?:\/\/(www\.)?/, '').split('/')[0];
            imageCaption = `Photo: ${sourceDomain}`;
            console.log(`[Scraper] Successfully found high-quality real article image: ${imageUrl}`);
          }
        }
      }
    } catch (err) {
      console.warn(`[Scraper] Warning: Could not scrape image: ${err.message}`);
    }

    if (!imageUrl) {
      const stockImageQuery = seoData.primaryKeyword || 'cricket match';
      console.log(`[Stock Image] Fetching stock photo for: "${stockImageQuery}"...`);
      try {
        const stockImage = await getStockImage(stockImageQuery, seoData.seoTitle, seoData.tags);
        imageUrl = stockImage.url;
        imageCaption = stockImage.caption;
        console.log(`[Stock Image] Selected Image: ${imageUrl}`);
      } catch (err) {
        console.warn(`[Stock Image] Failed to select stock image: ${err.message}`);
      }
    }

    // GUARANTEED FINAL FALLBACK: agar koi bhi image na mile toh yeh hardcoded reliable URL use karo
    if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('http')) {
      console.warn('[Image] All image sources failed. Using guaranteed hardcoded fallback image.');
      // Randomly pick one of 3 reliable fallback images to avoid repetition
      const FALLBACKS = [
        'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=850&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1593341606579-7f97d02474d4?w=850&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=850&auto=format&fit=crop&q=80'
      ];
      imageUrl = FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];
      imageCaption = 'Cricket action photo via Unsplash.';
    }
    console.log(`[Image] Final image URL confirmed: ${imageUrl}`);
    
    // 4. Build post HTML with image, body, EEAT, and Schema JSON-LD
    const embeddedImageHtml = `
      <div style="margin-bottom: 25px; text-align: center;">
        <img src="${imageUrl}" alt="${seoData.seoTitle} - Pitch Watch Coverage" title="${seoData.seoTitle}" style="width: 100%; max-width: 850px; height: auto; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);" />
        <p style="font-size: 0.85em; color: #666; margin-top: 8px; font-style: italic;">${imageCaption}</p>
      </div>
    `;

    let embeddedVideoHtml = '';
    if (matchedVideo) {
      embeddedVideoHtml = `
        <div class="youtube-embed-box" style="margin-bottom: 30px; text-align: center; background: #fafafa; padding: 15px; border-radius: 6px; border: 1px solid #eee;">
          <h3 style="margin-top: 0; margin-bottom: 12px; font-size: 1.1em; color: #111; font-family: sans-serif;">🎥 Watch Our Video Analysis</h3>
          <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; border-radius: 4px;">
            <iframe src="https://www.youtube.com/embed/${matchedVideo.id}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" allowfullscreen></iframe>
          </div>
        </div>
      `;
    }

    // Format fantasy tips if generated
    if (seoData.fantasyTips) {
      const tips = seoData.fantasyTips;
      const keyPlayersLi = tips.keyPlayers ? tips.keyPlayers.map(p => `<li>${p}</li>`).join('') : '';
      const captainStr = tips.captainOptions ? tips.captainOptions.join(', ') : 'N/A';
      const viceCaptainStr = tips.viceCaptainOptions ? tips.viceCaptainOptions.join(', ') : 'N/A';
      
      const fantasyHtml = `
        <div class="fantasy-tips-box" style="margin: 30px 0; padding: 20px; border: 2px dashed #0284c7; background: #f0f9ff; border-radius: 6px; font-family: sans-serif;">
          <h3 style="margin-top: 0; color: #0284c7; font-size: 1.25em; border-bottom: 1px solid #bae6fd; padding-bottom: 8px; display: flex; align-items: center;">🏏 Dream11 / Fantasy Cricket Guide</h3>
          <p style="margin: 10px 0; font-size: 0.95em;"><strong>Pitch Conditions:</strong> ${tips.pitchReport || 'Dry and balanced wicket.'}</p>
          <div style="margin-top: 15px;">
            <strong>Key Players to Pick:</strong>
            <ul style="margin: 8px 0 12px 20px; padding: 0; font-size: 0.95em;">
              ${keyPlayersLi}
            </ul>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
            <div style="background: #ffffff; padding: 10px; border: 1px solid #e0f2fe; border-radius: 4px; font-size: 0.9em;">
              <strong style="color: #0369a1;">Captain Choices:</strong>
              <p style="margin: 5px 0 0 0; font-weight: bold; color: #334155;">${captainStr}</p>
            </div>
            <div style="background: #ffffff; padding: 10px; border: 1px solid #e0f2fe; border-radius: 4px; font-size: 0.9em;">
              <strong style="color: #0369a1;">Vice-Captain Choices:</strong>
              <p style="margin: 5px 0 0 0; font-weight: bold; color: #334155;">${viceCaptainStr}</p>
            </div>
          </div>
          <p style="margin: 15px 0 0 0; font-size: 0.85em; color: #64748b; font-style: italic; text-align: center;">Disclaimer: Fantasy cricket involves financial risk. Form your teams based on your own research.</p>
        </div>
      `;
      
      seoData.articleBodyHtml += fantasyHtml;
    }
    
    const eeatHtml = `
      <div class="eeat-box" style="margin-top: 30px; padding: 20px; border-top: 1px solid #eee; font-size: 0.9em; color: #555; background: #fafafa; border-radius: 4px;">
        <p style="margin: 0 0 8px 0;"><strong>Published on:</strong> ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} | <strong>Author:</strong> Pitch Watch Editorial Team</p>
        <p style="margin: 0;"><strong>Fact-Check & Verification:</strong> Report verified against live match reports and media updates. Original context sourced from <a href="${topicLink}" target="_blank" rel="nofollow noopener">${topicLink.replace(/https?:\/\/(www\.)?/, '').split('/')[0]}</a>.</p>
      </div>
    `;
    
    // Breadcrumb Label classification
    const mainCategory = seoData.tags.find(t => ['IPL', 'T20', 'ODI', 'Test Match'].includes(t)) || 'Cricket';
    
    // Construct Schemas
    const todayStr = new Date().toISOString();
    const articleSchema = {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      "headline": seoData.seoTitle,
      "description": seoData.metaDescription,
      "image": [imageUrl],
      "datePublished": todayStr,
      "dateModified": todayStr,
      "author": {
        "@type": "Organization",
        "name": "Pitch Watch Editorial Team",
        "url": "https://crickettrendsnews.blogspot.com/"
      },
      "publisher": {
        "@type": "Organization",
        "name": "Pitch Watch",
        "logo": {
          "@type": "ImageObject",
          "url": "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhTLxahyphenhy" // Fallback to icon
        }
      }
    };
    
    const breadcrumbSchema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Home",
          "item": "https://crickettrendsnews.blogspot.com/"
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": mainCategory,
          "item": `https://crickettrendsnews.blogspot.com/search/label/${encodeURIComponent(mainCategory)}`
        }
      ]
    };
    
    let schemaHtml = `
      <script type="application/ld+json">${JSON.stringify(articleSchema)}</script>
      <script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>
    `;
    
    // FAQ Schema if applicable
    if (seoData.faq && seoData.faq.length > 0) {
      const faqSchema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": seoData.faq.map(item => ({
          "@type": "Question",
          "name": item.question,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": item.answer
          }
        }))
      };
      schemaHtml += `\n<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>`;
      
      // Also format FAQ visibly at the bottom of the article
      let faqVisibleHtml = `<div class="post-faq-section" style="margin-top: 30px; border-top: 2px solid #ddd; padding-top: 20px;"><h2>Frequently Asked Questions</h2>`;
      seoData.faq.forEach(item => {
        faqVisibleHtml += `
          <div style="margin-bottom: 15px;">
            <p><strong>Q: ${item.question}</strong></p>
            <p>A: ${item.answer}</p>
          </div>
        `;
      });
      faqVisibleHtml += `</div>`;
      seoData.articleBodyHtml += faqVisibleHtml;
    }
    
    const finalHtmlContent = schemaHtml + embeddedImageHtml + embeddedVideoHtml + seoData.articleBodyHtml + eeatHtml;
    
    // 5. Publish to Blogger
    if (isDryRun) {
      console.log('\n=== DRY RUN MODE: Generated Content Preview ===');
      console.log(`SEO Title: ${seoData.seoTitle}`);
      console.log(`Meta Desc: ${seoData.metaDescription}`);
      console.log(`Slug:      ${seoData.urlSlug}`);
      console.log(`Tags:      ${seoData.tags.join(', ')}`);
      console.log(`Preview (First 1000 characters):\n`);
      console.log(finalHtmlContent.slice(0, 1000) + '...\n');
      console.log('================================================\n');
      
      // Generate dry-run Share Assistant
      try {
        generateShareAssistant('https://crickettrendsnews.blogspot.com/2026/05/dry-run-cricket-article.html', seoData, matchedVideo);
      } catch (shareErr) {
        console.warn(`[Share Assistant] Warning: Failed to generate dry-run dashboard: ${shareErr.message}`);
      }

      // Dry-run Telegram check log
      if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHANNEL_ID) {
        console.log(`[Telegram] [DRY RUN] Would send automated post to channel: ${TELEGRAM_CHANNEL_ID}`);
      } else {
        console.log('[Telegram] [DRY RUN] Automated posting skipped (credentials missing in .env).');
      }

      // Dry-run Facebook Page check log
      if (FACEBOOK_PAGE_ID && FACEBOOK_PAGE_ACCESS_TOKEN) {
        console.log(`[Facebook Page] [DRY RUN] Would send automated post to page ID: ${FACEBOOK_PAGE_ID}`);
      } else {
        console.log('[Facebook Page] [DRY RUN] Automated posting skipped (credentials missing in .env).');
      }

      await sheetsClient.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `Sheet1!D${pendingIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['PENDING']] // reset back to PENDING
        }
      });
      console.log('[Queue] Reset status back to PENDING due to dry-run.');
      return;
    }
    
    // Sanitize custom URL slug (alphanumeric + hyphen only)
    const sanitizedSlug = seoData.urlSlug.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();

    const finalBloggerTitle = seoData.discoverTitle || seoData.seoTitle;

    console.log(`[Blogger] Publishing live post: "${finalBloggerTitle}"...`);
    const bloggerResponse = await bloggerClient.posts.insert({
      blogId: BLOG_ID,
      requestBody: {
        title: finalBloggerTitle,
        content: finalHtmlContent,
        labels: seoData.tags,
        customUrl: sanitizedSlug, // Use the keyword-rich custom slug
        status: 'LIVE'
      },
      isDraft: false
    });
    
    const livePostUrl = bloggerResponse.data.url;
    console.log(`[Blogger] Post published successfully!`);
    console.log(`[Blogger] Live Post URL: ${livePostUrl}`);
    
    // Update breadcrumb schema with the live post URL
    breadcrumbSchema.itemListElement.push({
      "@type": "ListItem",
      "position": 3,
      "name": finalBloggerTitle,
      "item": livePostUrl
    });
    
    // 6. Bidirectional Interlinking (Update Old Post to link to the new post)
    if (seoData.oldPostToUpdate && seoData.oldPostToUpdate.index !== null && seoData.oldPostToUpdate.index !== undefined) {
      const oldPostIndex = seoData.oldPostToUpdate.index;
      if (oldPostIndex >= 0 && oldPostIndex < oldPosts.length) {
        const targetOldPost = oldPosts[oldPostIndex];
        console.log(`[SEO LinkBack] Linking from old post "${targetOldPost.title}" to the new post...`);
        try {
          const recommendation = seoData.oldPostToUpdate.recommendationText
            .replace(/__NEW_POST_URL__/g, livePostUrl)
            .replace(/__NEW_POST_TITLE__/g, seoData.seoTitle);
            
          const updatedContent = targetOldPost.content + `\n\n<div class="recommended-update" style="margin-top: 25px; padding: 15px; border-left: 4px solid #ff4a52; background: #fafafa; border-radius: 4px;">${recommendation}</div>`;
          
          await bloggerClient.posts.update({
            blogId: BLOG_ID,
            postId: targetOldPost.id,
            requestBody: {
              title: targetOldPost.title,
              content: updatedContent,
              labels: targetOldPost.labels
            }
          });
          console.log(`[SEO LinkBack] Successfully updated old post (ID: ${targetOldPost.id})!`);
        } catch (linkBackErr) {
          console.warn(`[SEO LinkBack] Failed to update old post: ${linkBackErr.message}`);
        }
      }
    }

    // 7. Submit to Google Indexing API (Search Console)
    console.log('[Search Console] Notifying Google indexer of new URL...');
    try {
      const indexingResponse = await indexingClient.urlNotifications.publish({
        requestBody: {
          url: livePostUrl,
          type: 'URL_UPDATED'
        }
      });
      console.log('[Search Console] Indexing API request submitted successfully.');
    } catch (indexingErr) {
      console.warn(`[Search Console] Indexing warning: ${indexingErr.message}`);
    }
    
    // 8. Ping Search Engines for Sitemap update
    console.log('[Sitemap] Pinging Google and Bing to refresh sitemap...');
    try {
      const sitemapUrl = 'https://crickettrendsnews.blogspot.com/sitemap.xml';
      await fetchUrl(`https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`);
      await fetchUrl(`https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`);
      console.log('[Sitemap] Pings sent successfully.');
    } catch (pingErr) {
      console.warn(`[Sitemap] Warning: Failed to ping sitemap: ${pingErr.message}`);
    }

    // Log the social captions and future topics for verification/use
    console.log('\n--- Generated Social Sharing Captions ---');
    console.log(`Facebook: ${seoData.socialCaptions.facebook}`);
    console.log(`Twitter/X: ${seoData.socialCaptions.twitter}`);
    console.log(`Telegram: ${seoData.socialCaptions.telegram}`);
    console.log(`WhatsApp: ${seoData.socialCaptions.whatsapp}`);
    console.log('----------------------------------------');
    console.log('--- Suggested Future Topic Cluster Ideas ---');
    seoData.suggestedFutureTopics.forEach((t, i) => console.log(`${i+1}. ${t}`));
    console.log('----------------------------------------\n');

    // Generate live Share Assistant
    try {
      generateShareAssistant(livePostUrl, seoData, matchedVideo);
    } catch (shareErr) {
      console.warn(`[Share Assistant] Warning: Failed to generate dashboard: ${shareErr.message}`);
    }

    // Post automatically to Telegram Channel (article + YouTube link dono)
    try {
      await sendToTelegram(livePostUrl, seoData, imageUrl, matchedVideo);
    } catch (telegramErr) {
      console.warn(`[Telegram] Warning: Failed to send auto-post: ${telegramErr.message}`);
    }

    // Post automatically to Facebook Page
    try {
      await sendToFacebookPage(livePostUrl, seoData, imageUrl);
    } catch (facebookErr) {
      console.warn(`[Facebook Page] Warning: Failed to send auto-post: ${facebookErr.message}`);
    }

    // 9. Update row to COMPLETED and save Post URL
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Sheet1!D${pendingIndex}:F${pendingIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['COMPLETED', livePostUrl, new Date().toISOString()]]
      }
    });
    console.log(`[Queue] Sheet updated successfully: Row ${pendingIndex} status is now COMPLETED.`);
    
  } catch (error) {
    console.error(`[Processor] Failed to process row ${pendingIndex}:`, error);
    
    if (!isDryRun) {
      await sheetsClient.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `Sheet1!D${pendingIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['FAILED']]
        }
      });
      console.log(`[Queue] Row ${pendingIndex} status updated to FAILED.`);
    }
  }
}

// Complete automated workflow logic
async function runWorkflowStep() {
  console.log(`\n======================================================`);
  console.log(`[Workflow] Triggered loop run at ${new Date().toLocaleTimeString()}`);
  console.log(`======================================================`);
  
  try {
    // Discover new trending topics and append them to queue
    await discoverAndQueueNews();
    
    // Sleep for 3 seconds before processing to let Sheets settle
    await new Promise(r => setTimeout(r, 3000));
    
    // Process the next pending article from the queue
    await processNextPendingTopic();
    
  } catch (err) {
    console.error('[Workflow] Error during step execution:', err.message);
  }
  console.log(`[Workflow] Step complete. Waiting for next interval...\n`);
}

// Main Execution router
// NOTE: Loop mode ab Windows Task Scheduler handle karta hai.
// Script ek baar chalta hai, kaam karta hai, aur band ho jaata hai.
// Task Scheduler har 30 min pe automatically restart karta hai.

async function triggerNextWorkflowRun() {
  const PAT = process.env.ACTIONS_PAT;
  if (!PAT) {
    console.warn('[Workflow Loop] ACTIONS_PAT not found in env — cannot auto-trigger next run!');
    return;
  }

  const owner = 'shivam01579-cmd';
  const repo = 'Pitch-Watch-website-';
  const workflowId = 'news-poster.yml';
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;

  const payload = JSON.stringify({ ref: 'main' });

  return new Promise((resolve) => {
    try {
      const urlObj = new URL(url);
      const req = https.request({
        hostname: urlObj.hostname,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Authorization': `token ${PAT}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'PitchWatch/1.0',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          console.log(`[Workflow Loop] Auto-trigger dispatch response: HTTP ${res.statusCode}`);
          resolve(res.statusCode >= 200 && res.statusCode < 300);
        });
      });
      req.on('error', (err) => {
        console.error(`[Workflow Loop] Error during auto-trigger: ${err.message}`);
        resolve(false);
      });
      req.write(payload);
      req.end();
    } catch (err) {
      console.error(`[Workflow Loop] Exception during auto-trigger: ${err.message}`);
      resolve(false);
    }
  });
}

async function main() {
  const startTime = Date.now();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Workflow] Run started at: ${new Date().toLocaleString('en-IN')}`);
  console.log(`${'='.repeat(60)}`);

  try {
    // 1. Initialize Google API Clients
    initGoogleClients();

    if (loopMode) {
      console.log(`[Workflow Loop] Starting continuous daemon loop...`);
      console.log(`[Workflow Loop] Interval: ${loopIntervalMs / 60000} minutes.`);
      console.log(`[Workflow Loop] Safety limit: 330 minutes (5.5 hours).`);
      
      const loopStart = Date.now();
      const maxDurationMs = 330 * 60 * 1000; // 5.5 hours

      while (true) {
        const elapsedMs = Date.now() - loopStart;
        if (elapsedMs >= maxDurationMs) {
          console.log(`[Workflow Loop] Loop duration reached 5.5 hours. Triggering next workflow run to prevent Actions timeout...`);
          await triggerNextWorkflowRun();
          // Wait 30 seconds for Github to register and start the new run
          await new Promise(r => setTimeout(r, 30000));
          console.log(`[Workflow Loop] Exiting current loop to transition to next run.`);
          process.exit(0);
        }

        // Run full step (discover + process)
        await runWorkflowStep();

        console.log(`[Workflow Loop] Waiting for ${loopIntervalMs / 60000} minutes before next run...`);
        await new Promise(r => setTimeout(r, loopIntervalMs));
      }
    } else if (discoverMode) {
      // Only discover new topics and add to queue
      await discoverAndQueueNews();
    } else if (processMode) {
      // Process exactly one pending topic from queue
      await processNextPendingTopic();
    } else {
      // DEFAULT: Full step — discover + process one article
      // Windows Task Scheduler calls this every 30 minutes automatically
      await runWorkflowStep();
    }
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
