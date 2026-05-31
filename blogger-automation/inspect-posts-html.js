import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  BLOG_ID
} = process.env;

async function main() {
  const tokenPath = path.resolve('tokens.json');
  const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));

  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials(tokens);

  const blogger = google.blogger({ version: 'v3', auth: oauth2Client });
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    const listResponse = await blogger.posts.list({
      blogId: BLOG_ID,
      startDate: twentyFourHoursAgo,
      status: 'LIVE',
      maxResults: 15
    });

    const posts = listResponse.data.items || [];
    console.log(`Found ${posts.length} posts.`);

    for (const post of posts) {
      console.log(`\n======================================================`);
      console.log(`Title: "${post.title}"`);
      
      const htmlContent = post.content || '';
      console.log("HTML length:", htmlContent.length);

      // Search for any anchor links in the post
      const aHrefRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match;
      const links = [];
      while ((match = aHrefRegex.exec(htmlContent)) !== null) {
        links.push({ href: match[1], text: match[2] });
      }
      console.log("Anchor links found in post:", links);
    }
  } catch (err) {
    console.error(err);
  }
}

main();
