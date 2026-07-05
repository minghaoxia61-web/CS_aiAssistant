// 构建后处理：1. 复制知识库 md 文件  2. 生成 dist-server/package.json（标记为 CommonJS）
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const distServer = path.join(root, 'dist-server');

// 1. 生成 dist-server/package.json —— 标记该目录为 CommonJS
//    根目录 package.json 的 "type":"module" 会让 .js 被当作 ESM，
//    但 tsc 编译输出的是 CommonJS 格式，需要在此覆盖为 commonjs
if (fs.existsSync(distServer)) {
  fs.writeFileSync(
    path.join(distServer, 'package.json'),
    JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
    'utf-8'
  );
  console.log('已生成 dist-server/package.json (type: commonjs)');
} else {
  console.error('错误：dist-server 目录不存在，请先运行 tsc 编译');
  process.exit(1);
}

// 2. 复制知识库 md 文件（tsc 只编译 .ts，不复制 .md）
const src = path.join(root, 'server', 'knowledge');
const dest = path.join(distServer, 'server', 'knowledge');

if (!fs.existsSync(src)) {
  console.warn('警告：知识库源文件不存在:', src);
} else {
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
}
