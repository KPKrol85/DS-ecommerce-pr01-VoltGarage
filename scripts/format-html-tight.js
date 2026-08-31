const fs = require('fs');
const path = require('path');
const fg = require('fast-glob');

const htmlFiles = fg.sync(
  ['index.html', '404.html', 'offline.html', 'thank-you.html', 'pages/**/*.html'],
  {
    cwd: process.cwd(),
    onlyFiles: true,
  }
);

function tightenHeadSpacing(source) {
  return source.replace(/<head>([\s\S]*?)<\/head>/i, (match, headContent) => {
    const lines = headContent.split(/\r?\n/);
    const cleaned = [];
    let previousBlank = false;

    for (const line of lines) {
      const isBlank = line.trim() === '';

      if (isBlank) {
        previousBlank = true;
        continue;
      }

      if (previousBlank && cleaned.length === 0) {
        previousBlank = false;
      }

      cleaned.push(line);
      previousBlank = false;
    }

    const normalized = cleaned.join('\n');
    return `<head>\n${normalized}\n</head>`;
  });
}

let changedFiles = 0;

for (const relativeFile of htmlFiles) {
  const absoluteFile = path.join(process.cwd(), relativeFile);
  const original = fs.readFileSync(absoluteFile, 'utf8');
  const updated = tightenHeadSpacing(original);

  if (updated !== original) {
    fs.writeFileSync(absoluteFile, updated, 'utf8');
    changedFiles += 1;
  }
}

console.log(`Tightened head spacing in ${changedFiles} HTML file(s).`);
