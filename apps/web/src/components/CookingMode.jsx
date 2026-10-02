import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../App.jsx';
import { Badge, Icon } from './ui.jsx';
import { fmtClock, fmtMinutes, fmtQty } from '../format.js';

/** Short beep with the Web Audio API; silent when audio is not allowed. */
function beep() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    [0, 0.35, 0.7].forEach((delay) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.frequency.value = 880; osc.connect(gain); gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.28);
      osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + 0.3);
    });
    setTimeout(() => ctx.close(), 1500);
    navigator.vibrate?.([200, 100, 200]);
  } catch { /* no audio */ }
}

/** Keep the screen on while cooking. Returns whether the browser could. */
function useWakeLock() {
  const [active, setActive] = useState(false);
  const lock = useRef(null);
  useEffect(() => {
    let cancelled = false;
    const request = async () => {
      try {
        if (!('wakeLock' in navigator)) return;
        lock.current = await navigator.wakeLock.request('screen');
        if (!cancelled) setActive(true);
        lock.current.addEventListener('release', () => setActive(false));
      } catch { setActive(false); }
    };
    request();
    const onVisible = () => { if (document.visibilityState === 'visible') request(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible); lock.current?.release?.().catch(() => {}); };
  }, []);
  return active;
}

export default function CookingMode({ recipe, onExit }) {
  const { t, lang } = useApp();
  const steps = recipe.steps;
  const [index, setIndex] = useState(0);
  const [timers, setTimers] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [showIngredients, setShowIngredients] = useState(false);
  const [custom, setCustom] = useState('');
  const awake = useWakeLock();
  const rang = useRef(new Set());

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id); }, []);
  useEffect(() => {
    for (const timer of timers) {
      if (!timer.paused && timer.end <= now && !rang.current.has(timer.id)) { rang.current.add(timer.id); beep(); }
    }
  }, [now, timers]);

  const addTimer = useCallback((seconds, label) => {
    setTimers((list) => [...list, { id: `${Date.now()}-${Math.random()}`, label, end: Date.now() + seconds * 1000, total: seconds, paused: false, left: seconds }]);
  }, []);
  const toggle = (timer) => setTimers((list) => list.map((x) => {
    if (x.id !== timer.id) return x;
    return x.paused ? { ...x, paused: false, end: Date.now() + x.left * 1000 } : { ...x, paused: true, left: Math.max(0, Math.round((x.end - Date.now()) / 1000)) };
  }));
  const remove = (timer) => setTimers((list) => list.filter((x) => x.id !== timer.id));

  const go = useCallback((delta) => setIndex((i) => Math.min(steps.length - 1, Math.max(0, i + delta))), [steps.length]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go(1); } else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'Escape') onExit(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onExit]);

  const step = steps[index];
  const base = recipe.servings;
  const ingredientLines = useMemo(() => recipe.ingredients.map((i) => `${i.quantity ? fmtQty(i.quantity, lang) : ''} ${i.unit ?? ''} ${i.name}`.trim()), [recipe, lang]);
  const finished = index === steps.length - 1;
  const ringing = timers.filter((x) => !x.paused && x.end <= now);

  return (
    <div className="cooking" role="dialog" aria-label={t('cooking.mode')}>
      <header className="cooking-head">
        <div><small className="muted">{t('cooking.mode')}</small><h1>{recipe.title}</h1></div>
        <div className="cooking-tools">
          <Badge tone={awake ? 'ok' : 'neutral'} title={awake ? t('cooking.awake') : t('cooking.noAwake')}>{awake ? t('cooking.awake') : t('cooking.noAwake')}</Badge>
          <button className="btn" onClick={() => setShowIngredients(!showIngredients)}>{t('cooking.ingredients')}{base ? ` · ${base} p.` : ''}</button>
          <button className="btn" onClick={onExit}><Icon name="x" size={16} />{t('cooking.exit')}</button>
        </div>
      </header>
      <div className="cooking-progress" role="progressbar" aria-valuemin="1" aria-valuemax={steps.length} aria-valuenow={index + 1}><i style={{ width: `${((index + 1) / steps.length) * 100}%` }} /></div>
      {ringing.length ? <div className="ring" role="alert"><Icon name="timer" /> {t('cooking.timerDone')} {ringing.map((x) => x.label).join(', ')}</div> : null}
      <div className={`cooking-body ${showIngredients ? 'with-side' : ''}`}>
        <section className="cooking-step">
          <p className="cooking-count">{t('cooking.step', { n: index + 1, total: steps.length })}</p>
          <p className="cooking-text">{step.text}</p>
          <div className="chips">
            {step.temperatureC ? <Badge tone="warn">{t('recipe.temp', { n: step.temperatureC })}</Badge> : null}
            {step.timerSec ? <button className="btn btn-primary" onClick={() => addTimer(step.timerSec, `${t('cooking.step', { n: index + 1, total: steps.length })}`)}><Icon name="timer" size={18} />{t('cooking.startTimer', { time: step.timerSec >= 60 ? fmtMinutes(Math.round(step.timerSec / 60)) : `${step.timerSec} s` })}</button> : null}
          </div>
        </section>
        {showIngredients ? <aside className="cooking-side card"><h2>{t('cooking.ingredients')}</h2><ul className="plain">{ingredientLines.map((line, i) => <li key={i}>{line}</li>)}</ul></aside> : null}
      </div>
      <section className="cooking-timers" aria-label={t('cooking.timers')}>
        {timers.map((timer) => {
          const left = timer.paused ? timer.left : Math.max(0, Math.round((timer.end - now) / 1000));
          return (
            <div key={timer.id} className={`timer ${left === 0 ? 'done' : ''}`}>
              <div><b>{fmtClock(left)}</b><small>{timer.label}</small></div>
              <i style={{ width: `${(1 - left / timer.total) * 100}%` }} />
              <button className="icon-btn" onClick={() => toggle(timer)} aria-label={timer.paused ? t('cooking.resume') : t('cooking.pause')}><Icon name={timer.paused ? 'play' : 'pause'} size={16} /></button>
              <button className="icon-btn" onClick={() => remove(timer)} aria-label={t('cooking.stop')}><Icon name="x" size={16} /></button>
            </div>
          );
        })}
        <form className="timer-add" onSubmit={(e) => { e.preventDefault(); const m = Number(String(custom).replace(',', '.')); if (m > 0) { addTimer(Math.round(m * 60), `${m} min`); setCustom(''); } }}>
          <input type="number" min="0.5" step="0.5" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={t('cooking.customTimer')} aria-label={t('cooking.customTimer')} />
          <button className="btn" type="submit"><Icon name="plus" size={16} />{t('add')}</button>
        </form>
      </section>
      <footer className="cooking-nav">
        <button className="btn btn-big" onClick={() => go(-1)} disabled={index === 0}><Icon name="left" />{t('cooking.prev')}</button>
        {finished ? <button className="btn btn-primary btn-big" onClick={onExit}><Icon name="check" />{t('cooking.finish')}</button> : <button className="btn btn-primary btn-big" onClick={() => go(1)}>{t('cooking.next')}<Icon name="right" /></button>}
      </footer>
    </div>
  );
}
