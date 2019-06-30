import { types, Material } from '..';

type VariableDeclaration = {
  type: string,
  identifier: string,
  initializer?: string
};

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

export function extractUniformsToTemporaries(forMaterial: Material, temporaries: types.ShaderTemporaryMap, uvIdentifier: string): string {
  const toJoin: Array<string> = [];

  forMaterial.useActiveUniforms((uniform, uniformKind) => {
    if (uniformKind in temporaries) {
      const temporary = (<any>temporaries)[uniformKind] as types.GLSLVariable;
      toJoin.push(uniformToTemporary(uniform, temporary.identifier, temporary.type, uvIdentifier));
    }
  });

  return toJoin.join('\n');
}

export function declareRequiredTemporaries(requiredIdentifiers: Array<string>, temporaries: types.ShaderTemporaryMap): string {
  const toJoin: Array<string> = [];

  for (let i = 0; i < requiredIdentifiers.length; i++) {
    const id = requiredIdentifiers[i];

    if (id in temporaries) {
      const temporary = (<any>temporaries)[id] as types.GLSLVariable;
      const initializer = defaultInitializerExpressionForType(temporary.type);
      toJoin.push(declarationComponentsToString(temporary.type, temporary.identifier, initializer))
    } else {
      console.error(`Required temporary "${id}" does not exist in the provided temporary map.`);
    }
  }

  return toJoin.join('\n');
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

function expandFloat(srcIdentifier: string, destIdentifier: string, destType: types.GLSLTypes): string {
  const initializer = singleComponentInitializerExpressionForType(destType, srcIdentifier);
  return assignmentComponentsToString(destIdentifier, initializer);
}

function sampler2DToTemporary(srcIdentifier: string, destIdentifier: string, destType: types.GLSLTypes, uvIdentifier: string): string {
  const numDestComponents = types.numComponentsInGLSLType(destType);
  const destSamplerSuffix = rgbComponentString(numDestComponents);

  const initializer = `texture2D(${srcIdentifier}, ${uvIdentifier}).${destSamplerSuffix}`;
  return assignmentComponentsToString(destIdentifier, initializer);
}

function uniformToTemporary(uniform: types.UniformValue, temporaryIdentifier: string, temporaryType: types.GLSLTypes, uvIdentifier: string): string {
  if (uniform.type === temporaryType) {
    return assignmentComponentsToString(temporaryIdentifier, uniform.identifier);
  };

  switch (uniform.type) {
    case 'float':
      return expandFloat(uniform.identifier, temporaryIdentifier, temporaryType);
    case 'sampler2D':
      return sampler2DToTemporary(uniform.identifier, temporaryIdentifier, temporaryType, uvIdentifier);
  }

  console.warn(`Unsupported source uniform type: ${uniform.type} for destination type: ${temporaryType}.`);
  return '';
}

function prefixedDeclarationToString(prefix: string, decl: VariableDeclaration): string {
  return `${prefix} ${declarationToString(decl)}`;
}

function assignmentComponentsToString(destIdentifier: string, srcIdentifier: string): string {
  return `${destIdentifier} = ${srcIdentifier};`;
}

function declarationComponentsToString(type: string, identifier: string, initializer: string): string {
  if (initializer !== undefined) {
    return `${type} ${identifier} = ${initializer};`;
  } else {
    return `${type} ${identifier};`;
  }
}

function declarationToString(decl: VariableDeclaration): string {
  return declarationComponentsToString(decl.type, decl.identifier, decl.initializer);
}

function precisionDeclaration(precision: types.GLSLPrecision): string {
  return `precision ${precision} float;`;
}

function addPrefixed(toArray: Array<string>, prefix: string, values: Array<VariableDeclaration>): void {
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

  for (let i = 0; i < schema.body.length; i++) {
    arrayRes.push(schema.body[i]());
  }
  
  arrayRes.push('}');

  return arrayRes.join('\n');
}

export function normalToCamera(identifiers: types.ShaderIdentifierMap): string {
  const normToCam = identifiers.temporaries.normalToCamera.identifier
  const camPos = identifiers.uniforms.cameraPosition;
  const pos = identifiers.varyings.position;

  return `vec3 ${normToCam} = normalize(${camPos} - ${pos});`;
}

export function assignFragColorToModelColor(identifiers: types.ShaderIdentifierMap): string {
  return `gl_FragColor = vec4(${identifiers.temporaries.modelColor.identifier}, 1.0);`;
}

export function addUniformsForMaterial(toSchema: types.ShaderSchema, forMaterial: Material): void {
  forMaterial.useActiveUniforms((uniform, kind) => {
    toSchema.requireUniform(uniform.identifier, uniform.type);
  });
}

export function addModelViewProjectionUniforms(toSchema: types.ShaderSchema, identifiers?: types.ShaderIdentifierMap): void {
  if (identifiers === undefined) {
    identifiers = types.DefaultShaderIdentifiers;
  }

  toSchema.requireUniform(identifiers.uniforms.model, 'mat4');
  toSchema.requireUniform(identifiers.uniforms.view, 'mat4');
  toSchema.requireUniform(identifiers.uniforms.projection, 'mat4');
}

export function addPositionNormalUvAttributes(toSchema: types.ShaderSchema, forMaterial: Material, identifiers: types.ShaderIdentifierMap) {
  toSchema.requireAttribute(identifiers.attributes.position, 'vec3');
  toSchema.requireAttribute(identifiers.attributes.normal, 'vec3');

  if (forMaterial.hasTextureUniform()) {
    toSchema.requireAttribute(identifiers.attributes.uv, 'vec2');
  }
}

export function addPositionNormalUvVaryings(toSchema: types.ShaderSchema, forMaterial: Material, identifiers: types.ShaderIdentifierMap) {
  toSchema.requireVarying(identifiers.varyings.position, 'vec3');
  toSchema.requireVarying(identifiers.varyings.normal, 'vec3');

  if (forMaterial.hasTextureUniform()) {
    toSchema.requireVarying(identifiers.varyings.uv, 'vec2');
  } 
}

export function simpleVertexBody(forMaterial: Material, identifiers: types.ShaderIdentifierMap): string {
  const temporaries = identifiers.temporaries;
  const uniforms = identifiers.uniforms;
  const attributes = identifiers.attributes;
  const varyings = identifiers.varyings;

  const uvString = forMaterial.hasTextureUniform() ? `${varyings.uv} = ${attributes.uv};` : '';

  return `
  vec4 ${temporaries.worldPosition.identifier} = ${uniforms.model} * vec4(${attributes.position}, 1.0);
  ${varyings.position} = ${temporaries.worldPosition.identifier}.xyz;
  ${varyings.normal} = ${attributes.normal};
  ${uvString}
  gl_Position = ${uniforms.projection} * ${uniforms.view} * ${temporaries.worldPosition.identifier};`;
}

export function applySimpleVertexPipeline(toSchema: types.ShaderSchema, forMaterial: Material, identifiers: types.ShaderIdentifierMap): void {
  addModelViewProjectionUniforms(toSchema, identifiers);
  addPositionNormalUvAttributes(toSchema, forMaterial, identifiers);
  addPositionNormalUvVaryings(toSchema, forMaterial, identifiers);

  toSchema.body.push(() => simpleVertexBody(forMaterial, identifiers));
}