// 全局对话框渲染组件
import { useEffect, useRef } from 'react'
import { useDialog } from '@/lib/dialog'

export default function Dialog() {
  const { type, title, message, placeholder, confirmText, cancelText, danger, inputValue, close, setInput } = useDialog()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (type === 'prompt') {
      // 自动聚焦输入框
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [type])

  if (!type) return null

  const handleConfirm = () => {
    if (type === 'prompt') {
      close(inputValue)
    } else {
      close(true)
    }
  }

  const handleCancel = () => {
    close(type === 'prompt' ? null : false)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirm()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={handleCancel}
    >
      <div
        className="w-full max-w-sm mx-4 rounded-2xl border border-amber/15 bg-ink-900 shadow-2xl p-5 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-lg text-bone mb-2">{title}</h3>
        <p className="text-sm text-bone-dim mb-4 leading-relaxed whitespace-pre-line">{message}</p>

        {type === 'prompt' && (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={placeholder}
            className="input w-full mb-4"
          />
        )}

        <div className="flex gap-2 justify-end">
          <button className="btn-ghost px-4 py-2 text-sm" onClick={handleCancel}>
            {cancelText}
          </button>
          <button
            className={danger ? 'px-4 py-2 text-sm rounded-lg bg-rust/20 text-rust border border-rust/30 hover:bg-rust/30 transition-all' : 'btn-primary px-4 py-2 text-sm'}
            onClick={handleConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
