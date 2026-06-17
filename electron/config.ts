// API 配置存储（使用 electron-store，加密敏感信息）
import Store from 'electron-store';
import type { ApiConfig } from '../src/shared/types';

const DEFAULT_CONFIG: ApiConfig = {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  temperature: 0.7,
  maxTokens: 2048,
  topP: 1,
};

const store = new Store<Record<string, ApiConfig>>({
  name: 'config',
  defaults: { apiConfig: DEFAULT_CONFIG },
  encryptionKey: 'cs-ai-tutor-local-key-v1',
});

export function getConfig(): ApiConfig {
  const cfg = store.get('apiConfig');
  return { ...DEFAULT_CONFIG, ...(cfg || {}) };
}

export function saveConfig(cfg: ApiConfig): void {
  store.set('apiConfig', { ...DEFAULT_CONFIG, ...cfg });
}
