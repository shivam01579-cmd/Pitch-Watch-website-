/**
 * fix-articles-proper.mjs
 * 
 * Scans recent posts on Blogger, finds those with generic/stock fallback images,
 * and fixes them using the smart technique:
 *   1. Extract original source article URL from the post content (EEAT news.google.com link).
 *   2. Resolve the Google News redirect URL to get the real article URL.
 *   3. Scrape the og:image / twitter:image from the source article page.
 *   4. If that fails (e.g. 403, 400, no image), perform a targeted Google News search
 *      specifically on friendly domains (Cricbuzz, TOI, News18, Livemint, Indian Express)
 *      and loop through results to find a friendly page and scrape its real image.
 *   5. Update the Blogger post content with the real scraped image and appropriate caption.
 */

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import https from 'https';
import GoogleNewsDecoder from 'google-news-decoder';
import dotenv from 'dotenv';

dotenv.config();

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  BLOG_ID,
  UNSPLASH_ACCESS_KEY,
  PEXELS_API_KEY
} = process.env;

const TOKEN_PATH = './tokens.json';

const GENERIC_IMAGE_PATTERNS = [
  'cricket-ball', 'cricketball', 'ball.jpg', 'ball.png', 'ball.webp',
  'logo', 'icon', 'favicon', 'default', 'fallback', 'placeholder',
  'no-image', 'noimage', 'blank', 'generic',
  'IE-OGimage', 'facebook-share', 'og-default', 'twitter-default',
  'cricbuzz.com/a/img/v1/imgs/c5f',
  'espncricinfo.com/i/db/PICTURES/CMS/316700',
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

// --- HTTP Fetch Helper ---
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
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            statusCode: res.statusCode,
            text: () => Promise.resolve(data)
          });
        });
      }).on('error', (err) => {
        resolve({ ok: false, statusCode: 500, text: () => Promise.resolve(err.message) });
      });
    } catch (err) {
      resolve({ ok: false, statusCode: 500, text: () => Promise.resolve(err.message) });
    }
  });
}

// --- Query Google News RSS ---
async function searchRSS(query) {
  try {
    const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const res = await fetchUrl(feedUrl);
    if (!res.ok) return [];
    const xml = await res.text();
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
    // console.warn(`  [Decoder Fail] ${e.message}`);
  }
  return redirectUrl;
}

// --- Scrape Image Helper ---
async function scrapeOgImage(articleUrl) {
  const realUrl = await decodeUrl(articleUrl);
  
  const domain = new URL(realUrl).hostname.toLowerCase();
  if (BLOCKED_DOMAINS.some(blocked => domain.includes(blocked))) {
    throw new Error(`Domain ${domain} is on blocked list (known 403/400).`);
  }

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
    throw new Error('No og:image or twitter:image found on page.');
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
    throw new Error(`Found og:image but it looks generic/logo: ${imageUrl}`);
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
      console.log(`  [Scrape Try] Link ${i + 1} failed: ${err.message}`);
    }
  }
  return null;
}

// --- Smart Article Image Solver ---
async function getSmartArticleImage(postTitle, inlineSourceUrl = null) {
  // 1. Try inline source URL first (if available)
  if (inlineSourceUrl) {
    try {
      console.log(`  [Smart Image] Trying inline source URL: ${inlineSourceUrl.slice(0, 80)}...`);
      const result = await scrapeOgImage(inlineSourceUrl);
      if (result) return result;
    } catch (err) {
      console.log(`  [Smart Image] Inline source URL failed: ${err.message}`);
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
  const friendlyFilter = friendlyDomainsQuery();
  const friendlyQuery = `"${cleanTitle}" ${friendlyFilter}`;
  console.log(`  [Smart Image] Trying friendly search: "${cleanTitle}"...`);
  
  let links = await searchRSS(friendlyQuery);
  if (links.length > 0) {
    const result = await tryLinks(links);
    if (result) return result;
  }

  // Try friendly search without quotes (broader match)
  const broaderFriendlyQuery = `${cleanTitle} ${friendlyFilter}`;
  console.log(`  [Smart Image] Trying broader friendly search: ${cleanTitle}...`);
  links = await searchRSS(broaderFriendlyQuery);
  if (links.length > 0) {
    const result = await tryLinks(links);
    if (result) return result;
  }

  // 3. Try generic search
  console.log(`  [Smart Image] Trying generic search: ${cleanTitle}...`);
  links = await searchRSS(`${cleanTitle} cricket`);
  if (links.length > 0) {
    const result = await tryLinks(links);
    if (result) return result;
  }

  return null;
}

function friendlyDomainsQuery() {
  return `(` + FRIENDLY_DOMAINS.map(d => `site:${d}`).join(' OR ') + `)`;
}

// --- Extract Google News Link from content ---
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

function isGenericImage(url) {
  if (!url) return true;
  const lowerUrl = url.toLowerCase();
  return GENERIC_IMAGE_PATTERNS.some(pattern => lowerUrl.includes(pattern.toLowerCase()));
}

async function getFallbackImage(postTitle) {
  if (PEXELS_API_KEY) {
    try {
      const query = postTitle.replace(/[^\w\s]/g, '').slice(0, 50);
      const res = await fetchUrl(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(query + ' cricket')}&per_page=5&orientation=landscape`,
        { 'Authorization': PEXELS_API_KEY }
      );
      if (res.ok) {
        const data = JSON.parse(await res.text());
        if (data.photos && data.photos.length > 0) {
          const photo = data.photos[0];
          return {
            url: photo.src.large || photo.src.medium,
            caption: `Photo by ${photo.photographer} via Pexels.`
          };
        }
      }
    } catch { /* ignore */ }
  }

  if (UNSPLASH_ACCESS_KEY) {
    try {
      const query = postTitle.replace(/[^\w\s]/g, '').slice(0, 50);
      const res = await fetchUrl(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query + ' cricket')}&per_page=5&orientation=landscape`,
        { 'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}` }
      );
      if (res.ok) {
        const data = JSON.parse(await res.text());
        if (data.results && data.results.length > 0) {
          const photo = data.results[0];
          return {
            url: photo.urls.regular,
            caption: `Photo by ${photo.user?.name || 'Unsplash'} via Unsplash.`
          };
        }
      }
    } catch { /* ignore */ }
  }

  return {
    url: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=850&auto=format&fit=crop&q=80',
    caption: 'Match action. Photo via Unsplash.'
  };
}

async function main() {
  const tokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
  auth.setCredentials(tokenData);
  const blogger = google.blogger({ version: 'v3', auth });

  console.log('='.repeat(65));
  console.log('[Proper Fix] Fetching recent posts from Blogger...');
  const postsRes = await blogger.posts.list({
    blogId: BLOG_ID,
    maxResults: 60,
    status: 'LIVE'
  });

  const posts = postsRes.data.items || [];
  console.log(`[Proper Fix] Found ${posts.length} posts. Scanning for generic images...`);

  let fixedCount = 0;

  for (const post of posts) {
    const content = post.content || '';
    const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i) || content.match(/<img[^>]+src='([^']+)'/i);
    const currentImg = imgMatch ? imgMatch[1] : null;

    if (!currentImg) {
      console.log(`[-] "${post.title.slice(0, 50)}" -> No image found.`);
      continue;
    }

    if (!isGenericImage(currentImg)) {
      continue; // This post has a real, specific image already
    }

    console.log(`\n[🔧 FIXING] "${post.title}"`);
    console.log(`  Current Image: ${currentImg.slice(0, 75)}...`);

    const inlineSourceUrl = extractSourceUrl(content);
    
    // Find smart image using our robust domain-filtered fallback search
    const imageResult = await getSmartArticleImage(post.title, inlineSourceUrl);

    let targetImgUrl, targetCaption;
    if (imageResult) {
      targetImgUrl = imageResult.imageUrl;
      targetCaption = `Photo: ${imageResult.sourceDomain}`;
      console.log(`  ✅ Successfully resolved real article image: ${targetImgUrl.slice(0, 75)}...`);
    } else {
      console.log(`  [Fallback] All og:image scraping failed. Keeping current fallback or searching...`);
      continue; // Skip replacing with stadium image since we want only real cricket images
    }

    // Replace the image in content
    const newImgHtml = `<div style="margin-bottom: 25px; text-align: center;">
        <img src="${targetImgUrl}" alt="${post.title} - Pitch Watch Coverage" title="${post.title}" style="width: 100%; max-width: 850px; height: auto; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);" />
        <p style="font-size: 0.85em; color: #666; margin-top: 8px; font-style: italic;">${targetCaption}</p>
      </div>`;

    const imgDivPattern = /<div[^>]*style="[^"]*margin-bottom:\s*25px[^"]*"[^>]*>[\s\S]*?<img[^>]*>[\s\S]*?<p[^>]*>[\s\S]*?<\/p>[\s\S]*?<\/div>/i;
    let fixedContent = content.replace(imgDivPattern, newImgHtml);

    if (fixedContent === content) {
      // Try replacing raw img tag and caption pattern if div doesn't match
      if (imgMatch) {
        fixedContent = content
          .replace(imgMatch[0], `<img src="${targetImgUrl}" alt="${post.title} - Pitch Watch Coverage" title="${post.title}" style="width: 100%; max-width: 850px; height: auto; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);" />`)
          .replace(/Visual recreation generated for this report by Pitch Watch AI\./gi, targetCaption)
          .replace(/Match action at a packed cricket stadium\. Photo via Unsplash\./gi, targetCaption)
          .replace(/Photo via Unsplash\./gi, targetCaption)
          .replace(/Photo: images\.unsplash\.com/gi, targetCaption)
          .replace(/Photo: [a-zA-Z0-9-._]+/gi, targetCaption);
      }
    }

    if (fixedContent !== content) {
      try {
        await blogger.posts.patch({
          blogId: BLOG_ID,
          postId: post.id,
          requestBody: { content: fixedContent }
        });
        console.log(`  🎉 Post updated successfully on Blogger!`);
        fixedCount++;
      } catch (err) {
        console.error(`  ❌ Failed to update Blogger: ${err.message}`);
      }
    } else {
      console.log(`  ⚠️ Content not modified (could not match replacement patterns).`);
    }

    // API rate limit cushion
    await new Promise(resolve => setTimeout(resolve, 850));
  }

  console.log('\n' + '='.repeat(65));
  console.log(`[Proper Fix] Done! Successfully fixed ${fixedCount} posts.`);
  console.log('='.repeat(65));
}

main().catch(err => {
  console.error('[Fatal Error]', err);
});
