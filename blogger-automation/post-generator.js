import fs from 'fs';
import path from 'path';
import https from 'https';
import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// ============================================================
// PITCH WATCH IMAGE POLICY
// All articles must use local images or SVG data URIs.
// lh3.googleusercontent.com/aida-public/ URLs are BANNED
// because they expire and show broken images in production.
// ============================================================

// Reusable SVG placeholders (stable, no external dependency)
const AUTHOR_AVATAR_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Ccircle cx='20' cy='20' r='20' fill='%230d1c2f'/%3E%3Ctext x='20' y='25' font-family='Arial%2C sans-serif' font-size='14' font-weight='bold' fill='%23ffffff' text-anchor='middle'%3EPW%3C/text%3E%3C/svg%3E`;

const GENERIC_CRICKET_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1280' height='720' viewBox='0 0 1280 720'%3E%3Crect width='1280' height='720' fill='%230d1c2f'/%3E%3Ccircle cx='640' cy='360' r='280' fill='none' stroke='%23006e2f' stroke-width='3' stroke-dasharray='12 6' opacity='0.6'/%3E%3Ccircle cx='640' cy='360' r='180' fill='none' stroke='%23006e2f' stroke-width='2' opacity='0.4'/%3E%3Crect x='620' y='200' width='40' height='140' fill='%23bec6e0' rx='4' opacity='0.8'/%3E%3Ctext x='640' y='160' font-family='Arial%2Csans-serif' font-size='28' font-weight='bold' fill='%23ffffff' text-anchor='middle' opacity='0.9'%3EPITCH WATCH%3C/text%3E%3Ctext x='640' y='195' font-family='Arial%2Csans-serif' font-size='13' fill='%234ae176' text-anchor='middle' letter-spacing='4'%3EHIGH-PERFORMANCE CRICKET JOURNALISM%3C/text%3E%3C/svg%3E`;

const FINANCE_AD_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='250' viewBox='0 0 400 250'%3E%3Crect width='400' height='250' fill='%230d1c2f'/%3E%3Ctext x='200' y='115' font-family='Arial%2Csans-serif' font-size='22' font-weight='bold' fill='%23006e2f' text-anchor='middle'%3ETrade Smarter%3C/text%3E%3Ctext x='200' y='145' font-family='Arial%2Csans-serif' font-size='12' fill='%23ffffff' text-anchor='middle'%3EMarkets %7C Analytics %7C Portfolio%3C/text%3E%3C/svg%3E`;

/**
 * Sanitizes HTML content to strip all lh3.googleusercontent.com/aida-public
 * AI-generated image URLs and replace with stable SVG alternatives.
 * This is a permanent policy — never allow AI image URLs in published content.
 */
function stripAIImages(html) {
  // Replace Author Avatar AI images
  html = html.replace(
    /(<img[^>]*alt="Author Avatar"[^>]*src=")https:\/\/lh3\.googleusercontent\.com\/aida-public\/[^"]*("|[^>]*>)/g,
    `$1${AUTHOR_AVATAR_SVG}$2`
  );
  // Replace Finance Ad AI images
  html = html.replace(
    /(<img[^>]*alt="Finance Ad"[^>]*src=")https:\/\/lh3\.googleusercontent\.com\/aida-public\/[^"]*("|[^>]*>)/g,
    `$1${FINANCE_AD_SVG}$2`
  );
  // Replace featured (aspect-video) AI images
  html = html.replace(
    /(<img[^>]*class="[^"]*aspect-video[^"]*"[^>]*src=")https:\/\/lh3\.googleusercontent\.com\/aida-public\/[^"]*("|[^>]*>)/g,
    `$1${GENERIC_CRICKET_SVG}$2`
  );
  // Generic catch-all: replace any remaining lh3.googleusercontent.com/aida-public URLs
  html = html.replace(
    /https:\/\/lh3\.googleusercontent\.com\/aida-public\/[A-Za-z0-9_-]+/g,
    GENERIC_CRICKET_SVG
  );
  return html;
}

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  BLOG_ID,
  GEMINI_API_KEY
} = process.env;

// Parse command line arguments
const args = process.argv.slice(2);
const getArgValue = (name) => {
  const arg = args.find(a => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : null;
};
const hasArg = (name) => args.includes(`--${name}`) || args.some(a => a.startsWith(`--${name}=`));

const isDryRun = hasArg('dry-run');
const source = getArgValue('source') || 'local'; // 'local', 'rss', or 'rss-ai'
const localFileArg = getArgValue('file');

// RSS settings
const FEED_URL = 'https://news.google.com/rss/search?q=cricket+news&hl=en-IN&gl=IN&ceid=IN:en';

function cleanText(htmlText) {
  if (!htmlText) return '';
  return htmlText
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<[^>]*>/g, '')
    .trim();
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
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
  });
}

// Scrape RSS feed
async function getRSSStories() {
  console.log('Fetching live cricket stories from RSS feed...');
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

// Generate Post content based on selected source
async function generatePostContent() {
  if (source === 'local') {
    // Post content from a local file
    if (!localFileArg) {
      throw new Error('Local source requires --file parameter (e.g. --file=../article-csk-future-plans.html)');
    }
    const filePath = path.resolve(localFileArg);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Local file not found at: ${filePath}`);
    }
    
    console.log(`Reading local HTML article from: ${filePath}`);
    const htmlContent = fs.readFileSync(filePath, 'utf8');
    
    // Extract Title
    let title = 'Automated Post';
    const titleMatch = htmlContent.match(/<title>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
      title = titleMatch[1].replace(/\s*-\s*Pitch\s*Watch/i, '').trim();
    }
    
    // Extract Article Body content
    let content = '';
    const articleMatch = htmlContent.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i);
    if (articleMatch) {
      content = articleMatch[1];
    } else {
      // Fallback: extract body content or use full content
      const bodyMatch = htmlContent.match(/<body[\s\S]*?>([\s\S]*?)<\/body>/i);
      content = bodyMatch ? bodyMatch[1] : htmlContent;
    }
    
    // Clean up unnecessary sidebars/comments/interactive scripts in extracted HTML
    content = content
      .replace(/<section[^>]*?id="comments-section"[\s\S]*?<\/section>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<blockquote[\s\S]*?>[\s\S]*?<\/blockquote>/gi, (match) => {
        // Keep blockquote but ensure proper formatting
        return match;
      });
    
    // Strip all AI image URLs (policy: no lh3.googleusercontent.com/aida-public URLs)
    content = stripAIImages(content);
      
    // Extract tags/topics
    const tags = [];
    const topicsMatch = htmlContent.match(/Topics:[\s\S]*?<\/div>/i);
    if (topicsMatch) {
      const tagRegex = /href="[^"]*">([^<]+)<\/a>/g;
      let tagMatch;
      while ((tagMatch = tagRegex.exec(topicsMatch[0])) !== null) {
        tags.push(tagMatch[1].trim());
      }
    }
    if (tags.length === 0) tags.push('Cricket');

    return { title, content, tags };
  } 
  
  if (source === 'rss') {
    // Generate a simple digest of recent cricket headlines
    const stories = await getRSSStories();
    if (stories.length === 0) {
      throw new Error('No stories discovered in RSS feed.');
    }
    
    console.log(`Generating cricket digest from ${Math.min(5, stories.length)} stories...`);
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const title = `Daily Cricket News Digest - ${dateStr}`;
    
    let content = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <p>Welcome to our daily cricket digest for ${dateStr}. Here are the top stories trending in the cricket world today:</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
    `;
    
    for (let i = 0; i < Math.min(5, stories.length); i++) {
      const story = stories[i];
      content += `
        <div style="margin-bottom: 25px;">
          <h3 style="color: #006e2f; margin-bottom: 5px;">${i + 1}. ${story.title}</h3>
          <p style="color: #666; font-size: 0.9em; margin-top: 0; margin-bottom: 8px;">Published: ${story.pubDate}</p>
          <p style="margin-bottom: 10px;">${story.description}</p>
          <a href="${story.link}" target="_blank" style="color: #0d1c2f; font-weight: bold; text-decoration: none;">Read original story &rarr;</a>
        </div>
      `;
    }
    
    content += `
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-style: italic; color: #777; font-size: 0.9em;">This digest was automatically compiled from verified news feeds by Pitch Watch.</p>
      </div>
    `;
    
    return { title, content, tags: ['Cricket', 'Digest', 'Daily News'] };
  }
  
  if (source === 'rss-ai') {
    // Get latest story from RSS feed and draft full post using Gemini
    if (!GEMINI_API_KEY) {
      throw new Error('Gemini API key is required for rss-ai mode. Please configure GEMINI_API_KEY in .env');
    }
    
    const stories = await getRSSStories();
    if (stories.length === 0) {
      throw new Error('No stories discovered in RSS feed.');
    }
    
    // Choose the first unique story
    const targetStory = stories[0];
    console.log(`Target story for AI expansion: "${targetStory.title}"`);
    
    console.log('Requesting Gemini to write an HTML blog post based on target topic...');
    const ai = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = ai.getGenerativeModel({ model: 'gemini-flash-latest' });
    
    const prompt = `
      You are a premium sports journalist writing for Pitch Watch, an analytical cricket news portal.
      Please write a comprehensive, engaging cricket news blog post about the following story:
      Title: ${targetStory.title}
      Context/Description: ${targetStory.description}
      Original link context: ${targetStory.link}
      
      Format Requirements:
      - Write only the content of the article body.
      - Output directly in HTML format.
      - Use HTML structure tags like <p>, <h2>, <h3>, <blockquote>, <ul>, <li>, etc.
      - Do NOT include <html>, <head>, or <body> tags.
      - Do NOT wrap your output in markdown code blocks like \`\`\`html or \`\`\`.
      - Start directly with the first paragraph <p> of the article.
      - The post should be 500-800 words, including background details, analytical insights, tactical breakdowns, and future expectations.
      - Write in a highly professional, engaging cricket sports journalism tone.
      - Inject a fictionalized or realistic expert quote block (<blockquote>) relevant to the topic.
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
    const content = result.response.text();
    
    // Clean up title (remove trailing publisher names like "- ESPNcricinfo")
    const title = targetStory.title.replace(/\s*-\s*[^-]+$/, '').trim();
    
    // Extract keywords as tags
    const tags = ['Cricket', 'Cricket News', 'Analysis'];
    if (title.toLowerCase().includes('ipl')) tags.push('IPL');
    if (title.toLowerCase().includes('t20')) tags.push('T20');
    if (title.toLowerCase().includes('india')) tags.push('Team India');
    
    return { title, content, tags };
  }
  
  throw new Error(`Unsupported source: ${source}`);
}

async function main() {
  console.log('======================================================');
  console.log('               Pitch Watch Blogger Deployer           ');
  console.log('======================================================\n');
  
  try {
    // Generate/fetch the post contents
    const { title, content, tags } = await generatePostContent();
    
    console.log(`\n------------------------------------------------------`);
    console.log(`Generated Post Title: ${title}`);
    console.log(`Tags: ${tags.join(', ')}`);
    console.log(`Content Size: ${Buffer.byteLength(content, 'utf8')} bytes`);
    console.log(`------------------------------------------------------\n`);
    
    if (isDryRun) {
      console.log('=== DRY RUN MODE: Generated HTML Preview ===');
      console.log(content.slice(0, 1500) + (content.length > 1500 ? '\n... [TRUNCATED] ...' : ''));
      console.log('============================================');
      console.log('\nDry run finished. No post was uploaded.');
      return;
    }
    
    // Setup OAuth2 Client
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI || !BLOG_ID) {
      throw new Error('Missing required Blogger variables (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, BLOG_ID) in .env');
    }
    
    const tokenPath = path.resolve('tokens.json');
    if (!fs.existsSync(tokenPath)) {
      throw new Error(`Authentication token file not found at: ${tokenPath}. Please run 'npm run auth' first.`);
    }
    
    const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    
    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );
    
    oauth2Client.setCredentials(tokens);
    
    // Listen for refreshed tokens and save them
    oauth2Client.on('tokens', (newTokens) => {
      const currentTokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      const updatedTokens = { ...currentTokens, ...newTokens };
      fs.writeFileSync(tokenPath, JSON.stringify(updatedTokens, null, 2));
      console.log('Saved newly refreshed authorization tokens to tokens.json.');
    });
    
    // Initialize Blogger client
    const blogger = google.blogger({
      version: 'v3',
      auth: oauth2Client
    });
    
    console.log(`Uploading post to Blog ID: ${BLOG_ID}...`);
    
    const response = await blogger.posts.insert({
      blogId: BLOG_ID,
      requestBody: {
        title: title,
        content: content,
        labels: tags,
        // Publish as draft first by default to allow review, or set to published
        // Let's set draft to false (published immediately) or true. Draft true is safer for automation, but let's make it published directly or allow configuration.
        // Let's publish immediately as draft: false.
        status: 'LIVE'
      },
      isDraft: false
    });
    
    console.log(`\n🎉 Success! Post uploaded successfully.`);
    console.log(`Post ID:   ${response.data.id}`);
    console.log(`Post URL:  ${response.data.url}`);
    
  } catch (error) {
    console.error('\n❌ Error during post automation:');
    console.error(error.message);
    if (error.stack) {
      // Print first few lines of stack trace
      console.error(error.stack.split('\n').slice(0, 4).join('\n'));
    }
    process.exit(1);
  }
}

main();
