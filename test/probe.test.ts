/**
 * The compile-and-layout proof for the MIP's payload on the UC-1 layout (MIP-0018
 * sections 1, 2, 2.1, 2.2, 3 and 5.1 — `mips/mip-0018-on-chain-token-metadata.md`
 * @ `37a3471`, MIP PR #325 — amended in development by UC-1: a 2-byte
 * little-endian `val-len` at offset 66, the value from offset 68).
 *
 * `Bytes[...spread, byte, ...(valLen as Bytes<2>), ...spread]` is what the
 * reference module uses to concatenate the six fields into one `Bytes<256>`.
 * These tests assert that it compiles (the module is imported, so it did), that
 * the field widths really add up to 256, and that every field lands on the
 * offset UC-1 documents — in particular `val-len`, low byte first at 66.
 */
import { describe, expect, it } from 'vitest';
import { Contract, ledger } from '../contracts/managed/MetadataProbe/contract/index.js';
import {
  EVENT_NAME,
  HEADER_SIZE,
  KIND_LEDGER_FLAG,
  KIND_SHIELDED,
  KIND_UNSHIELDED,
  LEGACY_EVENT_NAME,
  MAX_INTEGER_LEN,
  MAX_VAL_LEN,
  MISC_EVENT_SIZE,
  ONE_PART_VALUE_SIZE,
  PAYLOAD_SIZE,
  PRE_MIP_EVENT_NAME,
  VAL_TYPE_INTEGER,
  VAL_TYPE_JSON,
  VAL_TYPE_NULL,
  VAL_TYPE_RESERVED_FROM,
  VAL_TYPE_STRING,
  decodeInteger,
  deploy,
  encodeInteger,
  hex,
  pad,
  rawMiscBytes,
  validateTokenMetadataEvent,
} from './token-metadata.js';

type PrivateState = Record<string, never>;

const probe = () => deploy<PrivateState>(new Contract<PrivateState>({}), {});
const emptyValue = new Uint8Array(ONE_PART_VALUE_SIZE);
/** The 188-byte one-part value field with `text` in its meaningful prefix. */
const value188 = (text: string) => {
  const v = new Uint8Array(ONE_PART_VALUE_SIZE);
  v.set(new TextEncoder().encode(text));
  return v;
};

describe('the MIP payload layout (UC-1)', () => {
  it('adds up: 32 + 1 + 32 + 1 + 2 + 188 = 256', () => {
    expect(32 + 1 + 32 + 1 + 2).toBe(HEADER_SIZE);
    expect(HEADER_SIZE + ONE_PART_VALUE_SIZE).toBe(PAYLOAD_SIZE);
    expect(MISC_EVENT_SIZE).toBe(32 + PAYLOAD_SIZE);
  });

  it('names the event exactly as MIP section 1 states, byte for byte', async () => {
    const c = await probe();
    const { events, rawEvents } = await c.call('publishFixture');
    const nameBytes = rawMiscBytes(rawEvents[0] as never).subarray(0, 32);

    // MIP section 1: 0x6d69702d…5b76315d (27 bytes) followed by five NULs.
    expect(hex(nameBytes)).toBe(
      '6d69702d303031383a746f6b656e2d6d657461646174615b76315d0000000000',
    );
    expect(hex(nameBytes)).toBe(hex(pad(32, EVENT_NAME)));
    expect(nameBytes.subarray(27).every((b) => b === 0)).toBe(true);
    expect(events.every((e) => e.eventName === EVENT_NAME)).toBe(true);
  });

  it('emits ONE literal one-part declaration per call (UC-1: one declaration per intent)', async () => {
    const c = await probe();
    const { events, packages, rawEvents } = await c.call('publishFixture');

    expect(events).toHaveLength(1);
    expect(packages).toHaveLength(1);
    const [event] = packages;
    expect(rawMiscBytes(rawEvents[0] as never)).toHaveLength(MISC_EVENT_SIZE);
    expect(event.payload).toHaveLength(PAYLOAD_SIZE);
    expect(event.parts).toBe(1);
    expect(event.address).toBe(c.address);
    expect(hex(event.domainSep)).toBe(hex(pad(32, 'umbra:probe')));
    expect(event.kind).toBe(KIND_SHIELDED);
    expect(event.keyText).toBe('name');
    expect(event.valType).toBe(VAL_TYPE_STRING);
    expect(event.len).toBe(11);
    expect(event.valueText).toBe('Umbra Probe');
    expect(event.value).toHaveLength(ONE_PART_VALUE_SIZE);
    // The value is NUL-padded after `val-len`, never truncated.
    expect(event.trailing.every((b) => b === 0)).toBe(true);
    expect(event.trailing).toHaveLength(ONE_PART_VALUE_SIZE - 11);
    expect(validateTokenMetadataEvent(event)).toEqual({ outcome: 'accepted' });
  });

  it('places every field at its documented byte offset', async () => {
    const c = await probe();
    const domainSep = new Uint8Array(32).fill(0xab);
    const key = pad(32, 'magnitude');
    const value = value188('1.25');

    const { events } = await c.call(
      'publishRaw',
      domainSep,
      BigInt(KIND_UNSHIELDED),
      key,
      BigInt(VAL_TYPE_STRING),
      4n,
      value,
    );
    expect(events).toHaveLength(1);
    const [event] = events;
    const p = event.payload;

    expect(p).toHaveLength(PAYLOAD_SIZE);
    expect(hex(p.subarray(0, 32))).toBe(hex(domainSep)); //   0..31   domainSep
    expect(p[32]).toBe(KIND_UNSHIELDED); //                   32      kind
    expect(hex(p.subarray(33, 65))).toBe(hex(key)); //        33..64  key
    expect(p[65]).toBe(VAL_TYPE_STRING); //                   65      val-type
    expect(p[66]).toBe(4); //                                 66      val-len, low byte
    expect(p[67]).toBe(0); //                                 67      val-len, high byte
    expect(hex(p.subarray(68, 256))).toBe(hex(value)); //     68..255 value
    expect(event.keyText).toBe('magnitude');
    expect(event.valueText).toBe('1.25');
  });

  it('writes val-len as a little-endian Uint<16>: the low byte at 66, the high byte at 67', async () => {
    const c = await probe();
    for (const [valLen, low, high] of [
      [258, 0x02, 0x01],
      [700, 0xbc, 0x02],
      [MAX_VAL_LEN, 0xff, 0xff],
    ] as const) {
      const { events } = await c.call(
        'publishRaw',
        pad(32, 'umbra:probe'),
        BigInt(KIND_SHIELDED),
        pad(32, 'metadata'),
        BigInt(VAL_TYPE_STRING),
        BigInt(valLen),
        emptyValue,
      );
      const p = events[0].payload;
      expect([p[66], p[67]], `val-len ${valLen}`).toEqual([low, high]);
      expect(events[0].len, `val-len ${valLen}`).toBe(valLen);
      // One event is a one-part package: it holds 188 value bytes, so a declared
      // length beyond them is rejected (the bytes are not in the package).
      expect(validateTokenMetadataEvent(events[0]), `val-len ${valLen}`).toEqual({
        outcome: 'rejected',
        reason: 'val_len_beyond_package',
      });
    }
  });

  it('carries a full one-part value (val-len = 188) and rejects 189 in one part', async () => {
    const c = await probe();
    const value = new Uint8Array(ONE_PART_VALUE_SIZE);
    for (let i = 0; i < value.length; i += 1) value[i] = 0x41 + (i % 26);
    const raw = (valLen: number) =>
      c.call(
        'publishRaw',
        pad(32, 'umbra:probe'),
        BigInt(KIND_SHIELDED),
        pad(32, 'description'),
        BigInt(VAL_TYPE_STRING),
        BigInt(valLen),
        value,
      );

    const full = (await raw(ONE_PART_VALUE_SIZE)).events[0];
    expect(full.payload).toHaveLength(PAYLOAD_SIZE);
    expect(full.len).toBe(ONE_PART_VALUE_SIZE);
    expect(hex(full.valueBytes)).toBe(hex(value));
    expect(full.trailing).toHaveLength(0);
    expect(validateTokenMetadataEvent(full)).toEqual({ outcome: 'accepted' });

    const over = (await raw(ONE_PART_VALUE_SIZE + 1)).events[0];
    expect(over.valueBytes).toHaveLength(ONE_PART_VALUE_SIZE); // the decoder clamps
    expect(validateTokenMetadataEvent(over)).toEqual({ outcome: 'rejected', reason: 'val_len_beyond_package' });
  });

  it('ignores the bytes after the value, whatever they are (MIP; spec 00024 Q11)', async () => {
    const c = await probe();
    const value = value188('ok');
    value.fill(0x5a, 2); // non-zero bytes after val-len
    const { events } = await c.call(
      'publishRaw',
      pad(32, 'umbra:probe'),
      BigInt(KIND_SHIELDED),
      pad(32, 'description'),
      BigInt(VAL_TYPE_STRING),
      2n,
      value,
    );
    expect(events[0].valueText).toBe('ok');
    expect(events[0].trailing.every((b) => b === 0x5a)).toBe(true);
    expect(validateTokenMetadataEvent(events[0])).toEqual({ outcome: 'accepted' });
  });

  it('emits the kind byte verbatim, including the two ledger kinds and one a consumer rejects', async () => {
    const c = await probe();
    const kinds = [
      KIND_UNSHIELDED,
      KIND_SHIELDED,
      KIND_LEDGER_FLAG,
      KIND_LEDGER_FLAG | KIND_SHIELDED,
      4, // MIP section 3: 4..255 MUST reject the event
    ];

    for (const kind of kinds) {
      const { events } = await c.call(
        'publishRaw',
        pad(32, 'umbra:probe'),
        BigInt(kind),
        pad(32, 'name'),
        BigInt(VAL_TYPE_STRING),
        0n,
        emptyValue,
      );
      expect(events[0].kind).toBe(kind);
      expect(validateTokenMetadataEvent(events[0]).outcome).toBe(kind <= 3 ? 'accepted' : 'rejected');
    }
  });

  it('lets a caller build the payloads MIP sections 2.1 and 2.2 say a consumer must reject', async () => {
    const c = await probe();
    const raw = (kind: number, key: Uint8Array, valType: number, valLen: number) =>
      c.call('publishRaw', pad(32, 'umbra:probe'), BigInt(kind), key, BigInt(valType), BigInt(valLen), emptyValue);

    // a declared length the one-part package does not hold (68 + 200 > 256)
    const long = await raw(KIND_SHIELDED, pad(32, 'name'), VAL_TYPE_STRING, 200);
    expect(long.events[0].len).toBe(200);
    expect(long.events[0].valueBytes).toHaveLength(ONE_PART_VALUE_SIZE); // the decoder clamps
    expect(validateTokenMetadataEvent(long.events[0])).toEqual({
      outcome: 'rejected',
      reason: 'val_len_beyond_package',
    });

    // a reserved val-type
    const reserved = await raw(KIND_SHIELDED, pad(32, 'name'), 7, 0);
    expect(reserved.events[0].valType).toBe(7);
    expect(validateTokenMetadataEvent(reserved.events[0])).toEqual({
      outcome: 'rejected',
      reason: 'val_type_reserved',
    });

    // an empty key (all NUL after trimming)
    const emptyKey = await raw(KIND_SHIELDED, new Uint8Array(32), VAL_TYPE_STRING, 0);
    expect(emptyKey.events[0].keyText).toBe('');
    expect(validateTokenMetadataEvent(emptyKey.events[0])).toEqual({
      outcome: 'rejected',
      reason: 'key_empty',
    });

    // val-type 2 with val-len 0 breaks the integer rule (1 <= val-len <= 31)
    const badInt = await raw(KIND_SHIELDED, pad(32, 'decimals'), VAL_TYPE_INTEGER, 0);
    expect(validateTokenMetadataEvent(badInt.events[0])).toEqual({
      outcome: 'rejected',
      reason: 'val_type_rule',
    });

    // val-type 6 is the FIRST reserved value in the final text: 5 became Null.
    const firstReserved = await raw(KIND_SHIELDED, pad(32, 'name'), VAL_TYPE_RESERVED_FROM, 0);
    expect(firstReserved.events[0].valType).toBe(6);
    expect(validateTokenMetadataEvent(firstReserved.events[0])).toEqual({
      outcome: 'rejected',
      reason: 'val_type_reserved',
    });
  });

  it('accepts every integer width MIP section 2.1 permits, and no other', async () => {
    const c = await probe();
    const raw = (valType: number, valLen: number, value: Uint8Array) =>
      c.call('publishRaw', pad(32, 'umbra:probe'), BigInt(KIND_SHIELDED), pad(32, 'supplyCap'), BigInt(valType), BigInt(valLen), value);
    const padded = (bytes: Uint8Array) => {
      const v = new Uint8Array(ONE_PART_VALUE_SIZE);
      v.set(bytes);
      return v;
    };

    // `Uint<8>` through `Uint<248>`: 1..31 bytes, and every one must be taken.
    for (const width of [1, 3, 16, MAX_INTEGER_LEN]) {
      const { events } = await raw(VAL_TYPE_INTEGER, width, padded(encodeInteger(7n, width)));
      expect(validateTokenMetadataEvent(events[0]), `val-len ${width}`).toEqual({ outcome: 'accepted' });
      expect(decodeInteger(events[0].valueBytes), `val-len ${width}`).toBe(7n);
    }

    // 32 bytes would be `Uint<256>`, which is not a Compact unsigned integer.
    const tooWide = await raw(VAL_TYPE_INTEGER, MAX_INTEGER_LEN + 1, padded(new Uint8Array(32).fill(1)));
    expect(validateTokenMetadataEvent(tooWide.events[0])).toEqual({
      outcome: 'rejected',
      reason: 'val_type_rule',
    });

    // The bytes are little-endian, whatever the width.
    const le = await raw(VAL_TYPE_INTEGER, 3, padded(encodeInteger(258n, 3)));
    expect(hex(le.events[0].valueBytes)).toBe('020100');
    expect(decodeInteger(le.events[0].valueBytes)).toBe(258n);
  });

  it('takes a complete JSON value of any shape and rejects a fragment (MIP section 2.1)', async () => {
    const c = await probe();
    const json = async (text: string) => {
      const v = new Uint8Array(ONE_PART_VALUE_SIZE);
      const bytes = new TextEncoder().encode(text);
      v.set(bytes);
      const { events } = await c.call(
        'publishRaw',
        pad(32, 'umbra:probe'),
        BigInt(KIND_SHIELDED),
        pad(32, 'metadata'),
        BigInt(VAL_TYPE_JSON),
        BigInt(bytes.length),
        v,
      );
      return validateTokenMetadataEvent(events[0]);
    };

    // object, array and scalar values are all one complete JSON value
    expect(await json('{"description":"Example"}')).toEqual({ outcome: 'accepted' });
    expect(await json('[1,2,3]')).toEqual({ outcome: 'accepted' });
    expect(await json('1.25')).toEqual({ outcome: 'accepted' });
    expect(await json('null')).toEqual({ outcome: 'accepted' });

    // A fragment is not. This is exactly what retires the `metadata/<n>`
    // multipart convention this repository used against the #315 draft: the
    // MIP defines no reassembly, so a part can only be rejected.
    expect(await json('{"description":"A nebula published in parts, because one Tok')).toEqual({
      outcome: 'rejected',
      reason: 'val_type_rule',
    });
    // Neither is an empty JSON payload (MIP section 2.2).
    expect(await json('')).toEqual({ outcome: 'rejected', reason: 'val_type_rule' });
  });

  it('treats val-type 5 as Null only when val-len is zero (MIP sections 2.1 and 6.2)', async () => {
    const c = await probe();
    const nul = (valLen: number, value: Uint8Array) =>
      c.call('publishRaw', pad(32, 'umbra:probe'), BigInt(KIND_SHIELDED), pad(32, 'description'), BigInt(VAL_TYPE_NULL), BigInt(valLen), value);

    const proper = await nul(0, emptyValue);
    expect(proper.events[0].valType).toBe(5);
    expect(proper.events[0].len).toBe(0);
    expect(validateTokenMetadataEvent(proper.events[0])).toEqual({ outcome: 'accepted' });

    // Consumers MUST ignore every value byte, so a non-NUL filler changes nothing.
    const noisy = await nul(0, new Uint8Array(ONE_PART_VALUE_SIZE).fill(0x5a));
    expect(validateTokenMetadataEvent(noisy.events[0])).toEqual({ outcome: 'accepted' });

    // A non-zero val-len is not a Null: `serialize<[], 0>([])` is zero bytes.
    const wrong = await nul(4, emptyValue);
    expect(validateTokenMetadataEvent(wrong.events[0])).toEqual({
      outcome: 'rejected',
      reason: 'val_type_rule',
    });
  });

  it('requires a `/metadata/` key to be an RFC 6901 pointer, and leaves every other key alone', async () => {
    const c = await probe();
    const withKey = async (key: Uint8Array) => {
      const { events } = await c.call(
        'publishRaw',
        pad(32, 'umbra:probe'),
        BigInt(KIND_SHIELDED),
        key,
        BigInt(VAL_TYPE_STRING),
        2n,
        value188('ok'),
      );
      return validateTokenMetadataEvent(events[0]);
    };

    // MIP Appendix A's own example, and both legal escapes.
    expect(await withKey(pad(32, '/metadata/0'))).toEqual({ outcome: 'accepted' });
    expect(await withKey(pad(32, '/metadata/a~1b~0c'))).toEqual({ outcome: 'accepted' });
    // `~2` is not an escape RFC 6901 defines.
    expect(await withKey(pad(32, '/metadata/~2'))).toEqual({
      outcome: 'rejected',
      reason: 'key_pointer_invalid',
    });
    // A key that merely contains the text is not under the prefix.
    expect(await withKey(pad(32, 'x/metadata/~2'))).toEqual({ outcome: 'accepted' });
    // `metadata/0` — the old multipart key — is an ordinary key, not a pointer.
    expect(await withKey(pad(32, 'metadata/0'))).toEqual({ outcome: 'accepted' });
    // MIP section 5.1: another key is never rejected for its encoding.
    expect(await withKey(Uint8Array.from([0xff, 0xfe, 0x01, ...new Uint8Array(29)]))).toEqual({
      outcome: 'accepted',
    });
  });

  it('accepts val-len = 0 as "present, empty" (MIP section 6.2)', async () => {
    const c = await probe();
    const { events } = await c.call(
      'publishRaw',
      pad(32, 'umbra:probe'),
      BigInt(KIND_SHIELDED),
      pad(32, 'description'),
      BigInt(VAL_TYPE_STRING),
      0n,
      emptyValue,
    );
    expect(events[0].len).toBe(0);
    expect(events[0].valueBytes).toHaveLength(0);
    expect(validateTokenMetadataEvent(events[0])).toEqual({ outcome: 'accepted' });
  });

  // The two ignored names keep the one-byte `val-len`, 189-byte value layout their
  // emitters used; a MIP-0018 consumer never reads their payload, it ignores the name.
  const legacyValue = (text: string) => {
    const v = new Uint8Array(189);
    v.set(new TextEncoder().encode(text));
    return v;
  };

  it('emits the pre-MIP event name too, and a consumer IGNORES it rather than rejecting it', async () => {
    const c = await probe();
    const { events } = await c.call(
      'publishLegacyName',
      pad(32, 'umbra:probe'),
      BigInt(KIND_SHIELDED),
      pad(32, 'name'),
      BigInt(VAL_TYPE_STRING),
      4n,
      legacyValue('Old!'),
    );

    expect(events[0].eventName).toBe(LEGACY_EVENT_NAME);
    expect(events[0].payload).toHaveLength(PAYLOAD_SIZE);
    // Everything about the payload is well formed in ITS layout (val-len one byte
    // at 66, value from 67); only the name disqualifies it.
    expect(events[0].payload[66]).toBe(4);
    expect(new TextDecoder().decode(events[0].payload.subarray(67, 71))).toBe('Old!');
    expect(validateTokenMetadataEvent(events[0])).toEqual({
      outcome: 'ignored',
      reason: 'event_name',
    });
  });

  it('ignores the #315 placeholder name the Stagenet reference set was deployed with', async () => {
    // MIP sections 1 and 8: the event name IS the layout version, so a v1
    // MIP-0018 consumer ignores `mip-xxxx:token-metadata[v1]` exactly as it
    // ignores the pre-MIP name — nothing was redeployed when the number landed.
    const c = await probe();
    const { events } = await c.call(
      'publishPreMipName',
      pad(32, 'umbra:probe'),
      BigInt(KIND_SHIELDED),
      pad(32, 'name'),
      BigInt(VAL_TYPE_STRING),
      13n,
      legacyValue('Shielded Star'),
    );

    expect(events[0].eventName).toBe(PRE_MIP_EVENT_NAME);
    expect(events[0].payload).toHaveLength(PAYLOAD_SIZE);
    expect(new TextDecoder().decode(events[0].payload.subarray(67, 80))).toBe('Shielded Star');
    expect(validateTokenMetadataEvent(events[0])).toEqual({
      outcome: 'ignored',
      reason: 'event_name',
    });
  });

  // ---- UC-1 multi-part: one call, one intent, one package ------------------
  const LONG3 = "MIP-0018 UC-1 probe: one declaration, three parts, one intent. MIP-0018 UC-1 probe: one declaration, three parts, one intent. MIP-0018 UC-1 probe: one declaration, three parts, one intent. MIP-0018 UC-1 probe: one declaration, three parts, one intent. MIP-0018 UC-1 probe: one declaration, three parts, one intent. MIP-0018 UC-1 probe: one declaration, three parts, one intent. MIP-0018 UC-1 probe: one declaration, three parts, one intent. MIP-0018 UC-1 probe: one declaration, three parts, one intent. MIP-0018 UC-1 probe: one declaration, three parts, one intent. MIP-0018 UC-1 probe: one declaration, three parts, one intent. MIP-0018 UC-1 probe: one declaration, three parts, one intent. MIP-001";
  const LONG2 = "MIP-0018 UC-1 probe: one declaration, two parts, zero padded. MIP-0018 UC-1 probe: one declaration, two parts, zero padded. MIP-0018 UC-1 probe: one declaration, two parts, zero padded. MIP-0018 UC-1 probe: one declaration, two parts, zero padded. MIP-0018 UC-1 probe: one declaration, two parts, zer";

  it('merges a literal three-part declaration into ONE package of 768 bytes (68 + 700)', async () => {
    const c = await probe();
    const { events, packages } = await c.call('publishLongFixture3');
    expect(events).toHaveLength(3); // three Misc events …
    expect(packages).toHaveLength(1); // … one package ([Y] §4: one contract, one intent, one name)
    const [pkg] = packages;
    expect(pkg.parts).toBe(3);
    expect(pkg.payload).toHaveLength(768);
    expect(pkg.len).toBe(700);
    expect([pkg.payload[66], pkg.payload[67]]).toEqual([0xbc, 0x02]);
    expect(pkg.valueText).toBe(LONG3);
    expect(pkg.trailing).toHaveLength(0); // 700 bytes fill the package exactly
    // No hidden framing: part 2 is the value's bytes 188..443, verbatim.
    expect(new TextDecoder().decode(events[1].payload)).toBe(LONG3.slice(188, 444));
    expect(validateTokenMetadataEvent(pkg)).toEqual({ outcome: 'accepted' });
    // Read on its own, the head is a one-part package that does not hold its value.
    expect(validateTokenMetadataEvent(events[0])).toEqual({ outcome: 'rejected', reason: 'val_len_beyond_package' });
  });

  it('keeps the trailing zeros of the last part: a 300-byte value in two parts', async () => {
    const c = await probe();
    const { packages } = await c.call('publishLongFixture2');
    expect(packages).toHaveLength(1);
    const [pkg] = packages;
    expect(pkg.parts).toBe(2);
    expect(pkg.payload).toHaveLength(512); // all 256 bytes of every part kept ([Y] §4)
    expect(pkg.len).toBe(300);
    expect(pkg.valueText).toBe(LONG2);
    expect(pkg.trailing).toHaveLength(512 - 68 - 300);
    expect(pkg.trailing.every((b) => b === 0)).toBe(true);
    expect(validateTokenMetadataEvent(pkg)).toEqual({ outcome: 'accepted' });
  });

  it('rejects a declared length beyond the package, and accepts one that exactly fills it', async () => {
    const c = await probe();
    const head = new Uint8Array(ONE_PART_VALUE_SIZE).fill(0x61);
    const part = new Uint8Array(PAYLOAD_SIZE).fill(0x62);
    const two = (valLen: number) =>
      c.call('publishRaw2', pad(32, 'umbra:probe'), BigInt(KIND_SHIELDED), pad(32, 'description'),
        BigInt(VAL_TYPE_STRING), BigInt(valLen), head, part);
    // 68 + 444 = 512: exactly two parts.
    const full = (await two(444)).packages[0];
    expect(full.parts).toBe(2);
    expect(full.valueBytes).toHaveLength(444);
    expect(validateTokenMetadataEvent(full)).toEqual({ outcome: 'accepted' });
    // 68 + 445 > 512: one byte the package does not hold.
    expect(validateTokenMetadataEvent((await two(445)).packages[0])).toEqual({
      outcome: 'rejected',
      reason: 'val_len_beyond_package',
    });
    const three = await c.call('publishRaw3', pad(32, 'umbra:probe'), BigInt(KIND_SHIELDED),
      pad(32, 'description'), BigInt(VAL_TYPE_STRING), BigInt(MAX_VAL_LEN), head, part, part);
    expect(three.packages[0].parts).toBe(3);
    expect(validateTokenMetadataEvent(three.packages[0])).toEqual({ outcome: 'rejected', reason: 'val_len_beyond_package' });
  });

  it('ignores non-zero bytes after a multi-part value (MIP; spec 00024 Q11)', async () => {
    const c = await probe();
    const head = new Uint8Array(ONE_PART_VALUE_SIZE).fill(0x61);
    const part = new Uint8Array(PAYLOAD_SIZE).fill(0x5a); // bytes 188.. of the value region
    part.fill(0x62, 0, 12); // the value's last 12 bytes: 188 + 12 = 200
    const { packages } = await c.call('publishRaw2', pad(32, 'umbra:probe'), BigInt(KIND_SHIELDED),
      pad(32, 'description'), BigInt(VAL_TYPE_STRING), 200n, head, part);
    expect(packages[0].valueBytes).toHaveLength(200);
    expect(packages[0].trailing.every((b) => b === 0x5a)).toBe(true);
    expect(validateTokenMetadataEvent(packages[0])).toEqual({ outcome: 'accepted' });
  });

  it('counts its publish calls in ledger state', async () => {
    const c = await probe();
    expect(ledger(c.state as never)._calls).toBe(0n);
    await c.call('publishFixture');
    await c.call('publishFixture');
    expect(ledger(c.state as never)._calls).toBe(2n);
    const { result } = await c.call('calls');
    expect(result).toBe(2n);
  });
});
