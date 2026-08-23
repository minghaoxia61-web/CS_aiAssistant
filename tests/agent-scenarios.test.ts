import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { evaluateAgentScenarios, type AgentEvaluationScenario } from '../src/lib/agent-evaluation'
import { runAgentScenarioFixture } from '../scripts/agent-fixtures'

test('固定 Agent 场景集全部满足证据、验证和状态恢复约束', () => {
  const dataset = JSON.parse(readFileSync(
    join(process.cwd(), 'data', 'evaluation', 'agent-scenarios.json'),
    'utf8',
  )) as { cases: AgentEvaluationScenario[] }
  const report = evaluateAgentScenarios(dataset.cases, runAgentScenarioFixture)
  assert.equal(report.caseCount, 12)
  assert.equal(report.passRate, 100, JSON.stringify(report.results.filter((item) => !item.passed)))
  assert.equal(report.guardrailPassRate, 100)
  assert.equal(report.workflowPassRate, 100)
  assert.equal(report.recoveryPassRate, 100)
})
