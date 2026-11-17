// Writes xo/nomos.template.json for the XO engine / debug tool.
import { writeFileSync } from 'node:fs';
import { serializeTemplate, parseTemplate } from '@xo-cash/utils';
import { nomosTemplate } from '../src/index.mjs';
parseTemplate(nomosTemplate);
const out = new URL('../nomos.template.json', import.meta.url);
writeFileSync(out, serializeTemplate(nomosTemplate));
console.log('wrote', out.pathname);
