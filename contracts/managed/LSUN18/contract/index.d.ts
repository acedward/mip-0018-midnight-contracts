import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type ContractAddress = { bytes: Uint8Array };

export type Either<A, B> = { is_left: boolean; left: A; right: B };

export type Maybe<T> = { is_some: boolean; value: T };

export type Witnesses<PS> = {
  emitterSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  totalSupply(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, bigint>>;
  balanceOf(context: __compactRuntime.CircuitContext<PS>, account_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, bigint>>;
  ledgerMint(context: __compactRuntime.CircuitContext<PS>,
             account_0: Uint8Array,
             amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  transfer(context: __compactRuntime.CircuitContext<PS>,
           sender_0: Uint8Array,
           recipient_0: Uint8Array,
           amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishName(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishSymbol(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishDecimals(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishRepository(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
}

export type ProvableCircuits<PS> = {
  totalSupply(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, bigint>>;
  balanceOf(context: __compactRuntime.CircuitContext<PS>, account_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, bigint>>;
  ledgerMint(context: __compactRuntime.CircuitContext<PS>,
             account_0: Uint8Array,
             amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  transfer(context: __compactRuntime.CircuitContext<PS>,
           sender_0: Uint8Array,
           recipient_0: Uint8Array,
           amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishName(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishSymbol(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishDecimals(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishRepository(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
}

export type PureCircuits = {
  domainSep(): Uint8Array;
  kind(): bigint;
  decimals(): bigint;
}

export type Circuits<PS> = {
  domainSep(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  kind(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, bigint>>;
  decimals(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, bigint>>;
  totalSupply(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, bigint>>;
  balanceOf(context: __compactRuntime.CircuitContext<PS>, account_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, bigint>>;
  ledgerMint(context: __compactRuntime.CircuitContext<PS>,
             account_0: Uint8Array,
             amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  transfer(context: __compactRuntime.CircuitContext<PS>,
           sender_0: Uint8Array,
           recipient_0: Uint8Array,
           amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishName(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishSymbol(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishDecimals(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publishRepository(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
}

export type Ledger = {
  readonly TM_emitterSecretHash: Uint8Array;
  _balances: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  readonly _totalSupply: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               emitterSecretHash_0: Uint8Array): Promise<__compactRuntime.ConstructorResult<PS>>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
export declare const expectedVk: Record<string, string>;
