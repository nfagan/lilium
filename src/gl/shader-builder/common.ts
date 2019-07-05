import { types, Material } from '..';

namespace errors {
  export function inconsistentTypesForSameIdentifier(ident: string, srcType: types.GLSLTypes, destType: types.GLSLTypes): string {
    return `Usage of identifier "${ident}" is inconsistent; source type is "${srcType}", while destination type is "${destType}".`;
  }

  export function incompatibleTypesForAssignment(destIdent: string, destType: types.GLSLTypes, srcIdent: string, srcType: types.GLSLTypes): string {
    return `Unsupported source type: ${srcType} for destination type: ${destType}; for source: "${srcIdent}" and destination: "${destIdent}".`
  }
}

export function requireIdentifiers(identifiers?: types.ShaderIdentifierMap): types.ShaderIdentifierMap {
  if (identifiers === undefined) {
    return types.DefaultShaderIdentifiers;
  } else {
    return identifiers;
  }
}

export function applyMaterial(toPlug: types.ShaderComponentPlugs, forMaterial: Material): void {
  forMaterial.useActiveUniforms((uniform, kind) => {
    if (kind in toPlug) {
      toPlug[kind].getSource().type = uniform.type;
    }
  });
}

export function assertConnectSuccess(result: ConnectResult): void {
  if (!result.success) {
    throw new Error(result.message);
  }
}

type ConnectResult = {
  success: boolean,
  message?: string
}

function makeSuccessConnectResult(): ConnectResult {
  return {success: true};
}

function makeErrorConnectResult(message: string): ConnectResult {
  return {success: false, message};
}

function connect(forSchema: types.ShaderSchema, plug: types.ShaderComponentPlugs, toOutlet: types.ShaderComponentOutlets, isInput: boolean): ConnectResult {
  const toJoin: Array<string> = [];

  for (let connectionName in toOutlet) {
    const outlet = toOutlet[connectionName];
    const connection = plug[connectionName];

    forSchema.requireTemporaryIfNotStatic(outlet);

    if (plug.hasOwnProperty(connectionName) && connection !== undefined) {
      const source = connection.getSource();
      const sourceId = source.identifier;
      const samplerSource = connection.getSamplerSource();
      const outletId = outlet.identifier;
      const outletType = outlet.type;
      const srcIsSampler = source.type === 'sampler2D';
      
      if (srcIsSampler && !isInput) {
        return makeErrorConnectResult('Sampler source is not a valid assignment target.')

      } else if (srcIsSampler && samplerSource === undefined) {
        return makeErrorConnectResult('Sampler source requires an additional samplerSource input.')

      } else if (outletId === sourceId) {
        //  Ignore self- assignment
        if (outletType !== source.type) {
          //  Assignment between unlike types, but same identifier.
          if (isInput) {
            return makeErrorConnectResult(errors.inconsistentTypesForSameIdentifier(outletId, source.type, outletType));
          } else {
            return makeErrorConnectResult(errors.inconsistentTypesForSameIdentifier(sourceId, outletType, source.type));
          }
        }
      } else {
        const samplerSourceId = samplerSource === undefined ? '' : samplerSource.getSource().identifier;
        let assignResult: AssignmentResult;

        if (isInput) {
          assignResult = assign(outletId, outletType, sourceId, source.type, samplerSourceId);
        } else {
          assignResult = assign(sourceId, source.type, outletId, outletType, '');
        }

        if (assignResult.success) {
          toJoin.push(assignResult.value);

          if (!isInput || connection.getSourceType() !== types.ShaderDataSource.Temporary) {
            forSchema.requireBySourceType(source, connection.getSourceType());
          }
        } else {
          return makeErrorConnectResult(assignResult.value);
        }
      }
    }
  }

  forSchema.body.push(() => toJoin.join('\n'));

  return makeSuccessConnectResult();
}

export function connectOutputs(forSchema: types.ShaderSchema, plug: types.ShaderComponentPlugs, toOutlet: types.ShaderComponentOutlets): ConnectResult {
  return connect(forSchema, plug, toOutlet, false);
}

export function connectInputs(forSchema: types.ShaderSchema, plug: types.ShaderComponentPlugs, toOutlet: types.ShaderComponentOutlets): ConnectResult {
  return connect(forSchema, plug, toOutlet, true);
}

export function requireStatics(toSchema: types.ShaderSchema, statics: types.ShaderComponentPlugs): void {
  const toJoin: Array<string> = [];

  for (let staticName in statics) {
    const staticValue = statics[staticName];
    const source = staticValue.getSource();
    const sourceType = staticValue.getSourceType();

    switch (sourceType) {
      case types.ShaderDataSource.Temporary:
        toJoin.push(declarationToString(source));
        break;
      case types.ShaderDataSource.Uniform:
        toSchema.requireUniform(source);
        break;
      default:
        console.error(`Invalid source type "${sourceType}" for static: "${source.identifier}".`);
    }
  }

  toSchema.head.push(() => toJoin.join('\n'));
}

export function requireTemporaries(toSchema: types.ShaderSchema, requiredTemporaries: types.StringMap<types.GLSLVariable>): void {
  for (let temporaryName in requiredTemporaries) {
    toSchema.requireTemporary(requiredTemporaries[temporaryName]);
  }
}

export function singleComponentInitializerExpressionForType(type: types.GLSLTypes, to: string): string {
  switch (type) {
    case 'float':
      return to;
    case 'vec2':
      return `vec2(${to})`;
    case 'vec3':
      return `vec3(${to})`;
    case 'vec4':
      return `vec4(${to})`;
    case 'mat2':
      return `mat2(${to})`;
    case 'mat3':
      return `mat3(${to})`;
    case 'mat4':
      return `mat4(${to})`;
    case 'sampler2D':
      console.error('No float initializer allowed for sampler2D.');
      return '';
  }
}

function defaultInitializerExpressionForType(type: types.GLSLTypes): string {
  return singleComponentInitializerExpressionForType(type, '0.0');
}

function rgbComponentString(numComponents: number): string {
  switch (numComponents) {
    case 1:
      return 'r'
    case 2:
      return 'rg'
    case 3:
      return 'rgb'
    case 4:
      return 'rgba';
    default:
      return 'r';
  }
}

function xyzComponentString(numComponents: number): string {
  switch (numComponents) {
    case 1:
      return 'x';
    case 2:
      return 'xy';
    case 3:
      return 'xyz';
    case 4:
      return 'xyzw';
    default:
      return 'x';
  }
}

function expandFloatToComponents(srcIdentifier: string, destIdentifier: string, destType: types.GLSLTypes): string {
  const initializer = singleComponentInitializerExpressionForType(destType, srcIdentifier);
  return assignmentComponentsToString(destIdentifier, initializer);
}

function sampler2DToTemporary(srcIdentifier: string, destIdentifier: string, destType: types.GLSLTypes, uvIdentifier: string): string {
  const numDestComponents = types.numComponentsInGLSLType(destType);
  const destSamplerSuffix = rgbComponentString(numDestComponents);

  const initializer = `texture2D(${srcIdentifier}, ${uvIdentifier}).${destSamplerSuffix}`;
  return assignmentComponentsToString(destIdentifier, initializer);
}

export function demoteVector(srcType: types.GLSLTypes, srcIdentifier: string, destType: types.GLSLTypes): string {
  const numDestComponents = types.numComponentsInGLSLType(destType);
  const numToDemote = numDestComponents;
  const componentStr = xyzComponentString(numToDemote);
  return `${srcIdentifier}.${componentStr}`;
}

export function promoteVector(srcType: types.GLSLTypes, srcIdentifier: string, destType: types.GLSLTypes, fillComponent: number = 1, numDecimalPlaces: number = 1): string {
  const numSrcComponents = types.numComponentsInGLSLType(srcType);
  const numDestComponents = types.numComponentsInGLSLType(destType);
  const numToFill = numDestComponents - numSrcComponents;
  const fillWith = `${fillComponent.toFixed(numDecimalPlaces)}`;
  const toJoin: Array<string> = [];

  for (let i = 0; i < numToFill; i++) {
    toJoin.push(',' + fillWith);
  }

  const joinStr = toJoin.join('');

  return `${destType}(${srcIdentifier}${joinStr})`;
}

export type AssignmentResult = {
  success: boolean,
  value: string
};

function makeSuccessAssignResult(value: string): AssignmentResult {
  return {success: true, value};
}

function makeErrorAssignResult(msg: string): AssignmentResult {
  return {success: false, value: msg};
}

export function assignToVariableOrLogError(schema: types.ShaderSchema, dest: types.GLSLVariable, src: types.ShaderComponentPlug | types.GLSLVariable): void {
  let assignResult: AssignmentResult;

  if (types.typeTest.isShaderComponentPlug(src)) {
    assignResult = assignPlugToVariable(dest.identifier, dest.type, src);
  } else {
    assignResult = assign(dest.identifier, dest.type, src.identifier, src.type, '');
  }

  if (!assignResult.success) {
    console.error(assignResult.value);
  } else {
    schema.body.push(() => assignResult.value);
  }
}

export function assignPlugToVariable(destIdent: string, destType: types.GLSLTypes, src: types.ShaderComponentPlug): AssignmentResult {
  const source = src.getSource();
  const samplerSource = src.getSamplerSource();

  if (samplerSource === undefined) {
    return assign(destIdent, destType, source.identifier, source.type, undefined);
  } else {
    const samplerIdent = samplerSource.getSource().identifier;
    return assign(destIdent, destType, source.identifier, source.type, samplerIdent);
  }
}

export function assign(destIdentifier: string, destType: types.GLSLTypes, srcIdentifier: string, srcType: types.GLSLTypes, uvIdentifier: string): AssignmentResult {
  if (destType === 'sampler2D') {
    return makeErrorAssignResult(`sampler2D "${destIdentifier}" is not a valid assignment target.`);
  }

  if (srcType === destType) {
    return makeSuccessAssignResult(assignmentComponentsToString(destIdentifier, srcIdentifier));
  }

  switch (srcType) {
    case 'float':
      return makeSuccessAssignResult(expandFloatToComponents(srcIdentifier, destIdentifier, destType));
    case 'sampler2D': {
      if (uvIdentifier.length > 0) {
        return makeSuccessAssignResult(sampler2DToTemporary(srcIdentifier, destIdentifier, destType, uvIdentifier));
      } else {
        return makeErrorAssignResult('Identifier of sample coordinates for sampler2D input was empty.');
      }
    }
    case 'vec2':
    case 'vec3':
    case 'vec4':
      if (types.numComponentsInGLSLType(srcType) < types.numComponentsInGLSLType(destType)) {
        return makeSuccessAssignResult(assignmentComponentsToString(destIdentifier, promoteVector(srcType, srcIdentifier, destType, 1)));
      } else {
        return makeSuccessAssignResult(assignmentComponentsToString(destIdentifier, demoteVector(srcType, srcIdentifier, destType)));
      }
  }

  return makeErrorAssignResult(errors.incompatibleTypesForAssignment(destIdentifier, destType, srcIdentifier, srcType));
}

function prefixedDeclarationToString(prefix: string, decl: types.GLSLVariable): string {
  return `${prefix} ${declarationToString(decl)}`;
}

function assignmentComponentsToString(destIdentifier: string, srcIdentifier: string): string {
  return `${destIdentifier} = ${srcIdentifier};`;
}

function completeTypeIdentifier(forVariable: types.GLSLVariable): string {
  if (forVariable.isArray === true) {
    const sz = forVariable.arraySize || 1;
    return `${forVariable.type} ${forVariable.identifier}[${sz}]`;
  } else {
    return `${forVariable.type} ${forVariable.identifier}`;
  }
}

function declarationToString(decl: types.GLSLVariable, initializer?: string): string {
  if (initializer !== undefined) {
    return `${completeTypeIdentifier(decl)} = ${initializer};`;
  } else {
    return `${completeTypeIdentifier(decl)};`;
  }
}

function precisionDeclaration(precision: types.GLSLPrecision): string {
  return `precision ${precision} float;`;
}

function addPrefixed(toArray: Array<string>, prefix: string, values: Array<types.GLSLVariable>): void {
  for (let i = 0; i < values.length; i++) {
    toArray.push(prefixedDeclarationToString(prefix, values[i]));
  }
}

export function shaderSchemaToString(schema: types.ShaderSchema): string {
  const arrayRes: Array<string> = [];

  arrayRes.push(schema.version);
  arrayRes.push(precisionDeclaration(schema.precision));

  addPrefixed(arrayRes, 'attribute', schema.attributes);
  addPrefixed(arrayRes, 'varying', schema.varyings);
  addPrefixed(arrayRes, 'uniform', schema.uniforms);

  for (let i = 0; i < schema.head.length; i++) {
    arrayRes.push(schema.head[i]());
  }

  arrayRes.push('void main() {');

  for (let i = 0; i < schema.temporaries.length; i++) {
    const temporary = schema.temporaries[i];
    arrayRes.push(declarationToString(temporary));
    // const initializer = defaultInitializerExpressionForType(temporary.type);
    // arrayRes.push(declarationToString(temporary, initializer));
  }

  for (let i = 0; i < schema.body.length; i++) {
    arrayRes.push(schema.body[i]());
  }
  
  arrayRes.push('}');

  return arrayRes.join('\n');
}