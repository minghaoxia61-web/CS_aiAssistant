import type { ChatCitation, ChatMessage, ChatSession } from '@/shared/types'

export interface AnswerQuality {
  evidenceAlignment: number
  citationValidity: number
  supportedClaims: number
  totalClaims: number
  refusalDetected: boolean
  hallucinationRisk: 'low' | 'medium' | 'high'
}

export interface AnswerQualitySummary {
  evaluatedAnswers: number
  evidenceAlignment: number
  citationValidity: number
  refusalAccuracy: number
  highRiskAnswers: number
}

const REFUSAL_PATTERNS = [
  '资料中没有',
  '资料中未',
  '没有足够依据',
  '无法从资料',
  '当前资料未涉及',
]

function terms(text: string): Set<string> {
  const result = new Set<string>()
  const normalized = text.toLowerCase().replace(/\s+/g, '')
  const english = text.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) || []
  english.forEach((item) => result.add(item))
  const chinese = normalized.match(/[\u4e00-\u9fff]+/g) || []
  for (const segment of chinese) {
    for (let index = 0; index < segment.length - 1; index += 1) {
      result.add(segment.slice(index, index + 2))
    }
  }
  return result
}

function overlapRatio(claim: string, evidenceTerms: Set<string>): number {
  const claimTerms = terms(claim)
  if (claimTerms.size === 0) return 0
  let hit = 0
  for (const term of claimTerms) {
    if (evidenceTerms.has(term)) hit += 1
  }
  return hit / claimTerms.size
}

function claims(answer: string): string[] {
  return answer
    .replace(/```[\s\S]*?```/g, '')
    .split(/[。！？.!?\n]/)
    .map((item) => item.replace(/^[-*\d.)\s]+/, '').trim())
    .filter((item) => item.length >= 8)
    .slice(0, 24)
}

export function evaluateAnswerQuality(
  answer: string,
  citations: ChatCitation[] = [],
): AnswerQuality {
  const answerClaims = claims(answer)
  const evidence = citations.map((item) => item.excerpt).join(' ')
  const evidenceTerms = terms(evidence)
  const supportedClaims = answerClaims.filter((claim) => overlapRatio(claim, evidenceTerms) >= 0.16).length
  const evidenceAlignment = answerClaims.length
    ? Math.round((supportedClaims / answerClaims.length) * 100)
    : 0
  const referencedRanks = Array.from(answer.matchAll(/\[资料(\d+)\]/g)).map((match) => Number(match[1]))
  const validReferences = referencedRanks.filter(
    (rank) => rank >= 1 && rank <= citations.length,
  ).length
  const citationValidity = referencedRanks.length
    ? Math.round((validReferences / referencedRanks.length) * 100)
    : citations.length > 0
      ? 60
      : 0
  const refusalDetected = REFUSAL_PATTERNS.some((pattern) => answer.includes(pattern))
  const riskScore =
    (citations.length === 0 && !refusalDetected ? 45 : 0) +
    (100 - evidenceAlignment) * 0.45 +
    (100 - citationValidity) * 0.2 -
    (citations.length === 0 && refusalDetected ? 40 : 0)
  const hallucinationRisk = riskScore >= 58 ? 'high' : riskScore >= 32 ? 'medium' : 'low'

  return {
    evidenceAlignment,
    citationValidity,
    supportedClaims,
    totalClaims: answerClaims.length,
    refusalDetected,
    hallucinationRisk,
  }
}

function assistantAnswers(sessions: ChatSession[]): ChatMessage[] {
  return sessions.flatMap((session) =>
    session.messages.filter((message) => message.role === 'assistant' && message.content.trim()),
  )
}

export function summarizeAnswerQuality(sessions: ChatSession[]): AnswerQualitySummary {
  const evaluated = assistantAnswers(sessions).map((message) =>
    evaluateAnswerQuality(message.content, message.citations),
  )
  const average = (values: number[]) =>
    values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0
  const noEvidence = evaluated.filter((item) => item.citationValidity === 0)
  return {
    evaluatedAnswers: evaluated.length,
    evidenceAlignment: average(evaluated.map((item) => item.evidenceAlignment)),
    citationValidity: average(evaluated.map((item) => item.citationValidity)),
    refusalAccuracy: noEvidence.length
      ? Math.round((noEvidence.filter((item) => item.refusalDetected).length / noEvidence.length) * 100)
      : 100,
    highRiskAnswers: evaluated.filter((item) => item.hallucinationRisk === 'high').length,
  }
}
