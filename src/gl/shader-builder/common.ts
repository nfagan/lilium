import { types, Material } from '..';

function addRequiredUniforms(toSchema: types.ShaderSchema, requiredUniforms: types.StringMap<types.GLSLVariable>, material: Material): void {
  for (let uniformName in requiredUniforms) {
    const uniform = material.hasUniform(uniformName) ? material.makeVariableForUniform(uniformName) : requiredUniforms[uniformName];
    toSchema.requireUniform(uniform);
  }
}

function addRequiredTemporaries(toSchema: types.ShaderSchema, requiredTemporaries: types.StringMap<types.GLSLVariable>): void {
  const temporaryDecls: Array<string> = [];

  for (let temporary in requiredTemporaries) {
    const required = requiredTemporaries[temporary];
    const initializer = defaultInitializerExpressionForType(required.type);
    temporaryDecls.push(declarationToString(required, initializer));
  }

  toSchema.body.push(() => temporaryDecls.join('\n'));
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
  addRequiredTemporaries(toSchema, requirements.temporaries);
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
  for (let i = 0; i < schema.body.length; i++) {
    arrayRes.push(schema.body[i]());
  }
  arrayRes.push('}');

  return arrayRes.join('\n');
}