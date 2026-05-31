import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config({ path: '../blogger-automation/.env' });

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, BLOG_ID } = process.env;

async function main() {
  const tokenPath = path.resolve('../blogger-automation/tokens.json');
  if (!fs.existsSync(tokenPath)) {
    console.error('tokens.json not found');
    process.exit(1);
  }
  const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));

  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials(tokens);

  const blogger = google.blogger({ version: 'v3', auth: oauth2Client });

  console.log('Fetching last 50 posts from Blogger...');
  const res = await blogger.posts.list({
    blogId: BLOG_ID,
    maxResults: 50,
    status: 'LIVE'
  });

  const posts = res.data.items || [];
  console.log(`Found ${posts.length} posts.\n`);
  for (const post of posts) {
    console.log(`- Title: "${post.title}"`);
    console.log(`  ID: ${post.id}`);
    console.log(`  Published: ${post.published}`);
    console.log(`  URL: ${post.url}`);
    console.log('------------------------------------------------');
  }
}

main();
