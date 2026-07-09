// 演示数据预置：一键加载"数据结构"科目 + 4 份真实课件 + 测验 + 错题 + 对话 + 复习资料
// 评委打开即可体验完整流程，无需手动上传 PDF
import type {
  Subject,
  Material,
  QuizSession,
  QuizQuestion,
  WrongQuestion,
  ChatSession,
  ReviewDoc,
} from '@/shared/types'
import { submitParseTask } from './worker-pool'
import {
  put,
  bulkPut,
  openDB,
} from './db'

const DEMO_SUBJECT_NAME = '数据结构'
const DEMO_FLAG = 'demo_loaded'

const DEMO_FILES = [
  { url: '/demo/ch01-intro.pdf', name: '第1章 绪论.pdf', chapter: '绪论' },
  { url: '/demo/ch03-stack-queue.pdf', name: '第3章 栈与队列.pdf', chapter: '栈与队列' },
  { url: '/demo/ch05-tree.pdf', name: '第5章 树.pdf', chapter: '树' },
  { url: '/demo/ch07-dp.pdf', name: '第7章 动态规划.pdf', chapter: '动态规划' },
]

export interface DemoProgress {
  phase: 'parsing' | 'quiz' | 'done'
  current: number
  total: number
  message: string
}

export async function isDemoLoaded(): Promise<boolean> {
  try {
    return localStorage.getItem(DEMO_FLAG) === 'true'
  } catch {
    return false
  }
}

export async function loadDemoData(
  onProgress?: (p: DemoProgress) => void,
): Promise<void> {
  await openDB()

  // 创建科目
  const subjectId = crypto.randomUUID()
  const subject: Subject = {
    id: subjectId,
    name: DEMO_SUBJECT_NAME,
    color: '#3b82f6',
    created_at: Date.now(),
  }
  await put('subjects', subject)

  // 解析 4 份 PDF 课件
  const materials: Material[] = []
  for (let i = 0; i < DEMO_FILES.length; i++) {
    const f = DEMO_FILES[i]
    onProgress?.({
      phase: 'parsing',
      current: i,
      total: DEMO_FILES.length,
      message: `正在解析 ${f.name}…`,
    })

    const matId = crypto.randomUUID()
    const material: Material = {
      id: matId,
      subject_id: subjectId,
      filename: f.name,
      filetype: 'pdf',
      size: 0,
      status: 'parsing',
      text_content: '',
      created_at: Date.now() - (DEMO_FILES.length - i) * 86400000,
      tag: 'lecture',
    }
    await put('materials', material)

    try {
      const res = await fetch(f.url)
      const blob = await res.blob()
      const file = new File([blob], f.name, { type: 'application/pdf' })
      const result = await submitParseTask(file)
      const updated: Material = {
        ...material,
        status: 'ready',
        text_content: result.text,
        filetype: result.filetype,
        size: blob.size,
      }
      await put('materials', updated)
      materials.push(updated)
    } catch {
      const updated: Material = { ...material, status: 'failed' }
      await put('materials', updated)
      materials.push(updated)
    }
  }

  // 预置测验（5 道题，3 道错题覆盖"树"和"动态规划"）
  onProgress?.({ phase: 'quiz', current: 0, total: 1, message: '生成示例测验与错题…' })
  const quizId = crypto.randomUUID()
  const now = Date.now()
  const questions: QuizQuestion[] = [
    {
      id: crypto.randomUUID(),
      session_id: quizId,
      type: 'single',
      question: '栈的特点是：',
      options: ['先进先出', '先进后出', '随机访问', '双端访问'],
      answer: '先进后出',
      user_answer: '先进后出',
      correct: true,
      explanation: '栈是后进先出（LIFO）的线性结构，只允许在栈顶进行插入和删除。',
      chapter: '栈与队列',
    },
    {
      id: crypto.randomUUID(),
      session_id: quizId,
      type: 'single',
      question: '深度为 k 的完全二叉树至少有多少个结点？',
      options: ['2^k - 1', '2^(k-1)', '2^(k-1) - 1', '2^k'],
      answer: '2^(k-1)',
      user_answer: '2^k - 1',
      correct: false,
      explanation: '完全二叉树深度为 k 时，至少有 2^(k-1) 个结点（第 k 层至少有 1 个），最多有 2^k - 1 个结点。',
      chapter: '树',
    },
    {
      id: crypto.randomUUID(),
      session_id: quizId,
      type: 'single',
      question: '对二叉排序树进行中序遍历，得到的序列是：',
      options: ['无序的', '降序排列', '升序排列', '随机排列'],
      answer: '升序排列',
      user_answer: '降序排列',
      correct: false,
      explanation: '二叉排序树的中序遍历序列是一个递增的有序序列，这是 BST 的核心性质。',
      chapter: '树',
    },
    {
      id: crypto.randomUUID(),
      session_id: quizId,
      type: 'single',
      question: '动态规划算法的基本要素是：',
      options: ['贪心选择性质', '最优子结构和重叠子问题', '分治策略', '回溯法'],
      answer: '最优子结构和重叠子问题',
      user_answer: '贪心选择性质',
      correct: false,
      explanation: '动态规划的两个基本要素：最优子结构（问题的最优解包含子问题的最优解）和重叠子问题（子问题被反复计算）。',
      chapter: '动态规划',
    },
    {
      id: crypto.randomUUID(),
      session_id: quizId,
      type: 'single',
      question: '队列的特点是：',
      options: ['先进先出', '先进后出', '随机访问', '双端访问'],
      answer: '先进先出',
      user_answer: '先进先出',
      correct: true,
      explanation: '队列是先进先出（FIFO）的线性结构，允许在队尾插入、队头删除。',
      chapter: '栈与队列',
    },
  ]

  const quizSession: QuizSession = {
    id: quizId,
    subject_id: subjectId,
    title: '数据结构基础测验',
    score: 2,
    total: 5,
    questions,
    created_at: now - 3600000,
  }
  await put('quizSessions', quizSession)

  // 错题（3 道未复习 → 触发 SOLO Agent 薄弱章节预警）
  const wrongQuestions: WrongQuestion[] = questions
    .filter((q) => !q.correct)
    .map((q) => ({
      id: crypto.randomUUID(),
      subject_id: subjectId,
      quiz_session_id: quizId,
      question: q,
      user_answer: q.user_answer,
      correct_answer: q.answer,
      explanation: q.explanation,
      source: materials.find((m) => m.filename.includes(q.chapter!))?.filename,
      created_at: now - 3600000,
      reviewed: false,
      review_count: 0,
      difficulty: '中档' as const,
    }))
  await bulkPut('wrongQuestions', wrongQuestions)

  // 预置 1 条对话记录
  const chatSession: ChatSession = {
    id: crypto.randomUUID(),
    title: '二叉树遍历的概念',
    subject_id: subjectId,
    material_ids: materials.map((m) => m.id),
    messages: [
      {
        id: crypto.randomUUID(),
        session_id: '',
        role: 'user',
        content: '什么是二叉树的中序遍历？',
        created_at: now - 7200000,
      },
      {
        id: crypto.randomUUID(),
        session_id: '',
        role: 'assistant',
        content:
          '## 二叉树的中序遍历\n\n中序遍历（In-order Traversal）是二叉树遍历的一种方式，访问顺序为：**左子树 → 根结点 → 右子树**。\n\n### 特点\n\n对于**二叉搜索树（BST）**，中序遍历会得到一个**升序排列**的节点序列，这是 BST 最重要的性质之一。\n\n### 示例\n\n```\n       4\n      / \\\n     2   6\n    / \\ / \\\n   1  3 5  7\n```\n\n中序遍历结果：`1 → 2 → 3 → 4 → 5 → 6 → 7`\n\n### 递归实现\n\n```python\ndef inorder(node):\n    if node is None:\n        return\n    inorder(node.left)\n    print(node.val)\n    inorder(node.right)\n```\n\n### 应用\n- 验证 BST 合法性\n- 排序树中的节点\n- 表达式树求值',
        created_at: now - 7180000,
      },
    ],
    created_at: now - 7200000,
  }
  await put('chatSessions', chatSession)

  // 预置 1 份复习资料（树章节摘要）
  const reviewDoc: ReviewDoc = {
    id: crypto.randomUUID(),
    subject_id: subjectId,
    type: 'summary',
    title: '第5章 树 — 知识摘要',
    content:
      '# 第5章 树\n\n## 核心概念\n- **二叉树**：每个节点最多两个子节点\n- **满二叉树**：每层都满\n- **完全二叉树**：除最后一层外都满，最后一层从左到右连续\n\n## 遍历方式\n| 遍历 | 顺序 | 特点 |\n|------|------|------|\n| 前序 | 根→左→右 | 复制树结构 |\n| 中序 | 左→根→右 | BST 升序 |\n| 后序 | 左→右→根 | 释放树 |\n| 层序 | 逐层 | BFS |\n\n## 重要性质\n1. 第 i 层最多 2^(i-1) 个节点\n2. 深度 k 的二叉树最多 2^k - 1 个节点\n3. n₀ = n₂ + 1（叶子节点 = 度为 2 的节点 + 1）\n\n## 常见考点\n- BST 的中序遍历是升序序列\n- 完全二叉树的节点编号关系（父 i，左 2i，右 2i+1）\n- 哈夫曼树没有度为 1 的节点',
    created_at: now - 86400000,
  }
  await put('reviewDocs', reviewDoc)

  // 标记已加载
  try {
    localStorage.setItem(DEMO_FLAG, 'true')
  } catch {
    // localStorage 不可用时忽略
  }

  onProgress?.({ phase: 'done', current: DEMO_FILES.length, total: DEMO_FILES.length, message: '示例数据加载完成' })
}
