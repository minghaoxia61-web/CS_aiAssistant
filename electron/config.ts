// API 配置存储（使用 electron-store，加密敏感信息）
// 支持多个 API 配置，可随时切换激活的配置
import Store from 'electron-store';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import * as os from 'os';
import type { ApiConfig, ApiConfigItem } from '../src/shared/types';

// ---------- API Key 加密（AES-256-GCM，密钥由机器 ID 派生） ----------
const ENC_PREFIX = 'enc:';

/** 从机器 ID（hostname + platform）派生 32 字节密钥 */
function deriveKey(): Buffer {
  const machineId = os.hostname() + os.platform();
  return crypto.createHash('sha256').update(machineId).digest();
}

/**
 * 加密 API Key：AES-256-GCM，返回 `enc:base64(iv + authTag + ciphertext)`
 * 空字符串原样返回；已加密的字符串不重复加密
 */
export function encryptApiKey(key: string): string {
  if (!key || key.startsWith(ENC_PREFIX)) return key;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
    const enc = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ENC_PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
  } catch {
    return key; // 加密失败则原样返回，避免数据丢失
  }
}

/**
 * 解密 API Key：识别 `enc:` 前缀并解密；非加密字符串原样返回（向后兼容）
 */
export function decryptApiKey(encKey: string): string {
  if (!encKey || !encKey.startsWith(ENC_PREFIX)) return encKey;
  try {
    const data = Buffer.from(encKey.slice(ENC_PREFIX.length), 'base64');
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const enc = data.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return encKey; // 解密失败返回原值，避免阻断使用
  }
}

// 默认配置：使用智谱 GLM-4-Flash（免费额度，质量优于 Pollinations）
// glm-4-flash-250414 为最新 flash 模型，响应快且支持长上下文
const DEFAULT_CONFIG: ApiConfig = {
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  apiKey: '51cb2cc8849742a89b476f51d2fd8760.sGuSMBQvTM05vusL',
  model: 'glm-4-flash-250414',
  temperature: 0.7,
  maxTokens: 0,
  topP: 1,
};

interface ConfigStore {
  configs: ApiConfigItem[];
  activeId: string | null;
}

const DEFAULT_STORE: ConfigStore = { configs: [], activeId: null };

// 尝试创建 electron-store，沙箱环境可能失败，降级为内存存储
let store: Store<Record<string, ConfigStore>> | null = null;
let memoryStore: ConfigStore = { ...DEFAULT_STORE };

try {
  store = new Store<Record<string, ConfigStore>>({
    name: 'config',
    defaults: { apiStore: DEFAULT_STORE },
    encryptionKey: 'cs-ai-tutor-local-key-v1',
  });
} catch (e) {
  console.error('electron-store 初始化失败，降级为内存存储:', e);
  store = null;
}

function getStore(): ConfigStore {
  if (store) {
    return store.get('apiStore') || DEFAULT_STORE;
  }
  return memoryStore;
}

function setStore(val: ConfigStore): void {
  if (store) {
    store.set('apiStore', val);
  } else {
    memoryStore = val;
  }
}

// 兼容旧版：如果旧版存储了单个 apiConfig，迁移到新格式
function migrateIfNeeded(): void {
  if (!store) return; // 内存存储模式无需迁移
  try {
    const oldCfg = store.get('apiConfig' as keyof Record<string, ConfigStore>) as unknown as ApiConfig | undefined;
    if (oldCfg && oldCfg.apiKey) {
      const item: ApiConfigItem = {
        ...DEFAULT_CONFIG,
        ...oldCfg,
        id: uuidv4(),
        name: '默认配置',
        createdAt: Date.now(),
      };
      const current = getStore();
      if (!current.configs || current.configs.length === 0) {
        setStore({ configs: [item], activeId: item.id });
      }
      store.delete('apiConfig' as keyof Record<string, ConfigStore>);
    }
  } catch {
    // 忽略迁移错误
  }
  // 迁移：将旧的 Pollinations 配置升级为 GLM（Pollinations API 已不可用）
  try {
    const current = getStore();
    if (current.configs && current.configs.length > 0) {
      let changed = false;
      const POLL_BASE = 'https://text.pollinations.ai/openai';
      const updated = current.configs.map((c) => {
        if (c.baseUrl === POLL_BASE || c.model === 'openai-large' || c.model === 'openai') {
          changed = true;
          return {
            ...c,
            baseUrl: DEFAULT_CONFIG.baseUrl,
            apiKey: DEFAULT_CONFIG.apiKey,
            model: DEFAULT_CONFIG.model,
            maxTokens: DEFAULT_CONFIG.maxTokens,
          };
        }
        return c;
      });
      if (changed) {
        setStore({ configs: updated, activeId: current.activeId });
      }
    }
  } catch {
    // 忽略迁移错误
  }
}

/** 获取当前激活的配置（不含元信息），apiKey 自动解密 */
export function getConfig(): ApiConfig {
  migrateIfNeeded();
  const { configs, activeId } = getStore();
  if (!activeId || configs.length === 0) return { ...DEFAULT_CONFIG };
  const active = configs.find((c) => c.id === activeId);
  if (!active) return { ...DEFAULT_CONFIG };
  const { id, name, createdAt, ...rest } = active;
  void id; void name; void createdAt;
  return { ...DEFAULT_CONFIG, ...rest, apiKey: decryptApiKey(rest.apiKey) };
}

/** 列出所有已保存的配置，apiKey 自动解密 */
export function listConfigs(): ApiConfigItem[] {
  migrateIfNeeded();
  return [...getStore().configs]
    .map((c) => ({ ...c, apiKey: decryptApiKey(c.apiKey) }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** 保存或更新单个配置项（有 id 则更新，无 id 则新增），apiKey 自动加密后存储 */
export function saveConfigItem(item: Partial<ApiConfigItem> & { id?: string }): ApiConfigItem {
  migrateIfNeeded();
  const { configs, activeId } = getStore();
  // 加密 apiKey 后再存储（已加密的不会重复加密）
  const encItem: Partial<ApiConfigItem> =
    item.apiKey !== undefined ? { ...item, apiKey: encryptApiKey(item.apiKey) } : { ...item };

  if (encItem.id && configs.some((c) => c.id === encItem.id)) {
    const idx = configs.findIndex((c) => c.id === encItem.id);
    configs[idx] = { ...configs[idx], ...encItem } as ApiConfigItem;
    setStore({ configs, activeId });
    return { ...configs[idx], apiKey: decryptApiKey(configs[idx].apiKey) };
  } else {
    const newItem: ApiConfigItem = {
      ...DEFAULT_CONFIG,
      ...encItem,
      id: uuidv4(),
      name: encItem.name || '未命名配置',
      createdAt: Date.now(),
    };
    configs.push(newItem);
    const newActiveId = activeId || newItem.id;
    setStore({ configs, activeId: newActiveId });
    return { ...newItem, apiKey: decryptApiKey(newItem.apiKey) };
  }
}

/** 删除配置 */
export function deleteConfigItem(id: string): void {
  const { configs, activeId } = getStore();
  const newConfigs = configs.filter((c) => c.id !== id);
  const newActiveId = activeId === id ? (newConfigs[0]?.id ?? null) : activeId;
  setStore({ configs: newConfigs, activeId: newActiveId });
}

/** 设置激活的配置 */
export function setActiveConfig(id: string): void {
  const { configs } = getStore();
  if (configs.some((c) => c.id === id)) {
    setStore({ configs, activeId: id });
  }
}

/** 获取激活配置的 id */
export function getActiveConfigId(): string | null {
  return getStore().activeId;
}

// 兼容旧版 API
export function saveConfig(cfg: ApiConfig): void {
  migrateIfNeeded();
  const { configs, activeId } = getStore();
  const encCfg: ApiConfig = { ...cfg, apiKey: encryptApiKey(cfg.apiKey) };
  if (activeId) {
    const idx = configs.findIndex((c) => c.id === activeId);
    if (idx >= 0) {
      configs[idx] = { ...configs[idx], ...encCfg } as ApiConfigItem;
      setStore({ configs, activeId });
      return;
    }
  }
  const item: ApiConfigItem = {
    ...DEFAULT_CONFIG,
    ...encCfg,
    id: uuidv4(),
    name: '默认配置',
    createdAt: Date.now(),
  };
  configs.push(item);
  setStore({ configs, activeId: item.id });
}
