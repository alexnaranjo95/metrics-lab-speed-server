import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

const LIVE_EDIT_MODEL = process.env.LIVE_EDIT_MODEL || 'claude-sonnet-4-5-20250929';

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const key = config.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY not configured');
    _client = new Anthropic({ apiKey: key });
  }
  return _client;
}

export function isLiveEditClaudeAvailable(): boolean {
  return !!(config.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY);
}

export interface LiveEditMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function chatWithEdits(
  systemPrompt: string,
  messages: LiveEditMessage[],
  onStream?: (chunk: string) => void
): Promise<{ text: string; edits?: Array<{ path: string; newContent: string }> }> {
  const client = getClient();

  const anthropicMessages = messages.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  if (onStream) {
    const stream = await client.messages.stream({
      model: LIVE_EDIT_MODEL,
      max_tokens: 8192,
      system: systemPrompt,
      messages: anthropicMessages,
    });
    let fullText = '';
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && (event as any).delta?.text) {
        const text = (event as any).delta.text;
        fullText += text;
        onStream(text);
      }
    }
    return { text: fullText, edits: extractEdits(fullText) };
  }

  const response = await client.messages.create({
    model: LIVE_EDIT_MODEL,
    max_tokens: 8192,
    system: systemPrompt,
    messages: anthropicMessages,
  });
  const text = (response.content as any[])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');
  return { text, edits: extractEdits(text) };
}

function extractEdits(text: string): Array<{ path: string; newContent: string }> | undefined {
  const edits: Array<{ path: string; newContent: string }> = [];
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed)) {
        for (const e of parsed) {
          if (e.path && (e.newContent !== undefined || e.content !== undefined)) {
            edits.push({ path: e.path, newContent: e.newContent ?? e.content });
          }
        }
      } else if (parsed.edits && Array.isArray(parsed.edits)) {
        for (const e of parsed.edits) {
          if (e.path && (e.newContent !== undefined || e.content !== undefined)) {
            edits.push({ path: e.path, newContent: e.newContent ?? e.content });
          }
        }
      }
    } catch { /* ignore */ }
  }
  return edits.length > 0 ? edits : undefined;
}
