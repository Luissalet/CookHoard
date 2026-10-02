// Importing recipes: video links and reels, pasted text, and the draft review step (get, edit, accept, discard).
import crypto from 'node:crypto';
import { draftToRecipe, parseRecipeText, platformOf } from '@cookhoard/core';
import { readKitchen, updateKitchen } from '../store.mjs';
import { nowIso } from '../clock.mjs';
import { emit } from '../hub.mjs';
import { importVideo } from '../importers/video.mjs';
import { createDraft, findDraft } from '../importers/drafts.mjs';
import { z, fail, tool, lexOf, recipeSummary } from './common.mjs';

export const draftSummary = (draft) => ({ id: draft.id, kind: draft.kind, title: draft.title, url: draft.url ?? null, platform: draft.media?.platform ?? null,
  uploader: draft.media?.uploader ?? null, thumbnail: draft.media?.thumbnail ?? null, created_at: draft.createdAt, confidence: draft.confidence,
  ingredients: draft.ingredients.length, steps: draft.steps.length, servings: draft.servings ?? null, notes: draft.status_notes });

const editsSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(), description: z.string().max(1000).optional(), servings: z.number().int().positive().nullable().optional(),
  prep_min: z.number().int().min(0).nullable().optional(), cook_min: z.number().int().min(0).nullable().optional(),
  ingredients: z.array(z.object({ name: z.string().trim().min(1).max(100), quantity: z.number().positive().nullable().optional(), unit: z.string().max(30).nullable().optional(),
    optional: z.boolean().optional(), note: z.string().max(200).optional() })).min(1).max(60).optional(),
  steps: z.array(z.union([z.string().trim().min(1).max(1000), z.object({ text: z.string().trim().min(1).max(1000), timerSec: z.number().int().min(1).max(86400).optional() })])).min(1).max(60).optional(),
}).describe('Corrections to apply before saving; omitted fields keep what was read.');

/** Turn a draft into a saved recipe. Used by the tool and by the UI. */
export function acceptDraft(draftId, edits = {}) {
  let accepted;
  const state = updateKitchen((current) => {
    const draft = findDraft(current, draftId) || fail('Borrador no encontrado.');
    const id = `local-${crypto.randomUUID()}`;
    const { recipe, newIngredients } = draftToRecipe(draft, { title: edits.title, description: edits.description, servings: edits.servings, prepMin: edits.prep_min, cookMin: edits.cook_min,
      ingredients: edits.ingredients, steps: edits.steps }, id, nowIso(), lexOf(current));
    if (!recipe.ingredients.length || !recipe.steps.length) fail('Una receta necesita al menos un ingrediente y un paso: corrígelo en edits antes de guardar.');
    for (const created of newIngredients) if (!current.userIngredients.some((u) => u.id === created.id)) current.userIngredients.push(created);
    const kind = draft.kind === 'web' ? 'url' : draft.kind;
    const used = Object.keys(draft.sources);
    recipe.source = { kind, ...(draft.url ? { url: draft.url } : {}), ...(draft.media?.platform ? { platform: draft.media.platform } : {}),
      ...(draft.media?.uploader ? { uploader: draft.media.uploader } : {}), ...(draft.media?.thumbnail ? { thumbnail: draft.media.thumbnail } : {}),
      importedAt: nowIso(), evidence: used };
    if (draft.url) recipe.sourceUrl = draft.canonicalUrl || draft.url;
    if (draft.media?.thumbnail) recipe.image = `/${draft.media.thumbnail}`;
    current.recipes.push(recipe);
    current.drafts = current.drafts.filter((d) => d.id !== draftId);
    accepted = id;
    return current;
  });
  const recipe = state.recipes.find((r) => r.id === accepted);
  emit('cookhoard.recipe.imported', { recipe_id: recipe.id, title: recipe.title, source: recipe.source?.kind ?? 'manual' });
  return { recipe: recipeSummary(recipe, state), steps: recipe.steps, drafts_left: state.drafts.length };
}

export const IMPORT_TOOLS = [
  tool({ name: 'import_recipe_video', openWorld: true,
    schema: z.object({ url: z.url().refine((v) => /^https?:\/\//i.test(v), 'Usa un enlace HTTP o HTTPS.'), caption: z.string().max(20000).optional(), transcript_text: z.string().max(60000).optional(),
      use_model: z.boolean().default(true), force: z.boolean().default(false) }),
    description: 'Read a recipe from a video or reel link into a draft to review. Receta desde un vídeo o reel.\nReads the caption, subtitles, the spoken audio (transcribed by Funes) and text on screen, then structures it; every line keeps its evidence and nothing is saved until recipe_draft_accept. caption / transcript_text can supply text the platform did not give. Says exactly which step could not run (no yt-dlp, login needed, no model).\nSinónimos: receta de este reel, receta de un vídeo, importar de Instagram, receta de TikTok, receta de YouTube',
    run: async ({ url, caption, transcript_text, use_model, force }) => {
      const result = await importVideo({ url, caption, transcript_text, use_model, force });
      if (result.status === 'draft') return { ...result, draft: result.draft, summary: draftSummary(result.draft) };
      return result;
    } }),

  tool({ name: 'import_recipe_text', schema: z.object({ text: z.string().trim().min(10).max(60000), title: z.string().trim().max(120).optional(), url: z.string().max(2000).optional(), use_model: z.boolean().default(true) }),
    description: 'Read a recipe from pasted text (Spanish or English) into a draft to review. Receta desde texto pegado.\nUnderstands ingredient lists with quantities, numbered steps, times and servings; unclear parts are filled by the local model when available and flagged. Nothing is saved until recipe_draft_accept.\nSinónimos: pega esta receta, receta de un mensaje, apunta esta receta, receta del WhatsApp, copiar receta',
    run: async ({ text, title, url, use_model }) => {
      const parsed = parseRecipeText(text);
      if (!parsed.ingredients.length && !parsed.steps.length && !use_model) fail('No he reconocido ingredientes ni pasos en el texto.');
      const draft = await createDraft({ kind: 'text', title, url, canonicalUrl: url, sources: { text }, media: url ? { platform: platformOf(url) } : undefined, useModel: use_model });
      if (!draft.ingredients.length && !draft.steps.length) {
        updateKitchen((current) => { current.drafts = current.drafts.filter((d) => d.id !== draft.id); return current; });
        fail(`No he reconocido una receta en el texto${draft.status_notes.model?.startsWith('no_model') ? ' y no hay modelo local para estructurarlo' : ''}.`);
      }
      return { status: 'draft', draft, summary: draftSummary(draft) };
    } }),

  tool({ name: 'recipe_drafts_list', readOnly: true, schema: z.object({}),
    description: 'List recipe drafts waiting for review. Borradores de recetas pendientes.\nSinónimos: borradores, recetas por revisar, importaciones pendientes',
    run: () => ({ drafts: readKitchen().drafts.map(draftSummary) }) }),

  tool({ name: 'recipe_draft_get', readOnly: true, schema: z.object({ draft_id: z.string().min(1) }),
    description: 'One recipe draft with the evidence of every line and what is missing. Revisar un borrador.\nEach ingredient and step says which text it was read from (caption, subtitles, transcript, screen, text) and whether the evidence was verified.\nSinónimos: ver borrador, evidencia, de dónde sale, revisar importación',
    run: ({ draft_id }) => ({ draft: findDraft(readKitchen(), draft_id) || fail('Borrador no encontrado.') }) }),

  tool({ name: 'recipe_draft_accept', schema: z.object({ draft_id: z.string().min(1), edits: editsSchema.optional() }),
    description: 'Save a reviewed recipe draft as a recipe, with optional corrections. Guardar el borrador como receta.\nNew ingredient names join your dictionary. Returns the saved recipe; the draft is removed.\nSinónimos: guardar receta importada, aceptar borrador, confirmar receta, está bien así',
    run: ({ draft_id, edits }) => acceptDraft(draft_id, edits ?? {}) }),

  tool({ name: 'recipe_draft_discard', destructive: true, idempotent: true, schema: z.object({ draft_id: z.string().min(1) }),
    description: 'Discard a recipe draft. Descartar un borrador.\nSinónimos: borrar borrador, descartar importación, no es una receta',
    run: ({ draft_id }) => {
      const state = updateKitchen((current) => { current.drafts = current.drafts.filter((d) => d.id !== draft_id); return current; });
      return { discarded: draft_id, drafts_left: state.drafts.length };
    } }),
];
