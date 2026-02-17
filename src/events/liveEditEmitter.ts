import { EventEmitter } from 'events';

class LiveEditEventEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  emitThinking(siteId: string, message: string) {
    this.emit(`live-edit:${siteId}:thinking`, message);
  }

  emitPatch(siteId: string, path: string) {
    this.emit(`live-edit:${siteId}:patch`, path);
  }

  emitDeploy(siteId: string, message: string) {
    this.emit(`live-edit:${siteId}:deploy`, message);
  }

  emitError(siteId: string, message: string) {
    this.emit(`live-edit:${siteId}:error`, message);
  }

  emitDone(siteId: string) {
    this.emit(`live-edit:${siteId}:done`);
  }
}

export const liveEditEmitter = new LiveEditEventEmitter();
