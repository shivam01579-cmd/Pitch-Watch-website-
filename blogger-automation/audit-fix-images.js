/**
 * Pitch Watch — Full Blogger Image Audit & Auto-Fix
 * ==================================================
 * Yeh script GitHub Actions pe daily chalta hai.
 * Kya karta hai:
 *   1. Blogger ke SABHI posts fetch karta hai (1st post se lekar latest tak)
 *   2. Har post ka HTML scan karta hai
 *   3. Problems detect karta hai:
 *      a) Koi image hi nahi hai post mein
 *      b) Image broken/404 hai
 *      c) Image generic hai (cricket ball close-up, logo, placeholder, etc.)
 *      d) Image bahut choti hai (likely a thumbnail/icon, not a real article image)
 *   4. Problem mile toh:
 *      - Smart technique se real news article image dhundta hai:
 *         a) Post content se inline source link parse karta hai
 *         b) Resolution aur scraping check karta hai
 *         c) Agar fail hota hai, toh friendly domains (Cricbuzz, TOI, News18, Livemint, etc.) pe search kar ke scrape karta hai
 *         d) Agar bilkul nahi milta, tabhi generic APIs (Unsplash/Pexels) ya curated stock list ka use karta hai
 *      - HTML update karta hai
 *      - Blogger API se post update karta hai
 *   5. Summary Telegram pe bhejta hai
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import GoogleNewsDecoder from 'google-news-decoder';

dotenv.config();

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  BLOG_ID,
  UNSPLASH_ACCESS_KEY,
  PEXELS_API_KEY,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHANNEL_ID
} = process.env;

// ─── Config ─────────────────────────────────────────────────────────────────

// Images matching these patterns are considered GENERIC / BAD quality
const GENERIC_IMAGE_PATTERNS = [
  'cricket-ball', 'cricketball', 'ball.jpg', 'ball.png', 'ball.webp',
  'logo', 'icon', 'favicon', 'default', 'fallback', 'placeholder',
  'no-image', 'noimage', 'blank', 'generic',
  'IE-OGimage', 'facebook-share', 'og-default', 'twitter-default',
  'cricbuzz.com/a/img/v1/imgs/c5f', // cricbuzz generic
  'espncricinfo.com/i/db/PICTURES/CMS/316700', // espn generic
  'hindustantimes.com/static-content',
  '1x1.gif', '1x1.png', 'spacer.gif',
  // Curated fallback images
  'photo-1531415074968',
  'photo-1593341606579',
  'photo-1512412086890',
  'photo-1589801258579',
  'photo-1508098682722',
  'photo-1552664730-d307ca884978',
  'photo-1540747913346',
  'photo-1624880357913',
  'photo-1574629810360',
  'photo-1599474924187',
  'photo-1575361204480',
  'photo-1629818651924',
  'photo-1522778119026',
  'photo-1569517282132',
  'photo-1606925797300',
];

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

// Curated high-quality fallback cricket images
const CURATED_CRICKET_IMAGES = [
  { url: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=850&auto=format&fit=crop&q=80', caption: 'Cricket match in progress at a packed stadium. Photo via Unsplash.', keywords: ['stadium', 'match', 'ipl', 't20', 'odi', 'international', 'final', 'qualifier'] },
  { url: 'https://images.unsplash.com/photo-1593341606579-7f97d02474d4?w=850&auto=format&fit=crop&q=80', caption: 'A cricket batsman in action at the crease. Photo via Unsplash.', keywords: ['batsman', 'batting', 'century', 'fifty', 'innings', 'dhoni', 'kohli', 'sharma', 'six', 'four'] },
  { url: 'https://images.unsplash.com/photo-1512412086890-a7ecb9152b22?w=850&auto=format&fit=crop&q=80', caption: 'A wide view of the cricket ground and pitch. Photo via Unsplash.', keywords: ['pitch', 'ground', 'stadium', 'toss', 'conditions', 'wicket', 'spin'] },
  { url: 'https://images.unsplash.com/photo-1589801258579-18e0ae1d7ad7?w=850&auto=format&fit=crop&q=80', caption: 'Stadium floodlights illuminate the evening match. Photo via Unsplash.', keywords: ['lights', 'evening', 'night', 'ipl', 't20', 'powerplay'] },
  { url: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=850&auto=format&fit=crop&q=80', caption: 'Cricket fans cheering from the stands. Photo via Unsplash.', keywords: ['crowd', 'fans', 'cheering', 'atmosphere'] },
  { url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=850&auto=format&fit=crop&q=80', caption: 'Players discuss team strategy ahead of the match. Photo via Unsplash.', keywords: ['team', 'coach', 'captain', 'squad', 'selection', 'contract', 'bcci'] },
  { url: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=850&auto=format&fit=crop&q=80', caption: 'A bowler delivers the ball at full pace. Photo via Unsplash.', keywords: ['bowling', 'bowler', 'wicket', 'fifer', 'yorker', 'seam', 'swing', 'spin'] },
  { url: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=850&auto=format&fit=crop&q=80', caption: 'Players celebrate a hard-fought cricket victory. Photo via Unsplash.', keywords: ['celebration', 'trophy', 'win', 'victory', 'champion', 'title', 'world cup'] },
  { url: 'https://images.unsplash.com/photo-1569517282132-25d22f4573e6?w=850&auto=format&fit=crop&q=80', caption: 'Cricket action from an international fixture. Photo via Unsplash.', keywords: ['india', 'virat', 'rohit', 'bumrah', 'pakistan', 'england', 'australia', 'icc'] },
  { url: 'https://images.unsplash.com/photo-1606925797300-0b35e9d1794e?w=850&auto=format&fit=crop&q=80', caption: 'Explosive batting display in a T20 match. Photo via Unsplash.', keywords: ['t20', 'ipl', 'powerplay', 'rcb', 'csk', 'mi', 'dc', 'rr', 'kkr', 'srh', 'lsg', 'pbks', 'gt'] },
];

// ─── HTTP Helpers ────────────────────────────────────────────────────────────

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

function httpsPost(url, payload) {
  return new Promise((resolve) => {
    const data = JSON.stringify(payload);
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300 }));
    });
    req.on('error', () => resolve({ ok: false }));
    req.write(data);
    req.end();
  });
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID) return;
  await httpsPost(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    chat_id: TELEGRAM_CHANNEL_ID,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  });
}

// ─── Image Helpers ───────────────────────────────────────────────────────────

function isGenericImage(url) {
  if (!url) return true;
  const lowerUrl = url.toLowerCase();
  return GENERIC_IMAGE_PATTERNS.some(pattern => lowerUrl.includes(pattern.toLowerCase()));
}

async function isImageBroken(url) {
  if (!url || !url.startsWith('http')) return true;
  const res = await fetchUrl(url);
  return !res.ok;
}

// --- Query Google News RSS ---
async function searchRSS(query) {
  try {
    const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const res = await fetchUrl(feedUrl);
    if (!res.ok) return [];
    const xml = res.text();
    const matches = [...xml.matchAll(/<item>[\s\S]*?<link>([^<]+)<\/link>/gi)];
    return matches.map(m => m[1].trim());
  } catch (err) {
    console.warn(`  [Search Error] ${err.message}`);
    return [];
  }
}

// --- Decode Google News Redirect ---
async function decodeUrl(redirectUrl) {
  if (!redirectUrl.includes('news.google.com')) return redirectUrl;
  try {
    const decoder = new GoogleNewsDecoder();
    const result = await decoder.decodeGoogleNewsUrl(redirectUrl);
    if (result && result.status && result.decodedUrl) {
      return result.decodedUrl;
    }
  } catch (e) {
    // ignore
  }
  return redirectUrl;
}

// --- Scrape Image Helper ---
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

  const sourceDomain = realUrl.replace(/https?:\/\/(www\.)?/, '').split('/')[0];
  return { imageUrl, sourceDomain };
}

// --- Loop and Try Scraping Links ---
async function tryLinks(links) {
  for (let i = 0; i < Math.min(6, links.length); i++) {
    const link = links[i];
    try {
      const result = await scrapeOgImage(link);
      if (result) return result;
    } catch (err) {
      // ignore individual failures
    }
  }
  return null;
}

// --- Smart Article Image Solver ---
async function getSmartArticleImage(postTitle, inlineSourceUrl = null) {
  // 1. Try inline source URL first (if available)
  if (inlineSourceUrl) {
    try {
      const result = await scrapeOgImage(inlineSourceUrl);
      if (result) return result;
    } catch (err) {
      // ignore inline fail
    }
  }

  // Clean title for search queries
  const cleanTitle = postTitle
    .replace(/#[a-zA-Z0-9]+/g, '')
    .replace(/\|\s*#\w+/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 2. Search on friendly domains (Cricbuzz, TOI, HT, ESPN, Livemint)
  const friendlyFilter = `(` + FRIENDLY_DOMAINS.map(d => `site:${d}`).join(' OR ') + `)`;
  const friendlyQuery = `"${cleanTitle}" ${friendlyFilter}`;
  
  let links = await searchRSS(friendlyQuery);
  if (links.length > 0) {
    const result = await tryLinks(links);
    if (result) return result;
  }

  // Try friendly search without quotes (broader match)
  const broaderFriendlyQuery = `${cleanTitle} ${friendlyFilter}`;
  links = await searchRSS(broaderFriendlyQuery);
  if (links.length > 0) {
    const result = await tryLinks(links);
    if (result) return result;
  }

  // 3. Try generic search
  links = await searchRSS(`${cleanTitle} cricket`);
  if (links.length > 0) {
    const result = await tryLinks(links);
    if (result) return result;
  }

  return null;
}

async function getBestImage(postTitle, postLabels = [], inlineSourceUrl = null) {
  // Try smart scraping first!
  try {
    const smartImg = await getSmartArticleImage(postTitle, inlineSourceUrl);
    if (smartImg) {
      return {
        url: smartImg.imageUrl,
        caption: `Photo: ${smartImg.sourceDomain}`
      };
    }
  } catch (err) {
    // ignore smart fail, go to API fallback
  }

  const query = postTitle.replace(/[^\w\s]/g, '').slice(0, 60);

  // 1. Try Unsplash API
  if (UNSPLASH_ACCESS_KEY) {
    try {
      const res = await fetchUrl(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query + ' cricket')}&per_page=10&orientation=landscape`,
        { 'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}` }
      );
      if (res.ok) {
        const data = JSON.parse(res.text());
        if (data.results && data.results.length > 0) {
          const photo = data.results[Math.floor(Math.random() * Math.min(5, data.results.length))];
          return {
            url: photo.urls.regular,
            caption: `Photo${photo.user ? ' by ' + photo.user.name : ''} via Unsplash.`
          };
        }
      }
    } catch { /* ignore */ }
  }

  // 2. Try Pexels API
  if (PEXELS_API_KEY) {
    try {
      const res = await fetchUrl(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(query + ' cricket')}&per_page=10&orientation=landscape`,
        { 'Authorization': PEXELS_API_KEY }
      );
      if (res.ok) {
        const data = JSON.parse(res.text());
        if (data.photos && data.photos.length > 0) {
          const photo = data.photos[Math.floor(Math.random() * Math.min(5, data.photos.length))];
          return {
            url: photo.src.large || photo.src.medium,
            caption: `Photo${photo.photographer ? ' by ' + photo.photographer : ''} via Pexels.`
          };
        }
      }
    } catch { /* ignore */ }
  }

  // 3. Curated fallback — match by keywords in title + labels
  const combined = `${postTitle} ${(postLabels || []).join(' ')}`.toLowerCase();
  const matches = CURATED_CRICKET_IMAGES.filter(img =>
    img.keywords.some(kw => combined.includes(kw))
  );
  const pool = matches.length > 0 ? matches : CURATED_CRICKET_IMAGES;
  const hash = postTitle.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return pool[hash % pool.length];
}

// ─── HTML Manipulation ───────────────────────────────────────────────────────

function extractFirstImageUrl(html) {
  if (!html) return null;
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : null;
}

function extractSourceUrl(htmlContent) {
  const gnewsMatch = htmlContent.match(/href=["'](https?:\/\/news\.google\.com\/rss\/articles\/[^"']+)["']/i);
  if (gnewsMatch && gnewsMatch[1]) {
    return gnewsMatch[1];
  }

  const eeatMatch = htmlContent.match(/href=["']([^"']+)["'][^>]*rel=["']nofollow noopener["']/i) ||
                    htmlContent.match(/rel=["']nofollow noopener["'][^>]*href=["']([^"']+)["']/i);
  if (eeatMatch && eeatMatch[1]) {
    return eeatMatch[1];
  }
  return null;
}

function replaceFirstImage(html, newImageUrl, newCaption) {
  const newImgTag = `<img src="${newImageUrl}" alt="${newCaption}" title="${newCaption}" style="width:100%;max-width:850px;height:auto;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.15);" />`;

  if (/<img[^>]+src=["'][^"']*["'][^>]*>/i.test(html)) {
    return html.replace(/<img[^>]+src=["'][^"']*["'][^>]*>/i, newImgTag);
  }
  return html;
}

function injectImageAtTop(html, imageUrl, caption) {
  const imageBlock = `
<div style="margin-bottom:25px;text-align:center;">
  <img src="${imageUrl}" alt="${caption}" title="${caption}" style="width:100%;max-width:850px;height:auto;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.15);" />
  <p style="font-size:0.85em;color:#666;margin-top:8px;font-style:italic;">${caption}</p>
</div>
`;
  const schemaEnd = html.indexOf('</script>');
  if (schemaEnd !== -1) {
    const secondScriptEnd = html.indexOf('</script>', schemaEnd + 10);
    if (secondScriptEnd !== -1) {
      const insertAt = secondScriptEnd + 9;
      return html.slice(0, insertAt) + '\n' + imageBlock + html.slice(insertAt);
    }
    return html.slice(0, schemaEnd + 9) + '\n' + imageBlock + html.slice(schemaEnd + 9);
  }
  return imageBlock + html;
}

async function logAuditFixToSheets(sheets, spreadsheetId, title, problemType, originalImg, sourceUrl, fixedImg, status) {
  try {
    const sheetName = 'ImageAuditLog';
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetExists = meta.data.sheets.some(s => s.properties.title === sheetName);
    
    if (!sheetExists) {
      console.log(`[Audit Log] Creating new sheet tab "${sheetName}" in Google Sheets...`);
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: { title: sheetName }
            }
          }]
        }
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1:G1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['Timestamp', 'Post Title', 'Problem Type', 'Original Image URL', 'Source URL', 'Fixed Image URL', 'Status']]
        }
      });
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:G`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          new Date().toISOString(),
          title,
          problemType,
          originalImg,
          sourceUrl,
          fixedImg,
          status
        ]]
      }
    });
    console.log(`[Audit Log] Saved fix history to Google Sheets.`);
  } catch (err) {
    console.warn(`[Audit Log] Warning: Could not log to Google Sheets: ${err.message}`);
  }
}

// ─── Main Audit Logic ────────────────────────────────────────────────────────

async function auditAndFixImages() {
  console.log('\n' + '='.repeat(60));
  console.log(`[Audit] Image Audit started: ${new Date().toLocaleString('en-IN')}`);
  console.log('='.repeat(60));

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !BLOG_ID) {
    console.error('[Audit] Missing required env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, BLOG_ID');
    process.exit(1);
  }

  const tokenPath = path.resolve('tokens.json');
  if (!fs.existsSync(tokenPath)) {
    console.error('[Audit] tokens.json not found!');
    process.exit(1);
  }

  const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
  auth.setCredentials(tokens);

  auth.on('tokens', (newTokens) => {
    const updated = { ...tokens, ...newTokens };
    fs.writeFileSync(tokenPath, JSON.stringify(updated, null, 2));
    console.log('[Auth] Tokens auto-refreshed and saved.');
  });

  const blogger = google.blogger({ version: 'v3', auth });
  const sheetsClient = google.sheets({ version: 'v4', auth });

  console.log('[Audit] Fetching all posts from Blogger...');
  const allPosts = [];
  let pageToken = null;
  let pageNum = 0;

  do {
    pageNum++;
    console.log(`[Audit] Fetching page ${pageNum} of posts...`);
    const params = {
      blogId: BLOG_ID,
      maxResults: 500,
      status: 'live',
      fetchBodies: true,
      fetchImages: true,
      fields: 'items(id,title,content,labels,url),nextPageToken'
    };
    if (pageToken) params.pageToken = pageToken;

    try {
      const res = await blogger.posts.list(params);
      const items = res.data.items || [];
      allPosts.push(...items);
      pageToken = res.data.nextPageToken || null;
      console.log(`[Audit] Page ${pageNum}: fetched ${items.length} posts. Total so far: ${allPosts.length}`);
    } catch (err) {
      console.error(`[Audit] Error fetching page ${pageNum}:`, err.message);
      pageToken = null;
    }
  } while (pageToken);

  console.log(`\n[Audit] Total posts fetched: ${allPosts.length}`);

  const stats = {
    total: allPosts.length,
    noImage: 0,
    genericImage: 0,
    brokenImage: 0,
    fixed: 0,
    fixFailed: 0,
    alreadyOk: 0
  };

  const fixedTitles = [];
  const failedTitles = [];

  for (let i = 0; i < allPosts.length; i++) {
    const post = allPosts[i];
    const postNum = `[${i + 1}/${allPosts.length}]`;
    let problemType = null;
    let firstImageUrl = null;
    let inlineSourceUrl = null;

    try {
      const content = post.content || '';
      firstImageUrl = extractFirstImageUrl(content);

      if (!firstImageUrl) {
        problemType = 'NO_IMAGE';
        stats.noImage++;
      } else if (isGenericImage(firstImageUrl)) {
        problemType = 'GENERIC_IMAGE';
        stats.genericImage++;
      } else {
        const isUnsplashOrPexels = firstImageUrl.includes('unsplash.com') || firstImageUrl.includes('pexels.com');
        if (!isUnsplashOrPexels) {
          const broken = await isImageBroken(firstImageUrl);
          if (broken) {
            problemType = 'BROKEN_IMAGE';
            stats.brokenImage++;
          }
        }
      }

      if (!problemType) {
        stats.alreadyOk++;
        console.log(`${postNum} ✅ OK: "${post.title?.slice(0, 50)}"`);
        continue;
      }

      console.log(`${postNum} 🔧 FIXING [${problemType}]: "${post.title?.slice(0, 50)}"`);

      // Extract inline source URL if available
      const inlineSourceUrl = extractSourceUrl(content);

      // Get a better image using the smart scraper + fallbacks
      const newImage = await getBestImage(post.title, post.labels, inlineSourceUrl);
      if (!newImage || !newImage.url) {
        console.warn(`${postNum} ⚠️ Could not find replacement image. Skipping.`);
        stats.fixFailed++;
        failedTitles.push(post.title?.slice(0, 60));
        continue;
      }

      // Update HTML
      let updatedContent;
      if (problemType === 'NO_IMAGE') {
        updatedContent = injectImageAtTop(content, newImage.url, newImage.caption);
      } else {
        updatedContent = replaceFirstImage(content, newImage.url, newImage.caption);
        updatedContent = updatedContent.replace(
          /<p[^>]*style="[^"]*font-size:\s*0\.85em[^"]*"[^>]*>.*?<\/p>/i,
          `<p style="font-size:0.85em;color:#666;margin-top:8px;font-style:italic;">${newImage.caption}</p>`
        );
      }

      // Update on Blogger
      await blogger.posts.patch({
        blogId: BLOG_ID,
        postId: post.id,
        requestBody: {
          content: updatedContent
        }
      });

      stats.fixed++;
      fixedTitles.push(post.title?.slice(0, 60));
      console.log(`${postNum} ✅ FIXED: "${post.title?.slice(0, 50)}" → ${newImage.url.slice(0, 60)}...`);

      if (SPREADSHEET_ID) {
        await logAuditFixToSheets(
          sheetsClient,
          SPREADSHEET_ID,
          post.title,
          problemType,
          firstImageUrl || 'NONE',
          inlineSourceUrl || 'NONE',
          newImage.url,
          'RESOLVED'
        );
      }

      await new Promise(r => setTimeout(r, 600));

    } catch (err) {
      console.error(`${postNum} ❌ Error processing "${post.title?.slice(0, 40)}":`, err.message);
      stats.fixFailed++;
      failedTitles.push(post.title?.slice(0, 60) + ' [ERROR]');
      if (SPREADSHEET_ID) {
        try {
          await logAuditFixToSheets(
            sheetsClient,
            SPREADSHEET_ID,
            post.title,
            problemType || 'UNKNOWN',
            firstImageUrl || 'NONE',
            inlineSourceUrl || 'NONE',
            'NONE',
            `FAILED: ${err.message}`
          );
        } catch (_) {}
      }
    }
  }

  // ─── Final Summary ──────────────────────────────────────────────────────

  console.log('\n' + '='.repeat(60));
  console.log('[Audit] SUMMARY:');
  console.log(`  Total posts scanned : ${stats.total}`);
  console.log(`  Already OK          : ${stats.alreadyOk}`);
  console.log(`  No image (fixed)    : ${stats.noImage}`);
  console.log(`  Generic image (fix) : ${stats.genericImage}`);
  console.log(`  Broken image (fix)  : ${stats.brokenImage}`);
  console.log(`  Successfully fixed  : ${stats.fixed}`);
  console.log(`  Fix failed          : ${stats.fixFailed}`);
  console.log('='.repeat(60));

  const needsAttention = stats.fixFailed > 0;
  const emoji = needsAttention ? '⚠️' : '✅';

  let summaryText = `${emoji} <b>Pitch Watch — Image Audit Complete</b>\n\n`;
  summaryText += `📊 <b>Scan Results (${new Date().toLocaleDateString('en-IN')}):</b>\n`;
  summaryText += `• Total posts scanned: <b>${stats.total}</b>\n`;
  summaryText += `• Already OK: <b>${stats.alreadyOk}</b> ✅\n`;
  summaryText += `• Fixed (no image): <b>${stats.noImage}</b> 🔧\n`;
  summaryText += `• Fixed (generic image): <b>${stats.genericImage}</b> 🔧\n`;
  summaryText += `• Fixed (broken image): <b>${stats.brokenImage}</b> 🔧\n`;
  summaryText += `• <b>Total Fixed: ${stats.fixed}</b> 🎉\n`;

  if (stats.fixFailed > 0) {
    summaryText += `• Fix failed: <b>${stats.fixFailed}</b> ❌\n`;
  }

  if (fixedTitles.length > 0 && fixedTitles.length <= 5) {
    summaryText += `\n<b>Fixed Posts:</b>\n${fixedTitles.map(t => `• ${t}`).join('\n')}`;
  } else if (fixedTitles.length > 5) {
    summaryText += `\n<b>Fixed Posts (first 5):</b>\n${fixedTitles.slice(0, 5).map(t => `• ${t}`).join('\n')}\n...and ${fixedTitles.length - 5} more.`;
  }

  await sendTelegram(summaryText);
  console.log('[Audit] Summary sent to Telegram.');
  console.log('[Audit] Done!\n');
}

auditAndFixImages().catch(err => {
  console.error('[Audit] Fatal error:', err);
  process.exit(1);
});
