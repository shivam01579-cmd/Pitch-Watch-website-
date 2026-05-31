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
  PEXELS_API_KEY
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

const loopIntervalMs = parseInt(getFlagValue('interval'), 10) * 60 * 1000 || 10 * 60 * 1000; // default 10 minutes

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
            caption: `Photo representing the event coverage${photographer} on Unsplash.`
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
            caption: `Photo representing the event coverage${photographer} on Pexels.`
          };
        }
      }
    } catch (err) {
      console.warn('[Stock Image] Pexels API search failed:', err.message);
    }
  }

  // 3. Fallback to Curated Cricket Images
  console.log('[Stock Image] Falling back to curated high-quality cricket stock images...');
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
      model: 'gemini-2.5-flash',
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
      2. "metaDescription": String (SEO meta description, STRICTLY between 140 and 155 characters max. Do not exceed 155 characters. Must naturally contain the focus keyword).
      3. "urlSlug": String (Clean, keyword-rich URL slug without slashes or spaces, e.g. "ipl-2026-csk-vs-mi-prediction").
      4. "primaryKeyword": String (The chosen focus keyword).
      5. "tags": Array of Strings (3-5 relevant tags. CRITICAL: If the post is related to IPL, include "IPL". If it is related to T20 matches or tournaments, include "T20". If it is related to ODI matches, include "ODI". If it is related to Test matches, include "Test Match". If related to Team India, include "Team India").
      6. "articleBodyHtml": String (The complete article body in HTML format. Must be 800-1200 words. Do not include H1 tags. Use <h2> and <h3> for headings. Use <p>, <ul>, <li>, and <blockquote> for quotes. You MUST naturally interlink 2 to 4 of the provided older articles from the list above inside the body paragraphs using appropriate HTML anchor tags. Include a "Related Articles" section at the end of the post using these links).
      7. "featuredSummary": String (A 50-70 word concise summary ideal for featured snippets/answers, placing the focus keyword).
      8. "socialCaptions": Object with keys "facebook", "twitter", "telegram", "whatsapp" (Engaging, platform-tailored social media captions).
      9. "faq": Array of Objects, each with "question" (String) and "answer" (String) (2-3 frequently asked questions with direct, clear answers).
      10. "suggestedFutureTopics": Array of Strings (5-10 related future article ideas to build topical authority).
      11. "oldPostToUpdate": Object with keys:
          - "index": Number or null (The index of the old post from the list above that is most relevant to link to this new post. If none are relevant, return null).
          - "recommendationText": String or null (A short, natural paragraph with an HTML link recommending this new post. Use placeholder "__NEW_POST_URL__" for the URL and "__NEW_POST_TITLE__" for the title. Example: "<p><strong>Also Read:</strong> For more details, check out our report on <a href=\\"__NEW_POST_URL__\\">__NEW_POST_TITLE__</a>.</p>").
          
      Guidelines to Bypass AI Detection & sound Human:
      - Vary sentence length and structure (burstiness).
      - Use rich cricket slang and terms naturally (e.g. "powerplay", "death overs", "seam movement", "tactical shift").
      - Absolutely AVOID AI buzzwords: "moreover", "delve", "testament", "notably", "demystify", "furthermore", "in conclusion", "it is worth noting", "cradle", "tapestry", "landscape".
      - Verify the keyword is naturally placed in the title, first paragraph, at least one H2 heading, meta description, and slug.
    `;
    
    const result = await model.generateContent(prompt);
    let responseJsonText = result.response.text().trim();
    
    // Clean any accidental markdown codeblock fences from AI output
    if (responseJsonText.startsWith('```')) {
      responseJsonText = responseJsonText.replace(/^```json\s*/i, '').replace(/```\s*$/g, '');
    }
    
    const seoData = JSON.parse(responseJsonText);
    console.log('[Gemini] Parsed SEO and Article content successfully.');
    console.log(`[SEO] Focus Keyword: "${seoData.primaryKeyword}"`);
    console.log(`[SEO] Title: "${seoData.seoTitle}" (${seoData.seoTitle.length} chars)`);
    console.log(`[SEO] Description: "${seoData.metaDescription}" (${seoData.metaDescription.length} chars)`);
    console.log(`[SEO] Slug: "${seoData.urlSlug}"`);
    console.log(`[SEO] Tags: ${seoData.tags.join(', ')}`);
    
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
            imageCaption = `Photo representing the event coverage. Source: ${realArticleLink.replace(/https?:\/\/(www\.)?/, '').split('/')[0]}`;
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
        // Ultimate fallback to stadium under lights
        imageUrl = 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=850&auto=format&fit=crop&q=80';
        imageCaption = 'General cricket stadium photo by Alessandro Bogliari on Unsplash.';
      }
    }
    
    // 4. Build post HTML with image, body, EEAT, and Schema JSON-LD
    const embeddedImageHtml = `
      <div style="margin-bottom: 25px; text-align: center;">
        <img src="${imageUrl}" alt="${seoData.seoTitle} - Pitch Watch Coverage" title="${seoData.seoTitle}" style="width: 100%; max-width: 850px; height: auto; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);" />
        <p style="font-size: 0.85em; color: #666; margin-top: 8px; font-style: italic;">${imageCaption}</p>
      </div>
    `;
    
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
    
    const finalHtmlContent = schemaHtml + embeddedImageHtml + seoData.articleBodyHtml + eeatHtml;
    
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

    console.log(`[Blogger] Publishing live post: "${seoData.seoTitle}"...`);
    const bloggerResponse = await bloggerClient.posts.insert({
      blogId: BLOG_ID,
      requestBody: {
        title: seoData.seoTitle,
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
      "name": seoData.seoTitle,
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

// Master Loop Orchestrator
async function startAutomationLoop() {
  console.log(`[Workflow] Starting continuous automation loop.`);
  console.log(`[Workflow] Discovering and posting checks will trigger every ${loopIntervalMs / 60000} minute(s).`);
  
  // Run first step immediately
  await runWorkflowStep();
  
  // Setup interval loop
  setInterval(async () => {
    await runWorkflowStep();
  }, loopIntervalMs);
}

// Main Execution router
async function main() {
  try {
    // 1. Initialize Clients
    initGoogleClients();
    
    if (discoverMode) {
      // Run only discover mode
      await discoverAndQueueNews();
    } else if (processMode) {
      // Process one pending topic
      await processNextPendingTopic();
    } else if (loopMode) {
      // Start loop mode
      await startAutomationLoop();
    } else {
      // Default: run one complete step of discover + process
      await runWorkflowStep();
    }
  } catch (err) {
    console.error('Fatal execution error:', err.message);
    process.exit(1);
  }
}

main();
