// 构建后复制知识库 md 文件到 dist-server（tsc 只编译 .ts，不复制 .md）
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'server', 'knowledge');
const dest = path.join(__dirname, '..', 'dist-server', 'server', 'knowledge');

if (!fs.existsSync(src)) {
  console.warn('警告：知识库源文件不存在:', src);
  process.exit(0);
}

// 只复制 .md 文件，不覆盖 tsc 编译的 .js 文件
function copyMdFiles(srcDir, destDir) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      count += copyMdFiles(srcPath, destPath);
    } else if (entry.name.endsWith('.md')) {
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }
  return count;
}

const count = copyMdFiles(src, dest);
console.log(`已复制 ${count} 个知识库 md 文件到 dist-server`);
