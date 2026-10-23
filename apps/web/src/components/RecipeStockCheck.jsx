import React, { useState } from 'react';
import { call } from '../api.js';
import { useApp } from '../App.jsx';
import { useAsync } from '../hooks.js';
import { useCopilotRefresh } from '../copilot-hooks.js';
import { Badge, ErrorNote, Spinner } from './ui.jsx';

export default function RecipeStockCheck({ recipeId, servings, base }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  return <section className="recipe-stock">
    <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen(!open)}>{t('stock.check')}</button>
    {open && <StockResult recipeId={recipeId} servings={servings} base={base} />}
  </section>;
}

function StockResult({ recipeId, servings, base }) {
  const { t, lang } = useApp();
  const result = useAsync(() => call('recipe_check', { recipe_id: recipeId,
    ...(base && servings ? { servings } : {}) }), [recipeId, servings, base]);
  useCopilotRefresh(result.reload);
  const data = result.data;
  const number = new Intl.NumberFormat(lang, { maximumSignificantDigits: 12 });
  const quantity = (value, unit) => value == null ? t('stock.unknown') : `${number.format(value)} ${unit || ''}`.trim();
  const list = rows => <ul className="recipe-stock__list">{rows.map((row, index) => <li key={`${row.ingredient_id}-${index}`}>
    <div className="recipe-stock__row"><b>{row.name}</b><Badge tone={row.stock_status === 'covered' ? 'ok' : row.stock_status === 'to_buy' ? 'warn' : 'info'}>{t(`stock.status.${row.stock_status}`)}</Badge></div>
    <dl>{[['needed', row.quantity], ['covered', row.covered_quantity], ['missing', row.to_buy_quantity]].map(([key, value]) => <div key={key}><dt>{t(`stock.${key}`)}</dt><dd>{quantity(value, row.unit)}</dd></div>)}</dl>
  </li>)}</ul>;
  return <div className="recipe-stock__result">
    <p className="small muted">{t('stock.scope')}</p>
    <ErrorNote error={result.error} onRetry={result.reload} t={t} />
    {result.loading ? <Spinner label={t('loading')} /> : !result.error && data && <>
      <p role="status"><Badge tone={data.stock_sufficient === true ? 'ok' : data.stock_sufficient === false ? 'warn' : 'info'}>{t(data.stock_sufficient === true ? 'stock.enough' : data.stock_sufficient === false ? 'stock.short' : 'stock.unconfirmed')}</Badge></p>
      <p className="small muted">{data.servings ? t('stock.forServings', {n:data.servings}) : t('stock.original')}</p>
      {list(data.required)}
      {data.optional.length > 0 && <details><summary>{t('stock.optional', {n:data.optional.length})}</summary>{list(data.optional)}</details>}
      <button type="button" className="btn btn-small" onClick={result.reload}>{t('stock.refresh')}</button>
    </>}
  </div>;
}
