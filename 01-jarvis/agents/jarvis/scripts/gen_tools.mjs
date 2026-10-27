import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { REPO, json, writeJson, isMain, main } from './project.mjs';

// Read the authoritative TS literal without executing repo code or copying metadata.
export function readMetadata(source) {
  const file = ts.createSourceFile('tools.ts', source, ts.ScriptTarget.Latest, true);
  function literal(node) {
    if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return literal(node.expression);
    if (ts.isStringLiteral(node)) return node.text;
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(p => {
      if (!ts.isPropertyAssignment(p) || !('text' in p.name)) throw Error('TOOL_META must use literal properties');
      return [p.name.text, literal(p.initializer)];
    }));
    throw Error('TOOL_META must remain a literal; update the generator for a new source format');
  }
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const declaration = statement.declarationList.declarations.find(d => d.name.getText(file) === 'TOOL_META');
    if (declaration) return literal(declaration.initializer);
  }
  throw Error('TOOL_META metadata not found');
}

export function readContracts() {
  return {
    schemas: JSON.parse(readFileSync(resolve(REPO, 'packages/contracts/schema/tool-inputs.schema.json'), 'utf8')),
    metadata: readMetadata(readFileSync(resolve(REPO, 'packages/contracts/src/tools.ts'), 'utf8')),
  };
}

export function resolveSchema(schema, root = schema, seen = new Set()) {
  if (Array.isArray(schema)) return schema.map(s => resolveSchema(s, root, seen));
  if (!schema || typeof schema !== 'object') return schema;
  if (schema.$ref) {
    const ref = schema.$ref;
    const target = ref.startsWith('#/$defs/') && root.$defs?.[ref.slice(8)];
    if (!target || seen.has(ref)) throw Error(`Unresolved or recursive schema reference: ${ref}`);
    const { $ref, ...rest } = schema;
    return resolveSchema({ ...target, ...rest }, root, new Set([...seen, ref]));
  }
  return Object.fromEntries(Object.entries(schema)
    .filter(([key]) => !['$schema', '$defs'].includes(key))
    .map(([key, value]) => [key, resolveSchema(value, root, seen)]));
}

const SILENT_TOOLS = new Set(['focus_entity', 'render_widget', 'resolve_approval']);

export function generateTools(schemas, metadata) {
  if (JSON.stringify(Object.keys(schemas).sort()) !== JSON.stringify(Object.keys(metadata).sort())) {
    throw Error('Contract schemas and TOOL_META metadata differ; run make gen in the repo root first');
  }
  return Object.entries(schemas).map(([name, schema]) => {
    const meta = metadata[name];
    const notes = meta.latency === 'async'
      ? ' Gibt sofort eine taskId zurück: nur angenommen, nicht erledigt. Ergebnis folgt als contextual update. Vorher kurz bestätigen.'
      : '';
    return {
      type: 'client', name, description: meta.description + notes,
      expects_response: true, response_timeout_secs: 10,
      execution_mode: 'immediate', interruption_mode: 'allow',
      // Data lookups speak a short bridge first, so audio starts before the tool round trip.
      // Pure HUD effects (focus, widget, approval) stay silent to avoid filler mid-answer.
      pre_tool_speech: SILENT_TOOLS.has(name) ? 'auto' : 'force',
      parameters: resolveSchema(schema),
    };
  });
}

export function generate() {
  const { schemas, metadata } = readContracts();
  const tools = generateTools(schemas, metadata);
  let previous = { tools: [] };
  try { previous = json('tools.json'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const registry = tools.map(tool => {
    const config = `tool_configs/${tool.name}.json`;
    writeJson(config, tool);
    const existing = previous.tools.find(t => t.config === config);
    return { type: 'client', config, ...(existing?.id ? { id: existing.id } : {}) };
  });
  writeJson('tools.json', { tools: registry });
  return tools;
}
if (isMain(import.meta.url)) main(() => console.log(`${generate().length} Client-Tools erzeugt.`));
