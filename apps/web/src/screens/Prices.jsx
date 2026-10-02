import React, { useState } from 'react';
import { call } from '../api.js';
import { useApp } from '../App.jsx';
import { useAsync } from '../hooks.js';
import { Badge, Empty, ErrorNote, Field, Icon, Modal, Note, PageHeader, Spinner } from '../components/ui.jsx';
import { fmtDate, fmtMoney, fmtPrice } from '../format.js';

function Spark({ history }) {
  const points = history.slice().reverse();
  if (points.length < 2) return null;
  const values = points.map((p) => p.unit_price);
  const lo = Math.min(...values); const hi = Math.max(...values);
  const w = 220; const h = 48;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${(i / (points.length - 1)) * w},${h - 4 - ((p.unit_price - lo) / (hi - lo || 1)) * (h - 8)}`).join(' ');
  return <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="spark" role="img" aria-label="price history"><path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>;
}

export default function Prices() {
  const { t, lang, toast } = useApp();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const book = useAsync(() => call('price_book', { query }), [query]);
  const spending = useAsync(() => call('food_spending', {}), []);
  const tickets = useAsync(() => call('tickets_list', { limit: 20 }), []);
  const rows = book.data?.items ?? [];
  const s = spending.data;

  return (
    <>
      <PageHeader title={t('prices')}>
        <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} />{t('prices.add')}</button>
      </PageHeader>

      <section className="card">
        <h2><Icon name="prices" /> {t('prices.spending')}</h2>
        {!s && spending.loading ? <Spinner label={t('loading')} /> : null}
        <ErrorNote error={spending.error} onRetry={spending.reload} t={t} />
        {s ? (
          <div className="stats">
            <div><small className="muted">{t('prices.week')}</small><b>{fmtMoney(s.week.spent, lang)}</b>{s.week.budget ? <small className="muted">{t('today.of')} {fmtMoney(s.week.budget, lang)}</small> : null}</div>
            <div><small className="muted">{t('prices.month')}</small><b>{fmtMoney(s.tickets.total, lang)}</b><small className="muted">{s.tickets.count} {t('prices.tickets').toLowerCase()}</small></div>
            {s.ledger.available ? <div><small className="muted">{t('today.ledger.food')}</small><b>{fmtMoney(s.ledger.spent, lang)}</b></div> : null}
          </div>
        ) : null}
        {s && s.week.budget ? <div className="bar"><i style={{ width: `${Math.min(100, (s.week.spent / s.week.budget) * 100)}%` }} className={s.week.spent > s.week.budget ? 'over' : ''} /></div> : null}
        {s && !s.ledger.available ? <p className="small muted">{t('prices.ledgerOff')}</p> : null}
        {s?.tickets.by_store.length ? <div className="chips">{s.tickets.by_store.map((b) => <Badge key={b.store} tone="neutral">{b.store}: {fmtMoney(b.total, lang)}</Badge>)}</div> : null}
      </section>

      <section className="card">
        <div className="section-head"><h2>{t('prices.book')}</h2><div className="search"><Icon name="search" size={18} /><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('search')} aria-label={t('search')} /></div></div>
        <ErrorNote error={book.error} onRetry={book.reload} t={t} />
        {book.data && rows.length === 0 ? <Empty icon="prices">{t('prices.empty')}</Empty> : null}
        {rows.length ? (
          <div className="table-wrap">
            <table className="table prices">
              <thead><tr><th>{t('recipe.ingredients')}</th><th>{t('prices.last')}</th><th>{t('prices.median')}</th><th>{t('prices.cheapest')}</th><th>{t('prices.count')}</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ingredientId} onClick={() => setOpen(r)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setOpen(r); }}>
                    <td><b>{r.name}</b></td>
                    <td>{fmtPrice(r.last.unit_price, r.price_unit, lang)}<small className="muted"> {r.last.store} · {fmtDate(r.last.date, lang)}</small></td>
                    <td>{r.median90 !== null ? fmtPrice(r.median90, r.price_unit, lang) : '—'}</td>
                    <td>{r.cheapest ? <>{fmtPrice(r.cheapest.unit_price, r.price_unit, lang)}<small className="muted"> {r.cheapest.store}</small></> : '—'}</td>
                    <td>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2><Icon name="receipt" /> {t('prices.tickets')}</h2>
        {tickets.data && tickets.data.count === 0 ? <p className="muted">{t('prices.noTickets')}</p> : null}
        <ul className="rows">
          {(tickets.data?.tickets ?? []).map((tk) => <li key={tk.id}><span>{tk.store ?? '—'} <small className="muted">{fmtDate(tk.date, lang)} · {tk.source}</small></span><span>{fmtMoney(tk.total, lang)}</span></li>)}
        </ul>
      </section>

      <WatchCard />
      {open ? (
        <Modal title={open.name} onClose={() => setOpen(null)}>
          <Spark history={open.history} />
          <h3>{t('prices.history')}</h3>
          <ul className="rows">{open.history.slice(0, 12).map((h, i) => <li key={i}><span>{fmtDate(h.date, lang)} · {h.store}</span><b>{fmtPrice(h.unit_price, open.price_unit, lang)}</b></li>)}</ul>
          <h3>{t('prices.store')}</h3>
          <ul className="rows">{open.stores.map((st) => <li key={st.store}><span>{st.store}</span><b>{fmtPrice(st.unit_price, open.price_unit, lang)}</b></li>)}</ul>
        </Modal>
      ) : null}
      {adding ? <AddPrice onClose={() => setAdding(false)} onSaved={() => { setAdding(false); book.reload(); toast(t('settings.saved')); }} /> : null}
    </>
  );
}

function AddPrice({ onClose, onSaved }) {
  const { t } = useApp();
  const [f, setF] = useState({ ingredient: '', unit_price: '', price_unit: 'kg', store: '' });
  const [error, setError] = useState(null);
  const submit = async (e) => { e.preventDefault(); setError(null); try { await call('price_add', { ...f, unit_price: Number(String(f.unit_price).replace(',', '.')) }); onSaved(); } catch (err) { setError(err); } };
  return (
    <Modal title={t('prices.add')} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label={t('pantry.name')}><input required value={f.ingredient} onChange={(e) => setF({ ...f, ingredient: e.target.value })} /></Field>
        <div className="two">
          <Field label={t('prices.price')}><input required inputMode="decimal" value={f.unit_price} onChange={(e) => setF({ ...f, unit_price: e.target.value })} /></Field>
          <Field label={t('prices.per')}><select value={f.price_unit} onChange={(e) => setF({ ...f, price_unit: e.target.value })}><option value="kg">€/kg</option><option value="L">€/L</option><option value="ud">€/ud</option></select></Field>
        </div>
        <Field label={t('prices.store')}><input required value={f.store} onChange={(e) => setF({ ...f, store: e.target.value })} /></Field>
        <ErrorNote error={error} t={t} />
        <div className="actions end"><button type="button" className="btn" onClick={onClose}>{t('cancel')}</button><button className="btn btn-primary">{t('save')}</button></div>
      </form>
    </Modal>
  );
}

function WatchCard() {
  const { t } = useApp();
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const submit = async (e) => { e.preventDefault(); setError(null); setResult(null); try { setResult(await call('tantalus_watch_add', { url, ...(label ? { label } : {}) })); } catch (err) { setError(err); } };
  return (
    <form className="card form" onSubmit={submit}>
      <h2>{t('prices.watch')}</h2>
      <p className="muted small">{t('prices.watch.hint')}</p>
      <div className="two"><Field label={t('import.url')}><input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></Field><Field label={t('pantry.name')}><input value={label} onChange={(e) => setLabel(e.target.value)} /></Field></div>
      <ErrorNote error={error} t={t} />
      {result ? <Note tone={result.status === 'ok' ? 'ok' : 'warn'}>{result.status === 'ok' ? t('prices.watch.ok') : result.why}</Note> : null}
      <div className="actions"><button className="btn" disabled={!url}>{t('prices.watch.go')}</button></div>
    </form>
  );
}
