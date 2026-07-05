// 知识库种子注入：服务启动时将预置 CS 知识文章导入为 Material
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as store from '../store';
import { CATALOG } from './catalog';

const KNOWLEDGE_SUBJECT_ID = '__knowledge_base__';

/** 从 markdown 文件内容中读取知识文章 */
function readArticleContent(slug: string): string {
  // 用 process.cwd() 替代 __dirname（兼容 ESM 和 CommonJS）
  const cwd = process.cwd();
  // 候选路径：开发环境源文件 / 生产环境 dist-server 复制件 / Railway 源文件
  const candidates = [
    path.join(cwd, 'server', 'knowledge', `${slug}.md`),
    path.join(cwd, 'dist-server', 'server', 'knowledge', `${slug}.md`),
  ];
  const filePath = candidates.find((p) => fs.existsSync(p));
  try {
    if (filePath) return fs.readFileSync(filePath, 'utf-8');
    return `# 文章加载失败\n\n无法找到文章内容：${slug}`;
  } catch {
    return `# 文章加载失败\n\n无法找到文章内容：${slug}`;
  }
}

/** 种入知识库：创建固定 ID 科目 + 逐篇导入文章 */
export function seedKnowledgeBase(): void {
  try {
    const subjects = store.listSubjects();
    const exists = subjects.find((s) => s.id === KNOWLEDGE_SUBJECT_ID);

    if (!exists) {
      store.createSubjectWithId(KNOWLEDGE_SUBJECT_ID, '计算机知识库', '#4a9eff');
    }

    // 检查是否已种入文章（避免重复导入）
    const existingMaterials = store.getMaterials(KNOWLEDGE_SUBJECT_ID);
    if (existingMaterials.length >= CATALOG.length) return;

    // 导入缺失的文章
    const existingTitles = new Set(existingMaterials.map((m) => m.filename));
    for (const article of CATALOG) {
      const filename = `${article.title}.md`;
      if (existingTitles.has(filename)) continue;

      const content = readArticleContent(article.slug);
      store.addMaterial({
        id: uuidv4(),
        subject_id: KNOWLEDGE_SUBJECT_ID,
        filename,
        filetype: 'md',
        size: content.length,
        status: 'ready',
        text_content: content,
        created_at: Date.now(),
        tag: 'lecture',
      });
    }

    console.log(`知识库种子注入完成：${CATALOG.length} 篇文章`);
  } catch (err) {
    console.error('知识库种子注入失败:', err);
  }
}
