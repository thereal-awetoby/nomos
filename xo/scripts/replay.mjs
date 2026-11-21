#!/usr/bin/env node
/**
 * replay.mjs — check a chipnet run from the files it saved, offline.
 *
 * Every invitation the run executed carries the hash of the transaction the
 * engine built from it (`result.transactions`). For each one, this script
 * rebuilds that transaction from the invitation alone, checks that it hashes
 * to the same transaction ID, and evaluates it in libauth's BCH VM with the
 * vault coin it spends. It also checks that the vault's redeem script is
 * contracts/NomosVault.cash as compiled here, and maps a failure back to the
 * `require` line it comes from through the compiler's debug information.
 *
 * What the run reported (run.json) decides what is expected: a payment or a
 * rescue it broadcast must be valid, and the over-limit payment the node
 * refused must fail. No keys and no network are needed.
 *
 * Usage: node scripts/replay.mjs <run directory> [<run directory> …]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  binToHex,
  createVirtualMachineBch2025,
  encodeTransaction,
  hash256,
  hexToBin,
} from '@bitauth/libauth';
import { NOMOS_ARTIFACT } from '../src/vault-bytecode.mjs';

const CONTRACT_LINES = readFileSync(new URL('../../contracts/NomosVault.cash', import.meta.url), 'utf8').split('\n');
const CONTRACT_BYTECODE = NOMOS_ARTIFACT.debug.bytecode;
const COMPILER = `${NOMOS_ARTIFACT.compiler.name} ${NOMOS_ARTIFACT.compiler.version}`;

// Invitations are written by @xo-cash/utils' serializeInvitation: byte arrays
// as "<uint8array: hex>" and integers as "<bigint: 123n>".
function revive(_key, value) {
  if (typeof value !== 'string') return value;
  const bytes = value.match(/^<uint8array: ([0-9a-f]*)>$/);
  if (bytes) return hexToBin(bytes[1]);
  const integer = value.match(/^<bigint: (-?\d+)n>$/);
  if (integer) return BigInt(integer[1]);
  return value;
}

const vm = createVirtualMachineBch2025();
const txidOf = (transaction) => binToHex(hash256(encodeTransaction(transaction)).slice().reverse());
const p2sh32 = (redeem) => Uint8Array.from([0xaa, 0x20, ...hash256(redeem), 0x87]);
const short = (txid) => `${txid.slice(0, 8)}…`;

// A p2sh unlocking bytecode ends with a push of the redeem script.
function lastPush(bytecode) {
  let i = 0;
  let last = null;
  while (i < bytecode.length) {
    const opcode = bytecode[i];
    let start = i + 1;
    let length = 0;
    if (opcode >= 0x01 && opcode <= 0x4b) length = opcode;
    else if (opcode === 0x4c) { length = bytecode[i + 1]; start = i + 2; }
    else if (opcode === 0x4d) { length = bytecode[i + 1] | (bytecode[i + 2] << 8); start = i + 3; }
    else if (opcode === 0x4e) { length = new DataView(bytecode.buffer, bytecode.byteOffset + i + 1, 4).getUint32(0, true); start = i + 5; }
    if (length > 0) last = bytecode.slice(start, start + length);
    i = start + length;
  }
  return last;
}

// spentToday, the first 8 bytes (little-endian) of the vault's NFT commitment.
const spentToday = (commitment) => new DataView(commitment.buffer, commitment.byteOffset, 8).getBigUint64(0, true);

function rebuild(invitation, expectedTxid) {
  const data = invitation.commits.find((commit) => commit.data?.outputs && commit.data?.variables)?.data;
  const unlockingBytecode = invitation.commits
    .map((commit) => commit.data?.inputs?.[0]?.unlockingBytecode)
    .filter(Boolean)
    .at(-1);
  if (!data || !unlockingBytecode) throw new Error('the invitation has no complete input');
  const variables = Object.fromEntries(data.variables.map((v) => [v.variableIdentifier, v.value]));
  const redeem = lastPush(unlockingBytecode);
  const vault = p2sh32(redeem);
  const lockingFor = {
    vaultAfterPayOutput: () => vault,
    paymentOutput: () => hexToBin(variables.payeeLockingScript),
    returnOutput: () => hexToBin(variables.returnLockingScript),
  };
  const input = data.inputs[0];
  const outputs = data.outputs.map((output) => {
    const locking = lockingFor[output.outputIdentifier];
    if (!locking) throw new Error(`unknown output ${output.outputIdentifier}`);
    return { lockingBytecode: locking(), valueSatoshis: output.valueSatoshis, ...(output.token ? { token: output.token } : {}) };
  });
  const locktime = variables.locktime === undefined ? 0 : Number(variables.locktime);
  // The engine's sequence number is not stored; try the usual ones.
  for (const sequenceNumber of [0, 0xfffffffe, 0xffffffff]) {
    const transaction = {
      version: 2,
      inputs: [{ outpointTransactionHash: input.outpointTransactionHash, outpointIndex: input.outpointIndex, sequenceNumber, unlockingBytecode }],
      outputs,
      locktime,
    };
    if (txidOf(transaction) === expectedTxid) {
      const sourceOutputs = [{ lockingBytecode: vault, valueSatoshis: input.valueSatoshis, token: input.token }];
      return { transaction, sourceOutputs, redeem, variables, input };
    }
  }
  return null;
}

// Where the VM stopped, as a line of NomosVault.cash.
function failingRequire(sourceOutputs, transaction) {
  const states = vm.debug({ inputIndex: 0, sourceOutputs, transaction });
  const failedAt = states.at(-1).ip - 1;
  const statement = NOMOS_ARTIFACT.debug.requires.find((r) => r.ip === failedAt);
  return statement ? `NomosVault.cash:${statement.line}  ${CONTRACT_LINES[statement.line - 1].trim()}` : `instruction ${failedAt} of the redeem script`;
}

let problems = 0;
const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error('usage: node scripts/replay.mjs <run directory> [<run directory> …]');
  process.exit(1);
}

for (const dir of dirs) {
  console.log(`\n${dir}`);
  const run = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'));
  // What the run says happened to each invitation file.
  const expected = new Map();
  for (const step of run.steps) {
    if ((step.step === 'pay' || step.step === 'rescue') && step.txid) {
      const file = step.invitation ?? step.invitations?.at(-1);
      expected.set(file, { onChain: true, txid: step.txid });
    }
    if (step.step === 'pay-over-limit' && step.invitation) expected.set(step.invitation, { onChain: false });
  }

  for (const file of readdirSync(dir).filter((name) => name.endsWith('.json') && name !== 'run.json').sort()) {
    const invitation = JSON.parse(readFileSync(join(dir, file), 'utf8'), revive);
    const built = invitation.result?.transactions && Object.values(invitation.result.transactions)[0];
    if (!built) {
      console.log(`  ${file}: signatures only, no transaction built from it`);
      continue;
    }
    const want = expected.get(file);
    const txid = built.transactionHash;
    const replay = rebuild(invitation, txid);
    if (!replay) {
      problems += 1;
      console.log(`  ${file}: could not rebuild a transaction with ID ${txid}`);
      continue;
    }
    const isContract = binToHex(replay.redeem).endsWith(CONTRACT_BYTECODE);
    if (!isContract) problems += 1;
    const verdict = vm.verify({ sourceOutputs: replay.sourceOutputs, transaction: replay.transaction });
    const valid = verdict === true;
    let detail = '';
    if (invitation.actionIdentifier === 'pay') {
      const before = spentToday(replay.input.token.nft.commitment);
      detail = ` (${before} spent today + ${replay.variables.amountSatoshis} against a ${replay.variables.dailyLimitSatoshis} limit)`;
    }
    const outcome = valid ? 'valid' : `fails at ${failingRequire(replay.sourceOutputs, replay.transaction)}`;
    let check = '';
    if (want?.onChain) {
      const ok = valid && want.txid === txid;
      if (!ok) problems += 1;
      check = ok ? 'the run broadcast it with this ID: ok' : 'the run broadcast it, so it should be valid: MISMATCH';
    } else if (want && !want.onChain) {
      if (valid) problems += 1;
      check = valid ? 'the node refused it, so it should fail: MISMATCH' : 'the node refused it: ok';
    }
    console.log(`  ${file}: ${invitation.actionIdentifier} ${short(txid)} rebuilt with the same ID; VM: ${outcome}${detail}${check ? `; ${check}` : ''}`);
    if (!isContract) console.log(`    the vault's redeem script is not contracts/NomosVault.cash as compiled by ${COMPILER}`);
  }
}

console.log(problems === 0
  ? `\nEvery transaction rebuilt with its reported ID; the vault is contracts/NomosVault.cash (${COMPILER}); every verdict matches the run.`
  : `\n${problems} problem(s).`);
process.exit(problems === 0 ? 0 : 1);
