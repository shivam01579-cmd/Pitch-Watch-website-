import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, BLOG_ID } = process.env;
const CONTACT_PAGE_ID = '3310684528882106169';

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

  console.log(`Fetching existing contact page content (ID: ${CONTACT_PAGE_ID})...`);
  try {
    const pageRes = await blogger.pages.get({
      blogId: BLOG_ID,
      pageId: CONTACT_PAGE_ID
    });
    
    let htmlContent = pageRes.data.content || '';
    
    // Replace dummy email with real email
    const dummyEmail = 'pitchwatchofficial@gmail.com';
    const realEmail = 'Shivam01579@gmail.com';
    
    if (htmlContent.includes(dummyEmail)) {
      console.log(`Found dummy email "${dummyEmail}". Replacing with "${realEmail}"...`);
      htmlContent = htmlContent.replace(new RegExp(dummyEmail, 'g'), realEmail);
      
      // Update page
      console.log('Saving updated Contact page on Blogger...');
      const updateRes = await blogger.pages.update({
        blogId: BLOG_ID,
        pageId: CONTACT_PAGE_ID,
        requestBody: {
          title: pageRes.data.title,
          content: htmlContent
        }
      });
      console.log(`\n🎉 Successfully updated the Contact page!`);
      console.log(`URL: ${updateRes.data.url}`);
    } else {
      console.log('Dummy email not found in the Contact page content. Already updated?');
    }
  } catch (err) {
    console.error('Error updating Contact page:', err.message);
  }
}

main();
