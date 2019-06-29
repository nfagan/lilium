import { types } from '.';

type VariableDeclaration = {
  type: string,
  identifier: string,
  initializer?: string
};

function prefixedDeclarationToString(prefix: string, decl: VariableDeclaration): string {
  return `${prefix} ${declarationToString(decl)}`;
}

function declarationToString(decl: VariableDeclaration): string {
  if (decl.initializer) {
    return `${decl.type} ${decl.identifier} = ${decl.initializer};`;
  } else {
    return `${decl.type} ${decl.identifier};`;
  }
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
