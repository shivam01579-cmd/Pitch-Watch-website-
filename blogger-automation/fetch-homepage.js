import https from 'https';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  console.log('Fetching live homepage...');
  try {
    const html = await fetchUrl('https://crickettrendsnews.blogspot.com/');
    console.log('HTML fetched successfully. Searching for post titles...');
    
    // Look for post titles in Blogger markup (usually <h2> classes or title tags)
    const titleRegex = /<h3[^>]*class=["'][^"']*post-title[^"']*["'][^>]*>([\s\S]*?)<\/h3>|<h2[^>]*class=["'][^"']*post-title[^"']*["'][^>]*>([\s\S]*?)<\/h2>/gi;
    let match;
    let count = 0;
    while ((match = titleRegex.exec(html)) !== null) {
      const content = match[1] || match[2] || '';
      const cleanContent = content.replace(/<[^>]*>/g, '').trim();
      if (cleanContent) {
        count++;
        console.log(`${count}. "${cleanContent}"`);
      }
    }
    
    if (count === 0) {
      // Fallback search for any header or link containing title-like structures
      const linkTitleRegex = /<a[^>]+href=["']https:\/\/crickettrendsnews\.blogspot\.com\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/gi;
      while ((match = linkTitleRegex.exec(html)) !== null && count < 30) {
        const text = match[1].replace(/<[^>]*>/g, '').trim();
        if (text && text.length > 10 && !text.includes('No comments') && !text.includes('Post a Comment')) {
          count++;
          console.log(`${count} (fallback). "${text}"`);
        }
      }
    }
  } catch (err) {
    console.error('Error fetching homepage:', err.message);
  }
}

main();
