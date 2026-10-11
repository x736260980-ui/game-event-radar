import { z } from 'zod';
import { chatJson, MODELS } from '@aihot/backend/providers/llm';
import { completeReceipt } from '@aihot/backend/providers/receipts';
import { sql, closeDb } from '@aihot/backend/db';

// A single explicit, budgeted call. No collection, retries or publication writes.
try {
  const result = await chatJson({
    model: 'default',
    purpose: 'radar.connection_check',
    subject: 'radar:deepseek-connection-v1',
    promptVersion: 'radar-connection-v1',
    system: 'This is a connection test. Return a JSON object only.',
    user: 'Return exactly this JSON: {"ok":true}. Do not search or add any other content.',
    schema: z.object({ ok: z.literal(true) }),
    maxTokens: 512,
    timeoutMs: 45_000,
  });
  await sql.begin(async tx => completeReceipt(tx, result.receiptId));
  console.log(JSON.stringify({
    ok: result.data.ok, model: MODELS.default!.model,
    receipt_id: result.receiptId, reused: result.reused, usage: result.usage,
    automatic_collection: false, schedules: false,
  }));
} catch (error) {
  const key = process.env.LLM_API_KEY;
  let message = error instanceof Error ? error.message : String(error);
  if (key) message = message.replaceAll(key, '[REDACTED]');
  console.error(JSON.stringify({ ok: false, error: message.slice(0, 600) }));
  process.exitCode = 1;
} finally {
  await closeDb();
}
