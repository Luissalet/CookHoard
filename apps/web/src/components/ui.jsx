import React, { useEffect, useRef } from 'react';

const PATHS = {
  today: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  recipes: 'M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3V4zM5 17a3 3 0 013-3h11',
  import: 'M12 3v12m0 0l-4-4m4 4l4-4M4 17v3h16v-3',
  pantry: 'M4 8l2-4h12l2 4M4 8h16v12H4V8zM9 12h6',
  menu: 'M4 6h16v14H4V6zM4 10h16M8 3v4M16 3v4',
  shopping: 'M3 4h2l2.4 11h10.2L20 7H6.2M9 20a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z',
  prices: 'M3 12l9-9h8v8l-9 9-8-8zM16 8h.01',
  settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M8 15v4',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  plus: 'M12 5v14M5 12h14', check: 'M5 12l5 5 9-10', x: 'M6 6l12 12M18 6L6 18', clock: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
  flame: 'M12 3c1 3 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z', left: 'M15 5l-7 7 7 7', right: 'M9 5l7 7-7 7', search: 'M11 4a7 7 0 100 14 7 7 0 000-14zm9 16l-4-4',
  copy: 'M8 8h11v12H8V8zM5 16V4h11', print: 'M7 9V3h10v6M7 17H5v-6h14v6h-2M7 14h10v7H7v-7z', trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13', edit: 'M4 20h4L19 9l-4-4L4 16v4z', link: 'M10 14a4 4 0 005 0l3-3a4 4 0 00-5-5l-1 1M14 10a4 4 0 00-5 0l-3 3a4 4 0 005 5l1-1',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z', timer: 'M9 3h6M12 8v5l3 2M12 21a8 8 0 100-16 8 8 0 000 16z', up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6',
  warn: 'M12 4l9 16H3L12 4zM12 10v4M12 17h.01', info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8h.01', play: 'M7 5l12 7-12 7V5z', pause: 'M8 5v14M16 5v14', cook: 'M4 12h16v2a6 6 0 01-6 6h-4a6 6 0 01-6-6v-2zM8 8c0-1.5 1-1.5 1-3M12 8c0-1.5 1-1.5 1-3M16 8c0-1.5 1-1.5 1-3',
  video: 'M4 6h11v12H4V6zM15 10l5-3v10l-5-3', receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6', text: 'M5 6h14M5 11h14M5 16h9',
};

export function Icon({ name, size = 20, className = '' }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? PATHS.info} />
    </svg>
  );
}

export function Spinner({ label }) {
  return <div className="spinner-row" role="status"><span className="spinner" />{label ? <span>{label}</span> : null}</div>;
}

export function Badge({ tone = 'neutral', children, title }) {
  return <span className={`badge badge-${tone}`} title={title}>{children}</span>;
}

export function Empty({ children, icon = 'info' }) {
  return <div className="empty"><Icon name={icon} size={22} /><p>{children}</p></div>;
}

export function ErrorNote({ error, onRetry, t }) {
  if (!error) return null;
  const message = error.code === 'offline' || error.message === 'offline' ? t('err.offline') : error.message;
  return (
    <div className="note note-danger" role="alert">
      <Icon name="warn" /><span>{message}</span>
      {onRetry ? <button className="btn btn-small" onClick={onRetry}>{t('retry')}</button> : null}
    </div>
  );
}

export function Note({ tone = 'info', icon, children }) {
  return <div className={`note note-${tone}`}><Icon name={icon ?? (tone === 'danger' || tone === 'warn' ? 'warn' : 'info')} /><div>{children}</div></div>;
}

export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.icon ? <Icon name={o.icon} size={16} /> : null}{o.label}{o.count ? <span className="count">{o.count}</span> : null}</button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector('input,select,textarea,button')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="×"><Icon name="x" /></button></header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, hint, children }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint ? <span className="field-hint">{hint}</span> : null}</label>;
}

export function Stars({ value = 0, onChange }) {
  return (
    <div className="stars" role="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className={n <= value ? 'on' : ''} onClick={() => onChange?.(n === value ? 0 : n)} aria-label={`${n}`} disabled={!onChange}><Icon name="star" size={18} /></button>
      ))}
    </div>
  );
}

export function PageHeader({ title, children, sub }) {
  return <header className="page-header"><div><h1>{title}</h1>{sub ? <p className="sub">{sub}</p> : null}</div><div className="page-actions">{children}</div></header>;
}
