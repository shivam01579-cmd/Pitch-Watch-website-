import fs from 'fs';
import path from 'path';

const projectDir = process.cwd();
const files = fs.readdirSync(projectDir);
const htmlFiles = files.filter(f => f.endsWith('.html'));

const oldNavbarPattern = /<div class="hidden md:flex gap-sm">[\s\S]*?<\/div>/;
const newNavbar = `<div class="hidden md:flex gap-sm">
<a class="text-on-surface-variant dark:text-on-surface-variant hover:text-primary font-meta-label text-meta-label uppercase px-xs py-base hover:bg-surface-container-low transition-colors duration-200" href="index.html?category=ipl">IPL</a>
<a class="text-on-surface-variant dark:text-on-surface-variant hover:text-primary font-meta-label text-meta-label uppercase px-xs py-base hover:bg-surface-container-low transition-colors duration-200" href="index.html?category=india">India</a>
<a class="text-on-surface-variant dark:text-on-surface-variant hover:text-primary font-meta-label text-meta-label uppercase px-xs py-base hover:bg-surface-container-low transition-colors duration-200" href="index.html?category=icc">ICC</a>
<a class="text-on-surface-variant dark:text-on-surface-variant hover:text-primary font-meta-label text-meta-label uppercase px-xs py-base hover:bg-surface-container-low transition-colors duration-200" href="teams.html">Teams</a>
</div>`;

htmlFiles.forEach(file => {
  if (file === 'index.html') return; // index.html navbar is handled separately and has custom css/id rules
  
  const filePath = path.join(projectDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (oldNavbarPattern.test(content)) {
    console.log(`Updating navbar in: ${file}`);
    content = content.replace(oldNavbarPattern, newNavbar);
    fs.writeFileSync(filePath, content, 'utf8');
  } else {
    console.log(`Pattern not matched or already updated in: ${file}`);
  }
});

console.log('Navbar link fix completed across all subpages!');
