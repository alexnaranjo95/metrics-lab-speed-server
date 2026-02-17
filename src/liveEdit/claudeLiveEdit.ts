import Anthropic from '@anthropic-ai/sdk';
import { nanoid } from 'nanoid';
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

export interface PlanOutput {
  issues: string[];
  improvements: string[];
  rationale: string;
  edits: Array<{ path: string; newContent: string }>;
  planId: string;
}

export const LIVE_EDIT_PLAN_SYSTEM_PROMPT = `You are a code editor for a static website. The user will describe bugs, design changes, or performance issues. Your job is to produce a PLAN only — do not execute anything.

Output your response in this exact structure:

## Plan

### Issues Found
- [List each problem or issue you identified, one per line starting with "- "]
- Example: "- Hero image lacks width/height causing CLS"

### Proposed Improvements
- [List each improvement with what will change and why it helps, one per line]
- Example: "- Add explicit dimensions to hero img — prevents layout shift, improves CLS"

### Rationale
[2-4 sentences explaining your overall strategy and why these changes are safe and effective]

### Edits (JSON)
\`\`\`json
[
  { "path": "index.html", "newContent": "..." },
  { "path": "assets/main.css", "newContent": "..." }
]
\`\`\`

- path: relative path from workspace root
- newContent: the complete new file content (replace entire file)
- Only include files you need to change. Keep edits minimal and targeted.`;

export async function chatWithPlan(
  messages: LiveEditMessage[],
  onStream?: (chunk: string) => void
): Promise<{ text: string; plan?: PlanOutput }> {
  const client = getClient();
  const anthropicMessages = messages.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  if (onStream) {
    const stream = await client.messages.stream({
      model: LIVE_EDIT_MODEL,
      max_tokens: 8192,
      system: LIVE_EDIT_PLAN_SYSTEM_PROMPT,
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
    return { text: fullText, plan: extractPlan(fullText) };
  }

  const response = await client.messages.create({
    model: LIVE_EDIT_MODEL,
    max_tokens: 8192,
    system: LIVE_EDIT_PLAN_SYSTEM_PROMPT,
    messages: anthropicMessages,
  });
  const text = (response.content as any[])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');
  return { text, plan: extractPlan(text) };
}

function extractPlan(text: string): PlanOutput | undefined {
  const planId = `plan_${nanoid(8)}`;
  const issues: string[] = [];
  const improvements: string[] = [];
  let rationale = '';

  const issuesMatch = text.match(/### Issues Found\s*([\s\S]*?)(?=###|$)/i);
  if (issuesMatch) {
    const block = issuesMatch[1];
    block.split('\n').forEach(line => {
      const m = line.match(/^-\s*(.+)$/);
      if (m && m[1].trim()) issues.push(m[1].trim());
    });
  }

  const improvementsMatch = text.match(/### Proposed Improvements\s*([\s\S]*?)(?=###|$)/i);
  if (improvementsMatch) {
    const block = improvementsMatch[1];
    block.split('\n').forEach(line => {
      const m = line.match(/^-\s*(.+)$/);
      if (m && m[1].trim()) improvements.push(m[1].trim());
    });
  }

  const rationaleMatch = text.match(/### Rationale\s*([\s\S]*?)(?=###|$)/i);
  if (rationaleMatch) rationale = rationaleMatch[1].trim();

  const edits = extractEdits(text) ?? [];

  return { issues, improvements, rationale, edits, planId };
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
