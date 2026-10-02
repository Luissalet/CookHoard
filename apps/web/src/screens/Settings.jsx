import React, { useEffect, useRef, useState } from 'react';
import { call } from '../api.js';
import { useApp } from '../App.jsx';
import { useAsync } from '../hooks.js';
import { ErrorNote, Field, Icon, Note, PageHeader, Segmented, Spinner } from '../components/ui.jsx';
import { fmtDate } from '../format.js';

const THEME_KEY = 'cookhoard.theme';
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode */ }
}

function StatusRow({ label, ok, children }) {
  return <li><span className={`dot-state ${ok ? 'ok' : 'off'}`} aria-hidden="true" /><b>{label}</b><span className="muted">{children}</span></li>;
}

function StatusPanel({ status, t, lang }) {
  const llm = status.models?.llm; const vision = status.models?.vision;
  const sch = status.scheduler;
  return (
    <ul className="status-list">
      <StatusRow label={t('status.ytdlp')} ok={!!status.media.ytdlp}>{status.media.ytdlp ? status.media.ytdlp.version : t('status.missing')}</StatusRow>
      <StatusRow label={t('status.ffmpeg')} ok={!!status.media.ffmpeg}>{status.media.ffmpeg ? status.media.ffmpeg.version : t('status.missing')}</StatusRow>
      <StatusRow label={t('status.llm')} ok={!!llm?.available}>{llm?.available ? (llm.model || t('status.ok')) : t('status.unavailable')}</StatusRow>
      <StatusRow label={t('status.vision')} ok={!!vision?.available}>{vision?.available ? (vision.model || t('status.ok')) : t('status.unavailable')}</StatusRow>
      <StatusRow label={t('status.hub')} ok={!!status.hub}>{status.hub ? status.hub.url : t('status.unavailable')}</StatusRow>
      <StatusRow label={t('status.scheduler')} ok={!!sch?.enabled}>
        {sch?.enabled ? t('status.daily', { time: sch.daily_at }) : t('status.off')}{sch?.last_run ? ` · ${t('status.lastRun', { date: fmtDate(sch.last_run, lang) })}` : ''}
      </StatusRow>
      <StatusRow label={t('status.version')} ok>{status.version}</StatusRow>
      <StatusRow label={t('status.data')} ok><code>{status.data_dir}</code></StatusRow>
    </ul>
  );
}

function Dictionary({ settings, t, toast, lang }) {
  const [form, setForm] = useState({ name: '', category: '', aliases: '', nevera: '', despensa: '', congelador: '' });
  const [alias, setAlias] = useState({ alias: '', ingredient: '' });
  const [busy, setBusy] = useState(false);
  const num = (v) => (v === '' ? undefined : Number(v));

  async function addIngredient(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const shelf = Object.fromEntries(['nevera', 'despensa', 'congelador'].filter((k) => form[k] !== '').map((k) => [k, num(form[k])]));
      await call('ingredient_add', {
        name: form.name, ...(form.category ? { category: form.category } : {}),
        ...(form.aliases.trim() ? { aliases: form.aliases.split(',').map((x) => x.trim()).filter(Boolean) } : {}),
        ...(Object.keys(shelf).length ? { shelf_days: shelf } : {}),
      });
      toast(t('settings.ingredient.add'));
      setForm({ name: '', category: '', aliases: '', nevera: '', despensa: '', congelador: '' });
    } catch (error) { toast(error.message, 'danger'); } finally { setBusy(false); }
  }
  async function teachAlias(e) {
    e.preventDefault();
    setBusy(true);
    try { await call('ingredient_alias_add', alias); toast(`${alias.alias} → ${alias.ingredient}`); setAlias({ alias: '', ingredient: '' }); }
    catch (error) { toast(error.message, 'danger'); } finally { setBusy(false); }
  }
  return (
    <div className="two-cards">
      <form className="form" onSubmit={addIngredient}>
        <h3>{t('settings.ingredient.add')}</h3>
        <Field label={t('draft.name')}><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={100} /></Field>
        <Field label={t('settings.category')}>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="">—</option>
            {settings.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Alias" hint={t('settings.supermarkets.hint')}><input value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} /></Field>
        <div className="three">
          {['nevera', 'despensa', 'congelador'].map((k) => (
            <Field key={k} label={`${t('settings.shelf')} · ${t(`pantry.${k}`)}`}><input type="number" min="1" max="3650" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></Field>
          ))}
        </div>
        <div className="actions end"><button className="btn btn-primary" disabled={busy || !form.name.trim()}><Icon name="plus" size={16} />{t('add')}</button></div>
      </form>
      <form className="form" onSubmit={teachAlias}>
        <h3>{t('settings.alias')}</h3>
        <Field label={t('settings.alias.from')}><input required value={alias.alias} onChange={(e) => setAlias({ ...alias, alias: e.target.value })} maxLength={100} /></Field>
        <Field label={t('settings.alias.to')}><input required value={alias.ingredient} onChange={(e) => setAlias({ ...alias, ingredient: e.target.value })} maxLength={100} /></Field>
        <div className="actions end"><button className="btn btn-primary" disabled={busy || alias.alias.trim().length < 2 || !alias.ingredient.trim()}><Icon name="check" size={16} />{t('save')}</button></div>
        <p className="muted small">{lang === 'es' ? 'Se aplica a recetas y tickets nuevos.' : 'Applies to new recipes and tickets.'}</p>
      </form>
    </div>
  );
}

export default function Settings() {
  const { t, lang, setLang, toast, refreshCounts } = useApp();
  const loaded = useAsync(() => call('settings_get'), []);
  const status = useAsync(() => call('cookhoard_status'), []);
  const [draft, setDraft] = useState(null);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { if (loaded.data && !draft) {
    const s = loaded.data;
    setDraft({ weeklyBudget: s.weeklyBudget ?? '', defaultServings: s.defaultServings, sections: s.sections, supermarkets: s.supermarkets.join(', '),
      ytdlp: s.media.ytdlp ?? '', cookies_from_browser: s.media.cookies_from_browser ?? 'none', cookies_file: s.media.cookies_file ?? '', keyframes: !!s.media.keyframes, transcript: !!s.media.transcript });
  } }, [loaded.data, draft]);

  const sectionName = (id) => loaded.data?.section_labels.find((s) => s.id === id)?.[lang] ?? id;
  const move = (index, delta) => {
    const next = draft.sections.slice(); const to = index + delta;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    setDraft({ ...draft, sections: next });
  };

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await call('settings_set', { settings: {
        weeklyBudget: draft.weeklyBudget === '' ? null : Number(draft.weeklyBudget), defaultServings: Number(draft.defaultServings), sections: draft.sections,
        supermarkets: draft.supermarkets.split(',').map((x) => x.trim()).filter((x) => x.length >= 2),
        media: { ytdlp: draft.ytdlp.trim(), cookies_from_browser: draft.cookies_from_browser, cookies_file: draft.cookies_file.trim(), keyframes: draft.keyframes, transcript: draft.transcript },
      } });
      toast(t('settings.saved'));
      status.reload(); refreshCounts();
    } catch (error) { toast(error.message, 'danger'); } finally { setSaving(false); }
  }

  async function exportBackup() {
    try {
      const { kitchen } = await call('export_kitchen');
      const blob = new Blob([JSON.stringify(kitchen, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `cookhoard-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (error) { toast(error.message, 'danger'); }
  }
  async function restore(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try { await call('import_kitchen', { snapshot_json: await file.text() }); toast(t('settings.import')); loaded.reload(); status.reload(); refreshCounts(); }
    catch (error) { toast(error.message, 'danger'); }
  }

  const set = (key) => (e) => setDraft({ ...draft, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <>
      <PageHeader title={t('settings')} />
      <ErrorNote error={loaded.error} onRetry={loaded.reload} t={t} />
      {!draft ? <Spinner label={t('loading')} /> : (
        <form onSubmit={save} className="stack">
          <section className="card form">
            <h2>{t('settings.general')}</h2>
            <div className="two">
              <Field label={t('settings.language')}><Segmented label={t('settings.language')} value={lang} onChange={setLang} options={[{ value: 'es', label: 'Español' }, { value: 'en', label: 'English' }]} /></Field>
              <Field label={t('settings.theme')}><Segmented label={t('settings.theme')} value={theme} onChange={(v) => { setTheme(v); applyTheme(v); }} options={[{ value: 'dark', label: t('theme.dark') }, { value: 'light', label: t('theme.light') }]} /></Field>
              <Field label={t('settings.budget')}><input type="number" min="0" step="0.5" value={draft.weeklyBudget} onChange={set('weeklyBudget')} inputMode="decimal" /></Field>
              <Field label={t('settings.servings')}><input type="number" min="1" max="30" value={draft.defaultServings} onChange={set('defaultServings')} inputMode="numeric" /></Field>
            </div>
            <Field label={t('settings.supermarkets')} hint={t('settings.supermarkets.hint')}><input value={draft.supermarkets} onChange={set('supermarkets')} /></Field>
          </section>

          <section className="card">
            <h2>{t('settings.sections')}</h2>
            <p className="muted small">{t('settings.sections.hint')}</p>
            <ol className="order-list">
              {draft.sections.map((id, i) => (
                <li key={id}>
                  <span className="order-n">{i + 1}</span><span className="order-name">{sectionName(id)}</span>
                  <button type="button" className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="↑"><Icon name="up" size={16} /></button>
                  <button type="button" className="icon-btn" onClick={() => move(i, 1)} disabled={i === draft.sections.length - 1} aria-label="↓"><Icon name="down" size={16} /></button>
                </li>
              ))}
            </ol>
          </section>

          <section className="card form">
            <h2>{t('settings.video')}</h2>
            <Field label={t('settings.ytdlp')} hint={t('settings.ytdlp.hint')}><input value={draft.ytdlp} onChange={set('ytdlp')} placeholder="yt-dlp" /></Field>
            <div className="two">
              <Field label={t('settings.cookies')}>
                <select value={draft.cookies_from_browser} onChange={set('cookies_from_browser')}>
                  <option value="none">—</option><option value="edge">Edge</option><option value="chrome">Chrome</option><option value="firefox">Firefox</option>
                </select>
              </Field>
              <Field label={t('settings.cookiesFile')}><input value={draft.cookies_file} onChange={set('cookies_file')} placeholder="C:\…\cookies.txt" /></Field>
            </div>
            <label className="check"><input type="checkbox" checked={draft.keyframes} onChange={set('keyframes')} /><span>{t('settings.keyframes')}</span></label>
            <label className="check"><input type="checkbox" checked={draft.transcript} onChange={set('transcript')} /><span>{t('settings.transcript')}</span></label>
          </section>

          <div className="actions end sticky-save"><button className="btn btn-primary btn-big" disabled={saving}><Icon name="check" size={18} />{t('save')}</button></div>
        </form>
      )}

      <section className="card">
        <h2>{t('settings.status')}</h2>
        {status.loading && !status.data ? <Spinner label={t('loading')} /> : null}
        <ErrorNote error={status.error} onRetry={status.reload} t={t} />
        {status.data ? <StatusPanel status={status.data} t={t} lang={lang} /> : null}
        {status.data && !status.data.media.ytdlp ? <Note tone="warn">{lang === 'es' ? 'Sin yt-dlp no se pueden leer enlaces de vídeo; el texto y los tickets funcionan igual.' : 'Without yt-dlp video links cannot be read; text and tickets still work.'}</Note> : null}
      </section>

      {loaded.data ? (
        <section className="card">
          <h2>{t('settings.ingredients')}</h2>
          <Dictionary settings={loaded.data} t={t} toast={toast} lang={lang} />
        </section>
      ) : null}

      <section className="card">
        <h2>{t('settings.backup')}</h2>
        <div className="actions">
          <button className="btn" onClick={exportBackup}><Icon name="import" size={16} />{t('settings.export')}</button>
          <button className="btn" onClick={() => fileRef.current?.click()}><Icon name="import" size={16} />{t('settings.import')}</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={restore} />
        </div>
        {status.data ? <p className="muted small">{Object.entries(status.data.counts).map(([k, v]) => `${t(`count.${k}`)}: ${v}`).join(' · ')}</p> : null}
      </section>
    </>
  );
}
