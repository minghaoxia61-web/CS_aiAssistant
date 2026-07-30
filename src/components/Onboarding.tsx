import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, BookOpen, Check, FileUp, MessageSquareText, Sparkles, X } from 'lucide-react'

const STEPS = [
  {
    icon: <BookOpen className="w-5 h-5" />,
    title: '创建学习科目',
    description: '按课程或考试目标建立独立空间，让资料、对话和测验保持清晰。',
    action: '/dashboard',
  },
  {
    icon: <FileUp className="w-5 h-5" />,
    title: '上传课程资料',
    description: '支持 PDF、DOCX、PPTX、TXT 与 Markdown，系统会自动建立检索索引。',
    action: '/library',
  },
  {
    icon: <MessageSquareText className="w-5 h-5" />,
    title: '开始问答与测验',
    description: 'AI 会基于你的资料回答，并持续识别薄弱知识点和复习时机。',
    action: '/chat',
  },
]

export default function Onboarding() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(() => localStorage.getItem('cs_onboarding_complete') !== 'true')
  const [step, setStep] = useState(0)

  if (!open) return null
  const current = STEPS[step]

  const complete = (path?: string) => {
    localStorage.setItem('cs_onboarding_complete', 'true')
    setOpen(false)
    if (path) navigate(path)
  }

  return (
    <div className="onboarding-backdrop" role="dialog" aria-modal="true" aria-label="首次使用引导">
      <div className="onboarding-card">
        <button className="onboarding-close" onClick={() => complete()} aria-label="关闭引导">
          <X className="w-4 h-4" />
        </button>
        <div className="onboarding-brand">
          <Sparkles className="w-4 h-4" />
          <span>欢迎来到 CS Assistant</span>
        </div>
        <div className="onboarding-progress">
          {STEPS.map((_, index) => <span key={index} className={index <= step ? 'active' : ''} />)}
        </div>
        <div className="onboarding-icon">{current.icon}</div>
        <span className="eyebrow">Step {step + 1} of {STEPS.length}</span>
        <h2>{current.title}</h2>
        <p>{current.description}</p>
        <div className="onboarding-actions">
          <button className="btn-ghost" onClick={() => complete('/setup')}>加载演示数据</button>
          {step < STEPS.length - 1 ? (
            <button className="btn-primary" onClick={() => setStep((value) => value + 1)}>
              下一步 <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button className="btn-primary" onClick={() => complete(current.action)}>
              <Check className="w-4 h-4" /> 开始使用
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
