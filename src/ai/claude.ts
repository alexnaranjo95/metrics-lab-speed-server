import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

const MODEL = 'claude-opus-4.6-20250514';

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const key = getAnthropicKey();
    if (!key) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    _client = new Anthropic({ apiKey: key });
  }
  return _client;
}

export async function claudeText(
  system: string,
  userContent: string | Array<{ type: string; [key: string]: any }>,
  maxTokens: number = 16000
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const client = getClient();

  const messages: any[] = [{
    role: 'user',
    content: typeof userContent === 'string' ? userContent : userContent,
  }];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages,
  });

  const text = response.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');

  return {
    text,
    inputTokens: response.usage?.input_tokens || 0,
    outputTokens: response.usage?.output_tokens || 0,
  };
}

export async function claudeJSON<T = any>(
  system: string,
  userContent: string | Array<{ type: string; [key: string]: any }>,
  maxTokens: number = 16000
): Promise<{ data: T; inputTokens: number; outputTokens: number }> {
  const { text, inputTokens, outputTokens } = await claudeText(system, userContent, maxTokens);

  // Extract JSON from the response (may be wrapped in markdown code blocks)
  let jsonStr = text.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  // Find the outermost JSON object
  const match = jsonStr.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`Claude did not return valid JSON. Response: ${text.substring(0, 500)}`);
  }

  const data = JSON.parse(match[0]) as T;
  return { data, inputTokens, outputTokens };
}

export function isClaudeAvailable(): boolean {
  // Check both config (loaded at startup) and process.env (in case Coolify injects at runtime)
  return !!(config.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY);
}

export function getAnthropicKey(): string | undefined {
  return config.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
}

export { MODEL };
