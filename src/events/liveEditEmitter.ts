import { EventEmitter } from 'events';

export interface PlanData {
  issues: string[];
  improvements: string[];
  rationale: string;
  edits: Array<{ path: string; newContent: string }>;
  planId: string;
}

export interface VerificationResult {
  ux: { passed: boolean; notes?: string };
  visual: { passed: boolean; notes?: string };
  interactions: { passed: boolean; notes?: string };
  passed: boolean;
}

class LiveEditEventEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  emitThinking(siteId: string, message: string) {
    this.emit(`live-edit:${siteId}:thinking`, message);
  }

  emitMessage(siteId: string, role: 'user' | 'assistant', content: string, streaming?: boolean) {
    this.emit(`live-edit:${siteId}:message`, { role, content, streaming });
  }

  emitPlan(siteId: string, plan: PlanData) {
    this.emit(`live-edit:${siteId}:plan`, plan);
  }

  emitStepStart(siteId: string, step: string, description: string) {
    this.emit(`live-edit:${siteId}:step_start`, { step, description });
  }

  emitStepComplete(siteId: string, step: string, result: string) {
    this.emit(`live-edit:${siteId}:step_complete`, { step, result });
  }

  emitPatch(siteId: string, path: string) {
    this.emit(`live-edit:${siteId}:patch`, path);
  }

  emitDeploy(siteId: string, message: string) {
    this.emit(`live-edit:${siteId}:deploy`, message);
  }

  emitVerificationStart(siteId: string) {
    this.emit(`live-edit:${siteId}:verification_start`, {});
  }

  emitVerificationResult(siteId: string, result: VerificationResult) {
    this.emit(`live-edit:${siteId}:verification_result`, result);
  }

  emitError(siteId: string, message: string) {
    this.emit(`live-edit:${siteId}:error`, message);
  }

  emitDone(siteId: string) {
    this.emit(`live-edit:${siteId}:done`);
  }
}

export const liveEditEmitter = new LiveEditEventEmitter();
