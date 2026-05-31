import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SVG-based author avatar as a data URI (clean, professional initials style)
const AUTHOR_AVATAR_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Ccircle cx='20' cy='20' r='20' fill='%230d1c2f'/%3E%3Ctext x='20' y='25' font-family='Arial%2C sans-serif' font-size='14' font-weight='bold' fill='%23ffffff' text-anchor='middle'%3EPW%3C/text%3E%3C/svg%3E`;

// SVG-based finance ad placeholder as a data URI
const FINANCE_AD_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='250' viewBox='0 0 400 250'%3E%3Crect width='400' height='250' fill='%230d1c2f'/%3E%3Ctext x='200' y='115' font-family='Arial%2Csans-serif' font-size='22' font-weight='bold' fill='%23006e2f' text-anchor='middle'%3ETrade Smarter%3C/text%3E%3Ctext x='200' y='145' font-family='Arial%2Csans-serif' font-size='12' fill='%23ffffff' text-anchor='middle'%3EMarkets %7C Analytics %7C Portfolio%3C/text%3E%3C/svg%3E`;

// Mapping of article filenames to their local featured images
// If not listed, a generic cricket placeholder SVG will be used
const ARTICLE_FEATURED_IMAGES = {
  'article-ipl-2026-final.html':          'images/ipl_final_preview.png',
  'article-mental-conditioning-bowler.html': 'images/mental_conditioning_bowler.png',
  // generic fallback used for all others (SVG data URI)
};

// Generic featured image fallback - SVG cricket stadium graphic
const GENERIC_CRICKET_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1280' height='720' viewBox='0 0 1280 720'%3E%3Crect width='1280' height='720' fill='%230d1c2f'/%3E%3Ccircle cx='640' cy='360' r='280' fill='none' stroke='%23006e2f' stroke-width='3' stroke-dasharray='12 6' opacity='0.6'/%3E%3Ccircle cx='640' cy='360' r='180' fill='none' stroke='%23006e2f' stroke-width='2' opacity='0.4'/%3E%3Cellipse cx='640' cy='580' rx='350' ry='60' fill='%23006e2f' opacity='0.15'/%3E%3Crect x='620' y='200' width='40' height='140' fill='%23bec6e0' rx='4' opacity='0.8'/%3E%3Ctext x='640' y='160' font-family='Arial%2Csans-serif' font-size='28' font-weight='bold' fill='%23ffffff' text-anchor='middle' opacity='0.9'%3EPITCH WATCH%3C/text%3E%3Ctext x='640' y='195' font-family='Arial%2Csans-serif' font-size='13' fill='%234ae176' text-anchor='middle' letter-spacing='4'%3EHIGH-PERFORMANCE CRICKET JOURNALISM%3C/text%3E%3C/svg%3E`;

// The two AI URL patterns to replace
const AI_AUTHOR_URL = 'https://lh3.googleusercontent.com/aida-public/AB6AXuDw8roz8j6j6wWXX3vx-JpPI27QYrNZlirY7Y6XmcJ-zIelA4OJoGiclkj7BCs_mdgOS7NVWmQ0zPrD2V3rs25C0WESGqLkba9fG1UXBZKlInlH0BaJSRRmUmsYJVcoIDyHC-A9BJMiCOSAwDNWnzdtObYLoTVDvPDC9EE6NfbpAmnBsv696Xdw6rlDHFMlhI_pO7vz_Hso7KFjymnl1FsoETZWavNydIwnt9H-ObB3F5mko3ck6qOvxTOq12fbnWE0FXlPny8IpN4T';
const AI_FINANCE_URL = 'https://lh3.googleusercontent.com/aida-public/AB6AXuAEK2srA5Nx7JDrwxlJRKdPT_dV3kB_EFHQXALvE6wpMsxlKlKFCTjgnN9QeCbyS4lERNSTaJ7M_OgdXQZ9HZ_dfFLRmqiAlNV6uB6rqCuaYxrabHfRZ5WDMkARXMzxnyrXlZ-UfI_Y-z0jvzXmiknHRPSCHtlZjbmW7KXsSdLCNMF8tQGkNIXBAgbB-kV1mllwLuB3jVO6bv-pRo4LOqRyU3mgasu3CGF3wIgWmpl2R-UX7FgUY9uYbpG-1dQP6BLRu-z46PtSJCZB';

// Additional featured-image AI URLs that are used as featured images in some articles
const AI_FEATURED_URLS = [
  'https://lh3.googleusercontent.com/aida-public/AB6AXuALRJL-lAPg8YZTO_EN5u2olqlC7xHEcmPL2FA57EuHMhkPSW39bif0oPSYiCY0sT4mVDmdeREKyiEN4zAqZ7XLZoK7qQ2mXrWlOBVinNEX1ihsR6gcm3ZqhUNd0jlsHuC68dvV5ITw4sUylLbgppG9Rs81zJaF9cdCtVurHaHTSbi-vK7C-3SZUM89j5N6cbDLE7wFx82XqLJ9o9IDOKAkOK05FRSqRlZofz4XU-GqXJMqjt4bDhS-2aXU3fNSOTXGM1O-MkFJs9yw',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAEK2srA5Nx7JDrwxlJRKdPT_dV3kB_EFHQXALvE6wpMsxlKlKFCTjgnN9QeCbyS4lERNSTaJ7M_OgdXQZ9HZ_dfFLRmqiAlNV6uB6rqCuaYxrabHfRZ5WDMkARXMzxnyrXlZ-UfI_Y-z0jvzXmiknHRPSCHtlZjbmW7KXsSdLCNMF8tQGkNIXBAgbB-kV1mllwLuB3jVO6bv-pRo4LOqRyU3mgasu3CGF3wIgWmpl2R-UX7FgUY9uYbpG-1dQP6BLRu-z46PtSJCZB',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDDIUeso_Ji6K8eF1j3uPP-ssL7uSmZEXXCV2fTpRKTn35wt-mR9ek54hjqgXcqSgC7mT_XJQ0Ay2nH2r6NrDwOsicaBnQkoAUtHZk1M9Jd1YhcfgS1jA6vyIInFWnFc7NF43bJxdhavnj7cHBRf00_f_xIpGRZCmXqU-5aJw8M01I1jAUC0Ijcp-KPkJlu46URw_NHiU8P3LCRwJVClznyVeXlz_-QXZfmkU2V_bbMhdhRT-eh1lOWPYMcTamhwwGSTLgGVutFM5ON',
  // The author URL also gets used as featured image in some articles
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDw8roz8j6j6wWXX3vx-JpPI27QYrNZlirY7Y6XmcJ-zIelA4OJoGiclkj7BCs_mdgOS7NVWmQ0zPrD2V3rs25C0WESGqLkba9fG1UXBZKlInlH0BaJSRRmUmsYJVcoIDyHC-A9BJMiCOSAwDNWnzdtObYLoTVDvPDC9EE6NfbpAmnBsv696Xdw6rlDHFMlhI_pO7vz_Hso7KFjymnl1FsoETZWavNydIwnt9H-ObB3F5mko3ck6qOvxTOq12fbnWE0FXlPny8IpN4T',
];

function processArticle(filePath) {
  const fileName = path.basename(filePath);
  let html = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // 1. Replace Author Avatar AI images
  const authorAvatarRegex = /(<img[^>]*alt="Author Avatar"[^>]*src=")[^"]*("[^>]*>)/g;
  if (authorAvatarRegex.test(html)) {
    html = html.replace(
      /(<img[^>]*alt="Author Avatar"[^>]*src=")[^"]*("[^>]*>)/g,
      `$1${AUTHOR_AVATAR_SVG}$2`
    );
    changed = true;
  }

  // 2. Replace Finance Ad AI images in sidebar
  const financeAdRegex = /(<img[^>]*alt="Finance Ad"[^>]*src=")[^"]*("[^>]*>)/g;
  if (financeAdRegex.test(html)) {
    html = html.replace(
      /(<img[^>]*alt="Finance Ad"[^>]*src=")[^"]*("[^>]*>)/g,
      `$1${FINANCE_AD_SVG}$2`
    );
    changed = true;
  }

  // 3. Replace Featured Image AI images (aspect-video images in <figure>)
  // Detect if the article has a known local image
  const localFeaturedImage = ARTICLE_FEATURED_IMAGES[fileName];
  const replacementFeaturedSrc = localFeaturedImage || GENERIC_CRICKET_SVG;

  // Match featured image: img with class containing aspect-video and src pointing to lh3
  const featuredImgRegex = /(<img[^>]*class="[^"]*aspect-video[^"]*"[^>]*src=")https:\/\/lh3\.googleusercontent\.com\/aida-public\/[^"]*("[^>]*>)/g;
  if (featuredImgRegex.test(html)) {
    html = html.replace(
      /(<img[^>]*class="[^"]*aspect-video[^"]*"[^>]*src=")https:\/\/lh3\.googleusercontent\.com\/aida-public\/[^"]*("[^>]*>)/g,
      `$1${replacementFeaturedSrc}$2`
    );
    changed = true;
  }

  // Also handle cases where src comes before class
  const featuredImgRegex2 = /(<img[^>]*src=")https:\/\/lh3\.googleusercontent\.com\/aida-public\/[^"]*("[^>]*class="[^"]*aspect-video[^"]*"[^>]*>)/g;
  if (featuredImgRegex2.test(html)) {
    html = html.replace(
      /(<img[^>]*src=")https:\/\/lh3\.googleusercontent\.com\/aida-public\/[^"]*("[^>]*class="[^"]*aspect-video[^"]*"[^>]*>)/g,
      `$1${replacementFeaturedSrc}$2`
    );
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, html, 'utf8');
    console.log(`✅ Fixed: ${fileName}`);
  } else {
    console.log(`⏭️  Skipped (no changes needed): ${fileName}`);
  }
}

// Run on all article HTML files
const articleFiles = fs.readdirSync(__dirname)
  .filter(f => f.startsWith('article-') && f.endsWith('.html'))
  .map(f => path.join(__dirname, f));

console.log(`\n🔧 Fixing AI image URLs in ${articleFiles.length} article files...\n`);
articleFiles.forEach(processArticle);
console.log('\n✨ Done! All AI image URLs have been replaced.\n');
