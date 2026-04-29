import fs from 'fs';
import path from 'path';

function replaceThemeClasses(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Backgrounds
  content = content.replace(/bg-\[\#0A0A0B\]/g, 'bg-zinc-50 dark:bg-[#0A0A0B]');
  content = content.replace(/bg-\[\#0D0D0E\]/g, 'bg-white dark:bg-[#0D0D0E]');
  content = content.replace(/bg-black(?!\/)/g, 'bg-zinc-100 dark:bg-black');
  
  // Translucent backgrounds
  content = content.replace(/bg-white\/5(?!\d)/g, 'bg-black/5 dark:bg-white/5');
  content = content.replace(/bg-white\/10/g, 'bg-black/10 dark:bg-white/10');
  content = content.replace(/bg-white\/20/g, 'bg-black/20 dark:bg-white/20');
  
  // Borders
  content = content.replace(/border-white\/5(?!\d)/g, 'border-black/5 dark:border-white/5');
  content = content.replace(/border-white\/10/g, 'border-black/10 dark:border-white/10');
  content = content.replace(/border-white\/20/g, 'border-black/20 dark:border-white/20');
  
  // Texts
  content = content.replace(/text-white(?!\/)/g, 'text-zinc-900 dark:text-white');
  content = content.replace(/text-gray-300/g, 'text-zinc-700 dark:text-gray-300');
  content = content.replace(/text-gray-400/g, 'text-zinc-600 dark:text-gray-400');
  content = content.replace(/text-gray-500/g, 'text-zinc-500 dark:text-gray-500');
  content = content.replace(/text-gray-600/g, 'text-zinc-400 dark:text-gray-600');
  content = content.replace(/text-gray-700/g, 'text-zinc-300 dark:text-gray-700');
  
  // Hover Backgrounds
  content = content.replace(/hover:bg-white\/5/g, 'hover:bg-black/5 dark:hover:bg-white/5');
  content = content.replace(/hover:bg-white\/10/g, 'hover:bg-black/10 dark:hover:bg-white/10');

  // Add Theme provider to files? No, just classes.
  
  fs.writeFileSync(filePath, content);
}

const files = [
  'src/App.tsx',
  'src/components/FundingModal.tsx',
  'src/components/LegalDisclaimer.tsx',
  'src/components/LoginModal.tsx',
  'src/components/OrderBook.tsx'
];

files.forEach(f => {
  const fullPath = path.join(process.cwd(), f);
  if (fs.existsSync(fullPath)) {
    replaceThemeClasses(fullPath);
    console.log('Updated ' + f);
  }
});
