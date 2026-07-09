// Web 版 API 配置存储（服务端）
// 替代 electron/config.ts，去掉 electron-store 和机器绑定加密
// 配置存到 ./data/config.json，API Key 从环境变量读取，不硬编码到源码
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { ApiConfig, ApiConfigItem } from '../src/shared/types';

const DEFAULT_CONFIG: ApiConfig = {
  baseUrl: process.env.LLM_BASE_URL || 'https://api.deepseek.com',
  apiKey: process.env.LLM_API_KEY || '',
  model: process.env.LLM_MODEL || 'deepseek-v4-flash',
  temperature: 0.7,
  maxTokens: 0,
  topP: 1,
};

interface ConfigStore {
  configs: ApiConfigItem[];
  activeId: string | null;
}

const DEFAULT_STORE: ConfigStore = { configs: [], activeId: null };

function getConfigPath(): string {
  const dir = path.resolve(process.env.DATA_DIR || './data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, 'config.json');
}

function getStore(): ConfigStore {
  try {
    const p = getConfigPath();
    if (!fs.existsSync(p)) return { ...DEFAULT_STORE };
    const raw = fs.readFileSync(p, 'utf-8');
    return { ...DEFAULT_STORE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STORE };
  }
}

function setStore(val: ConfigStore): void {
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify(val, null, 2), 'utf-8');
  } catch (err) {
    console.error('写入配置文件失败:', err);
  }
}

export function getConfig(): ApiConfig {
  const { configs, activeId } = getStore();
  if (!activeId || configs.length === 0) return { ...DEFAULT_CONFIG };
  const active = configs.find((c) => c.id === activeId);
  if (!active) return { ...DEFAULT_CONFIG };
  const { id, name, createdAt, ...rest } = active;
  void id; void name; void createdAt;
  return { ...DEFAULT_CONFIG, ...rest };
}

export function listConfigs(): ApiConfigItem[] {
  return [...getStore().configs].sort((a, b) => b.createdAt - a.createdAt);
}

export function saveConfigItem(item: Partial<ApiConfigItem> & { id?: string }): ApiConfigItem {
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
    setStore({ configs, activeId: activeId || newItem.id });
    return newItem;
  }
}

export function deleteConfigItem(id: string): void {
  const { configs, activeId } = getStore();
  const newConfigs = configs.filter((c) => c.id !== id);
  const newActiveId = activeId === id ? (newConfigs[0]?.id ?? null) : activeId;
  setStore({ configs: newConfigs, activeId: newActiveId });
}

export function setActiveConfig(id: string): void {
  const { configs } = getStore();
  if (configs.some((c) => c.id === id)) {
    setStore({ configs, activeId: id });
  }
}

export function getActiveConfigId(): string | null {
  return getStore().activeId;
}

export function saveConfig(cfg: ApiConfig): void {
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
