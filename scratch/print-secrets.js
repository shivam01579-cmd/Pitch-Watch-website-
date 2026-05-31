import fs from 'fs';
import path from 'path';

// Load env and tokens from blogger-automation directory
const envPath = path.resolve('../blogger-automation/.env');
const tokensPath = path.resolve('../blogger-automation/tokens.json');

if (!fs.existsSync(envPath)) {
  console.error(`Error: .env not found at ${envPath}`);
  process.exit(1);
}

// Simple manual parser for .env lines
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split(/\r?\n/).forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const delimiterIndex = trimmed.indexOf('=');
    if (delimiterIndex !== -1) {
      const key = trimmed.substring(0, delimiterIndex).trim();
      const val = trimmed.substring(delimiterIndex + 1).trim();
      envVars[key] = val;
    }
  }
});

const secretsToPrint = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'BLOG_ID',
  'SPREADSHEET_ID',
  'GEMINI_API_KEY'
];

console.log('\n======================================================');
console.log('📋 GITHUB SECRETS COPY-PASTE UTILITY');
console.log('======================================================\n');
console.log('Please copy and paste these into your GitHub repository settings:');
console.log('Settings -> Secrets and variables -> Actions -> New repository secret\n');

for (const secret of secretsToPrint) {
  const val = envVars[secret];
  if (val) {
    console.log(`🔑 Name:  ${secret}`);
    console.log(`   Value: ${val}\n`);
    console.log('------------------------------------------------------');
  } else {
    console.warn(`⚠️ Warning: ${secret} is not defined in your .env file.\n`);
  }
}

if (fs.existsSync(tokensPath)) {
  try {
    const tokensContent = fs.readFileSync(tokensPath, 'utf8');
    const tokensCompact = JSON.stringify(JSON.parse(tokensContent));
    console.log(`🔑 Name:  TOKENS_JSON`);
    console.log(`   Value: ${tokensCompact}\n`);
    console.log('------------------------------------------------------');
  } catch (err) {
    console.error(`Error reading tokens.json: ${err.message}`);
  }
} else {
  console.warn(`⚠️ Warning: tokens.json was not found at ${tokensPath}.\n`);
}

console.log('All secrets retrieved successfully.');
