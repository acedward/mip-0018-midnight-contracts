# The standard lives in the MIP, not here

**The normative text is [MIP-0018, "On-Chain Token Metadata Emission"](https://github.com/midnightntwrk/midnight-improvement-proposals/pull/325)** —
MIP PR #325, file `mips/mip-0018-on-chain-token-metadata.md`, commit `37a3471`,
status Proposed. This repository is that MIP's reference implementation: the
Compact module, the reference contracts, a byte-exact consumer-side decoder and
two fixture corpora.

**This branch implements an amendment in development, "UC-1"** — the MIP text is
unchanged; the amendment is written down in the section below and nowhere else in
this repository. It keeps the event name `mip-0018:token-metadata[v1]` (everything
is in development: no `[v2]` name), widens `val-len` to two little-endian bytes so
one value can be of any length, and opts the event into the Multi-Part Event rule
so a long value travels as one package of several events. Every other rule of the
MIP applies unchanged.

Earlier revisions of this file carried a second, repo-local copy of the rules.
It is gone on purpose. Two normative texts drift, and when they do nobody can
say which one a contract was written against. Read the MIP for what the bytes
mean; read this file for how this repository implements them, and for UC-1.

Where the MIP is cited below, "section N" is a section of the MIP.

## What the MIP fixes, in one paragraph

A contract emits [MIP-0002](https://github.com/midnightntwrk/midnight-improvement-proposals)
`Misc` events named `pad(32, "mip-0018:token-metadata[v1]")`, one declaration of one
`(domainSep, kind, key, value)` tuple per package. A consumer folds those declarations
last-write-wins into a table keyed by `(contractAddress, domainSep, kind)`. The
emitting contract is the only authority for its own tokens, because a native token's
colour is derived from `(domainSep, contractAddress)` and never transmitted. Sections
1 to 8 are normative; the example keys of Appendix A are a convention.

## UC-1 — the amendment in development (MIP text unchanged)

**Opt-in.** Events named `mip-0018:token-metadata[v1]` follow the Multi-Part Event
rule (`mip-xxxx:multi-part[v1]`, the draft at
[acedward/compact-multi-part-event](https://github.com/acedward/compact-multi-part-event)):
a reader merges every such event of one contract in one intent of one transaction,
in ledger emission order, into ONE package of `256·k` bytes, keeping all 256 bytes
of every part. A single event is `k = 1`.

**Payload** — the package's merged payload:

| Offset | Size | Field | Rule |
|---|---|---|---|
| 0 | 32 | `domainSep` | as in the MIP |
| 32 | 1 | `kind` | as in the MIP (0..3; 4..255 rejected) |
| 33 | 32 | `key` | as in the MIP (NUL-padded; a `/metadata/` key must be an RFC 6901 pointer) |
| 65 | 1 | `val-type` | as in the MIP (0..5; 6..255 rejected) |
| 66 | **2** | `val-len` | unsigned 16-bit, **little-endian** (Compact's own `Uint<16>` serialization): `0..65535`, with `68 + val-len ≤ 256·k` |
| 68 | `val-len` | `value` | the value; every byte after it is ignored |

`32 + 1 + 32 + 1 + 2 = 68` header bytes, so one event holds **188** value bytes; a
value of `n` bytes takes `ceil((68 + n) / 256)` parts.

**Rules.**

- **One package = one declaration.** Multi-part only lengthens one value; it never
  carries several declarations. A contract MUST NOT emit two declarations in one
  intent: a reader would merge them, and every declaration after the first would be
  lost (its bytes read as padding after the first value).
- **All parts of a package in one intent and one execution phase** — here always
  guaranteed, which the Multi-Part Event rule recommends. In this repository: ONE
  circuit call emits every part (`emitHead`, then `emitPart` as needed), and the
  deployer sends one call per transaction.
- A declared length the package does not hold (`68 + val-len > 256·k`) is rejected
  (stable reason `val_len_beyond_package`, which replaces the one-byte layout's
  `val_len_too_long`).
- The bytes after the value are ignored, as the MIP already says (emitters SHOULD zero
  them). So a publisher that broke the one-declaration rule gets its FIRST declaration
  applied and the rest ignored.
- Everything else as in the MIP: kinds, keys and the `/metadata/` pointer rule, the
  val-type rules (integer 1..31 bytes little-endian, ONE complete JSON value, absolute
  URI, UTF-8 strings), Null = val-type 5 with `val-len` 0, authority from the emitting
  address, the colour derivation, and last write wins per
  `(contractAddress, domainSep, kind, key)` in section 6.2's order — a package
  positioned by its FIRST part.

**Practical limit (informative).** 65535 bytes needs 257 parts; one block bounds a
package (about 33 parts on a local dev chain's default parameters, about 169 on
Stagenet, as measured by the Multi-Part Event reference implementation), so the
chain, not the format, bounds the largest value.

**Not changed.** The legacy placeholder name `mip-xxxx:token-metadata[v1]` (below) keeps
its one-byte layout and does not opt into the Multi-Part Event rule.

## The module

`contracts/TokenMetadata.compact` is the module a conforming contract imports:

```compact
import "./TokenMetadata" prefix TM_;

// Who may emit (the emitter secret — see below)
constructor(emitterSecretHash: Bytes<32>) { TM_initializeEmitter(emitterSecretHash); }
TM_assertEmitter();                    // FIRST statement of every emitting circuit
TM_emitterSecretHashOf(secret)         // pure: the constructor argument, computed off chain

// One declaration per circuit call
TM_emitTokenMetadata(domainSep, kind, key, valType, valLen, value);  // one part: valLen: Uint<16> <= 188, value: Bytes<188>
TM_emitNull(domainSep, kind, key);                                   // val-type 5, val-len 0
TM_emitHead(domainSep, kind, key, valType, valLen, valueHead);       // first part of a long value (valLen = the whole length)
TM_emitPart(part);                                                   // each next 256 bytes, in the same call

TM_KIND_UNSHIELDED()   // 0 — unshielded native
TM_KIND_SHIELDED()     // 1 — shielded native
TM_KIND_LEDGER_FLAG()  // 2 — added to the privacy bit: balances in contract state

TM_VAL_TYPE_OPAQUE()   // 0 — bytes, no parsing rule
TM_VAL_TYPE_STRING()   // 1 — valid UTF-8
TM_VAL_TYPE_INTEGER()  // 2 — Uint<8*val-len>, little-endian, val-len 1..31
TM_VAL_TYPE_JSON()     // 3 — ONE complete JSON value (RFC 8259)
TM_VAL_TYPE_URI()      // 4 — valid UTF-8 that parses as an absolute URI
TM_VAL_TYPE_NULL()     // 5 — Null: val-len 0, clears the key's current value

TM_EVENT_NAME()        // pad(32, "mip-0018:token-metadata[v1]")
TM_ONE_PART_VALUE_SIZE() // 188
```

`emitStandardFields` (name, symbol and decimals from one call) is gone: three
declarations in one intent is exactly what UC-1 forbids. Publish them as three calls.

Implementation notes that are not obvious from the MIP:

- **The payload is one `Bytes[...]` spread**, and `val-len` needs no helper:
  `Bytes[...domainSep, kind, ...key, valType, ...(valLen as Bytes<2>), ...valueHead]`
  with `valLen: Uint<16>`. Compact's Uint-to-Bytes cast puts the least-significant
  byte first, so the wire is little-endian by construction — measured, not assumed:
  `258` is `02 01` at offsets 66–67 and `700` is `bc 02`. `test/probe.test.ts`
  asserts every offset on real compiled output.
- **One circuit call can emit several events**, in call order, from one intent. That
  is how a long value is published: `emitHead` with the whole `val-len`, then
  `emitPart` for every further 256 bytes, in the same circuit.
- **With literal arguments everything constant-folds**: a one-event literal
  declaration is k=6 / 23 rows, a three-part one k=7 / 23 rows. The emitter check
  (below) is what a literal emitting circuit actually costs: k=13, ~4 160 rows.
- **val-type 2 is little-endian, and this was measured, not read off.** MIP
  section 2.1 says the meaningful prefix is the canonical Compact serialization
  of `Uint<8 × val-len>`; Appendix A prints `6` as `Uint<128>` =
  `0x06000000000000000000000000000000`. `@midnight-ntwrk/compact-runtime` 0.19.0's
  `convertBigintToBytes(16, 6n)` returns those sixteen bytes, and a compiled
  `Uint<128>` ledger cell holding 258 carries the aligned atom `0201`. A reader that
  took these bytes big-endian would read `decimals = 6` as 2.6 × 10³⁷.
- **The event name is one literal**, inside `EVENT_NAME()`; the compiler folds the call.
- **An unused module circuit, witness or ledger field costs nothing downstream.** An
  importer that never calls `assertEmitter` has no `emitterSecret` witness and no
  `emitterSecretHash` field in its generated types (the probe is such an importer).
- **A constructor cannot emit** (section 6.7). Every reference contract exposes
  emitting circuits for the deployer to call right after deployment.
- **`Opaque<"string">` cannot be serialised into a circuit.** The OpenZeppelin-based
  templates keep `name`/`symbol` as `Opaque<"string">` for their MIP-0011/0014/0004
  circuits; the events carry the byte form, passed to the setter.
- **Reading log events in process**: the VM hands over the 288 serialized event
  bytes as an aligned value with trailing NULs **trimmed**, while declaring
  `length: 288`. Zero-extend before slicing (`rawMiscBytes` does). An indexer
  reading `MiscContractEvent.payload` over GraphQL gets the 256 bytes already
  re-padded.

## The emitter secret — who may emit

The Multi-Part Event rule proves that a package is complete and came from one
intent; it does not prove the publisher was allowed ("authorship comes from the
emitting contract's access control"). Every contract in this repository therefore
carries one secret per contract (`METADATA_EMISSOR_SECRET`):

- The constructor takes `emitterSecretHash = TM_emitterSecretHashOf(secret)` —
  `persistentHash<Vector<2, Bytes<32>>>([pad(32, "mip-0018:emitter:"), secret])`,
  which is SHA-256 over the 64 concatenated bytes — and stores it in the sealed
  ledger field `emitterSecretHash` (exported as `TM_emitterSecretHash`).
- Every emitting circuit starts with `TM_assertEmitter()`: the `emitterSecret()`
  witness returns the caller's secret, the circuit hashes it and asserts equality. A
  caller without the secret fails while executing — before any proof or transaction
  exists — with `TokenMetadata: caller is not the emitter`.
- The secret is a private proof input: the proof server sees it, so prove on one you
  run, and keep the secret in protected storage (the deploy script reads it from a
  mode-600 file and keeps it in the contract's private state).
- The contract's maintenance authority outranks it, as always.

The one exception is `contracts/probe/MetadataProbe.compact`, a test harness that
must emit arbitrary, deliberately invalid payloads and is never deployed.

## The `repository` key

Every generated contract declares, for every token it describes, the key
`repository` with val-type 4 (absolute URI): the URL of its own source file on this
repository's `main`, e.g.
`https://github.com/acedward/mip-0018-midnight-contracts/blob/main/contracts/generated/LSUN18.compact`.
It is an issuer-defined key (the MIP allows any key); not a commit permalink, because a
contract cannot contain the hash of the commit that contains it.

## The legacy name — read this before trusting an address

The MIP was drafted as PR #315 with `mip-xxxx` standing in for an unassigned
number, and **this repository's Stagenet reference set was deployed under that
placeholder**: event name `mip-xxxx:token-metadata[v1]`, from commit
[`1721636`](https://github.com/acedward/mip-erc7496-midnight-contracts/tree/17216362077b3c48da05f06d3a7b0be1b248e1ff),
blocks 508 432 – 508 599 on 2026-09-18, in the one-byte `val-len` layout. The event
name **is** the layout version (section 8), so those events are a different format:
a conforming MIP-0018 consumer **ignores** them — it does not reject them, and it
must not reinterpret them as `[v1]` of this MIP.

**Nothing was redeployed.** The eleven contracts are still on chain, still
emitting the placeholder name, and `deployments/stagenet-deployment.json` plus
`fixtures/stagenet/` remain the record of exactly what they emitted
(`scripts/export-fixtures.ts` is that record's recorder and reads the one-byte
layout). What would it take to move them? Section "Upgrade Path for Existing
Contracts" of the MIP: either a redeployment, or a new emitting circuit inserted by
each contract's maintenance authority.

Consequences:

- `contracts/generated/*.compact` are now the **MIP-18 set** (`LSUN18` … `LLIAR18`,
  below) on the UC-1 layout and do not correspond to the contracts on Stagenet. The
  sources of the deployed set are at `1721636`.
- The UmbraDB token indexer deliberately keeps a **second, demonstrative**
  decoder path for the placeholder name, validated under the draft's own rules,
  so the live page can keep showing the Stagenet reference set.
  `fixtures/legacy-mip-xxxx/` is the frozen corpus it pins, and
  `fixtures/simulator/negative-payloads.json` carries the placeholder name as an
  `ignored` payload so a consumer can pin the conforming behaviour from the current
  corpus alone.

### What the final text changed, beyond the number

| Rule | #315 draft | MIP-0018 |
|---|---|---|
| Event name | `mip-xxxx:token-metadata[v1]` | `mip-0018:token-metadata[v1]` |
| val-type 2 | `1 ≤ val-len ≤ 16`, big-endian assumed; `decimals` one byte | byte-aligned `Uint<8>`..`Uint<248>`, so `1 ≤ val-len ≤ 31`; the canonical **little-endian** Compact serialization; `Uint<128>` (val-len 16) is the emitter default, and a decoder MUST accept every width |
| val-type 3 | any UTF-8; a `metadata/<n>` part was a fragment to reassemble | **ONE complete JSON value** (RFC 8259) — object, array or scalar; a fragment is rejected |
| Multipart values | an Appendix A convention | none in the MIP text (section 5.4) — **UC-1** above adds them through the Multi-Part Event rule, one declaration per package |
| val-type 5 | reserved → reject | **Null**: `val-len` MUST be 0, the value bytes ignored, sets the key's current value to Null without erasing history |
| Reserved val-types | 5–255 | 6–255 |
| `/metadata/` keys | no rule | MUST be valid UTF-8 **RFC 6901** JSON Pointers (only `~0`/`~1` escapes) or the event is rejected; every other key is bytes and is never rejected for its encoding |
| Appendix A | a key registry in spirit | explicitly **informative**: transport acceptance never depends on a key's meaning |

A Null on the UC-1 layout:

```
key      = pad(32, "description")
val-type = 5
val-len  = 00 00                  // little-endian Uint<16>
value    = 188 NUL bytes          // emitters SHOULD zero them, consumers MUST ignore them
```

`LMOON18` declares a `description`, clears it with a Null, then declares a 377-byte
`description` in two parts, so `fixtures/simulator/` holds the history, the Null and
the long current value. A Null is not an empty string, not empty opaque bytes, and not
the JSON literal `null` under val-type 3.

## Reference contracts

| file | what it demonstrates |
|---|---|
| `contracts/NativeShieldedToken.compact` | one static domain, kind 1 (OpenZeppelin `NativeShieldedToken`, MIP-0011 profile) + one emitting setter |
| `contracts/NativeUnshieldedToken.compact` | one static domain, kind 0; its `kind_` argument also builds the "Ledger Liar" |
| `contracts/NativeDualToken.compact` | one domain minted both shielded and unshielded — two rows, one colour |
| `contracts/ShieldedCollection.compact` | one address, one domain per piece (OpenZeppelin `NativeShieldedTokenFamily`): the ERC-1155 / EIP-7496 shape |
| `contracts/LedgerToken.compact` | balances in contract state (OpenZeppelin `FungibleToken`, owner-only mint), kind 2 — the case only events can make visible |
| `contracts/generated/*18.compact` | **the MIP-18 set**: the eleven reference tokens as literal-payload contracts, one declaration per call, long values as multi-part packages |
| `contracts/probe/MetadataProbe.compact` | arbitrary payloads and packages, including the ones a consumer must reject, and the two names it must ignore |

Each template has ONE emitting circuit — its setter (`setMetadata`, `setPieceTrait`),
`valLen: Uint<16>`, `value: Bytes<188>` — checked by the emitter secret; `name`,
`symbol` and `decimals` are three setter calls. The templates carry one-part values;
a longer value is the generated contracts' job (a runtime multi-part payload would be
several k=19 events). OpenZeppelin is `@openzeppelin/compact-contracts@0.4.0-alpha.3`,
whose shielded `_mint` takes a `ZswapCoinPublicKey` (#833), so the templates' `mint` /
`mintPiece` do too.

The consumer reference is `test/token-metadata.ts`: a decoder and a validator
that re-implement sections 1, 2.1, 2.2, 3 and 5.1 and UC-1 from the text rather than
importing anything from the contracts, so a disagreement between the two sides fails
a test. `packagesOf(events)` applies the Multi-Part Event grouping to the events of one
simulated call (one intent). Rejection reasons: `payload_size`, `kind_unknown`,
`key_empty`, `key_pointer_invalid`, `val_type_reserved`, `val_len_beyond_package`
and `val_type_rule`, applied in payload-offset order; an event under another name is
`ignored`, which is not the same thing as rejected.

## Circuit cost

The MIP fixes the bytes on the wire, not how a contract assembles them, and the
assembly strategy dominates the proving cost. Measured with
`./scripts/circuit-cost.sh` (ZKIR v2, `zkir mock-compile`, no keys generated):

| what is emitted | k | rows |
|---|---|---|
| one literal one-part declaration, no emitter check (`MetadataProbe.publishFixture`) | 6 | 23 |
| one literal THREE-part declaration, no emitter check (`MetadataProbe.publishLongFixture3`) | 7 | 23 |
| any literal declaration WITH the emitter check (every `LSUN18` … `LLIAR18` emitting circuit, 1–3 parts) | 13 | 4 162 |
| a collection piece's selector circuit: 6–10 literal declarations, one chosen per call (`CNST18.publishOrion`) | 13 | 4 508 – 4 780 |
| one runtime one-part declaration with the emitter check (the templates' `setMetadata`) | 19 | 332 210 |
| a runtime two-part package (`MetadataProbe.publishRaw2`, test only) | 19 | 494 583 |

For scale, OpenZeppelin's shielded `_mint` is k=14. A k=19 proving key is about
134 MB and some six minutes of `zkir`.

Consequences, all applied here: **one declaration per call** (UC-1), and the
contracts that are actually deployed are the generated literal ones, which emit
byte-identical payloads for two orders of magnitude less proving work
(`test/generated.test.ts` asserts the identity against the template).

**A deploy writes every verifier key.** A k=13 key is about 2.1 KB, and a block of the
ledger's default parameters (the local dev chain) allows 50 000 bytes written, so one
deploy holds about 20 such circuits — one circuit per declaration does not fit a
many-token contract (the 36 declarations of `CNST18` were 39 circuits, 81 873 bytes of
keys). The generated **collection** therefore has one circuit per piece,
`publish<Piece>(which: Uint<8>)`, whose public selector picks ONE of the piece's literal
declarations per call (an unknown selector fails); every other generated contract keeps
one circuit per declaration. `test/generated.test.ts` keeps every contract at ≤ 20 proof
circuits.

Historical Compact/MinoCrab results and their exact fixtures are archived under
[`benchmarks/`](./benchmarks/) and [`minocrab/`](./minocrab/README.md). Those
fixtures use the earlier `TokenMetadata` event name, the one-byte `val-len` layout
and `Bytes<16>` symbols; they are not measurements of this format.

## Fixtures

`fixtures/simulator/` is the offline corpus: the MIP-18 set executed in the Compact
simulator with deterministic addresses, so an indexer can be written and tested
byte-exactly before any chain is involved. It carries the events as a chain delivers
them and the packages they form, the mint effects, the colour vectors, the expected
token rows and a negative corpus — one package per rejection rule, the UC-1 package
rules on both sides, the events a consumer must *ignore* (both legacy names) and the
ones it must *apply* even though their Appendix A projection fails. Its `SOURCE.md`
(generated) pins every input and output by SHA-256.

`fixtures/legacy-mip-xxxx/` is the frozen `mip-xxxx` corpus of the #315 draft,
kept verbatim for consumers that keep a legacy path. It is never regenerated and
nothing in this repository's tests reads it; see its `SOURCE.md`.

`fixtures/stagenet/` is the on-chain record of the Stagenet deployment — also
under the placeholder name, for the reason given above.

See the README for how to regenerate the corpora that are regenerated.
