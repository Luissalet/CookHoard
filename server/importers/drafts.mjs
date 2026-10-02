// Draft pipeline shared by video links, pasted text and web pages without structured data:
// deterministic reading first, then the local model only to fill gaps (its lines carry their evidence), then stored for review.
import crypto from 'node:crypto';
import { buildDraft, mergeLlm, llmMessages, RECIPE_JSON_SCHEMA } from '@cookhoard/core';
import { readKitchen, updateKitchen } from '../store.mjs';
import { nowIso } from '../clock.mjs';
import { ask } from '../hub.mjs';
import { lexOf } from '../tools/common.mjs';

const MAX_DRAFTS = 40;

export const newDraftId = () => `draft-${crypto.randomUUID().slice(0, 8)}`;

/**
 * Build, optionally structure with the model, and store a draft.
 * input: { kind, url, canonicalUrl, title, description, sources, media, notes, useModel }
 */
export async function createDraft(input) {
  const lex = lexOf(readKitchen());
  const id = input.id || newDraftId();
  const draft = buildDraft({ kind: input.kind, id, now: nowIso(), url: input.url, canonicalUrl: input.canonicalUrl, title: input.title, description: input.description,
    sources: input.sources, media: input.media, notes: { ...(input.notes ?? {}) }, lex });
  const hasText = Object.keys(draft.sources).length > 0;
  const gaps = !draft.steps.length || draft.confidence.missing.includes('ingredientes') || draft.confidence.missing.includes('cantidades') || draft.confidence.level !== 'alta';
  if (input.useModel === false) draft.status_notes.model = 'skipped';
  else if (!hasText) draft.status_notes.model = 'no_text';
  else if (!gaps) draft.status_notes.model = 'not_needed';
  else {
    const answer = await ask({ messages: llmMessages(draft), capability: 'llm', json: RECIPE_JSON_SCHEMA, effort: 'low', maxTokens: 3000, timeoutMs: 240000 });
    if (answer.ok && answer.json && typeof answer.json === 'object') mergeLlm(draft, answer.json, lex);
    else if (answer.ok) draft.status_notes.model = 'invalid_answer';
    else draft.status_notes.model = `no_model: ${answer.why}`;
  }
  updateKitchen((state) => {
    state.drafts = [draft, ...state.drafts.filter((d) => d.id !== draft.id)].slice(0, MAX_DRAFTS);
    return state;
  });
  return draft;
}

export const findDraft = (state, id) => state.drafts.find((d) => d.id === id);
