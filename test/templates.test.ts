/**
 * The five reference templates, exercised in the Compact simulator.
 *
 * What these tests are for:
 *  - every template emits exactly the declarations MIP-0018 prescribes (MIP PR #325,
 *    `mips/mip-0018-on-chain-token-metadata.md` @ `37a3471`) on the UC-1 layout, with
 *    the right kind byte and MIP Appendix A's val-type per key — and ONE declaration
 *    per call (UC-1: one package, one declaration, one intent);
 *  - the colour an outside observer derives from `(domainSep, address)` equals
 *    the colour the contract mints — the check the indexer performs (spec §6.4)
 *    and MIP-0011/0014's mandatory re-derivation;
 *  - the mint effects a scanner reads from a transcript appear where expected,
 *    and a ledger token produces none at all;
 *  - access control holds: only the holder of the emitter secret can emit
 *    (spec 00024 Q12), and only the owner can mint a ledger token.
 */
import { describe, expect, it } from 'vitest';
import {
  CompactTypeBytes,
  CompactTypeVector,
  persistentCommit,
  persistentHash,
} from '@midnight-ntwrk/compact-runtime';
import { Contract as NativeShielded, ledger as shieldedLedger } from '../contracts/managed/NativeShieldedToken/contract/index.js';
import { Contract as NativeUnshielded } from '../contracts/managed/NativeUnshieldedToken/contract/index.js';
import { Contract as NativeDual } from '../contracts/managed/NativeDualToken/contract/index.js';
import { Contract as Collection } from '../contracts/managed/ShieldedCollection/contract/index.js';
import { Contract as LedgerTokenContract } from '../contracts/managed/LedgerToken/contract/index.js';
import {
  EVENT_NAME,
  KIND_LEDGER_FLAG,
  KIND_SHIELDED,
  KIND_UNSHIELDED,
  ONE_PART_VALUE_SIZE,
  STRANGER_EMITTER_SECRET,
  TEST_EMITTER_SECRET,
  VAL_TYPE_INTEGER,
  VAL_TYPE_JSON,
  VAL_TYPE_STRING,
  VAL_TYPE_URI,
  decodeInteger,
  deploy,
  emitterSecretHashOf,
  emitterWitnesses,
  encodeInteger,
  hex,
  pad,
  validateTokenMetadataEvent,
} from './token-metadata.js';

// --------------------------------------------------------------------------
// helpers
// --------------------------------------------------------------------------

type State = { emitterSecret: Uint8Array; secretKey: Uint8Array };

const BYTES32 = new CompactTypeBytes(32);
const VECTOR2_BYTES32 = new CompactTypeVector(2, BYTES32);
const DERIVE_TOKEN = pad(32, 'midnight:derive_token');

const OWNER_SK = new Uint8Array(32).fill(7);
const STRANGER_SK = new Uint8Array(32).fill(9);
const EMITTER_HASH = emitterSecretHashOf(TEST_EMITTER_SECRET);

/** OpenZeppelin `Utils.computeAccountId`: `persistentHash<Vector<1,Bytes<32>>>([sk])`. */
function accountId(secretKey: Uint8Array): Uint8Array {
  return persistentHash(new CompactTypeVector(1, BYTES32), [secretKey]);
}

function ownerOf(secretKey: Uint8Array) {
  return { is_left: true, left: accountId(secretKey), right: { bytes: new Uint8Array(32) } };
}

/** The emitter secret for every template, plus the OpenZeppelin keys `LedgerToken` reads. */
const witnesses = {
  ...emitterWitnesses,
  wit_OwnableSK: ({ privateState }: { privateState: State }): [State, Uint8Array] => [
    privateState,
    privateState.secretKey,
  ],
  wit_FungibleTokenSK: ({ privateState }: { privateState: State }): [State, Uint8Array] => [
    privateState,
    privateState.secretKey,
  ],
};

const emitter: State = { emitterSecret: TEST_EMITTER_SECRET, secretKey: OWNER_SK };
const stranger: State = { emitterSecret: STRANGER_EMITTER_SECRET, secretKey: STRANGER_SK };

/**
 * What an outside observer computes from a transaction alone:
 * `persistentCommit([domainSep, address], pad(32, "midnight:derive_token"))`
 * (coin-structure `contract.rs`, and the standard library's `tokenType`).
 */
function deriveColor(domainSep: Uint8Array, contractAddress: string): Uint8Array {
  const addressBytes = Uint8Array.from(Buffer.from(contractAddress, 'hex'));
  return persistentCommit(VECTOR2_BYTES32, [domainSep, addressBytes], DERIVE_TOKEN);
}

/** UTF-8 byte length — not the character count, which is what `len` must carry. */
function byteLen(text: string): bigint {
  return BigInt(new TextEncoder().encode(text).length);
}

/** The one-part value field (188 bytes, UC-1) with `bytes` in its meaningful prefix. */
function value188(bytes: Uint8Array | string): Uint8Array {
  const out = new Uint8Array(ONE_PART_VALUE_SIZE);
  out.set(typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes);
  return out;
}

/** The setter arguments of MIP Appendix A's three core fields, one declaration each. */
function standardFields(name: string, symbol: string, decimals: number): [Uint8Array, bigint, bigint, Uint8Array][] {
  return [
    [pad(32, 'name'), BigInt(VAL_TYPE_STRING), byteLen(name), value188(name)],
    [pad(32, 'symbol'), BigInt(VAL_TYPE_STRING), byteLen(symbol), value188(symbol)],
    // decimals is `Uint<128>` (MIP Appendix A's recommended width): val-len 16, little-endian.
    [pad(32, 'decimals'), BigInt(VAL_TYPE_INTEGER), 16n, value188(encodeInteger(BigInt(decimals)))],
  ];
}

const zswapRecipient = (label: string) => ({
  is_left: true,
  left: { bytes: pad(32, label) },
  right: { bytes: new Uint8Array(32) },
});

const userRecipient = (label: string) => ({
  is_left: false,
  left: { bytes: new Uint8Array(32) },
  right: { bytes: pad(32, label) },
});

const account = (label: string) => ({
  is_left: true,
  left: pad(32, label),
  right: { bytes: new Uint8Array(32) },
});

/** The mint effect maps a scanner reads out of a transcript. */
const mintValues = (effects: any, which: 'shieldedMints' | 'unshieldedMints') =>
  [...(effects[which]?.values() ?? [])];

// --------------------------------------------------------------------------
// NativeShieldedToken — spec §7.1 rows 4-6 (Shielded Star / Nebula / Ghost)
// --------------------------------------------------------------------------

const SSTAR_DOMAIN = pad(32, 'umbra:sstar');

async function shieldedToken(state: State = emitter) {
  return deploy<State>(new NativeShielded<State>(witnesses), state, [
    EMITTER_HASH,
    SSTAR_DOMAIN,
    'Shielded Star',
    'SSTAR',
    6n,
  ]);
}

describe('NativeShieldedToken', () => {
  it('stores the emitter-secret hash the constructor was given', async () => {
    const c = await shieldedToken();
    expect(hex(shieldedLedger(c.state as never).TM_emitterSecretHash)).toBe(hex(EMITTER_HASH));
  });

  it('publishes name, symbol and decimals as three calls, one shielded-kind declaration each', async () => {
    const c = await shieldedToken();
    const declarations = [];
    for (const args of standardFields('Shielded Star', 'SSTAR', 6)) {
      const { events, packages } = await c.call('setMetadata', ...args);
      // UC-1: one call (one intent) = one package = one declaration.
      expect(events).toHaveLength(1);
      expect(packages).toHaveLength(1);
      declarations.push(packages[0]!);
    }

    expect(declarations.map((e) => e.keyText)).toEqual(['name', 'symbol', 'decimals']);
    expect(declarations.slice(0, 2).map((e) => e.valueText)).toEqual(['Shielded Star', 'SSTAR']);
    for (const event of declarations) {
      expect(event.eventName).toBe(EVENT_NAME);
      expect(event.kind).toBe(KIND_SHIELDED);
      expect(hex(event.domainSep)).toBe(hex(SSTAR_DOMAIN));
      expect(event.payload).toHaveLength(256);
      expect(event.parts).toBe(1);
      expect(validateTokenMetadataEvent(event)).toEqual({ outcome: 'accepted' });
    }
    expect(declarations.map((e) => e.valType)).toEqual([VAL_TYPE_STRING, VAL_TYPE_STRING, VAL_TYPE_INTEGER]);
    // decimals: val-len 16 as a little-endian Uint<16> (0x10 0x00), the number in the low byte.
    expect([declarations[2]!.payload[66], declarations[2]!.payload[67]]).toEqual([16, 0]);
    expect(hex(declarations[2]!.valueBytes)).toBe('06000000000000000000000000000000');
    expect(decodeInteger(declarations[2]!.valueBytes)).toBe(6n);
  });

  it('refuses a one-part value longer than 188 bytes', async () => {
    const c = await shieldedToken();
    await expect(
      c.call('setMetadata', pad(32, 'description'), BigInt(VAL_TYPE_STRING), 189n, value188('x')),
    ).rejects.toThrow(/at most 188 bytes/);
  });

  it('mints the colour an outside observer derives from (domainSep, address)', async () => {
    const c = await shieldedToken();
    const { result: circuitColor } = await c.call('tokenColor');
    const derived = deriveColor(SSTAR_DOMAIN, c.address);
    expect(hex(circuitColor as Uint8Array)).toBe(hex(derived));

    const nonce = pad(32, 'sstar-mint-1');
    const { result, effects } = await c.call('mint', zswapRecipient('holder-1'), 5_000_000n, nonce);
    const coin = result as { nonce: Uint8Array; color: Uint8Array; value: bigint };
    expect(hex(coin.color)).toBe(hex(derived));
    expect(coin.value).toBe(5_000_000n);
    expect(mintValues(effects, 'shieldedMints')).toEqual([5_000_000n]);
    expect(mintValues(effects, 'unshieldedMints')).toEqual([]);
  });

  it('lets the emitter update a key and nobody else', async () => {
    const c = await shieldedToken();
    const { events } = await c.call(
      'setMetadata',
      pad(32, 'name'),
      BigInt(VAL_TYPE_STRING),
      byteLen('Shielded Star!'),
      value188('Shielded Star!'),
    );
    expect(events).toHaveLength(1);
    expect(events[0].keyText).toBe('name');
    expect(events[0].valType).toBe(VAL_TYPE_STRING);
    expect(events[0].len).toBe(14);
    expect(events[0].valueText).toBe('Shielded Star!');
    expect(events[0].kind).toBe(KIND_SHIELDED);

    const intruder = await shieldedToken(stranger);
    await expect(
      intruder.call('setMetadata', pad(32, 'name'), BigInt(VAL_TYPE_STRING), 4n, value188('mine')),
    ).rejects.toThrow(/not the emitter/);
  });

  it('keeps the OpenZeppelin metadata circuits working beside the events', async () => {
    const c = await shieldedToken();
    expect((await c.call('name')).result).toBe('Shielded Star');
    expect((await c.call('symbol')).result).toBe('SSTAR');
    expect((await c.call('decimals')).result).toBe(6n);
    expect(hex((await c.call('domainSep')).result as Uint8Array)).toBe(hex(SSTAR_DOMAIN));
  });
});

// --------------------------------------------------------------------------
// NativeUnshieldedToken — spec §7.1 rows 7-9 and the "Ledger Liar" row 12
// --------------------------------------------------------------------------

const UCOM_DOMAIN = pad(32, 'umbra:ucom');

async function unshieldedToken(kind = KIND_UNSHIELDED, state: State = emitter) {
  return deploy<State>(new NativeUnshielded<State>(witnesses), state, [EMITTER_HASH, UCOM_DOMAIN, 6n, BigInt(kind)]);
}

describe('NativeUnshieldedToken', () => {
  it('publishes with the unshielded kind byte and mints an unshielded effect', async () => {
    const c = await unshieldedToken();
    const declared = [];
    for (const args of standardFields('Unshielded Comet', 'UCOM', 6)) {
      declared.push(...(await c.call('setMetadata', ...args)).packages);
    }
    expect(declared.map((e) => e.keyText)).toEqual(['name', 'symbol', 'decimals']);
    expect(declared.every((e) => e.kind === KIND_UNSHIELDED)).toBe(true);
    expect(declared[0]!.valueText).toBe('Unshielded Comet');

    const { result, effects } = await c.call('mint', userRecipient('holder-2'), 1_000n);
    expect(hex(result as Uint8Array)).toBe(hex(deriveColor(UCOM_DOMAIN, c.address)));
    expect(mintValues(effects, 'unshieldedMints')).toEqual([1_000n]);
    expect(mintValues(effects, 'shieldedMints')).toEqual([]);
  });

  it('rejects a zero amount and a zero recipient', async () => {
    const c = await unshieldedToken();
    await expect(c.call('mint', userRecipient('holder-2'), 0n)).rejects.toThrow(/positive/);
    await expect(
      c.call(
        'mint',
        { is_left: false, left: { bytes: new Uint8Array(32) }, right: { bytes: new Uint8Array(32) } },
        1n,
      ),
    ).rejects.toThrow(/invalid recipient/);
  });

  it('can be deployed as the Ledger Liar: describes kind 2, mints kind 0', async () => {
    const c = await unshieldedToken(KIND_LEDGER_FLAG);
    const declared = [];
    for (const args of standardFields('Ledger Liar', 'LLIAR', 6)) {
      declared.push(...(await c.call('setMetadata', ...args)).packages);
    }
    expect(declared.every((e) => e.kind === KIND_LEDGER_FLAG)).toBe(true);
    expect(declared.every((e) => validateTokenMetadataEvent(e).outcome === 'accepted')).toBe(true);

    // ...and it still mints for real. Under MIP section 4 the full kind byte is
    // the identity, so this is not a contradiction to flag: it is two rows, an
    // observed kind-0 one without a name and a declared kind-2 one with one
    // (MIP sections 6.3 and 7.2). The mint is never hidden by the declaration.
    const { effects } = await c.call('mint', userRecipient('holder-3'), 42n);
    expect(mintValues(effects, 'unshieldedMints')).toEqual([42n]);
  });

  it('refuses a stranger’s declaration', async () => {
    const c = await unshieldedToken(KIND_UNSHIELDED, stranger);
    await expect(
      c.call('setMetadata', pad(32, 'name'), BigInt(VAL_TYPE_STRING), 4n, value188('mine')),
    ).rejects.toThrow(/not the emitter/);
  });
});

// --------------------------------------------------------------------------
// NativeDualToken — spec §7.1 row 10 (Dual Aurora)
// --------------------------------------------------------------------------

const DAUR_DOMAIN = pad(32, 'umbra:daur');

async function dualToken(state: State = emitter) {
  return deploy<State>(new NativeDual<State>(witnesses), state, [EMITTER_HASH, DAUR_DOMAIN, 6n]);
}

describe('NativeDualToken', () => {
  it('describes each kind separately, one declaration per call', async () => {
    const c = await dualToken();
    const unshielded = [];
    const shielded = [];
    for (const args of standardFields('Dual Aurora', 'DAUR', 6)) {
      unshielded.push(...(await c.call('setMetadata', BigInt(KIND_UNSHIELDED), ...args)).packages);
      shielded.push(...(await c.call('setMetadata', BigInt(KIND_SHIELDED), ...args)).packages);
    }

    expect(unshielded).toHaveLength(3);
    expect(shielded).toHaveLength(3);
    expect(unshielded.every((e) => e.kind === KIND_UNSHIELDED)).toBe(true);
    expect(shielded.every((e) => e.kind === KIND_SHIELDED)).toBe(true);
    // One domain separator, so one colour value, described twice.
    expect(hex(unshielded[0]!.domainSep)).toBe(hex(shielded[0]!.domainSep));
  });

  it('mints one colour in two value domains', async () => {
    const c = await dualToken();
    const expected = deriveColor(DAUR_DOMAIN, c.address);
    expect(hex((await c.call('tokenColor')).result as Uint8Array)).toBe(hex(expected));

    const shielded = await c.call('mintShielded', zswapRecipient('holder-4'), 10n, pad(32, 'daur-1'));
    expect(hex((shielded.result as { color: Uint8Array }).color)).toBe(hex(expected));
    expect(mintValues(shielded.effects, 'shieldedMints')).toEqual([10n]);

    const unshielded = await c.call('mintUnshielded', userRecipient('holder-5'), 20n);
    expect(hex(unshielded.result as Uint8Array)).toBe(hex(expected));
    expect(mintValues(unshielded.effects, 'unshieldedMints')).toEqual([20n]);
  });

  it('updates one kind at a time, emitter only', async () => {
    const c = await dualToken();
    const { events } = await c.call(
      'setMetadata',
      BigInt(KIND_SHIELDED),
      pad(32, 'description'),
      BigInt(VAL_TYPE_STRING),
      6n,
      value188('aurora'),
    );
    expect(events[0].kind).toBe(KIND_SHIELDED);
    expect(events[0].keyText).toBe('description');
    expect(events[0].valueText).toBe('aurora');

    const intruder = await dualToken(stranger);
    await expect(
      intruder.call('setMetadata', BigInt(KIND_SHIELDED), pad(32, 'name'), BigInt(VAL_TYPE_STRING), 1n, value188('x')),
    ).rejects.toThrow(/not the emitter/);
  });
});

// --------------------------------------------------------------------------
// ShieldedCollection — spec §7.1 row 11 (Constellations)
// --------------------------------------------------------------------------

const PIECES = ['orion', 'lyra', 'cygnus'] as const;

async function collection(state: State = emitter) {
  return deploy<State>(new Collection<State>(witnesses), state, [EMITTER_HASH, 'Constellations', 'CNST', 0n]);
}

describe('ShieldedCollection', () => {
  it('gives every piece its own colour at one address', async () => {
    const c = await collection();
    const colors: string[] = [];

    for (const piece of PIECES) {
      const domain = pad(32, `cnst:${piece}`);
      const derived = deriveColor(domain, c.address);
      expect(hex((await c.call('tokenColor', domain)).result as Uint8Array)).toBe(hex(derived));

      const { result, effects } = await c.call(
        'mintPiece',
        domain,
        zswapRecipient(`collector-${piece}`),
        pad(32, `cnst:${piece}:1`),
      );
      const coin = result as { color: Uint8Array; value: bigint };
      expect(hex(coin.color)).toBe(hex(derived));
      expect(coin.value).toBe(1n); // one of each piece
      expect(mintValues(effects, 'shieldedMints')).toEqual([1n]);
      colors.push(hex(coin.color));
    }

    expect(new Set(colors).size).toBe(PIECES.length);
    expect((await c.call('mintedPieces')).result).toBe(BigInt(PIECES.length));
  });

  it('describes a piece with its own name and the family symbol and decimals, one call each', async () => {
    const c = await collection();
    const domain = pad(32, 'cnst:orion');
    const pieceName = 'Constellations · Orion'; // the middle dot is 2 UTF-8 bytes
    const declared = [];
    for (const args of standardFields(pieceName, 'CNST', 0)) {
      declared.push(...(await c.call('setPieceTrait', domain, ...args)).packages);
    }

    expect(declared).toHaveLength(3);
    expect(declared.map((e) => e.keyText)).toEqual(['name', 'symbol', 'decimals']);
    expect(declared[0]!.valueText).toBe(pieceName);
    expect(declared[1]!.valueText).toBe('CNST');
    // 0 decimals as `Uint<128>`: sixteen NUL bytes, val-len 16.
    expect(declared[2]!.len).toBe(16);
    expect(declared[2]!.valueBytes).toHaveLength(16);
    expect(decodeInteger(declared[2]!.valueBytes)).toBe(0n);
    expect(declared.map((e) => e.valType)).toEqual([VAL_TYPE_STRING, VAL_TYPE_STRING, VAL_TYPE_INTEGER]);
    expect(declared.every((e) => hex(e.domainSep) === hex(domain))).toBe(true);
    expect(declared.every((e) => e.kind === KIND_SHIELDED)).toBe(true);
  });

  it('carries the tokenUri and arbitrary traits per piece, emitter only', async () => {
    const c = await collection();
    const domain = pad(32, 'cnst:orion');
    const uri = 'http://localhost:10020/constellations/orion';

    const published = await c.call(
      'setPieceTrait',
      domain,
      pad(32, 'tokenUri'),
      BigInt(VAL_TYPE_URI),
      byteLen(uri),
      value188(uri),
    );
    expect(published.events[0].keyText).toBe('tokenUri');
    expect(published.events[0].valType).toBe(VAL_TYPE_URI);
    expect(published.events[0].valueText).toBe(uri);

    // EIP-7496 dynamic trait: the last write is the one that counts.
    // Q6: magnitude is a decimal with a fraction, so it travels as text (type 1).
    const first = await c.call('setPieceTrait', domain, pad(32, 'magnitude'), BigInt(VAL_TYPE_STRING), 4n, value188('1.25'));
    const second = await c.call('setPieceTrait', domain, pad(32, 'magnitude'), BigInt(VAL_TYPE_STRING), 4n, value188('0.50'));
    expect(first.events[0].valueText).toBe('1.25');
    expect(second.events[0].valueText).toBe('0.50');
    expect(first.events[0].valType).toBe(VAL_TYPE_STRING);

    // A JSON trait travels as val-type 3 and must still parse as an object.
    const json = '{"collection":"Constellations"}';
    const meta = await c.call(
      'setPieceTrait',
      domain,
      pad(32, 'metadata'),
      BigInt(VAL_TYPE_JSON),
      byteLen(json),
      value188(json),
    );
    expect(meta.events[0].valType).toBe(VAL_TYPE_JSON);
    expect(JSON.parse(meta.events[0].valueText)).toEqual({ collection: 'Constellations' });
    expect(validateTokenMetadataEvent(meta.events[0])).toEqual({ outcome: 'accepted' });

    const intruder = await collection(stranger);
    await expect(
      intruder.call('setPieceTrait', domain, pad(32, 'magnitude'), BigInt(VAL_TYPE_STRING), 1n, value188('9')),
    ).rejects.toThrow(/not the emitter/);
  });
});

// --------------------------------------------------------------------------
// LedgerToken — spec §7.1 rows 1-2 (Ledger Sun / Ledger Moon)
// --------------------------------------------------------------------------

const LSUN_DOMAIN = pad(32, 'umbra:lsun');

async function ledgerToken(state: State = emitter) {
  return deploy<State>(new LedgerTokenContract<State>(witnesses as never), state, [
    EMITTER_HASH,
    ownerOf(OWNER_SK),
    LSUN_DOMAIN,
    'Ledger Sun',
    'LSUN',
    6n,
  ]);
}

describe('LedgerToken', () => {
  it('publishes with the ledger kind byte — the only way this token can be seen', async () => {
    const c = await ledgerToken();
    const declared = [];
    for (const args of standardFields('Ledger Sun', 'LSUN', 6)) {
      const { packages, effects } = await c.call('setMetadata', ...args);
      declared.push(...packages);
      // Nothing is minted at the protocol level, ever.
      expect(mintValues(effects, 'shieldedMints')).toEqual([]);
      expect(mintValues(effects, 'unshieldedMints')).toEqual([]);
    }

    expect(declared).toHaveLength(3);
    expect(declared.every((e) => e.kind === KIND_LEDGER_FLAG)).toBe(true);
    expect(declared[0]!.valueText).toBe('Ledger Sun');
    expect(hex(declared[0]!.domainSep)).toBe(hex(LSUN_DOMAIN));
  });

  it('moves balances in contract state and produces no mint effect', async () => {
    const c = await ledgerToken();
    const holder = accountId(OWNER_SK);
    const owner = { is_left: true, left: holder, right: { bytes: new Uint8Array(32) } };

    const minted = await c.call('mint', owner, 1_000_000n);
    expect(mintValues(minted.effects, 'unshieldedMints')).toEqual([]);
    expect((await c.call('totalSupply')).result).toBe(1_000_000n);
    expect((await c.call('balanceOf', owner)).result).toBe(1_000_000n);

    const moved = await c.call('transfer', account('recipient'), 250_000n);
    expect(moved.result).toBe(true);
    expect(moved.events).toHaveLength(0);
    expect(mintValues(moved.effects, 'unshieldedMints')).toEqual([]);
    expect((await c.call('balanceOf', owner)).result).toBe(750_000n);
    expect((await c.call('balanceOf', account('recipient'))).result).toBe(250_000n);
  });

  it('renames itself through an emitter-only declaration; minting stays owner-only', async () => {
    const c = await ledgerToken();
    const renamed = 'Ledger Moon (renamed)';
    const { events } = await c.call(
      'setMetadata',
      pad(32, 'name'),
      BigInt(VAL_TYPE_STRING),
      byteLen(renamed),
      value188(renamed),
    );
    expect(events[0].valueText).toBe(renamed);
    expect(events[0].kind).toBe(KIND_LEDGER_FLAG);

    const intruder = await ledgerToken(stranger);
    await expect(
      intruder.call('setMetadata', pad(32, 'name'), BigInt(VAL_TYPE_STRING), 4n, value188('mine')),
    ).rejects.toThrow(/not the emitter/);
    await expect(intruder.call('mint', account('x'), 1n)).rejects.toThrow(/not the owner/);
  });
});
