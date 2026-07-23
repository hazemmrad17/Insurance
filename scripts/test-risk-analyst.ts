import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  runRiskAnalystAgent,
  type DeterministicScore,
} from '../packages/api/src/services/riskAnalystAgent.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(currentDir, 'fixtures');

async function readFixture(name: string): Promise<Record<string, unknown>> {
  const content = await readFile(resolve(fixturesDir, name), 'utf8');
  return JSON.parse(content) as Record<string, unknown>;
}

async function main(): Promise<void> {
  const [orchestratorData, clientForm] = await Promise.all([
    readFixture('address-8-rue-paix.json'),
    readFixture('formulaire_result.json'),
  ]);

  const deterministicScore: DeterministicScore = {
    inondation: 16,
    rga: 14,
    tempete: 8,
    incendie: 0,
    seisme: 15,
    global: 11,
  };

  const result = await runRiskAnalystAgent({
    orchestrator_data: orchestratorData,
    client_form: clientForm,
    deterministic_score: deterministicScore,
  });

  console.log(JSON.stringify(result, null, 2));
  if ('agent_review' in result && result.agent_review === 'failed') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[test-risk-analyst] Unhandled error:', error);
  process.exitCode = 1;
});
