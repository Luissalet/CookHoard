// The family hub as this app sees it: calls to sibling apps, the local model, events. Every method degrades instead of throwing;
// tests replace the whole object with setHub().
import * as family from './hoard-link.js';

const real = {
  call: (app, tool, args, options) => family.call(app, tool, args, options),
  chat: (options) => family.chat(options),
  linkStatus: (options) => family.linkStatus(options),
  emit: (type, data) => family.emit(type, data),
  status: () => family.status(),
};
let current = real;
export const hub = new Proxy({}, { get: (_, key) => current[key] });
export const setHub = (fake) => { current = fake || real; };

/** Result of family.call → { ok, result?, why? } where why is a plain Spanish reason when it failed. */
export async function callApp(app, tool, args = {}, options = {}) {
  let response;
  try { response = await hub.call(app, tool, args, options); } catch (error) { response = { ok: false, error: String(error?.message || error) }; }
  if (response?.ok) return { ok: true, result: response.result ?? response };
  const status = response?.status;
  const error = String(response?.error || '');
  let why;
  if (status === null || status === undefined || /not reachable|ECONNREFUSED|fetch failed/i.test(error)) why = `No se alcanza el centro de apps (Hoard Hub); no se puede usar ${app}.`;
  else if (status === 404 || /unknown tool|not found|no such/i.test(error)) why = `${app} no tiene la herramienta ${tool} (¿versión antigua o app parada?).`;
  else if (status === 401) why = 'El centro de apps ha rechazado el token de CookHoard.';
  else why = `${app} no ha podido responder: ${error || `HTTP ${status}`}`;
  return { ok: false, why, error, status: status ?? null };
}

/** Local model through the hub. Returns { ok, text, json, model } or { ok: false, error: 'no_model'|..., why }. */
export async function ask({ messages, capability = 'llm', images, json, effort = 'low', maxTokens = 2048, temperature = 0.2, timeoutMs = 240000 }) {
  let result;
  try { result = await hub.chat({ messages, capability, images, json, effort, maxTokens, temperature, timeoutMs }); } catch (error) { result = { ok: false, error: 'hub_down', detail: String(error?.message || error) }; }
  if (result?.ok) return result;
  const error = result?.error || 'hub_down';
  const why = error === 'no_model' ? (capability === 'vision' ? 'No hay modelo de visión disponible.' : 'No hay modelo local cargado.')
    : error === 'hub_down' ? 'No se alcanza el centro de apps; sin modelo local.' : error === 'timeout' ? 'El modelo local ha tardado demasiado.' : `El modelo local no ha respondido (${error}).`;
  return { ok: false, error, why, detail: result?.detail || '' };
}

export async function modelStatus() {
  try {
    const status = await hub.linkStatus({ timeoutMs: 8000 });
    if (status?.ok === false) return { llm: { available: false, reason: status.error || 'hub_down' }, vision: { available: false, reason: status.error || 'hub_down' } };
    return { llm: status?.llm ?? { available: false }, vision: status?.vision ?? { available: false } };
  } catch {
    return { llm: { available: false, reason: 'hub_down' }, vision: { available: false, reason: 'hub_down' } };
  }
}

export const emit = (type, data) => { try { return hub.emit(type, data); } catch { return undefined; } };
