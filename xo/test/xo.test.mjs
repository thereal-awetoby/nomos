// The Nomos XO template checked offline with XO's own tools (@xo-cash/utils):
//   - parseTemplate accepts it (and its JSON form), every reference resolves;
//   - every script compiles to exactly the bytes CashScript builds for the same vault,
//     inside transactions that pass the real covenant (CashScript debug = BCH VM);
//   - an over-limit payment built from the template is refused by the covenant.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  bigIntToVmNumber, binToHex, hexToBin, isHex, hash160, decodeTransaction,
  cashAddressToLockingBytecode, decodeAuthenticationInstructions, lockingBytecodeToCashAddress,
} from '@bitauth/libauth';
import { collectVariablesUsingParseScript, compileCashAssemblyString, parseTemplate, serializeTemplate } from '@xo-cash/utils';
import { Contract, MockNetworkProvider, SignatureTemplate, TransactionBuilder, randomUtxo, randomNFT } from 'cashscript';
import { nomosTemplate as template } from '../src/index.mjs';
import { NOMOS_ARTIFACT } from '../src/vault-bytecode.mjs';

let passed = 0;
const tests = [];
const it = (name, fn) => tests.push([name, fn]);

// ── helpers ──────────────────────────────────────────────
/** Same conversion as convertInvitationVariableValueForCompiler in @xo-cash/engine. */
function asEngineBytes(value) {
  if (typeof value === 'bigint') return bigIntToVmNumber(value);
  if (value instanceof Uint8Array) return value;
  const text = value.startsWith('0x') ? value.slice(2) : value;
  if (isHex(text)) return hexToBin(text);
  throw new Error(`not hex: ${value}`);
}
// The compiler has no signing context, so for byte comparisons we swap the signing
// operations for test variables holding the exact signature/pubkey CashScript used.
const SIGNING_SUBS = [
  ['spenderKey.schnorr_signature.all_outputs', 'testSpenderSig'], ['spenderKey.public_key', 'testSpenderPk'],
  ['ownerKey.schnorr_signature.all_outputs', 'testOwnerSig'], ['rescueKey.schnorr_signature.all_outputs', 'testRescueSig'],
];
const testScripts = Object.fromEntries(Object.entries(template.scripts).map(([k, v]) => [k, SIGNING_SUBS.reduce((s, [a, b]) => s.split(a).join(b), v)]));
const testVariables = { ...template.variables, ...Object.fromEntries(SIGNING_SUBS.map(([, b]) => [b, { name: b, type: 'bytes' }])) };
function compile(text, values) {
  const variables = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, asEngineBytes(v)]));
  return compileCashAssemblyString({ cashAssemblyText: text, variables, templateVariables: testVariables, templateScripts: testScripts, evaluationDecodeMode: 'hex' });
}
const num = (hex) => { let n = 0n; const b = hexToBin(hex); for (let i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(i === b.length - 1 ? b[i] & 0x7f : b[i]); return b.length && b[b.length - 1] & 0x80 ? -n : n; };
const commitment = (spent, day) => { const b = Buffer.alloc(16); b.writeBigInt64LE(BigInt(spent), 0); b.writeBigInt64LE(BigInt(day), 8); return b.toString('hex'); };

// ── a test vault ─────────────────────────────────────────
const owner = new SignatureTemplate('cNV3DwTErnsvD612mrWGhwZZZRJsmkdnYFyWMFs652B57cxux1H2');
const rescuer = new SignatureTemplate(hexToBin('11'.repeat(32)));
const agent = new SignatureTemplate(hexToBin('22'.repeat(32)));
const payeePkh = hash160(agent.getPublicKey());
const payeeLock = binToHex(new Uint8Array([0x76, 0xa9, 0x14, ...payeePkh, 0x88, 0xac]));
const Z = '00'.repeat(20);
const provider = new MockNetworkProvider();

function makeVault({ allowlist = false } = {}) {
  const allowed = [allowlist ? binToHex(payeePkh) : Z, Z, Z, Z, Z];
  const params = [owner.getPublicKey(), agent.getPublicKey(), 10_000n, allowlist, ...allowed, rescuer.getPublicKey()];
  const contract = new Contract(NOMOS_ARTIFACT, params, { provider, addressType: 'p2sh32' });
  const values = {
    ownerPublicKey: binToHex(owner.getPublicKey()), agentPublicKey: binToHex(agent.getPublicKey()),
    dailyLimitSatoshis: 10_000n, allowlistEnabled: allowlist ? 1n : 0n,
    allowedPkh1: allowed[0], allowedPkh2: Z, allowedPkh3: Z, allowedPkh4: Z, allowedPkh5: Z,
    rescuePublicKey: binToHex(rescuer.getPublicKey()),
  };
  return { contract, values };
}

const LOCKTIME = 1_794_900_000; // a unix time (day 20774)
const TODAY = BigInt(Math.floor(LOCKTIME / 86400));

/** A payment built by CashScript exactly as the Nomos app builds it, checked by the covenant. */
function cashscriptPay({ contract, spent, dayMarker, amount, signer = owner, fee = 800n, vaultSats = 50_000n }) {
  const nft = randomUtxo({ satoshis: vaultSats, token: randomNFT({ nft: { capability: 'mutable', commitment: commitment(spent, dayMarker) } }) });
  const effective = BigInt(dayMarker) === TODAY ? BigInt(spent) : 0n;
  const builder = new TransactionBuilder({ provider })
    .addInput(nft, contract.unlock.spend(signer, signer.getPublicKey(), amount))
    .addOutput({ to: contract.tokenAddress, amount: vaultSats - amount - fee, token: { amount: 0n, category: nft.token.category, nft: { capability: 'mutable', commitment: commitment(effective + amount, TODAY) } } })
    .addOutput({ to: cashAddrOf(payeePkh), amount })
    .setLocktime(LOCKTIME);
  return { builder, nft };
}
/** P2PKH cashaddr for a key hash (CashScript outputs take addresses). */
function cashAddrOf(pkh) {
  return lockToAddr(new Uint8Array([0x76, 0xa9, 0x14, ...pkh, 0x88, 0xac]));
}
function lockToAddr(bytecode) { const r = lockingBytecodeToCashAddress({ bytecode, prefix: 'bchtest' }); return typeof r === 'string' ? r : r.address; }

function decodedTx(builder) { const tx = decodeTransaction(hexToBin(builder.build())); assert.notEqual(typeof tx, 'string'); return tx; }
function pushes(unlockingBytecode) { return decodeAuthenticationInstructions(unlockingBytecode).map((i) => binToHex(i.data ?? new Uint8Array())); }

// ── schema & references ──────────────────────────────────
it('passes the XO template schema, also after a JSON round trip', () => {
  parseTemplate(template);
  parseTemplate(serializeTemplate(template));
});

it('nomos.template.json is the current template (npm run export after changes)', () => {
  assert.equal(readFileSync(new URL('../nomos.template.json', import.meta.url), 'utf8'), serializeTemplate(template));
});

it('refers only to scripts, inputs, outputs, locking scripts, transactions and variables it defines', () => {
  const missing = [];
  const need = (kind, id, table) => { if (id !== undefined && !(table && id in table)) missing.push(`${kind} ${id}`); };
  for (const s of template.start) { need('action', s.action, template.actions); need('role', s.role, template.roles); }
  for (const a of Object.values(template.actions)) {
    need('transaction', a.transaction, template.transactions);
    for (const p of a.requirements?.participants ?? []) need('role', p.role, template.roles);
  }
  for (const tx of Object.values(template.transactions)) {
    tx.inputs.forEach((i) => need('input', i.input, template.inputs));
    tx.outputs.forEach((o) => need('output', o.output, template.outputs));
  }
  for (const i of Object.values(template.inputs)) need('script', i.unlockingScript, template.scripts);
  for (const o of Object.values(template.outputs)) need('locking script', o.lockingScript, template.lockingScripts);
  for (const l of Object.values(template.lockingScripts)) {
    need('script', l.lockingBytecode, template.scripts);
    for (const r of Object.values(l.roles ?? {})) for (const a of r.actions ?? []) need('action', a.action, template.actions);
  }
  const expressions = [...Object.values(template.scripts), ...(JSON.stringify(serializeTemplate(template)).match(/\$\(([^()]|\([^()]*\))*\)/g) ?? [])];
  for (const e of expressions) for (const name of collectVariablesUsingParseScript(e, template.scripts)) need('variable', name.split('.')[0], { ...template.variables, ...template.constants });
  assert.deepEqual(missing, []);
});

// ── the vault script ─────────────────────────────────────
for (const allowlist of [false, true]) {
  it(`locks to exactly the contract CashScript builds (allowlist ${allowlist ? 'on' : 'off'})`, () => {
    const { contract, values } = makeVault({ allowlist });
    assert.equal(compile('nomosRedeem', values), contract.bytecode);
    const p2sh32 = `aa20${compile('$(<nomosRedeem> OP_HASH256)', values)}87`;
    assert.equal(p2sh32, binToHex(cashAddressToLockingBytecode(contract.address).bytecode));
  });
}

it('a wrong vault parameter changes the address (the check has teeth)', () => {
  const { contract, values } = makeVault();
  assert.notEqual(compile('nomosRedeem', { ...values, dailyLimitSatoshis: 10_001n }), contract.bytecode);
  assert.notEqual(compile('nomosRedeem', { ...values, ownerPublicKey: values.agentPublicKey, agentPublicKey: values.ownerPublicKey }), contract.bytecode);
});

// ── pay ──────────────────────────────────────────────────
const payCases = [
  { name: 'first payment of the day', spent: 0, dayMarker: 0, amount: 3_000n },
  { name: 'second payment, same day', spent: 3_000, dayMarker: Number(TODAY), amount: 6_000n },
  { name: 'new day resets the count', spent: 9_000, dayMarker: Number(TODAY) - 1, amount: 9_000n },
];
for (const c of payCases) {
  it(`pay: ${c.name} — template bytes equal a payment the covenant accepts`, async () => {
    const { contract, values } = makeVault();
    const { builder, nft } = cashscriptPay({ contract, ...c });
    await builder.debug(); // the BCH VM accepts it
    const tx = decodedTx(builder);
    const v = {
      ...values, vaultCategory: nft.token.category, vaultSatoshis: 50_000n, vaultCommitment: commitment(c.spent, c.dayMarker),
      amountSatoshis: c.amount, payeeLockingScript: payeeLock, locktime: BigInt(LOCKTIME), minerFeeSatoshis: 800n,
    };
    // unlocking script: same pushes, with CashScript's own signature + pubkey
    const csPushes = pushes(tx.inputs[0].unlockingBytecode);
    const tplUnlock = compile('unlockPay', { ...v, testSpenderSig: csPushes[2], testSpenderPk: csPushes[1] });
    assert.equal(tplUnlock, binToHex(tx.inputs[0].unlockingBytecode));
    // outputs and locktime
    assert.equal(compile('$(newCommitment)', v), binToHex(tx.outputs[0].token.nft.commitment));
    assert.equal(num(compile('$(payVaultSatoshis)', v)), tx.outputs[0].valueSatoshis);
    assert.equal(compile('payeeLocking', v), binToHex(tx.outputs[1].lockingBytecode));
    assert.equal(num(compile('$(payLocktime)', v)), BigInt(tx.locktime));
  });
}

it('pay: over the limit — the template computes the state, the covenant refuses the transaction', async () => {
  const { contract, values } = makeVault();
  const c = { spent: 3_000, dayMarker: Number(TODAY), amount: 7_001n };
  const v = { ...values, vaultCommitment: commitment(c.spent, c.dayMarker), amountSatoshis: c.amount, locktime: BigInt(LOCKTIME) };
  assert.equal(num(compile('$(remainingToday)', v)), 7_000n);
  assert.equal(compile('$(newCommitment)', v), commitment(10_001, Number(TODAY)));
  const { builder } = cashscriptPay({ contract, ...c });
  await assert.rejects(async () => builder.debug(), /NomosVault\.cash:45/); // require(effectiveSpent + amount <= dailyLimitSats)
});

it('pay: an agent key works the same way', async () => {
  const { contract, values } = makeVault();
  const { builder } = cashscriptPay({ contract, spent: 0, dayMarker: 0, amount: 1_000n, signer: agent });
  await builder.debug();
  const tx = decodedTx(builder);
  const p = pushes(tx.inputs[0].unlockingBytecode);
  assert.equal(compile('unlockPay', { ...values, amountSatoshis: 1_000n, testSpenderSig: p[2], testSpenderPk: p[1] }), binToHex(tx.inputs[0].unlockingBytecode));
});

it('pay with allowlist: allowlisted payee accepted by the covenant', async () => {
  const { contract } = makeVault({ allowlist: true });
  const { builder } = cashscriptPay({ contract, spent: 0, dayMarker: 0, amount: 1_000n });
  await builder.debug();
});

// ── withdraw & rescue ────────────────────────────────────
it('withdraw (setMandate path): unlocking bytes equal a withdraw the covenant accepts', async () => {
  const { contract, values } = makeVault();
  const nft = randomUtxo({ satoshis: 50_000n, token: randomNFT({ nft: { capability: 'mutable', commitment: commitment(0, 0) } }) });
  const b = new TransactionBuilder({ provider }).addInput(nft, contract.unlock.setMandate(owner))
    .addOutput({ to: tokenAddr(hash160(owner.getPublicKey())), amount: 49_200n, token: { amount: 0n, category: nft.token.category, nft: { capability: 'mutable', commitment: commitment(0, 0) } } });
  await b.debug();
  const tx = decodedTx(b);
  const p = pushes(tx.inputs[0].unlockingBytecode);
  assert.equal(compile('unlockWithdraw', { ...values, testOwnerSig: p[0] }), binToHex(tx.inputs[0].unlockingBytecode));
  assert.equal(num(compile('$(withdrawSatoshis)', { vaultSatoshis: 50_000n, minerFeeSatoshis: 800n })), tx.outputs[0].valueSatoshis);
});

it('rescue: both signatures in the right order; the covenant rejects a wrong co-signer', async () => {
  const { contract, values } = makeVault();
  const nft = randomUtxo({ satoshis: 50_000n, token: randomNFT({ nft: { capability: 'mutable', commitment: commitment(9_999, Number(TODAY)) } }) });
  const out = { to: tokenAddr(hash160(owner.getPublicKey())), amount: 49_200n, token: { amount: 0n, category: nft.token.category, nft: { capability: 'mutable', commitment: commitment(9_999, Number(TODAY)) } } };
  const ok = new TransactionBuilder({ provider }).addInput(nft, contract.unlock.rescue(owner, rescuer)).addOutput(out);
  await ok.debug(); // 49,200 out of a vault whose limit is 10,000: rescue ignores the limit
  const tx = decodedTx(ok);
  const p = pushes(tx.inputs[0].unlockingBytecode);
  assert.equal(compile('unlockRescue', { ...values, testRescueSig: p[0], testOwnerSig: p[1] }), binToHex(tx.inputs[0].unlockingBytecode));
  const bad = new TransactionBuilder({ provider }).addInput(nft, contract.unlock.rescue(owner, agent)).addOutput(out);
  await assert.rejects(async () => bad.debug(), /NomosVault\.cash:93/);
});

function tokenAddr(pkh) {
  const r = lockingBytecodeToCashAddress({ bytecode: new Uint8Array([0x76, 0xa9, 0x14, ...pkh, 0x88, 0xac]), prefix: 'bchtest', tokenSupport: true });
  return typeof r === 'string' ? r : r.address;
}

// ── run ──────────────────────────────────────────────────
for (const [name, fn] of tests) {
  try { await fn(); passed++; console.log(`✓ ${name}`); }
  catch (e) { console.log(`✗ ${name}\n    ${String(e.message ?? e).split('\n').slice(0, 4).join('\n    ')}`); }
}
console.log(`\n${passed}/${tests.length} passed`);
process.exit(passed === tests.length ? 0 : 1);
