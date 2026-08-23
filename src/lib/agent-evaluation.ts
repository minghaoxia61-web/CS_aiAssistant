import type { AgentState, LearningAgentRun } from './learning-agent'
import { nextAgentAction } from './learning-agent'

export type AgentScenarioGroup = 'guardrail' | 'grounding' | 'workflow' | 'recovery'

export interface AgentEvaluationScenario {
  id: string
  group: AgentScenarioGroup
  fixture: string
  expectedStatus: LearningAgentRun['status']
  expectedBlockedState?: AgentState
  expectedAction?: 'chat' | 'quiz' | 'review'
  minimumEvidence?: number
  masteryMustRemainUnchanged?: boolean
  expectedCompletedStates?: AgentState[]
}

export interface AgentScenarioResult {
  id: string
  group: AgentScenarioGroup
  passed: boolean
  failures: string[]
  actualStatus: LearningAgentRun['status']
}

export interface AgentEvaluationReport {
  caseCount: number
  passedCount: number
  passRate: number
  guardrailPassRate: number
  groundingPassRate: number
  workflowPassRate: number
  recoveryPassRate: number
  results: AgentScenarioResult[]
}

export function evaluateAgentScenarios(
  scenarios: AgentEvaluationScenario[],
  execute: (fixture: string) => LearningAgentRun,
): AgentEvaluationReport {
  const results = scenarios.map<AgentScenarioResult>((scenario) => {
    const run = execute(scenario.fixture)
    const failures: string[] = []
    if (run.status !== scenario.expectedStatus) failures.push(`status=${run.status}`)
    if (scenario.expectedBlockedState && !run.trace.some((step) =>
      step.state === scenario.expectedBlockedState && step.status === 'blocked')) {
      failures.push(`missing blocked ${scenario.expectedBlockedState}`)
    }
    if (scenario.minimumEvidence !== undefined && run.evidence.length < scenario.minimumEvidence) {
      failures.push(`evidence=${run.evidence.length}`)
    }
    if (scenario.expectedAction && nextAgentAction(run)?.kind !== scenario.expectedAction) {
      failures.push(`action=${nextAgentAction(run)?.kind || 'none'}`)
    }
    if (scenario.masteryMustRemainUnchanged && run.masteryAfter !== undefined) {
      failures.push('mastery updated before verification')
    }
    for (const state of scenario.expectedCompletedStates || []) {
      if (!run.trace.some((step) => step.state === state && step.status === 'completed')) {
        failures.push(`incomplete ${state}`)
      }
    }
    return { id: scenario.id, group: scenario.group, passed: failures.length === 0, failures, actualStatus: run.status }
  })
  const rate = (group?: AgentScenarioGroup) => {
    const selected = group ? results.filter((item) => item.group === group) : results
    return selected.length ? Math.round((selected.filter((item) => item.passed).length / selected.length) * 100) : 0
  }
  return {
    caseCount: results.length,
    passedCount: results.filter((item) => item.passed).length,
    passRate: rate(),
    guardrailPassRate: rate('guardrail'),
    groundingPassRate: rate('grounding'),
    workflowPassRate: rate('workflow'),
    recoveryPassRate: rate('recovery'),
    results,
  }
}
