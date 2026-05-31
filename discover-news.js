import fs from 'fs';
import path from 'path';
import https from 'https';

// Google News RSS Story feed for cricket
const FEED_URL = 'https://news.google.com/rss/search?q=cricket+news&hl=en-IN&gl=IN&ceid=IN:en';

function cleanText(htmlText) {
  if (!htmlText) return '';
  return htmlText
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<[^>]*>/g, '')
    .trim();
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          statusText: res.statusMessage,
          text: () => Promise.resolve(data)
        });
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function discoverCricketNews() {
  console.log('Fetching live cricket stories from ESPN Cricinfo RSS...');
  try {
    const res = await fetchUrl(FEED_URL);
    if (!res.ok) {
      throw new Error(`Failed to fetch RSS feed: ${res.statusText}`);
    }
    const xml = await res.text();
    
    // Parse items using regex
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    const stories = [];
    
    while ((match = itemRegex.exec(xml)) !== null) {
      const itemContent = match[1];
      
      const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(itemContent);
      const linkMatch = /<link>([\s\S]*?)<\/link>/.exec(itemContent);
      const descMatch = /<description>([\s\S]*?)<\/description>/.exec(itemContent);
      const dateMatch = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(itemContent);
      
      if (titleMatch && linkMatch) {
        stories.push({
          title: cleanText(titleMatch[1]),
          link: cleanText(linkMatch[1]),
          description: descMatch ? cleanText(descMatch[1]) : '',
          pubDate: dateMatch ? cleanText(dateMatch[1]) : ''
        });
      }
    }

    console.log(`Successfully discovered ${stories.length} stories.`);
    
    // Read existing files in directory to avoid duplicate topics
    const projectDir = process.cwd();
    const files = fs.readdirSync(projectDir);
    const articleFiles = files.filter(f => f.startsWith('article-') && f.endsWith('.html'));
    
    console.log('\n--- Live Cricket Stories (Filtered against existing articles) ---');
    let filteredCount = 0;
    
    for (const story of stories) {
      // Check if we already cover this title or similar topic
      const cleanTitle = story.title.toLowerCase();
      
      // Simple heuristic for duplicate: check if key words from headline match any existing filenames
      const words = cleanTitle.split(/\s+/).filter(w => w.length > 4);
      const isDuplicate = articleFiles.some(filename => {
        return words.some(word => filename.includes(word));
      });
      
      if (!isDuplicate && filteredCount < 5) {
        console.log(`\n[Topic ${filteredCount + 1}]`);
        console.log(`Title: ${story.title}`);
        console.log(`Date:  ${story.pubDate}`);
        console.log(`Desc:  ${story.description}`);
        console.log(`Link:  ${story.link}`);
        filteredCount++;
      }
    }
    
    if (filteredCount === 0) {
      console.log('No new unique topics found. All trending stories are already covered or filenames match key words.');
    }
    
  } catch (error) {
    console.error('Error discovering news:', error.message);
    // Fallback static headlines if network is down or blocks us
    console.log('\n--- Fallback Trending Topics (Offline mode) ---');
    console.log('1. Team India Selection Meeting: Selectors debate backup wicketkeeper slot for ICC Tournament.');
    console.log('2. IPL Qualifier Preview: MI vs CSK tactical analysis and key player matchups.');
    console.log('3. Rising Star: 19-year-old speedster clocks 152km/h in domestic tournament.');
  }
}

discoverCricketNews();
