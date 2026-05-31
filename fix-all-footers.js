import fs from 'fs';
import path from 'path';

const projectDir = process.cwd();
const files = fs.readdirSync(projectDir).filter(f => f.endsWith('.html'));

console.log(`Found ${files.length} HTML files to update footers in.`);

const newFooter = `<!-- Footer -->
<footer class="bg-surface-container-highest dark:bg-surface-container-highest border-t border-outline-variant w-full py-xl px-gutter mt-auto text-primary">
  <div class="max-w-container-max mx-auto grid grid-cols-1 md:grid-cols-4 gap-lg">
    <div class="col-span-1 md:col-span-1">
      <h2 class="font-headline-md text-headline-md text-primary mb-sm">Pitch Watch</h2>
      <p class="font-meta-label text-meta-label text-on-surface-variant leading-relaxed">High-Performance Cricket Journalism. Data-driven analysis, live updates, and editorial excellence.</p>
    </div>
    <div class="col-span-1 md:col-span-3 flex flex-wrap justify-between gap-lg">
      <nav class="flex flex-col gap-sm">
        <a class="font-meta-label text-meta-label text-on-surface-variant hover:text-secondary hover:underline decoration-secondary cursor-pointer transition-all" href="sitemap.html">Sitemap</a>
        <a class="font-meta-label text-meta-label text-on-surface-variant hover:text-secondary hover:underline decoration-secondary cursor-pointer transition-all" href="privacy-policy.html">Privacy Policy</a>
        <a class="font-meta-label text-meta-label text-on-surface-variant hover:text-secondary hover:underline decoration-secondary cursor-pointer transition-all" href="terms-of-service.html">Terms of Service</a>
      </nav>
      <nav class="flex flex-col gap-sm">
        <span class="font-meta-label text-meta-label text-primary font-bold">Inquiries</span>
        <a class="font-meta-label text-meta-label text-on-surface-variant hover:text-secondary hover:underline decoration-secondary cursor-pointer transition-all" href="contact.html">Contact Us</a>
      </nav>
      <div class="flex flex-col gap-sm min-w-[200px]">
        <span class="font-meta-label text-meta-label text-primary font-bold">Subscribe to Premium</span>
        <form class="flex" onsubmit="event.preventDefault(); alert('Thank you for subscribing to Pitch Watch!'); this.reset();">
          <input aria-label="Email for newsletter" required class="bg-surface-container-lowest border-b border-outline-variant focus:border-secondary focus:ring-0 px-0 py-xs text-sm w-full font-meta-label bg-transparent outline-none transition-colors" placeholder="Email address" type="email">
          <button aria-label="Submit" type="submit" class="bg-primary text-on-primary font-meta-label text-meta-label uppercase px-sm py-xs hover:bg-secondary transition-colors">Go</button>
        </form>
      </div>
    </div>
  </div>
  <div class="max-w-container-max mx-auto mt-xl pt-sm border-t border-outline-variant text-center md:text-left flex flex-col md:flex-row justify-between items-center gap-sm">
    <p class="font-meta-label text-meta-label text-on-surface-variant">© 2026 Pitch Watch. High-Performance Cricket Journalism.</p>
    <p class="font-meta-label text-[10px] text-on-surface-variant/70">Disclaimer: Pitch Watch is a mock sports news portal for demonstration purposes. All news articles are paraphrased/fictionalized.</p>
  </div>
</footer>`;

// Match from <!-- Footer --> or <footer...> all the way to </footer>
const footerRegex = /(?:<!-- Footer -->|<footer class="bg-surface-container-highest[^"]*">)[\s\S]*?<\/footer>/;

files.forEach(file => {
  const filePath = path.join(projectDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (footerRegex.test(content)) {
    console.log(`Fixing footer in: ${file}`);
    content = content.replace(footerRegex, newFooter);
    fs.writeFileSync(filePath, content, 'utf8');
  } else {
    // If the file does not have a footer, but has <footer></footer> placeholder, replace that
    if (content.includes('<footer>\n</footer>')) {
      console.log(`Replacing placeholder footer in: ${file}`);
      content = content.replace('<footer>\n</footer>', newFooter);
      fs.writeFileSync(filePath, content, 'utf8');
    } else if (content.includes('<footer></footer>')) {
      console.log(`Replacing placeholder footer in: ${file}`);
      content = content.replace('<footer></footer>', newFooter);
      fs.writeFileSync(filePath, content, 'utf8');
    } else {
      console.log(`Could not find footer pattern in: ${file}`);
    }
  }
});

console.log('Finished updating all footers across the project!');
