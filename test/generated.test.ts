/**
 * The generated literal-payload contracts must emit EXACTLY the bytes
 * `deployments/generated-matrix.json` says they will.
 *
 * This is the guard that makes `scripts/generate-literal-contracts.ts` trustworthy: the
 * matrix is what `scripts/deploy-and-publish.ts` executes and what
 * `scripts/export-fixtures.ts` checks the chain against, so if the generator's idea of a
 * payload and the compiled contract's idea of a payload ever diverge, everything downstream
 * is quietly wrong. Running every emitting circuit of every generated contract in the
 * simulator and comparing all 256 bytes is the cheapest way to know they cannot.
 *
 * It also pins the property Q13 rests on: the bytes a literal contract emits are
 * indistinguishable from the bytes the parameterised template in `contracts/` emits —
 * and that only the emitter (spec 00024 Q12) can make a generated contract emit.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INTEGER_LEN,
  EVENT_NAME,
  HEADER_SIZE,
  ONE_PART_VALUE_SIZE,
  PAYLOAD_SIZE,
  STRANGER_EMITTER_SECRET,
  TEST_EMITTER_SECRET,
  VAL_TYPE_INTEGER,
  VAL_TYPE_NULL,
  VAL_TYPE_STRING,
  decodeInteger,
  deploy,
  emitterSecretHashOf,
  emitterWitnesses,
  encodeInteger,
  hex,
  pad,
  validateTokenMetadataEvent,
} from './token-metadata.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

interface MatrixEvent {
  piece: string | null;
  domainSep: string;
  kind: number;
  key: string;
  valType: number;
  len: number;
  /** UC-1: the events (parts) the declaration's package takes. */
  parts: number;
  /** The value region: the value, NUL-padded to 256·parts − 68 bytes. */
  value: string;
  /** The exact package bytes, 256·parts. */
  payload: string;
  text: string | null;
}
interface MatrixStep {
  kind: string;
  circuit: string;
  /** A collection's per-piece circuit: its selector (spec 00024 Q20). */
  args?: number[];
  /** Emit steps (UC-1): the step's one package — its part count and exact bytes. */
  parts?: number;
  payload?: string;
  events?: MatrixEvent[];
}
interface MatrixRow {
  id: string;
  contract: string;
  template: string;
  name: string;
  symbol: string;
  decimals: number;
  kind: number;
  steps: MatrixStep[];
}

const matrix = JSON.parse(
  readFileSync(join(ROOT, 'deployments', 'generated-matrix.json'), 'utf8'),
) as { rows: MatrixRow[] };

/** The matrix must describe every row of the reference set, or a regeneration was partial. */
const referenceSet = JSON.parse(
  readFileSync(join(ROOT, 'deployments', 'reference-set.json'), 'utf8'),
) as { rows: { id: string }[] };

/** Spec 00024 §6.A: this repository deploys the `18` variant of every reference row. */
const VARIANT = '18';
const REPOSITORY_BLOB = 'https://github.com/acedward/mip-0018-midnight-contracts/blob/main/contracts/generated';

describe('generated-matrix.json', () => {
  it('covers every row of the reference set, as its MIP-18 variant', () => {
    expect(matrix.rows.map((row) => row.id)).toEqual(referenceSet.rows.map((row) => `${row.id}${VARIANT}`));
    for (const row of matrix.rows) {
      expect(row.contract, row.id).toBe(row.id);
      expect(row.symbol.endsWith(VARIANT), row.id).toBe(true);
      // MIP Appendix A: a symbol is at most 32 bytes.
      expect(Buffer.byteLength(row.symbol), row.id).toBeLessThanOrEqual(32);
      expect(row.name, row.id).toMatch(/ · MIP-18$/);
    }
  });

  it('puts ONE declaration in every emitting circuit (UC-1: one declaration per intent)', () => {
    for (const row of matrix.rows) {
      for (const step of row.steps.filter((s) => s.kind === 'emit')) {
        const where = `${row.id}/${step.circuit}`;
        expect(step.events, where).toHaveLength(1);
        expect(step.parts, where).toBe(step.events![0]!.parts);
        expect(step.payload, where).toBe(step.events![0]!.payload);
      }
      // Every declaration is its own call: a unique circuit, or (a collection, Q20) a unique
      // selector of its piece's circuit.
      const calls = row.steps.filter((s) => s.kind === 'emit').map((s) => `${s.circuit}(${(s.args ?? []).join(',')})`);
      expect(new Set(calls).size, `${row.id} declaration calls are unique`).toBe(calls.length);
    }
  });

  it('declares the contract’s own source as `repository` (val-type 4) for every token it describes', () => {
    for (const row of matrix.rows) {
      const repositories = row.steps.flatMap((step) => (step.events ?? []).filter((e) => e.key === 'repository'));
      expect(repositories.length, row.id).toBeGreaterThan(0);
      for (const event of repositories) {
        expect(event.valType, row.id).toBe(4);
        expect(event.text, row.id).toBe(`${REPOSITORY_BLOB}/${row.contract}.compact`);
        expect(event.parts, row.id).toBe(1);
      }
      // Every (domainSep, kind) this row declares anything for also has its repository.
      const declared = new Set(row.steps.flatMap((s) => (s.events ?? []).map((e) => `${e.domainSep}:${e.kind}`)));
      const covered = new Set(repositories.map((e) => `${e.domainSep}:${e.kind}`));
      expect([...declared].sort(), row.id).toEqual([...covered].sort());
    }
  });

  it('fits every contract in one local deploy: at most 20 impure circuits (spec 00024 Q20)', () => {
    // The local chain allows 50 000 bytes written per block and a k=13 verifier key is ~2.1 KB.
    for (const row of matrix.rows) {
      const info = JSON.parse(
        readFileSync(join(ROOT, 'contracts', 'managed', row.contract, 'compiler', 'contract-info.json'), 'utf8'),
      ) as { circuits: { name: string; proof: boolean }[] };
      const proven = info.circuits.filter((c) => c.proof).map((c) => c.name);
      expect(proven.length, `${row.id}: ${proven.join(', ')}`).toBeLessThanOrEqual(20);
    }
    const cnst = matrix.rows.find((row) => row.id === 'CNST18')!;
    const pieces = cnst.steps.filter((s) => s.kind === 'emit');
    expect(new Set(pieces.map((s) => s.circuit))).toEqual(
      new Set(['publishOrion', 'publishLyra', 'publishCygnus', 'publishVega', 'publishAltair']),
    );
    for (const circuit of new Set(pieces.map((s) => s.circuit))) {
      const selectors = pieces.filter((s) => s.circuit === circuit).map((s) => s.args![0]);
      expect(selectors, circuit).toEqual(selectors.map((_, i) => i));
    }
  });

  it('refuses an unknown selector of a collection piece circuit', async () => {
    const instance = await deployGenerated('CNST18');
    await expect(instance.call('publishVega', 99n)).rejects.toThrow(/no such declaration/);
  });

  it('carries the long values of spec 00024 §6.A as multi-part declarations', () => {
    const find = (id: string, key: string) =>
      matrix.rows
        .find((row) => row.id === id)!
        .steps.flatMap((step) => (step.events ?? []).map((event) => ({ step, event })))
        .filter(({ event }) => event.key === key);
    // SNEB18: a ~700-byte `metadata` JSON document in three parts.
    const [metadata] = find('SNEB18', 'metadata');
    expect(metadata!.event.parts).toBe(3);
    expect(metadata!.event.len).toBeGreaterThan(2 * PAYLOAD_SIZE - HEADER_SIZE);
    expect(() => JSON.parse(metadata!.event.text!)).not.toThrow();
    // LMOON18: a Null of `description`, then a ~400-byte `description` in two parts.
    const descriptions = find('LMOON18', 'description').map(({ event }) => event);
    expect(descriptions.map((e) => [e.valType, e.parts])).toEqual([
      [1, 1],
      [VAL_TYPE_NULL, 1],
      [1, 2],
    ]);
    // CNST18: a ~300-byte trait (Orion's `metadata`) in two parts.
    const orion = find('CNST18', 'metadata').map(({ event }) => event).filter((e) => e.piece === 'orion');
    expect(orion.map((e) => e.parts)).toEqual([2]);
    // Nothing else is long.
    const longs = matrix.rows.flatMap((row) => row.steps.flatMap((s) => (s.events ?? []).filter((e) => e.parts > 1)));
    expect(longs).toHaveLength(3);
  });

  it('sizes every package for its value (UC-1) and always declares a val-type', () => {
    for (const row of matrix.rows) {
      for (const step of row.steps) {
        for (const event of step.events ?? []) {
          const where = `${row.id}/${step.circuit}/${event.key}`;
          // UC-1: the package holds its value; a long value takes more parts.
          expect(event.parts, where).toBe(Math.max(1, Math.ceil((HEADER_SIZE + event.len) / PAYLOAD_SIZE)));
          expect(event.payload.length, where).toBe(event.parts * PAYLOAD_SIZE * 2);
          expect(event.value.length, where).toBe((event.parts * PAYLOAD_SIZE - HEADER_SIZE) * 2);
          if (event.parts === 1) expect(event.len, where).toBeLessThanOrEqual(ONE_PART_VALUE_SIZE);
          // MIP section 2.1: 0..5 are defined, 6..255 are reserved.
          expect(event.valType, where).toBeGreaterThanOrEqual(0);
          expect(event.valType, where).toBeLessThanOrEqual(VAL_TYPE_NULL);
          // A Null carries no bytes at all.
          if (event.valType === VAL_TYPE_NULL) expect(event.len, where).toBe(0);
        }
      }
    }
  });

  it('gives MIP Appendix A’s val-type to every well-known key it uses', () => {
    const expected: Record<string, number> = {
      name: 1,
      symbol: 1,
      decimals: 2,
      metadata: 3,
      tokenUri: 4,
      repository: 4,
    };
    for (const row of matrix.rows) {
      for (const step of row.steps) {
        for (const event of step.events ?? []) {
          // A Null clears any key, well-known or not (MIP section 2.1).
          if (event.valType === VAL_TYPE_NULL) continue;
          const want = expected[event.key];
          if (want !== undefined) {
            expect(event.valType, `${row.id}/${step.circuit}/${event.key}`).toBe(want);
          }
        }
      }
    }
  });

  it('emits every `decimals` as `Uint<128>`: val-len 16, little-endian', () => {
    // MIP Appendix A's recommended width. The bytes are the number in the LOW
    // byte followed by NULs, never the digits' UTF-8 — a `Uint<128>` of 6 is
    // `0x06` + fifteen NULs, which is what Appendix A prints.
    let seen = 0;
    for (const row of matrix.rows) {
      for (const step of row.steps) {
        for (const event of step.events ?? []) {
          if (event.key !== 'decimals') continue;
          seen += 1;
          const where = `${row.id}/${step.circuit}/decimals`;
          expect(event.len, where).toBe(DEFAULT_INTEGER_LEN);
          const value = Uint8Array.from(Buffer.from(event.value, 'hex'));
          expect(decodeInteger(value.subarray(0, DEFAULT_INTEGER_LEN)), where).toBe(BigInt(row.decimals));
          // Every byte past the number is NUL, for the whole 188-byte field.
          expect(value.subarray(1).every((b) => b === 0), where).toBe(true);
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('carries the Null declaration MIP section 2.1 defines', () => {
    const nulls = matrix.rows.flatMap((row) =>
      row.steps.flatMap((step) => (step.events ?? []).filter((e) => e.valType === VAL_TYPE_NULL)),
    );
    expect(nulls.length).toBeGreaterThan(0);
    for (const event of nulls) {
      expect(event.len).toBe(0);
      // Emitters SHOULD zero the ignored bytes, and this one does: all 188.
      expect(event.value).toBe('00'.repeat(ONE_PART_VALUE_SIZE));
      expect(event.text).toBeNull();
    }
  });

  it('no longer carries a `metadata/<n>` part: MIP-0018 defines no reassembly', () => {
    // A val-type 3 value must be ONE complete JSON value (section 2.1) and the
    // MIP defines no multipart representation (section 5.4), so the six-part
    // document this repository published against the #315 draft is gone. The
    // rejected fragment lives on in fixtures/simulator/negative-payloads.json.
    const keys = matrix.rows.flatMap((row) =>
      row.steps.flatMap((step) => (step.events ?? []).map((e) => e.key)),
    );
    expect(keys.filter((key) => key.startsWith('metadata/'))).toEqual([]);
    for (const row of matrix.rows) {
      for (const step of row.steps) {
        for (const event of step.events ?? []) {
          if (event.valType !== 3) continue;
          const text = Buffer.from(event.value, 'hex').subarray(0, event.len).toString('utf8');
          expect(() => JSON.parse(text), `${row.id}/${event.key}`).not.toThrow();
        }
      }
    }
  });
});

const EMITTER_HASH = emitterSecretHashOf(TEST_EMITTER_SECRET);

/** Deploys a generated contract in the simulator with the emitter secret as private state. */
async function deployGenerated(contract: string, secret = TEST_EMITTER_SECRET, address?: string) {
  const { Contract } = (await import(`../contracts/managed/${contract}/contract/index.js`)) as unknown as {
    Contract: new (witnesses: typeof emitterWitnesses) => never;
  };
  return deploy(new Contract(emitterWitnesses) as never, { emitterSecret: secret }, [EMITTER_HASH], {
    ...(address ? { address } : {}),
  });
}

for (const row of matrix.rows) {
  const emitting = row.steps.filter((step) => step.kind === 'emit');

  describe(`generated ${row.id} (${row.name})`, () => {
    it('stores the emitter-secret hash its constructor was given', async () => {
      const { ledger } = (await import(`../contracts/managed/${row.contract}/contract/index.js`)) as unknown as {
        ledger: (state: never) => { TM_emitterSecretHash: Uint8Array };
      };
      const instance = await deployGenerated(row.contract);
      expect(hex(ledger(instance.state as never).TM_emitterSecretHash)).toBe(hex(EMITTER_HASH));
    });

    if (emitting.length === 0) return;

    it('refuses every emitting circuit to a caller without the emitter secret', async () => {
      const intruder = await deployGenerated(row.contract, STRANGER_EMITTER_SECRET);
      for (const step of emitting) {
        await expect(intruder.call(step.circuit, ...(step.args ?? []).map(BigInt)), `${row.id}.${step.circuit}`).rejects.toThrow(
          /not the emitter/,
        );
      }
    });

    it('emits exactly the payloads the matrix records', async () => {
      const instance = await deployGenerated(row.contract);

      for (const step of emitting) {
        const call = await instance.call(step.circuit, ...(step.args ?? []).map(BigInt));
        const expectedEvents = step.events ?? [];
        const parts = expectedEvents.reduce((n, e) => n + e.parts, 0);
        expect(call.events.length, `${row.id}.${step.circuit} event count`).toBe(parts);
        // One declaration per call is ONE package (UC-1): compare the whole package bytes.
        // A circuit that still folds several one-part declarations is compared per event.
        const actuals = expectedEvents.length === 1 ? call.packages : call.events;
        expect(actuals.length, `${row.id}.${step.circuit} declarations`).toBe(expectedEvents.length);

        for (const [index, expected] of expectedEvents.entries()) {
          const actual = actuals[index]!;
          const where = `${row.id}.${step.circuit}[${index}] (${expected.key})`;
          expect(actual.eventName, where).toBe(EVENT_NAME);
          expect(actual.parts, where).toBe(expected.parts);
          expect(actual.payload.length, where).toBe(PAYLOAD_SIZE * expected.parts);
          expect(hex(actual.payload), where).toBe(expected.payload);
          expect(hex(actual.domainSep), where).toBe(expected.domainSep);
          expect(actual.kind, where).toBe(expected.kind);
          expect(actual.keyText, where).toBe(expected.key);
          expect(actual.valType, where).toBe(expected.valType);
          expect(actual.len, where).toBe(expected.len);
          expect(hex(actual.value), where).toBe(expected.value);
          // Every event the reference set emits must survive transport validation.
          expect(validateTokenMetadataEvent(actual), where).toEqual({ outcome: 'accepted' });
          if (expected.text !== null && expected.key !== 'decimals') {
            expect(actual.valueText, where).toBe(expected.text);
          }
        }
      }
    });

    it('declares the kind byte and the domain separator the matrix says', async () => {
      const { pureCircuits } = (await import(
        `../contracts/managed/${row.contract}/contract/index.js`
      )) as unknown as { pureCircuits: Record<string, () => unknown> };
      // A collection takes its domain per call, so it has no contract-wide `domainSep()`.
      if (row.template !== 'ShieldedCollection') {
        // The variant's domain separator: `umbra:lsun18`.
        expect(hex(pureCircuits.domainSep!() as Uint8Array)).toBe(
          hex(pad(32, `umbra:${row.symbol.toLowerCase()}`)),
        );
      }
      expect(Number(pureCircuits.decimals!())).toBe(row.decimals);
    });
  });
}

describe('a literal payload is byte-identical to the parameterised template’s', () => {
  it('SSTAR18’s literal name, symbol and decimals equal NativeShieldedToken.setMetadata’s', async () => {
    const template = (await import(
      '../contracts/managed/NativeShieldedToken/contract/index.js'
    )) as unknown as { Contract: new (w: typeof emitterWitnesses) => never };

    const address = '11'.repeat(32);
    const literal = await deployGenerated('SSTAR18', TEST_EMITTER_SECRET, address);
    const sstar = matrix.rows.find((row) => row.id === 'SSTAR18')!;
    const standard = sstar.steps.filter(
      (s) => s.kind === 'emit' && ['name', 'symbol', 'decimals'].includes(s.events![0]!.key),
    );
    const literalEvents = [];
    for (const step of standard) {
      literalEvents.push(...(await literal.call(step.circuit)).events);
    }

    const parameterised = await deploy(
      new template.Contract(emitterWitnesses) as never,
      { emitterSecret: TEST_EMITTER_SECRET },
      [EMITTER_HASH, pad(32, 'umbra:sstar18'), sstar.name, sstar.symbol, 6n],
      { address },
    );
    const field = (text: string | Uint8Array) => {
      const out = new Uint8Array(ONE_PART_VALUE_SIZE);
      out.set(typeof text === 'string' ? new TextEncoder().encode(text) : text);
      return out;
    };
    const byteLength = (text: string) => BigInt(Buffer.byteLength(text));
    const templateEvents = [
      ...(await parameterised.call('setMetadata', pad(32, 'name'), BigInt(VAL_TYPE_STRING), byteLength(sstar.name), field(sstar.name))).events,
      ...(await parameterised.call('setMetadata', pad(32, 'symbol'), BigInt(VAL_TYPE_STRING), byteLength(sstar.symbol), field(sstar.symbol))).events,
      ...(await parameterised.call('setMetadata', pad(32, 'decimals'), BigInt(VAL_TYPE_INTEGER), 16n, field(encodeInteger(6n)))).events,
    ];

    expect(literalEvents).toHaveLength(3);
    expect(literalEvents.map((event) => hex(event.payload))).toEqual(
      templateEvents.map((event) => hex(event.payload)),
    );
  });
});
