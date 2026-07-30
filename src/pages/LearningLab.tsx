import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Beaker,
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  CircleDot,
  Clock3,
  GitBranch,
  MessageSquareText,
  Play,
  RefreshCw,
  Route,
  Target,
} from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import { useStore } from '@/lib/store'
import { chunkMaterials } from '@/lib/rag'
import {
  buildRagEvaluationCases,
  calculateGroundingStats,
  runRagBenchmark,
  type RagBenchmark,
} from '@/lib/rag-evaluation'
import {
  buildAdaptivePlan,
  buildKnowledgeGraph,
  calculateMastery,
  type AdaptiveTask,
  type KnowledgeNode,
  type MasteryStatus,
} from '@/lib/learning-intelligence'
import { cn } from '@/lib/utils'
import type { ChatSession, Material, QuizSession, WrongQuestion } from '@/shared/types'

interface LabData {
  materials: Material[]
  quizzes: QuizSession[]
  wrongQuestions: WrongQuestion[]
  chats: ChatSession[]
}

const EMPTY: LabData = { materials: [], quizzes: [], wrongQuestions: [], chats: [] }

const STATUS_LABEL: Record<MasteryStatus, string> = {
  unseen: '尚未检验',
  weak: '需要加强',
  developing: '正在掌握',
  mastered: '已经掌握',
}

export default function LearningLab() {
  const navigate = useNavigate()
  const { currentSubjectId, subjects } = useStore()
  const [data, setData] = useState<LabData>(EMPTY)
  const [benchmark, setBenchmark] = useState<RagBenchmark | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const subject = subjects.find((item) => item.id === currentSubjectId)

  useEffect(() => {
    if (!currentSubjectId) {
      setData(EMPTY)
      setBenchmark(null)
      return
    }
    let cancelled = false
    Promise.all([
      window.api.getMaterials(currentSubjectId),
      window.api.listQuizSessions(currentSubjectId),
      window.api.listWrongQuestions(currentSubjectId),
      window.api.listChatSessions(currentSubjectId),
    ]).then(([materials, quizzes, wrongQuestions, chats]) => {
      if (!cancelled) setData({ materials, quizzes, wrongQuestions, chats })
    })
    try {
      const cached = localStorage.getItem(`cs_rag_benchmark:${currentSubjectId}`)
      setBenchmark(cached ? (JSON.parse(cached) as RagBenchmark) : null)
    } catch {
      setBenchmark(null)
    }
    return () => {
      cancelled = true
    }
  }, [currentSubjectId])

  const readyMaterials = useMemo(
    () => data.materials.filter((item) => item.status === 'ready' && item.text_content),
    [data.materials],
  )
  const chunks = useMemo(
    () => chunkMaterials(readyMaterials, currentSubjectId || undefined),
    [readyMaterials, currentSubjectId],
  )
  const graph = useMemo(() => buildKnowledgeGraph(readyMaterials), [readyMaterials])
  const mastery = useMemo(() => calculateMastery(graph, data.quizzes), [graph, data.quizzes])
  const plan = useMemo(
    () => buildAdaptivePlan(mastery, data.wrongQuestions),
    [mastery, data.wrongQuestions],
  )
  const grounding = useMemo(() => calculateGroundingStats(data.chats), [data.chats])
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) || graph.nodes[0]
  const mastered = mastery.filter((item) => item.status === 'mastered').length
  const evaluated = mastery.filter((item) => item.attempts > 0).length

  const handleBenchmark = () => {
    if (!currentSubjectId || chunks.length === 0) return
    const result = runRagBenchmark(
      chunks,
      buildRagEvaluationCases(chunks, 16),
      currentSubjectId,
    )
    setBenchmark(result)
    localStorage.setItem(`cs_rag_benchmark:${currentSubjectId}`, JSON.stringify(result))
  }

  const askNode = (node: KnowledgeNode) => {
    sessionStorage.setItem('cs_chat_prefill', `请结合课件解释“${node.title}”，说明核心概念、前置知识和一个例子。`)
    sessionStorage.setItem('cs_chat_material_id', node.materialId)
    navigate('/chat')
  }

  const practice = (chapter?: string) => {
    navigate('/quiz', {
      state: {
        adaptiveChapters: chapter ? [chapter] : [],
        adaptiveDifficulty: '基础',
      },
    })
  }

  const runTask = (task: AdaptiveTask) => {
    if (task.kind === 'review') {
      navigate('/wrong-book')
    } else if (task.kind === 'practice') {
      practice(task.chapter)
    } else {
      const node = graph.nodes.find((item) => item.title === task.chapter)
      if (node) askNode(node)
      else navigate('/chat')
    }
  }

  if (!currentSubjectId) {
    return (
      <div className="h-full overflow-y-auto">
        <PageHeader title="学习实验室" subtitle="评测检索质量、构建知识地图并生成自适应计划" icon={<Beaker className="w-5 h-5" />} />
        <EmptyState
          icon={<Beaker className="w-7 h-7" />}
          title="请先选择一个科目"
          desc="学习实验室会对当前科目的资料和学习记录进行分析。"
        />
      </div>
    )
  }

  if (readyMaterials.length === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <PageHeader title="学习实验室" subtitle={`当前科目：${subject?.name || ''}`} icon={<Beaker className="w-5 h-5" />} />
        <EmptyState
          icon={<BookOpenCheck className="w-7 h-7" />}
          title="先导入一份课件"
          desc="资料解析完成后，这里会自动建立评测集、知识结构和学习计划。"
          action={<button className="btn-primary" onClick={() => navigate('/library')}>前往资料库</button>}
        />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title="学习实验室"
        subtitle={`当前科目：${subject?.name || ''} · 从资料证据到个性化学习决策`}
        icon={<Beaker className="w-5 h-5" />}
        actions={
          <button className="btn-primary" onClick={() => plan[0] && runTask(plan[0])}>
            <Play className="w-4 h-4" />
            开始今日任务
          </button>
        }
      />

      <div className="page-container learning-lab">
        <section className="lab-overview">
          <div>
            <span className="eyebrow">Learning intelligence</span>
            <h2>学习过程现在可以测量，也可以行动</h2>
            <p>系统会检查资料能否被正确召回，将课件整理成知识依赖关系，并根据真实作答证据安排下一步。</p>
          </div>
          <div className="lab-overview-stats">
            <LabMetric value={benchmark ? `${benchmark.hitAt3}%` : '--'} label="检索 Hit@3" />
            <LabMetric value={`${graph.nodes.length}`} label="知识节点" />
            <LabMetric value={`${mastered}/${evaluated || 0}`} label="已掌握/已检验" />
          </div>
        </section>

        <section className="panel p-5">
          <div className="lab-section-heading">
            <div>
              <span className="eyebrow">01 · Retrieval evaluation</span>
              <h3>RAG 检索基准与回答溯源</h3>
              <p>从当前资料自动建立定位问题，计算目标片段是否出现在前 1、3、5 个结果中。</p>
            </div>
            <button className="btn-outline" onClick={handleBenchmark}>
              <RefreshCw className="w-4 h-4" />
              {benchmark ? '重新评测' : '运行评测'}
            </button>
          </div>

          <div className="lab-metric-grid">
            <LabMetric value={benchmark ? `${benchmark.hitAt1}%` : '--'} label="Hit@1" />
            <LabMetric value={benchmark ? `${benchmark.hitAt3}%` : '--'} label="Hit@3" />
            <LabMetric value={benchmark ? `${benchmark.hitAt5}%` : '--'} label="Hit@5" />
            <LabMetric value={benchmark ? `${benchmark.meanReciprocalRank}%` : '--'} label="MRR" />
            <LabMetric value={`${grounding.citationCoverage}%`} label="回答引用覆盖率" />
            <LabMetric value={`${grounding.incorrectRate}%`} label="用户标记不准确" />
          </div>

          {benchmark ? (
            <div className="benchmark-results">
              {benchmark.results.slice(0, 6).map((item) => (
                <div key={item.id} className="benchmark-row">
                  <span className={cn('benchmark-rank', item.rank ? 'is-hit' : 'is-miss')}>
                    {item.rank ? `#${item.rank}` : 'MISS'}
                  </span>
                  <div>
                    <strong>{item.query}</strong>
                    <small>目标：{item.sourceLabel}</small>
                  </div>
                </div>
              ))}
              <p className="benchmark-note">
                共 {benchmark.caseCount} 个用例 · 覆盖 {benchmark.materialCoverage}% 的资料 · 本地运行 {benchmark.durationMs} ms
              </p>
            </div>
          ) : (
            <div className="lab-empty-strip">
              <Target className="w-5 h-5" />
              <span>点击“运行评测”，建立当前资料的第一版可重复检索基线。</span>
            </div>
          )}
        </section>

        <section className="panel p-5">
          <div className="lab-section-heading">
            <div>
              <span className="eyebrow">02 · Knowledge structure</span>
              <h3>课件知识地图</h3>
              <p>基于标题层级生成包含关系，同级知识点按课件顺序形成前置学习路径。</p>
            </div>
            <span className="lab-badge"><GitBranch className="w-3.5 h-3.5" /> {graph.edges.length} 条关系</span>
          </div>

          <div className="knowledge-map-layout">
            <div className="knowledge-node-list">
              {graph.nodes.slice(0, 40).map((node) => {
                const nodeMastery = mastery.find((item) => item.id === node.id)
                return (
                  <button
                    key={node.id}
                    className={cn('knowledge-node-card', selectedNode?.id === node.id && 'is-selected')}
                    style={{ marginLeft: `${Math.min(3, node.level - 1) * 18}px` }}
                    onClick={() => setSelectedNodeId(node.id)}
                  >
                    <CircleDot className="w-3.5 h-3.5" />
                    <span>
                      <strong>{node.title}</strong>
                      <small>{node.materialName}</small>
                    </span>
                    {nodeMastery && nodeMastery.attempts > 0 && (
                      <em className={`mastery-${nodeMastery.status}`}>{nodeMastery.score}%</em>
                    )}
                  </button>
                )
              })}
            </div>

            {selectedNode && (
              <aside className="knowledge-node-detail">
                <span className="eyebrow">Selected node</span>
                <h4>{selectedNode.title}</h4>
                <p>{selectedNode.summary}</p>
                <dl>
                  <div><dt>来源</dt><dd>{selectedNode.materialName}</dd></div>
                  <div><dt>位置</dt><dd>{selectedNode.locator}</dd></div>
                  <div>
                    <dt>前置节点</dt>
                    <dd>
                      {graph.edges
                        .filter((edge) => edge.to === selectedNode.id)
                        .map((edge) => graph.nodes.find((node) => node.id === edge.from)?.title)
                        .filter(Boolean)
                        .join('、') || '起始节点'}
                    </dd>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-2 mt-5">
                  <button className="btn-primary" onClick={() => askNode(selectedNode)}>
                    <MessageSquareText className="w-4 h-4" /> 基于资料提问
                  </button>
                  <button className="btn-outline" onClick={() => practice(selectedNode.title)}>
                    <Target className="w-4 h-4" /> 专项测验
                  </button>
                </div>
              </aside>
            )}
          </div>
        </section>

        <section className="panel p-5">
          <div className="lab-section-heading">
            <div>
              <span className="eyebrow">03 · Adaptive learning</span>
              <h3>掌握度与今日学习路径</h3>
              <p>综合正确率、作答时间、记录新鲜度和证据数量计算，不再只看一次考试分数。</p>
            </div>
            <span className="lab-badge"><Route className="w-3.5 h-3.5" /> 预计 {plan.reduce((sum, item) => sum + item.minutes, 0)} 分钟</span>
          </div>

          <div className="adaptive-layout">
            <div className="mastery-list">
              {mastery.slice(0, 10).map((item) => (
                <div className="mastery-row" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{STATUS_LABEL[item.status]} · {item.attempts} 次证据 · 置信度 {item.confidence}%</small>
                  </div>
                  <div className="mastery-score">
                    <span>{item.attempts ? `${item.score}%` : '--'}</span>
                    <div><i className={`mastery-${item.status}`} style={{ width: `${item.attempts ? item.score : 4}%` }} /></div>
                  </div>
                </div>
              ))}
            </div>

            <div className="adaptive-plan">
              {plan.map((task, index) => (
                <button key={task.id} className="adaptive-task" onClick={() => runTask(task)}>
                  <span className="adaptive-task-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="flex-1 min-w-0">
                    <strong>{task.title}</strong>
                    <small>{task.description}</small>
                    <em><Clock3 className="w-3 h-3" /> {task.minutes} 分钟</em>
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function LabMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="lab-metric">
      <strong>{value}</strong>
      <span>{label}</span>
      {value !== '--' && value !== '0%' && <CheckCircle2 className="w-3.5 h-3.5" />}
      {value === '--' && <BrainCircuit className="w-3.5 h-3.5" />}
    </div>
  )
}
