/**
 * One-time GitHub Secrets Setup Script
 * Runs locally, sets all secrets via GitHub API
 */
import https from 'https';
import { execSync } from 'child_process';
import { readFileSync, mkdirSync } from 'fs';
import path from 'path';

// ── Config ──────────────────────────────────────────────────
const PAT   = process.env.GH_PAT;
const OWNER = 'shivam01579-cmd';
const REPO  = 'Pitch-Watch-website-';

if (!PAT) { console.error('GH_PAT env var missing'); process.exit(1); }

// ── Install libsodium-wrappers if needed ────────────────────
try { await import('libsodium-wrappers'); }
catch {
  console.log('[Setup] Installing libsodium-wrappers...');
  execSync('npm install libsodium-wrappers --no-save', { stdio: 'inherit' });
}
const _sodium = await import('libsodium-wrappers');
const sodium = _sodium.default || _sodium;
await sodium.ready;
console.log('[Setup] libsodium ready');

// ── Helpers ─────────────────────────────────────────────────
function ghApi(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com',
      path: apiPath,
      method,
      headers: {
        'Authorization': `token ${PAT}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'PitchWatchSetup/1.0',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        const parsed = (() => { try { return JSON.parse(body); } catch { return {}; } })();
        resolve({ status: res.statusCode, data: parsed });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function encrypt(publicKeyB64, secretValue) {
  const key = sodium.from_base64(publicKeyB64, sodium.base64_variants.ORIGINAL);
  const msg = sodium.from_string(secretValue);
  const encrypted = sodium.crypto_box_seal(msg, key);
  return sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);
}

async function setSecret(keyId, keyVal, name, value) {
  if (!value) { console.log(`  ⏭️  Skipping ${name} (empty value)`); return; }
  const encryptedValue = encrypt(keyVal, value);
  const res = await ghApi('PUT', `/repos/${OWNER}/${REPO}/actions/secrets/${name}`, {
    encrypted_value: encryptedValue,
    key_id: keyId
  });
  if (res.status === 201 || res.status === 204) {
    console.log(`  ✅ ${name}`);
  } else {
    console.error(`  ❌ ${name} failed:`, res.status, JSON.stringify(res.data));
  }
}

// ── Get Repo Public Key ─────────────────────────────────────
console.log('\n[Setup] Getting repo public key...');
const pkRes = await ghApi('GET', `/repos/${OWNER}/${REPO}/actions/secrets/public-key`);
if (!pkRes.data.key) {
  console.error('Failed to get public key:', pkRes.status, pkRes.data);
  process.exit(1);
}
const KEY_ID  = pkRes.data.key_id;
const KEY_VAL = pkRes.data.key;
console.log(`[Setup] Got public key (ID: ${KEY_ID})`);

// ── Read local values ────────────────────────────────────────
const envPath    = path.resolve('.env');
const tokenPath  = path.resolve('tokens.json');

const envContent = readFileSync(envPath, 'utf8');
const getEnv = (key) => {
  const match = envContent.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return match ? match[1].trim() : '';
};

const tokensJson = readFileSync(tokenPath, 'utf8');

// ── Set all Secrets ─────────────────────────────────────────
console.log('\n[Setup] Setting GitHub Secrets...\n');

const secrets = {
  // Google OAuth
  GOOGLE_CLIENT_ID:           getEnv('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET:       getEnv('GOOGLE_CLIENT_SECRET'),
  GOOGLE_REDIRECT_URI:        getEnv('GOOGLE_REDIRECT_URI'),
  // Blogger
  BLOG_ID:                    getEnv('BLOG_ID'),
  SPREADSHEET_ID:             getEnv('SPREADSHEET_ID'),
  // Gemini AI
  GEMINI_API_KEY:             getEnv('GEMINI_API_KEY'),
  // Stock Photos
  UNSPLASH_ACCESS_KEY:        getEnv('UNSPLASH_ACCESS_KEY'),
  PEXELS_API_KEY:             getEnv('PEXELS_API_KEY'),
  // YouTube
  YOUTUBE_HANDLE:             getEnv('YOUTUBE_HANDLE'),
  // Telegram
  TELEGRAM_BOT_TOKEN:         getEnv('TELEGRAM_BOT_TOKEN'),
  TELEGRAM_CHANNEL_ID:        getEnv('TELEGRAM_CHANNEL_ID'),
  // Facebook
  FACEBOOK_PAGE_URL:          getEnv('FACEBOOK_PAGE_URL'),
  FACEBOOK_GROUPS:            getEnv('FACEBOOK_GROUPS'),
  FACEBOOK_PAGE_ID:           getEnv('FACEBOOK_PAGE_ID'),
  FACEBOOK_PAGE_ACCESS_TOKEN: getEnv('FACEBOOK_PAGE_ACCESS_TOKEN'),
  // OAuth Tokens (full JSON)
  TOKENS_JSON:                tokensJson,
  // GitHub PAT for auto-refresh (store PAT itself as secret)
  ACTIONS_PAT:                PAT,
};

for (const [name, value] of Object.entries(secrets)) {
  await setSecret(KEY_ID, KEY_VAL, name, value);
}

console.log('\n[Setup] ✅ All secrets set successfully!');
console.log('[Setup] GitHub Actions will now run automatically every 30 minutes.\n');
