import fs from 'fs';
import http from 'http';
import url from 'url';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import { exec } from 'child_process';

// Load environment variables
dotenv.config();

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
  console.error('Error: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI must be configured in .env');
  process.exit(1);
}

// Initialize OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

// Define scopes
const SCOPES = [
  'https://www.googleapis.com/auth/blogger',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/indexing'
];

// Generate authentication URL
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline', // Required to get a refresh token
  scope: SCOPES,
  prompt: 'consent' // Forces consent screen to always get a refresh token
});

// Setup a local server to handle redirect callback
const PORT = 3000;
const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/oauth2callback')) {
      const q = url.parse(req.url, true).query;
      if (q.error) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Authentication error: ${q.error}`);
        console.error(`Authorization error: ${q.error}`);
        server.close();
        process.exit(1);
      }

      if (q.code) {
        // Exchange authorization code for access and refresh tokens
        const { tokens } = await oauth2Client.getToken(q.code);
        
        // Write tokens to file
        fs.writeFileSync('tokens.json', JSON.stringify(tokens, null, 2));
        
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding-top: 50px; background-color: #f4f6f9;">
              <div style="display: inline-block; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <h1 style="color: #2bba58;">Authentication Successful!</h1>
                <p style="font-size: 16px; color: #555;">Tokens have been saved to <strong>tokens.json</strong>. You can now close this tab.</p>
              </div>
            </body>
          </html>
        `);
        console.log('\nToken exchange successful! Saved tokens to tokens.json');
        
        server.close(() => {
          console.log('Local server stopped.');
          process.exit(0);
        });
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  } catch (error) {
    console.error('Error processing request:', error);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`Blogger Authentication Service is running on port ${PORT}`);
  console.log(`======================================================\n`);
  console.log(`Please visit the following URL to authenticate your Blogger account:\n`);
  console.log(`\x1b[36m%s\x1b[0m`, authUrl);
  console.log(`\nWaiting for authorization response...`);

  // Attempt to open the URL automatically in the default browser
  const startCmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${startCmd} "${authUrl.replace(/&/g, '^&')}"`, (err) => {
    if (err) {
      console.log('(Please manually copy and paste the link above into your browser if it didn\'t open automatically)');
    }
  });
});
