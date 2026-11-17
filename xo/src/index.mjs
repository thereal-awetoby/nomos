import { buildNomosTemplate } from './template.mjs';
import { NOMOS_BYTECODE } from './vault-bytecode.mjs';
export const nomosTemplate = buildNomosTemplate(NOMOS_BYTECODE);
export { buildNomosTemplate };
