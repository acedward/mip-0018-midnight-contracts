/**
 * Test-side decoder and validator for MIP-0018
 * (MIP PR #325, `mips/mip-0018-on-chain-token-metadata.md` @ `37a3471`) on the
 * UC-1 layout — an amendment in development, recorded in ../TOKEN-METADATA.md:
 * `mip-0018:token-metadata[v1]` follows the Multi-Part Event rule, so the unit a
 * consumer decodes is a PACKAGE of 256·k bytes (the events of one contract in
 * one intent, in emission order), with a 2-byte little-endian `val-len` at
 * offset 66 and the value from offset 68. Plus the small simulator harness the
 * contract tests share.
 *
 * The decoder deliberately re-implements sections 1, 2, 3 and 5 of the MIP (and
 * UC-1) rather than importing anything from the contracts: if the Compact side
 * and this side ever disagree, a test must fail. It is the "consumer reference"
 * the MIP's Implementation Example points at.
 */
import { createHash } from 'node:crypto';
import {
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';

/** `Misc { name: Bytes<32>, payload: Bytes<256> }` — 288 bytes serialized. */
export const MISC_EVENT_SIZE = 288;
/** One event's payload: one part of a package (the Multi-Part Event rule). */
export const PART_SIZE = 256;
/** A one-part package is one event's payload. */
export const PAYLOAD_SIZE = PART_SIZE;
/** UC-1: domainSep 32 + kind 1 + key 32 + val-type 1 + val-len 2. */
export const HEADER_SIZE = 68;
/** UC-1: the value bytes one event (a one-part package) holds, 256 − 68. */
export const ONE_PART_VALUE_SIZE = PART_SIZE - HEADER_SIZE;
/** UC-1: `val-len` is an unsigned 16-bit integer. */
export const MAX_VAL_LEN = 0xffff;

/**
 * MIP section 1: the event name, which is also the layout version (section 8).
 * A v1 consumer accepts a `Misc` event if and only if its name is exactly
 * `pad(32, EVENT_NAME)`; every other name is ignored, not rejected.
 */
export const EVENT_NAME = 'mip-0018:token-metadata[v1]';
/**
 * The placeholder name of the #315 draft, under which this repository's
 * Stagenet reference set was deployed (commit `1721636`) while the MIP number
 * was still unassigned. A conforming v1 consumer IGNORES it. It is kept here so
 * the corpus can carry the case: a consumer that also wants to show the legacy
 * deployment must treat it as a second, separate name with the draft's rules.
 */
export const PRE_MIP_EVENT_NAME = 'mip-xxxx:token-metadata[v1]';
/** The pre-MIP name this repository's 00020 contracts used; now ignored. */
export const LEGACY_EVENT_NAME = 'TokenMetadata';

export const KIND_UNSHIELDED = 0;
export const KIND_SHIELDED = 1;
export const KIND_LEDGER_FLAG = 2;

/** MIP section 2.1. */
export const VAL_TYPE_OPAQUE = 0;
export const VAL_TYPE_STRING = 1;
export const VAL_TYPE_INTEGER = 2;
export const VAL_TYPE_JSON = 3;
export const VAL_TYPE_URI = 4;
/** MIP section 2.1: an explicit Null. `val-len` MUST be 0 and `value` is ignored. */
export const VAL_TYPE_NULL = 5;
/** The first reserved val-type: 6..255 MUST reject the event. */
export const VAL_TYPE_RESERVED_FROM = 6;

/**
 * MIP section 2.1, val-type 2: the integer's Compact type is `Uint<8 * val-len>`
 * and only `Uint<8>` through `Uint<248>` exist, so `1 <= val-len <= 31`.
 */
export const MIN_INTEGER_LEN = 1;
export const MAX_INTEGER_LEN = 31;
/** MIP Appendix A's recommended emitter default, `Uint<128>`. */
export const DEFAULT_INTEGER_LEN = 16;

/**
 * MIP section 5.1: a key whose trimmed bytes start with these must be valid
 * UTF-8 and a valid RFC 6901 JSON Pointer, or the event is rejected.
 */
export const METADATA_POINTER_PREFIX = '/metadata/';

/** Compact's `pad(n, "text")`: UTF-8 bytes, NUL-padded on the right. */
export function pad(n: number, text: string): Uint8Array {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > n) throw new Error(`"${text}" does not fit in ${n} bytes`);
  const out = new Uint8Array(n);
  out.set(bytes);
  return out;
}

/** Drops trailing NULs and decodes as UTF-8 — how a key name is compared. */
export function unpad(bytes: Uint8Array): string {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end -= 1;
  return new TextDecoder().decode(bytes.subarray(0, end));
}

export function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

/**
 * One decoded package: for a single event (k = 1) that event's 256-byte payload,
 * for a multi-part package the concatenation of its parts in emission order.
 */
export interface TokenMetadataEvent {
  /** The emitting contract, as the VM tagged the log entry. */
  address: string;
  /** `Misc.name`, i.e. `pad(32, EVENT_NAME)` for a conforming event. */
  eventName: string;
  /** The package's merged payload, 256·k bytes, zero-extended. */
  payload: Uint8Array;
  /** k: how many events (parts) the package was merged from. */
  parts: number;
  domainSep: Uint8Array;
  kind: number;
  key: Uint8Array;
  keyText: string;
  /** MIP section 2.1: how `value` is to be read. */
  valType: number;
  /** UC-1: the declared value length, unsigned 16-bit little-endian at offset 66. */
  len: number;
  /** Everything from offset 68 to the end of the package: the value and its padding. */
  value: Uint8Array;
  /** The meaningful bytes, `payload[68 .. 68 + len]` clamped to the package. */
  valueBytes: Uint8Array;
  /** `valueBytes` as UTF-8, for the text-valued keys. */
  valueText: string;
  /** The bytes after the value (MIP: ignored; zero padding from a well-built emitter). */
  trailing: Uint8Array;
}

/**
 * A `misc` log event as the on-chain VM produces it. The aligned value declares
 * 288 bytes but carries them with trailing NULs trimmed, so consumers reading
 * the raw value MUST zero-extend before slicing — this helper does.
 */
type RawLogEvent = {
  eventType: string;
  address: string;
  data: { tag: string; content: { value: Uint8Array[]; alignment: unknown } };
};

export function rawMiscBytes(event: RawLogEvent): Uint8Array {
  if (event.eventType !== 'misc') throw new Error(`not a misc event: ${event.eventType}`);
  if (event.data.tag !== 'cell') throw new Error(`unexpected log data tag: ${event.data.tag}`);
  const parts = event.data.content.value;
  if (parts.length !== 1) throw new Error(`unexpected aligned value with ${parts.length} atoms`);
  const trimmed = parts[0];
  if (trimmed.length > MISC_EVENT_SIZE) {
    throw new Error(`misc event is ${trimmed.length} bytes, expected at most ${MISC_EVENT_SIZE}`);
  }
  const full = new Uint8Array(MISC_EVENT_SIZE);
  full.set(trimmed);
  return full;
}

/** One `misc` log event's name and 256-byte payload. */
export function miscParts(event: RawLogEvent): { eventName: string; nameHex: string; payload: Uint8Array } {
  const bytes = rawMiscBytes(event);
  return {
    eventName: unpad(bytes.subarray(0, 32)),
    nameHex: hex(bytes.subarray(0, 32)),
    payload: Uint8Array.from(bytes.subarray(32, 32 + PART_SIZE)),
  };
}

/** UC-1 field extraction from a package payload of 256·k bytes (k >= 1). */
export function decodePackage(
  address: string,
  eventName: string,
  payload: Uint8Array,
  parts = payload.length / PART_SIZE,
): TokenMetadataEvent {
  const domainSep = payload.subarray(0, 32);
  const kind = payload[32]!;
  const key = payload.subarray(33, 65);
  const valType = payload[65]!;
  // UC-1: `val-len` is the Compact `Uint<16>` serialization — little-endian.
  const len = payload[66]! | (payload[67]! << 8);
  const value = payload.subarray(HEADER_SIZE);
  const end = Math.min(HEADER_SIZE + len, payload.length);
  const valueBytes = payload.subarray(HEADER_SIZE, end);
  return {
    address,
    eventName,
    payload: Uint8Array.from(payload),
    parts,
    domainSep: Uint8Array.from(domainSep),
    kind,
    key: Uint8Array.from(key),
    keyText: unpad(key),
    valType,
    len,
    value: Uint8Array.from(value),
    valueBytes: Uint8Array.from(valueBytes),
    valueText: new TextDecoder().decode(valueBytes),
    trailing: Uint8Array.from(payload.subarray(end)),
  };
}

/** Parses one `misc` log event on its own, as a one-part package. */
export function decodeTokenMetadataEvent(event: RawLogEvent): TokenMetadataEvent {
  const { eventName, payload } = miscParts(event);
  return decodePackage(event.address, eventName, payload, 1);
}

export function decodeAll(events: readonly unknown[]): TokenMetadataEvent[] {
  return (events as RawLogEvent[]).map(decodeTokenMetadataEvent);
}

/**
 * The Multi-Part Event rule ([Y] §4) over the events of ONE simulated circuit call,
 * which is one intent of one transaction: every event of an opted-in name from one
 * contract is a part of one package, merged in emission order with all 256 bytes of
 * every part kept; an event of any other name is processed alone ([Y] §3). Here the
 * only opted-in name is `mip-0018:token-metadata[v1]` (UC-1). Packages are returned in
 * the order of their first part.
 */
export function packagesOf(events: readonly unknown[]): TokenMetadataEvent[] {
  const out: TokenMetadataEvent[] = [];
  const groups = new Map<string, { index: number; eventName: string; address: string; parts: Uint8Array[] }>();
  for (const raw of events as RawLogEvent[]) {
    const { eventName, payload } = miscParts(raw);
    if (eventName !== EVENT_NAME) {
      out.push(decodePackage(raw.address, eventName, payload, 1));
      continue;
    }
    const groupKey = `${raw.address}\u0000${eventName}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = { index: out.length, eventName, address: raw.address, parts: [] };
      groups.set(groupKey, group);
      out.push(undefined as never); // placeholder at the first part's position
    }
    group.parts.push(payload);
  }
  for (const group of groups.values()) {
    const merged = new Uint8Array(group.parts.length * PART_SIZE);
    group.parts.forEach((part, i) => merged.set(part, i * PART_SIZE));
    out[group.index] = decodePackage(group.address, group.eventName, merged, group.parts.length);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Transport validation — MIP sections 1, 2.1, 2.2 and 3
// ---------------------------------------------------------------------------

/**
 * One stable reason per rejection rule of the MIP (spec 00021 FR-102). UC-1 replaces the
 * one-byte `val-len` ceiling (`val_len_too_long`) with the package bound: a declared
 * length whose bytes the package does not hold (`68 + val-len > 256·k`) is
 * `val_len_beyond_package` — the reason the UmbraDB token indexer uses too.
 */
export type RejectReason =
  | 'payload_size'
  | 'kind_unknown'
  | 'key_empty'
  /** MIP section 5.1: a `/metadata/` key that is not a valid RFC 6901 pointer. */
  | 'key_pointer_invalid'
  | 'val_type_reserved'
  | 'val_len_beyond_package'
  | 'val_type_rule';

export type Verdict =
  /** Not a TokenMetadata event at all (MIP section 1): ignore it silently. */
  | { outcome: 'ignored'; reason: 'event_name' }
  | { outcome: 'rejected'; reason: RejectReason }
  | { outcome: 'accepted' };

function isValidUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function isAbsoluteUri(text: string): boolean {
  try {
    const url = new URL(text);
    return url.protocol.length > 1;
  } catch {
    return false;
  }
}

/**
 * MIP section 2.1, val-type 3: the meaningful bytes must be ONE complete JSON
 * value (RFC 8259) — an object, an array or a scalar. `JSON.parse` is exactly
 * that test: it accepts a single complete value with optional surrounding
 * whitespace and rejects a fragment, a truncation or trailing content. The
 * multipart `metadata/<n>` convention this repository used against the #315
 * draft does not survive it, which is the point: the MIP defines no reassembly.
 */
function isOneCompleteJsonValue(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return false;
  }
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * RFC 6901: a JSON Pointer is the empty string or a sequence of `/`-prefixed
 * reference tokens, in which the only legal `~` escapes are `~0` (a literal
 * `~`) and `~1` (a literal `/`). Written by hand rather than as a regular
 * expression so the rule reads as the RFC states it.
 */
export function isJsonPointer(text: string): boolean {
  if (text.length === 0) return true;
  if (!text.startsWith('/')) return false;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '~') continue;
    const next = text[i + 1];
    if (next !== '0' && next !== '1') return false;
    i += 1;
  }
  return true;
}

/** The key bytes with trailing NULs dropped — the identity MIP section 5.1 compares. */
export function trimmedKey(key: Uint8Array): Uint8Array {
  let end = key.length;
  while (end > 0 && key[end - 1] === 0) end -= 1;
  return key.subarray(0, end);
}

function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i += 1) if (bytes[i] !== prefix[i]) return false;
  return true;
}

/**
 * MIP section 2.1, val-type 2: the meaningful prefix is the canonical Compact
 * serialization of `Uint<8 * val-len>`, which is LITTLE-ENDIAN — the low byte
 * first. Verified against `@midnight-ntwrk/compact-runtime` 0.19.0
 * (`convertBigintToBytes(16, 6n)` = `06` + fifteen NULs) and against a compiled
 * `Uint<128>` ledger cell holding 258, whose aligned atom is `0201` under a
 * compiler-declared 16-byte alignment. MIP Appendix A prints the same bytes.
 */
export function decodeInteger(bytes: Uint8Array): bigint {
  let value = 0n;
  for (let i = bytes.length - 1; i >= 0; i -= 1) value = (value << 8n) | BigInt(bytes[i]!);
  return value;
}

/** The 16 canonical bytes of `serialize<Uint<128>, N>(value)`, little-endian. */
export function encodeInteger(value: bigint, length = DEFAULT_INTEGER_LEN): Uint8Array {
  if (value < 0n) throw new Error('val-type 2 is unsigned');
  const out = new Uint8Array(length);
  let rest = value;
  for (let i = 0; i < length; i += 1) {
    out[i] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  if (rest !== 0n) throw new Error(`${value} does not fit in ${length} bytes`);
  return out;
}

/**
 * Applies MIP sections 1, 2.1, 2.2, 3 and 5.1 and UC-1 to a decoded package, in
 * payload offset order. Appendix A's per-key rules are NOT applied here: a
 * well-known key carrying the wrong type is still a valid declaration at the
 * transport level and is stored as a trait (MIP sections 5.2, 5.3 and 7.1). The
 * bytes after the value are ignored, whatever they are (MIP; spec 00024 Q11).
 */
export function validateTokenMetadataEvent(event: TokenMetadataEvent): Verdict {
  if (event.eventName !== EVENT_NAME) return { outcome: 'ignored', reason: 'event_name' };
  if (event.payload.length === 0 || event.payload.length % PART_SIZE !== 0) {
    return { outcome: 'rejected', reason: 'payload_size' };
  }
  if (event.kind > 3) return { outcome: 'rejected', reason: 'kind_unknown' };

  const key = trimmedKey(event.key);
  if (key.length === 0) return { outcome: 'rejected', reason: 'key_empty' };
  // MIP section 5.1: every other key is bytes and is NEVER rejected for its
  // encoding; a `/metadata/` key is the one exception — it must be valid UTF-8
  // and a valid RFC 6901 pointer.
  if (startsWith(key, new TextEncoder().encode(METADATA_POINTER_PREFIX))) {
    if (!isValidUtf8(key)) return { outcome: 'rejected', reason: 'key_pointer_invalid' };
    if (!isJsonPointer(new TextDecoder().decode(key))) {
      return { outcome: 'rejected', reason: 'key_pointer_invalid' };
    }
  }

  if (event.valType >= VAL_TYPE_RESERVED_FROM) return { outcome: 'rejected', reason: 'val_type_reserved' };
  // UC-1: any length 0..65535, as long as the package holds it.
  if (HEADER_SIZE + event.len > event.payload.length) {
    return { outcome: 'rejected', reason: 'val_len_beyond_package' };
  }

  const bytes = event.payload.subarray(HEADER_SIZE, HEADER_SIZE + event.len);
  switch (event.valType) {
    case VAL_TYPE_OPAQUE:
      break;
    case VAL_TYPE_STRING:
      if (!isValidUtf8(bytes)) return { outcome: 'rejected', reason: 'val_type_rule' };
      break;
    case VAL_TYPE_JSON:
      // ONE complete JSON value, not a fragment (MIP section 2.1).
      if (!isOneCompleteJsonValue(bytes)) return { outcome: 'rejected', reason: 'val_type_rule' };
      break;
    case VAL_TYPE_INTEGER:
      // `Uint<8>` through `Uint<248>`: 1..31 bytes, any permitted width.
      if (event.len < MIN_INTEGER_LEN || event.len > MAX_INTEGER_LEN) {
        return { outcome: 'rejected', reason: 'val_type_rule' };
      }
      break;
    case VAL_TYPE_URI:
      if (!isValidUtf8(bytes)) return { outcome: 'rejected', reason: 'val_type_rule' };
      if (!isAbsoluteUri(new TextDecoder().decode(bytes))) {
        return { outcome: 'rejected', reason: 'val_type_rule' };
      }
      break;
    case VAL_TYPE_NULL:
      // MIP section 2.1: `serialize<[], 0>([])` is zero bytes, so `val-len`
      // MUST be zero; every value byte is ignored either way.
      if (event.len !== 0) return { outcome: 'rejected', reason: 'val_type_rule' };
      break;
    default:
      return { outcome: 'rejected', reason: 'val_type_reserved' };
  }
  return { outcome: 'accepted' };
}

// ---------------------------------------------------------------------------
// Simulator harness
// ---------------------------------------------------------------------------

/** A contract as compactc generates it: `new Contract(witnesses)`. */
export interface GeneratedContract<PS> {
  initialState(context: unknown, ...args: any[]): Promise<{
    currentContractState: { data: unknown };
    currentPrivateState: PS;
  }>;
  impureCircuits: Record<string, (context: any, ...args: any[]) => Promise<any>>;
}

export const ZERO_COIN_PK = '0'.repeat(64);

// ---------------------------------------------------------------------------
// The emitter secret (contracts/TokenMetadata.compact, spec 00024 Q12)
// ---------------------------------------------------------------------------

/** The commitment's domain tag, before NUL padding to 32 bytes. */
export const EMITTER_DOMAIN = 'mip-0018:emitter:';

/**
 * `TM_emitterSecretHashOf(secret)` off chain: Compact's
 * `persistentHash<Vector<2, Bytes<32>>>([pad(32, "mip-0018:emitter:"), secret])`,
 * which is SHA-256 over the 64 concatenated bytes. The constructor argument.
 */
export function emitterSecretHashOf(secret: Uint8Array): Uint8Array {
  if (secret.length !== 32) throw new Error('the emitter secret is 32 bytes');
  return Uint8Array.from(createHash('sha256').update(pad(32, EMITTER_DOMAIN)).update(secret).digest());
}

/** Private state that answers the `emitterSecret` witness. */
export interface EmitterState {
  emitterSecret: Uint8Array;
}

/** The witness every contract that calls `TM_assertEmitter()` needs. */
export const emitterWitnesses = {
  emitterSecret: <PS extends EmitterState>({ privateState }: { privateState: PS }): [PS, Uint8Array] => [
    privateState,
    privateState.emitterSecret,
  ],
};

/** A fixed test secret and a different one for the stranger cases. */
export const TEST_EMITTER_SECRET = new Uint8Array(32).fill(0x42);
export const STRANGER_EMITTER_SECRET = new Uint8Array(32).fill(0x24);

export interface Call {
  result: unknown;
  /** Every `misc` log event of this call on its own, decoded as a one-part package. */
  events: TokenMetadataEvent[];
  /** The Multi-Part Event rule over this call (one intent): the packages it published. */
  packages: TokenMetadataEvent[];
  rawEvents: unknown[];
  /** The transcript effects — `shieldedMints`, `unshieldedMints`, … */
  effects: any;
}

/**
 * Deploys a generated contract in memory and returns a `call` helper that
 * threads the state forward the way a chain would. Follows the harness the
 * shielded-night v2 contract uses against this same runtime (0.19.0).
 */
export async function deploy<PS>(
  contract: GeneratedContract<PS>,
  privateState: PS,
  constructorArgs: unknown[] = [],
  options: { coinPublicKey?: string; address?: string } = {},
) {
  const coinPublicKey = options.coinPublicKey ?? ZERO_COIN_PK;
  const address = options.address ?? sampleContractAddress();
  const init = await contract.initialState(
    createConstructorContext(privateState, coinPublicKey),
    ...constructorArgs,
  );

  let state: unknown = init.currentContractState.data;
  let currentPrivateState: PS = init.currentPrivateState;

  return {
    address,
    get privateState() {
      return currentPrivateState;
    },
    get state() {
      return state;
    },
    /** Calls one circuit and commits its resulting state, like a block would. */
    async call(circuitId: string, ...args: unknown[]): Promise<Call> {
      const circuit = contract.impureCircuits[circuitId];
      if (!circuit) throw new Error(`no such circuit: ${circuitId}`);
      const context = createCircuitContext(
        circuitId,
        address,
        coinPublicKey,
        state as never,
        currentPrivateState,
      );
      const results = await circuit(context, ...args);
      state = results.context.callContext.currentQueryContext.state;
      currentPrivateState = results.context.callContext.currentPrivateState ?? currentPrivateState;
      return {
        result: results.result,
        events: decodeAll(results.context.events),
        packages: packagesOf(results.context.events),
        rawEvents: results.context.events,
        effects: results.context.callContext.currentQueryContext.effects,
      };
    },
  };
}
