// Every screen talks to the same tools the assistant uses: POST /api/tools/<name>.
export class ApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

export async function call(name, args = {}) {
  let response;
  try {
    response = await fetch(`/api/tools/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  } catch {
    throw new ApiError('offline', 0, 'offline');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error || `Error ${response.status}`, response.status, body.code);
  return body;
}

export async function health() {
  try { const r = await fetch('/api/health'); return r.ok ? await r.json() : null; } catch { return null; }
}
