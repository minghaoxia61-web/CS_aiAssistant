import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import type { LearningBackup } from '@/lib/data-backup'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
let client: SupabaseClient | null = null

export function isCloudSyncConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseKey)
}

function getClient(): SupabaseClient {
  if (!isCloudSyncConfigured()) {
    throw new Error('云同步尚未配置')
  }
  if (!client) {
    client = createClient(supabaseUrl!, supabaseKey!, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}

export async function getCloudSession(): Promise<Session | null> {
  if (!isCloudSyncConfigured()) return null
  const { data, error } = await getClient().auth.getSession()
  if (error) throw error
  return data.session
}

export function onCloudAuthChange(callback: (session: Session | null) => void): () => void {
  if (!isCloudSyncConfigured()) return () => {}
  const { data } = getClient().auth.onAuthStateChange((_event, session) => callback(session))
  return () => data.subscription.unsubscribe()
}

export async function sendCloudMagicLink(email: string): Promise<void> {
  const redirectTo = `${window.location.origin}${window.location.pathname}`
  const { error } = await getClient().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  })
  if (error) throw error
}

export async function signOutCloud(): Promise<void> {
  const { error } = await getClient().auth.signOut()
  if (error) throw error
}

async function requireUserId(): Promise<string> {
  const session = await getCloudSession()
  if (!session?.user.id) throw new Error('请先登录后再同步')
  return session.user.id
}

export async function uploadCloudSnapshot(backup: LearningBackup): Promise<number> {
  const userId = await requireUserId()
  const updatedAt = new Date().toISOString()
  const { error } = await getClient()
    .from('learning_snapshots')
    .upsert(
      {
        user_id: userId,
        payload: backup,
        updated_at: updatedAt,
      },
      { onConflict: 'user_id' },
    )
  if (error) throw error
  const { error: versionError } = await getClient()
    .from('learning_snapshot_versions')
    .insert({
      user_id: userId,
      payload: backup,
      created_at: updatedAt,
    })
  if (
    versionError &&
    versionError.code !== '42P01' &&
    versionError.code !== 'PGRST205'
  ) {
    throw versionError
  }
  return Date.parse(updatedAt)
}

export interface CloudSnapshotVersion {
  id: string
  createdAt: number
  subjectCount: number
}

export async function listCloudVersions(): Promise<CloudSnapshotVersion[]> {
  const userId = await requireUserId()
  const { data, error } = await getClient()
    .from('learning_snapshot_versions')
    .select('id, created_at, payload')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(8)
  if (error?.code === '42P01' || error?.code === 'PGRST205') return []
  if (error) throw error
  return (data || []).map((item) => ({
    id: String(item.id),
    createdAt: Date.parse(item.created_at),
    subjectCount: (item.payload as LearningBackup)?.subjects?.length || 0,
  }))
}

export async function downloadCloudSnapshot(
  versionId?: string,
): Promise<{ backup: LearningBackup; updatedAt: number } | null> {
  const userId = await requireUserId()
  const query = versionId
    ? getClient()
        .from('learning_snapshot_versions')
        .select('payload, created_at')
        .eq('user_id', userId)
        .eq('id', versionId)
        .maybeSingle()
    : getClient()
        .from('learning_snapshots')
        .select('payload, updated_at')
        .eq('user_id', userId)
        .maybeSingle()
  const { data, error } = await query
  if (error) throw error
  if (!data) return null
  const timestamp = 'updated_at' in data ? data.updated_at : data.created_at
  return {
    backup: data.payload as LearningBackup,
    updatedAt: Date.parse(timestamp),
  }
}
