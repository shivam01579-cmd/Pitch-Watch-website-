import fs from 'fs';
import path from 'path';

const files = fs.readdirSync(process.cwd()).filter(f => f.endsWith('.html'));
files.forEach(f => {
  const content = fs.readFileSync(path.join(process.cwd(), f), 'utf8');
  const asides = (content.match(/<aside/gi) || []).length;
  const closeAsides = (content.match(/<\/aside>/gi) || []).length;
  const footers = (content.match(/<footer/gi) || []).length;
  const closeFooters = (content.match(/<\/footer>/gi) || []).length;
  console.log(`${f}: <aside (${asides}) /aside> (${closeAsides}), <footer (${footers}) /footer> (${closeFooters})`);
});
