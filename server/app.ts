// 共享 Express 应用：传统 Node 服务与 Vercel Function 共用同一套路由。
import express from 'express';
import multer from 'multer';
import { initStore } from './store';
import { registerRoutes } from './routes';
import { seedKnowledgeBase } from './knowledge/seed';

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 10,
  },
});

app.disable('x-powered-by');
app.use(express.json({ limit: '12mb' }));
registerRoutes(app, upload);

// Vercel Function 的文件系统仅允许临时写入；Web 端业务数据本身保存在 IndexedDB，
// 这里的临时目录只服务于知识库种子和无状态解析/模型代理。
if (process.env.VERCEL && !process.env.DATA_DIR) {
  process.env.DATA_DIR = '/tmp/cs-assistant-data';
}

initStore();
seedKnowledgeBase();

export default app;
