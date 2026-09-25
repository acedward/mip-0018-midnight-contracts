import * as __compactRuntime from '@midnight-ntwrk/compact-runtime';
__compactRuntime.checkRuntimeVersion('0.19.0');

const _descriptor_0 = new __compactRuntime.CompactTypeUnsignedInteger(65535n, 2);

const _descriptor_1 = new __compactRuntime.CompactTypeBytes(288);

const _descriptor_2 = new __compactRuntime.CompactTypeBytes(32);

const _descriptor_3 = new __compactRuntime.CompactTypeUnsignedInteger(255n, 1);

const _descriptor_4 = new __compactRuntime.CompactTypeBytes(189);

const _descriptor_5 = new __compactRuntime.CompactTypeUnsignedInteger(18446744073709551615n, 8);

const _descriptor_6 = new __compactRuntime.CompactTypeBytes(188);

const _descriptor_7 = new __compactRuntime.CompactTypeBytes(256);

const _descriptor_8 = __compactRuntime.CompactTypeBoolean;

class _Either_0 {
  alignment() {
    return _descriptor_8.alignment().concat(_descriptor_2.alignment().concat(_descriptor_2.alignment()));
  }
  fromValue(value_0) {
    return {
      is_left: _descriptor_8.fromValue(value_0),
      left: _descriptor_2.fromValue(value_0),
      right: _descriptor_2.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_8.toValue(value_0.is_left).concat(_descriptor_2.toValue(value_0.left).concat(_descriptor_2.toValue(value_0.right)));
  }
}

const _descriptor_9 = new _Either_0();

const _descriptor_10 = new __compactRuntime.CompactTypeUnsignedInteger(340282366920938463463374607431768211455n, 16);

class _ContractAddress_0 {
  alignment() {
    return _descriptor_2.alignment();
  }
  fromValue(value_0) {
    return {
      bytes: _descriptor_2.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_2.toValue(value_0.bytes);
  }
}

const _descriptor_11 = new _ContractAddress_0();

const _descriptor_12 = new __compactRuntime.CompactTypeUnsignedInteger(4294967295n, 4);

export class Contract {
  witnesses;
  constructor(...args_0) {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`Contract constructor: expected 1 argument, received ${args_0.length}`);
    }
    const witnesses_0 = args_0[0];
    if (typeof(witnesses_0) !== 'object') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor is not an object');
    }
    this.witnesses = witnesses_0;
    this.circuits = {
      publishRaw: async (...args_1) => {
        if (args_1.length !== 7) {
          throw new __compactRuntime.CompactError(`publishRaw: expected 7 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const domainSep_0 = args_1[1];
        const kind_0 = args_1[2];
        const key_0 = args_1[3];
        const valType_0 = args_1[4];
        const valLen_0 = args_1[5];
        const value_0 = args_1[6];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.callContext.currentQueryContext != undefined)) {
          __compactRuntime.typeError('publishRaw',
                                     'argument 1 (as invoked from Typescript)',
                                     'MetadataProbe.compact line 40 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(domainSep_0.buffer instanceof ArrayBuffer && domainSep_0.BYTES_PER_ELEMENT === 1 && domainSep_0.length === 32)) {
          __compactRuntime.typeError('publishRaw',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'MetadataProbe.compact line 40 char 1',
                                     'Bytes<32>',
                                     domainSep_0)
        }
        if (!(typeof(kind_0) === 'bigint' && kind_0 >= 0n && kind_0 <= 255n)) {
          __compactRuntime.typeError('publishRaw',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'MetadataProbe.compact line 40 char 1',
                                     'Uint<0..256>',
                                     kind_0)
        }
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('publishRaw',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'MetadataProbe.compact line 40 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        if (!(typeof(valType_0) === 'bigint' && valType_0 >= 0n && valType_0 <= 255n)) {
          __compactRuntime.typeError('publishRaw',
                                     'argument 4 (argument 5 as invoked from Typescript)',
                                     'MetadataProbe.compact line 40 char 1',
                                     'Uint<0..256>',
                                     valType_0)
        }
        if (!(typeof(valLen_0) === 'bigint' && valLen_0 >= 0n && valLen_0 <= 65535n)) {
          __compactRuntime.typeError('publishRaw',
                                     'argument 5 (argument 6 as invoked from Typescript)',
                                     'MetadataProbe.compact line 40 char 1',
                                     'Uint<0..65536>',
                                     valLen_0)
        }
        if (!(value_0.buffer instanceof ArrayBuffer && value_0.BYTES_PER_ELEMENT === 1 && value_0.length === 188)) {
          __compactRuntime.typeError('publishRaw',
                                     'argument 6 (argument 7 as invoked from Typescript)',
                                     'MetadataProbe.compact line 40 char 1',
                                     'Bytes<188>',
                                     value_0)
        }
        const context = __compactRuntime.copyCircuitContext(contextOrig_0);
        const partialProofData = {
          input: {
            value: _descriptor_2.toValue(domainSep_0).concat(_descriptor_3.toValue(kind_0).concat(_descriptor_2.toValue(key_0).concat(_descriptor_3.toValue(valType_0).concat(_descriptor_0.toValue(valLen_0).concat(_descriptor_6.toValue(value_0)))))),
            alignment: _descriptor_2.alignment().concat(_descriptor_3.alignment().concat(_descriptor_2.alignment().concat(_descriptor_3.alignment().concat(_descriptor_0.alignment().concat(_descriptor_6.alignment())))))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = await this._publishRaw_0(context,
                                                  partialProofData,
                                                  domainSep_0,
                                                  kind_0,
                                                  key_0,
                                                  valType_0,
                                                  valLen_0,
                                                  value_0);
        partialProofData.output = { value: [], alignment: [] };
        __compactRuntime.finalizeCallProofData(context, partialProofData);
        return { result: result_0, context: context, gasCost: context.callContext.currentGasCost };
      },
      publishFixture: async (...args_1) => {
        if (args_1.length !== 1) {
          throw new __compactRuntime.CompactError(`publishFixture: expected 1 argument (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.callContext.currentQueryContext != undefined)) {
          __compactRuntime.typeError('publishFixture',
                                     'argument 1 (as invoked from Typescript)',
                                     'MetadataProbe.compact line 57 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        const context = __compactRuntime.copyCircuitContext(contextOrig_0);
        const partialProofData = {
          input: { value: [], alignment: [] },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = await this._publishFixture_0(context, partialProofData);
        partialProofData.output = { value: [], alignment: [] };
        __compactRuntime.finalizeCallProofData(context, partialProofData);
        return { result: result_0, context: context, gasCost: context.callContext.currentGasCost };
      },
      publishRaw2: async (...args_1) => {
        if (args_1.length !== 8) {
          throw new __compactRuntime.CompactError(`publishRaw2: expected 8 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const domainSep_0 = args_1[1];
        const kind_0 = args_1[2];
        const key_0 = args_1[3];
        const valType_0 = args_1[4];
        const valLen_0 = args_1[5];
        const valueHead_0 = args_1[6];
        const part1_0 = args_1[7];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.callContext.currentQueryContext != undefined)) {
          __compactRuntime.typeError('publishRaw2',
                                     'argument 1 (as invoked from Typescript)',
                                     'MetadataProbe.compact line 68 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(domainSep_0.buffer instanceof ArrayBuffer && domainSep_0.BYTES_PER_ELEMENT === 1 && domainSep_0.length === 32)) {
          __compactRuntime.typeError('publishRaw2',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'MetadataProbe.compact line 68 char 1',
                                     'Bytes<32>',
                                     domainSep_0)
        }
        if (!(typeof(kind_0) === 'bigint' && kind_0 >= 0n && kind_0 <= 255n)) {
          __compactRuntime.typeError('publishRaw2',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'MetadataProbe.compact line 68 char 1',
                                     'Uint<0..256>',
                                     kind_0)
        }
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('publishRaw2',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'MetadataProbe.compact line 68 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        if (!(typeof(valType_0) === 'bigint' && valType_0 >= 0n && valType_0 <= 255n)) {
          __compactRuntime.typeError('publishRaw2',
                                     'argument 4 (argument 5 as invoked from Typescript)',
                                     'MetadataProbe.compact line 68 char 1',
                                     'Uint<0..256>',
                                     valType_0)
        }
        if (!(typeof(valLen_0) === 'bigint' && valLen_0 >= 0n && valLen_0 <= 65535n)) {
          __compactRuntime.typeError('publishRaw2',
                                     'argument 5 (argument 6 as invoked from Typescript)',
                                     'MetadataProbe.compact line 68 char 1',
                                     'Uint<0..65536>',
                                     valLen_0)
        }
        if (!(valueHead_0.buffer instanceof ArrayBuffer && valueHead_0.BYTES_PER_ELEMENT === 1 && valueHead_0.length === 188)) {
          __compactRuntime.typeError('publishRaw2',
                                     'argument 6 (argument 7 as invoked from Typescript)',
                                     'MetadataProbe.compact line 68 char 1',
                                     'Bytes<188>',
                                     valueHead_0)
        }
        if (!(part1_0.buffer instanceof ArrayBuffer && part1_0.BYTES_PER_ELEMENT === 1 && part1_0.length === 256)) {
          __compactRuntime.typeError('publishRaw2',
                                     'argument 7 (argument 8 as invoked from Typescript)',
                                     'MetadataProbe.compact line 68 char 1',
                                     'Bytes<256>',
                                     part1_0)
        }
        const context = __compactRuntime.copyCircuitContext(contextOrig_0);
        const partialProofData = {
          input: {
            value: _descriptor_2.toValue(domainSep_0).concat(_descriptor_3.toValue(kind_0).concat(_descriptor_2.toValue(key_0).concat(_descriptor_3.toValue(valType_0).concat(_descriptor_0.toValue(valLen_0).concat(_descriptor_6.toValue(valueHead_0).concat(_descriptor_7.toValue(part1_0))))))),
            alignment: _descriptor_2.alignment().concat(_descriptor_3.alignment().concat(_descriptor_2.alignment().concat(_descriptor_3.alignment().concat(_descriptor_0.alignment().concat(_descriptor_6.alignment().concat(_descriptor_7.alignment()))))))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = await this._publishRaw2_0(context,
                                                   partialProofData,
                                                   domainSep_0,
                                                   kind_0,
                                                   key_0,
                                                   valType_0,
                                                   valLen_0,
                                                   valueHead_0,
                                                   part1_0);
        partialProofData.output = { value: [], alignment: [] };
        __compactRuntime.finalizeCallProofData(context, partialProofData);
        return { result: result_0, context: context, gasCost: context.callContext.currentGasCost };
      },
      publishRaw3: async (...args_1) => {
        if (args_1.length !== 9) {
          throw new __compactRuntime.CompactError(`publishRaw3: expected 9 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const domainSep_0 = args_1[1];
        const kind_0 = args_1[2];
        const key_0 = args_1[3];
        const valType_0 = args_1[4];
        const valLen_0 = args_1[5];
        const valueHead_0 = args_1[6];
        const part1_0 = args_1[7];
        const part2_0 = args_1[8];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.callContext.currentQueryContext != undefined)) {
          __compactRuntime.typeError('publishRaw3',
                                     'argument 1 (as invoked from Typescript)',
                                     'MetadataProbe.compact line 84 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(domainSep_0.buffer instanceof ArrayBuffer && domainSep_0.BYTES_PER_ELEMENT === 1 && domainSep_0.length === 32)) {
          __compactRuntime.typeError('publishRaw3',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'MetadataProbe.compact line 84 char 1',
                                     'Bytes<32>',
                                     domainSep_0)
        }
        if (!(typeof(kind_0) === 'bigint' && kind_0 >= 0n && kind_0 <= 255n)) {
          __compactRuntime.typeError('publishRaw3',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'MetadataProbe.compact line 84 char 1',
                                     'Uint<0..256>',
                                     kind_0)
        }
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('publishRaw3',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'MetadataProbe.compact line 84 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        if (!(typeof(valType_0) === 'bigint' && valType_0 >= 0n && valType_0 <= 255n)) {
          __compactRuntime.typeError('publishRaw3',
                                     'argument 4 (argument 5 as invoked from Typescript)',
                                     'MetadataProbe.compact line 84 char 1',
                                     'Uint<0..256>',
                                     valType_0)
        }
        if (!(typeof(valLen_0) === 'bigint' && valLen_0 >= 0n && valLen_0 <= 65535n)) {
          __compactRuntime.typeError('publishRaw3',
                                     'argument 5 (argument 6 as invoked from Typescript)',
                                     'MetadataProbe.compact line 84 char 1',
                                     'Uint<0..65536>',
                                     valLen_0)
        }
        if (!(valueHead_0.buffer instanceof ArrayBuffer && valueHead_0.BYTES_PER_ELEMENT === 1 && valueHead_0.length === 188)) {
          __compactRuntime.typeError('publishRaw3',
                                     'argument 6 (argument 7 as invoked from Typescript)',
                                     'MetadataProbe.compact line 84 char 1',
                                     'Bytes<188>',
                                     valueHead_0)
        }
        if (!(part1_0.buffer instanceof ArrayBuffer && part1_0.BYTES_PER_ELEMENT === 1 && part1_0.length === 256)) {
          __compactRuntime.typeError('publishRaw3',
                                     'argument 7 (argument 8 as invoked from Typescript)',
                                     'MetadataProbe.compact line 84 char 1',
                                     'Bytes<256>',
                                     part1_0)
        }
        if (!(part2_0.buffer instanceof ArrayBuffer && part2_0.BYTES_PER_ELEMENT === 1 && part2_0.length === 256)) {
          __compactRuntime.typeError('publishRaw3',
                                     'argument 8 (argument 9 as invoked from Typescript)',
                                     'MetadataProbe.compact line 84 char 1',
                                     'Bytes<256>',
                                     part2_0)
        }
        const context = __compactRuntime.copyCircuitContext(contextOrig_0);
        const partialProofData = {
          input: {
            value: _descriptor_2.toValue(domainSep_0).concat(_descriptor_3.toValue(kind_0).concat(_descriptor_2.toValue(key_0).concat(_descriptor_3.toValue(valType_0).concat(_descriptor_0.toValue(valLen_0).concat(_descriptor_6.toValue(valueHead_0).concat(_descriptor_7.toValue(part1_0).concat(_descriptor_7.toValue(part2_0)))))))),
            alignment: _descriptor_2.alignment().concat(_descriptor_3.alignment().concat(_descriptor_2.alignment().concat(_descriptor_3.alignment().concat(_descriptor_0.alignment().concat(_descriptor_6.alignment().concat(_descriptor_7.alignment().concat(_descriptor_7.alignment())))))))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = await this._publishRaw3_0(context,
                                                   partialProofData,
                                                   domainSep_0,
                                                   kind_0,
                                                   key_0,
                                                   valType_0,
                                                   valLen_0,
                                                   valueHead_0,
                                                   part1_0,
                                                   part2_0);
        partialProofData.output = { value: [], alignment: [] };
        __compactRuntime.finalizeCallProofData(context, partialProofData);
        return { result: result_0, context: context, gasCost: context.callContext.currentGasCost };
      },
      publishLongFixture3: async (...args_1) => {
        if (args_1.length !== 1) {
          throw new __compactRuntime.CompactError(`publishLongFixture3: expected 1 argument (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.callContext.currentQueryContext != undefined)) {
          __compactRuntime.typeError('publishLongFixture3',
                                     'argument 1 (as invoked from Typescript)',
                                     'MetadataProbe.compact line 106 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        const context = __compactRuntime.copyCircuitContext(contextOrig_0);
        const partialProofData = {
          input: { value: [], alignment: [] },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = await this._publishLongFixture3_0(context,
                                                           partialProofData);
        partialProofData.output = { value: [], alignment: [] };
        __compactRuntime.finalizeCallProofData(context, partialProofData);
        return { result: result_0, context: context, gasCost: context.callContext.currentGasCost };
      },
      publishLongFixture2: async (...args_1) => {
        if (args_1.length !== 1) {
          throw new __compactRuntime.CompactError(`publishLongFixture2: expected 1 argument (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.callContext.currentQueryContext != undefined)) {
          __compactRuntime.typeError('publishLongFixture2',
                                     'argument 1 (as invoked from Typescript)',
                                     'MetadataProbe.compact line 119 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        const context = __compactRuntime.copyCircuitContext(contextOrig_0);
        const partialProofData = {
          input: { value: [], alignment: [] },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = await this._publishLongFixture2_0(context,
                                                           partialProofData);
        partialProofData.output = { value: [], alignment: [] };
        __compactRuntime.finalizeCallProofData(context, partialProofData);
        return { result: result_0, context: context, gasCost: context.callContext.currentGasCost };
      },
      publishLegacyName: async (...args_1) => {
        if (args_1.length !== 7) {
          throw new __compactRuntime.CompactError(`publishLegacyName: expected 7 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const domainSep_0 = args_1[1];
        const kind_0 = args_1[2];
        const key_0 = args_1[3];
        const valType_0 = args_1[4];
        const valLen_0 = args_1[5];
        const value_0 = args_1[6];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.callContext.currentQueryContext != undefined)) {
          __compactRuntime.typeError('publishLegacyName',
                                     'argument 1 (as invoked from Typescript)',
                                     'MetadataProbe.compact line 136 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(domainSep_0.buffer instanceof ArrayBuffer && domainSep_0.BYTES_PER_ELEMENT === 1 && domainSep_0.length === 32)) {
          __compactRuntime.typeError('publishLegacyName',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'MetadataProbe.compact line 136 char 1',
                                     'Bytes<32>',
                                     domainSep_0)
        }
        if (!(typeof(kind_0) === 'bigint' && kind_0 >= 0n && kind_0 <= 255n)) {
          __compactRuntime.typeError('publishLegacyName',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'MetadataProbe.compact line 136 char 1',
                                     'Uint<0..256>',
                                     kind_0)
        }
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('publishLegacyName',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'MetadataProbe.compact line 136 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        if (!(typeof(valType_0) === 'bigint' && valType_0 >= 0n && valType_0 <= 255n)) {
          __compactRuntime.typeError('publishLegacyName',
                                     'argument 4 (argument 5 as invoked from Typescript)',
                                     'MetadataProbe.compact line 136 char 1',
                                     'Uint<0..256>',
                                     valType_0)
        }
        if (!(typeof(valLen_0) === 'bigint' && valLen_0 >= 0n && valLen_0 <= 255n)) {
          __compactRuntime.typeError('publishLegacyName',
                                     'argument 5 (argument 6 as invoked from Typescript)',
                                     'MetadataProbe.compact line 136 char 1',
                                     'Uint<0..256>',
                                     valLen_0)
        }
        if (!(value_0.buffer instanceof ArrayBuffer && value_0.BYTES_PER_ELEMENT === 1 && value_0.length === 189)) {
          __compactRuntime.typeError('publishLegacyName',
                                     'argument 6 (argument 7 as invoked from Typescript)',
                                     'MetadataProbe.compact line 136 char 1',
                                     'Bytes<189>',
                                     value_0)
        }
        const context = __compactRuntime.copyCircuitContext(contextOrig_0);
        const partialProofData = {
          input: {
            value: _descriptor_2.toValue(domainSep_0).concat(_descriptor_3.toValue(kind_0).concat(_descriptor_2.toValue(key_0).concat(_descriptor_3.toValue(valType_0).concat(_descriptor_3.toValue(valLen_0).concat(_descriptor_4.toValue(value_0)))))),
            alignment: _descriptor_2.alignment().concat(_descriptor_3.alignment().concat(_descriptor_2.alignment().concat(_descriptor_3.alignment().concat(_descriptor_3.alignment().concat(_descriptor_4.alignment())))))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = await this._publishLegacyName_0(context,
                                                         partialProofData,
                                                         domainSep_0,
                                                         kind_0,
                                                         key_0,
                                                         valType_0,
                                                         valLen_0,
                                                         value_0);
        partialProofData.output = { value: [], alignment: [] };
        __compactRuntime.finalizeCallProofData(context, partialProofData);
        return { result: result_0, context: context, gasCost: context.callContext.currentGasCost };
      },
      publishPreMipName: async (...args_1) => {
        if (args_1.length !== 7) {
          throw new __compactRuntime.CompactError(`publishPreMipName: expected 7 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const domainSep_0 = args_1[1];
        const kind_0 = args_1[2];
        const key_0 = args_1[3];
        const valType_0 = args_1[4];
        const valLen_0 = args_1[5];
        const value_0 = args_1[6];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.callContext.currentQueryContext != undefined)) {
          __compactRuntime.typeError('publishPreMipName',
                                     'argument 1 (as invoked from Typescript)',
                                     'MetadataProbe.compact line 163 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(domainSep_0.buffer instanceof ArrayBuffer && domainSep_0.BYTES_PER_ELEMENT === 1 && domainSep_0.length === 32)) {
          __compactRuntime.typeError('publishPreMipName',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'MetadataProbe.compact line 163 char 1',
                                     'Bytes<32>',
                                     domainSep_0)
        }
        if (!(typeof(kind_0) === 'bigint' && kind_0 >= 0n && kind_0 <= 255n)) {
          __compactRuntime.typeError('publishPreMipName',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'MetadataProbe.compact line 163 char 1',
                                     'Uint<0..256>',
                                     kind_0)
        }
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('publishPreMipName',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'MetadataProbe.compact line 163 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        if (!(typeof(valType_0) === 'bigint' && valType_0 >= 0n && valType_0 <= 255n)) {
          __compactRuntime.typeError('publishPreMipName',
                                     'argument 4 (argument 5 as invoked from Typescript)',
                                     'MetadataProbe.compact line 163 char 1',
                                     'Uint<0..256>',
                                     valType_0)
        }
        if (!(typeof(valLen_0) === 'bigint' && valLen_0 >= 0n && valLen_0 <= 255n)) {
          __compactRuntime.typeError('publishPreMipName',
                                     'argument 5 (argument 6 as invoked from Typescript)',
                                     'MetadataProbe.compact line 163 char 1',
                                     'Uint<0..256>',
                                     valLen_0)
        }
        if (!(value_0.buffer instanceof ArrayBuffer && value_0.BYTES_PER_ELEMENT === 1 && value_0.length === 189)) {
          __compactRuntime.typeError('publishPreMipName',
                                     'argument 6 (argument 7 as invoked from Typescript)',
                                     'MetadataProbe.compact line 163 char 1',
                                     'Bytes<189>',
                                     value_0)
        }
        const context = __compactRuntime.copyCircuitContext(contextOrig_0);
        const partialProofData = {
          input: {
            value: _descriptor_2.toValue(domainSep_0).concat(_descriptor_3.toValue(kind_0).concat(_descriptor_2.toValue(key_0).concat(_descriptor_3.toValue(valType_0).concat(_descriptor_3.toValue(valLen_0).concat(_descriptor_4.toValue(value_0)))))),
            alignment: _descriptor_2.alignment().concat(_descriptor_3.alignment().concat(_descriptor_2.alignment().concat(_descriptor_3.alignment().concat(_descriptor_3.alignment().concat(_descriptor_4.alignment())))))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = await this._publishPreMipName_0(context,
                                                         partialProofData,
                                                         domainSep_0,
                                                         kind_0,
                                                         key_0,
                                                         valType_0,
                                                         valLen_0,
                                                         value_0);
        partialProofData.output = { value: [], alignment: [] };
        __compactRuntime.finalizeCallProofData(context, partialProofData);
        return { result: result_0, context: context, gasCost: context.callContext.currentGasCost };
      },
      calls: async (...args_1) => {
        if (args_1.length !== 1) {
          throw new __compactRuntime.CompactError(`calls: expected 1 argument (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.callContext.currentQueryContext != undefined)) {
          __compactRuntime.typeError('calls',
                                     'argument 1 (as invoked from Typescript)',
                                     'MetadataProbe.compact line 180 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        const context = __compactRuntime.copyCircuitContext(contextOrig_0);
        const partialProofData = {
          input: { value: [], alignment: [] },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = await this._calls_0(context, partialProofData);
        partialProofData.output = { value: _descriptor_5.toValue(result_0), alignment: _descriptor_5.alignment() };
        __compactRuntime.finalizeCallProofData(context, partialProofData);
        return { result: result_0, context: context, gasCost: context.callContext.currentGasCost };
      }
    };
    this.impureCircuits = {
      publishRaw: this.circuits.publishRaw,
      publishFixture: this.circuits.publishFixture,
      publishRaw2: this.circuits.publishRaw2,
      publishRaw3: this.circuits.publishRaw3,
      publishLongFixture3: this.circuits.publishLongFixture3,
      publishLongFixture2: this.circuits.publishLongFixture2,
      publishLegacyName: this.circuits.publishLegacyName,
      publishPreMipName: this.circuits.publishPreMipName,
      calls: this.circuits.calls
    };
    this.provableCircuits = {
      publishRaw: this.circuits.publishRaw,
      publishFixture: this.circuits.publishFixture,
      publishRaw2: this.circuits.publishRaw2,
      publishRaw3: this.circuits.publishRaw3,
      publishLongFixture3: this.circuits.publishLongFixture3,
      publishLongFixture2: this.circuits.publishLongFixture2,
      publishLegacyName: this.circuits.publishLegacyName,
      publishPreMipName: this.circuits.publishPreMipName,
      calls: this.circuits.calls
    };
  }
  async initialState(...args_0) {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 1 argument (as invoked from Typescript), received ${args_0.length}`);
    }
    const constructorContext_0 = args_0[0];
    if (typeof(constructorContext_0) !== 'object') {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'constructorContext' in argument 1 (as invoked from Typescript) to be an object`);
    }
    if (!('initialZswapLocalState' in constructorContext_0)) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialZswapLocalState' in argument 1 (as invoked from Typescript)`);
    }
    if (typeof(constructorContext_0.initialZswapLocalState) !== 'object') {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialZswapLocalState' in argument 1 (as invoked from Typescript) to be an object`);
    }
    const state_0 = new __compactRuntime.ContractState();
    let stateValue_0 = __compactRuntime.StateValue.newArray();
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    state_0.data = new __compactRuntime.ChargedState(stateValue_0);
    state_0.setOperation('publishRaw', new __compactRuntime.ContractOperation());
    state_0.setOperation('publishFixture', new __compactRuntime.ContractOperation());
    state_0.setOperation('publishRaw2', new __compactRuntime.ContractOperation());
    state_0.setOperation('publishRaw3', new __compactRuntime.ContractOperation());
    state_0.setOperation('publishLongFixture3', new __compactRuntime.ContractOperation());
    state_0.setOperation('publishLongFixture2', new __compactRuntime.ContractOperation());
    state_0.setOperation('publishLegacyName', new __compactRuntime.ContractOperation());
    state_0.setOperation('publishPreMipName', new __compactRuntime.ContractOperation());
    state_0.setOperation('calls', new __compactRuntime.ContractOperation());
    const context = __compactRuntime.createCircuitContext('constructor', __compactRuntime.dummyContractAddress(), constructorContext_0.initialZswapLocalState.coinPublicKey, state_0.data, constructorContext_0.initialPrivateState);
    const partialProofData = {
      input: { value: [], alignment: [] },
      output: undefined,
      publicTranscript: [],
      privateTranscriptOutputs: []
    };
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_3.toValue(0n),
                                                                                              alignment: _descriptor_3.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(new Uint8Array(32)),
                                                                                              alignment: _descriptor_2.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_3.toValue(1n),
                                                                                              alignment: _descriptor_3.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_5.toValue(0n),
                                                                                              alignment: _descriptor_5.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    state_0.data = new __compactRuntime.ChargedState(context.callContext.currentQueryContext.state.state);
    return {
      currentContractState: state_0,
      currentPrivateState: context.callContext.currentPrivateState,
      currentZswapLocalState: context.callContext.currentZswapLocalState
    }
  }
  _EVENT_NAME_0() {
    return new Uint8Array([109, 105, 112, 45, 48, 48, 49, 56, 58, 116, 111, 107, 101, 110, 45, 109, 101, 116, 97, 100, 97, 116, 97, 91, 118, 49, 93, 0, 0, 0, 0, 0]);
  }
  _KIND_SHIELDED_0() { return 1n; }
  _VAL_TYPE_STRING_0() { return 1n; }
  _ONE_PART_VALUE_SIZE_0() { return 188n; }
  async _emitHead_0(context,
                    partialProofData,
                    domainSep_0,
                    kind_0,
                    key_0,
                    valType_0,
                    valLen_0,
                    valueHead_0)
  {
    let t_0;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newArray()
                                                          .arrayPush(__compactRuntime.StateValue.newCell({ value: _descriptor_12.toValue(1n),
                                                                                                           alignment: _descriptor_12.alignment() })).arrayPush(__compactRuntime.StateValue.newCell({ value: _descriptor_3.toValue(10n),
                                                                                                                                                                                                     alignment: _descriptor_3.alignment() })).arrayPush(__compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue((t_0 = { name:
                                                                                                                                                                                                                                                                                                                                      this._EVENT_NAME_0(),
                                                                                                                                                                                                                                                                                                                                    payload:
                                                                                                                                                                                                                                                                                                                                      Uint8Array.from([...Array.from(domainSep_0,
                                                                                                                                                                                                                                                                                                                                                                     BigInt),
                                                                                                                                                                                                                                                                                                                                                       kind_0,
                                                                                                                                                                                                                                                                                                                                                       ...Array.from(key_0,
                                                                                                                                                                                                                                                                                                                                                                     BigInt),
                                                                                                                                                                                                                                                                                                                                                       valType_0,
                                                                                                                                                                                                                                                                                                                                                       ...Array.from(__compactRuntime.convertBigintToBytes(2,
                                                                                                                                                                                                                                                                                                                                                                                                           valLen_0,
                                                                                                                                                                                                                                                                                                                                                                                                           'TokenMetadata.compact line 206 char 63'),
                                                                                                                                                                                                                                                                                                                                                                     BigInt),
                                                                                                                                                                                                                                                                                                                                                       ...Array.from(valueHead_0,
                                                                                                                                                                                                                                                                                                                                                                     BigInt)],
                                                                                                                                                                                                                                                                                                                                                      Number) },
                                                                                                                                                                                                                                                                                                                            Uint8Array.from([...Array.from(t_0.name,
                                                                                                                                                                                                                                                                                                                                                           BigInt),
                                                                                                                                                                                                                                                                                                                                             ...Array.from(t_0.payload,
                                                                                                                                                                                                                                                                                                                                                           BigInt)],
                                                                                                                                                                                                                                                                                                                                            Number))),
                                                                                                                                                                                                                                                                                              alignment: _descriptor_1.alignment() }))
                                                          .encode() } },
                                       'log']);
    return [];
  }
  async _emitPart_0(context, partialProofData, part_0) {
    let t_0;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newArray()
                                                          .arrayPush(__compactRuntime.StateValue.newCell({ value: _descriptor_12.toValue(1n),
                                                                                                           alignment: _descriptor_12.alignment() })).arrayPush(__compactRuntime.StateValue.newCell({ value: _descriptor_3.toValue(10n),
                                                                                                                                                                                                     alignment: _descriptor_3.alignment() })).arrayPush(__compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue((t_0 = { name:
                                                                                                                                                                                                                                                                                                                                      this._EVENT_NAME_0(),
                                                                                                                                                                                                                                                                                                                                    payload:
                                                                                                                                                                                                                                                                                                                                      part_0 },
                                                                                                                                                                                                                                                                                                                            Uint8Array.from([...Array.from(t_0.name,
                                                                                                                                                                                                                                                                                                                                                           BigInt),
                                                                                                                                                                                                                                                                                                                                             ...Array.from(t_0.payload,
                                                                                                                                                                                                                                                                                                                                                           BigInt)],
                                                                                                                                                                                                                                                                                                                                            Number))),
                                                                                                                                                                                                                                                                                              alignment: _descriptor_1.alignment() }))
                                                          .encode() } },
                                       'log']);
    return [];
  }
  async _emitTokenMetadata_0(context,
                             partialProofData,
                             domainSep_0,
                             kind_0,
                             key_0,
                             valType_0,
                             valLen_0,
                             value_0)
  {
    __compactRuntime.assert(valLen_0 <= this._ONE_PART_VALUE_SIZE_0(),
                            'TokenMetadata: a one-part value holds at most 188 bytes');
    await this._emitHead_0(context,
                           partialProofData,
                           domainSep_0,
                           kind_0,
                           key_0,
                           valType_0,
                           valLen_0,
                           value_0);
    return [];
  }
  async _publishRaw_0(context,
                      partialProofData,
                      domainSep_0,
                      kind_0,
                      key_0,
                      valType_0,
                      valLen_0,
                      value_0)
  {
    const tmp_0 = 1n;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_3.toValue(1n),
                                                                  alignment: _descriptor_3.alignment() } }] } },
                                       { addi: { immediate: parseInt(__compactRuntime.valueToBigInt(
                                                              { value: _descriptor_0.toValue(tmp_0),
                                                                alignment: _descriptor_0.alignment() }
                                                                .value
                                                            )) } },
                                       { ins: { cached: true, n: 1 } }]);
    await this._emitHead_0(context,
                           partialProofData,
                           domainSep_0,
                           kind_0,
                           key_0,
                           valType_0,
                           valLen_0,
                           value_0);
    return [];
  }
  async _publishFixture_0(context, partialProofData) {
    const tmp_0 = 1n;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_3.toValue(1n),
                                                                  alignment: _descriptor_3.alignment() } }] } },
                                       { addi: { immediate: parseInt(__compactRuntime.valueToBigInt(
                                                              { value: _descriptor_0.toValue(tmp_0),
                                                                alignment: _descriptor_0.alignment() }
                                                                .value
                                                            )) } },
                                       { ins: { cached: true, n: 1 } }]);
    await this._emitTokenMetadata_0(context,
                                    partialProofData,
                                    new Uint8Array([117, 109, 98, 114, 97, 58, 112, 114, 111, 98, 101, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                    this._KIND_SHIELDED_0(),
                                    new Uint8Array([110, 97, 109, 101, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                    this._VAL_TYPE_STRING_0(),
                                    11n,
                                    new Uint8Array([85, 109, 98, 114, 97, 32, 80, 114, 111, 98, 101, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    return [];
  }
  async _publishRaw2_0(context,
                       partialProofData,
                       domainSep_0,
                       kind_0,
                       key_0,
                       valType_0,
                       valLen_0,
                       valueHead_0,
                       part1_0)
  {
    const tmp_0 = 1n;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_3.toValue(1n),
                                                                  alignment: _descriptor_3.alignment() } }] } },
                                       { addi: { immediate: parseInt(__compactRuntime.valueToBigInt(
                                                              { value: _descriptor_0.toValue(tmp_0),
                                                                alignment: _descriptor_0.alignment() }
                                                                .value
                                                            )) } },
                                       { ins: { cached: true, n: 1 } }]);
    await this._emitHead_0(context,
                           partialProofData,
                           domainSep_0,
                           kind_0,
                           key_0,
                           valType_0,
                           valLen_0,
                           valueHead_0);
    await this._emitPart_0(context, partialProofData, part1_0);
    return [];
  }
  async _publishRaw3_0(context,
                       partialProofData,
                       domainSep_0,
                       kind_0,
                       key_0,
                       valType_0,
                       valLen_0,
                       valueHead_0,
                       part1_0,
                       part2_0)
  {
    const tmp_0 = 1n;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_3.toValue(1n),
                                                                  alignment: _descriptor_3.alignment() } }] } },
                                       { addi: { immediate: parseInt(__compactRuntime.valueToBigInt(
                                                              { value: _descriptor_0.toValue(tmp_0),
                                                                alignment: _descriptor_0.alignment() }
                                                                .value
                                                            )) } },
                                       { ins: { cached: true, n: 1 } }]);
    await this._emitHead_0(context,
                           partialProofData,
                           domainSep_0,
                           kind_0,
                           key_0,
                           valType_0,
                           valLen_0,
                           valueHead_0);
    await this._emitPart_0(context, partialProofData, part1_0);
    await this._emitPart_0(context, partialProofData, part2_0);
    return [];
  }
  async _publishLongFixture3_0(context, partialProofData) {
    const tmp_0 = 1n;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_3.toValue(1n),
                                                                  alignment: _descriptor_3.alignment() } }] } },
                                       { addi: { immediate: parseInt(__compactRuntime.valueToBigInt(
                                                              { value: _descriptor_0.toValue(tmp_0),
                                                                alignment: _descriptor_0.alignment() }
                                                                .value
                                                            )) } },
                                       { ins: { cached: true, n: 1 } }]);
    await this._emitHead_0(context,
                           partialProofData,
                           new Uint8Array([117, 109, 98, 114, 97, 58, 112, 114, 111, 98, 101, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                           this._KIND_SHIELDED_0(),
                           new Uint8Array([100, 101, 115, 99, 114, 105, 112, 116, 105, 111, 110, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                           this._VAL_TYPE_STRING_0(),
                           700n,
                           new Uint8Array([77, 73, 80, 45, 48, 48, 49, 56, 32, 85, 67, 45, 49, 32, 112, 114, 111, 98, 101, 58, 32, 111, 110, 101, 32, 100, 101, 99, 108, 97, 114, 97, 116, 105, 111, 110, 44, 32, 116, 104, 114, 101, 101, 32, 112, 97, 114, 116, 115, 44, 32, 111, 110, 101, 32, 105, 110, 116, 101, 110, 116, 46, 32, 77, 73, 80, 45, 48, 48, 49, 56, 32, 85, 67, 45, 49, 32, 112, 114, 111, 98, 101, 58, 32, 111, 110, 101, 32, 100, 101, 99, 108, 97, 114, 97, 116, 105, 111, 110, 44, 32, 116, 104, 114, 101, 101, 32, 112, 97, 114, 116, 115, 44, 32, 111, 110, 101, 32, 105, 110, 116, 101, 110, 116, 46, 32, 77, 73, 80, 45, 48, 48, 49, 56, 32, 85, 67, 45, 49, 32, 112, 114, 111, 98, 101, 58, 32, 111, 110, 101, 32, 100, 101, 99, 108, 97, 114, 97, 116, 105, 111, 110, 44, 32, 116, 104, 114, 101, 101, 32, 112, 97, 114, 116, 115, 44, 32, 111, 110, 101, 32, 105, 110, 116, 101, 110, 116, 46]));
    await this._emitPart_0(context,
                           partialProofData,
                           new Uint8Array([32, 77, 73, 80, 45, 48, 48, 49, 56, 32, 85, 67, 45, 49, 32, 112, 114, 111, 98, 101, 58, 32, 111, 110, 101, 32, 100, 101, 99, 108, 97, 114, 97, 116, 105, 111, 110, 44, 32, 116, 104, 114, 101, 101, 32, 112, 97, 114, 116, 115, 44, 32, 111, 110, 101, 32, 105, 110, 116, 101, 110, 116, 46, 32, 77, 73, 80, 45, 48, 48, 49, 56, 32, 85, 67, 45, 49, 32, 112, 114, 111, 98, 101, 58, 32, 111, 110, 101, 32, 100, 101, 99, 108, 97, 114, 97, 116, 105, 111, 110, 44, 32, 116, 104, 114, 101, 101, 32, 112, 97, 114, 116, 115, 44, 32, 111, 110, 101, 32, 105, 110, 116, 101, 110, 116, 46, 32, 77, 73, 80, 45, 48, 48, 49, 56, 32, 85, 67, 45, 49, 32, 112, 114, 111, 98, 101, 58, 32, 111, 110, 101, 32, 100, 101, 99, 108, 97, 114, 97, 116, 105, 111, 110, 44, 32, 116, 104, 114, 101, 101, 32, 112, 97, 114, 116, 115, 44, 32, 111, 110, 101, 32, 105, 110, 116, 101, 110, 116, 46, 32, 77, 73, 80, 45, 48, 48, 49, 56, 32, 85, 67, 45, 49, 32, 112, 114, 111, 98, 101, 58, 32, 111, 110, 101, 32, 100, 101, 99, 108, 97, 114, 97, 116, 105, 111, 110, 44, 32, 116, 104, 114, 101, 101, 32, 112, 97, 114, 116, 115, 44, 32, 111, 110, 101, 32, 105, 110, 116, 101, 110, 116, 46, 32, 77, 73, 80]));
    await this._emitPart_0(context,
                           partialProofData,
                           new Uint8Array([45, 48, 48, 49, 56, 32, 85, 67, 45, 49, 32, 112, 114, 111, 98, 101, 58, 32, 111, 110, 101, 32, 100, 101, 99, 108, 97, 114, 97, 116, 105, 111, 110, 44, 32, 116, 104, 114, 101, 101, 32, 112, 97, 114, 116, 115, 44, 32, 111, 110, 101, 32, 105, 110, 116, 101, 110, 116, 46, 32, 77, 73, 80, 45, 48, 48, 49, 56, 32, 85, 67, 45, 49, 32, 112, 114, 111, 98, 101, 58, 32, 111, 110, 101, 32, 100, 101, 99, 108, 97, 114, 97, 116, 105, 111, 110, 44, 32, 116, 104, 114, 101, 101, 32, 112, 97, 114, 116, 115, 44, 32, 111, 110, 101, 32, 105, 110, 116, 101, 110, 116, 46, 32, 77, 73, 80, 45, 48, 48, 49, 56, 32, 85, 67, 45, 49, 32, 112, 114, 111, 98, 101, 58, 32, 111, 110, 101, 32, 100, 101, 99, 108, 97, 114, 97, 116, 105, 111, 110, 44, 32, 116, 104, 114, 101, 101, 32, 112, 97, 114, 116, 115, 44, 32, 111, 110, 101, 32, 105, 110, 116, 101, 110, 116, 46, 32, 77, 73, 80, 45, 48, 48, 49, 56, 32, 85, 67, 45, 49, 32, 112, 114, 111, 98, 101, 58, 32, 111, 110, 101, 32, 100, 101, 99, 108, 97, 114, 97, 116, 105, 111, 110, 44, 32, 116, 104, 114, 101, 101, 32, 112, 97, 114, 116, 115, 44, 32, 111, 110, 101, 32, 105, 110, 116, 101, 110, 116, 46, 32, 77, 73, 80, 45, 48, 48, 49]));
    return [];
  }
  async _publishLongFixture2_0(context, partialProofData) {
    const tmp_0 = 1n;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_3.toValue(1n),
                                                                  alignment: _descriptor_3.alignment() } }] } },
                                       { addi: { immediate: parseInt(__compactRuntime.valueToBigInt(
                                                              { value: _descriptor_0.toValue(tmp_0),
                                                                alignment: _descriptor_0.alignment() }
                                                                .value
                                                            )) } },
                                       { ins: { cached: true, n: 1 } }]);
    await this._emitHead_0(context,
                           partialProofData,
                           new Uint8Array([117, 109, 98, 114, 97, 58, 112, 114, 111, 98, 101, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                           this._KIND_SHIELDED_0(),
                           new Uint8Array([100, 101, 115, 99, 114, 105, 112, 116, 105, 111, 110, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                           this._VAL_TYPE_STRING_0(),
                           300n,
                           new Uint8Array([77, 73, 80, 45, 48, 48, 49, 56, 32, 85, 67, 45, 49, 32, 112, 114, 111, 98, 101, 58, 32, 111, 110, 101, 32, 100, 101, 99, 108, 97, 114, 97, 116, 105, 111, 110, 44, 32, 116, 119, 111, 32, 112, 97, 114, 116, 115, 44, 32, 122, 101, 114, 111, 32, 112, 97, 100, 100, 101, 100, 46, 32, 77, 73, 80, 45, 48, 48, 49, 56, 32, 85, 67, 45, 49, 32, 112, 114, 111, 98, 101, 58, 32, 111, 110, 101, 32, 100, 101, 99, 108, 97, 114, 97, 116, 105, 111, 110, 44, 32, 116, 119, 111, 32, 112, 97, 114, 116, 115, 44, 32, 122, 101, 114, 111, 32, 112, 97, 100, 100, 101, 100, 46, 32, 77, 73, 80, 45, 48, 48, 49, 56, 32, 85, 67, 45, 49, 32, 112, 114, 111, 98, 101, 58, 32, 111, 110, 101, 32, 100, 101, 99, 108, 97, 114, 97, 116, 105, 111, 110, 44, 32, 116, 119, 111, 32, 112, 97, 114, 116, 115, 44, 32, 122, 101, 114, 111, 32, 112, 97, 100, 100, 101, 100, 46, 32, 77, 73]));
    await this._emitPart_0(context,
                           partialProofData,
                           new Uint8Array([80, 45, 48, 48, 49, 56, 32, 85, 67, 45, 49, 32, 112, 114, 111, 98, 101, 58, 32, 111, 110, 101, 32, 100, 101, 99, 108, 97, 114, 97, 116, 105, 111, 110, 44, 32, 116, 119, 111, 32, 112, 97, 114, 116, 115, 44, 32, 122, 101, 114, 111, 32, 112, 97, 100, 100, 101, 100, 46, 32, 77, 73, 80, 45, 48, 48, 49, 56, 32, 85, 67, 45, 49, 32, 112, 114, 111, 98, 101, 58, 32, 111, 110, 101, 32, 100, 101, 99, 108, 97, 114, 97, 116, 105, 111, 110, 44, 32, 116, 119, 111, 32, 112, 97, 114, 116, 115, 44, 32, 122, 101, 114, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    return [];
  }
  async _publishLegacyName_0(context,
                             partialProofData,
                             domainSep_0,
                             kind_0,
                             key_0,
                             valType_0,
                             valLen_0,
                             value_0)
  {
    const tmp_0 = 1n;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_3.toValue(1n),
                                                                  alignment: _descriptor_3.alignment() } }] } },
                                       { addi: { immediate: parseInt(__compactRuntime.valueToBigInt(
                                                              { value: _descriptor_0.toValue(tmp_0),
                                                                alignment: _descriptor_0.alignment() }
                                                                .value
                                                            )) } },
                                       { ins: { cached: true, n: 1 } }]);
    let t_0;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newArray()
                                                          .arrayPush(__compactRuntime.StateValue.newCell({ value: _descriptor_12.toValue(1n),
                                                                                                           alignment: _descriptor_12.alignment() })).arrayPush(__compactRuntime.StateValue.newCell({ value: _descriptor_3.toValue(10n),
                                                                                                                                                                                                     alignment: _descriptor_3.alignment() })).arrayPush(__compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue((t_0 = { name:
                                                                                                                                                                                                                                                                                                                                      new Uint8Array([84, 111, 107, 101, 110, 77, 101, 116, 97, 100, 97, 116, 97, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                                                                                                                                                                                                                                                                                                                    payload:
                                                                                                                                                                                                                                                                                                                                      Uint8Array.from([...Array.from(domainSep_0,
                                                                                                                                                                                                                                                                                                                                                                     BigInt),
                                                                                                                                                                                                                                                                                                                                                       kind_0,
                                                                                                                                                                                                                                                                                                                                                       ...Array.from(key_0,
                                                                                                                                                                                                                                                                                                                                                                     BigInt),
                                                                                                                                                                                                                                                                                                                                                       valType_0,
                                                                                                                                                                                                                                                                                                                                                       valLen_0,
                                                                                                                                                                                                                                                                                                                                                       ...Array.from(value_0,
                                                                                                                                                                                                                                                                                                                                                                     BigInt)],
                                                                                                                                                                                                                                                                                                                                                      Number) },
                                                                                                                                                                                                                                                                                                                            Uint8Array.from([...Array.from(t_0.name,
                                                                                                                                                                                                                                                                                                                                                           BigInt),
                                                                                                                                                                                                                                                                                                                                             ...Array.from(t_0.payload,
                                                                                                                                                                                                                                                                                                                                                           BigInt)],
                                                                                                                                                                                                                                                                                                                                            Number))),
                                                                                                                                                                                                                                                                                              alignment: _descriptor_1.alignment() }))
                                                          .encode() } },
                                       'log']);
    return [];
  }
  async _publishPreMipName_0(context,
                             partialProofData,
                             domainSep_0,
                             kind_0,
                             key_0,
                             valType_0,
                             valLen_0,
                             value_0)
  {
    const tmp_0 = 1n;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_3.toValue(1n),
                                                                  alignment: _descriptor_3.alignment() } }] } },
                                       { addi: { immediate: parseInt(__compactRuntime.valueToBigInt(
                                                              { value: _descriptor_0.toValue(tmp_0),
                                                                alignment: _descriptor_0.alignment() }
                                                                .value
                                                            )) } },
                                       { ins: { cached: true, n: 1 } }]);
    let t_0;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newArray()
                                                          .arrayPush(__compactRuntime.StateValue.newCell({ value: _descriptor_12.toValue(1n),
                                                                                                           alignment: _descriptor_12.alignment() })).arrayPush(__compactRuntime.StateValue.newCell({ value: _descriptor_3.toValue(10n),
                                                                                                                                                                                                     alignment: _descriptor_3.alignment() })).arrayPush(__compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue((t_0 = { name:
                                                                                                                                                                                                                                                                                                                                      new Uint8Array([109, 105, 112, 45, 120, 120, 120, 120, 58, 116, 111, 107, 101, 110, 45, 109, 101, 116, 97, 100, 97, 116, 97, 91, 118, 49, 93, 0, 0, 0, 0, 0]),
                                                                                                                                                                                                                                                                                                                                    payload:
                                                                                                                                                                                                                                                                                                                                      Uint8Array.from([...Array.from(domainSep_0,
                                                                                                                                                                                                                                                                                                                                                                     BigInt),
                                                                                                                                                                                                                                                                                                                                                       kind_0,
                                                                                                                                                                                                                                                                                                                                                       ...Array.from(key_0,
                                                                                                                                                                                                                                                                                                                                                                     BigInt),
                                                                                                                                                                                                                                                                                                                                                       valType_0,
                                                                                                                                                                                                                                                                                                                                                       valLen_0,
                                                                                                                                                                                                                                                                                                                                                       ...Array.from(value_0,
                                                                                                                                                                                                                                                                                                                                                                     BigInt)],
                                                                                                                                                                                                                                                                                                                                                      Number) },
                                                                                                                                                                                                                                                                                                                            Uint8Array.from([...Array.from(t_0.name,
                                                                                                                                                                                                                                                                                                                                                           BigInt),
                                                                                                                                                                                                                                                                                                                                             ...Array.from(t_0.payload,
                                                                                                                                                                                                                                                                                                                                                           BigInt)],
                                                                                                                                                                                                                                                                                                                                            Number))),
                                                                                                                                                                                                                                                                                              alignment: _descriptor_1.alignment() }))
                                                          .encode() } },
                                       'log']);
    return [];
  }
  async _calls_0(context, partialProofData) {
    return _descriptor_5.fromValue(__compactRuntime.queryLedgerState(context,
                                                                     partialProofData,
                                                                     [
                                                                      { dup: { n: 0 } },
                                                                      { idx: { cached: false,
                                                                               pushPath: false,
                                                                               path: [
                                                                                      { tag: 'value',
                                                                                        value: { value: _descriptor_3.toValue(1n),
                                                                                                 alignment: _descriptor_3.alignment() } }] } },
                                                                      { popeq: { cached: true,
                                                                                 result: undefined } }]).value);
  }
}
export function ledger(stateOrChargedState) {
  const state = stateOrChargedState instanceof __compactRuntime.StateValue ? stateOrChargedState : stateOrChargedState.state;
  const chargedState = stateOrChargedState instanceof __compactRuntime.StateValue ? new __compactRuntime.ChargedState(stateOrChargedState) : stateOrChargedState;
  const context = {
    callContext: { currentQueryContext: new __compactRuntime.QueryContext(chargedState, __compactRuntime.dummyContractAddress()), currentGasCost: __compactRuntime.emptyRunningCost() },
    costModel: __compactRuntime.CostModel.initialCostModel()
  };
  const partialProofData = {
    input: { value: [], alignment: [] },
    output: undefined,
    publicTranscript: [],
    privateTranscriptOutputs: []
  };
  return {
    get _calls() {
      return _descriptor_5.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_3.toValue(1n),
                                                                                                   alignment: _descriptor_3.alignment() } }] } },
                                                                        { popeq: { cached: true,
                                                                                   result: undefined } }]).value);
    }
  };
}
const _emptyContext = {
  callContext: { currentQueryContext: new __compactRuntime.QueryContext(new __compactRuntime.ContractState().data, __compactRuntime.dummyContractAddress()), currentGasCost: __compactRuntime.emptyRunningCost() }
};
const _dummyContract = new Contract({ });
export const pureCircuits = {};
export const contractReferenceLocations =
  { tag: 'publicLedgerArray', indices: { } };
export const expectedVk = {};

//# sourceMappingURL=index.js.map
