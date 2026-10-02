// The family hub as this app sees it: calls to sibling apps, the local model, events. Every method degrades instead of throwing;
// tests replace the whole object with setHub().
import * as family from './hoard-link.js';
import { callTool } from './hoard-commons/fam-services.js';

const real = {
  chat: (options) => family.chat(options),
  linkStatus: (options) => family.linkStatus(options),
  emit: (type, data) => family.emit(type, data),
  status: () => family.status(),
};
let current = real;
export const hub = new Proxy({}, { get: (_, key) => current[key] });
export const setHub = (fake) => { current = fake || real; };

/** A plain Spanish reason for a failed call, from the shared failure kinds (hub_down, app_down, app_missing, tool_missing, timeout, auth, tool_error, client_error). */
export function whyFailed(app, tool, failure = {}) {
  const error = String(failure.error || '');
  switch (failure.kind) {
    case 'hub_down': return `No se alcanza el centro de apps (Hoard Hub); no se puede usar ${app}.`;
    case 'app_down': return `${app} no está en marcha: el centro de apps no lo alcanza.`;
    case 'app_missing': return `${app} no está registrado en el centro de apps.`;
    case 'tool_missing': return `${app} no tiene la herramienta ${tool} (¿versión antigua o app parada?).`;
    case 'auth': return 'El centro de apps ha rechazado el token de CookHoard.';
    case 'timeout': return `${app} ha tardado demasiado en responder.`;
    default: return `${app} no ha podido responder: ${error || `HTTP ${failure.status ?? '?'}`}`;
  }
}

/** One tool of a sibling app through the hub, classified by the shared client: { ok, result } or { ok: false, why, error, kind, status }. */
export async function callApp(app, tool, args = {}, { timeoutMs = 120000 } = {}) {
  const done = await callTool(app, tool, args, { timeoutS: timeoutMs / 1000 });
  if (done.ok) return { ok: true, result: done.data };
  return { ok: false, why: whyFailed(app, tool, done), error: done.error, kind: done.kind, status: done.status ?? null };
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
