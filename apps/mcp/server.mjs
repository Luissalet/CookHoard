// MCP stdio bridge. Every call is proxied to the running CookHoard app (POST /api/agent/call, token from <data>/mcp-token).
// When the app is not running the bridge starts it (COOKHOARD_AUTOSTART=0 turns that off); when it cannot, it runs the same tools in this
// process on the same kitchen file (cross-process lock), so the assistant keeps working.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TOOLS, INSTRUCTIONS, callTool, mcpResult } from '../../server/tools/index.mjs';
import { annotationsOf } from '../../server/tools/common.mjs';
import { dataDir } from '../../server/store.mjs';
import { version } from '../../server/version.mjs';
import * as family from '../../server/hoard-link.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const directory = dataDir();
family.configure({ app: 'cookhoard', dataDir: directory });
const LOCAL = new Set(['127.0.0.1', 'localhost', '[::1]']);
const fixed = process.env.COOKHOARD_URL || '';
const defaultPort = process.env.COOKHOARD_PORT || process.env.PORT || 5210;

function baseUrl() {
  let value = fixed;
  if (!value) { try { value = fs.readFileSync(path.join(directory, 'app-url'), 'utf8').trim(); } catch { value = ''; } }
  const url = new URL(value || `http://127.0.0.1:${defaultPort}`);
  if (!LOCAL.has(url.hostname) || url.protocol !== 'http:') throw new Error('El puente MCP solo se conecta al servidor local.');
  return url;
}
const tokenFile = process.env.COOKHOARD_TOKEN_FILE || path.join(directory, 'mcp-token');
const readToken = () => process.env.COOKHOARD_TOKEN || fs.readFileSync(tokenFile, 'utf8').trim();

let starting = null;
async function healthy(url) {
  try { const r = await fetch(new URL('/api/health', url), { signal: AbortSignal.timeout(1500) }); return r.ok && (await r.json()).service === 'cookhoard'; } catch { return false; }
}
/** Start the app (once) and wait for /api/health. Returns false when it cannot be started. */
async function ensureRunning() {
  if (process.env.COOKHOARD_AUTOSTART === '0') return false;
  starting ??= (async () => {
    try {
      const env = { ...process.env, COOKHOARD_DATA_DIR: directory };
      const child = spawn(process.execPath, [path.join(root, 'server', 'bootstrap.mjs')], { cwd: root, env, detached: true, stdio: 'ignore', windowsHide: true });
      child.on('error', () => {});
      child.unref();
      for (let attempt = 0; attempt < 80; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (await healthy(baseUrl())) return true;
      }
    } catch { /* fall back in-process */ }
    return false;
  })();
  const ok = await starting;
  if (!ok) starting = null;
  return ok;
}

class Unreachable extends Error {}
class OutcomeUnknown extends Error {}

async function proxy(tool, args) {
  let token;
  try { token = readToken(); } catch { throw new Unreachable('sin token'); }
  try {
    const response = await fetch(new URL('/api/agent/call', baseUrl()), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: tool.name, arguments: args }), signal: AbortSignal.timeout(tool.openWorld ? 900000 : 120000) });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Unreachable('token rechazado');
    if (!response.ok) throw Object.assign(new Error(body.error || `Error ${response.status}`), { app: true, code: body.code });
    return body;
  } catch (error) {
    if (error.app || error instanceof Unreachable) throw error;
    if (error?.cause?.code === 'ECONNREFUSED') throw new Unreachable('app parada');
    if (!tool.readOnly) throw new OutcomeUnknown(error.message);
    throw new Unreachable(error.message);
  }
}

async function dispatch(tool, args) {
  if (process.env.COOKHOARD_MODE === 'inprocess') return callTool(tool.name, args);
  try { return await proxy(tool, args); }
  catch (error) {
    if (!(error instanceof Unreachable)) throw error;
    if (await ensureRunning()) {
      try { return await proxy(tool, args); } catch (again) { if (!(again instanceof Unreachable)) throw again; }
    }
    return callTool(tool.name, args);
  }
}

const server = new McpServer({ name: 'cookhoard-local', version }, { instructions: INSTRUCTIONS });
for (const tool of TOOLS) {
  server.registerTool(tool.name, { description: tool.description, inputSchema: tool.schema, annotations: annotationsOf(tool) }, async (args) => {
    try { return mcpResult(await dispatch(tool, args)); }
    catch (error) {
      if (error instanceof OutcomeUnknown) {
        return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'No se recibió la respuesta. El cambio puede haberse aplicado: consulta el estado antes de repetirlo.', status: 'outcome_unknown', outcome_unknown: true, reconcile_action: 'read_current_state_before_retry' }) }] };
      }
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: error.message, ...(error.code ? { code: error.code } : {}) }) }] };
    }
  });
}
await server.connect(new StdioServerTransport());
