import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

// Dynamically scan directory for all article HTML files to register them as Rollup entry points
const inputs = {
  main: resolve(__dirname, 'index.html'),
  teams: resolve(__dirname, 'teams.html'),
  'team-news': resolve(__dirname, 'team-news.html'),
  'privacy-policy': resolve(__dirname, 'privacy-policy.html'),
  'terms-of-service': resolve(__dirname, 'terms-of-service.html'),
  contact: resolve(__dirname, 'contact.html'),
  sitemap: resolve(__dirname, 'sitemap.html'),
};

const files = fs.readdirSync(__dirname);
files.forEach((file) => {
  if (file.startsWith('article-') && file.endsWith('.html')) {
    const name = file.replace('.html', '');
    inputs[name] = resolve(__dirname, file);
  }
});

export default defineConfig({
  build: {
    rollupOptions: {
      input: inputs
    }
  }
});
