// Express API 路由（映射 electron/ipc.ts 的所有 IPC 通道为 HTTP 端点）
import { Router, type Request, type Response } from 'express';
import type { ServerResponse } from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type { Express } from 'express-serve-static-core';
import type multer from 'multer';
import * as store from './store';
import {
  getConfig,
  saveConfig,
  listConfigs,
  saveConfigItem,
  deleteConfigItem,
  setActiveConfig,
} from './config';
import { parseBuffer, getFileType } from './parsers-server';
import { streamChat, chatJSON } from '../electron/llm';
import type {
  ApiConfig,
  ApiConfigItem,
  Material,
  ChatSession,
  ReviewDoc,
  QuizSession,
  WrongQuestion,
  UserProfile,
  LlmStreamOptions,
} from '../src/shared/types';

const now = () => Date.now();

// ---------- SSE 客户端管理（material:updated 事件推送） ----------
const sseClients = new Set<ServerResponse>();

function broadcastSSE(event: string, data: Record<string, unknown>): void {
  const payload = `data: ${JSON.stringify({ type: event, ...data })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      // 客户端可能已断开
    }
  }
}

// ---------- LLM 流式请求管理（abort） ----------
const activeStreams = new Map<string, { abort: () => void }>();

export function registerRoutes(app: Express, upload: multer.Multer): void {
  // ---------- 用户隔离中间件 ----------
  // 从 X-User-Id 头获取用户 ID，用 AsyncLocalStorage 隔离每个用户的数据
  app.use((req: Request, _res: Response, next: () => void) => {
    const userId = (req.headers['x-user-id'] as string) || '';
    if (userId && userId.length > 0) {
      store.runAsUser(userId, () => next());
    } else {
      // 未提供 userId 的请求使用默认共享上下文
      next();
    }
  });

  // ---------- 配置 ----------
  app.get('/api/config', (_req: Request, res: Response) => {
    res.json(getConfig());
  });

  app.put('/api/config', (req: Request, res: Response) => {
    saveConfig(req.body as ApiConfig);
    res.json({ ok: true });
  });

  app.get('/api/configs', (_req: Request, res: Response) => {
    res.json(listConfigs());
  });

  app.post('/api/configs', (req: Request, res: Response) => {
    const item = saveConfigItem(req.body as Partial<ApiConfigItem> & { id?: string });
    res.json(item);
  });

  app.delete('/api/configs/:id', (req: Request, res: Response) => {
    deleteConfigItem(req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/configs/:id/active', (req: Request, res: Response) => {
    setActiveConfig(req.params.id);
    res.json(getConfig());
  });

  // ---------- 用户信息 ----------
  app.get('/api/profile', (_req: Request, res: Response) => {
    res.json(store.getProfile());
  });

  app.put('/api/profile', (req: Request, res: Response) => {
    store.saveProfile(req.body as UserProfile);
    res.json({ ok: true });
  });

  // ---------- 科目 ----------
  app.get('/api/subjects', (_req: Request, res: Response) => {
    res.json(store.listSubjects());
  });

  app.post('/api/subjects', (req: Request, res: Response) => {
    const { name, color } = req.body as { name: string; color: string };
    res.json(store.createSubject(name, color));
  });

  app.delete('/api/subjects/:id', (req: Request, res: Response) => {
    if (req.params.id === '__knowledge_base__') {
      res.status(403).json({ error: '知识库科目不可删除' });
      return;
    }
    store.deleteSubject(req.params.id);
    res.json({ ok: true });
  });

  // ---------- 资料 ----------
  app.get('/api/subjects/:id/materials', (req: Request, res: Response) => {
    res.json(store.getMaterials(req.params.id));
  });

  // 文件上传：multipart/form-data
  app.post(
    '/api/subjects/:id/materials',
    upload.array('files[]'),
    (req: Request, res: Response) => {
      const subjectId = req.params.id;
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        res.json([]);
        return;
      }

      // 先创建 parsing 状态记录并立即返回
      const created: Material[] = files.map((f) => {
        const material: Material = {
          id: uuidv4(),
          subject_id: subjectId,
          filename: f.originalname,
          filetype: getFileType(f.originalname),
          size: f.size,
          status: 'parsing',
          text_content: '',
          created_at: now(),
        };
        store.addMaterial(material);
        return material;
      });

      // 异步解析，逐个更新并通过 SSE 推送
      const apiConfig = getConfig();
      created.forEach(async (m, i) => {
        try {
          const result = await parseBuffer(files[i].buffer, files[i].originalname, apiConfig);
          store.updateMaterial(m.id, {
            status: 'ready',
            text_content: result.text,
            filetype: result.filetype,
          });
          broadcastSSE('material:updated', {
            id: m.id,
            status: 'ready',
            filetype: result.filetype,
          });
        } catch (err) {
          store.updateMaterial(m.id, { status: 'failed' });
          broadcastSSE('material:updated', { id: m.id, status: 'failed' });
        }
      });

      res.json(created);
    },
  );

  app.patch('/api/materials/:id', (req: Request, res: Response) => {
    store.updateMaterial(req.params.id, req.body as Partial<Material>);
    res.json({ ok: true });
  });

  app.delete('/api/materials/:id', (req: Request, res: Response) => {
    store.deleteMaterial(req.params.id);
    res.json({ ok: true });
  });

  // ---------- 对话 ----------
  app.get('/api/subjects/:id/chats', (req: Request, res: Response) => {
    res.json(store.listChatSessions(req.params.id));
  });

  app.post('/api/chats', (req: Request, res: Response) => {
    store.saveChatSession(req.body as ChatSession);
    res.json({ ok: true });
  });

  app.delete('/api/chats/:id', (req: Request, res: Response) => {
    store.deleteChatSession(req.params.id);
    res.json({ ok: true });
  });

  // ---------- 复习资料 ----------
  app.get('/api/subjects/:id/reviews', (req: Request, res: Response) => {
    res.json(store.listReviewDocs(req.params.id));
  });

  app.post('/api/reviews', (req: Request, res: Response) => {
    store.saveReviewDoc(req.body as ReviewDoc);
    res.json({ ok: true });
  });

  app.delete('/api/reviews/:id', (req: Request, res: Response) => {
    store.deleteReviewDoc(req.params.id);
    res.json({ ok: true });
  });

  // ---------- 测验 ----------
  app.get('/api/subjects/:id/quizzes', (req: Request, res: Response) => {
    res.json(store.listQuizSessions(req.params.id));
  });

  app.post('/api/quizzes', (req: Request, res: Response) => {
    store.saveQuizSession(req.body as QuizSession);
    res.json({ ok: true });
  });

  app.delete('/api/quizzes/:id', (req: Request, res: Response) => {
    store.deleteQuizSession(req.params.id);
    res.json({ ok: true });
  });

  // ---------- 错题本 ----------
  app.get('/api/wrong-questions', (req: Request, res: Response) => {
    const subjectId = req.query.subjectId as string | undefined;
    res.json(store.listWrongQuestions(subjectId));
  });

  app.post('/api/wrong-questions', (req: Request, res: Response) => {
    store.addWrongQuestion(req.body as WrongQuestion);
    res.json({ ok: true });
  });

  app.delete('/api/wrong-questions/:id', (req: Request, res: Response) => {
    store.deleteWrongQuestion(req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/wrong-questions/:id/reviewed', (req: Request, res: Response) => {
    const { reviewed } = req.body as { reviewed: boolean };
    store.markWrongReviewed(req.params.id, reviewed);
    res.json({ ok: true });
  });

  app.get('/api/subjects/:id/wrong-quiz', (req: Request, res: Response) => {
    const count = parseInt(req.query.count as string, 10) || 10;
    res.json(store.getWrongQuestionsForQuiz(req.params.id, count));
  });

  // ---------- 检索索引缓存 ----------
  app.put('/api/subjects/:id/index', (req: Request, res: Response) => {
    store.saveSubjectIndex(req.params.id, req.body as store.SubjectIndexData);
    res.json({ ok: true });
  });

  app.get('/api/subjects/:id/index', (req: Request, res: Response) => {
    res.json(store.loadSubjectIndex(req.params.id) ?? null);
  });

  // ---------- 缓存清理 ----------
  app.post('/api/cache', (req: Request, res: Response) => {
    store.clearCache(req.body.types as string[]);
    res.json({ ok: true });
  });

  app.delete('/api/parse-cache', (_req: Request, res: Response) => {
    // Web 版无独立解析缓存目录，清空 chunks 即可
    res.json({ ok: true });
  });

  // ---------- SSE 事件推送（material:updated） ----------
  app.get('/api/events', (req: Request, res: Response) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('data: {"type":"connected"}\n\n');
    sseClients.add(res as unknown as ServerResponse);
    req.on('close', () => {
      sseClients.delete(res as unknown as ServerResponse);
    });
  });

  // ---------- LLM 流式调用（SSE） ----------
  app.post('/api/llm/stream', (req: Request, res: Response) => {
    const opts = req.body as LlmStreamOptions & { requestId?: string };
    const requestId = opts.requestId || uuidv4();

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // 发送 init 事件，携带 requestId
    res.write(`data: ${JSON.stringify({ type: 'init', requestId })}\n\n`);

    const handle = streamChat(
      {
        config: opts.config,
        messages: opts.messages,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        stream: true,
      },
      {
        onToken: (token) => {
          try {
            res.write(`data: ${JSON.stringify({ type: 'token', requestId, token })}\n\n`);
          } catch {
            // 客户端可能已断开
          }
        },
        onDone: (full) => {
          activeStreams.delete(requestId);
          try {
            res.write(`data: ${JSON.stringify({ type: 'done', requestId, full })}\n\n`);
            res.end();
          } catch {
            // 忽略
          }
        },
        onError: (message) => {
          activeStreams.delete(requestId);
          try {
            res.write(`data: ${JSON.stringify({ type: 'error', requestId, message })}\n\n`);
            res.end();
          } catch {
            // 忽略
          }
        },
      },
    );

    activeStreams.set(requestId, handle);

    // 客户端断开时中止上游请求
    req.on('close', () => {
      handle.abort();
      activeStreams.delete(requestId);
    });
  });

  app.post('/api/llm/abort/:requestId', (req: Request, res: Response) => {
    const handle = activeStreams.get(req.params.requestId);
    if (handle) {
      handle.abort();
      activeStreams.delete(req.params.requestId);
    }
    res.json({ ok: true });
  });

  app.post('/api/llm/json', async (req: Request, res: Response) => {
    const opts = req.body as LlmStreamOptions;
    try {
      const content = await chatJSON({
        config: opts.config,
        messages: opts.messages,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        stream: false,
      });
      res.json({ ok: true, content });
    } catch (e) {
      res.json({ ok: false, error: (e as Error).message });
    }
  });

  // ---------- 知识库（共享只读，在共享上下文中执行） ----------
  // GET /api/knowledge/catalog — 返回分类树和文章列表
  app.get('/api/knowledge/catalog', async (_req: Request, res: Response) => {
    try {
      const { CATALOG, CATEGORIES } = await import('./knowledge/catalog');
      res.json({ categories: CATEGORIES, articles: CATALOG });
    } catch {
      res.json({ categories: [], articles: [] });
    }
  });

  // GET /api/knowledge/* — 返回单篇文章内容（slug 含分类前缀如 ds/array-linkedlist）
  app.get('/api/knowledge/*', async (req: Request, res: Response) => {
    try {
      const slug = req.params[0];
      const { CATALOG } = await import('./knowledge/catalog');
      const article = CATALOG.find((a) => a.slug === slug);
      if (!article) {
        res.status(404).json({ error: '文章不存在' });
        return;
      }
      // 知识库存储在共享上下文中，需要切换
      const mat = store.runAsShared(() => {
        const materials = store.getMaterials('__knowledge_base__');
        return materials.find((m) => m.filename === `${article.title}.md`);
      });
      if (!mat) {
        res.status(404).json({ error: '资料未找到' });
        return;
      }
      res.json({ article, content: mat.text_content, materialId: mat.id });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
}
