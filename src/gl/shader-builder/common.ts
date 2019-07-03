import { types, Material } from '..';

export function applyMaterial(toPlug: types.ShaderComponentPlugs, forMaterial: Material): void {
  forMaterial.useActiveUniforms((uniform, kind) => {
    if (kind in toPlug) {
      toPlug[kind].source.type = uniform.type;
    }
  });
}

export function connect(forSchema: types.ShaderSchema, plug: types.ShaderComponentPlugs, toOutlet: types.ShaderComponentOutlets): void {
  const toJoin: Array<string> = [];

  for (let connectionName in toOutlet) {
    const outlet = toOutlet[connectionName];
    const connection = plug[connectionName];

    forSchema.requireTemporary(outlet);

    if (plug.hasOwnProperty(connectionName) && connection !== undefined) {
      const source = connection.source;
      const sourceId = source.identifier;
      const samplerSource = connection.samplerSource;
      const outletId = outlet.identifier;
      const outletType = outlet.type;

      if (source.type === 'sampler2D' && samplerSource === undefined) {
        console.warn('Sampler source requires an additional samplerSource input.');

      } else {
        const samplerSourceId = samplerSource === undefined ? '' : samplerSource.source.identifier;
        const assignResult = assign(outletId, outletType, sourceId, source.type, samplerSourceId);

        if (assignResult.success) {
          toJoin.push(assignResult.value);

          if (connection.sourceType !== types.ShaderDataSource.Temporary) {
            forSchema.requireBySourceType(source, connection.sourceType);
          }
        }
      }
    }
  }

  forSchema.body.push(() => toJoin.join('\n'));
}

export function requireStatics(toSchema: types.ShaderSchema, statics: types.ShaderComponentPlugs): void {
  const toJoin: Array<string> = [];

  for (let staticName in statics) {
    const staticValue = statics[staticName];
    const source = staticValue.source;

    switch (staticValue.sourceType) {
      case types.ShaderDataSource.Temporary:
        toJoin.push(declarationToString(source));
        break;
      case types.ShaderDataSource.Uniform:
        toSchema.requireUniform(source);
        break;
      default:
        console.error(`Invalid source type "${staticValue.sourceType}" for static: "${source.identifier}".`);
    }
  }

  toSchema.head.push(() => toJoin.join('\n'));
}

function addRequiredUniforms(toSchema: types.ShaderSchema, requiredUniforms: types.StringMap<types.GLSLVariable>, material: Material): void {
  for (let uniformName in requiredUniforms) {
    const uniform = material.hasUniform(uniformName) ? material.makeVariableForUniform(uniformName) : requiredUniforms[uniformName];
    toSchema.requireUniform(uniform);
  }
}

export function requireTemporaries(toSchema: types.ShaderSchema, requiredTemporaries: types.StringMap<types.GLSLVariable>): void {
  for (let temporaryName in requiredTemporaries) {
    toSchema.requireTemporary(requiredTemporaries[temporaryName]);
  }
}

function addUniformsToTemporaries(toSchema: types.ShaderSchema, requirements: types.ShaderRequirements, forMaterial: Material): void {
  const temporaries = requirements.temporaries;
  const sampler2DCoordinates = requirements.sampler2DCoordinates;
  const uniformDecls: Array<string> = [];

  forMaterial.useActiveUniforms((uniform, kind) => {
    if (kind in temporaries) {
      const temporary = temporaries[kind];
      
      if (!temporary) {
        console.error(`Invalid temporary for uniform kind: ${kind}`);
        return;
      }

      uniformDecls.push(uniformToTemporary(uniform, temporary.identifier, temporary.type, sampler2DCoordinates));
    }
  });

  toSchema.body.push(() => uniformDecls.join('\n'));
}

export function addRequirements(toSchema: types.ShaderSchema, requirements: types.ShaderRequirements, forMaterial: Material): void {
  for (let i = 0; i < requirements.inputs.length; i++) {
    toSchema.requireInput(requirements.inputs[i]);
  }
  for (let i = 0; i < requirements.outputs.length; i++) {
    toSchema.requireOutput(requirements.outputs[i]);
  }
  addRequiredUniforms(toSchema,  requirements.uniforms, forMaterial);
  requireTemporaries(toSchema, requirements.temporaries);
  addUniformsToTemporaries(toSchema, requirements, forMaterial);
}

function singleComponentInitializerExpressionForType(type: types.GLSLTypes, to: string): string {
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

function makeAssignResult(success: boolean, value: string): {success: boolean, value: string} {
  return {success, value};
}

function assign(destIdentifier: string, destType: types.GLSLTypes, srcIdentifier: string, 
  srcType: types.GLSLTypes, uvIdentifier: string): {success: boolean, value: string} {
  if (srcType === destType) {
    return makeAssignResult(true, assignmentComponentsToString(destIdentifier, srcIdentifier));
  }

  switch (srcType) {
    case 'float':
      return makeAssignResult(true, expandFloatToComponents(srcIdentifier, destIdentifier, destType));
    case 'sampler2D':
      return makeAssignResult(true, sampler2DToTemporary(srcIdentifier, destIdentifier, destType, uvIdentifier));
  }

  return makeAssignResult(false, `Unsupported source type: ${srcType} for destination type: ${destType}.`);
}

function uniformToTemporary(uniform: types.UniformValue, temporaryIdentifier: string, temporaryType: types.GLSLTypes, uvIdentifier: string): string {
  if (uniform.type === temporaryType) {
    return assignmentComponentsToString(temporaryIdentifier, uniform.identifier);
  };

  switch (uniform.type) {
    case 'float':
      return expandFloatToComponents(uniform.identifier, temporaryIdentifier, temporaryType);
    case 'sampler2D':
      return sampler2DToTemporary(uniform.identifier, temporaryIdentifier, temporaryType, uvIdentifier);
  }

  console.warn(`Unsupported source uniform type: ${uniform.type} for destination type: ${temporaryType}.`);
  return '';
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
    const initializer = defaultInitializerExpressionForType(temporary.type);
    // arrayRes.push(declarationToString(temporary, initializer));
    arrayRes.push(declarationToString(temporary));
  }

  for (let i = 0; i < schema.body.length; i++) {
    arrayRes.push(schema.body[i]());
  }
  arrayRes.push('}');

  return arrayRes.join('\n');
}