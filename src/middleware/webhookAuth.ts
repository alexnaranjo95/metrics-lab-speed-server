import crypto from 'crypto';
import { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/index.js';
import { sites } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export async function verifyWebhookSignature(request: FastifyRequest, reply: FastifyReply) {
  const signature = request.headers['x-webhook-signature'] as string | undefined;
  if (!signature) {
    return reply.status(401).send({ error: 'Missing X-Webhook-Signature header' });
  }

  const body = request.body as { site_id?: string; site_url?: string };
  const siteId = body.site_id;

  if (!siteId) {
    return reply.status(400).send({ error: 'Missing site_id in request body' });
  }

  const site = await db.query.sites.findFirst({
    where: eq(sites.id, siteId),
  });

  if (!site) {
    return reply.status(404).send({ error: 'Site not found' });
  }

  const rawBody = JSON.stringify(request.body);
  const expectedSignature = crypto
    .createHmac('sha256', site.webhookSecret)
    .update(rawBody)
    .digest('hex');

  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );

  if (!isValid) {
    return reply.status(403).send({ error: 'Invalid webhook signature' });
  }

  // Attach site to request for downstream use
  (request as any).site = site;
}
