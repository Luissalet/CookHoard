import React from 'react';
import { Badge, Icon } from './ui.jsx';
import { useApp } from '../App.jsx';
import { fmtMoney, fmtMinutes } from '../format.js';

export function expiryText(t, days) {
  if (days === null || days === undefined) return t('expiry.none');
  if (days < 0) return `${t('expiry.expired')} · ${t('expiry.ago', { n: -days })}`;
  if (days === 0) return t('expiry.today');
  if (days === 1) return t('expiry.tomorrow');
  return t('expiry.days', { n: days });
}

export function ExpiryBadge({ days, kind, basis, date }) {
  const { t } = useApp();
  if (days === null || days === undefined) return <Badge tone="neutral">{t('expiry.none')}</Badge>;
  const tone = days < 0 ? 'danger' : days <= 1 ? 'danger' : days <= 3 ? 'warn' : 'ok';
  const estimated = kind === 'estimated';
  const title = estimated ? t('expiry.basis', { basis: basis || '—' }) : t('expiry.exact');
  return <Badge tone={tone} title={`${title}${date ? ` · ${date}` : ''}`}>{estimated ? '≈ ' : ''}{expiryText(t, days)}</Badge>;
}

export function RecipeThumb({ recipe, className = '' }) {
  const src = recipe.image || recipe.source?.thumbnail;
  const url = src ? (src.startsWith('http') || src.startsWith('/') ? src : `/${src}`) : null;
  return url ? <img className={`thumb ${className}`} src={url} alt="" loading="lazy" /> : <div className={`thumb thumb-empty ${className}`}><Icon name="cook" size={28} /></div>;
}

export function CostLine({ cost, t, lang }) {
  if (!cost) return null;
  if (cost.per_serving === null && !cost.total) return <span className="muted">{t('recipe.costNone')}</span>;
  return <span>{fmtMoney(cost.per_serving ?? cost.total, lang)} {cost.per_serving !== null ? t('recipe.perServing') : ''}{cost.complete ? '' : ' *'}</span>;
}

export function Meta({ minutes, servings, children }) {
  return <div className="meta">{minutes ? <span><Icon name="clock" size={14} />{fmtMinutes(minutes)}</span> : null}{servings ? <span>{servings} p.</span> : null}{children}</div>;
}
