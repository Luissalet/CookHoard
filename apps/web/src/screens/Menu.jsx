import React, { useState } from 'react';
import { call } from '../api.js';
import { useApp } from '../App.jsx';
import { useAsync } from '../hooks.js';
import { Badge, Empty, ErrorNote, Field, Icon, Modal, PageHeader, Spinner } from '../components/ui.jsx';
import { fmtDate, fmtMoney, fmtQty } from '../format.js';

const RANK = { to_buy: 3, check_stock: 2, in_stock: 1, assumed_staple: 0 };
/** One row per ingredient: amounts in different units are joined, the most urgent status wins. */
function groupRequired(rows, lang) {
  const map = new Map();
  for (const g of rows) {
    const entry = map.get(g.ingredient_id) ?? { ingredient_id: g.ingredient_id, name: g.name, known: [], buy: [], status: g.shopping_status };
    if (g.known_quantity) entry.known.push(`${fmtQty(g.known_quantity, lang)} ${g.unit ?? ''}`.trim());
    if (g.to_buy_quantity) entry.buy.push(`${fmtQty(g.to_buy_quantity, lang)} ${g.unit ?? ''}`.trim());
    if ((RANK[g.shopping_status] ?? 0) > (RANK[entry.status] ?? 0)) entry.status = g.shopping_status;
    map.set(g.ingredient_id, entry);
  }
  return [...map.values()];
}

export default function Menu() {
  const { t, lang, go, toast, refreshCounts } = useApp();
  const state = useAsync(() => call('kitchen_state', {}), []);
  const cost = useAsync(() => call('menu_cost', {}).catch(() => null), [state.data?.menu?.days?.map((d) => `${d.recipeId}${d.servings ?? ''}`).join(',')]);
  const totals = useAsync(() => (state.data?.menu ? call('menu_ingredients', {}).catch(() => null) : Promise.resolve(null)), [state.data?.menu?.days?.map((d) => `${d.recipeId}${d.servings ?? ''}`).join(',')]);
  const [picking, setPicking] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const menu = state.data?.menu;

  const act = async (fn, ok) => {
    setBusy(true); setError(null);
    try { await fn(); if (ok) toast(ok); await state.reload(); refreshCounts(); } catch (err) { setError(err); }
    setBusy(false);
  };
  const plan = () => act(() => call('plan_week', {}));
  const change = (day) => act(() => call('change_menu_day', { day }));
  const addMissing = () => act(() => call('add_menu_missing', {}), t('menu.added'));

  return (
    <>
      <PageHeader title={t('menu')} sub={state.data ? t('menu.week', { date: fmtDate(state.data.week, lang, { day: 'numeric', month: 'long' }) }) : ''}>
        <button className="btn btn-primary" onClick={plan} disabled={busy}><Icon name="menu" size={16} />{menu ? t('menu.replan') : t('menu.plan')}</button>
        {menu ? <button className="btn" onClick={addMissing} disabled={busy}><Icon name="shopping" size={16} />{t('menu.addMissing')}</button> : null}
      </PageHeader>
      <ErrorNote error={error || state.error} onRetry={state.reload} t={t} />
      {!state.data && state.loading ? <Spinner label={t('loading')} /> : null}
      {state.data && !menu ? <Empty icon="menu">{t('menu.none')}</Empty> : null}
      {menu ? (
        <>
          <div className="week">
            {menu.days.map((d, i) => {
              const dayCost = cost.data?.days?.[i]?.cost;
              return (
                <article key={i} className="day card">
                  <h3>{t(`day.${i + 1}`)}</h3>
                  <button className="link day-title" onClick={() => go('recipes', d.recipeId)}>{d.title}</button>
                  <div className="meta">{d.servings ? <span>{d.servings} p.</span> : null}{dayCost && (dayCost.total > 0 || dayCost.complete) ? <span>{fmtMoney(dayCost.total, lang)}{dayCost.complete ? '' : ' *'}</span> : dayCost ? <span className="muted">{t('menu.noPrices')}</span> : null}</div>
                  <div className="actions">
                    <button className="btn btn-small" onClick={() => change(i + 1)} disabled={busy}>{t('menu.change')}</button>
                    <button className="btn btn-small" onClick={() => setPicking({ day: i + 1, current: d })}>{t('menu.choose')}</button>
                  </div>
                </article>
              );
            })}
          </div>
          {cost.data ? (
            <section className="card">
              <h2><Icon name="prices" /> {t('menu.cost')}</h2>
              <p><b>{fmtMoney(cost.data.total, lang)}</b>{cost.data.complete ? '' : <> · <span className="muted">{t('menu.partial')}</span></>}</p>
              {cost.data.budget ? <p><Badge tone={cost.data.vs_budget?.over ? 'danger' : 'ok'}>{cost.data.vs_budget?.over ? t('menu.over') : t('menu.within')}</Badge> <span className="muted">{t('menu.budget')}: {fmtMoney(cost.data.budget, lang)}</span></p> : null}
            </section>
          ) : null}
          {totals.data ? (
            <section className="card">
              <h2>{t('menu.totals')}</h2>
              <table className="table">
                <thead><tr><th>{t('recipe.ingredients')}</th><th>{t('menu.required')}</th><th>{t('menu.status.to_buy')}</th><th /></tr></thead>
                <tbody>
                  {groupRequired(totals.data.required, lang).map((g) => (
                    <tr key={g.ingredient_id}>
                      <td>{g.name}</td>
                      <td>{g.known.join(' + ') || '—'}</td>
                      <td>{g.buy.join(' + ') || '—'}</td>
                      <td><Badge tone={g.status === 'to_buy' ? 'warn' : g.status === 'check_stock' ? 'info' : 'neutral'}>{t(`menu.status.${g.status}`)}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
        </>
      ) : null}
      {picking ? <PickModal picking={picking} onClose={() => setPicking(null)} onPick={(recipe, servings) => { setPicking(null); act(() => call('set_menu_day', { day: picking.day, recipe_id: recipe.id, ...(servings ? { servings: Number(servings) } : {}) })); }} /> : null}
    </>
  );
}

function PickModal({ picking, onClose, onPick }) {
  const { t } = useApp();
  const [query, setQuery] = useState('');
  const [servings, setServings] = useState(picking.current.servings ?? '');
  const result = useAsync(() => call('find_recipes', { query, limit: 30 }), [query]);
  return (
    <Modal title={`${t(`day.${picking.day}`)} · ${t('menu.choose')}`} onClose={onClose}>
      <div className="form">
        <Field label={t('recipes.search')}><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></Field>
        <Field label={t('menu.servings')}><input type="number" min="1" value={servings} onChange={(e) => setServings(e.target.value)} /></Field>
        <ul className="pick">
          {(result.data?.recipes ?? []).map((r) => <li key={r.id}><button onClick={() => onPick(r, servings)}><b>{r.title}</b><small className="muted">{r.totalMin ? `${r.totalMin} min` : ''}{r.servings ? ` · ${r.servings} p.` : ''}</small></button></li>)}
        </ul>
      </div>
    </Modal>
  );
}
