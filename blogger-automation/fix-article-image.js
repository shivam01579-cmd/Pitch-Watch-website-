/**
 * fix-article-image.js
 * 
 * Fixes any article's image using the SAME technique as workflow.js:
 *   1. Find the article on Blogger
 *   2. Extract the original source URL from the article's EEAT credit box
 *   3. Scrape og:image / twitter:image from that source page
 *   4. Replace the current image with the real scraped photo
 * 
 * Usage:
 *   node fix-article-image.js                     → fixes "RCB vs GT" article (default)
 *   node fix-article-image.js --title="Patidar"   → fixes article matching that title
 *   node fix-article-image.js --url="https://news.google.com/..."  → scrape this URL for image
 */

import { google } from 'googleapis';
import { readFileSync } from 'fs';
import https from 'https';
import GoogleNewsDecoder from 'google-news-decoder';
import dotenv from 'dotenv';
dotenv.config();

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  BLOG_ID
} = process.env;

const TOKEN_PATH = './tokens.json';

// Parse CLI args
const args = process.argv.slice(2);
const getArg = (key) => {
  const found = args.find(a => a.startsWith(`--${key}=`));
  return found ? found.split('=').slice(1).join('=') : null;
};

const TARGET_TITLE = getArg('title') || 'RCB vs GT';
const MANUAL_SOURCE_URL = getArg('url') || null;

// --- Same fetchUrl helper as workflow.js ---
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
        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchUrl(res.headers.location, extraHeaders).then(resolve).catch(reject);
        }
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            statusCode: res.statusCode,
            text: () => Promise.resolve(data)
          });
        });
      }).on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

// --- Same og:image scraper as workflow.js ---
async function scrapeOgImage(articleUrl) {
  // Step 1: Resolve Google News redirect if needed
  let realUrl = articleUrl;
  if (articleUrl.includes('news.google.com')) {
    try {
      console.log(`  [Decoder] Resolving Google News URL...`);
      const decoder = new GoogleNewsDecoder();
      const result = await decoder.decodeGoogleNewsUrl(articleUrl);
      if (result && result.status && result.decodedUrl) {
        realUrl = result.decodedUrl;
        console.log(`  [Decoder] Resolved → ${realUrl}`);
      }
    } catch (e) {
      console.warn(`  [Decoder] Could not decode: ${e.message}`);
    }
  }

  // Step 2: Fetch HTML and extract og:image
  console.log(`  [Scraper] Fetching HTML from: ${realUrl}`);
  const res = await fetchUrl(realUrl);
  if (!res.ok) {
    throw new Error(`HTTP ${res.statusCode} from ${realUrl}`);
  }
  const html = await res.text();

  const ogMatch =
    html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i) ||
    html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);

  if (!ogMatch || !ogMatch[1]) {
    throw new Error('No og:image or twitter:image found on the source page.');
  }

  const imageUrl = ogMatch[1].trim();
  const isGeneric =
    imageUrl.includes('logo') ||
    imageUrl.includes('default') ||
    imageUrl.includes('fallback') ||
    imageUrl.includes('placeholder') ||
    imageUrl.includes('IE-OGimage') ||
    imageUrl.includes('facebook-share');

  if (!imageUrl.startsWith('http') || isGeneric) {
    throw new Error(`Found og:image but it looks generic/logo: ${imageUrl}`);
  }

  const sourceDomain = realUrl.replace(/https?:\/\/(www\.)?/, '').split('/')[0];
  console.log(`  [Scraper] ✅ Found real image: ${imageUrl.substring(0, 80)}...`);
  return { imageUrl, sourceDomain };
}

// --- Extract source URL from article's EEAT box ---
function extractSourceUrl(htmlContent) {
  // The EEAT box has: href="<original_link>" ... rel="nofollow noopener"
  const eeatMatch = htmlContent.match(/href=["']([^"']+)["'][^>]*rel=["']nofollow noopener["']/i) ||
                    htmlContent.match(/rel=["']nofollow noopener["'][^>]*href=["']([^"']+)["']/i);
  if (eeatMatch && eeatMatch[1]) {
    return eeatMatch[1];
  }
  return null;
}

async function main() {
  // Setup OAuth2
  const auth = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
  const tokenData = JSON.parse(readFileSync(TOKEN_PATH, 'utf8'));
  auth.setCredentials(tokenData);
  const blogger = google.blogger({ version: 'v3', auth });

  // Find the target post
  console.log(`\n[Step 1] Searching for article: "${TARGET_TITLE}"...`);
  const postsRes = await blogger.posts.list({
    blogId: BLOG_ID,
    maxResults: 20,
    status: 'LIVE'
  });
  const posts = postsRes.data.items || [];
  const target = posts.find(p => p.title && p.title.toLowerCase().includes(TARGET_TITLE.toLowerCase()));

  if (!target) {
    console.error(`[Error] No post found matching: "${TARGET_TITLE}"`);
    console.log('\nAvailable posts:');
    posts.forEach(p => console.log(`  - ${p.title}`));
    return;
  }
  console.log(`[Found] "${target.title}"`);
  console.log(`[URL]   ${target.url}`);

  // Find source URL
  let sourceUrl = MANUAL_SOURCE_URL;
  if (!sourceUrl) {
    console.log('\n[Step 2] Extracting original source URL from article EEAT box...');
    sourceUrl = extractSourceUrl(target.content);
    if (sourceUrl) {
      console.log(`[Source] Found: ${sourceUrl}`);
    } else {
      console.warn('[Source] Could not find source URL in EEAT box. Trying Google News search...');
      // Fallback: search Google News for the article title
      const encodedQuery = encodeURIComponent(target.title + ' site:timesofindia.com OR site:espncricinfo.com OR site:cricbuzz.com OR site:hindustantimes.com');
      sourceUrl = `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-IN&gl=IN&ceid=IN:en`;
      console.log(`[Source] Falling back to Google News search.`);
    }
  }

  // Scrape real og:image from the source
  console.log('\n[Step 3] Scraping real article image from source...');
  let imageUrl, sourceDomain, caption;
  try {
    ({ imageUrl, sourceDomain } = await scrapeOgImage(sourceUrl));
    caption = `Photo: ${sourceDomain}`;
  } catch (err) {
    console.error(`[Error] Could not scrape image: ${err.message}`);
    console.log('\n→ Hint: Run with --url="<actual_article_url>" to specify the source manually.');
    console.log('  Example: node fix-article-image.js --title="RCB vs GT" --url="https://timesofindia.com/..."');
    return;
  }

  // Replace image in content
  console.log('\n[Step 4] Replacing image in post content...');
  let content = target.content;

  // Build new image HTML block
  const newImgHtml = `<div style="margin-bottom: 25px; text-align: center;">
        <img src="${imageUrl}" alt="${target.title} - Pitch Watch Coverage" title="${target.title}" style="width: 100%; max-width: 850px; height: auto; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);" />
        <p style="font-size: 0.85em; color: #666; margin-top: 8px; font-style: italic;">${caption}</p>
      </div>`;

  // Try to replace the entire first image div (any source)
  // Match: <div style="margin-bottom: 25px; text-align: center;">...<img...>...<p>caption</p></div>
  const imgDivPattern = /<div[^>]*style="[^"]*margin-bottom:\s*25px[^"]*"[^>]*>[\s\S]*?<img[^>]*>[\s\S]*?<p[^>]*>[\s\S]*?<\/p>[\s\S]*?<\/div>/i;
  let fixed = content.replace(imgDivPattern, newImgHtml);

  if (fixed === content) {
    // Fallback: replace just the first <img> tag
    const firstImg = content.match(/<img[^>]*src=["']([^"']+)["'][^>]*>/i);
    if (firstImg) {
      const oldSrc = firstImg[1];
      console.log(`[Replace] Replacing img src: ${oldSrc.substring(0, 70)}...`);
      fixed = content
        .replace(firstImg[0], `<img src="${imageUrl}" alt="${target.title} - Pitch Watch Coverage" title="${target.title}" style="width: 100%; max-width: 850px; height: auto; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);" />`)
        .replace(/Visual recreation generated for this report by Pitch Watch AI\./gi, caption)
        .replace(/Match action at a packed cricket stadium\. Photo via Unsplash\./gi, caption)
        .replace(/Photo via Unsplash\./gi, caption)
        .replace(/Photo: images\.unsplash\.com/gi, caption);
    }
  }

  if (fixed === content) {
    console.log('[Warning] Could not find image to replace in content. No changes made.');
    return;
  }

  // Update the post on Blogger
  console.log('\n[Step 5] Updating post on Blogger...');
  await blogger.posts.patch({
    blogId: BLOG_ID,
    postId: target.id,
    requestBody: { content: fixed }
  });

  console.log(`\n✅ Done! "${target.title}" updated with real source photo.`);
  console.log(`📸 Image source: ${sourceDomain}`);
  console.log(`🔗 Article: ${target.url}`);
}

main().catch(err => {
  console.error('\n[Fatal]', err.message);
  process.exit(1);
});
