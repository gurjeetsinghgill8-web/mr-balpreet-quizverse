/**
 * QUIZVERSE — GENERATION ROUTER
 * ---------------------------------------------------------------------------
 * One entry point for "make me a game". It decides WHICH engine answers:
 *
 *   provider = offline → deterministic demo library / material extractor
 *   provider = mock    → full AI pipeline, answered by the mock provider (no key)
 *   provider = openai / anthropic / gemini / ollama → real live generation
 *
 * If a live call fails, the teacher is never left stuck: unless the teacher
 * switched the fallback off, the offline engine quietly takes over and the UI
 * reports which engine produced the quiz.
 */

import { Store } from './store.js';
import { generateFromTopic, generateFromMaterial, seedQuestionsForTopic } from './offline-generator.js';
import { generateWithAI, providerConfig } from './ai-client.js';

/** Human-readable pipeline log the loading screen renders. */
export function describeProgress(event) {
  if (!event || !event.stage) return null;
  switch (event.stage) {
    case 'prompt': return { key: 'loading.understanding', detail: `${event.promptChars} chars of instructions` };
    case 'generating': return { key: 'loading.preparing', detail: `call ${event.calls}` };
    case 'validating': return { key: 'loading.checking', detail: `${event.passed ?? 0} passed${event.failed ? `, ${event.failed} to fix` : ''}` };
    case 'repairing': return { key: 'loading.balancing', detail: `repair round ${event.round}` };
    case 'extending': return { key: 'loading.building', detail: 'asking for more questions' };
    case 'building': return { key: 'loading.almost', detail: `${event.passed} questions stitched into 5 stages` };
    case 'fallback': return { key: 'loading.building', detail: 'switched to the offline library' };
    case 'ai_failed': return { key: 'loading.checking', detail: event.message || 'AI call failed' };
    default: return null;
  }
}

/**
 * Generate a quiz package.
 * @param {object} args
 * @param {object} args.request  the create-form payload
 * @param {Function} [args.onProgress]
 * @param {object} [args.settings] device settings (provider config lives here)
 */
export async function generateQuiz({ request, onProgress = () => {}, settings = null } = {}) {
  const device = settings || Store.settings();
  const provider = device.aiProvider || 'offline';
  const wantsAI = provider !== 'offline';
  let aiError = null;

  if (wantsAI) {
    try {
      const extra = provider === 'mock'
        ? { mock_seed: seedQuestionsForTopic(request.topic, request.classLevel), inject_flaw: true, delay_ms: 220 }
        : undefined;
      const result = await generateWithAI({ settings: device, request, onProgress, extra });
      if (result && result.ok) {
        return { ...result, engine: provider, engineLabel: provider };
      }
      throw Object.assign(new Error('AI returned no quiz'), { code: 'no_questions' });
    } catch (err) {
      aiError = { code: err.code || 'error', message: err.message };
      onProgress({ stage: 'ai_failed', ...aiError });
      if (device.aiFallback === false) {
        return {
          ok: false,
          error: 'ai_failed',
          code: aiError.code,
          message: aiError.message,
          engine: provider,
        };
      }
      onProgress({ stage: 'fallback', ...aiError });
    }
  }

  const offline = request.mode === 'material'
    ? generateFromMaterial(request)
    : generateFromTopic(request);

  return {
    ...offline,
    engine: 'offline',
    engineLabel: wantsAI && aiError ? `offline (after ${provider} failed)` : 'offline',
    aiError,
  };
}

/** Engine description for the create/preview screens. */
export function engineBadge(settings = Store.settings()) {
  const provider = settings.aiProvider || 'offline';
  if (provider === 'offline') return { id: 'offline', label: 'Demo library (no AI)', tone: 'muted' };
  if (provider === 'mock') return { id: 'mock', label: `Mock AI pipeline${settings.aiModel ? '' : ''}`, tone: 'cyan' };
  return { id: provider, label: `${provider} · ${settings.aiModel || providerConfig(settings).model || 'default'}`, tone: 'gold' };
}

export default generateQuiz;
