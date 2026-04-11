import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDataToolSchema } from '../src/components/Common/buildDataToolSchema.ts';
import { serializeDataToolSchema } from '../src/components/Common/exportDataToolSchema.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const outputDir = path.join(projectRoot, 'src', 'schemas');
const outputPath = path.join(outputDir, 'data_tool_schema.json');

const schema = buildDataToolSchema();
const content = serializeDataToolSchema(schema);

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, content, 'utf-8');
console.log(`[export:data-schema] 已写入 ${outputPath}`);
