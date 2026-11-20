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
 *   5. rescue    — ONE XO invitation co-signed by OWNER_KEY and
 *                  RESCUER_KEY sweeps the vault back to the owner.
 *
 * Every invitation is saved to OUT_DIR/<n>-<action>.json (no keys). Every
 * txid and the rejection message are printed.
 *
 * Usage:
 *   node scripts/chipnet.mjs fund   → print the chipnet funding address and stop
 *   node scripts/chipnet.mjs run    → run the full demo (needs funded address)
 *
 * Environment:
 *   OWNER_MNEMONIC    BIP39 mnemonic of the owner XO account
 *   OWNER_KEY         WIF of the owner key — must be derivation index 0 of
 *                     OWNER_MNEMONIC (the engine derives template keys from
 *                     the mnemonic; this script pins them to index 0)
 *   RESCUER_MNEMONIC  BIP39 mnemonic of the rescuer XO account
 *   RESCUER_KEY       WIF of the rescuer key — derivation index 0 of
 *                     RESCUER_MNEMONIC
 *   DATABASE_PATH     state directory (default ./xo-chipnet-data)
 *   OUT_DIR           invitations output directory (default ./invitations)
 *   FUND_SATOSHIS     funding amount to require in run mode (default 60000)
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
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
  sha256,
} from '@bitauth/libauth';
import { convertMnemonicToSeedBytes, computeAccountHash } from '@xo-cash/crypto';
import { parseTemplate, generateTemplateIdentifier, serializeInvitation } from '@xo-cash/utils';

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
  const mnemonic = env[mnemonicVar];
  const wif = env[wifVar];
  if (!mnemonic) fail(`${mnemonicVar} is required`);
  if (!wif) fail(`${wifVar} is required`);
  const seedBytes = convertMnemonicToSeedBytes(mnemonic);
  const template = parseTemplate(JSON.parse(readFileSync(join(XO_DIR, 'nomos.template.json'), 'utf8')));
  const templateIdentifier = generateTemplateIdentifier(template);
  const expectedKey = deriveTemplateKey(seedBytes, templateIdentifier, 0, 'testnet');
  const providedKey = wifToPrivKey(wif);
  if (binToHex(expectedKey) !== binToHex(providedKey)) {
    fail(`${wifVar} does not match derivation index 0 of ${mnemonicVar} for the Nomos template`);
  }
  const publicKey = secp256k1.derivePublicKeyCompressed(providedKey);
  const address = privateKeyToP2pkhCashAddress({ privateKey: providedKey, prefix: 'bchtest', throwErrors: true }).address;
  return { role, mnemonic, seedBytes, privateKey: providedKey, publicKey, address, template, templateIdentifier };
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

async function preStoreSecret(state, account, secretIdentifier, derivationIndex = 0) {
  const secretLookupKey = binToHex(crypto.getRandomValues(new Uint8Array(32)));
  await state.storeSecretData({
    secretIdentifier,
    isPrivate: true,
    isEntropy: true,
    value: String(derivationIndex),
    templateIdentifier: account.templateIdentifier,
  });
  return secretLookupKey;
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

// ── Genesis (CashScript genesis transaction) ────────────────────────────────

async function buildAndSendGenesis(fundingUtxo, contract, ownerAddress, ownerWif) {
  const { ElectrumNetworkProvider, HashType, SignatureAlgorithm, SignatureTemplate, TransactionBuilder } = await import('cashscript');
  const provider = new ElectrumNetworkProvider('chipnet');
  const sigTemplate = new SignatureTemplate(
    ownerWif,
    HashType.SIGHASH_ALL | HashType.SIGHASH_UTXOS,
    SignatureAlgorithm.ECDSA,
  );

  const changeValue = fundingUtxo.satoshis - GENESIS_VAULT_NFT_SATOSHIS - GENESIS_FEE_SATOSHIS;
  if (changeValue < 546n) fail('funding UTXO is too small for the genesis layout');

  const genesisTx = new TransactionBuilder({ provider });
  genesisTx.addInput(fundingUtxo, sigTemplate.unlockP2PKH());
  genesisTx.addOutput({
    to: contract.tokenAddress,
    amount: BigInt(GENESIS_VAULT_NFT_SATOSHIS),
    token: {
      amount: 0n,
      category: fundingUtxo.txid, // genesis: category = txid of the funding coin
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

function spentTodayFromCommitment(commitmentHexStr) {
  return Number(BigInt(commitmentHexStr.slice(0, 16), 16));
}

async function confirmedVaultUtxos(engine, vaultScriptHash) {
  const unspent = await engine.listUnspentOutputs();
  return unspent.filter(
    (u) => u.scriptHash === vaultScriptHash && u.status === 'confirmed' && u.selectable && u.reservedBy === undefined,
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
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
  const vaultRawBytecode = contract.bytecode;
  const vaultScriptHash = binToHex(sha256.hash(hexToBin(vaultRawBytecode)));
  const ownerLockingBytecode = binToHex(privateKeyToP2pkhLockingBytecode({ privateKey: owner.privateKey }));
  const ownerScriptHash = binToHex(sha256.hash(hexToBin(ownerLockingBytecode)));
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
  const engineVaultScriptHash = vaultScriptHash;
  log(`  engine vault script hash: ${engineVaultScriptHash}`);

  // ── Step 0: funding ───────────────────────────────────────────────────────
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
    // Match by script hash (owner p2pkh). Also accept reservedBy being
    // null/undefined — some engine versions set reservedBy on tracked UTXOs.
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
  const genesisTxid = await buildAndSendGenesis(fundingUtxo, contract, owner.address, env.OWNER_KEY);
  await waitForConfirmation(ownerEngine, fundingUtxo.txid, fundingUtxo.vout, { label: 'genesis' });
  await waitForTxVisible(genesisTxid);
  log(`  genesis confirmed: ${genesisTxid}`);

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
    dailyLimitSatoshis: DAILY_LIMIT_SATOSHIS,
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
    const payVaultSatoshis = vaultSatoshis - BigInt(amount) - BigInt(MINER_FEE_SATOSHIS);
    const newSpentToday = spentTodayFromCommitment(commitment) + amount;
    const newCommitment = commitmentHex(newSpentToday, dayMarker);
    const invitation = await ownerEngine.createInvitation({
      templateIdentifier: owner.templateIdentifier,
      actionIdentifier: 'pay',
      roleIdentifier: 'spender',
      inputs: [{
        inputIdentifier: 'vaultPayInput',
        outpointTransactionHash: vaultUtxo.outpointTransactionHash,
        outpointIndex: vaultUtxo.outpointIndex,
        valueSatoshis: vaultSatoshis,
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
        vaultSatoshis,
        vaultCommitment: commitment,
        amountSatoshis: amount,
        payeeLockingScript: ownerLockingBytecode,
        locktime,
        minerFeeSatoshis: MINER_FEE_SATOSHIS,
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

  let nftVaultUtxo1 = (await confirmedVaultUtxos(ownerEngine, engineVaultScriptHash)).find((u) => u.tokenNftCommitment !== undefined);
  if (!nftVaultUtxo1) fail('vault NFT output not found after genesis');
  const pay1 = await pay(2, PAY_1_SATOSHIS, nftVaultUtxo1);
  const pay1Result = await ownerEngine.executeAction(pay1.invitationIdentifier, { broadcastTransaction: true });
  await saveInvitation(2, 'pay-3000', pay1Result.storedInvitation.invitation);
  log(`  pay #1 txid: ${pay1Result.builtTransaction.transactionHash}`);
  await waitForConfirmation(ownerEngine, nftVaultUtxo1.outpointTransactionHash, nftVaultUtxo1.outpointIndex, { label: 'pay #1' });
  await waitForTxVisible(pay1Result.builtTransaction.transactionHash);

  // ── Step 3: pay #2 (follow-up, same day, from step 2's state) ────────────
  let nftVaultUtxo2 = (await confirmedVaultUtxos(ownerEngine, engineVaultScriptHash)).find((u) => u.tokenNftCommitment !== undefined);
  if (!nftVaultUtxo2) fail('vault NFT output not found after pay #1');
  const pay2 = await pay(3, PAY_2_SATOSHIS, nftVaultUtxo2);
  const pay2Result = await ownerEngine.executeAction(pay2.invitationIdentifier, { broadcastTransaction: true });
  await saveInvitation(3, 'pay-4000', pay2Result.storedInvitation.invitation);
  log(`  pay #2 txid: ${pay2Result.builtTransaction.transactionHash}`);
  await waitForConfirmation(ownerEngine, nftVaultUtxo2.outpointTransactionHash, nftVaultUtxo2.outpointIndex, { label: 'pay #2' });
  await waitForTxVisible(pay2Result.builtTransaction.transactionHash);

  // ── Step 4: pay #3 (over the daily limit — expect rejection) ─────────────
  log(`\n[4] Pay ${PAY_3_SATOSHIS} sats more (12,000 > 10,000) — expect rejection…`);
  let nftVaultUtxo3 = (await confirmedVaultUtxos(ownerEngine, engineVaultScriptHash)).find((u) => u.tokenNftCommitment !== undefined);
  if (!nftVaultUtxo3) fail('vault NFT output not found after pay #2');
  const pay3 = await pay(4, PAY_3_SATOSHIS, nftVaultUtxo3);
  let rejectionMessage = null;
  let pay3Txid = null;
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
      log(`  node rejected the broadcast: ${String(broadcastError?.message ?? broadcastError).split('\n')[0]}`);
    }
  }
  await saveInvitation(4, 'pay-5000-overlimit', (await ownerEngine.getInvitation(pay3.invitationIdentifier)).invitation);
  if (rejectionMessage) log(`  rejection recorded: ${rejectionMessage}`);

  // ── Step 5: rescue (ONE invitation, both keys) ───────────────────────────
  log('\n[5] Rescue — sweep the vault back to the owner with owner + rescuer…');
  let nftVaultUtxoRescue = (await confirmedVaultUtxos(ownerEngine, engineVaultScriptHash)).find((u) => u.tokenNftCommitment !== undefined);
  if (!nftVaultUtxoRescue) fail('vault NFT output not found before rescue');
  const withdrawSatoshis = nftVaultUtxoRescue.valueSatoshis - BigInt(MINER_FEE_SATOSHIS);

  const rescueInvitation = await ownerEngine.createInvitation({
    templateIdentifier: owner.templateIdentifier,
    actionIdentifier: 'rescue',
    roleIdentifier: 'owner',
    inputs: [{
      inputIdentifier: 'vaultRescueInput',
      outpointTransactionHash: nftVaultUtxoRescue.outpointTransactionHash,
      outpointIndex: nftVaultUtxoRescue.outpointIndex,
      valueSatoshis: nftVaultUtxoRescue.valueSatoshis,
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
      vaultSatoshis: nftVaultUtxoRescue.valueSatoshis,
      vaultCommitment: nftVaultUtxoRescue.tokenNftCommitment,
      returnLockingScript: ownerLockingBytecode,
      minerFeeSatoshis: MINER_FEE_SATOSHIS,
    },
  });
  await attachSecret(ownerState, rescueInvitation.invitationIdentifier, rescueInvitation.invitation, {
    secretIdentifier: 'ownerKey',
    secretLookupKey: ownerOwnerSecret,
    templateIdentifier: owner.templateIdentifier,
  });
  await ownerEngine.signInvitation(rescueInvitation.invitationIdentifier, 0);

  // Rescuer joins and signs the same input with its key. The rescuer's
  // secret was pre-stored on the owner's state, so the single owner engine
  // can accept, sign, and update for the rescuer role too.
  const rescuerStored = await ownerEngine.acceptInvitation(rescueInvitation.invitation, { roleIdentifier: 'rescuer' });
  await attachSecret(ownerState, rescuerStored.invitationIdentifier, rescuerStored.invitation, {
    secretIdentifier: 'rescueKey',
    secretLookupKey: rescuerRescueSecret,
    templateIdentifier: owner.templateIdentifier,
  });
  await ownerEngine.signInvitation(rescuerStored.invitationIdentifier, 0);

  // The rescuer's updated invitation goes back to the owner's engine.
  const rescuerUpdated = await ownerEngine.getInvitation(rescuerStored.invitationIdentifier);
  await ownerEngine.updateInvitation(rescuerUpdated.invitation);

  const rescueResult = await ownerEngine.executeAction(rescueInvitation.invitationIdentifier, { broadcastTransaction: true });
  await saveInvitation(5, 'rescue', rescueResult.storedInvitation.invitation);
  log(`  rescue txid: ${rescueResult.builtTransaction.transactionHash}`);
  await waitForConfirmation(ownerEngine, nftVaultUtxoRescue.outpointTransactionHash, nftVaultUtxoRescue.outpointIndex, { label: 'rescue' });
  await waitForTxVisible(rescueResult.builtTransaction.transactionHash);

  log('\nDone. Invitations saved to', OUT_DIR);
}

main().catch((error) => {
  console.error(`FAILED: ${error?.message ?? error}`);
  if (error?.stack) console.error(error.stack);
  process.exit(1);
});
