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
  return Date.parse(updatedAt)
}

export async function downloadCloudSnapshot(): Promise<{ backup: LearningBackup; updatedAt: number } | null> {
  const userId = await requireUserId()
  const { data, error } = await getClient()
    .from('learning_snapshots')
    .select('payload, updated_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    backup: data.payload as LearningBackup,
    updatedAt: Date.parse(data.updated_at),
  }
}
