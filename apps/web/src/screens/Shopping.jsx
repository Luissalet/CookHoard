import React, { useState } from 'react';
import { call } from '../api.js';
import { useApp } from '../App.jsx';
import { useAsync } from '../hooks.js';
import { Badge, Empty, ErrorNote, Icon, PageHeader, Spinner } from '../components/ui.jsx';
import { fmtMoney, fmtQty } from '../format.js';

/** "leche, 2 L" / "2 kg tomate" / "pan" → { name, qty, unit } */
function parseEntry(text) {
  const clean = text.trim();
  const m = clean.match(/^(.*?)[,;]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|ud|uds|unidades?|raciones?)?$/i) || clean.match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|ud|uds|unidades?|raciones?)?\s+(?:de\s+)?(.+)$/i);
  const norm = (u) => (!u ? undefined : /^l$/i.test(u) ? 'L' : /^(ud|uds|unidad|unidades)$/i.test(u) ? 'ud' : /^raci/i.test(u) ? 'ración' : u.toLowerCase());
  if (!m) return { name: clean };
  if (/^\d/.test(clean)) return { name: m[3].trim(), qty: Number(m[1].replace(',', '.')), unit: norm(m[2]) };
  return { name: m[1].trim(), qty: Number(m[2].replace(',', '.')), unit: norm(m[3]) };
}

export default function Shopping() {
  const { t, lang, toast, refreshCounts } = useApp();
  const list = useAsync(() => call('shopping_list', {}), []);
  const [picked, setPicked] = useState(new Set());
  const [entry, setEntry] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const data = list.data;

  const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast(t('copied')); } catch { toast(text, 'warn'); } };
  const toggle = (id) => setPicked((set) => { const next = new Set(set); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const add = async (e) => {
    e.preventDefault(); if (!entry.trim()) return;
    setError(null);
    try { const p = parseEntry(entry); await call('add_kitchen_item', { name: p.name, checked: false, ...(p.qty ? { qty: p.qty } : {}), ...(p.unit ? { unit: p.unit } : {}) }); setEntry(''); await list.reload(); refreshCounts(); } catch (err) { setError(err); }
  };
  const markBought = async () => {
    setBusy(true); setError(null);
    try {
      const out = await call('shopping_mark_bought', { items: [...picked].map((ingredient) => ({ ingredient })) });
      toast(t('shopping.bought', { n: out.bought.length })); setPicked(new Set()); await list.reload(); refreshCounts();
    } catch (err) { setError(err); }
    setBusy(false);
  };
  const remove = async (id) => { await call('remove_kitchen_item', { ingredient_id: id }); list.reload(); refreshCounts(); };

  return (
    <>
      <PageHeader title={t('shopping')} sub={data ? `${data.count}` : ''}>
        <button className="btn" onClick={() => copy(data.text)} disabled={!data?.count}><Icon name="copy" size={16} />{t('shopping.copyText')}</button>
        <button className="btn" onClick={() => copy(data.markdown)} disabled={!data?.count}><Icon name="copy" size={16} />{t('shopping.copyMd')}</button>
        <button className="btn" onClick={() => window.print()} disabled={!data?.count}><Icon name="print" size={16} />{t('shopping.print')}</button>
      </PageHeader>
      <form className="add-row" onSubmit={add}>
        <input value={entry} onChange={(e) => setEntry(e.target.value)} placeholder={t('shopping.placeholder')} aria-label={t('shopping.add')} />
        <button className="btn btn-primary" disabled={!entry.trim()}><Icon name="plus" size={16} />{t('add')}</button>
      </form>
      <ErrorNote error={error || list.error} onRetry={list.reload} t={t} />
      {!data && list.loading ? <Spinner label={t('loading')} /> : null}
      {data && data.count === 0 ? <Empty icon="shopping">{t('shopping.empty')}</Empty> : null}
      <div className="print-title">{t('shopping.title')}</div>
      {data?.sections.map((section) => (
        <section key={section.id} className="card shop-section">
          <h2>{section.label}</h2>
          <ul className="shop-list">
            {section.items.map((item) => (
              <li key={item.ingredient_id} className={picked.has(item.ingredient_id) ? 'picked' : ''}>
                <label className="check big"><input type="checkbox" checked={picked.has(item.ingredient_id)} onChange={() => toggle(item.ingredient_id)} /><span className="shop-name">{item.name}</span></label>
                <span className="muted small">{item.qty ? `${fmtQty(item.qty, lang)} ${item.unit ?? ''}` : ''}</span>
                {item.estimate ? <span className="small price" title={`${item.estimate.basis}${item.estimate.store ? ` · ${item.estimate.store}` : ''}`}>{item.estimate.approx ? '≈ ' : ''}{fmtMoney(item.estimate.amount, lang)}</span> : <span />}
                <button className="icon-btn no-print" onClick={() => remove(item.ingredient_id)} aria-label={t('shopping.remove')}><Icon name="trash" size={15} /></button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {data?.count ? (
        <p className="shop-total">{t('shopping.estimate')}: <b>{data.estimate.unpriced >= data.count ? '—' : fmtMoney(data.estimate.total, lang)}</b>{data.estimate.unpriced ? <span className="muted"> · {t('shopping.unpriced', { n: data.estimate.unpriced })}</span> : null}</p>
      ) : null}
      {picked.size ? (
        <div className="floating-bar no-print"><span>{t('shopping.selected', { n: picked.size })}</span><button className="btn btn-primary" onClick={markBought} disabled={busy}><Icon name="check" size={16} />{t('shopping.markBought')}</button></div>
      ) : null}
    </>
  );
}
