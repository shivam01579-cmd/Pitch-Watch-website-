import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, BLOG_ID } = process.env;

const PRIVACY_HTML = `
<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #006e2f; border-bottom: 2px solid #006e2f; padding-bottom: 10px;">Privacy Policy</h1>
  <p style="font-size: 0.95em; color: #666;">Last Updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

  <p>At <strong>Pitch Watch</strong>, accessible from <a href="https://crickettrendsnews.blogspot.com/" style="color: #006e2f;">crickettrendsnews.blogspot.com</a>, one of our main priorities is the privacy of our visitors. This Privacy Policy document contains types of information that is collected and recorded by Pitch Watch and how we use it.</p>

  <h2 style="color: #0d1c2f; margin-top: 25px;">1. Log Files</h2>
  <p>Pitch Watch follows a standard procedure of using log files. These files log visitors when they visit websites. The information collected by log files includes internet protocol (IP) addresses, browser type, Internet Service Provider (ISP), date and time stamp, referring/exit pages, and possibly the number of clicks. These are not linked to any information that is personally identifiable. The purpose of the information is for analyzing trends, administering the site, tracking users' movement on the website, and gathering demographic information.</p>

  <h2 style="color: #0d1c2f; margin-top: 25px;">2. Cookies and Web Beacons</h2>
  <p>Like any other website, Pitch Watch uses "cookies". These cookies are used to store information including visitors' preferences, and the pages on the website that the visitor accessed or visited. The information is used to optimize the users' experience by customizing our web page content based on visitors' browser type and/or other information.</p>

  <h2 style="color: #0d1c2f; margin-top: 25px;">3. Google DoubleClick DART Cookie</h2>
  <p>Google is one of the third-party vendors on our site. It also uses cookies, known as DART cookies, to serve ads to our site visitors based upon their visit to our site and other sites on the internet. However, visitors may choose to decline the use of DART cookies by visiting the Google ad and content network Privacy Policy at the following URL – <a href="https://policies.google.com/technologies/ads" target="_blank" style="color: #006e2f;">https://policies.google.com/technologies/ads</a></p>

  <h2 style="color: #0d1c2f; margin-top: 25px;">4. Advertising Partners Privacy Policies</h2>
  <p>Third-party ad servers or ad networks use technologies like cookies, JavaScript, or Web Beacons that are used in their respective advertisements and links that appear on Pitch Watch, which are sent directly to users' browsers. They automatically receive your IP address when this occurs. These technologies are used to measure the effectiveness of their advertising campaigns and/or to personalize the advertising content that you see on websites that you visit.</p>
  <p>Note that Pitch Watch has no access to or control over these cookies that are used by third-party advertisers.</p>

  <h2 style="color: #0d1c2f; margin-top: 25px;">5. Third Party Privacy Policies</h2>
  <p>Pitch Watch's Privacy Policy does not apply to other advertisers or websites. Thus, we are advising you to consult the respective Privacy Policies of these third-party ad servers for more detailed information. It may include their practices and instructions about how to opt-out of certain options.</p>
  <p>You can choose to disable cookies through your individual browser options. To know more detailed information about cookie management with specific web browsers, it can be found at the browsers' respective websites.</p>

  <h2 style="color: #0d1c2f; margin-top: 25px;">6. Children's Information</h2>
  <p>Another part of our priority is adding protection for children while using the internet. We encourage parents and guardians to observe, participate in, and/or monitor and guide their online activity.</p>
  <p>Pitch Watch does not knowingly collect any Personal Identifiable Information from children under the age of 13. If you think that your child provided this kind of information on our website, we strongly encourage you to contact us immediately and we will do our best efforts to promptly remove such information from our records.</p>

  <h2 style="color: #0d1c2f; margin-top: 25px;">7. Consent</h2>
  <p>By using our website, you hereby consent to our Privacy Policy and agree to its terms.</p>

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

  console.log('Publishing Privacy Policy page to Blogger...');
  try {
    const res = await blogger.pages.insert({
      blogId: BLOG_ID,
      requestBody: {
        title: 'Privacy Policy',
        content: PRIVACY_HTML
      }
    });
    console.log(`\n🎉 Successfully created and published Privacy Policy page!`);
    console.log(`Page ID: ${res.data.id}`);
    console.log(`Page URL: ${res.data.url}`);
  } catch (err) {
    console.error('Error creating page:', err.message);
  }
}

main();
