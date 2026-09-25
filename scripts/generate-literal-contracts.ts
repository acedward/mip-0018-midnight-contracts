/**
 * Generate one Compact contract per row of `deployments/reference-set.json`, with every
 * TokenMetadata payload (MIP-0018 on the UC-1 layout: 2-byte little-endian `val-len`,
 * value from offset 68 — see contracts/TokenMetadata.compact) written as a
 * COMPILE-TIME LITERAL.
 *
 * Why (question Q13, decided 2026-09-17):
 *   A `Misc` event whose payload contains runtime bytes costs ~26 000 rows for a single
 *   runtime byte and 416 601 rows (k=19) for the three-field `publishMetadata` of the
 *   parameterised templates in `contracts/`. A k=19 proving key is 134 MB and takes about
 *   six minutes of `zkir`; the full template set is ~1.5 h and ~1.5 GB, and whether such a
 *   proof fits a 6 GiB proof server was never established.
 *   The same event with an all-literal payload is 23 rows (k=7): a 40 KB key generated in
 *   seconds. The bytes on the wire are IDENTICAL — the standard is unchanged, only these
 *   reference contracts choose to bake their own metadata in rather than take it at call
 *   time. The parameterised templates stay in `contracts/` as the reference implementation
 *   of the standard, with their measured cost documented in TOKEN-METADATA.md.
 *
 * Who may emit (spec 00024 Q12): every generated contract takes ONE constructor argument,
 * `emitterSecretHash` (`TM_emitterSecretHashOf(secret)`, computed off chain), and every
 * emitting circuit calls `TM_assertEmitter()` before it emits — the module's emitter
 * secret, answered by the `emitterSecret` witness from the deployer's private state. That
 * check is the only runtime input of an emitting circuit (~4 100 rows, k=13).
 *
 * What the generated contracts deliberately do NOT have:
 *   - `Ownable` or any free-form setter: every update is a pre-written circuit.
 *   - `Opaque<"string">` metadata and the OpenZeppelin token modules: the generated
 *     contracts talk to the standard library directly, so every value in them is visible
 *     in the source.
 *
 * The set it writes (spec 00024 §6.A, "the MIP-18 set"): the `18` variant of every row —
 * `LSUN18` … `LLIAR18`, "Ledger Sun · MIP-18", domain separators `umbra:lsun18` /
 * `cnst18:orion` — with ONE declaration per circuit (UC-1: each call is its own intent, so
 * its own package), a value longer than 188 bytes emitted as all of its parts from that one
 * call, and a `repository` declaration (val-type 4) of the contract's own source URL on
 * `main` wherever the reference set places a `publishRepository` step.
 *
 * Usage:
 *   npx tsx scripts/generate-literal-contracts.ts              # every row
 *   npx tsx scripts/generate-literal-contracts.ts SSTAR UCOM18 # selected rows (base or variant id)
 *
 * Writes `contracts/generated/<ID>.compact` and `deployments/generated-matrix.json`
 * (the step-by-step deployment plan `scripts/deploy-and-publish.ts` executes).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL(import.meta.url).pathname, '..', '..');
const REFERENCE_SET = path.join(ROOT, 'deployments', 'reference-set.json');
const OUT_CONTRACTS = path.join(ROOT, 'contracts', 'generated');
const OUT_MATRIX = path.join(ROOT, 'deployments', 'generated-matrix.json');

const KEY_SIZE = 32;
/** UC-1: one event's payload is one part of a package. */
const PART_SIZE = 256;
/** UC-1: domainSep 32 + kind 1 + key 32 + val-type 1 + val-len 2 (little-endian). */
const HEADER_SIZE = 68;
/** UC-1: one event (a one-part package) holds 188 value bytes after the 68-byte header. */
const VALUE_SIZE = PART_SIZE - HEADER_SIZE;
/** UC-1: `val-len` is a `Uint<16>`. */
const MAX_VAL_LEN = 0xffff;

/** UC-1: the parts a value of `len` bytes needs, `ceil((68 + len) / 256)`, at least 1. */
const partsFor = (len: number): number => Math.max(1, Math.ceil((HEADER_SIZE + len) / PART_SIZE));
const DOMAIN_SIZE = 32;

/**
 * MIP section 2.1 — the `val-type` byte.
 *
 * 0 opaque · 1 UTF-8 string · 2 unsigned integer (Compact `Uint<8*val-len>`,
 * little-endian, 1..31 bytes) · 3 ONE complete UTF-8 JSON value ·
 * 4 UTF-8 absolute URI · 5 Null (val-len 0) · 6..255 reserved (a consumer rejects).
 */
const VAL_TYPE_OPAQUE = 0;
const VAL_TYPE_STRING = 1;
const VAL_TYPE_INTEGER = 2;
const VAL_TYPE_JSON = 3;
const VAL_TYPE_URI = 4;
const VAL_TYPE_NULL = 5;
/** 6..255 are reserved; nothing here may emit one on purpose. */
const VAL_TYPE_RESERVED_FROM = 6;

/** MIP section 2.1: val-type 2 is `Uint<8>`..`Uint<248>`, so 1..31 bytes. */
const MIN_INTEGER_LEN = 1;
const MAX_INTEGER_LEN = 31;
/** MIP Appendix A's recommended emitter default for val-type 2: `Uint<128>`. */
const INTEGER_LEN = 16;

/** MIP section 5.1: keys under this prefix must be valid RFC 6901 pointers. */
const METADATA_POINTER_PREFIX = '/metadata/';

/**
 * The val-type MIP Appendix A gives each example key. A step in the reference
 * set may state its own `valType`; this is the fallback, and an unknown key
 * defaults to a UTF-8 string.
 *
 * `magnitude` is deliberately type 1 and not 2: the collection's magnitudes are
 * decimals with a fraction ("1.25") and type 2 is integers only (spec 00021 Q6).
 */
const WELL_KNOWN_VAL_TYPE: Record<string, number> = {
  name: VAL_TYPE_STRING,
  symbol: VAL_TYPE_STRING,
  decimals: VAL_TYPE_INTEGER,
  metadata: VAL_TYPE_JSON,
  tokenUri: VAL_TYPE_URI,
  description: VAL_TYPE_STRING,
  magnitude: VAL_TYPE_STRING,
  hemisphere: VAL_TYPE_STRING,
};

/**
 * Everything falls back to text. There is deliberately NO `metadata/<n>` rule
 * any more: MIP-0018 defines no multipart representation or reassembly
 * (section 5.4), and a JSON fragment is not one complete JSON value, so a
 * `metadata/<n>` part emitted as val-type 3 would be REJECTED by a conforming
 * consumer rather than reassembled.
 */
function valTypeFor(key: string, declared: number | undefined): number {
  if (declared !== undefined) return declared;
  return WELL_KNOWN_VAL_TYPE[key] ?? VAL_TYPE_STRING;
}

/**
 * RFC 6901, as MIP section 5.1 requires of a `/metadata/` key: `/`-prefixed
 * reference tokens whose only legal `~` escapes are `~0` and `~1`.
 */
function isJsonPointer(text: string): boolean {
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

/**
 * MIP section 5.1, from the emitter's side. Any key may be arbitrary bytes and
 * is never rejected for its encoding — except one under `/metadata/`, which
 * must be a valid RFC 6901 JSON Pointer or the whole event is rejected.
 */
function assertKeyIsValid(where: string, key: string): void {
  if (key.length === 0) throw new Error(`${where}: an empty key is rejected (MIP section 2.2)`);
  if (!key.startsWith(METADATA_POINTER_PREFIX)) return;
  if (!isJsonPointer(key)) {
    throw new Error(`${where}: "${key}" is not a valid RFC 6901 pointer (MIP section 5.1)`);
  }
}

/**
 * MIP section 2.1 again, from the emitter's side: an event whose value breaks
 * its declared type's rule MUST be rejected by every consumer, so the generator
 * refuses to write one.
 */
function assertValueMatchesType(where: string, valType: number, value: Uint8Array): void {
  if (valType < VAL_TYPE_OPAQUE || valType >= VAL_TYPE_RESERVED_FROM) {
    throw new Error(`${where}: val-type ${valType} is reserved (MIP section 2.1)`);
  }
  const text = Buffer.from(value).toString('utf8');
  const roundTrips = Buffer.from(text, 'utf8').equals(Buffer.from(value));
  if ((valType === VAL_TYPE_STRING || valType === VAL_TYPE_JSON || valType === VAL_TYPE_URI) && !roundTrips) {
    throw new Error(`${where}: val-type ${valType} requires valid UTF-8`);
  }
  if (valType === VAL_TYPE_INTEGER && (value.length < MIN_INTEGER_LEN || value.length > MAX_INTEGER_LEN)) {
    throw new Error(
      `${where}: val-type 2 requires ${MIN_INTEGER_LEN} <= val-len <= ${MAX_INTEGER_LEN}, got ${value.length}`,
    );
  }
  if (valType === VAL_TYPE_JSON) {
    // ONE complete JSON value (MIP section 2.1). A fragment is rejected, which
    // is exactly what retires the old `metadata/<n>` convention.
    if (value.length === 0) throw new Error(`${where}: val-type 3 cannot be empty`);
    try {
      JSON.parse(text);
    } catch (error) {
      throw new Error(`${where}: val-type 3 requires ONE complete JSON value — ${String(error)}`);
    }
  }
  if (valType === VAL_TYPE_URI) {
    let absolute = false;
    try {
      absolute = new URL(text).protocol.length > 1;
    } catch {
      absolute = false;
    }
    if (!absolute) throw new Error(`${where}: val-type 4 requires an absolute URI, got "${text}"`);
  }
  if (valType === VAL_TYPE_NULL && value.length !== 0) {
    throw new Error(`${where}: val-type 5 (Null) requires val-len 0, got ${value.length}`);
  }
}

/**
 * MIP section 2.1, val-type 2: the value is the canonical Compact serialization
 * of `Uint<8 * val-len>`, which is LITTLE-ENDIAN — verified against
 * `@midnight-ntwrk/compact-runtime` 0.19.0 (`convertBigintToBytes(16, 6n)` is
 * `06` followed by fifteen NULs) and against a compiled `Uint<128>` ledger cell
 * holding 258, whose aligned atom is `0201` under a compiler-declared 16-byte
 * alignment. MIP Appendix A prints exactly these bytes for `6` as `Uint<128>`.
 */
function integerBytes(value: number, length = INTEGER_LEN): Uint8Array {
  if (!Number.isInteger(value) || value < 0) throw new Error(`val-type 2 is an unsigned integer: ${value}`);
  const out = new Uint8Array(length);
  let rest = BigInt(value);
  for (let i = 0; i < length; i += 1) {
    out[i] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  if (rest !== 0n) throw new Error(`${value} does not fit in ${length} bytes`);
  return out;
}

// ---------------------------------------------------------------------------
// the reference set as data
// ---------------------------------------------------------------------------

interface Step {
  op: string;
  key?: string;
  valType?: number;
  value?: string;
  to?: string;
  amount?: string;
  nonce?: string;
  piece?: string;
  pieceName?: string;
  /** `publishRepository` on a dual token: which kind byte the declaration is for. */
  kind?: number;
}

interface Row {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  kind: number;
  template: string;
  domain?: string;
  pieces?: string[];
  optional?: boolean;
  expect: Record<string, unknown>;
  steps: Step[];
}

/**
 * The variant this repository publishes (spec 00024 §6.A, "the MIP-18 set"): every id,
 * symbol, name and domain separator carries it, so the eleven contracts are `LSUN18` …
 * `LLIAR18` ("Ledger Sun · MIP-18", `umbra:lsun18`, `cnst18:orion`). The reference set
 * itself keeps the base names; the variant is applied here, once.
 */
const VARIANT = { suffix: '18', label: 'MIP-18' } as const;

/** Where every generated contract's own source lives — the `repository` declaration's value. */
const REPOSITORY_BLOB = 'https://github.com/acedward/mip-0018-midnight-contracts/blob/main/contracts/generated';

/** MIP Appendix A: `symbol` is at most 32 bytes. */
const MAX_SYMBOL_LEN = 32;

const variantOf = (row: Row): Row => {
  const name = `${row.name} · ${VARIANT.label}`;
  const symbol = `${row.symbol}${VARIANT.suffix}`;
  if (Buffer.byteLength(symbol, 'utf8') > MAX_SYMBOL_LEN) {
    throw new Error(`${row.id}: variant symbol "${symbol}" is longer than ${MAX_SYMBOL_LEN} bytes`);
  }
  return {
    ...row,
    id: `${row.id}${VARIANT.suffix}`,
    name,
    symbol,
    domain: row.domain === undefined ? undefined : `${row.domain}${VARIANT.suffix}`,
    // A collection's piece names start with the collection's name ("Constellations · Orion"),
    // and a rename keeps the variant ("Ledger Moon · MIP-18 (renamed)").
    steps: row.steps.map((step) => {
      if (step.pieceName) return { ...step, pieceName: step.pieceName.replace(row.name, name) };
      if (step.key === 'name' && step.value?.startsWith(row.name)) {
        return { ...step, value: step.value.replace(row.name, name) };
      }
      return step;
    }),
  };
};

const referenceSet = JSON.parse(readFileSync(REFERENCE_SET, 'utf8')) as { rows: Row[] };
/** The reference set as this repository deploys it: the variant of every row. */
const variantRows = referenceSet.rows.map(variantOf);

// ---------------------------------------------------------------------------
// bytes
// ---------------------------------------------------------------------------

const utf8 = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'utf8'));

const padTo = (bytes: Uint8Array, size: number): Uint8Array => {
  if (bytes.length > size) {
    throw new Error(`value of ${bytes.length} bytes does not fit in ${size}`);
  }
  const out = new Uint8Array(size);
  out.set(bytes);
  return out;
};

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');

/**
 * A Compact literal for `size` bytes whose meaningful prefix is `text`.
 *
 * `pad(size, "…")` is used when the text is plain printable ASCII with nothing the Compact
 * lexer would have to escape, because it keeps the generated source readable. Anything else
 * (JSON with quotes, the "·" in the Constellations piece names, any non-ASCII byte) is
 * written as an explicit byte array, so the emitted bytes never depend on how the compiler
 * reads a string literal.
 */
const byteLiteral = (bytes: Uint8Array, size: number): string => {
  padTo(bytes, size); // bounds check only: the literal below spells out `size` bytes
  // Trailing NULs inside the meaningful prefix are byte-for-byte the same as the
  // NUL padding that follows them, so they come from the one `pad(...)` spread
  // rather than a wall of `0x00`. This is what keeps a 16-byte `Uint<128>`
  // `decimals` value readable as `Bytes[0x06, ...pad(188, "")]`.
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end -= 1;
  const meaningful = bytes.subarray(0, end);
  const simple =
    meaningful.every((b) => b >= 0x20 && b <= 0x7e && b !== 0x22 && b !== 0x5c);
  if (simple) {
    return `pad(${size}, "${Buffer.from(meaningful).toString('latin1')}")`;
  }
  if (meaningful.length === 0) return `pad(${size}, "")`;
  const items: string[] = [];
  for (const b of meaningful) items.push(`0x${b.toString(16).padStart(2, '0')}`);
  // Trailing NULs come from one `pad` spread rather than a wall of 0x00, exactly as
  // TokenMetadata.compact itself writes `Bytes[decimals_, ...pad(188, "")]`.
  if (meaningful.length < size) items.push(`...pad(${size - meaningful.length}, "")`);
  const lines: string[] = [];
  for (let i = 0; i < items.length; i += 12) {
    lines.push('    ' + items.slice(i, i + 12).join(', '));
  }
  return items.length <= 12 ? `Bytes[${items.join(', ')}]` : `Bytes[\n${lines.join(',\n')}\n  ]`;
};

// ---------------------------------------------------------------------------
// the events a row emits
// ---------------------------------------------------------------------------

interface Emit {
  /** the piece label for a collection row, otherwise null */
  piece: string | null;
  domain: string;
  domainSepHex: string;
  kind: number;
  key: string;
  /** MIP section 2.1 — how a consumer reads `value` */
  valType: number;
  /** the meaningful value bytes (before NUL padding to the end of the package) */
  value: Uint8Array;
  /** the value region of the package: `value`, NUL-padded to 256·parts − 68 bytes */
  valueHex: string;
  len: number;
  /** UC-1: how many events (parts) the declaration's package takes */
  parts: number;
  /** the exact package bytes, 256·parts, that one circuit call emits */
  payloadHex: string;
  /** printable form for the matrix file */
  text: string | null;
}

/** A piece's domain is `<collection symbol>:<piece>` (`cnst18:orion`); a token's is the row's. */
const domainFor = (row: Row, piece?: string): string =>
  piece ? `${row.symbol.toLowerCase()}:${piece}` : (row.domain ?? `umbra:${row.symbol.toLowerCase()}`);

const makeEmit = (
  row: Row,
  key: string,
  valType: number,
  value: Uint8Array,
  text: string | null,
  piece?: string,
): Emit => {
  if (value.length > MAX_VAL_LEN) {
    throw new Error(`${row.id}: value for "${key}" is ${value.length} bytes (UC-1 val-len max ${MAX_VAL_LEN})`);
  }
  assertKeyIsValid(`${row.id}/${key}`, key);
  assertValueMatchesType(`${row.id}/${key}`, valType, value);
  const domain = domainFor(row, piece);
  const domainSep = padTo(utf8(domain), DOMAIN_SIZE);
  const parts = partsFor(value.length);
  // The package exactly as the circuit emits it (UC-1): header, value, NUL padding.
  const payload = new Uint8Array(parts * PART_SIZE);
  payload.set(domainSep, 0);
  payload[32] = row.kind;
  payload.set(padTo(utf8(key), KEY_SIZE), 33);
  payload[65] = valType;
  payload[66] = value.length & 0xff; // val-len, little-endian
  payload[67] = value.length >> 8;
  payload.set(value, HEADER_SIZE);
  return {
    piece: piece ?? null,
    domain,
    domainSepHex: hex(domainSep),
    kind: row.kind,
    key,
    valType,
    value,
    valueHex: hex(payload.subarray(HEADER_SIZE)),
    len: value.length,
    parts,
    payloadHex: hex(payload),
    text,
  };
};

/**
 * The three core example fields of MIP Appendix A: name (1), symbol (1),
 * decimals (2 as `Uint<128>`, val-len 16 — Appendix A's recommended width).
 */
const standardEmits = (row: Row, name: string, piece?: string): Emit[] => [
  makeEmit(row, 'name', VAL_TYPE_STRING, utf8(name), name, piece),
  makeEmit(row, 'symbol', VAL_TYPE_STRING, utf8(row.symbol), row.symbol, piece),
  makeEmit(row, 'decimals', VAL_TYPE_INTEGER, integerBytes(row.decimals), String(row.decimals), piece),
];

/**
 * The meaningful value bytes a metadata step carries. A Null step (val-type 5)
 * has none: `val-len` MUST be zero and all 189 `value` bytes are ignored
 * (MIP sections 2.1 and 2.2).
 */
const stepValue = (step: Step, valType: number): { bytes: Uint8Array; text: string | null } => {
  if (valType === VAL_TYPE_NULL) {
    if (step.value !== undefined) {
      throw new Error(`a val-type 5 (Null) step carries no value; got "${step.value}"`);
    }
    return { bytes: new Uint8Array(0), text: null };
  }
  // A val-type 2 step states its number in decimal and travels as the
  // little-endian `Uint<128>` serialization — NOT as the digits' UTF-8 bytes,
  // which would decode to a different number entirely.
  if (valType === VAL_TYPE_INTEGER) {
    return { bytes: integerBytes(Number(step.value!)), text: step.value! };
  }
  return { bytes: utf8(step.value!), text: step.value! };
};

// ---------------------------------------------------------------------------
// grouping steps into circuits
// ---------------------------------------------------------------------------

type PlannedStep =
  | { kind: 'emit'; circuit: string; emits: Emit[]; sourceOps: string[] }
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

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** A key as part of a circuit name: `/metadata/description` → `MetadataDescription`. */
const keyIdent = (key: string): string =>
  key
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part.length > 0)
    .map(capitalize)
    .join('') || 'Key';

/**
 * Walks a row's ordered steps and produces the ordered circuit calls the deployment makes.
 *
 * ONE DECLARATION PER CIRCUIT (UC-1, spec 00024 FR-019): every metadata declaration is a
 * circuit of its own, called once, in a transaction of its own — its own intent, so its
 * own package. Nothing is ever folded: two declarations in one intent would be merged by
 * the Multi-Part Event rule into one package, and all but the first would be lost. A long
 * value is still ONE circuit: it emits all of its parts from that one call.
 *
 * Circuit names say what they declare: `publish` + [kind, for a dual token] + [piece] +
 * the key (`publishName`, `publishUnshieldedSymbol`, `publishOrionTokenUri`, …); a Null is
 * `clear…`; a key declared again gets an ordinal (`publishName2`, `publishOrionMagnitude3`).
 */
function planSteps(row: Row): PlannedStep[] {
  const planned: PlannedStep[] = [];
  const used = new Map<string, number>();
  const nameFor = (base: string): string => {
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    return n === 1 ? base : `${base}${n}`;
  };
  const dual = row.template === 'NativeDualToken';
  const declare = (emit: Emit, op: string): void => {
    const kindLabel = dual ? (emit.kind === 0 ? 'Unshielded' : 'Shielded') : '';
    const piece = emit.piece ? capitalize(emit.piece) : '';
    const verb = emit.valType === VAL_TYPE_NULL ? 'clear' : 'publish';
    planned.push({ kind: 'emit', circuit: nameFor(`${verb}${kindLabel}${piece}${keyIdent(emit.key)}`), emits: [emit], sourceOps: [op] });
  };
  const repositoryEmit = (kind: number, piece?: string): Emit => {
    const url = `${REPOSITORY_BLOB}/${row.id}.compact`;
    return makeEmit({ ...row, kind }, 'repository', VAL_TYPE_URI, utf8(url), url, piece);
  };

  for (const step of row.steps) {
    switch (step.op) {
      case 'publishMetadata':
        for (const emit of standardEmits(row, row.name)) declare(emit, step.op);
        break;
      case 'publishUnshielded':
        for (const emit of standardEmits({ ...row, kind: 0 }, row.name)) declare(emit, step.op);
        break;
      case 'publishShielded':
        for (const emit of standardEmits({ ...row, kind: 1 }, row.name)) declare(emit, step.op);
        break;
      case 'publishPiece':
        for (const emit of standardEmits(row, step.pieceName ?? row.name, step.piece)) declare(emit, step.op);
        break;
      case 'publishRepository':
        declare(repositoryEmit(step.kind ?? row.kind, step.piece), step.op);
        break;
      case 'setMetadata': {
        const valType = valTypeFor(step.key!, step.valType);
        const { bytes, text } = stepValue(step, valType);
        declare(makeEmit(row, step.key!, valType, bytes, text), step.op);
        break;
      }
      case 'setPieceTrait': {
        const valType = valTypeFor(step.key!, step.valType);
        const { bytes, text } = stepValue(step, valType);
        declare(makeEmit(row, step.key!, valType, bytes, text, step.piece), step.op);
        break;
      }
      case 'mint':
      case 'mintShielded':
      case 'mintUnshielded':
      case 'mintPiece': {
        const piece = step.piece ?? null;
        const domain = domainFor(row, step.piece);
        const shielded =
          step.op === 'mintShielded' ||
          step.op === 'mintPiece' ||
          (step.op === 'mint' && (row.kind & 1) === 1);
        planned.push({
          kind: 'mint',
          circuit: step.op === 'mintPiece' ? 'mintPiece' : step.op === 'mint' ? 'mint' : step.op,
          mintKind: shielded ? 'shielded' : 'unshielded',
          piece,
          domain,
          domainSepHex: hex(padTo(utf8(domain), DOMAIN_SIZE)),
          to: step.to ?? 'owner',
          amount: step.amount ?? '1',
          nonce: step.nonce ?? null,
        });
        break;
      }
      case 'ledgerMint':
      case 'transfer':
        planned.push({
          kind: 'ledger',
          circuit: step.op === 'ledgerMint' ? 'ledgerMint' : 'transfer',
          op: step.op,
          to: step.to ?? 'owner',
          amount: step.amount ?? '0',
        });
        break;
      default:
        throw new Error(`${row.id}: unknown step op "${step.op}"`);
    }
  }
  return planned;
}

// ---------------------------------------------------------------------------
// Compact source
// ---------------------------------------------------------------------------

const VAL_TYPE_NAME: Record<number, string> = {
  0: 'opaque',
  1: 'string',
  2: 'integer',
  3: 'JSON',
  4: 'URI',
  5: 'Null',
};

const emitCall = (emit: Emit): string => {
  const domain = byteLiteral(utf8(emit.domain), DOMAIN_SIZE);
  const key = byteLiteral(utf8(emit.key), KEY_SIZE);
  const full =
    emit.valType === VAL_TYPE_NULL
      ? 'Null — the current value is cleared, the history is not'
      : emit.text === null
        ? '<bytes>'
        : JSON.stringify(emit.text);
  // Keep the comment readable: a long value is spelled out in the literals below anyway.
  const shown = full.length > 120 ? `${full.slice(0, 117)}…` : full;
  const comment = `  // ${emit.piece ? `${emit.piece}: ` : ''}${emit.key} = ${shown} (val-type ${emit.valType} ${
    VAL_TYPE_NAME[emit.valType]
  }, val-len ${emit.len}${emit.parts > 1 ? `, ${emit.parts} parts` : ''})`;
  if (emit.parts === 1) {
    return `${comment}
  TM_emitTokenMetadata(${domain}, ${emit.kind}, ${key}, ${emit.valType}, ${emit.len}, ${byteLiteral(emit.value, VALUE_SIZE)});`;
  }
  // UC-1 multi-part: ONE call emits the head (header + the first 188 value bytes) and then
  // every 256-byte continuation part, in order, in one intent ([Y] §5). All literal.
  const lines = [
    comment,
    `  TM_emitHead(${domain}, ${emit.kind}, ${key}, ${emit.valType}, ${emit.len}, ${byteLiteral(
      emit.value.subarray(0, VALUE_SIZE),
      VALUE_SIZE,
    )});`,
  ];
  for (let offset = VALUE_SIZE, part = 2; offset < emit.value.length; offset += PART_SIZE, part += 1) {
    lines.push(`  // part ${part} of ${emit.parts}`);
    lines.push(`  TM_emitPart(${byteLiteral(emit.value.subarray(offset, offset + PART_SIZE), PART_SIZE)});`);
  }
  return lines.join('\n');
};

/** The events (parts) a step emits: one per one-part declaration, `parts` per long one. */
const eventsOf = (step: Extract<PlannedStep, { kind: 'emit' }>): number =>
  step.emits.reduce((n, e) => n + e.parts, 0);

/**
 * One declaration's circuit. It writes no ledger state — every part of a package runs
 * from the same pre-state, and calling it again only re-declares the same value (last
 * write wins) — and checks the emitter secret before it emits anything.
 */
const emitCircuit = (step: Extract<PlannedStep, { kind: 'emit' }>): string => {
  const body = step.emits.map(emitCall).join('\n');
  const parts = eventsOf(step);
  return `/**
 * @description ${step.sourceOps.join(' + ')} — one declaration, ${
    parts === 1 ? 'one TokenMetadata event' : `${parts} TokenMetadata events (${parts} parts, one intent)`
  }, every byte a compile-time literal. Emitter only.
 */
export circuit ${step.circuit}(): [] {
  TM_assertEmitter();
${body}
}`;
};

const HEADER = (row: Row, planned: PlannedStep[]): string => `// SPDX-License-Identifier: Apache-2.0
//
// GENERATED FILE — do not edit. Produced by scripts/generate-literal-contracts.ts from
// deployments/reference-set.json row "${row.id.slice(0, -VARIANT.suffix.length)}", ${VARIANT.label} variant:
// ${row.id} (${row.name}). Source of truth for its \`repository\` declaration:
// ${REPOSITORY_BLOB}/${row.id}.compact
//
// ${row.name} (${row.symbol}), ${row.decimals} decimals, kind byte ${row.kind}, template
// ${row.template}. Every TokenMetadata payload below is a compile-time literal (MIP-0018 on
// the UC-1 layout: 2-byte little-endian val-len, value from offset 68), so an emitting
// circuit costs a few rows per event plus the emitter-secret check (~4 100 rows, k=13)
// instead of the ~120 000 rows per runtime event the parameterised templates in contracts/
// pay — see TOKEN-METADATA.md "Circuit cost". Only the emitter (the holder of the secret
// whose hash the constructor stores) can call an emitting circuit.
//
// Circuits the deployment calls, in order:
${planned.map((s) => `//   ${s.circuit}${s.kind === 'emit' ? ` (${eventsOf(s)} event${eventsOf(s) === 1 ? '' : 's'})` : ''}`).join('\n')}

pragma language_version >= 0.26.0;

import CompactStandardLibrary;
import "../TokenMetadata" prefix TM_;
`;

/** The constructor every generated contract has: it stores the emitter-secret hash. */
const CONSTRUCTOR = `/**
 * @param {Bytes<32>} emitterSecretHash - \`TM_emitterSecretHashOf(secret)\`, computed off chain;
 *   every emitting circuit proves knowledge of \`secret\` through the \`emitterSecret\` witness.
 */
constructor(emitterSecretHash: Bytes<32>) {
  TM_initializeEmitter(emitterSecretHash);
}`;

function generateNativeSingle(row: Row, planned: PlannedStep[], shielded: boolean): string {
  const domain = domainFor(row);
  const domainLiteral = byteLiteral(utf8(domain), DOMAIN_SIZE);
  const emits = planned.filter((s): s is Extract<PlannedStep, { kind: 'emit' }> => s.kind === 'emit');
  const mintCircuit = shielded
    ? `/**
 * @description Mints \`amount\` of this token to \`recipient\` as a shielded coin.
 * @param {Bytes<32>} nonce - Caller-supplied and unique per mint.
 */
export circuit mint(
  recipient: Either<ZswapCoinPublicKey, ContractAddress>,
  amount: Uint<64>,
  nonce: Bytes<32>
): ShieldedCoinInfo {
  assert(amount > 0, "amount must be positive");
  _mints.increment(1);
  return mintShieldedToken(${domainLiteral}, disclose(amount), disclose(nonce), disclose(recipient));
}`
    : `/**
 * @description Mints \`amount\` of this token to \`recipient\` as an unshielded UTxO.
 * @return {Bytes<32>} - The colour actually minted.
 */
export circuit mint(
  recipient: Either<ContractAddress, UserAddress>,
  amount: Uint<64>
): Bytes<32> {
  assert(amount > 0, "amount must be positive");
  _mints.increment(1);
  return mintUnshieldedToken(${domainLiteral}, disclose(amount), disclose(recipient));
}`;

  const exports = shielded
    ? 'export { ContractAddress, Either, Maybe, ShieldedCoinInfo, ZswapCoinPublicKey, TM_emitterSecretHash };'
    : 'export { ContractAddress, Either, Maybe, UserAddress, TM_emitterSecretHash };';

  return `${HEADER(row, planned)}
${exports}

${CONSTRUCTOR}

/** How many mints this contract has made, for a cheap read-back after deployment. */
export ledger _mints: Counter;

/** The domain separator this contract mints and describes under. */
export circuit domainSep(): Bytes<32> {
  return ${domainLiteral};
}

/** The token's colour: \`tokenType(domainSep, this contract)\`. */
export circuit tokenColor(): Bytes<32> {
  return tokenType(${domainLiteral}, kernel.self());
}

/** The kind byte this contract declares (see MIP section 3). */
export circuit kind(): Uint<8> {
  return ${row.kind};
}

export circuit decimals(): Uint<8> {
  return ${row.decimals};
}

export circuit mints(): Uint<64> {
  return _mints.read() as Uint<64>;
}

${emits.map(emitCircuit).join('\n\n')}

${mintCircuit}
`;
}

function generateDual(row: Row, planned: PlannedStep[]): string {
  const domain = domainFor(row);
  const domainLiteral = byteLiteral(utf8(domain), DOMAIN_SIZE);
  const emits = planned.filter((s): s is Extract<PlannedStep, { kind: 'emit' }> => s.kind === 'emit');
  return `${HEADER(row, planned)}
export { ContractAddress, Either, Maybe, ShieldedCoinInfo, UserAddress, ZswapCoinPublicKey, TM_emitterSecretHash };

${CONSTRUCTOR}

/** How many mints this contract has made (either kind), for a cheap read-back. */
export ledger _mints: Counter;

/** The one domain separator both kinds of this token share. */
export circuit domainSep(): Bytes<32> {
  return ${domainLiteral};
}

/** The colour both kinds share: \`tokenType(domainSep, this contract)\`. */
export circuit tokenColor(): Bytes<32> {
  return tokenType(${domainLiteral}, kernel.self());
}

export circuit decimals(): Uint<8> {
  return ${row.decimals};
}

export circuit mints(): Uint<64> {
  return _mints.read() as Uint<64>;
}

${emits.map(emitCircuit).join('\n\n')}

/** Mints the shielded half of this token (kind byte 1). */
export circuit mintShielded(
  recipient: Either<ZswapCoinPublicKey, ContractAddress>,
  amount: Uint<64>,
  nonce: Bytes<32>
): ShieldedCoinInfo {
  assert(amount > 0, "amount must be positive");
  _mints.increment(1);
  return mintShieldedToken(${domainLiteral}, disclose(amount), disclose(nonce), disclose(recipient));
}

/** Mints the unshielded half of this token (kind byte 0), same colour. */
export circuit mintUnshielded(
  recipient: Either<ContractAddress, UserAddress>,
  amount: Uint<64>
): Bytes<32> {
  assert(amount > 0, "amount must be positive");
  _mints.increment(1);
  return mintUnshieldedToken(${domainLiteral}, disclose(amount), disclose(recipient));
}
`;
}

function generateCollection(row: Row, planned: PlannedStep[]): string {
  const emits = planned.filter((s): s is Extract<PlannedStep, { kind: 'emit' }> => s.kind === 'emit');
  return `${HEADER(row, planned)}
export { ContractAddress, Either, Maybe, ShieldedCoinInfo, ZswapCoinPublicKey, TM_emitterSecretHash };

${CONSTRUCTOR}

/** How many pieces have been minted, for a cheap read-back after deployment. */
export ledger _mintedPieces: Counter;

/**
 * @description The colour of one piece: \`tokenType(pieceDomain, this contract)\`. The
 * domain is a call argument, which is what makes this one address many tokens — the
 * ERC-1155 / EIP-7496 shape. Only the metadata payloads are literal.
 */
export circuit tokenColor(pieceDomain: Bytes<32>): Bytes<32> {
  return tokenType(disclose(pieceDomain), kernel.self());
}

export circuit decimals(): Uint<8> {
  return ${row.decimals};
}

export circuit mintedPieces(): Uint<64> {
  return _mintedPieces.read() as Uint<64>;
}

/**
 * @description Mints one unit of the piece identified by \`pieceDomain\`. No event: the
 * mint is public in the transaction's effects, which is what the indexer reads.
 * @param {Bytes<32>} nonce - Caller-supplied, unique per (piece, mint).
 */
export circuit mintPiece(
  pieceDomain: Bytes<32>,
  recipient: Either<ZswapCoinPublicKey, ContractAddress>,
  nonce: Bytes<32>
): ShieldedCoinInfo {
  _mintedPieces.increment(1);
  return mintShieldedToken(disclose(pieceDomain), 1, disclose(nonce), disclose(recipient));
}

${emits.map(emitCircuit).join('\n\n')}
`;
}

function generateLedger(row: Row, planned: PlannedStep[]): string {
  const emits = planned.filter((s): s is Extract<PlannedStep, { kind: 'emit' }> => s.kind === 'emit');
  const domainLiteral = byteLiteral(utf8(domainFor(row)), DOMAIN_SIZE);
  return `${HEADER(row, planned)}
export { ContractAddress, Either, Maybe, TM_emitterSecretHash };

${CONSTRUCTOR}

/**
 * Balances live in contract state, not in UTxOs — that is what kind bit 1 declares. The
 * accounting is deliberately minimal: a ledger token is invisible to a mint scanner, so
 * the only thing this contract owes the indexer is its TokenMetadata events.
 */
export ledger _balances: Map<Bytes<32>, Uint<128>>;
export ledger _totalSupply: Uint<128>;

/** The 32 bytes this contract uses as its token id (any value the contract chooses). */
export circuit domainSep(): Bytes<32> {
  return ${domainLiteral};
}

/** The kind byte this contract declares: ${row.kind} — see MIP section 3. */
export circuit kind(): Uint<8> {
  return ${row.kind};
}

export circuit decimals(): Uint<8> {
  return ${row.decimals};
}

export circuit totalSupply(): Uint<128> {
  return _totalSupply;
}

export circuit balanceOf(account: Bytes<32>): Uint<128> {
  if (!_balances.member(disclose(account))) {
    return 0;
  }
  return _balances.lookup(disclose(account));
}

/** Creates \`amount\` of this token in \`account\`'s contract-state balance. */
export circuit ledgerMint(account: Bytes<32>, amount: Uint<128>): [] {
  assert(amount > 0, "amount must be positive");
  const prior = _balances.member(disclose(account)) ? _balances.lookup(disclose(account)) : 0;
  _balances.insert(disclose(account), (prior + disclose(amount)) as Uint<128>);
  _totalSupply = (_totalSupply + disclose(amount)) as Uint<128>;
}

/** Moves \`amount\` from one contract-state balance to another. \`from\` is a Compact keyword. */
export circuit transfer(sender: Bytes<32>, recipient: Bytes<32>, amount: Uint<128>): [] {
  const available = _balances.member(disclose(sender)) ? _balances.lookup(disclose(sender)) : 0;
  assert(available >= amount, "insufficient balance");
  _balances.insert(disclose(sender), (available - disclose(amount)) as Uint<128>);
  const prior = _balances.member(disclose(recipient)) ? _balances.lookup(disclose(recipient)) : 0;
  _balances.insert(disclose(recipient), (prior + disclose(amount)) as Uint<128>);
}

${emits.map(emitCircuit).join('\n\n')}
`;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

// Rows are selected by their variant id (`LSUN18`) or their base id (`LSUN`).
const selected = process.argv.slice(2);
const rows = variantRows.filter(
  (row) => selected.length === 0 || selected.includes(row.id) || selected.includes(row.id.slice(0, -VARIANT.suffix.length)),
);
if (selected.length > 0 && rows.length !== selected.length) {
  const missing = selected.filter((id) => !rows.some((row) => row.id === id || row.id === `${id}${VARIANT.suffix}`));
  throw new Error(`unknown row id(s): ${missing.join(', ')}`);
}

mkdirSync(OUT_CONTRACTS, { recursive: true });

// Generating a SUBSET must not shrink the matrix: load what is already there and replace
// only the rows regenerated now, keeping the reference set's order.
const existing: Record<string, unknown> = {};
if (existsSync(OUT_MATRIX)) {
  const previous = JSON.parse(readFileSync(OUT_MATRIX, 'utf8')) as { rows?: { id: string }[] };
  // Only rows of the current variant survive: a regeneration never keeps a stale base row.
  for (const row of previous.rows ?? []) if (variantRows.some((v) => v.id === row.id)) existing[row.id] = row;
}

for (const row of rows) {
  const planned = planSteps(row);
  let source: string;
  switch (row.template) {
    case 'NativeShieldedToken':
      source = generateNativeSingle(row, planned, true);
      break;
    case 'NativeUnshieldedToken':
      source = generateNativeSingle(row, planned, (row.kind & 1) === 1);
      break;
    case 'NativeDualToken':
      source = generateDual(row, planned);
      break;
    case 'ShieldedCollection':
      source = generateCollection(row, planned);
      break;
    case 'LedgerToken':
      source = generateLedger(row, planned);
      break;
    default:
      throw new Error(`${row.id}: unknown template "${row.template}"`);
  }
  const file = path.join(OUT_CONTRACTS, `${row.id}.compact`);
  writeFileSync(file, source, 'utf8');
  const eventCount = planned.reduce((n, s) => n + (s.kind === 'emit' ? eventsOf(s) : 0), 0);
  console.log(
    `${row.id.padEnd(7)} ${row.template.padEnd(22)} ${String(planned.length).padStart(2)} transactions, ${String(
      eventCount,
    ).padStart(2)} events  -> contracts/generated/${row.id}.compact`,
  );

  existing[row.id] = {
    id: row.id,
    contract: row.id,
    template: row.template,
    name: row.name,
    symbol: row.symbol,
    decimals: row.decimals,
    kind: row.kind,
    optional: row.optional === true,
    domain: row.pieces ? null : domainFor(row),
    domainSepHex: row.pieces ? null : hex(padTo(utf8(domainFor(row)), DOMAIN_SIZE)),
    pieces: row.pieces
      ? row.pieces.map((piece) => ({
          piece,
          domain: domainFor(row, piece),
          domainSepHex: hex(padTo(utf8(domainFor(row, piece)), DOMAIN_SIZE)),
        }))
      : null,
    expect: row.expect,
    steps: planned.map((step) =>
      step.kind === 'emit'
        ? {
            kind: 'emit',
            circuit: step.circuit,
            sourceOps: step.sourceOps,
            // One declaration per circuit (UC-1): the step's package, exactly.
            parts: eventsOf(step),
            payload: step.emits.map((e) => e.payloadHex).join(''),
            events: step.emits.map((e) => ({
              piece: e.piece,
              domainSep: e.domainSepHex,
              kind: e.kind,
              key: e.key,
              valType: e.valType,
              len: e.len,
              parts: e.parts,
              value: e.valueHex,
              payload: e.payloadHex,
              text: e.text,
            })),
          }
        : step,
    ),
  };
}

const matrixRows = variantRows.map((row) => existing[row.id]).filter((row) => row !== undefined);

writeFileSync(
  OUT_MATRIX,
  `${JSON.stringify(
    {
      $comment:
        'GENERATED by scripts/generate-literal-contracts.ts. The ordered on-chain plan for the MIP-18 variant of each row of deployments/reference-set.json (spec 00024 §6.A: LSUN18 … LLIAR18): which generated contract to deploy, which circuit each step calls, and — for an emit step — its ONE declaration (UC-1: one declaration per circuit call, one intent, one package): `parts` (the events the package takes) and `payload` (its exact 256·parts bytes, hex). scripts/deploy-and-publish.ts executes it and scripts/export-simulator-fixtures.ts runs it in the simulator. Every generated contract takes the emitter-secret hash as its only constructor argument.',
      generatedAt: new Date().toISOString(),
      rows: matrixRows,
    },
    null,
    2,
  )}\n`,
  'utf8',
);
console.log(`\nwrote ${path.relative(ROOT, OUT_MATRIX)} (${matrixRows.length} rows)`);
