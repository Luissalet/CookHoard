// Which addresses CookHoard may reach on the person's behalf (recipe pages, video pages, thumbnails) and how it reaches them.
//
// By default only the public internet: the shared fetcher (hoard-commons/web.js) refuses loopback, private, link-local and cloud metadata
// addresses and checks every redirect hop. A person who keeps recipes on their own network (a NAS, a wiki on the LAN) opts in with
// COOKHOARD_ALLOW_PRIVATE_URLS=1, which switches to the "operator_local" profile of the commons. The variable is read on every call.
import { envFlag } from './hoard-commons/server.js';
import { PUBLIC, OPERATOR_LOCAL, webGet } from './hoard-commons/web.js';
import { webFetchOrLocal } from './hoard-commons/fam-web.js';

export const USER_AGENT = 'Mozilla/5.0 (compatible; CookHoard)';

export const allowPrivateUrls = (env = process.env) => envFlag('COOKHOARD_ALLOW_PRIVATE_URLS', false, env);

/** The safety profile of the commons for fetches the person asked for. */
export const fetchProfile = (env = process.env) => (allowPrivateUrls(env) ? OPERATOR_LOCAL : PUBLIC);

const snakeKey = (k) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/**
 * One GET as the hub's snake_case answer: { ok, status, final_url, text, body, content_type, truncated, blocked, block_reason, error, error_kind, via }.
 * Public addresses go through the family hub when it is there (one polite fetcher for every app: shared robots.txt, spacing and block cooldowns)
 * and through the shared local fetcher otherwise; an opted-in private network is always fetched locally, because the hub only reaches the public
 * internet. `accept`: "html" (default), "json" or "any" (the bytes come back in `body`).
 */
export async function getPage(url, { accept = 'html', timeoutMs = 12000, maxBytes = 2_000_000 } = {}) {
  const common = { accept, timeoutMs, maxBytes };
  if (allowPrivateUrls()) {
    const fr = await webGet(url, { ...common, profile: OPERATOR_LOCAL, userAgent: USER_AGENT });
    const out = {};
    for (const [k, v] of Object.entries(fr)) out[snakeKey(k)] = v;
    return { ...out, via: 'local' };
  }
  return webFetchOrLocal(url, { ...common, respectRobots: false, localGet: (u, o) => webGet(u, { ...o, profile: PUBLIC, userAgent: USER_AGENT }) });
}

/** A fetch that did not give a page, as a sentence for the person. */
export function pageProblem(res) {
  if (res.blocked) return `La página bloquea las lecturas automáticas (${res.block_reason || 'bloqueo'}).`;
  switch (res.error_kind) {
    case 'policy': return 'Esa dirección apunta a este equipo o a una red privada: CookHoard solo abre páginas públicas (COOKHOARD_ALLOW_PRIVATE_URLS=1 lo permite).';
    case 'robots': return 'La página no permite lecturas automáticas (robots.txt).';
    case 'content': return 'El enlace no devuelve una página o JSON-LD de receta.';
    case 'http': return `La página respondió con ${res.status}.`;
    default: return res.status >= 400 ? `La página respondió con ${res.status}.` : 'No se pudo abrir la página de la receta.';
  }
}
