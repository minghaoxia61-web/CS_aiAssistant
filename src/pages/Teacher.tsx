import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  BookOpen,
  CalendarClock,
  ClipboardPlus,
  Copy,
  GraduationCap,
  Plus,
  ShieldCheck,
  Users,
} from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import { promptDialog } from '@/lib/dialog'
import { useStore } from '@/lib/store'
import {
  calculateClassKnowledgeStats,
  createAssignment,
  createTeacherClass,
  ensureTeacherCourse,
  loadTeacherWorkspace,
  type TeacherWorkspace,
} from '@/lib/teacher-store'
import type { QuizSession } from '@/shared/types'
import { cn } from '@/lib/utils'

export default function Teacher() {
  const { subjects, currentSubjectId } = useStore()
  const [workspace, setWorkspace] = useState<TeacherWorkspace>(loadTeacherWorkspace)
  const [sessions, setSessions] = useState<QuizSession[]>([])
  const subject = subjects.find((item) => item.id === currentSubjectId)

  useEffect(() => {
    if (!currentSubjectId) {
      setSessions([])
      return
    }
    window.api.listQuizSessions(currentSubjectId).then(setSessions)
  }, [currentSubjectId])

  const course = subject
    ? workspace.courses.find((item) => item.subjectId === subject.id)
    : undefined
  const classes = course
    ? workspace.classes.filter((item) => item.courseId === course.id)
    : []
  const activeClass = classes[0]
  const assignments = activeClass
    ? workspace.assignments.filter((item) => item.classId === activeClass.id)
    : []
  const stats = useMemo(() => calculateClassKnowledgeStats(sessions), [sessions])
  const average = stats.length
    ? Math.round(stats.reduce((sum, item) => sum + item.accuracy, 0) / stats.length)
    : 0

  const createClass = async () => {
    if (!subject) return
    const name = await promptDialog('输入班级名称', {
      title: '创建班级',
      placeholder: '例如：计科 2301 班',
      confirmText: '创建',
    })
    if (!name?.trim()) return
    const ensured = ensureTeacherCourse(workspace, subject)
    setWorkspace(createTeacherClass(ensured.workspace, ensured.course.id, name.trim()))
  }

  const publishAssignment = async () => {
    if (!activeClass) return
    const title = await promptDialog('输入测验任务名称', {
      title: '发布学习任务',
      placeholder: '例如：进程与线程专项测验',
      confirmText: '下一步',
    })
    if (!title?.trim()) return
    const chapter = await promptDialog('指定知识点（可留空）', {
      title: '任务范围',
      placeholder: '例如：进程与线程',
      confirmText: '发布',
    })
    setWorkspace(createAssignment(workspace, activeClass.id, title.trim(), chapter?.trim()))
  }

  if (!subject) {
    return (
      <div className="h-full overflow-y-auto">
        <PageHeader title="教师工作台" subtitle="课程、班级、任务与学情洞察" icon={<GraduationCap className="w-5 h-5" />} />
        <EmptyState icon={<BookOpen className="w-7 h-7" />} title="请先选择一个科目" desc="当前科目会作为教师端课程的数据来源。" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title="教师工作台"
        subtitle={`课程：${subject.name} · 本地优先的班级教学 MVP`}
        icon={<GraduationCap className="w-5 h-5" />}
        actions={
          <div className="page-actions">
            <button className="btn-outline" onClick={createClass}><Plus className="w-4 h-4" />创建班级</button>
            <button className="btn-primary" onClick={publishAssignment} disabled={!activeClass}>
              <ClipboardPlus className="w-4 h-4" />发布任务
            </button>
          </div>
        }
      />

      <div className="page-container teacher-workspace">
        {!activeClass ? (
          <section className="panel p-6">
            <EmptyState
              icon={<Users className="w-7 h-7" />}
              title="创建第一个班级"
              desc="创建后会生成六位邀请码，并可发布测验任务、查看知识点掌握热力图。"
              action={<button className="btn-primary" onClick={createClass}>创建班级</button>}
            />
          </section>
        ) : (
          <>
            <section className="teacher-hero">
              <div>
                <span className="eyebrow">Active class</span>
                <h2>{activeClass.name}</h2>
                <p>课程内容来自“{subject.name}”，教师端只聚合学习结果，不读取学生的模型 API Key。</p>
              </div>
              <button
                className="teacher-code"
                onClick={() => navigator.clipboard.writeText(activeClass.joinCode)}
                title="复制班级邀请码"
              >
                <span>班级邀请码</span>
                <strong>{activeClass.joinCode}</strong>
                <Copy className="w-4 h-4" />
              </button>
            </section>

            <section className="teacher-metrics">
              <TeacherMetric icon={<Users />} value={`${activeClass.studentCount}`} label="已加入学生" />
              <TeacherMetric icon={<ClipboardPlus />} value={`${assignments.length}`} label="已发布任务" />
              <TeacherMetric icon={<BarChart3 />} value={`${average}%`} label="知识点平均正确率" />
              <TeacherMetric icon={<ShieldCheck />} value="隔离" label="教师/学生数据权限" />
            </section>

            <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_.75fr] gap-5">
              <section className="panel p-5">
                <div className="lab-section-heading">
                  <div>
                    <span className="eyebrow">Class heatmap</span>
                    <h3>班级知识点掌握热力图</h3>
                    <p>当前使用本机学习记录作为教师端预览数据；接入云端班级后自动聚合所有学生。</p>
                  </div>
                </div>
                {stats.length ? (
                  <div className="teacher-heatmap">
                    {stats.slice(0, 16).map((item) => (
                      <div key={item.chapter} className={cn('teacher-heat-cell', `risk-${item.risk}`)}>
                        <strong>{item.chapter}</strong>
                        <span>{item.accuracy}%</span>
                        <small>{item.attempts} 次作答</small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="lab-empty-strip"><BarChart3 className="w-5 h-5" />完成测验后生成班级知识点热力图。</div>
                )}
              </section>

              <section className="panel p-5">
                <div className="lab-section-heading">
                  <div>
                    <span className="eyebrow">Assignments</span>
                    <h3>已发布任务</h3>
                  </div>
                </div>
                <div className="teacher-assignment-list">
                  {assignments.length === 0 && <p className="text-xs text-bone-faint">暂未发布任务。</p>}
                  {assignments.map((assignment) => (
                    <div key={assignment.id} className="teacher-assignment">
                      <CalendarClock className="w-4 h-4" />
                      <div>
                        <strong>{assignment.title}</strong>
                        <small>{assignment.chapter || '综合范围'} · 截止 {new Date(assignment.dueAt).toLocaleDateString('zh-CN')}</small>
                      </div>
                      <span>{assignment.status === 'published' ? '已发布' : '草稿'}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function TeacherMetric({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="teacher-metric">
      <span>{icon}</span>
      <div><strong>{value}</strong><small>{label}</small></div>
    </div>
  )
}
