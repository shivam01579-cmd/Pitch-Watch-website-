import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;

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

  console.log('Fetching all blogs for this user...');
  try {
    const res = await blogger.blogs.listByUser({
      userId: 'self'
    });
    const blogs = res.data.items || [];
    console.log(`Found ${blogs.length} blog(s):`);
    for (const blog of blogs) {
      console.log(`- Title: "${blog.name}"`);
      console.log(`  ID: ${blog.id}`);
      console.log(`  URL: ${blog.url}`);
      console.log('------------------------------------------------');
    }
  } catch (err) {
    console.error('Error listing blogs:', err.message);
  }
}

main();
