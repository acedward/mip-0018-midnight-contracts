import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
}

export type ImpureCircuits<PS> = {
  publishRaw(context: __compactRuntime.CircuitContext<PS>,
             domainSep_0: Uint8Array,
             kind_0: bigint,
             key_0: Uint8Array,
             valType_0: bigint,
             valLen_0: bigint,
             value_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishFixture(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishRaw2(context: __compactRuntime.CircuitContext<PS>,
              domainSep_0: Uint8Array,
              kind_0: bigint,
              key_0: Uint8Array,
              valType_0: bigint,
              valLen_0: bigint,
              valueHead_0: Uint8Array,
              part1_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishRaw3(context: __compactRuntime.CircuitContext<PS>,
              domainSep_0: Uint8Array,
              kind_0: bigint,
              key_0: Uint8Array,
              valType_0: bigint,
              valLen_0: bigint,
              valueHead_0: Uint8Array,
              part1_0: Uint8Array,
              part2_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishLongFixture3(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishLongFixture2(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishLegacyName(context: __compactRuntime.CircuitContext<PS>,
                    domainSep_0: Uint8Array,
                    kind_0: bigint,
                    key_0: Uint8Array,
                    valType_0: bigint,
                    valLen_0: bigint,
                    value_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishPreMipName(context: __compactRuntime.CircuitContext<PS>,
                    domainSep_0: Uint8Array,
                    kind_0: bigint,
                    key_0: Uint8Array,
                    valType_0: bigint,
                    valLen_0: bigint,
                    value_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  calls(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, bigint>>;
}

export type ProvableCircuits<PS> = {
  publishRaw(context: __compactRuntime.CircuitContext<PS>,
             domainSep_0: Uint8Array,
             kind_0: bigint,
             key_0: Uint8Array,
             valType_0: bigint,
             valLen_0: bigint,
             value_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishFixture(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishRaw2(context: __compactRuntime.CircuitContext<PS>,
              domainSep_0: Uint8Array,
              kind_0: bigint,
              key_0: Uint8Array,
              valType_0: bigint,
              valLen_0: bigint,
              valueHead_0: Uint8Array,
              part1_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishRaw3(context: __compactRuntime.CircuitContext<PS>,
              domainSep_0: Uint8Array,
              kind_0: bigint,
              key_0: Uint8Array,
              valType_0: bigint,
              valLen_0: bigint,
              valueHead_0: Uint8Array,
              part1_0: Uint8Array,
              part2_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishLongFixture3(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishLongFixture2(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishLegacyName(context: __compactRuntime.CircuitContext<PS>,
                    domainSep_0: Uint8Array,
                    kind_0: bigint,
                    key_0: Uint8Array,
                    valType_0: bigint,
                    valLen_0: bigint,
                    value_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishPreMipName(context: __compactRuntime.CircuitContext<PS>,
                    domainSep_0: Uint8Array,
                    kind_0: bigint,
                    key_0: Uint8Array,
                    valType_0: bigint,
                    valLen_0: bigint,
                    value_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  calls(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, bigint>>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  publishRaw(context: __compactRuntime.CircuitContext<PS>,
             domainSep_0: Uint8Array,
             kind_0: bigint,
             key_0: Uint8Array,
             valType_0: bigint,
             valLen_0: bigint,
             value_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishFixture(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishRaw2(context: __compactRuntime.CircuitContext<PS>,
              domainSep_0: Uint8Array,
              kind_0: bigint,
              key_0: Uint8Array,
              valType_0: bigint,
              valLen_0: bigint,
              valueHead_0: Uint8Array,
              part1_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishRaw3(context: __compactRuntime.CircuitContext<PS>,
              domainSep_0: Uint8Array,
              kind_0: bigint,
              key_0: Uint8Array,
              valType_0: bigint,
              valLen_0: bigint,
              valueHead_0: Uint8Array,
              part1_0: Uint8Array,
              part2_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishLongFixture3(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishLongFixture2(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishLegacyName(context: __compactRuntime.CircuitContext<PS>,
                    domainSep_0: Uint8Array,
                    kind_0: bigint,
                    key_0: Uint8Array,
                    valType_0: bigint,
                    valLen_0: bigint,
                    value_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishPreMipName(context: __compactRuntime.CircuitContext<PS>,
                    domainSep_0: Uint8Array,
                    kind_0: bigint,
                    key_0: Uint8Array,
                    valType_0: bigint,
                    valLen_0: bigint,
                    value_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  calls(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, bigint>>;
}

export type Ledger = {
  readonly _calls: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): Promise<__compactRuntime.ConstructorResult<PS>>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
export declare const expectedVk: Record<string, string>;
