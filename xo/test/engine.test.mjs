// The Nomos template through XO's own engine, offline.
//
// Two @xo-cash/engine instances (owner and rescuer), each with its own State,
// built with the Engine constructor so no Electrum connection is needed. They
// run the invitations scripts/chipnet.mjs runs on chipnet: pay, pay again the
// same day, an over-limit pay, and a rescue signed by both engines. Every
// transaction the engine builds is checked in libauth's BCH 2025 VM against the
// coin it spends, and the vault coin moves between steps the way the chain
// would move it.
//
// test/xo.test.mjs compares template scripts with CashScript byte for byte;
// this file checks the engine itself compiles, signs and assembles them into
// transactions the covenant accepts.

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { generateMnemonic } from 'bip39';
import {
  binToHex, hexToBin, binToNumberUint32LE, cashAddressToLockingBytecode, decodeTransaction, decodeAuthenticationInstructions,
  deriveHdPath, deriveHdPathRelative, deriveHdPrivateNodeFromSeed, privateKeyToP2pkhLockingBytecode, secp256k1, createVirtualMachineBch2025,
} from '@bitauth/libauth';
import { convertMnemonicToSeedBytes, computeAccountHash } from '@xo-cash/crypto';
import { parseTemplate, generateTemplateIdentifier, serializeInvitation, deserializeInvitation } from '@xo-cash/utils';
import { createStorageAdapter, State } from '@xo-cash/state';
import { Engine } from '@xo-cash/engine';
import { compileFile } from 'cashc';
import { Contract, MockNetworkProvider } from 'cashscript';

const templateJson = JSON.parse(readFileSync(new URL('../nomos.template.json', import.meta.url), 'utf8'));
const templateIdentifier = generateTemplateIdentifier(parseTemplate(templateJson));
const DAILY_LIMIT = 10_000;
const FEE = 1_000;

// Keys the engine derives for a secret pinned to derivation index 0 (testnet).
const keyOf = (mnemonic) => {
  const templateIndex = binToNumberUint32LE(hexToBin(templateIdentifier).slice(0, 4)) & 0x7fffffff;
  const purpose = deriveHdPath(deriveHdPrivateNodeFromSeed(convertMnemonicToSeedBytes(mnemonic)), "m/42415'");
  return deriveHdPathRelative(purpose, `${templateIndex}'/0'/0`).privateKey;
};
const ownerMnemonic = generateMnemonic(256);
const rescuerMnemonic = generateMnemonic(256);
const ownerPub = secp256k1.derivePublicKeyCompressed(keyOf(ownerMnemonic));
const rescuerPub = secp256k1.derivePublicKeyCompressed(keyOf(rescuerMnemonic));
const ownerLockingBytecode = binToHex(privateKeyToP2pkhLockingBytecode({ privateKey: keyOf(ownerMnemonic) }));

const zero = new Uint8Array(20);
const contract = new Contract(
  compileFile(new URL('../../contracts/NomosVault.cash', import.meta.url)),
  [ownerPub, ownerPub, BigInt(DAILY_LIMIT), false, zero, zero, zero, zero, zero, rescuerPub],
  { provider: new MockNetworkProvider({ network: 'chipnet' }) },
);
// Electrum tracks the P2SH32 locking bytecode, not the redeem script.
const vaultLocking = cashAddressToLockingBytecode(contract.address).bytecode;
const vaultScriptHash = Buffer.from(createHash('sha256').update(vaultLocking).digest()).reverse().toString('hex');

async function account(mnemonic) {
  const state = new State(await createStorageAdapter({
    storageType: 'indexeddb',
    databasePath: mkdtempSync(join(tmpdir(), 'nomos-xo-engine-')),
    databaseFilename: 'XO-chipnet',
    accountHash: computeAccountHash(mnemonic),
  }));
  const engine = new Engine(mnemonic, state, { initializeEventListeners() {}, async stop() {} }, 'chipnet');
  await engine.importTemplate(templateJson);
  await state.storeScriptHashData({ scriptHash: vaultScriptHash, lockingBytecode: binToHex(vaultLocking), templateIdentifier, lockingScriptIdentifier: 'vault' });
  const secret = (secretIdentifier) => state.storeSecretData({ secretIdentifier, isPrivate: true, isEntropy: true, value: '0', templateIdentifier });
  return { state, engine, secret };
}

const idOf = (stored) => stored.invitation.invitationIdentifier;
const attach = (acct, stored, secretIdentifier, secretLookupKey) => acct.state.updateInvitation(idOf(stored), stored.invitation, {
  [stored.invitation.commits[0].commitIdentifier]: [{ secretIdentifier, secretLookupKey, templateIdentifier }],
});
const nftToken = (category, commitment) => ({ category: hexToBin(category), amount: 0n, nft: { capability: 'mutable', commitment: hexToBin(commitment) } });
const variables = (values) => Object.entries(values).map(([variableIdentifier, value]) => ({ variableIdentifier, value }));
const le8 = (n) => Uint8Array.from({ length: 8 }, (_, i) => Number((BigInt(n) >> BigInt(8 * i)) & 0xffn));
const commitmentHex = (spent, day) => binToHex(new Uint8Array([...le8(spent), ...le8(day)]));
const readLE = (hex) => Number(BigInt(`0x${hex.match(/../g).reverse().join('')}`));

const locktime = Math.floor(Date.now() / 1000) - 3 * 3600;
const dayMarker = Math.floor(locktime / 86400);
const vaultVariables = {
  ownerPublicKey: binToHex(ownerPub), agentPublicKey: binToHex(ownerPub), rescuePublicKey: binToHex(rescuerPub),
  dailyLimitSatoshis: BigInt(DAILY_LIMIT), allowlistEnabled: false,
  allowedPkh1: binToHex(zero), allowedPkh2: binToHex(zero), allowedPkh3: binToHex(zero), allowedPkh4: binToHex(zero), allowedPkh5: binToHex(zero),
};

const category = randomBytes(32).toString('hex');
let vault = { txid: randomBytes(32).toString('hex'), vout: 0, value: 20_000, commitment: '00'.repeat(16) };
const placeVault = (acct) => acct.state.storeUnspentOutputData({
  status: 'confirmed', reservedBy: undefined, scriptHash: vaultScriptHash, templateIdentifier, selectable: false, privacy: false,
  outpointIndex: vault.vout, outpointTransactionHash: vault.txid, minedAtHeight: 340_000, valueSatoshis: vault.value,
  tokenCategory: category, tokenAmount: '0', tokenNftCapability: 'mutable', tokenNftCommitment: vault.commitment,
});
const vm = createVirtualMachineBch2025();
function verify(serializedTransaction) {
  const transaction = decodeTransaction(hexToBin(serializedTransaction));
  const sourceOutputs = [{ lockingBytecode: vaultLocking, valueSatoshis: BigInt(vault.value), token: nftToken(category, vault.commitment) }];
  return { verdict: vm.verify({ sourceOutputs, transaction }), transaction };
}

let passed = 0;
let failed = 0;
const check = (ok, label) => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
};

const owner = await account(ownerMnemonic);
const rescuer = await account(rescuerMnemonic);
const spenderSecret = await owner.secret('spenderKey');
const ownerSecret = await owner.secret('ownerKey');
const rescueSecret = await rescuer.secret('rescueKey');

async function pay(amount) {
  const previous = readLE(vault.commitment.slice(16)) === dayMarker ? readLE(vault.commitment.slice(0, 16)) : 0;
  const stored = await owner.engine.createInvitation({
    templateIdentifier, actionIdentifier: 'pay', roleIdentifier: 'spender',
    inputs: [{ inputIdentifier: 'vaultPayInput', outpointTransactionHash: hexToBin(vault.txid), outpointIndex: vault.vout, valueSatoshis: BigInt(vault.value), token: nftToken(category, vault.commitment) }],
    outputs: [
      { outputIdentifier: 'vaultAfterPayOutput', valueSatoshis: BigInt(vault.value - amount - FEE), token: nftToken(category, commitmentHex(previous + amount, dayMarker)) },
      { outputIdentifier: 'paymentOutput', valueSatoshis: BigInt(amount) },
    ],
    variables: variables({
      ...vaultVariables, vaultCategory: category, vaultSatoshis: BigInt(vault.value), vaultCommitment: vault.commitment,
      amountSatoshis: BigInt(amount), payeeLockingScript: ownerLockingBytecode, locktime, minerFeeSatoshis: BigInt(FEE),
    }),
  });
  await attach(owner, stored, 'spenderKey', spenderSecret);
  await owner.engine.signInvitation(idOf(stored), 0);
  return stored;
}

try {
  await placeVault(owner);
  for (const [amount, spentAfter] of [[3000, 3000], [4000, 7000]]) {
    const stored = await pay(amount);
    const { builtTransaction } = await owner.engine.executeAction(idOf(stored), { broadcastTransaction: false });
    const { verdict, transaction } = verify(builtTransaction.serializedTransaction);
    const pushes = decodeAuthenticationInstructions(transaction.inputs[0].unlockingBytecode).length;
    const spent = readLE(binToHex(transaction.outputs[0].token.nft.commitment).slice(0, 16));
    check(verdict === true && pushes === 5 && spent === spentAfter,
      `pay ${amount}: the engine's transaction is valid in the BCH VM (redeem script pushed once; vault now counts ${spent} spent today)`);
    await owner.state.deleteUnspentOutputData(vault.txid, vault.vout);
    const out = transaction.outputs[0];
    vault = { txid: builtTransaction.transactionHash, vout: 0, value: Number(out.valueSatoshis), commitment: binToHex(out.token.nft.commitment) };
    await placeVault(owner);
  }

  const overLimit = await pay(5000);
  let refused = false;
  try {
    const { builtTransaction } = await owner.engine.executeAction(idOf(overLimit), { broadcastTransaction: false });
    refused = verify(builtTransaction.serializedTransaction).verdict !== true;
  } catch {
    refused = true;
  }
  check(refused, 'pay 5000 more the same day (12,000 > 10,000): the covenant refuses it');
  await owner.engine.archiveInvitation(idOf(overLimit));

  const stored = await owner.engine.createInvitation({
    templateIdentifier, actionIdentifier: 'rescue', roleIdentifier: 'owner',
    inputs: [{ inputIdentifier: 'vaultRescueInput', outpointTransactionHash: hexToBin(vault.txid), outpointIndex: vault.vout, valueSatoshis: BigInt(vault.value), token: nftToken(category, vault.commitment) }],
    outputs: [{ outputIdentifier: 'returnOutput', valueSatoshis: BigInt(vault.value - FEE), token: nftToken(category, vault.commitment) }],
    variables: variables({
      ...vaultVariables, vaultCategory: category, vaultSatoshis: BigInt(vault.value), vaultCommitment: vault.commitment,
      returnLockingScript: ownerLockingBytecode, minerFeeSatoshis: BigInt(FEE),
    }),
  });
  await attach(owner, stored, 'ownerKey', ownerSecret);
  const fromOwner = serializeInvitation((await owner.engine.appendOwnInputResolutions(idOf(stored), 0)).invitation);

  await placeVault(rescuer);
  const accepted = await rescuer.engine.acceptInvitation(deserializeInvitation(fromOwner), { roleIdentifier: 'rescuer' });
  await attach(rescuer, accepted, 'rescueKey', rescueSecret);
  const fromRescuer = serializeInvitation((await rescuer.engine.signInvitation(idOf(accepted), 0)).invitation);

  await owner.engine.updateInvitation(deserializeInvitation(fromRescuer));
  const { builtTransaction } = await owner.engine.executeAction(idOf(stored), { broadcastTransaction: false });
  const { verdict, transaction } = verify(builtTransaction.serializedTransaction);
  check(verdict === true && Boolean(transaction.outputs[0].token?.nft),
    `rescue: owner and rescuer sign one invitation in two engines; ${transaction.outputs[0].valueSatoshis} sats and the vault NFT return to the owner`);
} catch (error) {
  check(false, `engine run stopped: ${error?.constructor?.name}: ${String(error?.message ?? error).split('\n')[0]}`);
}

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
