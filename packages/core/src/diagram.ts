// Recipe → flow diagram ("Cooking for Engineers" style). Builds a DAG from the structured
// ingredients + free-text steps: which ingredients ENTER at each step, which steps run as
// PARALLEL branches (cook the pasta / blend the pesto), and where branches MERGE. Pure
// inference — no extra authoring work — so every recipe (user, seed or imported) gets a diagram.
//
// The output is row-oriented (one row per step, each with a branch column, pass-through rails
// and merge markers) so a mobile UI can render it as a git-graph-like vertical flow with plain
// flexbox — no SVG or canvas dependency needed.

import type { Recipe, Ingredient } from './types';
import { INGREDIENT_BY_ID } from './seed';

export interface DiagramRow {
  stepIndex: number;          // index into recipe.steps
  text: string;
  timerSec?: number;
  branch: number;             // column of this node
  /** Branch columns alive at this row (including this node's), for drawing vertical rails. */
  rails: number[];
  /** Branch columns that merge INTO this node at this row (drawn as connectors). */
  mergesFrom: number[];
  /** Ingredient ids that enter the flow at this step. */
  newIngredients: string[];
  /** True when this step opens a new parallel branch. */
  startsBranch: boolean;
}

export interface RecipeDiagram {
  rows: DiagramRow[];
  branchCount: number;        // number of columns needed
  /** Non-staple ingredient ids never matched to any step (rendered entering the final dish). */
  unplaced: string[];
  /** Branch columns still open at the end — they converge into the dish node. */
  finalBranches: number[];
}

// --- text matching -------------------------------------------------------------------------

const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const norm = (s: string) => stripAccents(s.toLowerCase());
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Name variants an ingredient can appear as inside step text. */
function variantsFor(id: string, dict: Record<string, Ingredient>): string[] {
  const out = new Set<string>();
  const ing = dict[id];
  const push = (v?: string) => { if (v && v.trim().length >= 3) out.add(norm(v.trim())); };
  if (ing) {
    push(ing.name);
    push(ing.nameEn);
    for (const a of ing.aliases ?? []) push(a);
    // First word of multi-word names ("pimiento verde" → "pimiento", "aceite de oliva" → "aceite").
    const fw = (s: string) => s.split(/\s+/)[0];
    if (ing.name.includes(' ')) push(fw(ing.name));
    if (ing.nameEn.includes(' ')) push(fw(ing.nameEn));
  } else {
    // Free-text id: "queso_azul" → "queso azul" (+ first word).
    const pretty = id.replace(/[_-]+/g, ' ').trim();
    push(pretty);
    if (pretty.includes(' ')) push(pretty.split(/\s+/)[0]);
  }
  return [...out];
}

/** Word-boundary-aware "does this step text mention this variant?". */
function textMentions(normText: string, variant: string): boolean {
  const v = escapeRe(variant);
  // Short words ("sal", "ajo") must match exactly (± simple plural) to avoid "salpimenta".
  const re = variant.length <= 4
    ? new RegExp(`(^|[^a-zñ])${v}(s|es)?($|[^a-zñ])`)
    : new RegExp(`(^|[^a-zñ])${v}`);
  return re.test(normText);
}

// --- flow heuristics -----------------------------------------------------------------------

/** Verbs that add INTO the current mixture → chain onto the active branch. */
const ADDITIVE = ['anade', 'anadir', 'agrega', 'incorpora', 'echa', 'vierte', 'add ', 'stir in', 'pour'];
/** Strong merge verbs → converge branches. */
const MERGE = ['mezcla', 'mezclar', 'combina', 'junta', 'une ', 'mix', 'combine', 'toss', 'sirve con', 'emplata'];
/** "todo"/"everything" → the whole current flow is involved. */
const WHOLE = ['todo', 'everything', ' all '];

const hasAny = (normText: string, words: string[]) => words.some((w) => normText.includes(w));

/** Build the flow diagram for a recipe. Uses the canonical dictionary (+ any extra entries). */
export function buildDiagram(
  recipe: Recipe,
  dict: Record<string, Ingredient> = INGREDIENT_BY_ID,
): RecipeDiagram {
  const rows: DiagramRow[] = [];
  const variants = new Map<string, string[]>();
  for (const ri of recipe.ingredients) {
    if (!variants.has(ri.ingredientId)) variants.set(ri.ingredientId, variantsFor(ri.ingredientId, dict));
  }

  const consumedBy = new Map<string, number>();   // ingredientId → branch col
  const mergedInto = new Map<number, number>();   // closed col → the col it merged into
  let active: number[] = [];                       // open branch columns, in creation order
  let nextCol = 0;
  let maxCols = 0;

  /** Follow merges so references to a closed branch land on its surviving branch. */
  const resolve = (col: number): number => {
    let c = col;
    const seen = new Set<number>();
    while (mergedInto.has(c) && !seen.has(c)) { seen.add(c); c = mergedInto.get(c)!; }
    return c;
  };

  recipe.steps.forEach((step, stepIndex) => {
    const text = norm(step.text);

    const matchedNew: string[] = [];
    const referencedBranches = new Set<number>();
    for (const [ingId, vars] of variants) {
      if (!vars.some((v) => textMentions(text, v))) continue;
      const owner = consumedBy.get(ingId);
      if (owner == null) matchedNew.push(ingId);
      else {
        const col = resolve(owner);
        if (active.includes(col)) referencedBranches.add(col);
      }
    }

    const merging = hasAny(text, MERGE);
    const whole = hasAny(text, WHOLE);
    const additive = hasAny(text, ADDITIVE);

    let inputs = [...referencedBranches];
    if ((merging || whole) && active.length > 1) inputs = [...new Set([...inputs, ...active])];

    let branch: number;
    let mergesFrom: number[] = [];
    let startsBranch = false;

    if (inputs.length > 0) {
      branch = Math.min(...inputs);
      mergesFrom = inputs.filter((c) => c !== branch);
      for (const c of mergesFrom) mergedInto.set(c, branch);
      active = active.filter((c) => !mergesFrom.includes(c));
      if (!active.includes(branch)) active.push(branch);
    } else if (active.length === 0) {
      branch = nextCol++;
      active.push(branch);
      startsBranch = stepIndex > 0;
    } else if (matchedNew.some((id) => !dict[id]?.isStaple) && !additive && !whole) {
      // Only-new, substantial ingredients and no reference to the current flow → parallel branch.
      // (Staples like salt never open a branch: "rectifica de sal" is a continuation.)
      branch = nextCol++;
      active.push(branch);
      startsBranch = true;
    } else {
      branch = active[active.length - 1]!;   // continuation of the current flow
    }

    for (const ingId of matchedNew) consumedBy.set(ingId, branch);
    maxCols = Math.max(maxCols, nextCol);

    rows.push({
      stepIndex, text: step.text, timerSec: step.timerSec,
      branch, rails: [...active], mergesFrom, newIngredients: matchedNew, startsBranch,
    });
  });

  const unplaced = recipe.ingredients
    .map((i) => i.ingredientId)
    .filter((id) => !consumedBy.has(id) && !dict[id]?.isStaple);

  return { rows, branchCount: Math.max(maxCols, active.length, 1), unplaced: [...new Set(unplaced)], finalBranches: active };
}
