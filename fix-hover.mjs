import fs from 'fs';
import path from 'path';

function fixHover(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  content = content.replace(/hover:bg-black\/5 dark:bg-white\/5/g, 'hover:bg-black/5 dark:hover:bg-white/5');
  content = content.replace(/hover:bg-black\/10 dark:bg-white\/10/g, 'hover:bg-black/10 dark:hover:bg-white/10');
  
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
    fixHover(fullPath);
    console.log('Fixed ' + f);
  }
});
