import type { FastifyPluginAsync } from 'fastify';
import { buildEmitter } from '../events/buildEmitter.js';
import type { OverlayData } from '../events/buildEmitter.js';

/**
 * WebSocket routes for real-time build viewer.
 * Streams CDP screencast frames as binary JPEG data.
 */
export const websocketRoutes: FastifyPluginAsync = async (app) => {
  // Screencast frame streaming
  app.get<{ Params: { buildId: string } }>(
    '/ws/build/:buildId/screen',
    { websocket: true },
    (socket, req) => {
      const { buildId } = req.params;

      console.log(`[ws] Client connected to screencast for build ${buildId}`);

      // Stream binary frames
      const frameListener = (buffer: Buffer) => {
        if (socket.readyState === 1) { // OPEN
          socket.send(buffer, { binary: true });
        }
      };

      // Stream overlay data as JSON
      const overlayListener = (data: OverlayData) => {
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({ type: 'overlay', data }));
        }
      };

      // Stream phase changes
      const phaseListener = (phase: string) => {
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({ type: 'phase', phase }));
        }
      };

      // Stream build completion
      const completeListener = (data: { success: boolean; error?: string }) => {
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({ type: 'complete', ...data }));
        }
      };

      buildEmitter.on(`build:${buildId}:frame`, frameListener);
      buildEmitter.on(`build:${buildId}:overlay`, overlayListener);
      buildEmitter.on(`build:${buildId}:phase`, phaseListener);
      buildEmitter.on(`build:${buildId}:complete`, completeListener);

      socket.on('close', () => {
        console.log(`[ws] Client disconnected from screencast for build ${buildId}`);
        buildEmitter.off(`build:${buildId}:frame`, frameListener);
        buildEmitter.off(`build:${buildId}:overlay`, overlayListener);
        buildEmitter.off(`build:${buildId}:phase`, phaseListener);
        buildEmitter.off(`build:${buildId}:complete`, completeListener);
      });

      socket.on('error', () => {
        buildEmitter.off(`build:${buildId}:frame`, frameListener);
        buildEmitter.off(`build:${buildId}:overlay`, overlayListener);
        buildEmitter.off(`build:${buildId}:phase`, phaseListener);
        buildEmitter.off(`build:${buildId}:complete`, completeListener);
      });
    }
  );
};
