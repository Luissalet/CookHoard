import { useCallback, useEffect, useRef, useState } from 'react';

/** Run an async function when deps change. Keeps the last data while reloading so screens do not flash. */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const seq = useRef(0);
  const run = useCallback(async () => {
    const mine = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      if (mine === seq.current) setState({ loading: false, data, error: null });
      return data;
    } catch (error) {
      if (mine === seq.current) setState((s) => ({ loading: false, data: s.data, error }));
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run, setData: (data) => setState((s) => ({ ...s, data })) };
}

export function useLocal(key, initial) {
  const [value, setValue] = useState(() => { try { const raw = localStorage.getItem(key); return raw === null ? initial : JSON.parse(raw); } catch { return initial; } });
  const set = useCallback((next) => { setValue(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* private mode */ } }, [key]);
  return [value, set];
}
