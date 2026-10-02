import React from 'react';
import { call } from '../api.js';
import { useApp } from '../App.jsx';
import { useAsync } from '../hooks.js';
import { Badge, Empty, ErrorNote, Icon, PageHeader, Spinner } from '../components/ui.jsx';
import { ExpiryBadge, RecipeThumb, CostLine } from '../components/shared.jsx';
import { fmtDate, fmtMoney, fmtMinutes } from '../format.js';

export default function Today() {
  const { t, lang, go } = useApp();
  const overview = useAsync(() => call('today_overview', { dinners: 3 }), []);
  const spending = useAsync(() => call('food_spending', {}), []);
  const v = overview.data;
  const week = spending.data?.week;
  const pending = v ? [
    v.drafts_pending ? { text: t('today.drafts', { n: v.drafts_pending }), to: ['import', 'drafts'] } : null,
    v.review_queue ? { text: t('today.review', { n: v.review_queue }), to: ['import', 'ticket'] } : null,
    v.shopping_to_buy ? { text: t('today.shopping', { n: v.shopping_to_buy }), to: ['shopping'] } : null,
  ].filter(Boolean) : [];

  return (
    <>
      <PageHeader title={t('today')} sub={v ? fmtDate(v.date, lang, { weekday: 'long', day: 'numeric', month: 'long' }) : ''} />
      <ErrorNote error={overview.error} onRetry={overview.reload} t={t} />
      {!v && overview.loading ? <Spinner label={t('loading')} /> : null}
      {v ? (
        <div className="grid-today">
          <section className="card span-2">
            <h2><Icon name="flame" /> {t('today.dinner')}</h2>
            {v.dinner.leftovers.length ? (
              <div className="leftovers">
                {v.dinner.leftovers.map((l) => (
                  <button key={l.recipe_id} className="chip-row" onClick={() => go('recipes', l.recipe_id)}>
                    <Badge tone="info">{t('today.leftovers')}</Badge> <b>{l.title.replace(/^Sobras: /, '')}</b> <span className="muted">{l.reasons[0]}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {v.dinner.options.length === 0 ? <Empty>{t('today.dinner.empty')}</Empty> : (
              <div className="dinner-list">
                {v.dinner.options.map((o) => (
                  <article key={o.recipe_id} className="dinner" onClick={() => go('recipes', o.recipe_id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') go('recipes', o.recipe_id); }}>
                    <RecipeThumb recipe={{ image: o.image }} />
                    <div className="dinner-body">
                      <h3>{o.title}</h3>
                      <div className="meta">{o.minutes ? <span><Icon name="clock" size={14} />{fmtMinutes(o.minutes)}</span> : null}{o.cost ? <CostLine cost={o.cost} t={t} lang={lang} /> : null}</div>
                      <div className="chips">
                        {o.missing.length === 0 ? <Badge tone="ok">{t('today.have')}</Badge> : o.missing.slice(0, 4).map((m) => <Badge key={m} tone="warn">{t('today.missing')}: {m}</Badge>)}
                        {o.uses_expiring.map((m) => <Badge key={m} tone="danger">{t('today.uses')}: {m}</Badge>)}
                      </div>
                      <p className="reasons">{o.reasons.filter((r) => !/^Te falta|^Tienes todos/.test(r)).slice(0, 2).join(' ')}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <h2><Icon name="clock" /> {t('today.expiring')}</h2>
            {v.expiring.length === 0 ? <Empty icon="check">{t('today.expiring.empty')}</Empty> : (
              <ul className="rows">
                {v.expiring.slice(0, 8).map((e) => (
                  <li key={e.id}><span>{e.name}{e.leftover && !/^Sobras/i.test(e.name) ? <small className="muted"> · {t('pantry.leftover')}</small> : null}</span><ExpiryBadge days={e.days_left} kind={e.expiry_kind} /></li>
                ))}
              </ul>
            )}
            {v.expiring.length ? <p className="small muted">{t('pantry.estimated.note')}</p> : null}
          </section>

          <section className="card">
            <h2><Icon name="menu" /> {t('today.menu')}</h2>
            {v.menu_today ? (
              <button className="chip-row" onClick={() => go('recipes', v.menu_today.recipe_id)}><b>{v.menu_today.title}</b>{v.menu_today.servings ? <span className="muted"> · {v.menu_today.servings} p.</span> : null}</button>
            ) : (
              <>
                <p className="muted">{t('today.menu.none')}</p>
                <button className="btn" onClick={() => go('menu')}>{t('today.plan')}</button>
              </>
            )}
          </section>

          <section className="card">
            <h2><Icon name="prices" /> {t('today.budget')}</h2>
            {week && week.budget ? (
              <>
                <div className="bar" role="progressbar" aria-valuenow={Math.round(week.spent)} aria-valuemax={week.budget}><i style={{ width: `${Math.min(100, (week.spent / week.budget) * 100)}%` }} className={week.spent > week.budget ? 'over' : ''} /></div>
                <p><b>{fmtMoney(week.spent, lang)}</b> {t('today.of')} {fmtMoney(week.budget, lang)} <span className="muted">{t('today.spent')}</span></p>
              </>
            ) : <p className="muted">{week ? t('today.budget.none') : t('loading')}</p>}
            {spending.data?.ledger?.available ? <p className="small muted">{t('today.ledger.food')}: {fmtMoney(spending.data.ledger.spent, lang)}</p> : null}
          </section>

          <section className="card">
            <h2><Icon name="info" /> {t('today.pending')}</h2>
            {pending.length === 0 ? <Empty icon="check">{t('today.allclear')}</Empty> : (
              <ul className="rows">{pending.map((p) => <li key={p.text}><button className="link" onClick={() => go(...p.to)}>{p.text}</button><Icon name="right" size={16} /></li>)}</ul>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
