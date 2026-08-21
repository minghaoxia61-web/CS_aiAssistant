// 传统 Node 服务端入口：提供 HTTP API 与静态前端。
import app from './app';
import * as path from 'path';
import express from 'express';

// 静态文件服务（前端构建产物）
const distDir = path.resolve(process.cwd(), 'dist');
app.use(express.static(distDir));

// SPA 回退：非 /api 路由返回 index.html
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(distDir, 'index.html'));
  }
});

const PORT = parseInt(process.env.PORT || '3000', 10);

app.listen(PORT, () => {
  console.log(`服务器已启动: http://localhost:${PORT}`);
});
