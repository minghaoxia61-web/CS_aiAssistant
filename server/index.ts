// Express 服务端入口
// 替代 electron/main.ts，提供 HTTP API + 静态文件服务 + 知识库种子注入
import express from 'express';
import multer from 'multer';
import * as path from 'path';
import { initStore } from './store';
import { registerRoutes } from './routes';
import { seedKnowledgeBase } from './knowledge/seed';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json({ limit: '50mb' }));

// 注册 API 路由
registerRoutes(app, upload);

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

// 初始化存储 + 知识库种子注入
initStore();
seedKnowledgeBase();

app.listen(PORT, () => {
  console.log(`服务器已启动: http://localhost:${PORT}`);
});
