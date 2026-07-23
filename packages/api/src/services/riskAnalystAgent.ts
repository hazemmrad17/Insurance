import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  riskAnalystOutputSchema,
  type RiskAnalystOutput,
} from '../schemas/riskAnalystOutput.js';

export interface DeterministicScore {
  inondation: number;
  rga: number;
  tempete: number;
  incendie: number;
  seisme: number;
  global: number;
}

export interface RiskAnalystInput {
  orchestrator_data: Record<string, unknown>;
  client_form: Record<string, unknown>;
  deterministic_score: DeterministicScore;
}

export type RiskAnalystResult =
  | RiskAnalystOutput
  | { agent_review: 'failed'; error: string };

const currentDir = dirname(fileURLToPath(import.meta.url));
const systemPromptPath = resolve(
  currentDir,
  '../../../../.agents/risk-analyst/system-prompt.md',
);

async function loadSystemPrompt(): Promise<string> {
  const prompt = await readFile(systemPromptPath, 'utf8');
  if (!prompt.trim()) {
    throw new Error('Risk analyst system prompt is empty');
  }
  return prompt;
}

interface MistralChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

async function requestMistral(
  apiKey: string,
  systemPrompt: string,
  input: RiskAnalystInput,
): Promise<string> {
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
      temperature: 0,
      max_tokens: 2048,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(input) },
      ],
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Mistral API returned ${response.status}: ${details.slice(0, 500)}`,
    );
  }

  const payload = await response.json() as MistralChatResponse;
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('Mistral API returned no text content');
  }
  return content;
}

function validateConsistency(
  output: RiskAnalystOutput,
  deterministic: DeterministicScore,
): RiskAnalystOutput {
  const perilKeys = [
    'inondation',
    'rga',
    'tempete',
    'incendie',
    'seisme',
  ] as const;

  for (const peril of perilKeys) {
    const review = output.aleas[peril];
    if (review.score_deterministe !== deterministic[peril]) {
      throw new Error(`Deterministic score mismatch for ${peril}`);
    }
    review.ecart_significatif =
      Math.abs(review.score_agent - review.score_deterministe) >= 15;
  }

  if (output.score_global_deterministe !== deterministic.global) {
    throw new Error('Deterministic global score mismatch');
  }

  const expectedAgentGlobal = Math.round(
    output.aleas.inondation.score_agent * 0.30 +
      output.aleas.rga.score_agent * 0.25 +
      output.aleas.tempete.score_agent * 0.20 +
      output.aleas.incendie.score_agent * 0.15 +
      output.aleas.seisme.score_agent * 0.10,
  );
  output.score_global_agent = expectedAgentGlobal;

  return output;
}

export async function runRiskAnalystAgent(
  input: RiskAnalystInput,
): Promise<RiskAnalystResult> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    const error = 'MISTRAL_API_KEY is not configured';
    console.error('[RiskAnalystAgent]', error);
    return { agent_review: 'failed', error };
  }

  try {
    const systemPrompt = await loadSystemPrompt();
    let lastError = 'Unknown validation error';

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const rawText = await requestMistral(apiKey, systemPrompt, input);
        const parsed: unknown = JSON.parse(rawText);
        const validated = riskAnalystOutputSchema.parse(parsed);
        return validateConsistency(validated, input.deterministic_score);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        console.error(
          `[RiskAnalystAgent] Attempt ${attempt}/2 failed:`,
          lastError,
        );
      }
    }

    return {
      agent_review: 'failed',
      error: `Mistral response failed validation after 2 attempts: ${lastError}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[RiskAnalystAgent] Failed to initialize:', message);
    return { agent_review: 'failed', error: message };
  }
}
