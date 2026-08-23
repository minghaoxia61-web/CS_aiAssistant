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
  Edit3,
  GitBranch,
  Loader2,
  MessageSquareText,
  Play,
  RefreshCw,
  Route,
  ShieldAlert,
  Target,
  WandSparkles,
} from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import { useStore } from '@/lib/store'
import { chunkMaterials } from '@/lib/rag'
import {
  buildRagEvaluationCases,
  calculateGroundingStats,
  runRagAblation,
  type RagAblationResult,
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
import { summarizeAnswerQuality } from '@/lib/answer-evaluation'
import {
  generateSemanticGraph,
  loadSemanticGraph,
  updateSemanticNode,
  type SemanticKnowledgeGraph,
} from '@/lib/semantic-graph'
import { buildStudentModel } from '@/lib/student-model'
import { buildKnowledgeTracingModel } from '@/lib/knowledge-tracing'
import {
  createLearningAgentRun,
  loadLearningAgentRun,
  nextAgentAction,
  reconcileLearningAgentRun,
  saveLearningAgentRun,
  startNextAgentAction,
  type LearningAgentInput,
  type LearningAgentRun,
} from '@/lib/learning-agent'
import { promptDialog } from '@/lib/dialog'
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

const RETRIEVAL_LABEL = {
  bm25: 'BM25',
  ngram: 'N-gram',
  'lexical-hybrid': '混合检索',
  'semantic-hybrid': '语义混合',
} as const

export default function LearningLab() {
  const navigate = useNavigate()
  const { currentSubjectId, subjects, config } = useStore()
  const [data, setData] = useState<LabData>(EMPTY)
  const [dataLoaded, setDataLoaded] = useState(false)
  const [benchmark, setBenchmark] = useState<RagBenchmark | null>(null)
  const [ablation, setAblation] = useState<RagAblationResult | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [semanticGraph, setSemanticGraph] = useState<SemanticKnowledgeGraph | null>(null)
  const [generatingGraph, setGeneratingGraph] = useState(false)
  const [graphMessage, setGraphMessage] = useState('')
  const [agentRun, setAgentRun] = useState<LearningAgentRun | null>(null)
  const subject = subjects.find((item) => item.id === currentSubjectId)

  useEffect(() => {
    if (!currentSubjectId) {
      setData(EMPTY)
      setDataLoaded(false)
      setBenchmark(null)
      setAblation(null)
      setAgentRun(null)
      return
    }
    let cancelled = false
    setDataLoaded(false)
    Promise.all([
      window.api.getMaterials(currentSubjectId),
      window.api.listQuizSessions(currentSubjectId),
      window.api.listWrongQuestions(currentSubjectId),
      window.api.listChatSessions(currentSubjectId),
    ]).then(([materials, quizzes, wrongQuestions, chats]) => {
      if (!cancelled) {
        setData({ materials, quizzes, wrongQuestions, chats })
        setDataLoaded(true)
      }
    })
    try {
      const cached = localStorage.getItem(`cs_rag_ablation:v2:${currentSubjectId}`)
      const parsed = cached ? (JSON.parse(cached) as RagAblationResult) : null
      setAblation(parsed)
      setBenchmark(parsed?.benchmarks.find((item) => item.strategy === parsed.bestStrategy) || null)
    } catch {
      setBenchmark(null)
      setAblation(null)
    }
    setSemanticGraph(loadSemanticGraph(currentSubjectId))
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
  const knowledgeTracing = useMemo(
    () => buildKnowledgeTracingModel(data.quizzes),
    [data.quizzes],
  )
  const decisionMastery = useMemo(() => mastery.map((item) => {
    const trace = knowledgeTracing.trajectories.find((candidate) => candidate.chapter === item.title)
    if (!trace) return item
    const status: MasteryStatus = trace.mastery < 50
      ? 'weak'
      : trace.mastery < 80
        ? 'developing'
        : 'mastered'
    return {
      ...item,
      score: trace.mastery,
      confidence: trace.confidence,
      attempts: trace.attempts,
      status,
    }
  }), [knowledgeTracing, mastery])
  const plan = useMemo(
    () => buildAdaptivePlan(decisionMastery, data.wrongQuestions),
    [decisionMastery, data.wrongQuestions],
  )
  const grounding = useMemo(() => calculateGroundingStats(data.chats), [data.chats])
  const answerQuality = useMemo(() => summarizeAnswerQuality(data.chats), [data.chats])
  const studentModel = useMemo(
    () => buildStudentModel(data.quizzes, data.wrongQuestions),
    [data.quizzes, data.wrongQuestions],
  )
  const agentInput = useMemo<LearningAgentInput | null>(() => currentSubjectId && subject
    ? {
        subjectId: currentSubjectId,
        subjectName: subject.name,
        materials: readyMaterials,
        quizzes: data.quizzes,
        wrongQuestions: data.wrongQuestions,
        chats: data.chats,
      }
    : null,
  [currentSubjectId, data.chats, data.quizzes, data.wrongQuestions, readyMaterials, subject])

  useEffect(() => {
    if (!dataLoaded || !agentInput) return
    const saved = loadLearningAgentRun(agentInput.subjectId)
    const shouldReplan = !saved ||
      (saved.status === 'blocked' && (agentInput.quizzes.length > 0 || agentInput.wrongQuestions.length > 0))
    const next = shouldReplan
      ? createLearningAgentRun(agentInput)
      : reconcileLearningAgentRun(saved, agentInput)
    saveLearningAgentRun(next)
    setAgentRun(next)
  }, [agentInput, dataLoaded])
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) || graph.nodes[0]
  const mastered = decisionMastery.filter((item) => item.status === 'mastered').length
  const evaluated = decisionMastery.filter((item) => item.attempts > 0).length
  const masteryRows = knowledgeTracing.trajectories.length
    ? knowledgeTracing.trajectories.map((item) => {
        const baseline = studentModel.trajectories.find((candidate) => candidate.chapter === item.chapter)
        return {
          id: item.chapter,
          title: item.chapter,
          status: (item.mastery < 50 ? 'weak' : item.mastery < 80 ? 'developing' : 'mastered') as MasteryStatus,
          attempts: item.attempts,
          confidence: item.confidence,
          score: item.mastery,
          detail: `下题答对 ${item.predictedCorrect}% · 置信 ${item.confidence}% · 经验基线 ${baseline?.mastery ?? '--'}% · 下次 ${item.nextDifficulty}`,
        }
      })
    : decisionMastery.map((item) => ({
        ...item,
        detail: `${STATUS_LABEL[item.status]} · ${item.attempts} 次证据 · 置信度 ${item.confidence}%`,
      }))

  const handleBenchmark = () => {
    if (!currentSubjectId || chunks.length === 0) return
    const result = runRagAblation(
      chunks,
      buildRagEvaluationCases(chunks, 16),
      currentSubjectId,
    )
    const best = result.benchmarks.find((item) => item.strategy === result.bestStrategy) || null
    setAblation(result)
    setBenchmark(best)
    localStorage.setItem(`cs_rag_ablation:v2:${currentSubjectId}`, JSON.stringify(result))
  }

  const enhanceGraph = async () => {
    if (!currentSubjectId || !config || generatingGraph) return
    setGeneratingGraph(true)
    setGraphMessage('')
    try {
      const generated = await generateSemanticGraph(currentSubjectId, readyMaterials, config)
      setSemanticGraph(generated)
      setGraphMessage(`已从课件提取 ${generated.nodes.length} 个语义节点和 ${generated.edges.length} 条关系。`)
    } catch (error) {
      setGraphMessage(`图谱生成失败：${(error as Error).message}`)
    } finally {
      setGeneratingGraph(false)
    }
  }

  const editSemanticNode = async (nodeId: string, currentTitle: string) => {
    if (!semanticGraph) return
    const title = await promptDialog('修改知识节点名称', {
      title: '人工校正图谱',
      defaultValue: currentTitle,
      confirmText: '保存并标记已验证',
    })
    if (!title?.trim()) return
    setSemanticGraph(updateSemanticNode(semanticGraph, nodeId, { title: title.trim(), verified: true }))
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

  const replanAgent = () => {
    if (!agentInput) return
    const next = createLearningAgentRun(agentInput)
    saveLearningAgentRun(next)
    setAgentRun(next)
  }

  const executeAgentAction = () => {
    if (!agentRun) return
    const action = nextAgentAction(agentRun)
    if (!action) return
    const next = startNextAgentAction(agentRun)
    saveLearningAgentRun(next)
    setAgentRun(next)
    useStore.getState().selectSubject(agentRun.subjectId)
    if (action.kind === 'chat' && action.prompt) {
      sessionStorage.setItem('cs_chat_prefill', action.prompt)
      if (agentRun.evidence[0]) {
        sessionStorage.setItem('cs_chat_material_id', agentRun.evidence[0].materialId)
      }
      navigate(action.path)
      return
    }
    if (action.kind === 'quiz') {
      navigate(action.path, {
        state: {
          adaptiveChapters: [action.chapter],
          adaptiveDifficulty: agentRun.predictedCorrect && agentRun.predictedCorrect >= 70 ? '中档' : '基础',
        },
      })
      return
    }
    navigate(action.path)
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
              <p>在同一批定位问题上对比 BM25、N-gram 与混合检索，统计 MRR、Recall@5 与 nDCG@5。</p>
            </div>
            <button className="btn-outline" onClick={handleBenchmark}>
              <RefreshCw className="w-4 h-4" />
              {benchmark ? '重新评测' : '运行评测'}
            </button>
          </div>

          {ablation && (
            <div className="ablation-grid" aria-label="检索策略消融实验">
              {ablation.benchmarks.map((item) => (
                <div
                  className={cn('ablation-card', item.strategy === ablation.bestStrategy && 'is-best')}
                  key={item.strategy}
                >
                  <span>{RETRIEVAL_LABEL[item.strategy]}</span>
                  <strong>Hit@3 {item.hitAt3}%</strong>
                  <small>MRR {item.meanReciprocalRank}% · nDCG {item.ndcgAt5}% · {item.durationMs} ms</small>
                  {item.strategy === ablation.bestStrategy && <em>当前最佳</em>}
                </div>
              ))}
            </div>
          )}

          <div className="lab-metric-grid">
            <LabMetric value={benchmark ? `${benchmark.hitAt1}%` : '--'} label="Hit@1" />
            <LabMetric value={benchmark ? `${benchmark.hitAt3}%` : '--'} label="Hit@3" />
            <LabMetric value={benchmark ? `${benchmark.hitAt5}%` : '--'} label="Hit@5" />
            <LabMetric value={benchmark ? `${benchmark.meanReciprocalRank}%` : '--'} label="MRR" />
            <LabMetric value={benchmark ? `${benchmark.recallAt5}%` : '--'} label="Recall@5" />
            <LabMetric value={benchmark ? `${benchmark.ndcgAt5}%` : '--'} label="nDCG@5" />
            {benchmark?.unanswerableCount ? (
              <LabMetric value={`${benchmark.answerabilityAccuracy}%`} label="可回答性判断" />
            ) : null}
            <LabMetric value={`${answerQuality.evidenceAlignment}%`} label="答案证据一致性" />
            <LabMetric value={`${answerQuality.citationValidity}%`} label="引用有效率" />
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
                共 {benchmark.caseCount} 个当前科目自检用例 · 覆盖 {benchmark.materialCoverage}% 的资料 · 当前最佳 {RETRIEVAL_LABEL[benchmark.strategy]}
              </p>
            </div>
          ) : (
            <div className="lab-empty-strip">
              <Target className="w-5 h-5" />
              <span>点击“运行评测”，建立当前资料的第一版可重复检索基线。</span>
            </div>
          )}
          {answerQuality.evaluatedAnswers > 0 && (
            <div className={cn('answer-quality-strip', answerQuality.highRiskAnswers > 0 && 'has-risk')}>
              <ShieldAlert className="w-4 h-4" />
              <span>
                已评估 {answerQuality.evaluatedAnswers} 条回答，其中 {answerQuality.highRiskAnswers} 条存在较高幻觉风险；
                无证据问题的正确拒答率为 {answerQuality.refusalAccuracy}%。
              </span>
              <small>用户引用覆盖率 {grounding.citationCoverage}%</small>
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
            <div className="page-actions">
              <span className="lab-badge"><GitBranch className="w-3.5 h-3.5" /> {semanticGraph?.edges.length || graph.edges.length} 条关系</span>
              <button className="btn-outline" onClick={enhanceGraph} disabled={!config || generatingGraph}>
                {generatingGraph ? <Loader2 className="w-4 h-4 animate-spin" /> : <WandSparkles className="w-4 h-4" />}
                {semanticGraph ? '重新提取语义图谱' : 'AI 增强图谱'}
              </button>
            </div>
          </div>

          {graphMessage && <p className="text-[10px] text-[var(--accent)] mb-3">{graphMessage}</p>}
          {semanticGraph && semanticGraph.nodes.length > 0 && (
            <div className="semantic-graph-panel">
              <div className="semantic-node-grid">
                {semanticGraph.nodes.slice(0, 12).map((node) => (
                  <div key={node.id} className="semantic-node">
                    <span>{node.kind}</span>
                    <strong>{node.title}</strong>
                    <p>{node.definition}</p>
                    <small>{node.locator} · 可信度 {node.confidence}%</small>
                    <blockquote>{node.evidence}</blockquote>
                    <button onClick={() => void editSemanticNode(node.id, node.title)}>
                      <Edit3 className="w-3 h-3" />{node.verified ? '已人工验证' : '校正'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="knowledge-map-layout">
            <div className="knowledge-node-list">
              {graph.nodes.slice(0, 40).map((node) => {
                const nodeMastery = decisionMastery.find((item) => item.id === node.id)
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
              <p>BKT 按作答序列逐次更新掌握概率，并与原有经验正确率模型做严格时序预测对照。</p>
            </div>
            <span className="lab-badge"><Route className="w-3.5 h-3.5" /> 预计 {plan.reduce((sum, item) => sum + item.minutes, 0)} 分钟</span>
          </div>

          {knowledgeTracing.evaluation.sampleCount > 0 && (
            <div className="kt-comparison">
              <div>
                <span>严格时序评测</span>
                <strong>{knowledgeTracing.evaluation.sampleCount} 次作答</strong>
                <small>{knowledgeTracing.calibration.status === 'fitted'
                  ? `参数已拟合 · 留出集 Log Loss 改善 ${knowledgeTracing.calibration.logLossImprovement?.toFixed(3)}`
                  : knowledgeTracing.calibration.status === 'fallback_no_improvement'
                    ? '拟合未改善留出集，已回退默认参数'
                    : '样本不足，使用文献经验参数'}</small>
              </div>
              <div className={cn(knowledgeTracing.evaluation.winner === 'bkt' && 'is-winner')}>
                <span>BKT</span>
                <strong>{knowledgeTracing.evaluation.bkt.brierScore.toFixed(3)}</strong>
                <small>Brier ↓ · 准确率 {knowledgeTracing.evaluation.bkt.accuracy}%</small>
              </div>
              <div className={cn(knowledgeTracing.evaluation.winner === 'heuristic' && 'is-winner')}>
                <span>经验基线</span>
                <strong>{knowledgeTracing.evaluation.heuristicBaseline.brierScore.toFixed(3)}</strong>
                <small>Brier ↓ · 准确率 {knowledgeTracing.evaluation.heuristicBaseline.accuracy}%</small>
              </div>
              <div>
                <span>校准误差</span>
                <strong>{knowledgeTracing.evaluation.bkt.calibrationError.toFixed(3)}</strong>
                <small>BKT ECE ↓ · {knowledgeTracing.evaluation.winner === 'tie' ? '两者接近' : knowledgeTracing.evaluation.winner === 'bkt' ? 'BKT 更优' : '基线更优'}</small>
              </div>
            </div>
          )}

          <div className="adaptive-layout">
            <div className="mastery-list">
              {masteryRows.slice(0, 10).map((item) => (
                <div className="mastery-row" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
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
          {studentModel.trajectories.length > 0 && (
            <div className="error-distribution">
              <span>错误归因</span>
              <div><strong>{studentModel.errorDistribution.knowledge_gap}</strong><small>知识缺口</small></div>
              <div><strong>{studentModel.errorDistribution.misconception}</strong><small>概念混淆</small></div>
              <div><strong>{studentModel.errorDistribution.careless}</strong><small>粗心失误</small></div>
              <div><strong>{studentModel.errorDistribution.forgotten}</strong><small>遗忘回退</small></div>
            </div>
          )}
        </section>

        {agentRun && (
          <section className="panel p-5 agent-orchestrator">
            <div className="lab-section-heading">
              <div>
                <span className="eyebrow">04 · Observable learning agent</span>
                <h3>可观察学习 Agent</h3>
                <p>每一步都保留数据依据、课件证据和状态转移；未验证前不会自动宣称已掌握。</p>
              </div>
              <div className="page-actions">
                <span className={cn('lab-badge', agentRun.status === 'blocked' && 'has-risk')}>
                  <BrainCircuit className="w-3.5 h-3.5" />
                  {agentRun.status === 'complete' ? '闭环已完成' : agentRun.status === 'blocked' ? '安全阻断' : agentRun.status === 'waiting_verification' ? '等待验证' : '计划就绪'}
                </span>
                <button className="btn-outline" onClick={replanAgent}>
                  <RefreshCw className="w-4 h-4" /> 重新规划
                </button>
              </div>
            </div>

            <div className="agent-summary">
              <div><span>目标知识点</span><strong>{agentRun.chapter || '待收集数据'}</strong></div>
              <div><span>诊断</span><strong>{agentRun.diagnosisLabel || '暂无'}</strong></div>
              <div><span>BKT 掌握变化</span><strong>{agentRun.masteryBefore ?? '--'}% → {agentRun.masteryAfter ?? '待验证'}{typeof agentRun.masteryAfter === 'number' ? '%' : ''}</strong></div>
              <div><span>证据</span><strong>{agentRun.evidence.length} 条</strong></div>
            </div>

            <div className="agent-trace">
              {agentRun.trace.map((item, index) => (
                <div className={cn('agent-trace-step', `is-${item.status}`)} key={item.state}>
                  <span className="agent-trace-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="agent-trace-dot">
                    {item.status === 'completed' ? <CheckCircle2 className="w-4 h-4" /> : item.status === 'blocked' ? <ShieldAlert className="w-4 h-4" /> : <CircleDot className="w-4 h-4" />}
                  </span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.reasoning}</p>
                    {item.evidence.length > 0 && <small>{item.evidence.join(' · ')}</small>}
                  </div>
                </div>
              ))}
            </div>

            {agentRun.evidence.length > 0 && (
              <div className="agent-evidence-grid">
                {agentRun.evidence.map((item) => (
                  <article key={`${item.materialId}:${item.locator}`}>
                    <span>{item.score}% 相关</span>
                    <strong>{item.materialName}</strong>
                    <small>{item.locator}</small>
                    <p>{item.excerpt}</p>
                  </article>
                ))}
              </div>
            )}

            <div className="agent-footer">
              <div>
                <strong>安全约束</strong>
                <span>{agentRun.guardrails.join(' · ')}</span>
              </div>
              {nextAgentAction(agentRun) && (
                <button className="btn-primary" onClick={executeAgentAction}>
                  <Play className="w-4 h-4" /> {nextAgentAction(agentRun)?.label}
                </button>
              )}
            </div>
          </section>
        )}
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
