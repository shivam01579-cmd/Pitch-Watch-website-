import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, BLOG_ID } = process.env;

async function main() {
  const tokenPath = path.resolve('tokens.json');
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

  console.log('Fetching all pages from Blogger...');
  try {
    const res = await blogger.pages.list({
      blogId: BLOG_ID,
      status: 'LIVE'
    });
    const pages = res.data.items || [];
    console.log(`\nFound ${pages.length} published page(s):`);
    for (const page of pages) {
      console.log(`- Title: "${page.title}"`);
      console.log(`  URL: ${page.url}`);
    }
  } catch (err) {
    console.error('Error listing pages:', err.message);
  }
}

main();
