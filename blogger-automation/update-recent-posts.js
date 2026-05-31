import fs from 'fs';
import path from 'path';
import https from 'https';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import GoogleNewsDecoder from 'google-news-decoder';

// Load environment variables
dotenv.config();

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  BLOG_ID,
  UNSPLASH_ACCESS_KEY,
  PEXELS_API_KEY,
  SPREADSHEET_ID
} = process.env;

// Parse CLI flags
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

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

const CURATED_CRICKET_IMAGES = [
  {
    url: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=850&auto=format&fit=crop&q=80',
    caption: 'Match action in progress at the stadium. Photo by Alessandro Bogliari on Unsplash.',
    keywords: ['stadium', 'match', 'ipl', 't20', 'odi', 'international', 'lights', 'crowd', 'run', 'score']
  },
  {
    url: 'https://images.unsplash.com/photo-1593341606579-7f97d02474d4?w=850&auto=format&fit=crop&q=80',
    caption: 'A cricket batsman focused at the crease. Photo by Naveen Kumar on Unsplash.',
    keywords: ['batsman', 'batting', 'run', 'score', 'century', 'fifty', 'partnership', 'opener', 'captain', 'innings', 'dhoni', 'kohli', 'sharma', 'csk', 'mi', 'rcb']
  },
  {
    url: 'https://images.unsplash.com/photo-1512412086890-a7ecb9152b22?w=850&auto=format&fit=crop&q=80',
    caption: 'The pristine outfield and pitch layout. Photo by Sagar Kulkarni on Unsplash.',
    keywords: ['pitch', 'outfield', 'ground', 'stadium', 'weather', 'rain', 'toss', 'conditions']
  },
  {
    url: 'https://images.unsplash.com/photo-1589801258579-18e0ae1d7ad7?w=850&auto=format&fit=crop&q=80',
    caption: 'Stadium floodlights illuminating the field. Photo on Unsplash.',
    keywords: ['lights', 'floodlights', 'evening', 'night', 'd/n', 'stadium', 'ipl', 't20']
  },
  {
    url: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=850&auto=format&fit=crop&q=80',
    caption: 'Spectators cheering from the stands. Photo on Unsplash.',
    keywords: ['crowd', 'fans', 'spectators', 'cheering', 'audience', 'atmosphere', 'stadium']
  },
  {
    url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=850&auto=format&fit=crop&q=80',
    caption: 'A team gathering to discuss match tactics. Photo on Unsplash.',
    keywords: ['team', 'coach', 'huddle', 'captain', 'meeting', 'squad', 'selection', 'contract', 'bcci']
  }
];

async function getStockImage(queryText, seoTitle, tags = []) {
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
            caption: `Photo representing the event coverage${photographer} on Unsplash.`
          };
        }
      }
    } catch (err) {
      console.warn('[Stock Image] Unsplash API search failed:', err.message);
    }
  }

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
            caption: `Photo representing the event coverage${photographer} on Pexels.`
          };
        }
      }
    } catch (err) {
      console.warn('[Stock Image] Pexels API search failed:', err.message);
    }
  }

  console.log('[Stock Image] Falling back to curated high-quality cricket stock images...');
  const combinedText = `${seoTitle} ${tags.join(' ')}`.toLowerCase();
  const matches = CURATED_CRICKET_IMAGES.filter(img => 
    img.keywords.some(kw => combinedText.includes(kw))
  );
  const selectedList = matches.length > 0 ? matches : CURATED_CRICKET_IMAGES;
  const randomIndex = Math.floor(Math.random() * selectedList.length);
  return selectedList[randomIndex];
}

async function getImageForPost(post, htmlContent, originalSourceUrl = null) {
  // Try to find the original context source URL in the post HTML if not passed
  if (!originalSourceUrl) {
    const sourceMatch = htmlContent.match(/sourced from <a[^>]+href=["']([^"']+)["']/i);
    if (sourceMatch && sourceMatch[1]) {
      originalSourceUrl = sourceMatch[1];
      console.log(`[Detector] Extracted original source URL from post HTML: ${originalSourceUrl}`);
    }
  }

  let imageUrl = null;
  let imageCaption = "Photo representing the event coverage.";

  if (originalSourceUrl) {
    let realArticleLink = originalSourceUrl;
    if (originalSourceUrl.includes('news.google.com')) {
      try {
        console.log(`[Decoder] Resolving Google News URL: ${originalSourceUrl}`);
        const decoder = new GoogleNewsDecoder();
        const decodedResult = await decoder.decodeGoogleNewsUrl(originalSourceUrl);
        if (decodedResult && decodedResult.status && decodedResult.decodedUrl) {
          realArticleLink = decodedResult.decodedUrl;
          console.log(`[Decoder] Resolved to: ${realArticleLink}`);
        }
      } catch (err) {
        console.warn(`[Decoder] Failed to resolve Google News URL: ${err.message}`);
      }
    }

    try {
      console.log(`[Scraper] Scraping image from: ${realArticleLink}`);
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
            imageCaption = `Photo representing the event coverage. Source: ${realArticleLink.replace(/https?:\/\/(www\.)?/, '').split('/')[0]}`;
            console.log(`[Scraper] Found real article image: ${imageUrl}`);
          }
        }
      }
    } catch (err) {
      console.warn(`[Scraper] Failed to scrape image: ${err.message}`);
    }
  }

  if (!imageUrl) {
    console.log(`[Stock Image] Scraping failed or no source URL. Falling back to stock image lookup...`);
    const keywords = post.title.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    const stockImage = await getStockImage(keywords, post.title, post.labels || []);
    imageUrl = stockImage.url;
    imageCaption = stockImage.caption;
  }

  return { imageUrl, imageCaption };
}

async function main() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI || !BLOG_ID) {
    console.error('Missing required environment variables. Check .env file.');
    process.exit(1);
  }

  const tokenPath = path.resolve('tokens.json');
  if (!fs.existsSync(tokenPath)) {
    console.error(`Authentication token file 'tokens.json' not found. Run 'npm run auth' first.`);
    process.exit(1);
  }

  const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));

  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials(tokens);

  // Auto-refresh token listener
  oauth2Client.on('tokens', (newTokens) => {
    const currentTokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    const updatedTokens = { ...currentTokens, ...newTokens };
    fs.writeFileSync(tokenPath, JSON.stringify(updatedTokens, null, 2));
    console.log('[OAuth2] Tokens successfully refreshed and saved.');
  });

  const blogger = google.blogger({ version: 'v3', auth: oauth2Client });
  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

  // Load Google Sheet mapping
  console.log('[Sheets] Loading topic mappings from Google Sheets...');
  let queueMap = new Map();
  try {
    const sheetResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A2:E500' // Col A: Topic Title, Col B: Original Link, Col E: Post URL
    });
    const rows = sheetResponse.data.values || [];
    console.log(`[Sheets] Found ${rows.length} rows in the queue.`);
    for (const row of rows) {
      if (row[0] && row[1]) {
        queueMap.set(row[0].toLowerCase().trim(), row[1].trim());
      }
      if (row[4] && row[1]) {
        queueMap.set(row[4].trim(), row[1].trim());
      }
    }
  } catch (err) {
    console.warn(`[Sheets] Warning: Could not fetch Google Sheet mappings: ${err.message}`);
  }

  // Calculate 24 hours ago
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  console.log(`[Blogger] Fetching posts published since: ${twentyFourHoursAgo}`);

  try {
    const listResponse = await blogger.posts.list({
      blogId: BLOG_ID,
      startDate: twentyFourHoursAgo,
      status: 'LIVE',
      maxResults: 50
    });

    const posts = listResponse.data.items || [];
    console.log(`[Blogger] Found ${posts.length} post(s) published in the last 24 hours.`);

    if (posts.length === 0) {
      console.log('No posts to update.');
      return;
    }

    for (const post of posts) {
      // User requested to skip this specific article
      if (
        post.title.includes("Vaibhav Sooryavanshi's Test Cricket Challenge is Apex") ||
        post.title.includes("Steyn: Vaibhav Sooryavanshi's")
      ) {
        console.log(`\n[Skip] Skipping post per user request: "${post.title}"`);
        continue;
      }

      console.log(`\n------------------------------------------------------`);
      console.log(`Processing Post: "${post.title}"`);
      console.log(`URL: ${post.url}`);
      
      let htmlContent = post.content || '';
      let updated = false;

      // Check if we have a mapping in the Google Sheet
      let originalSourceUrl = null;
      if (queueMap.has(post.url.trim())) {
        originalSourceUrl = queueMap.get(post.url.trim());
        console.log(`[Sheets Match] Found original link by URL match: ${originalSourceUrl}`);
      } else {
        // Try matching by clean title
        const cleanTitle = post.title.toLowerCase().trim();
        for (const [key, val] of queueMap.entries()) {
          if (key.length > 5 && (cleanTitle.includes(key) || key.includes(cleanTitle))) {
            originalSourceUrl = val;
            console.log(`[Sheets Match] Found original link by title match ("${key}"): ${originalSourceUrl}`);
            break;
          }
        }
      }

      // 1. Check if it has a Pollinations/AI or generic "ball on grass" image to replace
      // Let's replace if it has pollinations.ai OR if it has a curated generic Unsplash image from our list (to re-generate a real one!)
      const pollinationsRegex = /<img[^>]+src=["'](https:\/\/image\.pollinations\.ai\/prompt\/[^"']+|https:\/\/images\.unsplash\.com\/photo-[^"']+)["'][^>]*>/gi;
      const match = pollinationsRegex.exec(htmlContent);
      const hasAIOrGenericImage = match !== null;

      if (hasAIOrGenericImage) {
        console.log(`[Detector] Found AI-generated or generic image in post. Fetching actual article image...`);
        const stockImage = await getImageForPost(post, htmlContent, originalSourceUrl);
        
        // Reset regex index
        pollinationsRegex.lastIndex = 0;

        // Replace the image source and matching caption in the HTML
        htmlContent = htmlContent.replace(pollinationsRegex, (imgTag) => {
          let newTag = imgTag.replace(/src=["'](?:https:\/\/image\.pollinations\.ai\/prompt\/[^"']+|https:\/\/images\.unsplash\.com\/photo-[^"']+)["']/i, `src="${stockImage.imageUrl}"`);
          newTag = newTag.replace(/title=["'][^"']+["']/i, `title="${post.title}"`);
          newTag = newTag.replace(/alt=["'][^"']+["']/i, `alt="${post.title} - Pitch Watch Coverage"`);
          return newTag;
        });

        // Also look for the caption block and replace it
        // Check for Alessandro Bogliari or visual recreation generated or photo representing the event coverage
        const captionPatterns = [
          /Visual recreation generated for this report by Pitch Watch AI\./gi,
          /Match action in progress at the stadium\. Photo by Alessandro Bogliari on Unsplash\./gi,
          /A cricket batsman focused at the crease\. Photo by Naveen Kumar on Unsplash\./gi,
          /The pristine outfield and pitch layout\. Photo by Sagar Kulkarni on Unsplash\./gi,
          /Stadium floodlights illuminating the field\. Photo on Unsplash\./gi,
          /Spectators cheering from the stands\. Photo on Unsplash\./gi,
          /A team gathering to discuss match tactics\. Photo on Unsplash\./gi,
          /Photo representing the event coverage\./gi
        ];

        for (const pattern of captionPatterns) {
          htmlContent = htmlContent.replace(pattern, stockImage.imageCaption);
        }

        updated = true;
      } else {
        // 2. If it does not have any image tag at all, let's add one at the top (after schema script tags if any)
        const hasAnyImage = /<img\s[^>]*src=/i.test(htmlContent);
        if (!hasAnyImage) {
          console.log(`[Detector] No image found in this post. Fetching actual article image to add at the top...`);
          const stockImage = await getImageForPost(post, htmlContent, originalSourceUrl);
          
          const embeddedImageHtml = `
            <div style="margin-bottom: 25px; text-align: center;">
              <img src="${stockImage.imageUrl}" alt="${post.title} - Pitch Watch Coverage" title="${post.title}" style="width: 100%; max-width: 850px; height: auto; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);" />
              <p style="font-size: 0.85em; color: #666; margin-top: 8px; font-style: italic;">${stockImage.imageCaption}</p>
            </div>
          `;

          // Find the end of the last schema script tag </script> if present, to insert the image right after it
          const lastScriptIndex = htmlContent.lastIndexOf('</script>');
          if (lastScriptIndex !== -1) {
            const insertPosition = lastScriptIndex + '</script>'.length;
            htmlContent = htmlContent.slice(0, insertPosition) + '\n' + embeddedImageHtml + '\n' + htmlContent.slice(insertPosition);
          } else {
            // Prepend directly
            htmlContent = embeddedImageHtml + '\n' + htmlContent;
          }
          updated = true;
        } else {
          console.log(`[Detector] Post already has a non-AI/non-generic image. Skipping image update.`);
        }
      }

      // If content was updated, write it back to Blogger
      if (updated) {
        if (isDryRun) {
          console.log(`[Dry Run] Would update post: "${post.title}" with real resolved article image.`);
        } else {
          console.log(`[Blogger] Updating post on Blogger (ID: ${post.id})...`);
          await blogger.posts.update({
            blogId: BLOG_ID,
            postId: post.id,
            requestBody: {
              title: post.title,
              content: htmlContent,
              labels: post.labels
            }
          });
          console.log(`[Blogger] Successfully updated post: "${post.title}"!`);
        }
      }
    }
    console.log(`\n======================================================`);
    console.log(`[Finished] Recent post image updates complete.`);
    console.log(`======================================================`);
  } catch (error) {
    console.error('Error updating recent posts:', error.message);
  }
}

main();
