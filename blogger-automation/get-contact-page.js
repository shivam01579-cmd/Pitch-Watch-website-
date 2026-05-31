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

  console.log('Fetching list of pages to find the Contact page...');
  try {
    const listRes = await blogger.pages.list({
      blogId: BLOG_ID
    });
    const pages = listRes.data.items || [];
    const contactPage = pages.find(p => p.title.toLowerCase().includes('contact'));
    
    if (contactPage) {
      console.log(`Found Contact page (ID: ${contactPage.id})`);
      console.log('--- Content Start ---');
      console.log(contactPage.content);
      console.log('--- Content End ---');
    } else {
      console.log('Contact page not found.');
    }
  } catch (err) {
    console.error('Error fetching contact page:', err.message);
  }
}

main();
