// Calls to sibling apps: the shared client classifies the failure and hub.mjs turns the kind into a sentence for the person.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callApp, whyFailed } from '../hub.mjs';
import { scratch, fakeHub } from './helpers.mjs';

const setup = (t, options) => { const s = scratch(); const hub = fakeHub(options); t.after(() => s.done()); return hub; };

test('a call that works returns the tool result and sends the arguments through the hub', async (t) => {
  const hub = setup(t, { calls: { 'kafka.pdf_info': (args) => ({ pages: 2, echoed: args.file }) } });
  const done = await callApp('kafka', 'pdf_info', { file: '/tmp/a.pdf' });
  assert.deepEqual(done, { ok: true, result: { pages: 2, echoed: '/tmp/a.pdf' } });
  assert.deepEqual(hub.log.calls, [{ app: 'kafka', tool: 'pdf_info', args: { file: '/tmp/a.pdf' } }]);
});

test('every failure kind of the shared client has its own sentence', async (t) => {
  const hub = setup(t, { calls: { 'kafka.boom': () => ({ __error: 'disco lleno', status: 500 }) } });
  const down = await callApp('kafka', 'x');                      // nobody has the tool: 404 unknown tool
  assert.equal(down.kind, 'tool_missing');
  assert.match(down.why, /kafka no tiene la herramienta x/);
  const refused = await callApp('kafka', 'boom');
  assert.equal(refused.kind, 'tool_error');
  assert.match(refused.why, /kafka no ha podido responder: disco lleno/);
  hub.call = async () => ({ ok: false, status: 401, error: 'no' });
  const auth = await callApp('kafka', 'x');
  assert.equal(auth.kind, 'auth');
  assert.match(auth.why, /rechazado el token/);
  hub.call = async () => ({ ok: false, status: null, error: 'not reachable' });
  const stopped = await callApp('kafka', 'x');
  assert.equal(stopped.kind, 'app_down');
  assert.match(stopped.why, /kafka no está en marcha/);
  hub.call = async () => ({ ok: false, status: 404, error: 'unknown app' });
  assert.equal((await callApp('kafka', 'x')).kind, 'app_missing');
  hub.down = true;
  const gone = await callApp('kafka', 'x');
  assert.equal(gone.kind, 'hub_down');
  assert.match(gone.why, /Hoard Hub/);
});

test('whyFailed covers the kinds that need no hub round trip', () => {
  assert.match(whyFailed('funes', 'transcribe_file', { kind: 'timeout' }), /funes ha tardado demasiado/);
  assert.match(whyFailed('funes', 'transcribe_file', { kind: 'client_error', error: 'path is required' }), /path is required/);
  assert.match(whyFailed('funes', 'transcribe_file', { kind: 'tool_error', status: 503 }), /HTTP 503/);
});
