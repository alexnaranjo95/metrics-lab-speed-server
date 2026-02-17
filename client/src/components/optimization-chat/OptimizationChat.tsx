import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useLiveEditStream, type PlanData, type VerificationResult } from '@/hooks/useLiveEditStream';
import { cn } from '@/lib/utils';
import {
  Send,
  Loader2,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Wifi,
  WifiOff,
  Pencil,
} from 'lucide-react';

interface OptimizationChatProps {
  siteId: string;
  onDeploy?: () => void;
  deployKey?: number;
  className?: string;
  /** Optional: render custom actions (e.g. audit, deploy buttons) */
  quickActions?: React.ReactNode;
}

export function OptimizationChat({
  siteId,
  onDeploy,
  deployKey = 0,
  className,
  quickActions,
}: OptimizationChatProps) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; plan?: PlanData }>>([]);
  const [pendingPlan, setPendingPlan] = useState<PlanData | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [workflowSteps, setWorkflowSteps] = useState<Array<{ step: string; description: string; result?: string; status: 'running' | 'done' | 'error' }>>([]);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [thinkingText, setThinkingText] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { items, isConnected, clear } = useLiveEditStream({ siteId, enabled: !!siteId });

  const chatMutation = useMutation({
    mutationKey: ['live-edit-chat', siteId],
    mutationFn: (msg: string) => api.liveEditChat(siteId, msg) as Promise<{ planId?: string }>,
    onSuccess: (data) => {
      if (data.planId) setPendingPlan((p) => (p ? { ...p, planId: data.planId! } : null));
    },
    onError: (err: Error) => alert(err.message),
  });

  const executeMutation = useMutation({
    mutationKey: ['live-edit-execute', siteId],
    mutationFn: (planId: string) => api.liveEditExecute(siteId, planId),
    onSuccess: () => {
      onDeploy?.();
    },
    onError: (err: Error) => alert(err.message),
  });

  const processedRef = useRef(0);

  useEffect(() => {
    let thinking = '';
    for (let i = processedRef.current; i < items.length; i++) {
      const item = items[i];
      if (item.type === 'thinking') {
        thinking += item.message;
      }
      if (item.type === 'message') {
        thinking = '';
        if (item.role === 'user') {
          setMessages((m) => [...m, { role: 'user', content: item.content }]);
        } else {
          setMessages((m) => {
            const prev = m[m.length - 1];
            if (prev?.role === 'assistant') {
              return [...m.slice(0, -1), { ...prev, content: item.content }];
            }
            return [...m, { role: 'assistant', content: item.content }];
          });
        }
      }
      if (item.type === 'plan') {
        thinking = '';
        setPendingPlan(item.plan);
        setMessages((m) => {
          const prev = m[m.length - 1];
          const entry = { role: 'assistant' as const, content: prev?.role === 'assistant' ? prev.content : 'Here’s my plan:', plan: item.plan };
          if (prev?.role === 'assistant') return [...m.slice(0, -1), entry];
          return [...m, entry];
        });
      }
      if (item.type === 'step_start') {
        setIsExecuting(true);
        setWorkflowSteps((s) => [...s, { step: item.step, description: item.description, status: 'running' }]);
      }
      if (item.type === 'step_complete') {
        setWorkflowSteps((s) =>
          s.map((x, i) => (i === s.length - 1 ? { ...x, result: item.result, status: 'done' as const } : x))
        );
      }
      if (item.type === 'verification_start') {
        setWorkflowSteps((s) => [...s, { step: 'verification', description: 'Verifying UX, visual, interactions...', status: 'running' }]);
      }
      if (item.type === 'verification_result') {
        setVerification(item.result);
        setWorkflowSteps((s) =>
          s.map((x, i) =>
            i === s.length - 1 && x.step === 'verification'
              ? { ...x, result: item.result.passed ? 'Passed' : 'Completed with failures', status: 'done' as const }
              : x
          )
        );
      }
      if (item.type === 'error') {
        setWorkflowSteps((s) =>
          s.length > 0 && s[s.length - 1].status === 'running'
            ? s.map((x, i) => (i === s.length - 1 ? { ...x, status: 'error' as const, result: item.message } : x))
            : [...s, { step: 'error', description: item.message, status: 'error' }]
        );
      }
      if (item.type === 'done') {
        setIsExecuting(false);
      }
    }
    processedRef.current = items.length;
    setThinkingText(thinking);
  }, [items]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, workflowSteps.length, thinkingText]);

  const handleSend = () => {
    if (!message.trim() || chatMutation.isPending) return;
    const msg = message.trim();
    setMessages((m) => [...m, { role: 'user', content: msg }]);
    setMessage('');
    setPendingPlan(null);
    setWorkflowSteps([]);
    setVerification(null);
    chatMutation.mutate(msg);
  };

  const handleApprove = () => {
    if (!pendingPlan || executeMutation.isPending) return;
    setPendingPlan(null);
    setWorkflowSteps([]);
    setVerification(null);
    executeMutation.mutate(pendingPlan.planId);
  };

  const handleReject = () => {
    setPendingPlan(null);
  };

  const handleEditPlan = () => {
    setMessage('Please refine the plan. Consider...');
    setPendingPlan(null);
  };

  const clearAll = () => {
    clear();
    setMessages([]);
    setPendingPlan(null);
    setWorkflowSteps([]);
    setVerification(null);
    setThinkingText('');
  };

  const isPending = chatMutation.isPending || executeMutation.isPending;

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-[hsl(var(--border))] shrink-0">
        <div className="flex items-center gap-2">
          <Pencil className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          <span className="text-sm font-medium">Plan & Edit</span>
          {isConnected ? (
            <span className="flex items-center gap-1 text-xs text-green-500">
              <Wifi className="h-3 w-3" /> Connected
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <WifiOff className="h-3 w-3" /> Disconnected
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={clearAll}
          className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        >
          Clear
        </button>
      </div>

      {quickActions && (
        <div className="flex flex-wrap gap-2 p-4 border-b border-[hsl(var(--border))]">
          {quickActions}
        </div>
      )}

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[200px] max-h-[320px]"
      >
        {messages.length === 0 && !thinkingText && (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Describe changes or optimizations. I’ll propose a plan for your approval, then execute it and verify UX, visual consistency, and interactions.
          </p>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-4 py-3 text-sm',
                m.role === 'user'
                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                  : 'bg-[hsl(var(--muted))]/50 text-[hsl(var(--foreground))]'
              )}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.plan && <PlanCard plan={m.plan} />}
            </div>
          </div>
        ))}

        {thinkingText && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm bg-[hsl(var(--muted))]/50">
              <p className="whitespace-pre-wrap text-[hsl(var(--muted-foreground))]">
                {thinkingText}
                {chatMutation.isPending && <span className="animate-pulse">▋</span>}
              </p>
            </div>
          </div>
        )}

        {workflowSteps.length > 0 && (
          <div className="rounded-lg border border-[hsl(var(--border))] p-4 space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
              Workflow
            </h4>
            {workflowSteps.map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                {s.status === 'running' ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[hsl(var(--primary))]" />
                ) : s.status === 'error' ? (
                  <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                ) : (
                  <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
                )}
                <div>
                  <p className="font-medium capitalize">{s.step}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{s.description}</p>
                  {s.result && <p className="text-xs mt-1">{s.result}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        {verification && (
          <div
            className={cn(
              'rounded-lg border p-4 space-y-2',
              verification.passed
                ? 'border-green-500/30 bg-green-500/5'
                : 'border-amber-500/30 bg-amber-500/5'
            )}
          >
            <h4 className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5">
              {verification.passed ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-500" />
              )}
              Verification
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
              <div className={cn('rounded p-2', verification.ux.passed ? 'bg-green-500/10' : 'bg-red-500/10')}>
                <span className="font-medium">UX</span>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{verification.ux.notes}</p>
              </div>
              <div className={cn('rounded p-2', verification.visual.passed ? 'bg-green-500/10' : 'bg-red-500/10')}>
                <span className="font-medium">Visual</span>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{verification.visual.notes}</p>
              </div>
              <div className={cn('rounded p-2', verification.interactions.passed ? 'bg-green-500/10' : 'bg-red-500/10')}>
                <span className="font-medium">Interactions</span>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{verification.interactions.notes}</p>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {pendingPlan && !pendingPlan.edits.length && (
        <p className="px-4 py-2 text-xs text-[hsl(var(--muted-foreground))]">
          No file edits in this plan. Send a new message to request changes.
        </p>
      )}

      <div className="p-4 border-t border-[hsl(var(--border))] space-y-3">
        {pendingPlan && pendingPlan.edits.length > 0 && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleApprove}
              disabled={isPending}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium',
                isPending
                  ? 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
              )}
            >
              <CheckCircle className="h-4 w-4" /> Approve & Execute
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={isPending}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-[hsl(var(--muted))] hover:bg-[hsl(var(--muted))]/80"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={handleEditPlan}
              disabled={isPending}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-[hsl(var(--muted))] hover:bg-[hsl(var(--muted))]/80"
            >
              Edit plan
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Describe changes, optimizations, or issues to fix..."
            className="flex-1 min-h-[56px] px-4 py-3 rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            rows={2}
            disabled={isPending}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={isPending || !message.trim()}
            className={cn(
              'px-4 py-3 rounded-xl text-sm font-medium shrink-0 flex items-center gap-2',
              isPending || !message.trim()
                ? 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] cursor-not-allowed'
                : 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90'
            )}
          >
            {chatMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function PlanCard({ plan }: { plan: PlanData }) {
  const [issuesOpen, setIssuesOpen] = useState(true);
  const [improvementsOpen, setImprovementsOpen] = useState(true);

  return (
    <div className="mt-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
      <div className="px-3 py-2 border-b border-[hsl(var(--border))] font-medium text-sm">Plan</div>
      {plan.issues.length > 0 && (
        <div className="border-b border-[hsl(var(--border))]">
          <button
            type="button"
            onClick={() => setIssuesOpen(!issuesOpen)}
            className="w-full px-3 py-2 flex items-center gap-1 text-left text-sm"
          >
            {issuesOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Issues ({plan.issues.length})
          </button>
          {issuesOpen && (
            <ul className="px-3 pb-2 text-xs text-[hsl(var(--muted-foreground))] space-y-1 list-disc list-inside">
              {plan.issues.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {plan.improvements.length > 0 && (
        <div className="border-b border-[hsl(var(--border))]">
          <button
            type="button"
            onClick={() => setImprovementsOpen(!improvementsOpen)}
            className="w-full px-3 py-2 flex items-center gap-1 text-left text-sm"
          >
            {improvementsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Improvements ({plan.improvements.length})
          </button>
          {improvementsOpen && (
            <ul className="px-3 pb-2 text-xs text-[hsl(var(--muted-foreground))] space-y-1 list-disc list-inside">
              {plan.improvements.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {plan.rationale && <p className="px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">{plan.rationale}</p>}
      <div className="px-3 py-2 text-xs text-[hsl(var(--muted-foreground))] border-t border-[hsl(var(--border))]">
        {plan.edits.length} file(s) to edit: {plan.edits.map((e) => e.path).join(', ')}
      </div>
    </div>
  );
}
