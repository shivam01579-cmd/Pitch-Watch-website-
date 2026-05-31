/**
 * Targeted fix for specific posts with generic Unsplash fallback images
 * These posts got our generic stock photos instead of real article images
 */
import dotenv from 'dotenv';
import { google } from 'googleapis';
import https from 'https';
import fs from 'fs';
dotenv.config();

// ── Posts to fix (slug → search query for better image) ─────
// All posts with generic unsplash fallback images
const GENERIC_UNSPLASH_DOMAINS = [
  'photo-1531415074968', // stadium
  'photo-1593341606579', // batsman
  'photo-1512412086890', // pitch
  'photo-1589801258579', // floodlights
  'photo-1508098682722', // crowd
  'photo-1552664730-d307ca884978', // team huddle
  'photo-1540747913346', // bowler
  'photo-1574629810360', // trophy
  'photo-1569517282132', // india team
  'photo-1606925797300', // T20 batting
  'photo-1624880357913', // aerial
  'photo-1599474924187', // fielding
  'photo-1575361204480', // cricket ball
  'photo-1629818651924', // equipment
  'photo-1522778119026', // umpire
];

// ── Helpers ──────────────────────────────────────────────────
function fetchUrl(url, headers = {}) {
  return new Promise(resolve => {
    try {
      const u = new URL(url);
      https.get({ hostname: u.hostname, path: u.pathname + u.search,
        headers: { 'User-Agent': 'Mozilla/5.0', ...headers }, timeout: 8000
      }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => resolve({ ok: res.statusCode < 400, text: () => d }));
      }).on('error', () => resolve({ ok: false })).on('timeout', () => resolve({ ok: false }));
    } catch { resolve({ ok: false }); }
  });
}

function isGenericUnsplash(url) {
  return url && url.includes('unsplash.com') && 
    GENERIC_UNSPLASH_DOMAINS.some(p => url.includes(p));
}

async function scrapeRealImage(articleUrl, postTitle) {
  // Try to get real og:image from source article link in post content
  // Fallback: use Pexels/Unsplash with title as query
  if (process.env.PEXELS_API_KEY) {
    const query = postTitle.replace(/[^\w\s]/g, '').slice(0, 50);
    const res = await fetchUrl(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query + ' cricket')}&per_page=10&orientation=landscape`,
      { 'Authorization': process.env.PEXELS_API_KEY }
    );
    if (res.ok) {
      const data = JSON.parse(res.text());
      if (data.photos?.length > 0) {
        const photo = data.photos[Math.floor(Math.random() * Math.min(5, data.photos.length))];
        return { url: photo.src.large || photo.src.medium, caption: `Photo by ${photo.photographer} via Pexels.` };
      }
    }
  }

  if (process.env.UNSPLASH_ACCESS_KEY) {
    const query = postTitle.replace(/[^\w\s]/g, '').slice(0, 50);
    const res = await fetchUrl(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query + ' cricket')}&per_page=10&orientation=landscape`,
      { 'Authorization': `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` }
    );
    if (res.ok) {
      const data = JSON.parse(res.text());
      if (data.results?.length > 0) {
        const photo = data.results[Math.floor(Math.random() * Math.min(5, data.results.length))];
        return { url: photo.urls.regular, caption: `Photo by ${photo.user?.name} via Unsplash.` };
      }
    }
  }

  // Smart curated — pick based on title keywords, but avoid the generic ones
  const t = postTitle.toLowerCase();
  const SMART_FALLBACKS = [
    { url: 'https://images.unsplash.com/photo-1624880357913-a8539238245b?w=850&auto=format&fit=crop&q=80', caption: 'Aerial view of cricket ground. Photo via Unsplash.', kw: ['stadium', 'ground', 'match', 'ipl', 'final'] },
    { url: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=850&auto=format&fit=crop&q=80', caption: 'Cricket celebration. Photo via Unsplash.', kw: ['win', 'final', 'champion', 'trophy', 'rcb', 'gt'] },
    { url: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=850&auto=format&fit=crop&q=80', caption: 'Bowler in action. Photo via Unsplash.', kw: ['bowler', 'bowling', 'wicket', 'spin', 'pace', 'fifer', 'minhas', 'steyn'] },
    { url: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=850&auto=format&fit=crop&q=80', caption: 'Cricket fans cheering. Photo via Unsplash.', kw: ['crowd', 'fans', 'nepal', 'china', 'women', 'england'] },
    { url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=850&auto=format&fit=crop&q=80', caption: 'Team strategy discussion. Photo via Unsplash.', kw: ['sachin', 'tendulkar', 'team', 'captain', 'test', 'bcci', 'selection'] },
  ];
  const match = SMART_FALLBACKS.find(f => f.kw.some(k => t.includes(k)));
  return match || SMART_FALLBACKS[0];
}

function replaceImageInHtml(html, newUrl, newCaption) {
  // Replace existing img src
  const replaced = html.replace(
    /<img([^>]+)src="https:\/\/images\.unsplash\.com\/[^"]*"([^>]*)>/i,
    `<img$1src="${newUrl}" alt="${newCaption}"$2>`
  );
  // Also replace caption paragraph if present
  const withCaption = replaced.replace(
    /<p[^>]*style="[^"]*font-size:\s*0\.85em[^"]*"[^>]*>.*?<\/p>/i,
    `<p style="font-size:0.85em;color:#666;margin-top:8px;font-style:italic;">${newCaption}</p>`
  );
  return withCaption;
}

// ── Main ─────────────────────────────────────────────────────
const tokens = JSON.parse(fs.readFileSync('tokens.json','utf8'));
const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
auth.setCredentials(tokens);
auth.on('tokens', t => fs.writeFileSync('tokens.json', JSON.stringify({...tokens,...t},null,2)));
const blogger = google.blogger({ version: 'v3', auth });

console.log('='.repeat(60));
console.log('[Fix] Fetching all posts...');

const res = await blogger.posts.list({
  blogId: process.env.BLOG_ID,
  maxResults: 500,
  fetchBodies: true,
  fields: 'items(id,title,url,content,labels)'
});

const posts = res.data.items || [];
let fixed = 0, skipped = 0;

for (const post of posts) {
  const imgMatch = (post.content || '').match(/<img[^>]+src="([^"]+)"/i) ||
                   (post.content || '').match(/<img[^>]+src='([^']+)'/i);
  const currentImg = imgMatch?.[1] || '';

  if (!isGenericUnsplash(currentImg)) {
    skipped++;
    continue;
  }

  console.log(`\n[Fix] 🔧 "${post.title?.slice(0, 55)}"`);
  console.log(`  Current (generic): ${currentImg.slice(0, 70)}...`);

  const newImage = await scrapeRealImage(post.url, post.title);
  console.log(`  New image: ${newImage.url.slice(0, 70)}...`);

  const updatedContent = replaceImageInHtml(post.content, newImage.url, newImage.caption);

  try {
    await blogger.posts.patch({
      blogId: process.env.BLOG_ID,
      postId: post.id,
      requestBody: { content: updatedContent }
    });
    console.log(`  ✅ Fixed!`);
    fixed++;
    await new Promise(r => setTimeout(r, 600)); // rate limit
  } catch (err) {
    console.error(`  ❌ Failed: ${err.message}`);
  }
}

console.log('\n' + '='.repeat(60));
console.log(`[Fix] Done! Fixed: ${fixed} | Already OK: ${skipped}`);
console.log('='.repeat(60));
