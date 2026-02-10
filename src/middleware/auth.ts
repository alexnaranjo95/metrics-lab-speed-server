import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';

export async function requireMasterKey(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing authorization header' });
  }
  const token = authHeader.slice(7);
  if (token !== config.MASTER_API_KEY) {
    return reply.status(403).send({ error: 'Invalid API key' });
  }
}
