import { v4 as uuidv4 } from 'uuid'
import { chatJSON, extractJSON } from './llm'
import type { ApiConfig, Material } from '@/shared/types'

export type SemanticRelation =
  | 'prerequisite'
  | 'contains'
  | 'contrast'
  | 'causes'
  | 'applies'

export interface SemanticKnowledgeNode {
  id: string
  title: string
  kind: 'concept' | 'algorithm' | 'formula' | 'definition' | 'example'
  definition: string
  evidence: string
  materialId: string
  materialName: string
  locator: string
  confidence: number
  verified: boolean
}

export interface SemanticKnowledgeEdge {
  id: string
  from: string
  to: string
  relation: SemanticRelation
  confidence: number
}

export interface SemanticKnowledgeGraph {
  subjectId: string
  generatedAt: number
  nodes: SemanticKnowledgeNode[]
  edges: SemanticKnowledgeEdge[]
}

interface RawNode {
  key?: string
  title?: string
  kind?: SemanticKnowledgeNode['kind']
  definition?: string
  evidence?: string
  material?: string
  locator?: string
  confidence?: number
}

interface RawEdge {
  from?: string
  to?: string
  relation?: SemanticRelation
  confidence?: number
}

interface RawGraph {
  nodes?: RawNode[]
  edges?: RawEdge[]
}

const STORAGE_PREFIX = 'cs_semantic_graph:'

export function loadSemanticGraph(subjectId: string): SemanticKnowledgeGraph | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${subjectId}`)
    return raw ? (JSON.parse(raw) as SemanticKnowledgeGraph) : null
  } catch {
    return null
  }
}

export function saveSemanticGraph(graph: SemanticKnowledgeGraph): void {
  localStorage.setItem(`${STORAGE_PREFIX}${graph.subjectId}`, JSON.stringify(graph))
}

export function updateSemanticNode(
  graph: SemanticKnowledgeGraph,
  nodeId: string,
  patch: Partial<Pick<SemanticKnowledgeNode, 'title' | 'definition' | 'verified'>>,
): SemanticKnowledgeGraph {
  const updated = {
    ...graph,
    nodes: graph.nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)),
  }
  saveSemanticGraph(updated)
  return updated
}

function materialContext(materials: Material[]): string {
  let remaining = 30_000
  const sections: string[] = []
  for (const material of materials) {
    if (!material.text_content || remaining <= 0) continue
    const excerpt = material.text_content.slice(0, remaining)
    sections.push(`=== ${material.filename} ===\n${excerpt}`)
    remaining -= excerpt.length
  }
  return sections.join('\n\n')
}

export async function generateSemanticGraph(
  subjectId: string,
  materials: Material[],
  config: ApiConfig,
  signal?: AbortSignal,
): Promise<SemanticKnowledgeGraph> {
  const raw = await chatJSON({
    config,
    signal,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: `你是课程知识工程师。请从课件中提取真正的语义知识图谱，而不是简单复制目录。
严格输出 JSON 数组，数组仅包含一个对象：
[{"nodes":[{"key":"n1","title":"概念名","kind":"concept","definition":"一句话定义","evidence":"不超过80字的原文证据","material":"文件名","locator":"第N页或章节名","confidence":90}],"edges":[{"from":"n1","to":"n2","relation":"prerequisite","confidence":85}]}]
kind 只能是 concept/algorithm/formula/definition/example。
relation 只能是 prerequisite/contains/contrast/causes/applies。
合并跨课件同义概念；最多提取 30 个高价值节点和 45 条关系。所有节点必须有原文 evidence，不确定内容降低 confidence。`,
      },
      {
        role: 'user',
        content: materialContext(materials),
      },
    ],
  })
  const parsed = extractJSON(raw)[0] as RawGraph
  const idByKey = new Map<string, string>()
  const nodes = (parsed.nodes || [])
    .filter((node) => node.title?.trim())
    .slice(0, 30)
    .map<SemanticKnowledgeNode>((node, index) => {
      const id = uuidv4()
      idByKey.set(node.key || `n${index + 1}`, id)
      const material = materials.find((item) => item.filename === node.material) || materials[0]
      return {
        id,
        title: node.title!.trim(),
        kind: node.kind || 'concept',
        definition: node.definition?.trim() || '',
        evidence: node.evidence?.trim() || '',
        materialId: material?.id || '',
        materialName: material?.filename || node.material || '未知资料',
        locator: node.locator?.trim() || '资料原文',
        confidence: Math.max(0, Math.min(100, Math.round(node.confidence || 60))),
        verified: false,
      }
    })
  const edges = (parsed.edges || [])
    .map<SemanticKnowledgeEdge | null>((edge) => {
      const from = idByKey.get(edge.from || '')
      const to = idByKey.get(edge.to || '')
      if (!from || !to || from === to) return null
      return {
        id: uuidv4(),
        from,
        to,
        relation: edge.relation || 'applies',
        confidence: Math.max(0, Math.min(100, Math.round(edge.confidence || 60))),
      }
    })
    .filter((edge): edge is SemanticKnowledgeEdge => Boolean(edge))
    .slice(0, 45)
  const graph: SemanticKnowledgeGraph = {
    subjectId,
    generatedAt: Date.now(),
    nodes,
    edges,
  }
  saveSemanticGraph(graph)
  return graph
}
