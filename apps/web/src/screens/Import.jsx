import React, { useState } from 'react';
import { call } from '../api.js';
import { useApp } from '../App.jsx';
import { useAsync } from '../hooks.js';
import { Badge, Empty, ErrorNote, Field, Icon, Note, PageHeader, Segmented, Spinner } from '../components/ui.jsx';
import { ExpiryBadge, RecipeThumb } from '../components/shared.jsx';
import { daysUntil, fmtDate, fmtMoney, fmtQty } from '../format.js';

export default function ImportScreen() {
  const { t, go, route } = useApp();
  const tab = ['link', 'text', 'ticket', 'drafts'].includes(route.params[0]) ? route.params[0] : 'link';
  const drafts = useAsync(() => call('recipe_drafts_list', {}), [tab]);
  const queue = useAsync(() => call('ticket_review_list', {}), [tab]);
  return (
    <>
      <PageHeader title={t('import')} />
      <Segmented value={tab} onChange={(v) => go('import', v)} label={t('import')} options={[
        { value: 'link', label: t('import.link'), icon: 'video' }, { value: 'text', label: t('import.text'), icon: 'text' },
        { value: 'ticket', label: t('import.ticket'), icon: 'receipt', count: queue.data?.count || 0 }, { value: 'drafts', label: t('import.drafts'), icon: 'recipes', count: drafts.data?.drafts.length || 0 }]} />
      {tab === 'link' ? <LinkImport /> : null}
      {tab === 'text' ? <TextImport /> : null}
      {tab === 'ticket' ? <TicketImport queue={queue} /> : null}
      {tab === 'drafts' ? <DraftsTab drafts={drafts} /> : null}
    </>
  );
}

// ───────────────────────────── link / video ─────────────────────────────

function LinkImport() {
  const { t, go } = useApp();
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [useModel, setUseModel] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null); setResult(null);
    try {
      const out = caption.trim() ? await call('import_recipe_video', { url: url.trim(), caption, use_model: useModel }) : await call('import_recipe_url', { url: url.trim(), use_model: useModel });
      setResult(out);
    } catch (err) { setError(err); }
    setBusy(false);
  };

  return (
    <div className="stack">
      <form className="card form" onSubmit={submit}>
        <p className="muted">{t('import.link.hint')}</p>
        <Field label={t('import.url')}><input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></Field>
        <details><summary>{t('import.caption')}</summary><Field hint={t('import.caption.hint')}><textarea rows="4" value={caption} onChange={(e) => setCaption(e.target.value)} /></Field></details>
        <label className="check"><input type="checkbox" checked={useModel} onChange={(e) => setUseModel(e.target.checked)} />{t('import.useModel')}</label>
        <div className="actions"><button className="btn btn-primary" disabled={busy || !url.trim()}><Icon name="import" size={18} />{t('import.link.go')}</button></div>
      </form>
      {busy ? <Spinner label={t('import.link.working')} /> : null}
      <ErrorNote error={error} t={t} />
      {result ? <LinkResult result={result} onDone={() => setResult(null)} /> : null}
    </div>
  );
}

function LinkResult({ result, onDone }) {
  const { t, go } = useApp();
  if (result.status === 'draft') {
    return (
      <>
        {result.already_pending ? <Note tone="info">{t('import.pending')}</Note> : null}
        <DraftReview draft={result.draft} onDone={(id) => { go('recipes', id); }} onDiscard={onDone} />
      </>
    );
  }
  if (result.status === 'already_imported' || result.already_imported) {
    const recipe = result.recipe;
    return <Note tone="ok" icon="check">{t('import.already')} <button className="link" onClick={() => go('recipes', recipe.id)}>{t('import.open')}: {recipe.title}</button></Note>;
  }
  if (result.recipe) {
    return <Note tone="ok" icon="check">{t('draft.saved')}: <button className="link" onClick={() => go('recipes', result.recipe.id)}>{result.recipe.title}</button></Note>;
  }
  return (
    <Note tone="warn">
      <b>{t('import.needs')}.</b> {result.why}
      {result.hint || result.status === 'needs_ytdlp' ? <> <button className="link" onClick={() => go('settings')}>{t('import.setup')}</button></> : null}
    </Note>
  );
}

// ───────────────────────────── text ─────────────────────────────

function TextImport() {
  const { t, go } = useApp();
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [useModel, setUseModel] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(null);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null); setDraft(null);
    try { setDraft((await call('import_recipe_text', { text, ...(title ? { title } : {}), use_model: useModel })).draft); } catch (err) { setError(err); }
    setBusy(false);
  };
  return (
    <div className="stack">
      <form className="card form" onSubmit={submit}>
        <p className="muted">{t('import.text.hint')}</p>
        <Field label={t('draft.titleField')}><input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <textarea rows="10" required minLength={10} value={text} onChange={(e) => setText(e.target.value)} aria-label={t('import.text')} />
        <label className="check"><input type="checkbox" checked={useModel} onChange={(e) => setUseModel(e.target.checked)} />{t('import.useModel')}</label>
        <div className="actions"><button className="btn btn-primary" disabled={busy || text.trim().length < 10}><Icon name="text" size={18} />{t('import.text.go')}</button></div>
      </form>
      {busy ? <Spinner label={t('loading')} /> : null}
      <ErrorNote error={error} t={t} />
      {draft ? <DraftReview draft={draft} onDone={(id) => go('recipes', id)} onDiscard={() => setDraft(null)} /> : null}
    </div>
  );
}

// ───────────────────────────── drafts ─────────────────────────────

function DraftsTab({ drafts }) {
  const { t } = useApp();
  const { go } = useApp();
  const [openId, setOpenId] = useState(null);
  const one = useAsync(() => (openId ? call('recipe_draft_get', { draft_id: openId }) : Promise.resolve(null)), [openId]);
  if (openId && one.data) return <><button className="link back" onClick={() => { setOpenId(null); drafts.reload(); }}><Icon name="left" size={16} />{t('import.drafts')}</button><DraftReview draft={one.data.draft} onDone={(id) => go('recipes', id)} onDiscard={() => { setOpenId(null); drafts.reload(); }} /></>;
  const rows = drafts.data?.drafts ?? [];
  return (
    <div className="stack">
      <ErrorNote error={drafts.error} onRetry={drafts.reload} t={t} />
      {drafts.data && rows.length === 0 ? <Empty icon="check">{t('draft.none')}</Empty> : null}
      {rows.map((d) => (
        <article key={d.id} className="card draft-row" onClick={() => setOpenId(d.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(d.id); }}>
          <RecipeThumb recipe={{ source: { thumbnail: d.thumbnail } }} />
          <div>
            <h3>{d.title}</h3>
            <div className="chips"><Badge tone="info">{d.platform || (t(`source.${d.kind}`) === `source.${d.kind}` ? d.kind : t(`source.${d.kind}`))}</Badge><Badge tone={d.confidence.level === 'alta' ? 'ok' : d.confidence.level === 'media' ? 'warn' : 'danger'}>{t('draft.confidence')}: {t(`draft.${{ alta: 'high', media: 'medium', baja: 'low' }[d.confidence.level]}`)}</Badge><Badge tone="neutral">{d.ingredients} {t('draft.ingredientsShort')} · {d.steps} {t('draft.stepsShort')}</Badge></div>
            {d.confidence.missing.length ? <p className="small muted">{t('draft.missing', { list: d.confidence.missing.join(', ') })}</p> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

/** status_notes values that are codes get a sentence; the rest is already text. */
const noteText = (t, value) => (String(value).startsWith('no_model:') ? `${t('note.no_model')}${String(value).slice(9)}` : t(`note.${value}`) === `note.${value}` ? value : t(`note.${value}`));
const CONF = { alta: ['ok', 'high'], media: ['warn', 'medium'], baja: ['danger', 'low'] };

export function DraftReview({ draft, onDone, onDiscard }) {
  const { t, lang, toast } = useApp();
  const [title, setTitle] = useState(draft.title);
  const [servings, setServings] = useState(draft.servings ?? '');
  const [ingredients, setIngredients] = useState(draft.ingredients.map((i) => ({ ...i })));
  const [steps, setSteps] = useState(draft.steps.map((s) => ({ ...s })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [tone, level] = CONF[draft.confidence.level] ?? CONF.baja;
  const evidenceLabel = (source) => (source === 'modelo' ? t('step.model') : t(`step.${source}`) === `step.${source}` ? source : t(`step.${source}`));

  const accept = async () => {
    setBusy(true); setError(null);
    try {
      const edits = {
        title: title.trim() || undefined, servings: servings ? Number(servings) : null,
        ingredients: ingredients.filter((i) => i.name.trim()).map((i) => ({ name: i.name.trim(), quantity: i.quantity ? Number(i.quantity) : null, unit: i.unit || null, optional: !!i.optional, ...(i.note ? { note: String(i.note).slice(0, 200) } : {}) })),
        steps: steps.filter((s) => s.text.trim()).map((s) => ({ text: s.text.trim(), ...(s.timerSec ? { timerSec: s.timerSec } : {}) })),
      };
      const out = await call('recipe_draft_accept', { draft_id: draft.id, edits });
      toast(t('draft.saved'));
      onDone(out.recipe.id);
    } catch (err) { setError(err); setBusy(false); }
  };
  const discard = async () => { await call('recipe_draft_discard', { draft_id: draft.id }); onDiscard(); };

  const setIng = (index, patch) => setIngredients((list) => list.map((x, i) => (i === index ? { ...x, ...patch } : x)));
  return (
    <section className="card draft">
      <header className="draft-head">
        {draft.media?.thumbnail ? <img className="thumb" src={`/${draft.media.thumbnail}`} alt="" /> : null}
        <div>
          <h2>{t('draft.title')}</h2>
          <div className="chips">
            <Badge tone={tone}>{t('draft.confidence')}: {t(`draft.${level}`)} ({Math.round(draft.confidence.score * 100)} %)</Badge>
            {draft.media?.platform ? <Badge tone="info">{draft.media.platform}</Badge> : null}
            {draft.media?.uploader ? <Badge tone="neutral">{draft.media.uploader}</Badge> : null}
          </div>
          {draft.confidence.missing.length ? <p className="small muted">{t('draft.missing', { list: draft.confidence.missing.join(', ') })}</p> : null}
          {draft.confidence.notes.map((n) => <p key={n} className="small muted">{n}</p>)}
        </div>
      </header>

      <details className="what" open>
        <summary>{t('draft.what')}</summary>
        <ul className="plain small">
          {Object.entries(draft.status_notes).filter(([k]) => k !== 'evidence_sources').map(([k, v]) => <li key={k}><b>{t(`step.${k}`) === `step.${k}` ? k : t(`step.${k}`)}</b>: {noteText(t, v)}</li>)}
        </ul>
        {Object.entries(draft.sources).map(([k, v]) => <details key={k} className="source"><summary>{t('draft.sources')}: {evidenceLabel(k)} <span className="muted">({v.length})</span></summary><pre>{v}</pre></details>)}
      </details>

      <div className="two">
        <Field label={t('draft.titleField')}><input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label={t('recipe.servings')}><input type="number" min="1" value={servings} onChange={(e) => setServings(e.target.value)} /></Field>
      </div>

      <h3>{t('draft.ingredients')}</h3>
      <ul className="draft-lines">
        {ingredients.map((i, index) => (
          <li key={index}>
            <div className="draft-edit">
              <input className="qty" inputMode="decimal" value={i.quantity ?? ''} onChange={(e) => setIng(index, { quantity: e.target.value.replace(',', '.') })} placeholder={t('draft.qty')} aria-label={t('draft.qty')} />
              <input className="unit" value={i.unit ?? ''} onChange={(e) => setIng(index, { unit: e.target.value })} placeholder={t('draft.unit')} aria-label={t('draft.unit')} />
              <input className="name" value={i.name} onChange={(e) => setIng(index, { name: e.target.value })} aria-label={t('draft.name')} />
              <button className="icon-btn" onClick={() => setIngredients((l) => l.filter((_, k) => k !== index))} aria-label={t('delete')}><Icon name="trash" size={16} /></button>
            </div>
            <div className="evidence">
              {!i.ingredientId ? <Badge tone="info">{t('draft.new')}</Badge> : null}
              {i.evidence ? <><Badge tone={i.evidence.verified === false ? 'danger' : 'ok'}>{i.evidence.verified === false ? t('draft.unverified') : t('draft.verified')}</Badge> <span className="muted">{evidenceLabel(i.evidence.source)}: “{i.evidence.line}”</span></> : null}
            </div>
          </li>
        ))}
      </ul>
      <button className="btn btn-small" onClick={() => setIngredients((l) => [...l, { name: '', quantity: null, unit: null }])}><Icon name="plus" size={14} />{t('draft.addIngredient')}</button>

      <h3>{t('draft.steps')}</h3>
      <ol className="draft-lines">
        {steps.map((s, index) => (
          <li key={index}>
            <div className="draft-edit">
              <textarea rows="2" value={s.text} onChange={(e) => setSteps((l) => l.map((x, k) => (k === index ? { ...x, text: e.target.value } : x)))} aria-label={`${t('draft.steps')} ${index + 1}`} />
              <button className="icon-btn" onClick={() => setSteps((l) => l.filter((_, k) => k !== index))} aria-label={t('delete')}><Icon name="trash" size={16} /></button>
            </div>
            {s.evidence ? <div className="evidence"><Badge tone={s.evidence.verified === false ? 'danger' : 'ok'}>{s.evidence.verified === false ? t('draft.unverified') : t('draft.verified')}</Badge> <span className="muted">{evidenceLabel(s.evidence.source)}</span></div> : null}
          </li>
        ))}
      </ol>
      <button className="btn btn-small" onClick={() => setSteps((l) => [...l, { text: '' }])}><Icon name="plus" size={14} />{t('draft.addStep')}</button>

      <ErrorNote error={error} t={t} />
      <div className="actions end"><button className="btn" onClick={discard} disabled={busy}><Icon name="trash" size={16} />{t('draft.discard')}</button><button className="btn btn-primary" onClick={accept} disabled={busy}><Icon name="check" size={16} />{t('draft.accept')}</button></div>
    </section>
  );
}

// ───────────────────────────── tickets ─────────────────────────────

function TicketImport({ queue }) {
  const { t, lang, toast, refreshCounts } = useApp();
  const [text, setText] = useState('');
  const [file, setFile] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [mail, setMail] = useState(null);

  const run = async (kind, fn) => {
    setBusy(kind); setError(null); setResult(null); setMail(null);
    try { const out = await fn(); if (kind === 'mail') setMail(out); else setResult(out); queue.reload(); refreshCounts(); } catch (err) { setError(err); }
    setBusy('');
  };

  return (
    <div className="stack">
      <form className="card form" onSubmit={(e) => { e.preventDefault(); run('text', () => call('ticket_import_text', { text })); }}>
        <textarea rows="8" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('ticket.paste')} aria-label={t('ticket.paste')} />
        <div className="actions"><button className="btn btn-primary" disabled={!!busy || text.trim().length < 12}><Icon name="receipt" size={18} />{t('ticket.go')}</button></div>
      </form>
      <div className="two-cards">
        <form className="card form" onSubmit={(e) => { e.preventDefault(); run('file', () => call('ticket_import_file', { path: file.trim() })); }}>
          <Field label={t('ticket.file')} hint={t('ticket.file.hint')}><input value={file} onChange={(e) => setFile(e.target.value)} placeholder="C:\Tickets\mercadona.pdf" /></Field>
          <div className="actions"><button className="btn" disabled={!!busy || !file.trim()}>{t('ticket.file.go')}</button></div>
        </form>
        <div className="card form">
          <h3>{t('ticket.mail')}</h3>
          <div className="actions"><button className="btn" disabled={!!busy} onClick={() => run('mail', () => call('ticket_import_mail', {}))}><Icon name="receipt" size={18} />{t('ticket.mail.go')}</button></div>
        </div>
      </div>
      {busy ? <Spinner label={t('loading')} /> : null}
      <ErrorNote error={error} t={t} />
      {result ? <TicketResult result={result} /> : null}
      {mail ? (mail.status === 'ok' ? <Note tone={mail.imported.length ? 'ok' : 'info'}>{mail.imported.length ? t('ticket.mail.result', { n: mail.imported.length }) : t('ticket.mail.none')}{mail.skipped?.length ? <ul className="plain small">{mail.skipped.map((s) => <li key={s.doc_id}>{s.doc_id}: {s.why}</li>)}</ul> : null}</Note> : <Note tone="warn">{mail.why}</Note>) : null}
      <ReviewQueue queue={queue} />
    </div>
  );
}

function TicketResult({ result }) {
  const { t, lang } = useApp();
  if (result.status && result.status !== 'imported') return <Note tone="warn"><b>{t('import.needs')}.</b> {result.why}</Note>;
  const ticket = result.ticket;
  return (
    <section className="card">
      <h2>{result.duplicate ? t('ticket.duplicate') : t('ticket.result')}</h2>
      <p className="muted">{ticket.store ?? '—'} · {fmtDate(ticket.date, lang)} · {t('ticket.total')}: {fmtMoney(ticket.total, lang)}</p>
      <div className="chips"><Badge tone="ok">{t('ticket.applied', { n: ticket.applied })}</Badge><Badge tone="neutral">{t('ticket.ignored', { n: ticket.ignored })}</Badge>{ticket.queued ? <Badge tone="warn">{t('ticket.queued', { n: ticket.queued })}</Badge> : null}</div>
      {ticket.warnings.map((w) => <p key={w} className="small muted">{w}</p>)}
      {result.added_to_pantry?.length ? (
        <>
          <h3>{t('ticket.added')}</h3>
          <ul className="rows">{result.added_to_pantry.map((a) => <li key={a.ingredient_id}><span>{a.name} <small className="muted">{fmtQty(a.qty, lang)} {a.unit} · {t(`pantry.${a.location}`)}</small></span><ExpiryBadge days={daysUntil(a.expiresAt)} kind={a.expiry_kind} /></li>)}</ul>
        </>
      ) : null}
    </section>
  );
}

function ReviewQueue({ queue }) {
  const { t, toast, refreshCounts } = useApp();
  const rows = queue.data?.lines ?? [];
  const [values, setValues] = useState({});
  const [error, setError] = useState(null);
  const act = async (row, args) => {
    setError(null);
    try { await call('ticket_line_map', { ticket_id: row.ticket_id, line_id: row.id, ...args }); await queue.reload(); refreshCounts(); } catch (err) { setError(err); }
  };
  return (
    <section className="card">
      <h2>{t('ticket.review')}</h2>
      <ErrorNote error={error} t={t} />
      {queue.data && rows.length === 0 ? <Empty icon="check">{t('ticket.review.none')}</Empty> : null}
      <ul className="review">
        {rows.map((row) => {
          const key = `${row.ticket_id}/${row.id}`;
          const value = values[key] ?? '';
          return (
            <li key={key}>
              <div className="review-line"><code>{row.raw}</code><small className="muted">{row.store ?? ''} {row.date ?? ''}</small></div>
              {row.suggestion?.name ? <button className="chip" onClick={() => setValues({ ...values, [key]: row.suggestion.name })} title={t('ticket.suggested')}><Icon name="info" size={14} />{t('ticket.suggested')}: {row.suggestion.name}</button> : null}
              <div className="review-actions">
                <input value={value} onChange={(e) => setValues({ ...values, [key]: e.target.value })} placeholder={t('ticket.is')} aria-label={t('ticket.is')} />
                <button className="btn btn-primary btn-small" disabled={!value.trim()} onClick={() => act(row, { ingredient: value.trim(), learn: true })}>{t('ticket.apply')}</button>
                <button className="btn btn-small" onClick={() => act(row, { ignore: true })}>{t('ticket.notFood')}</button>
                <button className="btn btn-small" onClick={() => act(row, { ignore_always: true })}>{t('ticket.always')}</button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
