// API 配置存储（使用 electron-store，加密敏感信息）
// 支持多个 API 配置，可随时切换激活的配置
import Store from 'electron-store';
import { v4 as uuidv4 } from 'uuid';
import type { ApiConfig, ApiConfigItem } from '../src/shared/types';

const DEFAULT_CONFIG: ApiConfig = {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  temperature: 0.7,
  maxTokens: 2048,
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
}

/** 获取当前激活的配置（不含元信息） */
export function getConfig(): ApiConfig {
  migrateIfNeeded();
  const { configs, activeId } = getStore();
  if (!activeId || configs.length === 0) return { ...DEFAULT_CONFIG };
  const active = configs.find((c) => c.id === activeId);
  if (!active) return { ...DEFAULT_CONFIG };
  const { id, name, createdAt, ...rest } = active;
  void id; void name; void createdAt;
  return { ...DEFAULT_CONFIG, ...rest };
}

/** 列出所有已保存的配置 */
export function listConfigs(): ApiConfigItem[] {
  migrateIfNeeded();
  return [...getStore().configs].sort((a, b) => b.createdAt - a.createdAt);
}

/** 保存或更新单个配置项（有 id 则更新，无 id 则新增） */
export function saveConfigItem(item: Partial<ApiConfigItem> & { id?: string }): ApiConfigItem {
  migrateIfNeeded();
  const { configs, activeId } = getStore();

  if (item.id && configs.some((c) => c.id === item.id)) {
    const idx = configs.findIndex((c) => c.id === item.id);
    configs[idx] = { ...configs[idx], ...item } as ApiConfigItem;
    setStore({ configs, activeId });
    return configs[idx];
  } else {
    const newItem: ApiConfigItem = {
      ...DEFAULT_CONFIG,
      ...item,
      id: uuidv4(),
      name: item.name || '未命名配置',
      createdAt: Date.now(),
    };
    configs.push(newItem);
    const newActiveId = activeId || newItem.id;
    setStore({ configs, activeId: newActiveId });
    return newItem;
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
  if (activeId) {
    const idx = configs.findIndex((c) => c.id === activeId);
    if (idx >= 0) {
      configs[idx] = { ...configs[idx], ...cfg } as ApiConfigItem;
      setStore({ configs, activeId });
      return;
    }
  }
  const item: ApiConfigItem = {
    ...DEFAULT_CONFIG,
    ...cfg,
    id: uuidv4(),
    name: '默认配置',
    createdAt: Date.now(),
  };
  configs.push(item);
  setStore({ configs, activeId: item.id });
}
