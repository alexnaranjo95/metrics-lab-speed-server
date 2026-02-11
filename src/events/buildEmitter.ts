import { EventEmitter } from 'events';

/**
 * Structured log event format for build progress, modeled after Vercel's build logs.
 */
export interface BuildLogEvent {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  phase: 'crawl' | 'images' | 'css' | 'js' | 'html' | 'fonts' | 'deploy' | 'measure';
  message: string;
  meta?: {
    pageUrl?: string;
    assetUrl?: string;
    savings?: { before: number; after: number };
    duration?: number;
  };
}

/**
 * Overlay data for element identification during screencast.
 */
export interface OverlayData {
  elements: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    tag: string;
    selector: string;
  }>;
}

/**
 * Typed event emitter for build events.
 * Used to bridge BullMQ worker events to WebSocket/SSE clients.
 *
 * Event patterns:
 * - `build:{id}:frame`    — Binary JPEG frame from CDP screencast
 * - `build:{id}:progress` — Structured log event
 * - `build:{id}:overlay`  — Element overlay data for the viewer
 * - `build:{id}:complete` — Build finished (success or failure)
 * - `build:{id}:phase`    — Phase change notification
 */
class BuildEventEmitter extends EventEmitter {
  constructor() {
    super();
    // Allow many listeners (one per connected client per build)
    this.setMaxListeners(100);
  }

  /** Emit a screencast frame */
  emitFrame(buildId: string, buffer: Buffer, metadata?: { scrollX: number; scrollY: number }) {
    this.emit(`build:${buildId}:frame`, buffer, metadata);
  }

  /** Emit a structured log event */
  emitProgress(buildId: string, event: BuildLogEvent) {
    this.emit(`build:${buildId}:progress`, event);
  }

  /** Emit overlay data for the viewer */
  emitOverlay(buildId: string, data: OverlayData) {
    this.emit(`build:${buildId}:overlay`, data);
  }

  /** Emit build completion */
  emitComplete(buildId: string, success: boolean, error?: string) {
    this.emit(`build:${buildId}:complete`, { success, error });
  }

  /** Emit phase change */
  emitPhase(buildId: string, phase: BuildLogEvent['phase']) {
    this.emit(`build:${buildId}:phase`, phase);
  }

  /** Helper to create and emit a progress log */
  log(buildId: string, phase: BuildLogEvent['phase'], level: BuildLogEvent['level'], message: string, meta?: BuildLogEvent['meta']) {
    this.emitProgress(buildId, {
      timestamp: new Date().toISOString(),
      level,
      phase,
      message,
      meta,
    });
  }
}

// Singleton instance — shared across the worker and API routes
export const buildEmitter = new BuildEventEmitter();
