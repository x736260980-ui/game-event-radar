import { readFileSync } from 'node:fs';
import { MODELS } from '@aihot/backend/providers/llm';
import { paidRequest, assertAccepted, completeReceipt } from '@aihot/backend/providers/receipts';
import { config, credential } from '@aihot/backend/config';
import { sql, closeDb } from '@aihot/backend/db';
try {
  if (!config.modelCallsEnabled) throw new Error('Model calls are disabled');
  const input = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
  const spec = MODELS.default!;
  const body = { model: spec.model, messages: input.messages, tools: input.tools, tool_choice: input.tools?.length ? 'auto' : 'none', temperature: 0.2, max_tokens: 1000, ...(spec.extra ?? {}) };
  const key = credential('models', spec.apiKeyEnv);
  const base = credential('models', spec.baseUrlEnv);
  if (!key || !base) throw new Error('Model configuration missing');
  const receipt = await paidRequest({
    service: spec.service, model: spec.model, purpose: 'radar.web_tool_probe',
    subject: 'radar:web-tool-probe-20261006-01:' + input.phase,
    identity: { test: 'web-tool-probe-v1', phase: input.phase, body },
    requestSummary: { phase: input.phase, message_count: input.messages.length, tools: input.tools?.map((t: any) => t.function.name) },
  }, async () => {
    const res = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify(body), signal: AbortSignal.timeout(45000),
    });
    const text = await res.text(); assertAccepted(spec.service, res.status, text);
    const data = JSON.parse(text);
    return { response: data, requestId: data.id, usage: data.usage, cost: null };
  });
  const response = receipt.response as any;
  const message = response.choices?.[0]?.message;
  if (!message) throw new Error('No model message');
  await sql.begin(async tx => completeReceipt(tx, receipt.receiptId));
  console.log(JSON.stringify({ ok: true, phase: input.phase, model: spec.model, receipt_id: receipt.receiptId, reused: receipt.reused, usage: response.usage, message }));
} catch (error) {
  let msg = error instanceof Error ? error.message : String(error);
  const key = process.env.LLM_API_KEY;
  if (key) msg = msg.replaceAll(key, '[REDACTED]');
  console.error(JSON.stringify({ ok: false, error: msg.slice(0, 600) })); process.exitCode = 1;
} finally { await closeDb(); }
