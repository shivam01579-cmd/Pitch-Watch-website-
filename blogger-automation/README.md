# Blogger Automation Setup Guide

This tool automates daily posting to your Blogger website. It supports posting local articles, pulling news from Google News RSS feeds, or automatically generating fresh articles using the Gemini AI model.

---

## 🛠️ Prerequisites & Setup

### Step 1: Create Google Cloud Console Project
To connect to the Blogger API, you need a Google Cloud Project with OAuth 2.0 Credentials:
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click **Create Project** (or select an existing one).
3. Name your project (e.g., `Blogger-Automation`) and click **Create**.

### Step 2: Enable the Blogger API
1. In the console, search for **Blogger API v3** in the top search bar.
2. Select it and click **Enable**.

### Step 3: Configure the OAuth Consent Screen
Since your app is for personal use, configure it as an "External" app in testing mode:
1. Go to **APIs & Services** > **OAuth consent screen**.
2. Select **External** and click **Create**.
3. Fill in the required fields (App name, User support email, Developer contact information).
4. Click **Save and Continue** until you reach the **Scopes** page.
5. Click **Add or Remove Scopes** and add this scope:
   `https://www.googleapis.com/auth/blogger`
6. Under **Test Users**, click **Add Users** and enter your Google account email (the one that owns/manages the Blogger account).
7. Save and complete the wizard.

### Step 4: Create OAuth 2.0 Credentials
1. Go to **APIs & Services** > **Credentials**.
2. Click **Create Credentials** > **OAuth client ID**.
3. Select **Web application** (or Desktop app) as the Application type.
4. Name it (e.g., `Blogger Web App`).
5. Under **Authorized redirect URIs**, add:
   `http://localhost:3000/oauth2callback`
6. Click **Create**.
7. Copy the **Client ID** and **Client Secret**.

### Step 5: Configure the Environment Variables
1. Duplicate `.env.example` in this folder and rename it to `.env`.
2. Open `.env` and fill in:
   - `GOOGLE_CLIENT_ID` (Your Client ID)
   - `GOOGLE_CLIENT_SECRET` (Your Client Secret)
   - `BLOG_ID` (Found in your Blogger Settings URL: `https://www.blogger.com/blog/settings/<BLOG_ID>`)
   - `GEMINI_API_KEY` (Optional: needed if you want AI to write daily posts)

---

## 🚀 Running the Automation

### 1. Install Dependencies
Run the following command inside this directory:
```bash
npm install
```

### 2. Authenticate
Run the authentication script to link your Google/Blogger account and retrieve a Refresh Token:
```bash
npm run auth
```
- This will open your web browser and prompt you to log in with your Google account.
- Since it is an unverified app in testing, you might see a warning screen. Click **Advanced** and then **Go to Web App (unsafe)** to proceed.
- After granting permission, you will see a "Success" message in the browser.
- The script will save the login tokens to a new file named `tokens.json`. **Do not commit this file to public repositories.**

### 3. Generate and Publish Posts
Run the posting engine:
```bash
# General run (uses configured source)
npm run post

# Dry run (generate content and output it to CLI, without uploading to Blogger)
npm run post -- --dry-run

# Run specifically posting local HTML articles (e.g., article-csk-future-plans.html)
npm run post -- --source=local --file=../article-csk-future-plans.html

# Run with RSS scraper + Gemini AI writing a summary post
npm run post -- --source=rss-ai
```

---

## 📅 Scheduling Daily Posts

### Windows (Task Scheduler)
You can schedule the script to run daily using Windows Task Scheduler:
1. Open **Task Scheduler**.
2. Click **Create Basic Task...**.
3. Set the trigger to **Daily** and choose the time.
4. Set Action to **Start a Program**.
5. Program/script: `node`
6. Add arguments: `post-generator.js` (or `post-generator.js --source=rss-ai`)
7. Start in: The full path to this directory (e.g., `c:\Users\shiva\Videos\News Website\blogger-automation`).
