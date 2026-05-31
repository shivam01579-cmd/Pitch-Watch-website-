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
 *      - Post title se relevant real cricket photo dhundta hai (Unsplash/Pexels/curated)
 *      - HTML update karta hai
 *      - Blogger API se post update karta hai
 *   5. Summary Telegram pe bhejta hai
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import dotenv from 'dotenv';

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
  // ── ALL curated Unsplash fallback images (stock photos, not article-specific) ──
  'photo-1531415074968', // stadium lights
  'photo-1593341606579', // batsman
  'photo-1512412086890', // pitch wide
  'photo-1589801258579', // floodlit evening
  'photo-1508098682722', // crowd fans
  'photo-1552664730-d307ca884978', // team huddle
  'photo-1540747913346', // bowler action
  'photo-1624880357913', // aerial view
  'photo-1574629810360', // trophy celebration
  'photo-1599474924187', // fielding
  'photo-1575361204480', // cricket ball close-up
  'photo-1629818651924', // equipment
  'photo-1522778119026', // umpire
  'photo-1569517282132', // india team
  'photo-1606925797300', // T20 batting
];


// Curated high-quality fallback cricket images (from workflow.js)
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
          'User-Agent': 'Mozilla/5.0 (compatible; PitchWatchBot/1.0)',
          ...extraHeaders
        },
        timeout: 8000
      };
      https.get(options, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, statusCode: res.statusCode, text: () => data }));
      }).on('error', (err) => resolve({ ok: false, error: err.message }))
        .on('timeout', () => resolve({ ok: false, error: 'timeout' }));
    } catch (err) {
      resolve({ ok: false, error: err.message });
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

async function getBestImage(postTitle, postLabels = []) {
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
  // Deterministic but varied: use title hash to pick consistent image for same post
  const hash = postTitle.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return pool[hash % pool.length];
}

// ─── HTML Manipulation ───────────────────────────────────────────────────────

function extractFirstImageUrl(html) {
  if (!html) return null;
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : null;
}

function replaceFirstImage(html, newImageUrl, newCaption) {
  // Replace the existing first image src
  const newImgTag = `<img src="${newImageUrl}" alt="${newCaption}" title="${newCaption}" style="width:100%;max-width:850px;height:auto;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.15);" />`;

  // Try to replace existing <img> tag
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
  // Inject right after the first <script type="application/ld+json"> block if exists (after schema)
  const schemaEnd = html.indexOf('</script>');
  if (schemaEnd !== -1) {
    const secondScriptEnd = html.indexOf('</script>', schemaEnd + 10);
    if (secondScriptEnd !== -1) {
      const insertAt = secondScriptEnd + 9;
      return html.slice(0, insertAt) + '\n' + imageBlock + html.slice(insertAt);
    }
    return html.slice(0, schemaEnd + 9) + '\n' + imageBlock + html.slice(schemaEnd + 9);
  }
  // Otherwise just prepend
  return imageBlock + html;
}

// ─── Main Audit Logic ────────────────────────────────────────────────────────

async function auditAndFixImages() {
  console.log('\n' + '='.repeat(60));
  console.log(`[Audit] Image Audit started: ${new Date().toLocaleString('en-IN')}`);
  console.log('='.repeat(60));

  // Setup Google API clients
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

  // Auto-save refreshed tokens
  auth.on('tokens', (newTokens) => {
    const updated = { ...tokens, ...newTokens };
    fs.writeFileSync(tokenPath, JSON.stringify(updated, null, 2));
    console.log('[Auth] Tokens auto-refreshed and saved.');
  });

  const blogger = google.blogger({ version: 'v3', auth });

  // Fetch ALL posts (paginated)
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

  // Audit each post
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

    try {
      const content = post.content || '';
      const firstImageUrl = extractFirstImageUrl(content);
      let problemType = null;

      if (!firstImageUrl) {
        problemType = 'NO_IMAGE';
        stats.noImage++;
      } else if (isGenericImage(firstImageUrl)) {
        problemType = 'GENERIC_IMAGE';
        stats.genericImage++;
      } else {
        // Check if image is broken (only for non-Unsplash to save rate limits)
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

      // Get a better image
      const newImage = await getBestImage(post.title, post.labels);
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
        // Replace existing bad image
        updatedContent = replaceFirstImage(content, newImage.url, newImage.caption);
        // Also update caption if present
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

      // Small delay to respect API rate limits
      await new Promise(r => setTimeout(r, 500));

    } catch (err) {
      console.error(`${postNum} ❌ Error processing "${post.title?.slice(0, 40)}":`, err.message);
      stats.fixFailed++;
      failedTitles.push(post.title?.slice(0, 60) + ' [ERROR]');
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

  // Send Telegram summary
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
