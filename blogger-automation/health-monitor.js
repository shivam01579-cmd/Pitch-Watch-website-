/**
 * Pitch Watch — Self-Healing Health Monitor
 * ==========================================
 * Yeh script Windows Task Scheduler se har 2 ghante run hoti hai.
 * Checks karta hai:
 *   1. Telegram Bot API reachable hai ya nahi
 *   2. Google Sheets accessible hai ya nahi
 *   3. Blogger API accessible hai ya nahi
 *   4. tokens.json valid aur not-expired hai ya nahi
 *   5. Pichle run se koi naya post hua ya nahi (queue stuck check)
 * Agar koi problem ho toh Telegram pe alert bhejega.
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHANNEL_ID,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  SPREADSHEET_ID,
  BLOG_ID,
  ACTIONS_PAT
} = process.env;

// ─── Helpers ────────────────────────────────────────────────────────────────

function httpsPost(url, payload, headers = {}) {
  return new Promise((resolve) => {
    const data = JSON.stringify(payload);
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + (urlObj.search || ''),
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': 'PitchWatch/1.0',
        ...headers 
      }
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, data: JSON.parse(body) }); }
        catch { resolve({ ok: false, data: {} }); }
      });
    });
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.write(data);
    req.end();
  });
}

function httpsGet(url, headers = {}) {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    https.get({ 
      hostname: urlObj.hostname, 
      path: urlObj.pathname + (urlObj.search || ''),
      headers: { 'User-Agent': 'PitchWatch/1.0', ...headers }
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, statusCode: res.statusCode, body }));
    }).on('error', (err) => resolve({ ok: false, error: err.message }));
  });
}

async function sendTelegramAlert(message, isError = true) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID) {
    console.warn('[Monitor] Telegram credentials missing — cannot send alert!');
    return;
  }
  const emoji = isError ? '🚨' : '✅';
  const text = `${emoji} <b>Pitch Watch Monitor</b>\n\n${message}\n\n🕐 Time: ${new Date().toLocaleString('en-IN')}`;
  const result = await httpsPost(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    { chat_id: TELEGRAM_CHANNEL_ID, text, parse_mode: 'HTML', disable_web_page_preview: true }
  );
  if (result.ok && result.data?.ok) {
    console.log(`[Monitor] Alert sent to Telegram: "${text.slice(0, 80)}..."`);
  } else {
    console.warn('[Monitor] Could not send Telegram alert!', JSON.stringify(result.data));
  }
}

// ─── Health Checks ──────────────────────────────────────────────────────────

async function checkTelegramBot() {
  console.log('[Monitor] Checking Telegram Bot API...');
  if (!TELEGRAM_BOT_TOKEN) return { ok: false, message: 'TELEGRAM_BOT_TOKEN missing in .env' };
  const res = await httpsGet(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`);
  if (res.ok) {
    const data = (() => { try { return JSON.parse(res.body); } catch { return {}; } })();
    if (data.ok) {
      console.log(`[Monitor] ✅ Telegram Bot OK: @${data.result?.username}`);
      return { ok: true };
    }
  }
  return { ok: false, message: `Telegram Bot API failed. Response: ${res.body?.slice(0, 200)}` };
}

async function checkGoogleTokens() {
  console.log('[Monitor] Checking Google OAuth tokens...');
  const tokenPath = path.resolve('tokens.json');
  if (!fs.existsSync(tokenPath)) {
    return { ok: false, message: 'tokens.json file NOT FOUND!\nRun: npm run auth\nYeh file bina automation kuch nahi karega!' };
  }

  let tokens;
  try {
    tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  } catch {
    return { ok: false, message: 'tokens.json is corrupted / invalid JSON!\nRun: npm run auth' };
  }

  // Check expiry
  if (tokens.expiry_date) {
    const expiresInMs = tokens.expiry_date - Date.now();
    const expiresInHours = Math.floor(expiresInMs / 3600000);
    if (expiresInMs < 0) {
      // Already expired — but Google should auto-refresh via refresh_token
      if (!tokens.refresh_token) {
        return { ok: false, message: `Google Access Token EXPIRED and NO refresh_token found!\nRun: npm run auth` };
      }
      console.log('[Monitor] Access token expired but refresh_token present — will auto-refresh.');
    } else if (expiresInHours < 1) {
      console.warn(`[Monitor] ⚠️ Google token expires in ${expiresInHours} hour(s) — will refresh soon.`);
    } else {
      console.log(`[Monitor] ✅ Google token valid for ~${expiresInHours} more hour(s).`);
    }
  }

  if (!tokens.refresh_token) {
    return { ok: false, message: 'Google tokens.json has NO refresh_token!\nIs sms token kabhi nahi refresh hoga.\nRun: npm run auth again.' };
  }

  return { ok: true };
}

async function checkGoogleSheetsAPI() {
  console.log('[Monitor] Checking Google Sheets API access...');
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !SPREADSHEET_ID) {
    return { ok: false, message: 'Google Sheets credentials missing in .env (GOOGLE_CLIENT_ID / SPREADSHEET_ID)' };
  }

  try {
    const tokenPath = path.resolve('tokens.json');
    if (!fs.existsSync(tokenPath)) return { ok: false, message: 'tokens.json not found' };
    const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
    auth.setCredentials(tokens);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A1:F1'
    });
    console.log('[Monitor] ✅ Google Sheets API OK');
    return { ok: true, data: res.data };
  } catch (err) {
    return { ok: false, message: `Google Sheets API error: ${err.message}` };
  }
}

async function checkQueueStatus() {
  console.log('[Monitor] Checking article queue for stuck/failed items...');
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !SPREADSHEET_ID) {
    return { ok: true }; // skip if not configured
  }

  try {
    const tokenPath = path.resolve('tokens.json');
    if (!fs.existsSync(tokenPath)) return { ok: true };
    const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
    auth.setCredentials(tokens);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A2:F200'
    });

    const rows = res.data.values || [];
    const pending = rows.filter(r => r[3] === 'PENDING');
    const failed = rows.filter(r => r[3] === 'FAILED');
    const completed = rows.filter(r => r[3] === 'COMPLETED');

    console.log(`[Monitor] Queue: ${completed.length} completed, ${pending.length} pending, ${failed.length} failed`);

    const issues = [];
    if (failed.length > 0) {
      issues.push(`❌ <b>${failed.length} article(s) FAILED</b> in queue!\nFailed topics:\n${failed.slice(0, 3).map(r => `• ${r[0]}`).join('\n')}`);
    }
    if (pending.length > 350) {
      issues.push(`⚠️ Queue mein <b>${pending.length} pending articles</b> jam gaye hain — check if queue has too many unprocessed entries.`);
    }
    if (completed.length > 0) {
      // Check last completion time
      const lastCompleted = rows.filter(r => r[3] === 'COMPLETED' && r[5]).sort((a, b) => new Date(b[5]) - new Date(a[5]))[0];
      if (lastCompleted) {
        const lastTime = new Date(lastCompleted[5]);
        const hoursAgo = Math.floor((Date.now() - lastTime) / 3600000);
        if (hoursAgo > 4) {
          issues.push(`⚠️ Last successful post was <b>${hoursAgo} hours ago</b>!\nTopic: ${lastCompleted[0]}\nCheck if automation is running.`);
        } else {
          console.log(`[Monitor] ✅ Last post was ${hoursAgo} hour(s) ago. Automation is working.`);
        }
      }
    }

    if (issues.length > 0) {
      return { ok: false, message: issues.join('\n\n') };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, message: `Queue status check error: ${err.message}` };
  }
}

async function checkBloggerAPI() {
  console.log('[Monitor] Checking Blogger API access...');
  if (!BLOG_ID || !GOOGLE_CLIENT_ID) return { ok: true }; // skip if not configured

  try {
    const tokenPath = path.resolve('tokens.json');
    if (!fs.existsSync(tokenPath)) return { ok: true };
    const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
    auth.setCredentials(tokens);
    const blogger = google.blogger({ version: 'v3', auth });
    const res = await blogger.blogs.get({ blogId: BLOG_ID });
    console.log(`[Monitor] ✅ Blogger API OK — Blog: "${res.data.name}"`);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: `Blogger API error: ${err.message}` };
  }
}


async function checkLoopRunningAndRestart() {
  console.log('[Monitor] Checking if always-on loop is running...');
  if (!ACTIONS_PAT) {
    console.warn('[Monitor] ACTIONS_PAT is missing in env — cannot check or restart loop workflow!');
    return { ok: true };
  }

  const owner = 'shivam01579-cmd';
  const repo = 'Pitch-Watch-website-';
  const workflowId = 'news-poster.yml';
  const runsUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?status=in_progress`;
  
  try {
    const res = await httpsGet(runsUrl, {
      'Authorization': `token ${ACTIONS_PAT}`,
      'Accept': 'application/vnd.github.v3+json'
    });

    if (!res.ok) {
      return { ok: false, message: `Failed to check workflow runs: HTTP ${res.statusCode}` };
    }

    const data = JSON.parse(res.body);
    const inProgressRuns = data.workflow_runs || [];

    console.log(`[Monitor] Found ${inProgressRuns.length} running loops.`);

    if (inProgressRuns.length === 0) {
      console.log(`[Monitor] ⚠️ No active loops found! Auto-triggering a new workflow loop run...`);
      
      const dispatchUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;
      const payload = { ref: 'main' };
      
      const dispatchRes = await httpsPost(dispatchUrl, payload, {
        'Authorization': `token ${ACTIONS_PAT}`,
        'Accept': 'application/vnd.github.v3+json'
      });

      if (dispatchRes.ok) {
        await sendTelegramAlert('🔄 <b>Always-on loop auto-restarted!</b>\n\nPoster loop had stopped running, so Health Monitor triggered a fresh loop run successfully.', false);
        return { ok: true };
      } else {
        return { ok: false, message: `Tried to auto-restart loop, but dispatch failed: HTTP ${dispatchRes.statusCode}` };
      }
    }

    console.log(`[Monitor] ✅ Always-on loop is active (Run ID: ${inProgressRuns[0].id})`);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: `Error checking/restarting loop: ${err.message}` };
  }
}

// ─── Main Monitor Runner ────────────────────────────────────────────────────

async function runHealthChecks() {
  console.log('\n' + '='.repeat(60));
  console.log(`[Monitor] Health Check started at: ${new Date().toLocaleString('en-IN')}`);
  console.log('='.repeat(60));

  const errors = [];
  const warnings = [];

  // Run all checks
  const results = await Promise.allSettled([
    checkTelegramBot(),
    checkGoogleTokens(),
    checkGoogleSheetsAPI(),
    checkQueueStatus(),
    checkBloggerAPI()
  ]);

  const checkNames = ['Telegram Bot', 'Google Tokens', 'Google Sheets', 'Queue Status', 'Blogger API'];

  results.forEach((result, i) => {
    const name = checkNames[i];
    if (result.status === 'rejected') {
      errors.push(`❌ <b>${name}</b>: Unexpected error — ${result.reason?.message || 'unknown'}`);
    } else if (!result.value.ok) {
      errors.push(`❌ <b>${name}</b>:\n${result.value.message}`);
    }
  });

  // Send alert if any errors found
  if (errors.length > 0) {
    const alertText = `⚠️ <b>${errors.length} issue(s) detected!</b>\n\n${errors.join('\n\n')}`;
    console.error('\n[Monitor] ISSUES FOUND:\n' + errors.join('\n'));
    await sendTelegramAlert(alertText, true);
  } else {
    console.log('\n[Monitor] ✅ All systems operational!');
    // Only send success ping once per day (to not spam) — check if hour is 8am
    const hour = new Date().getHours();
    if (hour === 8) {
      await sendTelegramAlert('✅ All systems operational!\n\nBlogger ✅ | Telegram ✅ | Google Sheets ✅ | Queue ✅', false);
    }
  }

  console.log('\n[Monitor] Health check complete.\n' + '='.repeat(60));
}

runHealthChecks().catch(err => {
  console.error('[Monitor] Fatal error during health check:', err);
  process.exit(1);
});
