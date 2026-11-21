#!/usr/bin/env node
/**
 * chipnet.mjs — Phase C: end-to-end Nomos vault demo on XO (chipnet).
 *
 * Mirrors the CashScript demo in contracts/test/vault.test.mjs, but the
 * vault lifecycle after genesis runs through XO invitations against the
 * Nomos template (xo/nomos.template.json):
 *
 *   1. genesis   — create the chipnet vault (owner key, daily limit 10,000
 *                  sats, rescuer key) with a CashScript genesis transaction
 *                  (a template action cannot do genesis).
 *   2. pay #1    — pay 3,000 sats (owner, spend path) via an XO invitation.
 *   3. pay #2    — pay 4,000 sats the same day from the state of step 2.
 *   4. pay #3    — pay 5,000 sats more (12,000 > 10,000): signed and sent
 *                  to the node; the rejection is recorded.
 *   5. rescue    — ONE XO invitation passed between two engines: the owner
 *                  adds its signature, the rescuer (a second engine in its
 *                  own process, `rescuer-sign` mode) accepts the invitation
 *                  and signs, and the owner broadcasts the sweep.
 *
 * If the vault for these keys already exists on chipnet (for example the one
 * created by an earlier run), steps 0–1 are skipped and the demo continues
 * from it, so no new funding is needed.
 *
 * Every invitation is saved to OUT_DIR/<n>-<action>.json (no keys), and a
 * summary of every step to OUT_DIR/run.json.
 *
 * Usage:
 *   node scripts/chipnet.mjs fund   → print the chipnet funding address and stop
 *   node scripts/chipnet.mjs run    → run the full demo
 *
 * Environment:
 *   OWNER_MNEMONIC    BIP39 mnemonic of the owner XO account
 *   OWNER_KEY         optional WIF of the owner key; when set it must be
 *                     derivation index 0 of OWNER_MNEMONIC (the key the vault
 *                     uses). Derived from the mnemonic when not set.
 *   RESCUER_MNEMONIC  BIP39 mnemonic of the rescuer XO account
 *   RESCUER_KEY       optional WIF of the rescuer key, index 0 of RESCUER_MNEMONIC
 *   DATABASE_PATH     state directory (default ./xo-chipnet-data)
 *   OUT_DIR           invitations output directory (default ./invitations)
 *   FUND_SATOSHIS     funding amount to require in run mode (default 60000)
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { generateMnemonic } from 'bip39';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  binToHex,
  binToNumberUint32LE,
  decodePrivateKeyWif,
  encodePrivateKeyWif,
  deriveHdPath,
  deriveHdPathRelative,
  deriveHdPrivateNodeFromSeed,
  hexToBin,
  privateKeyToP2pkhCashAddress,
  privateKeyToP2pkhLockingBytecode,
  secp256k1,
} from '@bitauth/libauth';
import { convertMnemonicToSeedBytes, computeAccountHash } from '@xo-cash/crypto';
import { parseTemplate, generateTemplateIdentifier, serializeInvitation, deserializeInvitation } from '@xo-cash/utils';

// Deterministic script hash: sha256(script).reverse(), hex-encoded.
// We use Node's built-in crypto instead of @xo-cash/utils' scriptToScriptHash
// (which uses libauth's WASM sha256) because the WASM module produces
// non-deterministic hashes across CI environments, causing script hashes to
// differ between runs and breaking vault UTXO tracking.
function scriptToScriptHash(script) {
  const hash = createHash('sha256').update(script).digest();
  return Buffer.from(hash).reverse().toString('hex');
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const XO_DIR = resolve(__dirname, '..');
const CONTRACT_PATH = resolve(XO_DIR, '..', 'contracts', 'NomosVault.cash');

const DAILY_LIMIT_SATOSHIS = 10_000;
const MINER_FEE_SATOSHIS = 1_000;
const PAY_1_SATOSHIS = 3_000;
const PAY_2_SATOSHIS = 4_000;
const PAY_3_SATOSHIS = 5_000;
const GENESIS_VAULT_NFT_SATOSHIS = 50_000;
const GENESIS_FEE_SATOSHIS = 1_000;
const ZERO_COMMITMENT = '00000000000000000000000000000000';
const DB_BASE_FILENAME = 'XO';

const env = process.env;
const DATABASE_PATH = env.DATABASE_PATH ?? join(XO_DIR, 'xo-chipnet-data');
const OUT_DIR = env.OUT_DIR ?? join(XO_DIR, 'invitations');
const FUND_SATOSHIS = Number(env.FUND_SATOSHIS ?? 60_000);

const mode = process.argv[2] ?? 'run';

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function log(message) {
  console.log(message);
}

// ── Key derivation (replicates @xo-cash/crypto exactly) ─────────────────────
// Template keys: m/42415'/{templateIndex}'/{TemplateKeyUseCase.SigningAndSpending}'/{derivationIndex}
// templateIndex = first 4 bytes of sha256(templateIdentifier), LE uint32, masked to 31 bits.

function deriveTemplateKey(seedBytes, templateIdentifierHex, derivationIndex, network) {
  const purposePath = network === 'testnet' ? "m/42415'" : "m/2415'";
  const templateIndex = binToNumberUint32LE(hexToBin(templateIdentifierHex).slice(0, 4)) & 0x7fffffff;
  const master = deriveHdPrivateNodeFromSeed(seedBytes);
  const purposeNode = deriveHdPath(master, purposePath);
  const key = deriveHdPathRelative(purposeNode, `${templateIndex}'/0'/${derivationIndex}`).privateKey;
  return key;
}

function wifToPrivKey(wif) {
  const decoded = decodePrivateKeyWif(wif);
  if (typeof decoded === 'string') fail(`Invalid WIF: ${decoded}`);
  return decoded.privateKey;
}

function privKeyToWif(privateKey) {
  // chipnet/testnet compressed WIF
  return encodePrivateKeyWif(privateKey, 'testnet');
}

function wifFromMnemonic(mnemonic, templateIdentifier, derivationIndex) {
  const seedBytes = convertMnemonicToSeedBytes(mnemonic);
  const key = deriveTemplateKey(seedBytes, templateIdentifier, derivationIndex, 'testnet');
  return privKeyToWif(key);
}

function loadAccount(role, mnemonicVar, wifVar) {
  const mnemonic = env[mnemonicVar]?.trim();
  const wif = env[wifVar]?.trim();
  if (!mnemonic) fail(`${mnemonicVar} is required`);
  const seedBytes = convertMnemonicToSeedBytes(mnemonic);
  const template = parseTemplate(JSON.parse(readFileSync(join(XO_DIR, 'nomos.template.json'), 'utf8')));
  const templateIdentifier = generateTemplateIdentifier(template);
  // The vault is built with derivation index 0 of each account, the same key
  // the engine derives for a secret pinned to index 0.
  const expectedKey = deriveTemplateKey(seedBytes, templateIdentifier, 0, 'testnet');
  const privateKey = wif ? wifToPrivKey(wif) : expectedKey;
  if (binToHex(expectedKey) !== binToHex(privateKey)) {
    fail(`${wifVar} does not match derivation index 0 of ${mnemonicVar} for the Nomos template`);
  }
  const publicKey = secp256k1.derivePublicKeyCompressed(privateKey);
  const address = privateKeyToP2pkhCashAddress({ privateKey, prefix: 'bchtest', throwErrors: true }).address;
  return { role, mnemonic, seedBytes, privateKey, wif: privKeyToWif(privateKey), publicKey, address, template, templateIdentifier };
}

// ── State helpers (second connection on the same database) ──────────────────

function databaseFilenameFor(network) {
  return `${DB_BASE_FILENAME}-${network}`;
}

async function openState(account) {
  const { createStorageAdapter, State } = await import('@xo-cash/state');
  const storage = await createStorageAdapter({
    storageType: 'indexeddb',
    databasePath: DATABASE_PATH,
    databaseFilename: databaseFilenameFor('chipnet'),
    accountHash: computeAccountHash(account.mnemonic),
  });
  return new State(storage);
}

async function preStoreScriptHash(state, account, scriptHash, lockingBytecode, lockingScriptIdentifier) {
  await state.storeScriptHashData({
    scriptHash,
    lockingBytecode,
    templateIdentifier: account.templateIdentifier,
    lockingScriptIdentifier,
  });
}

// Store a key secret pinned to a derivation index of this account and return
// the lookup key State assigns to it; invitations refer to the secret by it.
async function preStoreSecret(state, account, secretIdentifier, derivationIndex = 0) {
  return state.storeSecretData({
    secretIdentifier,
    isPrivate: true,
    isEntropy: true,
    value: String(derivationIndex),
    templateIdentifier: account.templateIdentifier,
  });
}

async function attachSecret(state, invitationIdentifier, invitation, secret) {
  const commitIdentifier = invitation.commits[0].commitIdentifier;
  await state.updateInvitation(invitationIdentifier, invitation, {
    [commitIdentifier]: [{
      secretIdentifier: secret.secretIdentifier,
      secretLookupKey: secret.secretLookupKey,
      templateIdentifier: secret.templateIdentifier,
    }],
  });
}

// ── Electrum helpers ─────────────────────────────────────────────────────────

async function waitForConfirmation(engine, outpointTransactionHash, outpointIndex, { timeoutMs = 30 * 60 * 1000, label = 'transaction' } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const unspent = await engine.listUnspentOutputs();
    const stillThere = unspent.some(
      (u) => String(u.outpointTransactionHash) === String(outpointTransactionHash) && u.outpointIndex === outpointIndex,
    );
    if (!stillThere) return true;
    await new Promise((r) => setTimeout(r, 15_000));
  }
  throw new Error(`Timed out waiting for ${label} (${outpointTransactionHash}:${outpointIndex}) to confirm`);
}

async function waitForTxVisible(txid, { timeoutMs = 30 * 60 * 1000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const { getTransaction } = await import('@electrum-cash/application');
      const txHex = await getTransaction(txid);
      if (txHex) return true;
    } catch {
      // not found yet
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }
  throw new Error(`Timed out waiting for tx ${txid} to be visible`);
}

// Derives the vault script hash from the on-chain genesis transaction.
// cashc's WASM compiler produces non-deterministic bytecode across CI
// environments, so the vault script hash computed from a fresh compilation
// may differ from the one used in a previous run's genesis tx. This function
// looks up the genesis tx from the owner's transaction history on Electrum,
// decodes it, finds the output carrying the vault NFT, and returns the
// script hash of that output's locking bytecode.
async function deriveVaultScriptHashFromGenesis(ownerScriptHash) {
  const { getUsableElectrumClient } = await import('@electrum-cash/application');
  const { decodeTransaction, hexToBin } = await import('@bitauth/libauth');

  const client = await getUsableElectrumClient();
  if (!client) throw new Error('No usable Electrum client available');

  // Query Electrum directly via the client's request() method to avoid
  // importing @electrum-cash/protocol (a transitive dep that isn't a
  // direct dependency of this package and can't be dynamically imported
  // in the CI install).
  const historyRaw = await client.request('blockchain.scripthash.get_history', ownerScriptHash, 0, -1);
  // client.request() resolves with an Error object on failure (it doesn't reject).
  if (historyRaw instanceof Error) {
    throw new Error(`Electrum history request failed: ${historyRaw.message}`);
  }
  if (!Array.isArray(historyRaw)) {
    throw new Error(`Electrum history unexpected format: ${JSON.stringify(historyRaw)}`);
  }

  // History entries may be [txid, height] arrays or {txid, height} objects
  // depending on the Electrum server. Normalise to [txid, height].
  const history = historyRaw.map((entry) => {
    if (Array.isArray(entry)) return entry;
    if (entry && typeof entry === 'object' && entry.txid) return [entry.txid, entry.height];
    return [entry?.txid, entry?.height];
  });

  // Iterate in reverse (newest first).
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i];
    const txid = entry[0];
    if (!txid) continue;
    let txHex;
    try {
      // verbose=false (or omitted) returns raw transaction hex.
      const txResp = await client.request('blockchain.transaction.get', txid);
      txHex = txResp;
    } catch {
      continue;
    }
    if (txHex instanceof Error) continue;
    if (!txHex) continue;

    const tx = decodeTransaction(hexToBin(txHex));
    // Find the output with an NFT token — that's the vault NFT output.
    for (const output of tx.outputs) {
      if (output.token?.nft) {
        return {
          scriptHash: scriptToScriptHash(output.lockingBytecode),
          lockingBytecode: binToHex(output.lockingBytecode),
          txid,
          vout: tx.outputs.indexOf(output),
        };
      }
    }
  }
  return null;
}

// ── Genesis (CashScript genesis transaction) ────────────────────────────────
//
// CHIP-2022-02: a token category's genesis input must spend output index 0
// of its parent transaction. The funding UTXO is typically at a higher vout,
// so we first do a "pre-genesis" self-send: spend the funding UTXO with a
// single output back to the owner address (which lands at vout 0). The
// genesis transaction then spends that vout-0 UTXO; the category ID is the
// pre-genesis transaction's txid (big-endian / display order).

async function buildAndSendGenesis(fundingUtxo, contract, ownerAddress, ownerWif) {
  const { ElectrumNetworkProvider, HashType, SignatureAlgorithm, SignatureTemplate, TransactionBuilder } = await import('cashscript');
  const provider = new ElectrumNetworkProvider('chipnet');
  const sigTemplate = new SignatureTemplate(
    ownerWif,
    HashType.SIGHASH_ALL | HashType.SIGHASH_UTXOS,
    SignatureAlgorithm.ECDSA,
  );

  // ── Step A: pre-genesis — create a vout-0 UTXO ───────────────────────────
  let genesisUtxo;
  if (fundingUtxo.vout === 0) {
    genesisUtxo = fundingUtxo;
  } else {
    // Single output back to the owner → it is vout 0, eligible as a genesis
    // input. Keep enough value for the genesis layout + fees.
    const preGenesisValue = fundingUtxo.satoshis - BigInt(GENESIS_FEE_SATOSHIS);
    if (preGenesisValue < 546n) fail('funding UTXO is too small for the pre-genesis step');

    const preGenesisTx = new TransactionBuilder({ provider });
    preGenesisTx.addInput(fundingUtxo, sigTemplate.unlockP2PKH());
    preGenesisTx.addOutput({ to: ownerAddress, amount: preGenesisValue });

    const preGenesisResult = await preGenesisTx.send();
    log(`  pre-genesis broadcast: ${preGenesisResult.txid} (creates vout-0 UTXO)`);
    genesisUtxo = {
      txid: preGenesisResult.txid,
      vout: 0,
      satoshis: preGenesisValue,
    };
  }

  const changeValue = genesisUtxo.satoshis - BigInt(GENESIS_VAULT_NFT_SATOSHIS) - BigInt(GENESIS_FEE_SATOSHIS);
  if (changeValue < 546n) fail('funding UTXO is too small for the genesis layout');

  const genesisTx = new TransactionBuilder({ provider });
  genesisTx.addInput(genesisUtxo, sigTemplate.unlockP2PKH());
  genesisTx.addOutput({
    to: contract.tokenAddress,
    amount: BigInt(GENESIS_VAULT_NFT_SATOSHIS),
    token: {
      amount: 0n,
      // CHIP-2022-02: the category ID is the txid of the vout-0 UTXO being
      // spent as the genesis input, in big-endian (display) byte order —
      // the same format Electrum reports.
      category: genesisUtxo.txid,
      nft: { capability: 'mutable', commitment: ZERO_COMMITMENT },
    },
  });
  genesisTx.addOutput({ to: ownerAddress, amount: changeValue });

  const result = await genesisTx.send();
  log(`  genesis broadcast: ${result.txid}`);
  return result.txid;
}

// ── Invitation helpers ───────────────────────────────────────────────────────

async function saveInvitation(n, action, invitation) {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `${n}-${action}.json`);
  writeFileSync(file, `${serializeInvitation(invitation)}\n`);
  log(`  invitation saved: ${file}`);
}

function commitmentHex(spentToday, dayMarker) {
  const spent = new Uint8Array(8);
  const day = new Uint8Array(8);
  for (let i = 0; i < 8; i += 1) {
    spent[i] = Number((BigInt(spentToday) >> BigInt(8 * i)) & 0xffn);
    day[i] = Number((BigInt(dayMarker) >> BigInt(8 * i)) & 0xffn);
  }
  return binToHex(new Uint8Array([...spent, ...day]));
}

// The commitment is two 8-byte little-endian integers: spent today, then the day.
function readLittleEndian(hex) {
  return Number(BigInt(`0x${hex.match(/../g).reverse().join('')}`));
}

function spentTodayFromCommitment(commitmentHexStr) {
  return readLittleEndian(commitmentHexStr.slice(0, 16));
}

function dayFromCommitment(commitmentHexStr) {
  return readLittleEndian(commitmentHexStr.slice(16, 32));
}

// Results of every step, written to OUT_DIR/run.json for REPRODUCE.md.
const summary = { network: 'chipnet', startedAt: new Date().toISOString(), steps: [] };
function record(step) {
  summary.steps.push({ at: new Date().toISOString(), ...step });
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'run.json'), `${JSON.stringify(summary, null, 2)}\n`);
}

async function confirmedVaultUtxos(engine, vaultScriptHash, vaultRawBytecode, templateIdentifier) {
  // Use fetchUnspentOutputsForLockingBytecode directly instead of
  // engine.listUnspentOutputs: the engine's tracked UTXO status depends on
  // block-header processing, which fails on chipnet when
  // @electrum-cash/application's checkpoint is stale (~306k vs actual ~339k).
  // fetchUnspentOutputsForLockingBytecode queries Electrum directly and
  // derives confirmed/pending from the block height, bypassing the checkpoint.
  const { fetchUnspentOutputsForLockingBytecode } = await import('@xo-cash/engine');
  const unspent = await fetchUnspentOutputsForLockingBytecode(vaultRawBytecode, templateIdentifier);
  return unspent.filter(
    (u) => u.scriptHash === vaultScriptHash && u.status === 'confirmed' && u.selectable && u.reservedBy === undefined,
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (mode === 'rescuer-sign') {
    // The rescuer's engine, in its own process and state: accept the rescue
    // invitation the owner signed, sign the vault input with the rescue key,
    // and write the invitation back for the owner to broadcast.
    const [inFile, outFile] = process.argv.slice(3);
    if (!inFile || !outFile) fail('usage: chipnet.mjs rescuer-sign <invitation-in.json> <invitation-out.json>');
    if (!env.VAULT_BYTECODE || !env.VAULT_SCRIPT_HASH) fail('VAULT_BYTECODE and VAULT_SCRIPT_HASH are required');
    const rescuer = loadAccount('rescuer', 'RESCUER_MNEMONIC', 'RESCUER_KEY');
    mkdirSync(DATABASE_PATH, { recursive: true });
    const state = await openState(rescuer);
    await preStoreScriptHash(state, rescuer, env.VAULT_SCRIPT_HASH, env.VAULT_BYTECODE, 'vault');
    const rescueSecret = await preStoreSecret(state, rescuer, 'rescueKey');
    const { Engine } = await import('@xo-cash/engine');
    const engine = await Engine.create(rescuer.mnemonic, { network: 'chipnet', storageType: 'indexeddb', databasePath: DATABASE_PATH });
    await engine.importTemplate(JSON.parse(readFileSync(join(XO_DIR, 'nomos.template.json'), 'utf8')));
    const { monitorScriptHash } = await import('@electrum-cash/application');
    await monitorScriptHash(env.VAULT_SCRIPT_HASH);

    const invitation = deserializeInvitation(readFileSync(inFile, 'utf8'));
    // An engine signs only inputs it tracks, so wait until it sees the vault coin.
    const spent = invitation.commits.flatMap((c) => c.data?.inputs ?? []).find((i) => i.outpointTransactionHash !== undefined);
    const spentHash = typeof spent.outpointTransactionHash === 'string' ? spent.outpointTransactionHash : binToHex(spent.outpointTransactionHash);
    const deadline = Date.now() + 20 * 60 * 1000;
    while (!(await engine.listUnspentOutputs()).some((u) => String(u.outpointTransactionHash) === spentHash && u.outpointIndex === spent.outpointIndex)) {
      if (Date.now() > deadline) fail(`rescuer engine never saw the vault coin ${spentHash}:${spent.outpointIndex}`);
      await new Promise((r) => setTimeout(r, 10_000));
    }

    const accepted = await engine.acceptInvitation(invitation, { roleIdentifier: 'rescuer' });
    await attachSecret(state, accepted.invitationIdentifier, accepted.invitation, {
      secretIdentifier: 'rescueKey',
      secretLookupKey: rescueSecret,
      templateIdentifier: rescuer.templateIdentifier,
    });
    const signed = await engine.signInvitation(accepted.invitationIdentifier, 0);
    writeFileSync(outFile, `${serializeInvitation(signed.invitation)}\n`);
    log(`  rescuer signed: ${outFile}`);
    await engine.stop();
    return;
  }

  if (mode === 'keys') {
    // Generate mnemonics + derivation-index-0 WIFs + addresses.
    // Use FIXED_OWNER_MNEMONIC / FIXED_RESCUER_MNEMONIC if set (deterministic
    // chipnet testnet keys for CI runs); otherwise generate random mnemonics.
    // Output is printed for the workflow to capture; nothing is written to disk.
    const ownerMnemonic = process.env.FIXED_OWNER_MNEMONIC || generateMnemonic(256);
    const rescuerMnemonic = process.env.FIXED_RESCUER_MNEMONIC || generateMnemonic(256);
    const template = parseTemplate(JSON.parse(readFileSync(join(XO_DIR, 'nomos.template.json'), 'utf8')));
    const templateIdentifier = generateTemplateIdentifier(template);
    const ownerWif = wifFromMnemonic(ownerMnemonic, templateIdentifier, 0);
    const rescuerWif = wifFromMnemonic(rescuerMnemonic, templateIdentifier, 0);
    const ownerKey = wifToPrivKey(ownerWif);
    const rescuerKey = wifToPrivKey(rescuerWif);
    const ownerAddr = privateKeyToP2pkhCashAddress({ privateKey: ownerKey, prefix: 'bchtest', throwErrors: true }).address;
    const rescuerAddr = privateKeyToP2pkhCashAddress({ privateKey: rescuerKey, prefix: 'bchtest', throwErrors: true }).address;
    console.log(JSON.stringify({
      OWNER_MNEMONIC: ownerMnemonic,
      OWNER_KEY: ownerWif,
      OWNER_ADDRESS: ownerAddr,
      RESCUER_MNEMONIC: rescuerMnemonic,
      RESCUER_KEY: rescuerWif,
      RESCUER_ADDRESS: rescuerAddr,
    }, null, 2));
    return;
  }

  const owner = loadAccount('owner', 'OWNER_MNEMONIC', 'OWNER_KEY');
  const rescuer = loadAccount('rescuer', 'RESCUER_MNEMONIC', 'RESCUER_KEY');

  log('Nomos XO chipnet demo — engine-derived keys verified for both accounts.');
  log(`  owner address (fund this): ${owner.address}`);
  log(`  rescuer address:           ${rescuer.address}`);

  if (mode === 'fund') {
    log(`\nFund this address with at least ${FUND_SATOSHIS} chipnet sats, then run:`);
    log('  node scripts/chipnet.mjs run');
    return;
  }

  mkdirSync(DATABASE_PATH, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  // Compile the CashScript contract for genesis.
  log('\nCompiling NomosVault.cash…');
  const { compileFile } = await import('cashc');
  const { Contract, ElectrumNetworkProvider } = await import('cashscript');
  const { Engine } = await import('@xo-cash/engine');
  const artifact = compileFile(CONTRACT_PATH);
  const ownerPub = owner.publicKey;
  const rescuerPub = rescuer.publicKey;
  const contractParams = [
    ownerPub,                        // ownerPk
    ownerPub,                        // agentPk (owner acts as agent)
    BigInt(DAILY_LIMIT_SATOSHIS),    // dailyLimitSats
    false,                           // allowlistEnabled
    new Uint8Array(20),              // allowedAddr1-5 (20-byte zero hashes)
    new Uint8Array(20),
    new Uint8Array(20),
    new Uint8Array(20),
    new Uint8Array(20),
    rescuerPub,                      // rescuePk
  ];
  const contract = new Contract(artifact, contractParams, { provider: new ElectrumNetworkProvider('chipnet') });
  log(`  contract address: ${contract.address}`);
  log(`  contract token address: ${contract.tokenAddress}`);

  // Vault locking bytecode + script hash from the CashScript contract.
  let vaultRawBytecode = contract.bytecode;
  let vaultScriptHash = scriptToScriptHash(hexToBin(vaultRawBytecode));
  const ownerLockingBytecode = binToHex(privateKeyToP2pkhLockingBytecode({ privateKey: owner.privateKey }));
  const ownerScriptHash = scriptToScriptHash(hexToBin(ownerLockingBytecode));
  log(`  vault script hash: ${vaultScriptHash}`);
  log(`  owner script hash: ${ownerScriptHash}`);

  // Pre-store the owner's p2pkh script hash (funding tracking) and secrets
  // on the owner's state BEFORE engine creation so the engine monitors and
  // tracks them from the start. Secrets are pinned to derivation index 0,
  // matching OWNER_KEY / RESCUER_KEY.
  //
  // Only ONE engine is created per process: @electrum-cash/application
  // initializes its cache globally, so a second Engine.create() fails with
  // "Cannot configure storage for cache after it has been initialized."
  // The rescuer's rescue secret is pre-stored on the owner's state so the
  // owner engine can sign BOTH sides of the rescue invitation.
  const ownerState = await openState(owner);
  await preStoreScriptHash(ownerState, owner, ownerScriptHash, ownerLockingBytecode, 'p2pkh-owner');
  // Pre-store the vault script hash (from the CashScript contract) so the
  // engine tracks vault NFT UTXOs. The template's lockingBytecode is a
  // reference string resolved internally, not a hex bytecode — so we
  // register the contract's actual script hash directly.
  await preStoreScriptHash(ownerState, owner, vaultScriptHash, vaultRawBytecode, 'vault');
  const ownerSpenderSecret = await preStoreSecret(ownerState, owner, 'spenderKey');
  const ownerOwnerSecret = await preStoreSecret(ownerState, owner, 'ownerKey');
  const rescuerRescueSecret = await preStoreSecret(ownerState, owner, 'rescueKey');

  // Engine (single — the Electrum cache is a process-wide singleton).
  const ownerEngine = await Engine.create(owner.mnemonic, {
    network: 'chipnet',
    storageType: 'indexeddb',
    databasePath: DATABASE_PATH,
  });
  try {
    const templateJson = JSON.parse(readFileSync(join(XO_DIR, 'nomos.template.json'), 'utf8'));
    await ownerEngine.importTemplate(templateJson);
  } catch (error) {
    fail(`template import failed: ${error?.message ?? error}`);
  }
  log('  engine up, template imported');

  // Explicitly re-monitor the owner's p2pkh script hash. The engine's
  // internal #monitorStoredScriptHashes runs during Engine.create, but the
  // Electrum connection may not be fully established yet. Re-monitoring
  // after import ensures the subscription is active and the funding UTXO
  // is fetched immediately.
  const { monitorScriptHash } = await import('@electrum-cash/application');
  const { fetchScriptHashUnspentOutputs } = await import('@xo-cash/engine');
  await monitorScriptHash(ownerScriptHash);
  await monitorScriptHash(vaultScriptHash);
  const ownerUnspent = await fetchScriptHashUnspentOutputs(ownerScriptHash);
  log(`  Electrum reports ${ownerUnspent.length} unspent output(s) for owner script hash`);
  for (const u of ownerUnspent) {
    log(`    ${u.outpointTransactionHash}:${u.outpointIndex} — ${u.valueSatoshis} sats`);
  }

  // The vault script hash is pre-stored from the CashScript contract (the
  // template's lockingBytecode is a reference string, not hex bytecode).
  let engineVaultScriptHash = vaultScriptHash;
  log(`  engine vault script hash: ${engineVaultScriptHash}`);

  // cashc's WASM compiler produces non-deterministic bytecode across CI
  // environments, so the vault script hash computed from a fresh compilation
  // may differ from the one used in a previous run's genesis tx. If a genesis
  // tx was already broadcast (from a prior run), derive the vault script hash
  // from the on-chain genesis tx and use THAT for vault UTXO tracking.
  let onchainVault = null;
  try {
    onchainVault = await deriveVaultScriptHashFromGenesis(ownerScriptHash);
  } catch (e) {
    log(`  (could not look up on-chain genesis tx: ${e?.message ?? e})`);
  }
  if (onchainVault) {
    log(`  on-chain genesis tx found: ${onchainVault.txid} — vault script hash: ${onchainVault.scriptHash}`);
    if (onchainVault.scriptHash !== engineVaultScriptHash) {
      log(`  ⚠ compiled vault script hash differs from on-chain — using on-chain hash for tracking`);
      // Re-store the on-chain script hash so the engine tracks the correct UTXOs.
      await preStoreScriptHash(ownerState, owner, onchainVault.scriptHash, onchainVault.lockingBytecode, 'vault');
      await monitorScriptHash(onchainVault.scriptHash);
      // Also update the local variables used throughout the pay flow.
      vaultScriptHash = onchainVault.scriptHash;
      vaultRawBytecode = onchainVault.lockingBytecode;
      engineVaultScriptHash = onchainVault.scriptHash;
    }
  }

  // ── Step 0: an existing vault, or funding + genesis ──────────────────────
  // A vault for these keys may already be on chipnet (an earlier run broadcast
  // its genesis). Its NFT output carries the state, so the demo continues from
  // it and needs no new funding.
  log('\n[0] Checking for an existing vault…');
  const { fetchUnspentOutputsForLockingBytecode } = await import('@xo-cash/engine');
  const existingVault = (await fetchUnspentOutputsForLockingBytecode(vaultRawBytecode, owner.templateIdentifier))
    .find((u) => u.tokenNftCommitment !== undefined);
  if (existingVault) {
    log(`  vault found: ${existingVault.outpointTransactionHash}:${existingVault.outpointIndex} (${existingVault.valueSatoshis} sats, ${existingVault.status}); skipping funding and genesis`);
    record({ step: 'existing-vault', outpoint: `${existingVault.outpointTransactionHash}:${existingVault.outpointIndex}`, satoshis: String(existingVault.valueSatoshis), commitment: existingVault.tokenNftCommitment, status: existingVault.status });
  } else {
    log('\n[0] Waiting for funding…');
    let fundingUtxo = null;
    const fundingDeadline = Date.now() + 2 * 60 * 60 * 1000;
    let lastLogTime = 0;
    while (Date.now() < fundingDeadline) {
      const all = await ownerEngine.listUnspentOutputs();
      // Diagnostic: log what the engine reports (every ~60s)
      if (Date.now() - lastLogTime > 60_000) {
        lastLogTime = Date.now();
        log(`  engine reports ${all.length} unspent outputs`);
        for (const u of all) {
          log(`    ${u.outpointTransactionHash}:${u.outpointIndex} — ${u.valueSatoshis} sats — scriptHash: ${u.scriptHash} — reservedBy: ${u.reservedBy ?? 'none'}`);
        }
      }
      // Match by script hash (owner p2pkh). Accept ANY status — confirmed
      // AND unconfirmed (mempool, status 'pending') UTXOs. BCH lets us spend
      // unconfirmed coins, and CashScript / the engine can spend mempool
      // UTXOs. Also accept reservedBy being null/undefined.
      const candidates = all.filter(
        (u) => u.scriptHash === ownerScriptHash && u.valueSatoshis >= FUND_SATOSHIS,
      );
      if (candidates.length > 0) {
        const chosen = candidates.sort((a, b) => a.outpointIndex - b.outpointIndex)[0];
        fundingUtxo = {
          txid: chosen.outpointTransactionHash,
          vout: chosen.outpointIndex,
          satoshis: BigInt(chosen.valueSatoshis),
        };
        log(`  funding UTXO status: ${chosen.status} (confirmed or mempool)`);
        break;
      }
      await new Promise((r) => setTimeout(r, 20_000));
    }
    if (!fundingUtxo) {
      log(`\nNo funded UTXO of ≥ ${FUND_SATOSHIS} sats found for ${owner.address}.`);
      log('Fund the address, wait for confirmation, then run again.');
      await ownerEngine.stop();
      return;
    }
    log(`  funding UTXO: ${fundingUtxo.txid}:${fundingUtxo.vout} (${fundingUtxo.satoshis} sats)`);

    // ── Step 1: genesis ───────────────────────────────────────────────────────
    log('\n[1] Genesis — create the chipnet vault…');
    const genesisTxid = await buildAndSendGenesis(fundingUtxo, contract, owner.address, owner.wif);
    await waitForConfirmation(ownerEngine, fundingUtxo.txid, fundingUtxo.vout, { label: 'pre-genesis' });
    await waitForTxVisible(genesisTxid);
    // Wait for the genesis output (vault NFT UTXO) to be confirmed before
    // proceeding — the pay flow only selects confirmed vault UTXOs.
    {
      const vaultDeadline = Date.now() + 30 * 60 * 1000;
      let nftVaultUtxo1 = null;
      while (Date.now() < vaultDeadline) {
        nftVaultUtxo1 = (await confirmedVaultUtxos(ownerEngine, engineVaultScriptHash, vaultRawBytecode, owner.templateIdentifier))
          .find((u) => u.tokenNftCommitment !== undefined);
        if (nftVaultUtxo1) break;
        await new Promise((r) => setTimeout(r, 15_000));
      }
      if (!nftVaultUtxo1) fail('vault NFT output not confirmed after genesis');
    }
    log(`  genesis confirmed: ${genesisTxid}`);
    record({ step: 'genesis', txid: genesisTxid });
  }

  // The vault coin each step spends must be confirmed; chipnet blocks come
  // about once a minute, so wait for it instead of failing straight away.
  async function waitForVault(label, timeoutMs = 30 * 60 * 1000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = (await confirmedVaultUtxos(ownerEngine, engineVaultScriptHash, vaultRawBytecode, owner.templateIdentifier))
        .find((u) => u.tokenNftCommitment !== undefined);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 15_000));
    }
    throw new Error(`vault NFT output not confirmed ${label}`);
  }

  // ── Step 2: pay #1 ───────────────────────────────────────────────────────
  // Nodes reject a tx whose locktime is later than the chain's median time
  // past (non-final), so back-date it. The contract derives "today" from
  // tx.locktime, so the commitment's day marker uses the same value.
  const locktime = Math.floor(Date.now() / 1000) - 3 * 3600;
  const dayMarker = Math.floor(locktime / 86400);

  const vaultVariables = {
    ownerPublicKey: binToHex(ownerPub),
    agentPublicKey: binToHex(ownerPub),
    rescuePublicKey: binToHex(rescuerPub),
    dailyLimitSatoshis: BigInt(DAILY_LIMIT_SATOSHIS),
    allowlistEnabled: false,
    allowedPkh1: binToHex(new Uint8Array(20)),
    allowedPkh2: binToHex(new Uint8Array(20)),
    allowedPkh3: binToHex(new Uint8Array(20)),
    allowedPkh4: binToHex(new Uint8Array(20)),
    allowedPkh5: binToHex(new Uint8Array(20)),
  };

  async function pay(n, amount, vaultUtxo) {
    log(`\n[${n}] Pay ${amount} sats (owner)…`);
    const commitment = vaultUtxo.tokenNftCommitment;
    const vaultSatoshis = vaultUtxo.valueSatoshis;
    const payVaultSatoshis = BigInt(vaultSatoshis) - BigInt(amount) - BigInt(MINER_FEE_SATOSHIS);
    // Same rule as the covenant: a commitment from another day counts as zero.
    const previousSpent = dayFromCommitment(commitment) === dayMarker ? spentTodayFromCommitment(commitment) : 0;
    const newSpentToday = previousSpent + amount;
    const newCommitment = commitmentHex(newSpentToday, dayMarker);
    const invitation = await ownerEngine.createInvitation({
      templateIdentifier: owner.templateIdentifier,
      actionIdentifier: 'pay',
      roleIdentifier: 'spender',
      inputs: [{
        inputIdentifier: 'vaultPayInput',
        outpointTransactionHash: vaultUtxo.outpointTransactionHash,
        outpointIndex: vaultUtxo.outpointIndex,
        valueSatoshis: BigInt(vaultSatoshis),
        token: {
          category: vaultUtxo.tokenCategory,
          amount: 0n,
          nft: { capability: 'mutable', commitment },
        },
      }],
      outputs: [
        {
          outputIdentifier: 'vaultAfterPayOutput',
          valueSatoshis: payVaultSatoshis,
          token: {
            category: vaultUtxo.tokenCategory,
            amount: 0n,
            nft: { capability: 'mutable', commitment: newCommitment },
          },
        },
        {
          outputIdentifier: 'paymentOutput',
          valueSatoshis: BigInt(amount),
        },
      ],
      variables: {
        ...vaultVariables,
        vaultCategory: vaultUtxo.tokenCategory,
        vaultSatoshis: BigInt(vaultSatoshis),
        vaultCommitment: commitment,
        amountSatoshis: BigInt(amount),
        payeeLockingScript: ownerLockingBytecode,
        locktime,
        minerFeeSatoshis: BigInt(MINER_FEE_SATOSHIS),
      },
    });
    await attachSecret(ownerState, invitation.invitationIdentifier, invitation.invitation, {
      secretIdentifier: 'spenderKey',
      secretLookupKey: ownerSpenderSecret,
      templateIdentifier: owner.templateIdentifier,
    });
    await ownerEngine.signInvitation(invitation.invitationIdentifier, 0);
    return invitation;
  }

  const nftVaultUtxo1 = await waitForVault('after genesis');
  const pay1 = await pay(2, PAY_1_SATOSHIS, nftVaultUtxo1);
  const pay1Result = await ownerEngine.executeAction(pay1.invitationIdentifier, { broadcastTransaction: true });
  await saveInvitation(2, 'pay-3000', pay1Result.storedInvitation.invitation);
  log(`  pay #1 txid: ${pay1Result.builtTransaction.transactionHash}`);
  record({ step: 'pay', satoshis: String(PAY_1_SATOSHIS), txid: pay1Result.builtTransaction.transactionHash, invitation: '2-pay-3000.json' });
  await waitForConfirmation(ownerEngine, nftVaultUtxo1.outpointTransactionHash, nftVaultUtxo1.outpointIndex, { label: 'pay #1' });
  await waitForTxVisible(pay1Result.builtTransaction.transactionHash);

  // ── Step 3: pay #2 (follow-up, same day, from step 2's state) ────────────
  const nftVaultUtxo2 = await waitForVault('after pay #1');
  const pay2 = await pay(3, PAY_2_SATOSHIS, nftVaultUtxo2);
  const pay2Result = await ownerEngine.executeAction(pay2.invitationIdentifier, { broadcastTransaction: true });
  await saveInvitation(3, 'pay-4000', pay2Result.storedInvitation.invitation);
  log(`  pay #2 txid: ${pay2Result.builtTransaction.transactionHash}`);
  record({ step: 'pay', satoshis: String(PAY_2_SATOSHIS), txid: pay2Result.builtTransaction.transactionHash, invitation: '3-pay-4000.json' });
  await waitForConfirmation(ownerEngine, nftVaultUtxo2.outpointTransactionHash, nftVaultUtxo2.outpointIndex, { label: 'pay #2' });
  await waitForTxVisible(pay2Result.builtTransaction.transactionHash);

  // ── Step 4: pay #3 (over the daily limit — expect rejection) ─────────────
  log(`\n[4] Pay ${PAY_3_SATOSHIS} sats more (12,000 > 10,000) — expect rejection…`);
  const nftVaultUtxo3 = await waitForVault('after pay #2');
  const pay3 = await pay(4, PAY_3_SATOSHIS, nftVaultUtxo3);
  let rejectionMessage = null;
  let pay3Txid = null;
  let nodeResponse = null;
  try {
    const pay3Result = await ownerEngine.executeAction(pay3.invitationIdentifier, { broadcastTransaction: true });
    pay3Txid = pay3Result.builtTransaction.transactionHash;
    log(`  NOT REFUSED (unexpected): ${pay3Txid}`);
  } catch (error) {
    rejectionMessage = String(error?.message ?? error).split('\n')[0];
    log(`  REFUSED by the contract before broadcast: ${rejectionMessage}`);
    // Still send the signed tx to the node and record what the network says.
    try {
      const built = await ownerEngine.buildInvitationTransactionFromMergedCommit(pay3.invitationIdentifier);
      const { broadcastTransaction } = await import('@electrum-cash/application');
      pay3Txid = await broadcastTransaction(built.serializedTransaction);
      log(`  pay #3 txid (sent to node): ${pay3Txid}`);
    } catch (broadcastError) {
      nodeResponse = String(broadcastError?.message ?? broadcastError).split('\n')[0];
      log(`  node rejected the broadcast: ${nodeResponse}`);
    }
  }
  await saveInvitation(4, 'pay-5000-overlimit', (await ownerEngine.getInvitation(pay3.invitationIdentifier)).invitation);
  if (rejectionMessage) log(`  rejection recorded: ${rejectionMessage}`);
  record({ step: 'pay-over-limit', satoshis: String(PAY_3_SATOSHIS), refusedBeforeBroadcast: rejectionMessage, nodeResponse, unexpectedTxid: pay3Txid, invitation: '4-pay-5000-overlimit.json' });
  // The refused invitation still reserves the vault coin; archiving it releases the coin for the rescue.
  try {
    await ownerEngine.archiveInvitation(pay3.invitationIdentifier);
  } catch (error) {
    log(`  could not archive the refused invitation: ${error?.message ?? error}`);
  }

  // ── Step 5: rescue (ONE invitation, two engines) ─────────────────────────
  // The rescue unlocking script needs the owner's and the rescuer's
  // signatures. An engine signs only with its own account's keys, so the
  // invitation travels: the owner adds its signature as a resolution, a second
  // engine for the rescuer (own process, own state) accepts it and signs the
  // input, and the owner merges that and broadcasts.
  log('\n[5] Rescue — owner and rescuer sign one invitation in two engines…');
  try {
    const nftVaultUtxoRescue = await waitForVault('before rescue');
    const withdrawSatoshis = BigInt(nftVaultUtxoRescue.valueSatoshis) - BigInt(MINER_FEE_SATOSHIS);

    const rescueInvitation = await ownerEngine.createInvitation({
      templateIdentifier: owner.templateIdentifier,
      actionIdentifier: 'rescue',
      roleIdentifier: 'owner',
      inputs: [{
        inputIdentifier: 'vaultRescueInput',
        outpointTransactionHash: nftVaultUtxoRescue.outpointTransactionHash,
        outpointIndex: nftVaultUtxoRescue.outpointIndex,
        valueSatoshis: BigInt(nftVaultUtxoRescue.valueSatoshis),
        token: {
          category: nftVaultUtxoRescue.tokenCategory,
          amount: 0n,
          nft: { capability: 'mutable', commitment: nftVaultUtxoRescue.tokenNftCommitment },
        },
      }],
      outputs: [{
        outputIdentifier: 'returnOutput',
        valueSatoshis: withdrawSatoshis,
        token: {
          category: nftVaultUtxoRescue.tokenCategory,
          amount: 0n,
          nft: { capability: 'mutable', commitment: nftVaultUtxoRescue.tokenNftCommitment },
        },
      }],
      variables: {
        ...vaultVariables,
        vaultCategory: nftVaultUtxoRescue.tokenCategory,
        vaultSatoshis: BigInt(nftVaultUtxoRescue.valueSatoshis),
        vaultCommitment: nftVaultUtxoRescue.tokenNftCommitment,
        returnLockingScript: ownerLockingBytecode,
        minerFeeSatoshis: BigInt(MINER_FEE_SATOSHIS),
      },
    });
    await attachSecret(ownerState, rescueInvitation.invitationIdentifier, rescueInvitation.invitation, {
      secretIdentifier: 'ownerKey',
      secretLookupKey: ownerOwnerSecret,
      templateIdentifier: owner.templateIdentifier,
    });
    const withOwnerSignature = await ownerEngine.appendOwnInputResolutions(rescueInvitation.invitationIdentifier, 0);
    const toRescuer = join(OUT_DIR, '5-rescue-1-owner.json');
    writeFileSync(toRescuer, `${serializeInvitation(withOwnerSignature.invitation)}\n`);
    log(`  owner signed; invitation for the rescuer: ${toRescuer}`);

    const fromRescuer = join(OUT_DIR, '5-rescue-2-rescuer.json');
    execFileSync(process.execPath, [fileURLToPath(import.meta.url), 'rescuer-sign', toRescuer, fromRescuer], {
      stdio: 'inherit',
      timeout: 30 * 60 * 1000,
      env: {
        ...env,
        DATABASE_PATH: `${DATABASE_PATH}-rescuer`,
        VAULT_BYTECODE: vaultRawBytecode,
        VAULT_SCRIPT_HASH: engineVaultScriptHash,
      },
    });

    await ownerEngine.updateInvitation(deserializeInvitation(readFileSync(fromRescuer, 'utf8')));
    const rescueResult = await ownerEngine.executeAction(rescueInvitation.invitationIdentifier, { broadcastTransaction: true });
    await saveInvitation(5, 'rescue', rescueResult.storedInvitation.invitation);
    const rescueTxid = rescueResult.builtTransaction.transactionHash;
    log(`  rescue txid: ${rescueTxid}`);
    record({ step: 'rescue', satoshis: String(withdrawSatoshis), txid: rescueTxid, invitations: ['5-rescue-1-owner.json', '5-rescue-2-rescuer.json', '5-rescue.json'] });
    await waitForTxVisible(rescueTxid);
  } catch (error) {
    const message = String(error?.message ?? error).split('\n')[0];
    log(`  rescue did not complete: ${message}`);
    record({ step: 'rescue', error: message });
  }

  record({ step: 'done' });
  await ownerEngine.stop();
  log('\nDone. Invitations saved to', OUT_DIR);
}

main().catch((error) => {
  console.error(`FAILED: ${error?.message ?? error}`);
  if (error?.stack) console.error(error.stack);
  process.exit(1);
});
