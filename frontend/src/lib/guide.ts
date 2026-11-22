/**
 * The user guide: every feature, step by step, in the words the screens use.
 * The Guide page shows all of it; the help button shows the sections for the
 * page it is opened on. In the text, **bold** marks a button or field as it
 * appears on screen, and [label](/path) links to a page.
 */

export interface GuideFlow {
  /** Who or what this sequence is for, when a section has more than one. */
  title?: string
  steps: string[]
}

export interface GuideSection {
  id: string
  title: string
  /** Pages whose help button shows this section. */
  routes: string[]
  summary: string
  needs?: string[]
  flows: GuideFlow[]
  /** What you see when it worked, or facts worth knowing. */
  notes?: string[]
  problems?: { q: string; a: string }[]
  open?: { label: string; to: string }
}

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'start',
    title: 'Before you start',
    routes: ['/guide'],
    summary: 'Nomos keeps your BCH in a vault with spending rules that every Bitcoin Cash node checks. Your wallet keeps your keys and signs everything; Nomos never holds your coins.',
    needs: [
      'A Bitcoin Cash wallet that connects with WizardConnect or BCH WalletConnect, such as Paytaca, Selene or Cashonize.',
      'Some BCH at the address your wallet shares. The smallest vault deposit is 2,000 sats (0.00002 BCH), plus a few hundred sats for each network fee.',
      'For the swap: PUSD on Bitcoin Cash, and a Base wallet (MetaMask, Rabby or Coinbase Wallet) holding the USDC you send and a little ETH for fees.',
      'For the Nostr link: a Nostr browser extension, nos2x or Alby.',
    ],
    flows: [{
      steps: [
        'Want to see the rules work first? Open the [Simulator](/simulate). It needs no wallet and sends nothing.',
        'Check the network switch at the top of the app. **Mainnet** uses real BCH. **Chipnet** is the test network, with free test BCH from a faucet.',
        'Press **Open app** on the home page to connect your wallet.',
      ],
    }],
    notes: [
      'Each network keeps its own vaults. The swap runs only on mainnet.',
      'Your vaults live on chain, but the list of your vaults and your activity live in this browser. Download a backup after you create a vault; see [Activity, backup and restore](/guide#activity).',
    ],
  },
  {
    id: 'connect',
    title: 'Connect your wallet',
    routes: ['/connect'],
    summary: 'Nomos reads your address and public key to build your vault. Your wallet signs every transaction, and nothing moves without your approval.',
    flows: [
      {
        title: 'With WizardConnect (recommended)',
        steps: [
          'Press **Connect with WizardConnect**. A QR code appears.',
          'In your wallet, open its WizardConnect scanner and scan the code.',
          'Approve the connection in your wallet. Nomos opens your vault, or **Create vault** if you have none yet.',
        ],
      },
      {
        title: 'With BCH WalletConnect',
        steps: [
          'Press **Connect with WalletConnect**. A QR code appears.',
          'Open WalletConnect in your wallet and scan it, or press **Copy pairing link** and paste the link into your wallet.',
          'Approve the connection, then sign the one message the wallet shows. It shares your public key; no funds move.',
        ],
      },
    ],
    notes: [
      'Nomos uses the one address your wallet shares. Keep the BCH and tokens you want to use at that address.',
      'To leave, press **Disconnect** at the bottom of the Vault page.',
    ],
    problems: [
      { q: 'It says "Reconnecting to your wallet…" and nothing happens', a: 'Nomos is waiting for the wallet you connected last time. Open that wallet, or press **start a new connection** to pair again.' },
      { q: 'I closed the QR code', a: 'Press **Show the QR code again** (or **Show the WalletConnect QR code again**).' },
      { q: 'I have no wallet yet', a: 'Install Paytaca, Selene or Cashonize, or try the [Simulator](/simulate) first.' },
    ],
    open: { label: 'Open Connect', to: '/connect' },
  },
  {
    id: 'create',
    title: 'Create a vault',
    routes: ['/mandate', '/vault'],
    summary: 'A vault is a Bitcoin Cash contract that holds your BCH. Its rules are part of the contract, so a payment that breaks them is rejected by the network, not just by this app.',
    flows: [{
      steps: [
        'After you connect, press **Create vault**.',
        'Enter a **Daily limit (BCH)**: the most the vault may pay in one day. 0.0001 BCH is 10,000 sats.',
        'Enter a **Deposit (BCH)**: what moves from your wallet into the vault now, at least 0.00002 BCH. The page shows the balance at your wallet\'s address.',
        'Optional: tick **Only pay up to 5 chosen addresses** and list them, one per line. Each can be a BCH address, an npub or a name@domain.',
        'Optional: add an **Agent key**, the public key (02… or 03…) of another wallet that may pay within the limit but cannot change the rules.',
        'Optional: add a **Rescue key**, a public key that can move everything out together with yours in an emergency.',
        'Check the preview of your rules, press **Create vault**, and approve the transaction in your wallet.',
        'Open [Activity](/activity#backup) and press **Download backup**, so you can find this vault again from any browser.',
      ],
    }],
    notes: [
      'The Vault page then shows the balance, the vault address and how much of today\'s limit is spent.',
    ],
    problems: [
      { q: 'It asks me to share my public key', a: 'Some wallets share only an address at first. Sign the short message it asks for; no funds move. If that fails, disconnect and connect again.' },
      { q: 'Not enough BCH', a: 'The deposit comes from the address your wallet shares. Send BCH to that address, then try again.' },
    ],
    open: { label: 'Open Rules', to: '/mandate' },
  },
  {
    id: 'fund',
    title: 'Add BCH to the vault',
    routes: ['/vault'],
    summary: 'Anyone can send BCH to a vault. Only payments out of it follow the rules.',
    flows: [{
      steps: [
        'On the Vault page, press **Copy** or **QR** next to **Vault address**.',
        'Send BCH to it from any wallet. For CashTokens, use the **Deposit address (token-aware)** instead.',
        'Press **Refresh** to see the new balance.',
      ],
    }],
    notes: [
      'Below 10,000 sats the page offers a top-up: the chipnet faucet on chipnet, or buying BCH person to person on Mercar.',
    ],
    open: { label: 'Open the vault', to: '/vault' },
  },
  {
    id: 'pay',
    title: 'Pay from the vault',
    routes: ['/pay', '/vault'],
    summary: 'Nomos checks each payment against your rules before your wallet signs it. The vault contract checks it again on every node.',
    flows: [{
      steps: [
        'Press **Pay**.',
        'Enter the **Amount (BCH)**, or press one of the quick amounts.',
        'Enter the **Destination**: a BCH address, an npub, or a name@domain.',
        'Read the **Rule check** under the form. "Within your rules." means the payment fits.',
        'Press **Pay** and approve the transaction in your wallet.',
      ],
    }],
    notes: [
      'When it is sent you see "Paid under mandate ✓" and **View on explorer**. The receipt appears in Activity, and today\'s spending goes up.',
      'For an npub or a name@domain, Nomos looks up the BCH address that person linked on Nostr. With **Only pay linked identities** on, it pays only an address linked by both keys.',
      'The daily limit starts again every day at 03:00 UTC.',
    ],
    open: { label: 'Open Pay', to: '/pay' },
  },
  {
    id: 'refused',
    title: 'When a payment is refused',
    routes: ['/pay', '/proof'],
    summary: 'A payment over today\'s limit, or to an address not on your allowlist, breaks the rules. Nomos stops it before your wallet signs, and if anyone signs and sends it anyway, every node rejects it.',
    flows: [
      {
        title: 'Fix the payment',
        steps: [
          'The rule check turns red and the button reads **Submit anyway · see refusal**.',
          'Press it to see why: the refusal shows the amount, what is left today and the destination.',
          'Press **Use what\'s left** to pay only what remains today, or **Change destination**.',
        ],
      },
      {
        title: 'See a node refuse it',
        steps: [
          'On the refusal, press **Check with a node**. The Proof checker opens with the amount and destination filled in.',
          'Tick the box that says you understand the signed transaction goes to a public node.',
          'Press **Send to node** and sign in your wallet. The node\'s answer is saved under **Saved checks** and added to the payment\'s receipt.',
        ],
      },
    ],
    notes: [
      'Use an amount above the whole daily limit, or an address outside the allowlist, so the refusal stays valid on later days too.',
    ],
    problems: [
      { q: 'What if the node accepts it?', a: 'Then it was within your rules and it pays. That is why the checker asks for an amount above the whole daily limit, or an address outside the allowlist.' },
    ],
    open: { label: 'Open the Proof checker', to: '/proof' },
  },
  {
    id: 'rules',
    title: 'Change the rules',
    routes: ['/mandate'],
    summary: 'Only the owner wallet can change the rules. The rules are part of the vault\'s contract, so new rules mean a new contract address.',
    flows: [{
      steps: [
        'On the Vault page, press **Edit** next to Rules.',
        'Change the daily limit, the allowlist, the agent key or the rescue key.',
        'Press **Save new rules** and approve in your wallet.',
      ],
    }],
    notes: [
      'The vault\'s BCH moves to the new address in that transaction, and today\'s spending starts again from zero.',
      'A wallet connected as the vault\'s agent cannot change rules; the page says so.',
    ],
    open: { label: 'Open Rules', to: '/mandate' },
  },
  {
    id: 'agent',
    title: 'Let an agent pay',
    routes: ['/mandate'],
    summary: 'An agent is another wallet, such as an app or a helper, that may pay from your vault within the daily limit. It can never change the rules or close the vault.',
    flows: [{
      steps: [
        'Get the agent wallet\'s public key (02… or 03…).',
        'Put it in **Agent key** when you create the vault, or later with **Save new rules**.',
        'In your browser, open [Activity](/activity#backup) and press **Download backup**.',
        'In the agent\'s browser, open Activity, press **Restore from backup** and choose that file.',
        'Connect the agent\'s wallet there. Nomos recognises it as the vault\'s agent and lets it pay within the limit.',
      ],
    }],
  },
  {
    id: 'close',
    title: 'Close the vault',
    routes: ['/mandate', '/vault'],
    summary: 'Closing sends everything in the vault back to the owner\'s address and ends its rules.',
    flows: [{
      steps: [
        'On the Vault page, press **Close vault and start over**.',
        'Press **Close vault**, then **Sign and close vault**, and approve in your wallet. **Keep the vault** cancels.',
      ],
    }],
    notes: [
      'All the BCH comes back to your wallet\'s address, minus a small network fee. You can then create a new vault.',
    ],
  },
  {
    id: 'rescue',
    title: 'Emergency rescue',
    routes: ['/rescue'],
    summary: 'A rescue moves the whole vault to one address and skips the daily limit. It needs both the owner key and the rescue key, and it cannot be undone.',
    needs: ['A vault made with a rescue key. Without one, add it in Rules first.'],
    flows: [{
      steps: [
        'On the Vault page, press **Emergency rescue**.',
        'Enter the **Sweep destination**: the address that receives everything.',
        'Tick "I understand this moves everything and skips the daily limit."',
        'Press **Sign rescue sweep** and approve in your wallet.',
      ],
    }],
    notes: [
      'The app can sign a rescue when the connected wallet also holds the rescue key. If the rescue key belongs to someone else, sign together with the XO template linked on the Rescue page.',
    ],
    open: { label: 'Open Rescue', to: '/rescue' },
  },
  {
    id: 'activity',
    title: 'Activity, backup and restore',
    routes: ['/activity'],
    summary: 'Every payment and refusal leaves a receipt in Activity. Your vaults and their rules are on chain, but the list of your vaults and this activity live only in this browser.',
    flows: [
      {
        title: 'Receipts',
        steps: [
          'Open **Activity** to see each payment and refusal, newest first.',
          'Open a receipt for its details: the rule check, the transaction and any node answer.',
          'Press **Export** to save your receipts as a JSON file.',
        ],
      },
      {
        title: 'Back up and restore',
        steps: [
          'Under **Back up this browser**, press **Download backup**. Do it after you create a vault or change its rules.',
          'In a new browser, or after clearing browsing data, open Activity, press **Restore from backup** and choose the file.',
          'The page reloads with your vaults and activity. Connect the owner wallet to use the vault.',
        ],
      },
    ],
    notes: [
      'Clearing browsing data deletes the list of your vaults and your activity. The coins stay safe in the vault; the backup is how this browser finds them again.',
      'A backup does not include swap secrets. Finish any swap you started before you clear browsing data.',
    ],
    open: { label: 'Open Activity', to: '/activity' },
  },
  {
    id: 'identity',
    title: 'Link your Nostr identity',
    routes: ['/identity'],
    summary: 'Tie your BCH address to your Nostr account, so people can pay you by your npub or name@domain. Both keys sign, so neither side can fake the link alone.',
    needs: [
      'Your BCH wallet connected.',
      'A Nostr extension in this browser: nos2x, or Alby with its setup finished.',
    ],
    flows: [{
      steps: [
        'Open **Nostr identity**. Under **Link your BCH address** there are three steps.',
        'Press **Read from extension** and choose Allow in your extension. Your private key never leaves it.',
        'Press **Sign in wallet**. Your BCH wallet signs a transaction back to yourself that carries your Nostr key. Only the network fee leaves your wallet.',
        'Press **Sign in extension**. Your extension signs a note that points to that transaction, and it goes to public relays.',
      ],
    }],
    notes: [
      'When all three are done you see "Linked by both keys". Anyone can now pay you by your npub in Pay, and check the link here.',
      '**Remove link** undoes it.',
    ],
    problems: [
      { q: 'The extension does not answer', a: 'Click its icon in the browser toolbar. It may be waiting for you to allow Nomos, or to finish its own setup.' },
      { q: '"No Nostr extension found"', a: 'Install nos2x or Alby, then reload the page.' },
    ],
    open: { label: 'Open Nostr identity', to: '/identity' },
  },
  {
    id: 'verify',
    title: 'Check a link, or prove it\'s you',
    routes: ['/identity'],
    summary: 'Anyone can check a link in their own browser, against Nostr relays and a BCH node. A fresh challenge shows the person in front of you really holds the keys.',
    flows: [
      {
        title: 'Check someone\'s link',
        steps: [
          'Open the **Verify a link** tab.',
          'Paste an npub, a name@domain or a BCH address and press **Verify link**.',
          '"Linked by both keys" means the Nostr note and the BCH transaction point at each other.',
        ],
      },
      {
        title: 'Prove it\'s you (two people)',
        steps: [
          'The person checking opens **Check a response**, presses **Copy challenge** and sends it to you.',
          'You open **Prove it\'s you**, paste it under **Challenge to answer**, and press **Answer with Nostr key** or **Answer with BCH wallet**.',
          'You send back the signed response. They paste it under **Signed response** and press **Check response**.',
        ],
      },
    ],
    notes: [
      'Answers expire after 10 minutes. To try it alone, copy the challenge from **Check a response** and answer it yourself.',
    ],
    open: { label: 'Open Nostr identity', to: '/identity' },
  },
  {
    id: 'swap',
    title: 'Swap PUSD and USDC',
    routes: ['/bridge'],
    summary: 'Trade PUSD on Bitcoin Cash for USDC on Base with another person. Both sides lock to the same secret. The offer creator\'s lock refunds after 24 hours and the counterparty\'s after 12, so if one side stops, the other gets their coins back.',
    needs: [
      'Mainnet. The swap does not run on chipnet.',
      'Your BCH wallet connected. If you send PUSD, the PUSD and a little BCH for fees must be at the address it shares.',
      'A Base wallet: MetaMask, Rabby or Coinbase Wallet in this browser, or a phone wallet over WalletConnect. It needs a little ETH on Base for fees, and the USDC if you send USDC.',
      'The same browser until the swap ends. The secret of an offer you make is kept only there.',
    ],
    flows: [
      {
        title: 'Connect both wallets',
        steps: [
          'Open **Swap PUSD and USDC**.',
          'Under **Your wallets**, press **Connect Bitcoin Cash wallet**, then **Browser wallet** (or **WalletConnect**) for Base.',
          'Check the balances next to each wallet. They show what the swap can use.',
        ],
      },
      {
        title: 'Make an offer',
        steps: [
          'In the offer form, set what **You send** and **You receive**. The arrow between them switches between PUSD to USDC and USDC to PUSD.',
          'To trade with one person, ask them to press **Copy my swap details** and send you the text. Paste it into **Their swap details** and press **Create offer**. The offer\'s page opens.',
          'To trade with anyone, leave **Their swap details** empty and press **Post to the offer board**. When someone takes it, press **Accept** under **Your posts**, then **Accepted: open the swap**.',
          'On the offer\'s page, follow **Progress**. You lock first: **Lock in your wallet** for PUSD, or **Approve and lock** for USDC, then approve in your wallet.',
          'For an offer to one person, press **Copy offer link** and send it to them. An offer from the board reaches the taker by itself.',
        ],
      },
      {
        title: 'Take an offer',
        steps: [
          'On the **Offer board**, press **Take this offer** and wait for the maker. When they accept, press **Accepted: open your swap**. With a link instead, paste it under **Got an offer link?** and press **Open offer**.',
          'The first step checks the other side\'s lock. Lock only when it shows a tick and "Lock found and matches the offer."',
          'Press **Lock in your wallet** (PUSD) or **Approve and lock** (USDC), and approve.',
          'Wait for the offer creator to claim. Keep the page open, or come back with the same link.',
        ],
      },
      {
        title: 'Claim',
        steps: [
          'The offer creator claims first, once the counterparty\'s lock has a tick: **Claim** for USDC on Base, or **Claim in your wallet** for PUSD on Bitcoin Cash. This reveals the secret.',
          'If the offer creator claimed PUSD, they press **Copy offer link** again and send the new link. It carries their claim.',
          'The counterparty presses **Find secret and claim**. To claim USDC, the page needs the other side\'s PUSD claim: open the new link, or paste that claim\'s transaction ID or explorer link into **PUSD claim transaction from the other side**. To claim PUSD there is nothing to paste; the page finds the secret on Base.',
          'When both sides have claimed, the page says **Swap complete**, and **Transactions** links to every step.',
        ],
      },
      {
        title: 'If the other side stops',
        steps: [
          'Open the same offer link. **Time limits** shows when each refund opens.',
          'When yours opens, **Refund available** appears. Press **Refund in your wallet** for PUSD, or **Refund** for USDC.',
        ],
      },
    ],
    notes: [
      'The offer creator must claim before the counterparty\'s refund opens. The page shows that deadline on the claim step.',
      'Never lock twice for one offer. If something looks wrong, press **Refresh** before you do anything else.',
    ],
    problems: [
      { q: '"The wallet holds 0 PUSD units" or "Not enough BCH in the wallet"', a: 'A lock uses only the address your wallet shares, shown under **Your wallets**. Send the PUSD to that address\'s token-aware form (it starts with z) and some BCH to the address itself. Some wallets, Selene for one, move coins between their own addresses when they send, so check **Your wallets** before you lock.' },
      { q: '"Paste the claim transaction ID" or "That transaction does not reveal this swap\'s secret"', a: 'That was not the other side\'s PUSD claim; it may be your own lock. Ask for the new offer link, or for the link to their claim transaction.' },
      { q: '**Approve and lock** or **Claim** fails on Base', a: 'The Base account needs a little ETH for fees. A USDC lock sends two transactions, an approval and the lock.' },
      { q: 'A step lost its tick, or a balance looks wrong', a: 'Press **Refresh**. A claimed lock is empty, so the page reads it from the transactions instead.' },
    ],
    open: { label: 'Open the swap', to: '/bridge' },
  },
  {
    id: 'proof',
    title: 'Proof checker',
    routes: ['/proof'],
    summary: 'Keeps the answers BCH nodes gave to spends that broke your rules. A rejected spend can never be mined, and anyone can send the same signed transaction to a node to see the same answer.',
    flows: [{
      steps: [
        'Start from a refused payment with **Check with a node**, or open the Proof checker and fill in **Amount (sats)** and **Destination**.',
        'Tick the box, press **Send to node**, and sign in your wallet.',
        'The node\'s answer is saved under **Saved checks**, with what it means.',
        'Press **Copy signed hex** to let someone send it to a node themselves, or **Copy JSON** and **Export** to keep the record.',
      ],
    }],
    notes: [
      'Already have a signed transaction? Press **Check signed hex instead** and paste it.',
    ],
    open: { label: 'Open the Proof checker', to: '/proof' },
  },
  {
    id: 'simulate',
    title: 'Try it without a wallet',
    routes: ['/simulate'],
    summary: 'The Simulator runs the vault\'s rules in your browser. Nothing is sent, and no wallet is needed.',
    flows: [{
      steps: [
        'Open the **Simulator**.',
        'Under **Budget**, set **Daily limit (sats)** and **Spent today (sats)**. Optionally turn on the allowlist and type an **Allowed destination**.',
        'Under **Try a payment**, enter an amount and a destination, then press **Try it**.',
        '**Results** shows whether the contract would accept the payment, and why. **Start a new day** sets today\'s spending back to zero.',
      ],
    }],
    open: { label: 'Open the Simulator', to: '/simulate' },
  },
  {
    id: 'more',
    title: 'Also on the site',
    routes: ['/architecture'],
    summary: 'The rest of the site explains how Nomos is built and how to check it.',
    flows: [{
      steps: [
        '[How it\'s built](/architecture) shows the parts of the system and the contracts behind each feature.',
        'The strip at the top of the home page is for the BCH BLAZE 2026 community vote. Its **Copy address** button copies the CashTokens address that receives votes for Nomos.',
        'Keyboard: press **?** for help on any page, and the keys listed there to jump between pages.',
      ],
    }],
  },
]

/** The sections the help button shows on a page. */
export function sectionsFor(pathname: string): GuideSection[] {
  return GUIDE_SECTIONS.filter((s) => s.routes.includes(pathname))
}
