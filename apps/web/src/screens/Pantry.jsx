import React, { useState } from 'react';
import { call } from '../api.js';
import { useApp } from '../App.jsx';
import { useAsync } from '../hooks.js';
import { Badge, Empty, ErrorNote, Field, Icon, Modal, Note, PageHeader, Segmented, Spinner } from '../components/ui.jsx';
import { ExpiryBadge } from '../components/shared.jsx';
import { fmtDate, fmtQty } from '../format.js';

const PLACES = ['nevera', 'despensa', 'congelador'];
const UNITS = ['', 'ud', 'kg', 'g', 'L', 'ml', 'ración'];

export default function Pantry() {
  const { t, lang, toast, refreshCounts } = useApp();
  const [place, setPlace] = useState('all');
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const list = useAsync(() => call('pantry_list', {}), []);
  const items = (list.data?.items ?? []).filter((i) => place === 'all' || i.location === place);
  const counts = list.data?.counts ?? {};

  const usedUp = async (item) => { await call('set_kitchen_item', { ingredient_id: item.id, checked: false }); toast(`${item.name}: ${t('pantry.usedUp').toLowerCase()}`); list.reload(); refreshCounts(); };
  const grouped = place === 'all' ? PLACES.map((p) => ({ place: p, items: items.filter((i) => i.location === p) })).filter((g) => g.items.length) : [{ place, items }];

  return (
    <>
      <PageHeader title={t('pantry')} sub={list.data ? t('pantry.items', { n: list.data.total }) : ''}>
        <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} />{t('pantry.add')}</button>
      </PageHeader>
      <Segmented value={place} onChange={setPlace} label={t('pantry')} options={[{ value: 'all', label: t('pantry.all'), count: list.data?.total }, ...PLACES.map((p) => ({ value: p, label: t(`pantry.${p}`), count: counts[p] }))]} />
      <ErrorNote error={list.error} onRetry={list.reload} t={t} />
      {!list.data && list.loading ? <Spinner label={t('loading')} /> : null}
      {list.data && items.length === 0 ? <Empty>{t('pantry.empty')}</Empty> : null}
      {grouped.map((g) => (
        <section key={g.place} className="card pantry-group">
          {place === 'all' ? <h2>{t(`pantry.${g.place}`)} <small className="muted">{g.items.length}</small></h2> : null}
          <ul className="pantry-list">
            {g.items.map((item) => (
              <li key={item.id}>
                <div className="pantry-main">
                  <b>{item.name}</b>
                  <span className="muted small">{item.qty ? `${fmtQty(item.qty, lang)} ${item.unit ?? ''}` : ''}{item.leftover ? ` · ${t('pantry.leftover')}` : ''}{item.opened_at ? ` · ${t('pantry.opened')} ${fmtDate(item.opened_at, lang)}` : ''}</span>
                </div>
                <ExpiryBadge days={item.days_left} kind={item.expiry_kind} basis={item.expiry_basis} date={item.expiresAt} />
                <div className="pantry-actions">
                  <button className="icon-btn" onClick={() => setEditing(item)} aria-label={t('edit')}><Icon name="edit" size={16} /></button>
                  <button className="icon-btn" onClick={() => usedUp(item)} aria-label={t('pantry.usedUp')} title={t('pantry.usedUp')}><Icon name="check" size={16} /></button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {list.data && list.data.items.some((i) => i.expiry_kind === 'estimated') ? <Note tone="info">{t('pantry.estimated.note')}</Note> : null}
      {editing ? <ItemModal item={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }} /> : null}
      {adding ? <ItemModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); list.reload(); refreshCounts(); }} /> : null}
    </>
  );
}

function ItemModal({ item, onClose, onSaved }) {
  const { t, toast } = useApp();
  const [name, setName] = useState(item?.name ?? '');
  const [place, setPlace] = useState(item?.location ?? 'nevera');
  const [qty, setQty] = useState(item?.qty ?? '');
  const [unit, setUnit] = useState(item?.unit ?? '');
  const [date, setDate] = useState(item?.expiry_kind === 'exact' ? item.expiresAt ?? '' : '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async (extra = {}) => {
    setBusy(true); setError(null);
    try {
      const args = { ingredient: item?.id ?? name.trim(), place, ...(qty !== '' ? { qty: Number(qty) } : {}), ...(unit ? { unit } : {}), ...(date ? { expires_at: date } : {}), ...extra };
      if (item && place === item.location) delete args.place;
      const out = await call('pantry_set', args);
      toast(`${out.item.name}: ${out.item.expiresAt ? fmtDate(out.item.expiresAt) : t('expiry.none')}`);
      onSaved();
    } catch (err) { setError(err); setBusy(false); }
  };
  return (
    <Modal title={item ? item.name : t('pantry.add')} onClose={onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {!item ? <Field label={t('pantry.name')}><input value={name} onChange={(e) => setName(e.target.value)} required /></Field> : null}
        <Field label={t('pantry.place')}><select value={place} onChange={(e) => setPlace(e.target.value)}>{PLACES.map((p) => <option key={p} value={p}>{t(`pantry.${p}`)}</option>)}</select></Field>
        <div className="two">
          <Field label={t('pantry.qty')}><input type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
          <Field label={t('pantry.unit')}><select value={unit} onChange={(e) => setUnit(e.target.value)}>{UNITS.map((u) => <option key={u} value={u}>{u ? t(`unit.${u}`) : '—'}</option>)}</select></Field>
        </div>
        <Field label={t('pantry.date')} hint={item?.expiry_kind === 'estimated' ? t('expiry.basis', { basis: item.expiry_basis ?? '—' }) : undefined}><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <ErrorNote error={error} t={t} />
        <div className="actions">
          {item ? <button type="button" className="btn btn-small" disabled={busy} onClick={() => save({ opened: true })}>{t('pantry.openedToday')}</button> : null}
          {item ? <button type="button" className="btn btn-small" disabled={busy} onClick={() => { setDate(''); save({ estimate_expiry: true, expires_at: undefined }); }}>{t('pantry.estimate')}</button> : null}
          {item ? <button type="button" className="btn btn-small" disabled={busy} onClick={() => save({ clear_expiry: true, expires_at: undefined })}>{t('pantry.clear')}</button> : null}
        </div>
        <div className="actions end"><button type="button" className="btn" onClick={onClose}>{t('cancel')}</button><button className="btn btn-primary" disabled={busy}>{t('save')}</button></div>
      </form>
    </Modal>
  );
}
