import fs from 'fs';
import path from 'path';

const projectDir = process.cwd();
const files = fs.readdirSync(projectDir);
const htmlFiles = files.filter(f => f.endsWith('.html'));

const trendingPattern = /<!-- Trending Widget -->[\s\S]*?<\/ul>\s*<\/div>/;

const newTrendingWidgetAndStandings = `<!-- Trending Widget -->
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
<a href="article-asian-games-probables.html" class="flex gap-sm">
<span class="font-stats-number text-stats-number text-outline group-hover:text-secondary transition-colors">02</span>
<div>
<h4 class="font-meta-label text-meta-label text-primary font-bold group-hover:text-secondary transition-colors line-clamp-2 leading-tight">Vaibhav Sooryavanshi Selected in India's Asian Games Probables List</h4>
<p class="font-meta-label text-[10px] text-on-surface-variant mt-base">5 Hours Ago</p>
</div>
</a>
</li>
<li class="p-sm hover:bg-surface-container-low transition-colors group cursor-pointer">
<a href="article-eng-vs-ind-w-t20.html" class="flex gap-sm">
<span class="font-stats-number text-stats-number text-outline group-hover:text-secondary transition-colors">03</span>
<div>
<h4 class="font-meta-label text-meta-label text-primary font-bold group-hover:text-secondary transition-colors line-clamp-2 leading-tight">Freya Kemp Stars as England Beats India in T20I</h4>
<p class="font-meta-label text-[10px] text-on-surface-variant mt-base">12 Hours Ago</p>
</div>
</a>
</li>
</ul>
</div>

<!-- Mini Standings Table -->
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

htmlFiles.forEach(file => {
  const filePath = path.join(projectDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (trendingPattern.test(content)) {
    console.log(`Updating sidebar in: ${file}`);
    content = content.replace(trendingPattern, newTrendingWidgetAndStandings);
    fs.writeFileSync(filePath, content, 'utf8');
  } else {
    console.log(`No trending widget pattern found in: ${file}`);
  }
});

console.log('Sidebar updates applied successfully!');
