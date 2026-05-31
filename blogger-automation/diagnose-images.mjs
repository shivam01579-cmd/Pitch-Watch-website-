/**
 * Quick diagnosis + targeted fix for specific posts
 */
import dotenv from 'dotenv';
import { google } from 'googleapis';
import fs from 'fs';
dotenv.config();

const tokens = JSON.parse(fs.readFileSync('tokens.json','utf8'));
const auth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);
auth.setCredentials(tokens);
auth.on('tokens', (t) => {
  fs.writeFileSync('tokens.json', JSON.stringify({...tokens,...t},null,2));
});
const blogger = google.blogger({version:'v3',auth});

const res = await blogger.posts.list({
  blogId: process.env.BLOG_ID,
  maxResults: 50,
  fetchBodies: true,
  fields: 'items(id,title,url,content)'
});

const posts = res.data.items || [];
console.log(`Total posts: ${posts.length}\n`);

for (const p of posts) {
  // Extract first img src
  const imgMatch = (p.content || '').match(/<img[^>]+src="([^"]+)"/i) ||
                   (p.content || '').match(/<img[^>]+src='([^']+)'/i);
  const imgUrl = imgMatch ? imgMatch[1] : 'NO IMAGE';
  const shortUrl = p.url ? p.url.split('/').pop() : '';
  
  console.log(`[${shortUrl.slice(0,45)}]`);
  console.log(`  Title: ${p.title?.slice(0,60)}`);
  console.log(`  Image: ${imgUrl.slice(0,90)}`);
  console.log('');
}
