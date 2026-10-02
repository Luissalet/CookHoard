// docs/API.md is generated from the tool catalogue (npm run docs:api); a test fails when the file is out of date.
import { toolCatalog } from './tools/index.mjs';
import { version } from './version.mjs';

const typeOf = (schema) => {
  if (!schema) return 'any';
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(' | ');
  if (schema.anyOf) return schema.anyOf.map(typeOf).join(' | ');
  if (schema.type === 'array') return `${typeOf(schema.items)}[]`;
  if (schema.type === 'object') return 'object';
  if (schema.format === 'uri') return 'url';
  return Array.isArray(schema.type) ? schema.type.join(' | ') : (schema.type ?? 'any');
};
const cell = (text) => String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

function section(tool) {
  const [first, ...rest] = tool.description.split('\n');
  const synonyms = rest.find((line) => line.startsWith('Sinónimos:'))?.replace('Sinónimos:', '').trim();
  const detail = rest.filter((line) => !line.startsWith('Sinónimos:')).join(' ');
  const hints = [tool.annotations.readOnlyHint ? 'read-only' : 'writes', tool.annotations.idempotentHint && !tool.annotations.readOnlyHint ? 'idempotent' : null,
    tool.annotations.destructiveHint ? 'destructive' : null, tool.annotations.openWorldHint ? 'uses the network or other apps' : null].filter(Boolean).join(', ');
  const props = tool.inputSchema.properties ?? {};
  const required = new Set(tool.inputSchema.required ?? []);
  const rows = Object.entries(props).map(([name, schema]) => `| \`${name}\` | ${cell(typeOf(schema))} | ${required.has(name) ? 'yes' : 'no'} | ${cell(schema.default !== undefined ? `\`${JSON.stringify(schema.default)}\`` : '')} |`);
  return [`### \`${tool.name}\``, '', `${first}`, '', ...(detail ? [detail, ''] : []), `*${hints}*`, '',
    ...(rows.length ? ['| Argument | Type | Required | Default |', '| --- | --- | --- | --- |', ...rows, ''] : ['No arguments.', '']),
    ...(synonyms ? [`Phrases: ${synonyms}`, ''] : [])].join('\n');
}

export function renderApiDocs() {
  const tools = toolCatalog();
  const reads = tools.filter((t) => t.annotations.readOnlyHint).length;
  return `# CookHoard API

Generated from the tool catalogue by \`npm run docs:api\` (version ${version}). Do not edit by hand: a test fails when this file is out of date.

CookHoard has ${tools.length} tools (${reads} read-only). The same catalogue is served three ways: the MCP bridge (\`apps/mcp\`), the agent routes of the app and the web interface.

## Endpoints

| Method and path | What it does |
| --- | --- |
| \`GET /api/health\` | \`{ service: "cookhoard", version, ytdlp, ffmpeg, scheduler, tools, hoard_link }\` |
| \`GET /api/agent/tools\` | \`{ instructions, tools: [{ name, description, annotations, inputSchema }] }\` |
| \`POST /api/agent/call\` | Body \`{ name, arguments }\`, header \`Authorization: Bearer <token>\` (the token is in \`mcp-token\` inside the data folder). Returns the tool result as JSON; errors are \`{ error }\` with 400, 401, 404 or 500. |
| \`POST /api/tools/:name\` | Same tools for the web interface: body is the arguments, no token (local-only guard). |
| \`GET /media/:file\` | Thumbnails saved from imported videos (data folder, \`media/\`). |
| \`GET /manifest.webmanifest\`, \`GET /sw.js\` | Installable web app. |

Requests must come from \`localhost\`, \`127.0.0.1\` or \`[::1]\`, or from a host listed in \`COOKHOARD_ALLOWED_HOSTS\`.

## Events

| Event | Data |
| --- | --- |
| \`cookhoard.recipe.imported\` | \`{ recipe_id, title, source }\` |
| \`cookhoard.menu.planned\` | \`{ week }\` |
| \`cookhoard.pantry.expiring\` | \`{ count, items: [{ id, name, days_left }] }\` (at most 10 items; sent by the daily routine at 09:00 when something expires within two days) |

## Tools

${tools.map((t) => `- [\`${t.name}\`](#${t.name.replace(/_/g, '_')})`).join('\n')}

${tools.map(section).join('\n')}`;
}
