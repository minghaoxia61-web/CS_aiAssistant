import { useEffect, useState } from 'react'
import { Check, Cloud, CloudDownload, CloudUpload, Loader2, LogOut, Mail } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import {
  downloadCloudSnapshot,
  getCloudSession,
  isCloudSyncConfigured,
  onCloudAuthChange,
  sendCloudMagicLink,
  signOutCloud,
  uploadCloudSnapshot,
} from '@/lib/cloud-sync'
import { createLearningBackup, restoreLearningBackup } from '@/lib/data-backup'
import { confirmDialog } from '@/lib/dialog'
import { useStore } from '@/lib/store'

function formatSyncTime(value?: number): string {
  if (!value) return '尚未同步'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

export default function CloudSyncCard() {
  const configured = isCloudSyncConfigured()
  const { subjects, profile, loadSubjects, loadProfile } = useStore()
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState<'login' | 'upload' | 'download' | 'logout' | null>(null)
  const [message, setMessage] = useState('')
  const [lastSync, setLastSync] = useState(() => Number(localStorage.getItem('cs_cloud_last_sync') || 0))

  useEffect(() => {
    if (!configured) return
    getCloudSession().then(setSession).catch((error) => setMessage((error as Error).message))
    return onCloudAuthChange(setSession)
  }, [configured])

  const sendLink = async () => {
    if (!email.trim()) return
    setBusy('login')
    setMessage('')
    try {
      await sendCloudMagicLink(email.trim())
      setMessage('登录链接已发送，请在邮箱中完成验证。')
    } catch (error) {
      setMessage(`发送失败：${(error as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const upload = async () => {
    setBusy('upload')
    setMessage('')
    try {
      const timestamp = await uploadCloudSnapshot(await createLearningBackup(subjects, profile))
      localStorage.setItem('cs_cloud_last_sync', String(timestamp))
      setLastSync(timestamp)
      setMessage('当前学习数据已安全保存到云端。')
    } catch (error) {
      setMessage(`同步失败：${(error as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const download = async () => {
    setBusy('download')
    setMessage('')
    try {
      const snapshot = await downloadCloudSnapshot()
      if (!snapshot) {
        setMessage('云端还没有学习数据。')
        return
      }
      const allowed = await confirmDialog(
        `将恢复 ${snapshot.backup.subjects.length} 个云端科目。为避免覆盖本机数据，科目会以“恢复”副本导入。`,
        { title: '恢复云端数据', confirmText: '开始恢复' },
      )
      if (!allowed) return
      const result = await restoreLearningBackup(snapshot.backup)
      await Promise.all([loadSubjects(), loadProfile()])
      localStorage.setItem('cs_cloud_last_sync', String(snapshot.updatedAt))
      setLastSync(snapshot.updatedAt)
      setMessage(`已恢复 ${result.subjects} 个科目和 ${result.records} 条记录。`)
    } catch (error) {
      setMessage(`恢复失败：${(error as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const logout = async () => {
    setBusy('logout')
    try {
      await signOutCloud()
      setSession(null)
      setMessage('已退出云端账号，本地数据保持不变。')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="panel p-5 mb-5">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
          <Cloud className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-bone">账号与云同步</h3>
            {session && <span className="text-[9px] text-sage bg-sage/10 rounded-full px-2 py-0.5">已登录</span>}
          </div>
          {!configured ? (
            <>
              <p className="text-xs text-bone-muted mt-1 leading-relaxed">
                当前保持本地优先模式。配置 Supabase 后即可启用邮箱登录和跨设备学习快照。
              </p>
              <p className="text-[10px] font-mono text-bone-faint mt-2">
                需要 VITE_SUPABASE_URL 与 VITE_SUPABASE_PUBLISHABLE_KEY
              </p>
            </>
          ) : session ? (
            <>
              <p className="text-xs text-bone-muted mt-1">{session.user.email} · {formatSyncTime(lastSync)}</p>
              {message && <p className="text-[10px] text-[var(--accent)] mt-2">{message}</p>}
            </>
          ) : (
            <>
              <p className="text-xs text-bone-muted mt-1">使用邮箱魔法链接登录，无需设置密码。</p>
              {message && <p className="text-[10px] text-[var(--accent)] mt-2">{message}</p>}
            </>
          )}
        </div>

        {configured && session && (
          <div className="page-actions">
            <button className="btn-outline" onClick={download} disabled={Boolean(busy)}>
              {busy === 'download' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />}
              恢复云端
            </button>
            <button className="btn-primary" onClick={upload} disabled={Boolean(busy)}>
              {busy === 'upload' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
              同步现在
            </button>
            <button className="btn-ghost !px-2" onClick={logout} disabled={Boolean(busy)} title="退出云端账号">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {configured && !session && (
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[var(--border)]">
          <div className="relative flex-1">
            <Mail className="w-4 h-4 text-bone-faint absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              className="input !pl-9"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void sendLink()
              }}
              placeholder="你的邮箱"
            />
          </div>
          <button className="btn-primary" onClick={sendLink} disabled={!email.trim() || Boolean(busy)}>
            {busy === 'login' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            发送登录链接
          </button>
        </div>
      )}
    </section>
  )
}
