import { buildDataToolSchema, type DataToolSchema } from './buildDataToolSchema.ts';

export function serializeDataToolSchema(schema: DataToolSchema = buildDataToolSchema()): string {
  return JSON.stringify(schema, null, 2) + '\n';
}

export function downloadDataToolSchema(filename = 'data_tool_schema.json'): void {
  const json = serializeDataToolSchema();
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}