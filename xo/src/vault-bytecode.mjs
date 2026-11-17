// Compiled bytecode of contracts/NomosVault.cash (the contract the app and chipnet tests use).
import { compileFile } from 'cashc';
const artifact = compileFile(new URL('../../contracts/NomosVault.cash', import.meta.url));
export const NOMOS_ARTIFACT = artifact;
export const NOMOS_BYTECODE = artifact.debug.bytecode;
