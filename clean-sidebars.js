import fs from 'fs';
import path from 'path';

const projectDir = process.cwd();
const files = fs.readdirSync(projectDir);
const htmlFiles = files.filter(f => f.endsWith('.html'));

const sidebarRegex = /<aside class="w-full lg:w-4\/12 xl:w-3\/12 flex flex-col gap-lg[^"]*">[\s\S]*?<\/aside>/;

const trendingWidget = `<!-- Trending Widget -->
<div class="bg-surface-container-lowest border border-outline-variant rounded-DEFAULT overflow-hidden">
<div class="bg-primary text-on-primary py-xs px-sm flex items-center gap-xs">
<span class="material-symbols-outlined text-[18px]">trending_up</span>
<h3 class="font-headline-md text-lg uppercase tracking-wider">Trending in IPL</h3>
</div>
<ul class="flex flex-col divide-y divide-outline-variant">
<li class="p-sm hover:bg-surface-container-low transition-colors group cursor-pointer">
<a href="article-ipl-2026-final.html" class="flex gap-sm">
<span class="font-stats-number text-stats-number text-outline group-hover:text-secondary transition-colors">01</span>
<div>
<h4 class="font-meta-label text-meta-label text-primary font-bold group-hover:text-secondary transition-colors line-clamp-2 leading-tight">IPL 2026 Grand Final Preview: RCB vs GT Clash Tonight</h4>
<p class="font-meta-label text-[10px] text-on-surface-variant mt-base">2 Hours Ago</p>
</div>
</a>
</li>
<li class="p-sm hover:bg-surface-container-low transition-colors group cursor-pointer">
<a href="article-gt-vs-rr-qualifier-2.html" class="flex gap-sm">
<span class="font-stats-number text-stats-number text-outline group-hover:text-secondary transition-colors">02</span>
<div>
<h4 class="font-meta-label text-meta-label text-primary font-bold group-hover:text-secondary transition-colors line-clamp-2 leading-tight">Titans Secure Final Berth: GT Guides Past Royals in Qualifier 2</h4>
<p class="font-meta-label text-[10px] text-on-surface-variant mt-base">1 Day Ago</p>
</div>
</a>
</li>
<li class="p-sm hover:bg-surface-container-low transition-colors group cursor-pointer">
<a href="article-rcb-vs-gt-qualifier-1.html" class="flex gap-sm">
<span class="font-stats-number text-stats-number text-outline group-hover:text-secondary transition-colors">03</span>
<div>
<h4 class="font-meta-label text-meta-label text-primary font-bold group-hover:text-secondary transition-colors line-clamp-2 leading-tight">Patidar's Blistering Masterclass Propels RCB Directly Into Grand Final</h4>
<p class="font-meta-label text-[10px] text-on-surface-variant mt-base">4 Days Ago</p>
</div>
</a>
</li>
</ul>
</div>`;

const standingsTable = `<!-- Mini Standings Table -->
<div class="bg-surface-container-lowest border border-outline-variant rounded-DEFAULT overflow-hidden mt-lg">
<div class="bg-secondary text-on-secondary py-xs px-sm flex items-center justify-between">
<h3 class="font-headline-md text-lg uppercase tracking-wider">IPL Standings</h3>
<span class="font-meta-label text-[10px] uppercase">2026 Season</span>
</div>
<div class="overflow-x-auto">
<table class="w-full text-left font-meta-label text-[11px] uppercase">
<thead>
<tr class="bg-surface-container-low border-b border-outline-variant text-on-surface-variant">
<th class="p-xs">Pos</th>
<th class="p-xs">Team</th>
<th class="p-xs">P</th>
<th class="p-xs">Pts</th>
<th class="p-xs text-right">NRR</th>
</tr>
</thead>
<tbody class="divide-y divide-outline-variant text-primary">
<tr class="hover:bg-surface-container-low transition-colors">
<td class="p-xs font-bold text-secondary">1</td>
<td class="p-xs font-bold">RCB</td>
<td class="p-xs">14</td>
<td class="p-xs font-bold">18</td>
<td class="p-xs text-right text-secondary">+0.783</td>
</tr>
<tr class="hover:bg-surface-container-low transition-colors">
<td class="p-xs font-bold">2</td>
<td class="p-xs font-bold">GT</td>
<td class="p-xs">14</td>
<td class="p-xs font-bold">18</td>
<td class="p-xs text-right">+0.695</td>
</tr>
<tr class="hover:bg-surface-container-low transition-colors">
<td class="p-xs font-bold">3</td>
<td class="p-xs font-bold">SRH</td>
<td class="p-xs">14</td>
<td class="p-xs font-bold">18</td>
<td class="p-xs text-right">+0.524</td>
</tr>
<tr class="hover:bg-surface-container-low transition-colors">
<td class="p-xs font-bold">4</td>
<td class="p-xs">RR</td>
<td class="p-xs">14</td>
<td class="p-xs font-bold">16</td>
<td class="p-xs text-right">+0.189</td>
</tr>
</tbody>
</table>
</div>
</div>`;

const sidebarAd = `<!-- Sidebar Ad -->
<div class="border border-outline-variant p-xs relative bg-surface-container-lowest mb-lg">
<span class="absolute top-0 left-0 bg-surface-container-low text-on-surface-variant font-meta-label text-[10px] uppercase px-xs py-base border-b border-r border-outline-variant z-10">Sponsored</span>
<div class="w-full h-[250px] bg-surface-container flex items-center justify-center text-on-surface-variant relative overflow-hidden">
<img alt="Finance Ad" class="absolute inset-0 w-full h-full object-cover opacity-80 mix-blend-multiply" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAEK2srA5Nx7JDrwxlJRKdPT_dV3kB_EFHQXALvE6wpMsxlKlKFCTjgnN9QeCbyS4lERNSTaJ7M_OgdXQZ9HZ_dfFLRmqiAlNV6uB6rqCuaYxrabHfRZ5WDMkARXMzxnyrXlZ-UfI_Y-z0jvzXmiknHRPSCHtlZjbmW7KXsSdLCNMF8tQGkNIXBAgbB-kV1mllwLuB3jVO6bv-pRo4LOqRyU3mgasu3CGF3wIgWmpl2R-UX7FgUY9uYbpG-1dQP6BLRu-z46PtSJCZB">
<span class="font-headline-md text-xl relative z-10 text-white drop-shadow-md">Trade Smarter</span>
</div>
</div>`;

// Template for home page (index.html)
const homeAside = `<aside class="w-full lg:w-4/12 xl:w-3/12 flex flex-col gap-lg">
${trendingWidget}
${standingsTable}
</aside>`;

// Template for article pages
const articleAside = `<aside class="w-full lg:w-4/12 xl:w-3/12 flex flex-col gap-lg mt-lg lg:mt-0">
${sidebarAd}
${trendingWidget}
${standingsTable}
</aside>`;

htmlFiles.forEach(file => {
  const filePath = path.join(projectDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (sidebarRegex.test(content)) {
    const isHome = file === 'index.html';
    const newAside = isHome ? homeAside : articleAside;
    
    console.log(`Cleaning sidebar in: ${file}`);
    content = content.replace(sidebarRegex, newAside);
    fs.writeFileSync(filePath, content, 'utf8');
  } else {
    console.log(`No matching sidebar container in: ${file}`);
  }
});

console.log('Sidebar cleanup completed successfully!');
