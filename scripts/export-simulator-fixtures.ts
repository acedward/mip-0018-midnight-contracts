/**
 * Runs the MIP-18 set — `deployments/generated-matrix.json`, the `18` variant of every
 * row of `deployments/reference-set.json` (spec 00024 §6.A: LSUN18 … LLIAR18) — through
 * the Compact simulator and writes the bytes a token indexer must be able to parse.
 *
 *   npm run export:fixtures:simulator
 *
 * This is the OFFLINE counterpart of a deployment: no node, no indexer, no proof server,
 * no wallet — the COMPILED GENERATED CONTRACTS (the exact ones scripts/deploy-and-publish.ts
 * deploys) executed in process, one matrix step per circuit call. What comes out is real
 * compiled-contract output rather than hand-written bytes, so an indexer's golden test can
 * be byte-exact long before anything is deployed. What it cannot give is block heights,
 * transaction hashes, segments or indexer event ids; those are deterministic stand-ins and
 * are marked as such (`*StandIn`).
 *
 * UC-1 (MIP-0018 on the Multi-Part Event rule): one circuit call is one intent, and every
 * `mip-0018:token-metadata[v1]` event of it is a part of ONE package, merged in emission
 * order with all 256 bytes of every part kept. `events.json` therefore carries both the
 * events as a chain would deliver them (one 256-byte payload each) and the packages they
 * form (`packages`: parts, event ids in order, the merged payload and its SHA-256).
 *
 * Contract addresses are derived from the row id, so the whole corpus — including every
 * colour — is reproducible.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CompactTypeBytes, CompactTypeVector, persistentCommit } from '@midnight-ntwrk/compact-runtime';
import { Contract as MetadataProbe } from '../contracts/managed/MetadataProbe/contract/index.js';
import {
  EVENT_NAME,
  LEGACY_EVENT_NAME,
  ONE_PART_VALUE_SIZE,
  PAYLOAD_SIZE,
  PRE_MIP_EVENT_NAME,
  TEST_EMITTER_SECRET,
  VAL_TYPE_INTEGER,
  VAL_TYPE_JSON,
  VAL_TYPE_NULL,
  VAL_TYPE_OPAQUE,
  VAL_TYPE_STRING,
  VAL_TYPE_URI,
  decodeInteger,
  deploy,
  emitterSecretHashOf,
  emitterWitnesses,
  hex,
  miscParts,
  pad,
  validateTokenMetadataEvent,
} from '../test/token-metadata.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'fixtures', 'simulator');

const BYTES32 = new CompactTypeBytes(32);
const VECTOR2 = new CompactTypeVector(2, BYTES32);
const DERIVE_TOKEN = pad(32, 'midnight:derive_token');

/** The emitter secret of the corpus (a public test value) and the hash every constructor stores. */
const EMITTER_HASH = emitterSecretHashOf(TEST_EMITTER_SECRET);

/** A deterministic 32-byte contract address, so every fixture is reproducible. */
function addressFor(id: string): string {
  return createHash('sha256').update(`umbra:00024:${id}`).digest('hex');
}

/** A deterministic stand-in for the transaction that would carry step `step` of `row`. */
function txStandInFor(row: string, step: number): string {
  return createHash('sha256').update(`umbra:00024:sim:${row}:${step}`).digest('hex');
}

/**
 * The stand-in physical segment of every simulated call. One circuit call is one intent,
 * and the simulator has no intent map, so every package sits in segment 1 of its own
 * stand-in transaction (a real chain assigns a random 16-bit segment id).
 */
const SEGMENT_STAND_IN = 1;

function deriveColor(domainSep: Uint8Array, address: string): Uint8Array {
  return persistentCommit(VECTOR2, [domainSep, Uint8Array.from(Buffer.from(address, 'hex'))], DERIVE_TOKEN);
}

/** The one-part value field (188 bytes, UC-1) with `text` in its meaningful prefix. */
function value188(text: string): { bytes: Uint8Array; len: bigint } {
  const encoded = new TextEncoder().encode(text);
  if (encoded.length > ONE_PART_VALUE_SIZE) {
    throw new Error(`value of ${encoded.length} bytes exceeds the ${ONE_PART_VALUE_SIZE}-byte one-part field: ${text.slice(0, 40)}…`);
  }
  const bytes = new Uint8Array(ONE_PART_VALUE_SIZE);
  bytes.set(encoded);
  return { bytes, len: BigInt(encoded.length) };
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
/** A generated ledger token keys its balances by 32 bytes: the label, padded. */
const ledgerAccount = (label: string) => pad(32, label);

// --------------------------------------------------------------------------
// the plan: generated-matrix.json
// --------------------------------------------------------------------------

interface MatrixDeclaration {
  piece: string | null;
  domainSep: string;
  kind: number;
  key: string;
  valType: number;
  len: number;
  parts: number;
  value: string;
  payload: string;
  text: string | null;
}
type MatrixStep =
  | { kind: 'emit'; circuit: string; sourceOps: string[]; parts: number; payload: string; events: MatrixDeclaration[] }
  | {
      kind: 'mint';
      circuit: string;
      mintKind: 'shielded' | 'unshielded';
      piece: string | null;
      domain: string;
      domainSepHex: string;
      to: string;
      amount: string;
      nonce: string | null;
    }
  | { kind: 'ledger'; circuit: string; op: string; to: string; amount: string };

interface MatrixRow {
  id: string;
  contract: string;
  template: string;
  name: string;
  symbol: string;
  decimals: number;
  kind: number;
  optional: boolean;
  domain: string | null;
  domainSepHex: string | null;
  pieces: { piece: string; domain: string; domainSepHex: string }[] | null;
  expect: Record<string, unknown>;
  steps: MatrixStep[];
}

const matrix = JSON.parse(readFileSync(join(ROOT, 'deployments', 'generated-matrix.json'), 'utf8')) as {
  rows: MatrixRow[];
};

// --------------------------------------------------------------------------

/** One `Misc` event, as a chain delivers it: one 256-byte payload, one part of a package. */
interface EventRecord {
  /** Emission order across the whole corpus — stands in for the indexer's event id. */
  eventId: number;
  row: string;
  step: number;
  circuit: string;
  contractAddress: string;
  txStandIn: string;
  segmentStandIn: number;
  /** The package this event is a part of, and its 1-based position in it. */
  packageId: number;
  part: number;
  parts: number;
  eventName: string;
  payloadHex: string;
}

/** One package ([Y] §4) of `mip-0018:token-metadata[v1]`: ONE declaration (UC-1). */
interface PackageRecord {
  packageId: number;
  row: string;
  step: number;
  circuit: string;
  sourceOps: string[];
  contractAddress: string;
  txStandIn: string;
  segmentStandIn: number;
  /** k, and the event ids of the parts in emission order. */
  parts: number;
  eventIds: number[];
  eventName: string;
  /** The merged payload, 256·k bytes, every byte of every part kept. */
  payloadHex: string;
  payloadSha256: string;
  domainSepHex: string;
  domainSepText: string;
  kind: number;
  keyText: string;
  keyHex: string;
  /** MIP section 2.1 — how a consumer reads the value. */
  valType: number;
  /** UC-1: the 2-byte little-endian val-len. */
  len: number;
  valueHex: string;
  valueText: string;
}

interface MintRecord {
  row: string;
  step: number;
  op: string;
  contractAddress: string;
  domainSepHex: string;
  /** The kind byte a mint effect implies: 0 unshielded native, 1 shielded native. */
  kindByte: 0 | 1;
  kind: 'shielded' | 'unshielded';
  amount: string;
  colorHex: string;
}

const events: EventRecord[] = [];
const packages: PackageRecord[] = [];
const mints: MintRecord[] = [];
const colorVectors: { row: string; contractAddress: string; domainSepHex: string; domainSepText: string; colorHex: string; source: string }[] = [];
const expectedTokens: Record<string, unknown>[] = [];

let eventId = 0;

const textOf = (bytes: Uint8Array): string => new TextDecoder().decode(bytes).replace(/\0+$/, '');

/** The circuit arguments of one matrix step (a generated contract's own signatures). */
function argsFor(row: MatrixRow, step: MatrixStep, index: number): unknown[] {
  if (step.kind === 'emit') return [];
  if (step.kind === 'ledger') {
    return step.circuit === 'ledgerMint'
      ? [ledgerAccount(step.to), BigInt(step.amount)]
      : [ledgerAccount('owner'), ledgerAccount(step.to), BigInt(step.amount)];
  }
  const nonce = step.nonce ? pad(32, step.nonce) : pad(32, `${row.id}:${index}`);
  if (row.template === 'ShieldedCollection') return [pad(32, step.domain), zswapRecipient(step.to), nonce];
  if (step.mintKind === 'shielded') return [zswapRecipient(step.to), BigInt(step.amount), nonce];
  return [userRecipient(step.to), BigInt(step.amount)];
}

async function runRow(row: MatrixRow) {
  const address = addressFor(row.id);
  const { Contract } = (await import(`../contracts/managed/${row.contract}/contract/index.js`)) as unknown as {
    Contract: new (witnesses: typeof emitterWitnesses) => never;
  };
  const contract = await deploy(new Contract(emitterWitnesses) as never, { emitterSecret: TEST_EMITTER_SECRET }, [EMITTER_HASH], {
    address,
  });

  for (const [index, step] of row.steps.entries()) {
    const call = await contract.call(step.circuit, ...argsFor(row, step, index));
    const txStandIn = txStandInFor(row.id, index);

    if (step.kind === 'emit') {
      // UC-1: one declaration per call, so exactly one package — equal to the matrix's bytes.
      if (call.packages.length !== 1) {
        throw new Error(`${row.id} step ${index} (${step.circuit}) formed ${call.packages.length} packages, not 1`);
      }
      const pkg = call.packages[0]!;
      if (hex(pkg.payload) !== step.payload) {
        throw new Error(`${row.id} step ${index} (${step.circuit}): package bytes differ from the matrix`);
      }
      // Everything the reference set emits must be a valid declaration; a corpus that
      // quietly contained a rejectable package would be worse than useless.
      const verdict = validateTokenMetadataEvent(pkg);
      if (verdict.outcome !== 'accepted') {
        throw new Error(`${row.id} step ${index} (${step.circuit}) emitted a non-conforming package: ${JSON.stringify(verdict)}`);
      }
      const packageId = packages.length;
      const eventIds: number[] = [];
      for (const [partIndex, raw] of (call.rawEvents as never[]).entries()) {
        const { eventName, payload } = miscParts(raw);
        eventIds.push(eventId);
        events.push({
          eventId: eventId++,
          row: row.id,
          step: index,
          circuit: step.circuit,
          contractAddress: address,
          txStandIn,
          segmentStandIn: SEGMENT_STAND_IN,
          packageId,
          part: partIndex + 1,
          parts: pkg.parts,
          eventName,
          payloadHex: hex(payload),
        });
      }
      packages.push({
        packageId,
        row: row.id,
        step: index,
        circuit: step.circuit,
        sourceOps: step.sourceOps,
        contractAddress: address,
        txStandIn,
        segmentStandIn: SEGMENT_STAND_IN,
        parts: pkg.parts,
        eventIds,
        eventName: pkg.eventName,
        payloadHex: hex(pkg.payload),
        payloadSha256: createHash('sha256').update(pkg.payload).digest('hex'),
        domainSepHex: hex(pkg.domainSep),
        domainSepText: textOf(pkg.domainSep),
        kind: pkg.kind,
        keyText: pkg.keyText,
        keyHex: hex(pkg.key),
        valType: pkg.valType,
        len: pkg.len,
        valueHex: hex(pkg.valueBytes),
        valueText: pkg.valueText,
      });
    } else if (call.rawEvents.length !== 0) {
      throw new Error(`${row.id} step ${index} (${step.circuit}) is not an emit step but emitted events`);
    }

    for (const [which, kind] of [
      ['shieldedMints', 'shielded'],
      ['unshieldedMints', 'unshielded'],
    ] as const) {
      const map = call.effects?.[which];
      if (!map) continue;
      for (const [domainSepHex, amount] of map.entries()) {
        const domainSep = Uint8Array.from(Buffer.from(String(domainSepHex), 'hex'));
        mints.push({
          row: row.id,
          step: index,
          op: step.circuit,
          contractAddress: address,
          domainSepHex: String(domainSepHex),
          // MIP section 6.3: a mint effect is an observation of a NATIVE kind.
          kindByte: kind === 'shielded' ? 1 : 0,
          kind,
          amount: String(amount),
          colorHex: hex(deriveColor(domainSep, address)),
        });
      }
    }
  }

  // Colour vectors: what the contract says, and what an observer derives.
  const domains = row.pieces ? row.pieces.map((p) => p.domain) : row.domain ? [row.domain] : [];
  for (const domainText of domains) {
    const domainSep = pad(32, domainText);
    const derived = deriveColor(domainSep, address);
    const args = row.template === 'ShieldedCollection' ? [domainSep] : [];
    let fromCircuit: string | null = null;
    if (row.template !== 'LedgerToken') {
      const { result } = await contract.call('tokenColor', ...args);
      fromCircuit = hex(result as Uint8Array);
      if (fromCircuit !== hex(derived)) {
        throw new Error(`colour mismatch for ${row.id}/${domainText}: circuit ${fromCircuit} vs derived ${hex(derived)}`);
      }
    }
    colorVectors.push({
      row: row.id,
      contractAddress: address,
      domainSepHex: hex(domainSep),
      domainSepText: domainText,
      colorHex: hex(derived),
      source: fromCircuit ? 'tokenColor() == persistentCommit([domainSep, address], "midnight:derive_token")' : 'ledger token — no colour exists',
    });
  }

  // The rows an indexer should end up with, as far as the simulator can say.
  //
  // MIP section 4: a token is identified by `(contractAddress, domainSep, kind)`
  // with the FULL kind byte. A declaration populates exactly its own row and a
  // mint effect populates the native row (kind 0 or 1) its tag implies, so the
  // two can never contradict each other (MIP section 6.3). That is what makes
  // the "Ledger Liar" two rows rather than one flagged one: its kind-2
  // declaration and its kind-0 mint are different tokens as far as the wire
  // format is concerned, and the honest picture is an observed row without a
  // name beside a declared row with one (MIP section 7.2).
  /** One row of the indexer's token table, as far as the simulator can say. */
  interface ExpectedToken {
    row: string;
    contractAddress: string;
    domainSepHex: string;
    domainSepText: string;
    kind: number;
    privacy: string;
    storage: string;
    colorHex: string | null;
    traits: Record<string, unknown>;
    declared?: boolean;
    mintCount: number;
    totalMinted: string;
    status?: string;
    name?: string;
    symbol?: string;
    decimals?: number;
    tokenUri?: string;
    /** FR-009: a `metadata` declaration that is one JSON object, parsed. */
    metadata?: unknown;
  }

  const newRow = (domainSepHex: string, domainSepText: string, kindByte: number): ExpectedToken => {
    const native = (kindByte & 2) === 0;
    return {
      row: row.id,
      contractAddress: address,
      domainSepHex,
      domainSepText,
      /** The MIP's identity byte, 0..3. */
      kind: kindByte,
      privacy: (kindByte & 1) === 1 ? 'shielded' : 'unshielded',
      storage: native ? 'native' : 'ledger',
      // MIP section 3: a colour exists only for the native kinds.
      colorHex: native
        ? hex(deriveColor(Uint8Array.from(Buffer.from(domainSepHex, 'hex')), address))
        : null,
      traits: {} as Record<string, unknown>,
      declared: false,
      mintCount: 0,
      totalMinted: '0',
    };
  };

  /** One map per (domainSep, kind) — the MIP's identity, over this contract. */
  const byIdentity = new Map<string, ExpectedToken>();
  const identityKey = (domainSepHex: string, kindByte: number) => `${domainSepHex}:${kindByte}`;

  // Last write wins in canonical order (MIP section 6.2): here every package is its own
  // call, so emission order IS block, transaction and execution order; a multi-part
  // package is positioned by its first part (derivation P1).
  for (const pkg of packages.filter((p) => p.row === row.id)) {
    const key = identityKey(pkg.domainSepHex, pkg.kind);
    const token = byIdentity.get(key) ?? newRow(pkg.domainSepHex, pkg.domainSepText, pkg.kind);
    token.declared = true;
    // Appendix A's core keys are projected into columns; everything else is a trait,
    // kept verbatim with its val-type (MIP section 5.2).
    if (pkg.valType === VAL_TYPE_NULL) {
      // MIP sections 2.1 and 6.2: the key's CURRENT value becomes Null. The one
      // projected column that key fed is dropped; any other key is recorded
      // with val-type 5, so a reader can tell "cleared on chain" from "never
      // said". History is not erased — the earlier packages stay in events.json.
      switch (pkg.keyText) {
        case 'name':
          delete token.name;
          break;
        case 'symbol':
          delete token.symbol;
          break;
        case 'decimals':
          delete token.decimals;
          break;
        case 'tokenUri':
          delete token.tokenUri;
          break;
        default:
          if (pkg.keyText === 'metadata') delete token.metadata;
          (token.traits as Record<string, unknown>)[pkg.keyText] = {
            valType: VAL_TYPE_NULL,
            valLen: 0,
            parts: pkg.parts,
            valueHex: '',
            text: null,
          };
      }
      byIdentity.set(key, token);
      continue;
    }
    if (pkg.keyText === 'decimals' && pkg.valType === VAL_TYPE_INTEGER) {
      // MIP section 2.1: any width 1..31, decoded little-endian.
      token.decimals = Number(decodeInteger(Uint8Array.from(Buffer.from(pkg.valueHex, 'hex'))));
    } else if (pkg.keyText === 'name' && pkg.valType === VAL_TYPE_STRING) {
      token.name = pkg.valueText;
    } else if (pkg.keyText === 'symbol' && pkg.valType === VAL_TYPE_STRING) {
      token.symbol = pkg.valueText;
    } else if (pkg.keyText === 'tokenUri' && pkg.valType === VAL_TYPE_URI) {
      token.tokenUri = pkg.valueText;
    } else {
      if (pkg.keyText === 'metadata' && pkg.valType === VAL_TYPE_JSON) {
        const parsed = JSON.parse(pkg.valueText) as unknown;
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) token.metadata = parsed;
      }
      (token.traits as Record<string, unknown>)[pkg.keyText] = {
        valType: pkg.valType,
        valLen: pkg.len,
        parts: pkg.parts,
        valueHex: pkg.valueHex,
        text: pkg.valType === VAL_TYPE_OPAQUE ? null : pkg.valueText,
      };
    }
    byIdentity.set(key, token);
  }

  for (const mint of mints.filter((m) => m.row === row.id)) {
    const key = identityKey(mint.domainSepHex, mint.kindByte);
    const token =
      byIdentity.get(key) ??
      newRow(
        mint.domainSepHex,
        new TextDecoder().decode(Buffer.from(mint.domainSepHex, 'hex')).replace(/\0+$/, ''),
        mint.kindByte,
      );
    // A mint is a fact about a native kind; it creates or confirms that row and
    // never touches another one.
    token.colorHex = mint.colorHex;
    token.mintCount += 1;
    token.totalMinted = String(BigInt(token.totalMinted) + BigInt(mint.amount));
    byIdentity.set(key, token);
  }

  // MIP section 7.2: three states, and only native kinds can reach `described`.
  for (const token of [...byIdentity.values()].sort((a, b) => a.kind - b.kind)) {
    const declared = token.declared === true;
    const minted = token.mintCount > 0;
    delete token.declared;
    token.status = minted ? (declared ? 'described' : 'observed') : 'declared';
    expectedTokens.push(token as unknown as Record<string, unknown>);
  }
}

/**
 * The events a conforming consumer must NOT simply apply. They cannot come from
 * the generated contracts — those only ever emit valid ones — so the probe emits
 * them on demand, which keeps them real compiled-contract output like the rest
 * of the corpus.
 *
 * Three outcomes, and the difference between them is the point:
 *
 *   - `ignored`   not a TokenMetadata event at all (MIP section 1). Not stored,
 *                 NOT recorded as rejected. Two names matter here: the pre-MIP
 *                 `TokenMetadata` of this repository's 00020 contracts, and the
 *                 `mip-xxxx:token-metadata[v1]` placeholder of the #315 draft,
 *                 which is what the Stagenet reference set actually emits.
 *   - `rejected`  a TokenMetadata event whose payload breaks MIP section 2.1,
 *                 2.2 or 3. `reason` is the stable reason of spec 00021 FR-102.
 *   - `applied`   a valid event at the transport level. Some of these are keys
 *                 whose Appendix A projection fails (`projectionFails`): the
 *                 trait is still stored and the event is NOT rejected
 *                 (MIP sections 5.3 and 7.1).
 */
async function runNegatives() {
  const address = addressFor('PROBE');
  const probe = await deploy<Record<string, never>>(new MetadataProbe({}) as never, {}, [], { address });
  const empty = new Uint8Array(ONE_PART_VALUE_SIZE);
  const fill = (bytes: number[]): Uint8Array => Uint8Array.from([...bytes, ...empty.subarray(bytes.length)]);

  interface Case {
    why: string;
    /** MIP reference the case comes from. */
    mip: string;
    expect: 'rejected' | 'applied' | 'ignored';
    reason?: string;
    /** True when the event is applied but its Appendix A projection must fail. */
    projectionFails?: boolean;
    /** Emit under the pre-MIP `TokenMetadata` name. */
    legacyName?: boolean;
    /** Emit under the `mip-xxxx:token-metadata[v1]` placeholder of the #315 draft. */
    preMipName?: boolean;
    kind: number;
    key: Uint8Array;
    keyLabel: string;
    valType: number;
    len: number;
    value: Uint8Array;
  }

  const key = (text: string) => ({ key: pad(32, text), keyLabel: text });

  const cases: Case[] = [
    // ---- MIP section 1: the event name -----------------------------------
    {
      why: 'the pre-MIP event name `TokenMetadata`: a MIP consumer ignores it, and does not record it as rejected',
      mip: '1',
      expect: 'ignored',
      legacyName: true,
      kind: 1,
      ...key('name'),
      valType: VAL_TYPE_STRING,
      len: 10,
      value: value188('Old Name!!').bytes,
    },
    {
      why: 'the `mip-xxxx:token-metadata[v1]` PLACEHOLDER name of the #315 draft, which is the name this repository\'s Stagenet reference set was actually deployed with: the event name is the layout version, so a MIP-0018 v1 consumer ignores it too — a consumer that wants to show the legacy deployment must recognise the second name explicitly and validate it under the draft rules',
      mip: '1',
      expect: 'ignored',
      preMipName: true,
      kind: 1,
      ...key('name'),
      valType: VAL_TYPE_STRING,
      len: 13,
      value: value188('Shielded Star').bytes,
    },
    // ---- MIP section 2.2: transport validation ---------------------------
    {
      why: 'UC-1: val-len 189 in a one-part package — the package holds 188 value bytes (68 + 189 > 256), so the declared length is beyond the package',
      mip: 'UC-1',
      expect: 'rejected',
      reason: 'val_len_beyond_package',
      kind: 1,
      ...key('name'),
      valType: VAL_TYPE_STRING,
      len: 189,
      value: new Uint8Array(ONE_PART_VALUE_SIZE).fill(0x41),
    },
    {
      why: 'an empty key: all 32 bytes NUL, so nothing is left after trimming',
      mip: '2.2',
      expect: 'rejected',
      reason: 'key_empty',
      kind: 1,
      key: new Uint8Array(32),
      keyLabel: '',
      valType: VAL_TYPE_STRING,
      len: 4,
      value: value188('void').bytes,
    },
    {
      why: 'a `/metadata/` key that is not a valid RFC 6901 pointer: `~2` is not one of the two legal escapes (`~0`, `~1`)',
      mip: '5.1',
      expect: 'rejected',
      reason: 'key_pointer_invalid',
      kind: 1,
      ...key('/metadata/~2'),
      valType: VAL_TYPE_STRING,
      len: 3,
      value: value188('bad').bytes,
    },
    // ---- MIP section 2.1: the val-type byte ------------------------------
    {
      why: 'val-type 5 (Null) with a non-zero val-len: the Null payload is `serialize<[], 0>([])`, so val-len MUST be zero',
      mip: '2.1',
      expect: 'rejected',
      reason: 'val_type_rule',
      kind: 1,
      ...key('description'),
      valType: VAL_TYPE_NULL,
      len: 4,
      value: value188('five').bytes,
    },
    {
      why: 'val-type 6, the FIRST reserved value in the final text (the #315 draft reserved from 5, which is now Null)',
      mip: '2.1',
      expect: 'rejected',
      reason: 'val_type_reserved',
      kind: 1,
      ...key('name'),
      valType: 6,
      len: 3,
      value: value188('six').bytes,
    },
    {
      why: 'val-type 7, a reserved value in the middle of the range',
      mip: '2.1',
      expect: 'rejected',
      reason: 'val_type_reserved',
      kind: 1,
      ...key('description'),
      valType: 7,
      len: 5,
      value: value188('seven').bytes,
    },
    {
      why: 'val-type 255, the top of the reserved range',
      mip: '2.1',
      expect: 'rejected',
      reason: 'val_type_reserved',
      kind: 0,
      ...key('symbol'),
      valType: 255,
      len: 3,
      value: value188('MAX').bytes,
    },
    {
      why: 'val-type 1 carrying bytes that are not valid UTF-8',
      mip: '2.1',
      expect: 'rejected',
      reason: 'val_type_rule',
      kind: 1,
      ...key('name'),
      valType: VAL_TYPE_STRING,
      len: 3,
      value: fill([0xff, 0xfe, 0xfd]),
    },
    {
      why: 'val-type 2 with val-len 0 — an integer is `Uint<8*val-len>`, so it needs 1..31 bytes',
      mip: '2.1',
      expect: 'rejected',
      reason: 'val_type_rule',
      kind: 1,
      ...key('decimals'),
      valType: VAL_TYPE_INTEGER,
      len: 0,
      value: empty,
    },
    {
      why: 'val-type 2 with val-len 32 — above `Uint<248>`, the widest byte-aligned unsigned integer',
      mip: '2.1',
      expect: 'rejected',
      reason: 'val_type_rule',
      kind: 1,
      ...key('supplyCap'),
      valType: VAL_TYPE_INTEGER,
      len: 32,
      value: new Uint8Array(ONE_PART_VALUE_SIZE).fill(0x01),
    },
    {
      why: 'val-type 3 carrying a JSON FRAGMENT — the head of the six-part `metadata/<n>` document this repository published against the #315 draft. The final text requires ONE complete JSON value and defines no reassembly, so the part is rejected, not collected',
      mip: '2.1',
      expect: 'rejected',
      reason: 'val_type_rule',
      kind: 1,
      ...key('metadata/0'),
      valType: VAL_TYPE_JSON,
      len: 67,
      value: value188('{"description":"A nebula published in parts, because one TokenMetad').bytes,
    },
    {
      why: 'val-type 4 carrying a relative reference instead of an absolute URI',
      mip: '2.1',
      expect: 'rejected',
      reason: 'val_type_rule',
      kind: 1,
      ...key('tokenUri'),
      valType: VAL_TYPE_URI,
      len: 22,
      value: value188('/constellations/orion').bytes,
    },
    // ---- MIP section 3: the kind byte ------------------------------------
    {
      why: 'kind 4 — the first value MIP section 3 reserves',
      mip: '3',
      expect: 'rejected',
      reason: 'kind_unknown',
      kind: 4,
      ...key('name'),
      valType: VAL_TYPE_STRING,
      len: 4,
      value: value188('four').bytes,
    },
    {
      why: 'kind 255 — the pre-MIP layout treated the high bits as flags; they are not',
      mip: '3',
      expect: 'rejected',
      reason: 'kind_unknown',
      kind: 255,
      ...key('name'),
      valType: VAL_TYPE_STRING,
      len: 3,
      value: value188('max').bytes,
    },
    {
      why: 'kind 3 — shielded ledger: valid and applied, but purely informative (no colour)',
      mip: '3',
      expect: 'applied',
      kind: 3,
      ...key('name'),
      valType: VAL_TYPE_STRING,
      len: 12,
      value: value188('Hidden Ledge').bytes,
    },
    // ---- MIP sections 5.1, 5.2, 6.2: applied, but awkward -----------------
    {
      why: 'a key that is not valid UTF-8: MUST NOT be rejected, and is displayed as hex',
      mip: '5.1',
      expect: 'applied',
      kind: 1,
      key: Uint8Array.from([0xff, 0xfe, 0x01, ...new Uint8Array(29)]),
      keyLabel: '<non-UTF-8 key fffe01>',
      valType: VAL_TYPE_STRING,
      len: 4,
      value: value188('odd!').bytes,
    },
    {
      why: 'val-len 0 on a free trait: "present, empty" at the transport level',
      mip: '6.2',
      expect: 'applied',
      kind: 1,
      ...key('description'),
      valType: VAL_TYPE_STRING,
      len: 0,
      value: empty,
    },
    {
      why: 'val-type 0 opaque bytes: applied and surfaced as hex, no parsing rule at all',
      mip: '2.1',
      expect: 'applied',
      kind: 1,
      ...key('fingerprint'),
      valType: VAL_TYPE_OPAQUE,
      len: 4,
      value: fill([0xde, 0xad, 0xbe, 0xef]),
    },
    {
      why: 'val-type 5 (Null) done properly — val-len 0 and 188 NUL bytes: APPLIED, and it sets the key\'s current value to Null. Distinct from an empty string and from the JSON literal `null`; the key\'s earlier values remain history',
      mip: '2.1',
      expect: 'applied',
      kind: 1,
      ...key('description'),
      valType: VAL_TYPE_NULL,
      len: 0,
      value: empty,
    },
    {
      why: 'val-type 5 (Null) whose 188 value bytes are NOT NUL: emitters SHOULD zero them, consumers MUST ignore them, so this is applied and identical in meaning to the case above',
      mip: '2.2',
      expect: 'applied',
      kind: 1,
      ...key('hemisphere'),
      valType: VAL_TYPE_NULL,
      len: 0,
      value: new Uint8Array(ONE_PART_VALUE_SIZE).fill(0x5a),
    },
    {
      why: 'val-type 3 carrying a JSON SCALAR rather than an object: the final text allows object, array and scalar values, so this is applied',
      mip: '2.1',
      expect: 'applied',
      kind: 1,
      ...key('magnitudeJson'),
      valType: VAL_TYPE_JSON,
      len: 4,
      value: value188('1.25').bytes,
    },
    {
      why: 'a valid RFC 6901 pointer key (MIP Appendix A\'s `/metadata/0` example) with a UTF-8 value: applied, and nothing about arrays, nesting or assembly follows from the path',
      mip: '5.1',
      expect: 'applied',
      kind: 1,
      ...key('/metadata/0'),
      valType: VAL_TYPE_STRING,
      len: 11,
      value: value188('hello world').bytes,
    },
    {
      why: 'a pointer key with both legal escapes, `/metadata/a~1b~0c`: applied — `~1` is a literal `/` and `~0` a literal `~` inside one reference token',
      mip: '5.1',
      expect: 'applied',
      kind: 1,
      ...key('/metadata/a~1b~0c'),
      valType: VAL_TYPE_STRING,
      len: 2,
      value: value188('ok').bytes,
    },
    {
      why: 'decimals as `Uint<24>` (val-len 3) instead of Appendix A\'s recommended `Uint<128>`: every permitted width 1..31 MUST be accepted and decoded little-endian, so this is applied AND projects to 6 — `Uint<128>` is an emitter default, not a decoder fallback',
      mip: '2.1',
      expect: 'applied',
      kind: 1,
      ...key('decimals'),
      valType: VAL_TYPE_INTEGER,
      len: 3,
      value: fill([0x06, 0x00, 0x00]),
    },
    // ---- MIP section 5.3 / Appendix A: projection fails, event applied ----
    {
      why: 'the well-known key `decimals` carried as a UTF-8 string ("6") instead of Appendix A’s integer: APPLIED as a trait, projection fails, decimals column untouched',
      mip: '5.3',
      expect: 'applied',
      projectionFails: true,
      kind: 1,
      ...key('decimals'),
      valType: VAL_TYPE_STRING,
      len: 1,
      value: value188('6').bytes,
    },
    {
      why: 'the well-known key `name` carried as JSON instead of a string: applied as a trait, projection fails',
      mip: '5.3',
      expect: 'applied',
      projectionFails: true,
      kind: 1,
      ...key('name'),
      valType: VAL_TYPE_JSON,
      len: 15,
      value: value188('{"name":"json"}').bytes,
    },
    {
      why: 'decimals 99: the right type, but above Appendix A’s 36 — applied, projection fails',
      mip: 'A',
      expect: 'applied',
      projectionFails: true,
      kind: 1,
      ...key('decimals'),
      valType: VAL_TYPE_INTEGER,
      len: 1,
      value: fill([99]),
    },
    {
      why: 'a 40-byte symbol: valid transport, above Appendix A’s 32 — applied, projection fails',
      mip: 'A',
      expect: 'applied',
      projectionFails: true,
      kind: 1,
      ...key('symbol'),
      valType: VAL_TYPE_STRING,
      len: 40,
      value: value188('A'.repeat(40)).bytes,
    },
    {
      why: 'an empty name (val-len 0): "present, empty" at transport, but Appendix A wants 1..189 — applied, projection fails',
      mip: 'A',
      expect: 'applied',
      projectionFails: true,
      kind: 1,
      ...key('name'),
      valType: VAL_TYPE_STRING,
      len: 0,
      value: empty,
    },
    {
      why: 'a tokenUri that is an absolute non-http URI (ftp): passes MIP 2.1, fails Appendix A’s http(s) rule — applied, projection fails',
      mip: 'A',
      expect: 'applied',
      projectionFails: true,
      kind: 1,
      ...key('tokenUri'),
      valType: VAL_TYPE_URI,
      len: 26,
      value: value188('ftp://example.invalid/x.png').bytes,
    },
  ];

  const out: Record<string, unknown>[] = [];
  for (const c of cases) {
    // The two ignored names keep their emitters' one-byte val-len, 189-byte value layout.
    const legacyLayout = c.legacyName || c.preMipName;
    const value = legacyLayout ? Uint8Array.from([...c.value, 0]) : c.value;
    const { events: emitted } = await probe.call(
      c.legacyName ? 'publishLegacyName' : c.preMipName ? 'publishPreMipName' : 'publishRaw',
      pad(32, 'umbra:probe'),
      BigInt(c.kind),
      c.key,
      BigInt(c.valType),
      BigInt(c.len),
      value,
    );
    const event = emitted[0];
    const verdict = validateTokenMetadataEvent(event);

    // The corpus states what a consumer must do; the reference decoder has to
    // agree with it here, or the fixture would teach the wrong lesson.
    const expectedOutcome = c.expect === 'applied' ? 'accepted' : c.expect;
    if (verdict.outcome !== expectedOutcome) {
      throw new Error(`negative "${c.why}": decoder says ${JSON.stringify(verdict)}, corpus says ${c.expect}`);
    }
    if (c.reason && (verdict as { reason?: string }).reason !== c.reason) {
      throw new Error(`negative "${c.why}": decoder reason ${JSON.stringify(verdict)} != ${c.reason}`);
    }

    out.push({
      why: c.why,
      mipSection: c.mip,
      expect: c.expect,
      ...(c.reason ? { reason: c.reason } : {}),
      ...(c.projectionFails ? { projectionFails: true } : {}),
      contractAddress: address,
      eventName: event.eventName,
      payloadHex: hex(event.payload),
      kind: event.kind,
      keyHex: hex(event.key),
      keyText: c.keyLabel,
      valType: event.valType,
      len: event.len,
    });
  }
  return out;
}


// --------------------------------------------------------------------------

const only = process.argv.slice(2);
const rows = only.length ? matrix.rows.filter((r) => only.includes(r.id)) : matrix.rows;

for (const row of rows) {
  await runRow(row);
  const own = packages.filter((p) => p.row === row.id);
  process.stdout.write(
    `${row.id}: ${own.length} declarations in ${events.filter((e) => e.row === row.id).length} events` +
      `${own.some((p) => p.parts > 1) ? ` (multi-part: ${own.filter((p) => p.parts > 1).map((p) => `${p.keyText} ${p.parts}`).join(', ')})` : ''}` +
      `, ${mints.filter((m) => m.row === row.id).length} mints\n`,
  );
}
const negatives = await runNegatives();

mkdirSync(OUT, { recursive: true });
const provenance = {
  standard: `MIP-0018 (MIP PR #325), mips/mip-0018-on-chain-token-metadata.md @ 37a3471, on the UC-1 layout (an amendment in development: 2-byte little-endian val-len at offset 66, value from offset 68, packages of 256·k bytes under the Multi-Part Event rule; see TOKEN-METADATA.md); event name "${EVENT_NAME}". A consumer IGNORES every other name, including this repository's pre-MIP "${LEGACY_EVENT_NAME}" and the #315 draft placeholder "${PRE_MIP_EVENT_NAME}" that the Stagenet reference set in fixtures/stagenet/ was deployed with (MIP sections 1 and 8).`,
  source: 'the generated MIP-18 contracts (contracts/generated/*18.compact, compactc 0.34.0) executed in the Compact simulator (@midnight-ntwrk/compact-runtime 0.19.0); the negative corpus from contracts/probe/MetadataProbe.compact',
  producedBy: 'scripts/export-simulator-fixtures.ts',
  note: 'Real compiled-contract output, executed in process, one deployments/generated-matrix.json step per circuit call. Contract addresses are sha256("umbra:00024:<row id>"), so everything here is reproducible. There are no block heights, transaction hashes, segments or indexer event ids: `txStandIn` is sha256("umbra:00024:sim:<row>:<step>"), `segmentStandIn` is 1 (one call = one intent) and `eventId` is the emission order across the whole corpus. Every emit step is ONE package of one declaration (UC-1): `events` lists the Misc events as a chain would deliver them (256 bytes each, with `packageId` and `part`), `packages` the merged 256·k-byte payloads. Token rows are keyed by the MIP\'s identity `(contractAddress, domainSep, kind 0..3)`; `privacy` and `storage` are derived from the kind byte and `status` is one of observed | declared | described (MIP section 7.2). val-type 2 values are the little-endian Compact serialization of `Uint<8*val-len>` (MIP section 2.1), and `decimals` is emitted as `Uint<128>`, i.e. val-len 16. A val-type 5 (Null) package sets the key\'s CURRENT value to Null without erasing history: in expected-tokens.json the projected column it fed is absent and a non-projected key appears in `traits` with `valType: 5`. Last write wins in emission order, a package positioned by its first part (derivation P1).',
};
const write = (file: string, body: unknown) =>
  writeFileSync(join(OUT, file), `${JSON.stringify({ ...provenance, ...(body as object) }, null, 2)}\n`);

const statusCounts = expectedTokens.reduce<Record<string, number>>((acc, token) => {
  const status = String(token.status);
  acc[status] = (acc[status] ?? 0) + 1;
  return acc;
}, {});
const identities = new Set(
  expectedTokens.map((t) => `${t.contractAddress}:${t.domainSepHex}:${t.kind}`),
);
const addressDomainPairs = new Set(
  expectedTokens.map((t) => `${t.contractAddress}:${t.domainSepHex}`),
);
const partCounts = packages.reduce<Record<string, number>>((acc, p) => {
  acc[String(p.parts)] = (acc[String(p.parts)] ?? 0) + 1;
  return acc;
}, {});

write('events.json', {
  count: events.length,
  packageCount: packages.length,
  packagesByParts: partCounts,
  events,
  packages,
});
write('mints.json', { count: mints.length, mints });
write('color-vectors.json', { count: colorVectors.length, vectors: colorVectors });
write('expected-tokens.json', {
  count: expectedTokens.length,
  identities: identities.size,
  addressDomainPairs: addressDomainPairs.size,
  statusCounts,
  tokens: expectedTokens,
});
write('negative-payloads.json', {
  count: negatives.length,
  outcomes: negatives.reduce<Record<string, number>>((acc, payload) => {
    const outcome = String(payload.expect);
    acc[outcome] = (acc[outcome] ?? 0) + 1;
    return acc;
  }, {}),
  payloads: negatives,
});

process.stdout.write(
  `\nwrote ${packages.length} packages in ${events.length} events (${Object.entries(partCounts)
    .map(([parts, n]) => `${n} × ${parts} part${parts === '1' ? '' : 's'}`)
    .join(', ')}), ${mints.length} mints, ${colorVectors.length} colour vectors, ` +
    `${expectedTokens.length} expected token rows over ${identities.size} identities ` +
    `(${Object.entries(statusCounts)
      .map(([status, n]) => `${n} ${status}`)
      .join(', ')}) and ${negatives.length} negative/edge payloads to fixtures/simulator/\n`,
);
