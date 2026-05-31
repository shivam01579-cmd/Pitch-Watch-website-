import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, BLOG_ID } = process.env;

const TERMS_HTML = `
<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #006e2f; border-bottom: 2px solid #006e2f; padding-bottom: 10px;">Terms and Conditions</h1>
  <p style="font-size: 0.95em; color: #666;">Last Updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
  
  <p>Welcome to <strong>Pitch Watch</strong> (accessible via <a href="https://crickettrendsnews.blogspot.com/" style="color: #006e2f;">crickettrendsnews.blogspot.com</a>). These Terms and Conditions govern your use of our website. By accessing or using this website, you agree to comply with and be bound by these terms.</p>

  <h2 style="color: #0d1c2f; margin-top: 25px;">1. Intellectual Property</h2>
  <p>All content published on Pitch Watch, including articles, text, site layout, graphics, logos, and software, is the property of Pitch Watch or its content creators and is protected by applicable copyright and trademark laws. You may not reproduce, distribute, or publish any material from this site without our prior written consent.</p>

  <h2 style="color: #0d1c2f; margin-top: 25px;">2. User Conduct</h2>
  <p>By using our website, you agree that you will not:</p>
  <ul>
    <li>Use the website in any way that violates local, national, or international laws.</li>
    <li>Post or transmit any unauthorized advertising, spam, or promotional materials.</li>
    <li>Attempt to interfere with the proper working of the website or bypass any security measures.</li>
    <li>Post defamatory, abusive, offensive, or otherwise objectionable comments.</li>
  </ul>

  <h2 style="color: #0d1c2f; margin-top: 25px;">3. Disclaimer of Liability</h2>
  <p>The information provided on Pitch Watch is for general informational and entertainment purposes only. While we strive to publish accurate and up-to-date cricket news, analysis, and statistics, we make no representations or warranties of any kind about the completeness, accuracy, or reliability of the information. Any reliance you place on such information is strictly at your own risk.</p>

  <h2 style="color: #0d1c2f; margin-top: 25px;">4. Third-Party Links</h2>
  <p>Our articles may contain links to external third-party websites (such as news outlets, social media platforms, or statistics databases) for reference. We have no control over the content, privacy policies, or practices of these external websites and accept no responsibility for them.</p>

  <h2 style="color: #0d1c2f; margin-top: 25px;">5. Changes to These Terms</h2>
  <p>We reserve the right to revise and update these Terms and Conditions at any time without prior notice. By continuing to use the website after changes are posted, you agree to be bound by the revised terms.</p>

  <h2 style="color: #0d1c2f; margin-top: 25px;">6. Contact Us</h2>
  <p>If you have any questions or concerns regarding these Terms and Conditions, please feel free to reach out to us through our contact channels or via email.</p>
  
  <hr style="border: 0; border-top: 1px solid #eee; margin-top: 30px;" />
  <p style="font-size: 0.85em; color: #777; font-style: italic; text-align: center;">Pitch Watch - High-Performance Cricket Journalism</p>
</div>
`;

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

  console.log('Publishing Terms and Conditions page to Blogger...');
  try {
    const res = await blogger.pages.insert({
      blogId: BLOG_ID,
      requestBody: {
        title: 'Terms and Conditions',
        content: TERMS_HTML
      }
    });
    console.log(`\n🎉 Successfully created and published Terms and Conditions page!`);
    console.log(`Page ID: ${res.data.id}`);
    console.log(`Page URL: ${res.data.url}`);
  } catch (err) {
    console.error('Error creating page:', err.message);
  }
}

main();
