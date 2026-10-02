import React, { useEffect, useMemo, useState } from 'react';
import { call } from '../api.js';
import { useApp } from '../App.jsx';
import { useAsync } from '../hooks.js';
import { Badge, Empty, ErrorNote, Field, Icon, Modal, PageHeader, Segmented, Spinner, Stars } from '../components/ui.jsx';
import { CostLine, ExpiryBadge, Meta, RecipeThumb } from '../components/shared.jsx';
import CookingMode from '../components/CookingMode.jsx';
import { fmtDate, fmtMinutes, fmtMoney, fmtQty } from '../format.js';

export default function Recipes() {
  const { route } = useApp();
  const [id, mode] = route.params;
  if (id && mode === 'cook') return <CookingScreen id={id} />;
  if (id) return <RecipeDetail id={id} />;
  return <RecipeList />;
}

// ───────────────────────────── list ─────────────────────────────

const DIETS = ['vegetariano', 'vegano', 'sin_gluten', 'sin_lactosa'];
const SOURCES = ['all', 'own', 'video', 'url', 'text', 'seed'];

function RecipeList() {
  const { t, lang, go } = useApp();
  const [query, setQuery] = useState('');
  const [minutes, setMinutes] = useState(0);
  const [diets, setDiets] = useState([]);
  const [source, setSource] = useState('all');
  const [saved, setSaved] = useState(false);
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const id = setTimeout(() => setDebounced(query), 250); return () => clearTimeout(id); }, [query]);
  const result = useAsync(() => call('find_recipes', {
    query: debounced, limit: 100, ...(minutes ? { max_minutes: minutes } : {}), ...(diets.length ? { diet: diets } : {}), ...(source !== 'all' ? { source } : {}), ...(saved ? { saved_only: true } : {}),
  }), [debounced, minutes, diets.join(','), source, saved]);
  const rows = result.data?.recipes ?? [];
  const active = minutes || diets.length || source !== 'all' || saved || query;

  return (
    <>
      <PageHeader title={t('recipes')} sub={result.data ? t('recipes.count', { n: result.data.total }) : ''}>
        <button className="btn btn-primary" onClick={() => go('import')}><Icon name="plus" size={16} />{t('recipes.new')}</button>
      </PageHeader>
      <div className="toolbar">
        <div className="search"><Icon name="search" size={18} /><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('recipes.search')} aria-label={t('recipes.search')} /></div>
        <div className="filters">
          <div className="chips" aria-label={t('recipes.time')}>
            {[20, 40, 60].map((m) => <button key={m} className={`chip ${minutes === m ? 'on' : ''}`} onClick={() => setMinutes(minutes === m ? 0 : m)}>{t(`time.${m}`)}</button>)}
          </div>
          <div className="chips" aria-label={t('recipes.diet')}>
            {DIETS.map((d) => <button key={d} className={`chip ${diets.includes(d) ? 'on' : ''}`} onClick={() => setDiets(diets.includes(d) ? diets.filter((x) => x !== d) : [...diets, d])}>{t(`diet.${d}`)}</button>)}
            <button className={`chip ${saved ? 'on' : ''}`} onClick={() => setSaved(!saved)}><Icon name="star" size={14} />{t('recipes.saved')}</button>
          </div>
          <div className="chips" aria-label={t('recipes.source')}>
            {SOURCES.map((s) => <button key={s} className={`chip ${source === s ? 'on' : ''}`} onClick={() => setSource(s)}>{t(`source.${s}`)}</button>)}
          </div>
        </div>
      </div>
      <ErrorNote error={result.error} onRetry={result.reload} t={t} />
      {!result.data && result.loading ? <Spinner label={t('loading')} /> : null}
      {result.data && rows.length === 0 ? <Empty>{t('recipes.none')}{active ? <> <button className="link" onClick={() => { setQuery(''); setMinutes(0); setDiets([]); setSource('all'); setSaved(false); }}>{t('recipes.clear')}</button></> : null}</Empty> : null}
      <div className="recipe-grid">
        {rows.map((r) => (
          <article key={r.id} className="recipe-card" onClick={() => go('recipes', r.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') go('recipes', r.id); }}>
            <RecipeThumb recipe={r} />
            <div className="recipe-card-body">
              <h3>{r.title}</h3>
              <Meta minutes={r.totalMin} servings={r.servings}>{r.rating ? <span><Icon name="star" size={14} />{String(r.rating).replace('.', lang === 'es' ? ',' : '.')}</span> : null}</Meta>
              <div className="chips">
                {r.source?.kind && r.source.kind !== 'manual' ? <Badge tone="info">{t(`source.${r.source.kind}`)}</Badge> : null}
                {r.diet?.slice(0, 2).map((d) => <Badge key={d} tone="neutral">{DIETS.includes(d) ? t(`diet.${d}`) : d}</Badge>)}
                {r.cooked_count ? <Badge tone="ok">{r.cooked_count}×</Badge> : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

// ───────────────────────────── detail ─────────────────────────────

function RecipeDetail({ id }) {
  const { t, lang, go, toast } = useApp();
  const recipe = useAsync(() => call('get_recipe', { recipe_id: id }), [id]);
  const pantry = useAsync(() => call('pantry_list', {}), []);
  const r = recipe.data;
  const base = r?.servings ?? null;
  const [servings, setServings] = useState(null);
  const [cooked, setCooked] = useState(false);
  useEffect(() => { if (r) setServings(r.servings ?? null); }, [r?.id]); // eslint-disable-line
  const factor = base && servings ? servings / base : 1;
  const cost = useAsync(() => (r && servings && base && servings !== base ? call('recipe_cost', { recipe_id: id, servings }) : Promise.resolve(null)), [id, servings, r?.id]);
  const haveIds = useMemo(() => new Set((pantry.data?.items ?? []).map((i) => i.id)), [pantry.data]);
  const pantryById = useMemo(() => new Map((pantry.data?.items ?? []).map((i) => [i.id, i])), [pantry.data]);

  if (recipe.error) return <ErrorNote error={recipe.error} onRetry={recipe.reload} t={t} />;
  if (!r) return <Spinner label={t('loading')} />;
  const shownCost = cost.data ?? r.cost;
  const missing = r.ingredients.filter((i) => !i.optional && !haveIds.has(i.ingredientId));
  const own = r.own;

  const addMissing = async () => {
    let n = 0;
    for (const i of missing) { await call('add_kitchen_item', { name: i.name, checked: false }); n++; }
    toast(t('recipe.added', { n }));
  };
  const toggleSaved = async () => { await call('set_recipe_saved', { recipe_id: id, saved: !r.saved }); recipe.reload(); };
  const remove = async () => { if (window.confirm(t('recipe.delete.confirm'))) { await call('delete_recipe', { recipe_id: id }); go('recipes'); } };

  return (
    <article className="recipe-detail">
      <button className="link back" onClick={() => go('recipes')}><Icon name="left" size={16} />{t('recipes')}</button>
      <header className="recipe-head">
        <RecipeThumb recipe={r} className="thumb-large" />
        <div>
          <h1>{r.title}</h1>
          {r.description ? <p className="muted">{r.description}</p> : null}
          <Meta minutes={r.totalMin} servings={base}>
            {r.rating ? <span><Icon name="star" size={14} />{String(r.rating).replace('.', ',')}</span> : null}
            {r.cooked_count ? <span>{r.cooked_count === 1 ? t('recipe.cooked1') : t('recipe.cooked', { n: r.cooked_count })}</span> : null}
          </Meta>
          <div className="chips">
            {r.source?.kind && r.source.kind !== 'manual' ? <Badge tone="info">{t(`source.${r.source.kind}`)}{r.source.platform ? ` · ${r.source.platform}` : ''}</Badge> : null}
            {r.source?.uploader ? <Badge tone="neutral">{t('recipe.sourceBy', { name: r.source.uploader })}</Badge> : null}
            {r.diet?.map((d) => <Badge key={d} tone="neutral">{DIETS.includes(d) ? t(`diet.${d}`) : d}</Badge>)}
            {r.allergens_detected?.map((a) => <Badge key={a} tone="warn">{a}</Badge>)}
          </div>
          <div className="actions">
            <button className="btn btn-primary" onClick={() => go('recipes', id, 'cook')}><Icon name="cook" size={18} />{t('recipe.cook')}</button>
            <button className="btn" onClick={() => setCooked(true)}><Icon name="check" size={18} />{t('recipe.markCooked')}</button>
            <button className="btn" onClick={toggleSaved}><Icon name="star" size={18} />{r.saved ? t('recipe.unsave') : t('recipe.save')}</button>
            <button className="btn" onClick={() => window.print()}><Icon name="print" size={18} />{t('recipe.print')}</button>
            {own ? <button className="btn btn-danger" onClick={remove}><Icon name="trash" size={18} />{t('delete')}</button> : null}
          </div>
          {r.source?.url || r.sourceUrl ? <p className="small"><a href={r.source?.url || r.sourceUrl} target="_blank" rel="noreferrer noopener"><Icon name="link" size={14} /> {t('recipe.open')}</a>{r.source?.evidence?.length ? <span className="muted"> · {t('recipe.evidence', { sources: r.source.evidence.join(', ') })}</span> : null}</p> : null}
        </div>
      </header>

      <div className="recipe-cols">
        <section className="card">
          <div className="scaler">
            <h2>{t('recipe.ingredients')}</h2>
            {base ? (
              <div className="stepper" role="group" aria-label={t('recipe.servings')}>
                <button onClick={() => setServings(Math.max(1, (servings ?? base) - 1))} aria-label="−">−</button>
                <output>{servings ?? base} <small>{t('recipe.servings').toLowerCase()}</small></output>
                <button onClick={() => setServings((servings ?? base) + 1)} aria-label="+">+</button>
              </div>
            ) : <span className="small muted">{t('recipe.baseUnknown')}</span>}
          </div>
          {base && servings !== base ? <p className="small muted">{t('recipe.scaled', { n: servings })}</p> : null}
          <ul className="ingredients">
            {r.ingredients.map((i, index) => {
              const p = pantryById.get(i.ingredientId);
              const qty = i.quantity ? fmtQty(i.quantity * factor, lang) : '';
              return (
                <li key={`${i.ingredientId}-${index}`} className={haveIds.has(i.ingredientId) ? 'have' : ''}>
                  <span className="qty">{qty} {i.unit ?? ''}</span>
                  <span className="name">{i.name}{i.optional ? <small className="muted"> ({t('recipe.optional')})</small> : null}</span>
                  {p ? <ExpiryBadge days={p.days_left} kind={p.expiry_kind} basis={p.expiry_basis} /> : <Icon name="x" size={14} className="faint" />}
                </li>
              );
            })}
          </ul>
          <div className="actions">
            {missing.length ? <button className="btn" onClick={addMissing}><Icon name="shopping" size={18} />{t('recipe.addMissing')} ({missing.length})</button> : <Badge tone="ok">{t('today.have')}</Badge>}
          </div>
          <div className="costbox">
            <h3>{t('recipe.cost')}</h3>
            {shownCost && (shownCost.total || shownCost.per_serving) ? (
              <p><b>{fmtMoney(shownCost.total, lang)}</b> · {fmtMoney(shownCost.per_serving, lang)} {t('recipe.perServing')}{shownCost.complete ? '' : ' *'}</p>
            ) : <p className="muted">{t('recipe.costNone')}</p>}
            {shownCost?.missing_prices?.length ? <p className="small muted">{t('recipe.costMissing', { list: shownCost.missing_prices.join(', ') })}</p> : null}
          </div>
          {r.nutrition_per_serving ? (
            <div className="costbox">
              <h3>{t('recipe.nutrition')}</h3>
              <p className="small">{Object.entries(r.nutrition_per_serving).filter(([, v]) => typeof v === 'number').map(([k, v]) => `${t(`nutri.${k}`) === `nutri.${k}` ? k : t(`nutri.${k}`)}: ${Math.round(v)}`).join(' · ')}</p>
            </div>
          ) : null}
        </section>

        <section className="card">
          <h2>{t('recipe.steps')}</h2>
          <ol className="steps">
            {r.steps.map((s, index) => (
              <li key={index}>
                <p>{s.text}</p>
                <div className="chips">
                  {s.timerSec ? <Badge tone="info"><Icon name="timer" size={12} /> {fmtMinutes(Math.round(s.timerSec / 60)) || `${s.timerSec} s`}</Badge> : null}
                  {s.temperatureC ? <Badge tone="warn">{t('recipe.temp', { n: s.temperatureC })}</Badge> : null}
                </div>
              </li>
            ))}
          </ol>
          <h3>{t('recipe.history')}</h3>
          {r.cooking_history.length === 0 ? <p className="muted">{t('recipe.history.none')}</p> : (
            <ul className="rows">
              {r.cooking_history.slice().reverse().slice(0, 6).map((m) => (
                <li key={m.id}><span>{fmtDate(m.createdAt, lang, { day: 'numeric', month: 'short', year: 'numeric' })}{m.notes ? <small className="muted"> · {m.notes}</small> : null}</span>{m.rating ? <Stars value={m.rating} /> : null}</li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {cooked ? <CookedModal recipe={r} onClose={() => setCooked(false)} onDone={() => { setCooked(false); recipe.reload(); pantry.reload(); }} /> : null}
    </article>
  );
}

function CookedModal({ recipe, onClose, onDone }) {
  const { t, lang, toast } = useApp();
  const [made, setMade] = useState(recipe.servings ?? 2);
  const [eaten, setEaten] = useState(recipe.servings ?? 2);
  const [rating, setRating] = useState(0);
  const [minutes, setMinutes] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const result = await call('record_cooking', { recipe_id: recipe.id, servings_made: Number(made), servings_eaten: Number(eaten), ...(rating ? { rating } : {}), ...(minutes ? { time_taken_min: Number(minutes) } : {}), ...(notes ? { notes } : {}) });
      toast(result.leftovers ? t('cooked.leftovers', { n: result.leftovers.servings, date: fmtDate(result.leftovers.expiresAt, lang) }) : t('cooked.saved'));
      onDone();
    } catch (err) { setError(err); setBusy(false); }
  };
  return (
    <Modal title={t('cooked.title')} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <div className="two">
          <Field label={t('cooked.made')}><input type="number" min="1" value={made} onChange={(e) => setMade(e.target.value)} /></Field>
          <Field label={t('cooked.eaten')}><input type="number" min="0" max={made} step="0.5" value={eaten} onChange={(e) => setEaten(e.target.value)} /></Field>
        </div>
        <Field label={t('cooked.rating')}><Stars value={rating} onChange={setRating} /></Field>
        <Field label={t('cooked.time')}><input type="number" min="0" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></Field>
        <Field label={t('cooked.notes')}><textarea rows="2" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <ErrorNote error={error} t={t} />
        <div className="actions end"><button type="button" className="btn" onClick={onClose}>{t('cancel')}</button><button className="btn btn-primary" disabled={busy}>{t('save')}</button></div>
      </form>
    </Modal>
  );
}

function CookingScreen({ id }) {
  const { t, go } = useApp();
  const recipe = useAsync(() => call('get_recipe', { recipe_id: id }), [id]);
  if (recipe.error) return <ErrorNote error={recipe.error} onRetry={recipe.reload} t={t} />;
  if (!recipe.data) return <Spinner label={t('loading')} />;
  return <CookingMode recipe={recipe.data} onExit={() => go('recipes', id)} />;
}
