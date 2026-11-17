// SolidCash NomosVault — mock-network tests: paid, refused (limit), refused
// (allowlist), refused (stranger), day reset, deposit, rescue.
import { readFileSync } from 'node:fs';
import { SignatureTemplate } from '@solidcash/solidcash';
import { ContractFactory } from '@solidcash/solidcash/contract-factory';
import { MockNetworkProvider } from '@solidcash/solidcash/network/mock';
import { hash160 } from '@bitauth/libauth';

const artifact = JSON.parse(readFileSync(new URL('./build/NomosVault.json', import.meta.url)));
const provider = new MockNetworkProvider();
const [owner, agent, rescuer, stranger] = await provider.getSigners(4, { fundingUtxos: 5 });
const sig = (s) => new SignatureTemplate(s.privateKey);
const pkh = (s) => hash160(s.publicKey);
const Z = new Uint8Array(20);
const LIMIT = 10_000n;
const p2pkhLock = (h) => new Uint8Array([0x76, 0xa9, 0x14, ...h, 0x88, 0xac]);

// SolidCash SDK 0.51: a call that both reads tx.locktime and sends BCH can't
// auto-derive the payment output, so name it with .transfer() (a supported
// override; the covenant still checks it matches what the contract computes).
const pay = (v, toPkh, amount, signer, locktime) =>
  v.call.pay(toPkh, amount, signer.publicKey, sig(signer)).setLocktime(locktime).transfer(p2pkhLock(toPkh), amount).send();

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); };
async function expectRefused(name, p, re) {
  try { await p; ok(name, false, 'was NOT refused'); }
  catch (e) { const m = String(e.message ?? e); ok(name, re.test(m), (m.match(/failing require[^\n]*/)?.[0] ?? m.split('\n')[0]).slice(0, 160)); }
}

async function deploy(allowlist = false, allowed = [Z, Z, Z, Z, Z]) {
  return new ContractFactory(artifact, owner).deploy(
    owner.publicKey, agent.publicKey, LIMIT, allowlist, ...allowed, rescuer.publicKey,
    { initialBalance: 50_000n },
  );
}

// The mock chain starts in 2023; move its clock to real time so timestamp
// locktimes are final (a node rejects locktime >= median time past).
provider.increaseTime(Math.floor(Date.now() / 1000) - provider.getBlockTime());
const now = Math.floor(Date.now() / 1000) - 3 * 3600;
const day = BigInt(Math.floor(now / 86400));

const v = await deploy();
ok('deployed', !!v.categoryId, `category ${String(v.categoryId).slice(0, 16)}…`);

// Owner pays under the limit
const r1 = await pay(v, pkh(stranger), 3_000n, owner, now);
ok('owner pays 3,000 (under limit)', !!r1.txid);
ok('state: spentToday = 3000', (await v.state.spentToday()) === 3_000n);
ok('state: dayMarker = today', (await v.state.dayMarker()) === day);

// Agent pays under the limit, same day
const r2 = await pay(v, pkh(stranger), 6_000n, agent, now);
ok('agent pays 6,000 (total 9,000)', !!r2.txid);

// Over the limit
await expectRefused('2,000 more (11,000 > 10,000) refused', pay(v, pkh(stranger), 2_000n, agent, now), /daily limit/);

// A stranger can't spend
await expectRefused('stranger refused', pay(v, pkh(stranger), 1n, stranger, now), /Not the owner or agent/);

// Next day: limit resets
const tomorrow = now + 86400;
provider.increaseTime(86400);
const r3 = await pay(v, pkh(stranger), 9_000n, owner, tomorrow);
ok('next day: 9,000 allowed again', !!r3.txid);
ok('state reset to 9000 for new day', (await v.state.spentToday()) === 9_000n && (await v.state.dayMarker()) === day + 1n);

// Deposit
const before = await v.call.deposit().withValue(5_000n).send();
ok('deposit 5,000', !!before.txid);

// Rescue needs both keys, bypasses the limit
await expectRefused('rescue with wrong co-signer refused', v.call.rescue(pkh(owner), 20_000n, sig(owner), sig(stranger)).send(), /signature verification/);
const r4 = await v.call.rescue(pkh(owner), 20_000n, sig(owner), sig(rescuer)).send();
ok('rescue 20,000 (over the limit) with both keys', !!r4.txid);

// Allowlist vault
const w = await deploy(true, [pkh(agent), Z, Z, Z, Z]);
ok('allowlisted payee paid', !!(await pay(w, pkh(agent), 1_000n, owner, now)).txid);
await expectRefused('non-allowlisted payee refused', pay(w, pkh(stranger), 1_000n, owner, now), /not allowlisted/);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
