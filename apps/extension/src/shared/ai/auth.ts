import { getValidSyncAccessToken } from '../sync/auth'
import {
  getSyncAuthSession,
  getSyncSettings,
} from '../sync/settings'

export async function getAiAuthorizationHeaders(): Promise<Record<string, string>> {
  const session = await getSyncAuthSession()
  if (!session) return {}

  const settings = await getSyncSettings()
  if (!settings.supabaseUrl.trim() || !settings.supabaseAnonKey.trim()) {
    throw new Error('检测到登录会话，但 Supabase 认证配置不完整，请在同步设置中重新保存账号配置')
  }
  const accessToken = await getValidSyncAccessToken(settings)
  return { authorization: `Bearer ${accessToken}` }
}
