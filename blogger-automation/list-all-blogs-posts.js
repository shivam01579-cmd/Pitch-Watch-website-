import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;

const BLOGS = [
  { name: "Cricket News (crickettrendsnews)", id: "3620444013331692896" },
  { name: "FMGE PYQS (pulseprep)", id: "7468301750376491191" },
  { name: "All government jobs alert (ftshivamtech)", id: "8784049303855618628" }
];

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

  for (const blog of BLOGS) {
    console.log(`\n======================================================`);
    console.log(`Checking blog: "${blog.name}" (ID: ${blog.id})`);
    console.log(`======================================================`);
    try {
      const res = await blogger.posts.list({
        blogId: blog.id,
        maxResults: 20,
        status: 'LIVE'
      });
      const posts = res.data.items || [];
      console.log(`Found ${posts.length} live posts:`);
      for (const post of posts) {
        console.log(`- "${post.title}" (Published: ${post.published})`);
      }
    } catch (err) {
      console.error(`Error fetching posts for ${blog.name}:`, err.message);
    }
  }
}

main();
