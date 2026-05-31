import fs from 'fs';
import path from 'path';

const projectDir = process.cwd();
const files = fs.readdirSync(projectDir).filter(f => f.endsWith('.html'));

console.log(`Found ${files.length} HTML files to process.`);

const utilityBar = `<!-- Top Utility Bar -->
<div class="bg-surface-container-low border-b border-outline-variant/30 text-on-surface-variant w-full py-1.5 px-gutter text-xs font-meta-label">
  <div class="max-w-container-max mx-auto flex justify-between items-center">
    <div class="flex flex-wrap gap-x-4 gap-y-1">
      <a class="hover:text-primary transition-colors" href="index.html">Home</a>
      <span class="text-outline-variant/40">|</span>
      <a class="hover:text-primary transition-colors" href="about.html">About Us</a>
      <span class="text-outline-variant/40">|</span>
      <a class="hover:text-primary transition-colors" href="contact.html">Contact Us</a>
      <span class="text-outline-variant/40">|</span>
      <a class="hover:text-primary transition-colors" href="privacy-policy.html">Privacy Policy</a>
      <span class="text-outline-variant/40">|</span>
      <a class="hover:text-primary transition-colors" href="terms-of-service.html">Terms of Service</a>
    </div>
    <div class="hidden sm:flex items-center gap-2 text-on-surface-variant/80">
      <span class="material-symbols-outlined text-[14px]">event</span>
      <span class="text-[11px] current-date-ticker">May 31, 2026</span>
    </div>
  </div>
</div>
<script>
  document.addEventListener('DOMContentLoaded', () => {
    const tickers = document.querySelectorAll('.current-date-ticker');
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = new Date().toLocaleDateString('en-US', options);
    tickers.forEach(t => t.textContent = dateStr);
  });
</script>
<!-- Top Utility Bar End -->`;

const utilityBarRegex = /<!-- Top Utility Bar -->[\s\S]*?<!-- Top Utility Bar End -->/;

files.forEach(file => {
  const filePath = path.join(projectDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Check if utility bar already exists in some form
  if (utilityBarRegex.test(content)) {
    console.log(`Updating existing top utility bar in: ${file}`);
    content = content.replace(utilityBarRegex, utilityBar);
    fs.writeFileSync(filePath, content, 'utf8');
  } else {
    // Insert immediately below the <body> tag
    const bodyMatch = content.match(/<body[^>]*>/);
    if (bodyMatch) {
      console.log(`Injecting top utility bar in: ${file}`);
      const bodyTag = bodyMatch[0];
      const insertPos = content.indexOf(bodyTag) + bodyTag.length;
      content = content.substring(0, insertPos) + '\n' + utilityBar + content.substring(insertPos);
      fs.writeFileSync(filePath, content, 'utf8');
    } else {
      console.log(`Warning: No <body> tag found in: ${file}`);
    }
  }
});

console.log('Finished injecting/updating top utility bar across all pages!');
