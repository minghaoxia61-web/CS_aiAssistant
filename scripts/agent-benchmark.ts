import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { evaluateAgentScenarios, type AgentEvaluationScenario } from '../src/lib/agent-evaluation'
import { runAgentScenarioFixture } from './agent-fixtures'

const dataset = JSON.parse(readFileSync(
  join(process.cwd(), 'data', 'evaluation', 'agent-scenarios.json'),
  'utf8',
)) as { version: number; cases: AgentEvaluationScenario[] }
const report = evaluateAgentScenarios(dataset.cases, runAgentScenarioFixture)

console.log(`Agent Scenario Benchmark v${dataset.version} · ${report.caseCount} cases`)
console.table([{
  passRate: `${report.passRate}%`,
  guardrail: `${report.guardrailPassRate}%`,
  grounding: `${report.groundingPassRate}%`,
  workflow: `${report.workflowPassRate}%`,
  recovery: `${report.recoveryPassRate}%`,
}])
console.table(report.results.map((item) => ({
  id: item.id, group: item.group, passed: item.passed, failures: item.failures.join('; ') || '-',
})))
if (report.passRate < 100) process.exitCode = 1
