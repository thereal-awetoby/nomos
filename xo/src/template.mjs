// Nomos as an XO template (BCH BLAZE "Build with XO" bounty).
//
// Actions on an existing Nomos vault:
//   pay      (owner or agent)    pay from the vault, within the daily limit and allowlist
//   topUp    (anyone)            add BCH to the vault
//   withdraw (owner)             take the vault's NFT and BCH back (the contract's setMandate path)
//   rescue   (owner + rescuer)   emergency sweep that needs BOTH keys. The Nomos web app can't
//                                collect two signatures over one wallet connection; an XO
//                                invitation passes the transaction between the two signers.
//
// The vault itself is created in the Nomos app (or contracts/test/mint-nft.mjs): its state NFT's
// category must be the txid of a vout-0 coin, which a template can't pick.
//
// The contract bytecode is read from contracts/NomosVault.cash at build time, so the template always
// locks to the contract the chipnet tests cover; xo/test/xo.test.mjs checks every script against
// CashScript byte for byte.
//
// Conventions follow how @xo-cash/engine passes variables to the compiler: integers and satoshi
// amounts become minimal VM numbers, hex strings become their bytes as written. Token categories are
// in display order, as wallets show them.

/** CashScript 0.11 redeem script: constructor arguments pushed in reverse order, then the bytecode. */
const redeem = (bytecodeHex) => [
  '<rescuePublicKey>',
  '<allowedPkh5> <allowedPkh4> <allowedPkh3> <allowedPkh2> <allowedPkh1>',
  '<allowlistEnabled> <dailyLimitSatoshis>',
  '<agentPublicKey> <ownerPublicKey>',
  `0x${bytecodeHex}`,
].join(' ');

// "Today" as the contract sees it: tx.locktime / 86400 (plain ops, no nested evaluation:
// XO's evaluator mis-sizes a $() nested inside another $()).
const TODAY = '<locktime> <86400> OP_DIV';

// spentToday that the covenant counts: the stored value if the stored day is today, else 0.
// vaultCommitment = spentToday (8 bytes LE) || dayMarker (8 bytes LE)
// stack: spentBytes dayBytes -> spentBytes isToday -> isToday spent -> isToday*spent
const EFFECTIVE_SPENT = `<vaultCommitment> <8> OP_SPLIT OP_BIN2NUM ${TODAY} OP_NUMEQUAL OP_SWAP OP_BIN2NUM OP_MUL`;

const VAULT_VARIABLES = [
  'ownerPublicKey', 'agentPublicKey', 'dailyLimitSatoshis', 'allowlistEnabled',
  'allowedPkh1', 'allowedPkh2', 'allowedPkh3', 'allowedPkh4', 'allowedPkh5', 'rescuePublicKey',
  'vaultCategory',
];
const VAULT_STATE = [...VAULT_VARIABLES, 'vaultSatoshis', 'vaultCommitment'];

export function buildNomosTemplate(vaultBytecodeHex) {
  const scripts = {
    nomosRedeem: redeem(vaultBytecodeHex),

    // spend(sig spenderSig, pubkey spenderPk, int amount) is function 0; arguments pushed in reverse.
    unlockPay: '<amountSatoshis> <spenderKey.public_key> <spenderKey.schnorr_signature.all_outputs> <0> <nomosRedeem>',
    // setMandate(sig ownerSig) is function 1: only the owner's signature, no covenant on the outputs.
    unlockWithdraw: '<ownerKey.schnorr_signature.all_outputs> <1> <nomosRedeem>',
    // rescue(sig ownerSig, sig rescueSig) is function 2.
    unlockRescue: '<rescueKey.schnorr_signature.all_outputs> <ownerKey.schnorr_signature.all_outputs> <2> <nomosRedeem>',

    // ---- State ----
    payLocktime: '<locktime>',
    effectiveSpentToday: EFFECTIVE_SPENT,
    newSpentToday: `${EFFECTIVE_SPENT} <amountSatoshis> OP_ADD`,
    // The NFT commitment the covenant demands on output 0 after a payment.
    newCommitment: `${EFFECTIVE_SPENT} <amountSatoshis> OP_ADD <8> OP_NUM2BIN ${TODAY} <8> OP_NUM2BIN OP_CAT`,
    remainingToday: `<dailyLimitSatoshis> ${EFFECTIVE_SPENT} OP_SUB`,

    // ---- Amounts ----
    payVaultSatoshis: '<vaultSatoshis> <amountSatoshis> OP_SUB <minerFeeSatoshis> OP_SUB',
    withdrawSatoshis: '<vaultSatoshis> <minerFeeSatoshis> OP_SUB',

    // ---- Destinations chosen by participants ----
    payeeLocking: '$(<payeeLockingScript>)',
    returnLocking: '$(<returnLockingScript>)',
  };

  const vaultToken = (commitment) => ({
    category: '$(<vaultCategory>)', amount: 0n, nft: { capability: 'mutable', commitment },
  });

  return {
    $schema: 'https://libauth.org/schemas/wallet-template-v0.schema.json',
    name: 'Nomos',
    description: 'A spend mandate for Bitcoin Cash: BCH in a covenant that pays only within a daily limit and to allowed addresses. The chain refuses anything else.',
    icon: 'shield',
    version: '1',
    supported: ['BCH_2025_05', 'BCH_2026_05'],

    resources: [
      { name: 'Nomos source', description: 'The covenant, app and tests.', url: 'https://github.com/thereal-awetoby/nomos' },
      { name: 'Live app', description: 'Create a vault and pay under your mandate.', url: 'https://nomos.asgaya.org/' },
    ],

    roles: {
      spender: { name: 'Spender', description: 'The vault owner or its agent. Pays within the mandate.', icon: 'user' },
      owner: { name: 'Owner', description: 'Owns the vault. Can withdraw it, and rescue it with the co-signer.', icon: 'user' },
      rescuer: { name: 'Rescue co-signer', description: 'Second key for emergency rescues, together with the owner.', icon: 'lifebuoy' },
      funder: { name: 'Funder', description: 'Anyone adding BCH to a vault.', icon: 'coins' },
    },

    start: [
      { action: 'pay', role: 'spender' },
      { action: 'topUp', role: 'funder' },
      { action: 'withdraw', role: 'owner' },
      { action: 'rescue', role: 'owner' },
    ],

    actions: {
      pay: {
        name: 'Pay under mandate',
        description: 'Pay $(<amountSatoshis>) satoshis from the vault. Allowed today: $(remainingToday) satoshis. Over the limit, the network refuses the transaction.',
        icon: 'send',
        roles: {
          spender: {
            requirements: {
              secrets: ['spenderKey'],
              variables: [...VAULT_STATE, 'amountSatoshis', 'payeeLockingScript', 'locktime', 'minerFeeSatoshis'],
            },
          },
        },
        requirements: { participants: [{ role: 'spender', slots: { min: 1, max: 1 } }] },
        transaction: 'payTransaction',
      },
      topUp: {
        name: 'Top up the vault',
        description: 'Send $(<topUpSatoshis>) satoshis to the vault. Only the owner can merge top-ups into payments.',
        icon: 'coins',
        roles: { funder: { requirements: { variables: [...VAULT_VARIABLES, 'topUpSatoshis'] } } },
        requirements: { participants: [{ role: 'funder', slots: { min: 1, max: 1 } }] },
        transaction: 'topUpTransaction',
      },
      withdraw: {
        name: 'Withdraw the vault',
        description: 'Take the vault NFT and $(withdrawSatoshis) satoshis back. Owner only.',
        icon: 'withdraw',
        roles: {
          owner: {
            requirements: {
              secrets: ['ownerKey'],
              variables: [...VAULT_STATE, 'returnLockingScript', 'minerFeeSatoshis'],
            },
          },
        },
        requirements: { participants: [{ role: 'owner', slots: { min: 1, max: 1 } }] },
        transaction: 'withdrawTransaction',
      },
      rescue: {
        name: 'Emergency rescue',
        description: 'Sweep $(withdrawSatoshis) satoshis out of the vault, ignoring the daily limit. Needs the owner AND the rescue co-signer.',
        icon: 'lifebuoy',
        roles: {
          owner: { requirements: { secrets: ['ownerKey'], variables: [...VAULT_STATE, 'returnLockingScript', 'minerFeeSatoshis'] } },
          rescuer: { requirements: { secrets: ['rescueKey'] } },
        },
        requirements: {
          participants: [
            { role: 'owner', slots: { min: 1, max: 1 } },
            { role: 'rescuer', slots: { min: 1, max: 1 } },
          ],
        },
        transaction: 'rescueTransaction',
      },
    },

    transactions: {
      payTransaction: {
        name: 'Paid under mandate',
        description: 'Paid $(<amountSatoshis>) satoshis. The vault now counts $(newSpentToday) satoshis spent today.',
        icon: 'send',
        version: 2,
        // The covenant reads "today" from the locktime; it must be a unix time below the chain's median time past.
        locktime: '$(payLocktime)',
        inputs: [{ input: 'vaultPayInput', inputIndex: 0 }],
        // Output order is fixed by the covenant: 0 = vault continues, 1 = the payment.
        outputs: [
          { output: 'vaultAfterPayOutput', outputIndex: 0 },
          { output: 'paymentOutput', outputIndex: 1 },
        ],
        composable: false,
      },
      topUpTransaction: {
        name: 'Vault topped up',
        description: 'Sent $(<topUpSatoshis>) satoshis to the vault.',
        icon: 'coins',
        version: 2,
        locktime: 0,
        inputs: [],
        outputs: [{ output: 'topUpOutput' }],
        composable: true,
      },
      withdrawTransaction: {
        name: 'Vault withdrawn',
        description: 'The vault NFT and its BCH are back in your wallet.',
        icon: 'withdraw',
        version: 2,
        locktime: 0,
        inputs: [{ input: 'vaultWithdrawInput', inputIndex: 0 }],
        outputs: [{ output: 'returnOutput', outputIndex: 0 }],
        composable: false,
      },
      rescueTransaction: {
        name: 'Vault rescued',
        description: 'Swept the vault with the owner and rescue co-signer.',
        icon: 'lifebuoy',
        version: 2,
        locktime: 0,
        inputs: [{ input: 'vaultRescueInput', inputIndex: 0 }],
        outputs: [{ output: 'returnOutput', outputIndex: 0 }],
        composable: false,
      },
    },

    inputs: {
      vaultPayInput: {
        name: 'Nomos vault', description: 'The vault coin with its state NFT.', icon: 'shield',
        valueSatoshis: '$(<vaultSatoshis>)', unlockingScript: 'unlockPay', token: vaultToken('$(<vaultCommitment>)'),
      },
      vaultWithdrawInput: {
        name: 'Nomos vault', description: 'The vault coin, going back to the owner.', icon: 'shield',
        valueSatoshis: '$(<vaultSatoshis>)', unlockingScript: 'unlockWithdraw', token: vaultToken('$(<vaultCommitment>)'),
      },
      vaultRescueInput: {
        name: 'Nomos vault', description: 'The vault coin, swept by owner + co-signer.', icon: 'shield',
        valueSatoshis: '$(<vaultSatoshis>)', unlockingScript: 'unlockRescue', token: vaultToken('$(<vaultCommitment>)'),
      },
    },

    outputs: {
      vaultAfterPayOutput: {
        name: 'Nomos vault', description: 'The vault continues with $(newSpentToday) satoshis spent today.', icon: 'shield',
        lockingScript: 'vault', valueSatoshis: '$(payVaultSatoshis)', token: vaultToken('$(newCommitment)'),
      },
      paymentOutput: {
        name: 'Payment', description: '$(<amountSatoshis>) satoshis to the payee.', icon: 'send',
        lockingScript: 'payee', valueSatoshis: '$(<amountSatoshis>)', token: null,
      },
      topUpOutput: {
        name: 'Nomos vault top-up', description: '$(<topUpSatoshis>) satoshis into the vault.', icon: 'coins',
        lockingScript: 'vault', valueSatoshis: '$(<topUpSatoshis>)', token: null,
      },
      returnOutput: {
        name: 'Back to you', description: 'The vault NFT and $(withdrawSatoshis) satoshis.', icon: 'withdraw',
        lockingScript: 'ownerReturn', valueSatoshis: '$(withdrawSatoshis)', token: vaultToken('$(<vaultCommitment>)'),
      },
    },

    lockingScripts: {
      vault: {
        name: 'Nomos vault',
        description: 'Pays only within the daily limit and allowlist; the network refuses anything else.',
        icon: 'shield',
        lockingType: 'p2sh',
        lockingBytecode: 'nomosRedeem',
        selectable: false,
        roles: {
          spender: {
            state: { variables: VAULT_STATE, secrets: ['spenderKey'] },
            actions: [{ action: 'pay', role: 'spender', secrets: [{ spenderKey: null }] }],
            balance: { satoshis: 0n },
          },
          owner: {
            state: { variables: VAULT_STATE, secrets: ['ownerKey'] },
            actions: [
              { action: 'withdraw', role: 'owner', secrets: [{ ownerKey: null }] },
              { action: 'rescue', role: 'owner', secrets: [{ ownerKey: null }] },
            ],
            balance: { satoshis: true },
          },
          rescuer: { state: { variables: VAULT_VARIABLES }, balance: { satoshis: 0n } },
          funder: { relevant: false },
        },
      },
      payee: {
        name: 'Payee', description: 'Who gets paid. Must be allowlisted if the vault has an allowlist.', icon: 'user',
        lockingType: 'p2s', lockingBytecode: 'payeeLocking', selectable: false,
      },
      ownerReturn: {
        name: 'Your wallet', description: 'Token-aware locking script for the vault NFT and BCH.', icon: 'user',
        lockingType: 'p2s', lockingBytecode: 'returnLocking', selectable: false,
      },
    },

    scripts,

    variables: {
      spenderKey: { name: 'Spender key', description: 'The vault owner key or agent key.', type: 'private_key' },
      ownerKey: { name: 'Owner key', description: 'The vault owner key.', type: 'private_key' },
      rescueKey: { name: 'Rescue key', description: 'The rescue co-signer key.', type: 'private_key' },
      ownerPublicKey: { name: 'Owner public key', description: 'Vault parameter: the owner (33 bytes).', type: 'public_key' },
      agentPublicKey: { name: 'Agent public key', description: 'Vault parameter: the agent, or 33 zero bytes for none.', type: 'public_key' },
      rescuePublicKey: { name: 'Rescue public key', description: 'Vault parameter: the rescue co-signer, or 33 zero bytes.', type: 'public_key' },
      dailyLimitSatoshis: { name: 'Daily limit', description: 'Vault parameter: most satoshis per UTC day.', type: 'satoshis' },
      allowlistEnabled: { name: 'Allowlist on', description: 'Vault parameter: 1 if payments are limited to the allowlist, else 0.', type: 'integer' },
      allowedPkh1: { name: 'Allowed payee 1', description: 'Vault parameter: P2PKH key hash (20 bytes), zeros if unused.', type: 'bytes' },
      allowedPkh2: { name: 'Allowed payee 2', description: 'Vault parameter: P2PKH key hash (20 bytes), zeros if unused.', type: 'bytes' },
      allowedPkh3: { name: 'Allowed payee 3', description: 'Vault parameter: P2PKH key hash (20 bytes), zeros if unused.', type: 'bytes' },
      allowedPkh4: { name: 'Allowed payee 4', description: 'Vault parameter: P2PKH key hash (20 bytes), zeros if unused.', type: 'bytes' },
      allowedPkh5: { name: 'Allowed payee 5', description: 'Vault parameter: P2PKH key hash (20 bytes), zeros if unused.', type: 'bytes' },
      vaultCategory: { name: 'Vault NFT', description: 'Token category of the vault state NFT (display order).', type: 'token_category' },
      vaultSatoshis: { name: 'Vault balance', description: 'Satoshis on the vault coin.', type: 'satoshis' },
      vaultCommitment: { name: 'Vault state', description: 'The state NFT commitment: spentToday (8 bytes LE) then dayMarker (8 bytes LE).', type: 'bytes' },
      amountSatoshis: { name: 'Amount', description: 'Satoshis to pay.', type: 'satoshis' },
      payeeLockingScript: { name: 'Pay to', description: 'Payee locking script (P2PKH if the allowlist is on).', type: 'locking_script' },
      locktime: { name: 'Payment time', description: 'Unix time for the transaction locktime, a few hours in the past so nodes accept it. Its UTC day is the day the limit counts against.', type: 'integer' },
      minerFeeSatoshis: { name: 'Network fee', description: 'Satoshis paid to miners. A payment may take at most 1,000 from the vault.', type: 'satoshis' },
      topUpSatoshis: { name: 'Top-up', description: 'Satoshis to add to the vault.', type: 'satoshis' },
      returnLockingScript: { name: 'Your address', description: 'Token-aware locking script for the vault NFT and BCH.', type: 'locking_script' },
    },
  };
}
