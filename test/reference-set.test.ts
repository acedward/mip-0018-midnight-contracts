/**
 * Guards the committed fixtures against the reference set that produced them.
 *
 * `deployments/reference-set.json` states, per row, what a token indexer should
 * end up with (`expect`, and `expectRows` where one contract yields several of
 * the MIP's identities). `fixtures/simulator/*.json` is what the compiled
 * contracts actually produced. If the two ever drift — a template changes, a
 * step is added, the fold's rules move — this fails rather than shipping a
 * fixture corpus that no longer means what the matrix says it means.
 *
 * Regenerate with: npm run export:fixtures:simulator
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INTEGER_LEN,
  EVENT_NAME,
  LEGACY_EVENT_NAME,
  HEADER_SIZE,
  MAX_INTEGER_LEN,
  MISC_EVENT_SIZE,
  ONE_PART_VALUE_SIZE,
  PAYLOAD_SIZE,
  PRE_MIP_EVENT_NAME,
  VAL_TYPE_NULL,
  decodeInteger,
} from './token-metadata.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const referenceSet = read('deployments/reference-set.json');
const { events } = read('fixtures/simulator/events.json');
const { mints } = read('fixtures/simulator/mints.json');
const expectedTokens = read('fixtures/simulator/expected-tokens.json');
const { tokens } = expectedTokens;
const { vectors } = read('fixtures/simulator/color-vectors.json');
const negatives = read('fixtures/simulator/negative-payloads.json');
const { payloads } = negatives;

type Token = {
  row: string;
  /** MIP section 4: the identity byte, 0..3. */
  kind: number;
  privacy: string;
  storage: string;
  status: string;
  colorHex: string | null;
  mintCount: number;
  totalMinted: string;
  domainSepHex: string;
  name?: string;
};

const rowsOf = (id: string) => (tokens as Token[]).filter((t) => t.row === id);

describe('the reference set fixtures', () => {
  it('holds every payload at exactly 256 bytes under the MIP’s event name', () => {
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.eventName).toBe(EVENT_NAME);
      expect(event.payloadHex).toHaveLength(PAYLOAD_SIZE * 2);
      expect(event.len).toBeLessThanOrEqual(ONE_PART_VALUE_SIZE);
      expect(event.kind).toBeLessThanOrEqual(3);
      // MIP section 2.1: 0..5 defined, 6..255 reserved.
      expect(event.valType).toBeGreaterThanOrEqual(0);
      expect(event.valType).toBeLessThanOrEqual(VAL_TYPE_NULL);
      if (event.valType === VAL_TYPE_NULL) expect(event.len).toBe(0);
      // val-type 2 is `Uint<8 * val-len>`; `decimals` uses Appendix A's default.
      if (event.valType === 2) {
        expect(event.len).toBeGreaterThanOrEqual(1);
        expect(event.len).toBeLessThanOrEqual(MAX_INTEGER_LEN);
        if (event.keyText === 'decimals') expect(event.len).toBe(DEFAULT_INTEGER_LEN);
      }
      // val-type 3 is ONE complete JSON value: no `metadata/<n>` parts left.
      if (event.valType === 3) {
        expect(() => JSON.parse(Buffer.from(event.valueHex, 'hex').toString('utf8'))).not.toThrow();
      }
      expect(event.keyText.startsWith('metadata/')).toBe(false);
    }
  });

  it('projects every `decimals` from its little-endian `Uint<128>` bytes', () => {
    // MIP section 2.1 and Appendix A: val-len 16, low byte first. A consumer
    // that read these bytes big-endian would see 6 as 2.6e37.
    const seen = events.filter((e: { keyText: string; valType: number }) => e.keyText === 'decimals' && e.valType === 2);
    expect(seen.length).toBeGreaterThan(0);
    for (const event of seen) {
      const bytes = Uint8Array.from(Buffer.from(event.valueHex, 'hex'));
      expect(bytes).toHaveLength(DEFAULT_INTEGER_LEN);
      const row = referenceSet.rows.find((r: { id: string }) => r.id === event.row);
      expect(decodeInteger(bytes), `${event.row}.decimals`).toBe(BigInt(row.decimals));
    }
  });

  it('carries a Null declaration, and it clears exactly one key', () => {
    // MIP sections 2.1 and 6.2. LMOON sets a `description` and then clears it.
    const nulls = events.filter((e: { valType: number }) => e.valType === VAL_TYPE_NULL);
    expect(nulls.length).toBeGreaterThan(0);
    for (const event of nulls) {
      expect(event.len).toBe(0);
      expect(event.valueHex).toBe('');
      // The cleared key is still present as history in this very file.
      const earlier = events.filter(
        (e: { row: string; keyText: string; valType: number }) =>
          e.row === event.row && e.keyText === event.keyText && e.valType !== VAL_TYPE_NULL,
      );
      expect(earlier.length, `${event.row}.${event.keyText} has no history`).toBeGreaterThan(0);
      // …and the folded row shows the key with its current value Null.
      const token = (tokens as Token[]).find((tk) => tk.row === event.row) as unknown as {
        traits: Record<string, { valType: number }>;
      };
      expect(token.traits[event.keyText]?.valType, `${event.row}.${event.keyText}`).toBe(VAL_TYPE_NULL);
    }
  });

  it('covers the MIP’s three token states and three value domains the set exercises', () => {
    // MIP section 7.2 — and `inconsistent` is not one of them any more.
    expect(new Set((tokens as Token[]).map((t) => t.status))).toEqual(
      new Set(['observed', 'declared', 'described']),
    );
    expect(new Set((tokens as Token[]).map((t) => `${t.privacy}/${t.storage}`))).toEqual(
      new Set(['shielded/native', 'unshielded/native', 'unshielded/ledger']),
    );
    expect(new Set((tokens as Token[]).map((t) => t.kind))).toEqual(new Set([0, 1, 2]));
  });

  it('keys every row on the MIP’s (address, domainSep, kind) identity', () => {
    const identities = new Set(
      (tokens as Token[]).map(
        (t) => `${(t as never as { contractAddress: string }).contractAddress}:${t.domainSepHex}:${t.kind}`,
      ),
    );
    expect(identities.size).toBe(tokens.length);
    expect(expectedTokens.identities).toBe(tokens.length);
    // Two contracts describe one (address, domainSep) under two kinds: the dual
    // token and the Ledger Liar. Both are links a consumer MAY show (MIP §4).
    expect(expectedTokens.addressDomainPairs).toBe(tokens.length - 2);
  });

  it('derives privacy and storage from the kind byte, never the other way round', () => {
    for (const token of tokens as Token[]) {
      expect(token.privacy).toBe((token.kind & 1) === 1 ? 'shielded' : 'unshielded');
      expect(token.storage).toBe((token.kind & 2) === 2 ? 'ledger' : 'native');
      // MIP section 3: a colour exists only for the native kinds.
      if (token.storage === 'ledger') expect(token.colorHex).toBeNull();
      else expect(token.colorHex).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  for (const row of referenceSet.rows) {
    const expected = row.expect ?? {};
    it(`row ${row.id} (${row.name}) matches what the matrix promises`, () => {
      const got = rowsOf(row.id);
      expect(got.length).toBe(expected.rows ?? 1);

      if (row.expectRows) {
        // One contract, several of the MIP's identities: match each by kind byte.
        for (const want of row.expectRows as Record<string, unknown>[]) {
          const actual = got.find((t) => t.kind === want.kind);
          expect(actual, `${row.id} has no kind-${want.kind} row`).toBeDefined();
          for (const [field, value] of Object.entries(want)) {
            if (field === 'kind') continue;
            if (field === 'color') expect(actual!.colorHex).toBe(value);
            else if (field === 'name' && value === null) expect(actual!.name).toBeUndefined();
            else expect(actual![field as keyof Token], `${row.id}.${field}`).toBe(value);
          }
        }
        return;
      }

      const first = got[0];
      if (expected.status) expect(first.status).toBe(expected.status);
      if (expected.storage) expect(first.storage).toBe(expected.storage);
      if (expected.color === null) expect(first.colorHex).toBeNull();
      if (expected.mintCount !== undefined) expect(first.mintCount).toBe(expected.mintCount);
      if (expected.totalMinted !== undefined) expect(first.totalMinted).toBe(expected.totalMinted);
      if (expected.name === null) expect(first.name).toBeUndefined();
      else if (first.status !== 'observed') expect(first.name).toBeTruthy();
      // A single-identity row carries the kind byte its contract declares.
      if ((expected.rows ?? 1) === 1) expect(first.kind).toBe(row.kind);
    });
  }

  it('gives one colour to both kinds of the dual token and five distinct ones to the collection', () => {
    const dual = rowsOf('DAUR');
    expect(dual).toHaveLength(2);
    expect(dual[0].colorHex).toBe(dual[1].colorHex);
    expect(new Set(dual.map((t) => t.kind))).toEqual(new Set([0, 1]));

    const pieces = rowsOf('CNST');
    expect(pieces).toHaveLength(5);
    expect(new Set(pieces.map((t) => t.colorHex)).size).toBe(5);
  });

  it('turns the Ledger Liar into two honest rows, not one flagged one', () => {
    // MIP sections 6.3 and 7.2: a mint is a fact about kind 0, a declaration is
    // a claim about kind 2, and neither can hide or relabel the other.
    const liar = rowsOf('LLIAR');
    expect(liar).toHaveLength(2);

    const observed = liar.find((t) => t.kind === 0)!;
    expect(observed.status).toBe('observed');
    expect(observed.name).toBeUndefined();
    expect(observed.mintCount).toBe(1);
    expect(observed.colorHex).toMatch(/^[0-9a-f]{64}$/);

    const declared = liar.find((t) => t.kind === 2)!;
    expect(declared.status).toBe('declared');
    expect(declared.name).toBe('Ledger Liar');
    expect(declared.mintCount).toBe(0);
    expect(declared.colorHex).toBeNull();

    // They share a domain separator, which is the link a consumer MAY show.
    expect(observed.domainSepHex).toBe(declared.domainSepHex);
  });

  it('records a colour for every colour vector', () => {
    for (const vector of vectors) {
      expect(vector.colorHex).toMatch(/^[0-9a-f]{64}$/);
      expect(vector.contractAddress).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('ties every mint to a native token row and to the colour derived from its domain separator', () => {
    for (const mint of mints) {
      expect(mint.kindByte, 'a mint effect is always a native kind').toBeLessThanOrEqual(1);
      const row = (tokens as Token[]).find(
        (t) => t.row === mint.row && t.domainSepHex === mint.domainSepHex && t.kind === mint.kindByte,
      );
      expect(row, `no token row for mint ${mint.row}/${mint.domainSepHex}`).toBeDefined();
      expect(row!.colorHex).toBe(mint.colorHex);
      expect(row!.storage).toBe('native');
    }
  });

  it('keeps a payload for every rejection rule of MIP sections 2.1, 2.2 and 3', () => {
    const reasons = new Set(
      payloads.filter((p: { expect: string }) => p.expect === 'rejected').map((p: { reason: string }) => p.reason),
    );
    expect(reasons).toEqual(
      new Set([
        'val_len_beyond_package',
        'val_type_reserved',
        'val_type_rule',
        'key_empty',
        'key_pointer_invalid',
        'kind_unknown',
      ]),
    );

    for (const payload of payloads) {
      expect(payload.payloadHex).toHaveLength(PAYLOAD_SIZE * 2);
      expect(payload.why).toBeTruthy();
      expect(['rejected', 'applied', 'ignored']).toContain(payload.expect);
      if (payload.expect === 'ignored') {
        expect([LEGACY_EVENT_NAME, PRE_MIP_EVENT_NAME]).toContain(payload.eventName);
      } else {
        expect(payload.eventName).toBe(EVENT_NAME);
      }
    }

    // UC-1: a declared length the one-part package does not hold.
    expect(payloads.some((p: { len: number }) => p.len > ONE_PART_VALUE_SIZE)).toBe(true);
    expect(payloads.some((p: { kind: number }) => p.kind > 3)).toBe(true);
    // 6 is the first reserved val-type in the final text; 5 became Null.
    expect(payloads.some((p: { valType: number }) => p.valType > VAL_TYPE_NULL)).toBe(true);
  });

  it('keeps the rules MIP-0018 added to the #315 draft, on both sides of each', () => {
    const find = (predicate: (p: Record<string, unknown>) => boolean): Record<string, unknown>[] =>
      (payloads as Record<string, unknown>[]).filter(predicate);

    // A Null is applied when val-len is 0 and rejected when it is not.
    expect(
      find((p) => p.valType === VAL_TYPE_NULL && p.expect === 'applied').every((p) => p.len === 0),
    ).toBe(true);
    expect(find((p) => p.valType === VAL_TYPE_NULL && p.expect === 'applied').length).toBeGreaterThan(0);
    expect(
      find((p) => p.valType === VAL_TYPE_NULL && p.expect === 'rejected' && p.reason === 'val_type_rule').length,
    ).toBe(1);

    // val-type 6, not 5, is the first reserved value.
    expect(find((p) => p.valType === 6 && p.expect === 'rejected' && p.reason === 'val_type_reserved').length).toBe(1);

    // An integer may be 1..31 bytes: a 3-byte one is applied, a 32-byte one is not.
    expect(find((p) => p.valType === 2 && p.len === 3 && p.expect === 'applied').length).toBe(1);
    expect(find((p) => p.valType === 2 && p.len === MAX_INTEGER_LEN + 1 && p.expect === 'rejected').length).toBe(1);

    // A JSON fragment is rejected — the `metadata/<n>` convention is retired —
    // while a JSON scalar is one complete value and is applied.
    expect(find((p) => p.valType === 3 && p.keyText === 'metadata/0' && p.expect === 'rejected').length).toBe(1);
    expect(find((p) => p.valType === 3 && p.expect === 'applied').length).toBeGreaterThan(0);

    // A `/metadata/` key must be an RFC 6901 pointer: `~1`/`~0` yes, `~2` no.
    expect(
      find((p) => String(p.keyText).startsWith('/metadata/') && p.expect === 'applied').length,
    ).toBeGreaterThanOrEqual(2);
    expect(find((p) => p.reason === 'key_pointer_invalid').length).toBe(1);
  });

  it('carries the events a consumer must IGNORE rather than reject', () => {
    // MIP section 1: any Misc event under another name is not a TokenMetadata
    // event at all. The pre-MIP name is the case that will actually be seen.
    // Two names are ignored: this repository's pre-MIP `TokenMetadata`, and the
    // `mip-xxxx:token-metadata[v1]` placeholder of the #315 draft that the
    // Stagenet reference set was actually deployed under — the event name IS
    // the layout version (MIP section 8), and nothing was redeployed.
    const ignored = payloads.filter((p: { expect: string }) => p.expect === 'ignored');
    expect(ignored).toHaveLength(2);
    expect(new Set(ignored.map((p: { eventName: string }) => p.eventName))).toEqual(
      new Set([LEGACY_EVENT_NAME, PRE_MIP_EVENT_NAME]),
    );
    for (const payload of ignored) expect(payload.reason).toBeUndefined();
  });

  it('carries well-known keys whose Appendix A projection fails but whose event is APPLIED', () => {
    // MIP section 5.3: keep the trait, flag the projection, do not reject.
    const projectionFailures = payloads.filter((p: { projectionFails?: boolean }) => p.projectionFails);
    expect(projectionFailures.length).toBeGreaterThanOrEqual(5);
    for (const payload of projectionFailures) {
      expect(payload.expect).toBe('applied');
      expect(payload.reason).toBeUndefined();
    }
    // The headline case: a well-known key carrying the wrong val-type.
    expect(
      projectionFailures.some(
        (p: { keyText: string; valType: number }) => p.keyText === 'decimals' && p.valType === 1,
      ),
    ).toBe(true);
  });

  it('documents the event size the MIP fixes and the UC-1 header', () => {
    expect(MISC_EVENT_SIZE).toBe(32 + PAYLOAD_SIZE);
    expect(32 + 1 + 32 + 1 + 2).toBe(HEADER_SIZE);
    expect(HEADER_SIZE + ONE_PART_VALUE_SIZE).toBe(PAYLOAD_SIZE);
  });

  it('never mentions the state this repository used to have', () => {
    // The MIP has three consumer states; `inconsistent` was ours and is gone.
    const corpus = JSON.stringify([expectedTokens, negatives, referenceSet]);
    expect(corpus).not.toContain('inconsistent');
  });
});
