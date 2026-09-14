/**
 * QUIZVERSE — BROWSER-SIDE AI CLIENT
 * ---------------------------------------------------------------------------
 * Thin bridge between the UI and packages/ai-service/provider.js.
 *
 * Transport strategy:
 *   1. Served over http(s) → call our own `/api/ai/chat` proxy. The dev server
 *      holds the key (QV_AI_KEY) and there are no CORS problems.
 *   2. Opened without the server → call the provider API directly with the key
 *      the teacher pasted into Settings.
 *   3. Provider "mock" → same pipeline, served by the proxy, no key needed.
 */

import { generateQuizWithAI, testProvider, PROVIDERS, AIGenerationError } from '../packages/ai-service/provider.js';

export { PROVIDERS, AIGenerationError };

/** The proxy is only meaningful when the page is served by our dev server. */
export function aiEndpoint() {
  if (typeof location === 'undefined') return null;
  return location.protocol === 'http:' || location.protocol === 'https:' ? '/api/ai/chat' : null;
}

export async function serverAiStatus() {
  const endpoint = aiEndpoint();
  if (!endpoint) return null;
  try {
    const res = await fetch('/api/ai/status', { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Device settings -> provider config for provider.js. */
export function providerConfig(settings = {}) {
  const provider = settings.aiProvider || 'offline';
  const spec = PROVIDERS[provider] || {};
  return {
    provider,
    model: settings.aiModel || spec.defaultModel || undefined,
    baseUrl: settings.aiBaseUrl || spec.defaultBase || undefined,
    apiKey: settings.aiApiKey || undefined,
    endpoint: aiEndpoint(),
    timeoutMs: Number(settings.aiTimeoutMs) || 60000,
    temperature: typeof settings.aiTemperature === 'number' ? settings.aiTemperature : 0.6,
  };
}

/** Map the app's request object onto the AI input contract. */
export function toAiInput(request = {}) {
  return {
    classLevel: Number(request.classLevel) || 5,
    topic: request.topic || 'General',
    subject: request.subject || 'General',
    language: request.language || 'en',
    count: Number(request.count) || 15,
    timer: request.timer ?? 'auto',
    passPolicy: request.passPolicy || 'auto',
    lifelines: request.lifelines,
    sourceMode: request.mode === 'material' ? 'material' : 'topic',
    materialText: request.mode === 'material' ? (request.text || '') : '',
    allowAdditionalKnowledge: !!request.allowAdditionalKnowledge,
    fileName: request.fileName || null,
    pages: request.pages || null,
  };
}

export async function generateWithAI({ settings = {}, request = {}, onProgress = () => {}, extra } = {}) {
  const config = providerConfig(settings);
  const input = toAiInput(request);
  const result = await generateQuizWithAI({
    config: extra ? { ...config, extra } : config,
    input,
    onProgress,
  });
  return { ...result, engine: config.provider };
}

export async function testAiProvider(settings = {}) {
  const config = providerConfig(settings);
  const status = await serverAiStatus();
  const result = await testProvider({ config });
  return { ...result, server: status };
}
