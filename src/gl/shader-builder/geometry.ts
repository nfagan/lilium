import * as types from '../types';
import { addRequirements } from './common';
import { Material } from '../material';

function conditionallyRequireUv(schema: types.ShaderSchema, material: Material, identifiers: types.ShaderIdentifierMap): void {
  if (!material.hasTextureUniform()) {
    return;
  }

  if (schema.type === types.Shader.Vertex) {
    schema.requireAttribute(types.makeGLSLVariable(identifiers.attributes.uv, 'vec2'));
    schema.requireVarying(types.makeGLSLVariable(identifiers.varyings.uv, 'vec2'));
    schema.body.push(() => `${identifiers.varyings.uv} = ${identifiers.attributes.uv};`);

  } else if (schema.type === types.Shader.Fragment) {
    schema.requireVarying(types.makeGLSLVariable(identifiers.varyings.uv, 'vec2'));
  }
}

function baseVertexBody(identifiers: types.ShaderIdentifierMap): string {
  const temporaries = identifiers.temporaries;
  const uniforms = identifiers.uniforms;
  const attributes = identifiers.attributes;
  const varyings = identifiers.varyings;

  return `
  ${temporaries.worldPosition.identifier} = ${uniforms.model} * vec4(${attributes.position}, 1.0);
  ${varyings.position} = ${temporaries.worldPosition.identifier}.xyz;
  ${varyings.normal} = ${attributes.normal};
  gl_Position = ${uniforms.projection} * ${uniforms.view} * ${temporaries.worldPosition.identifier};`;
}

const BaseVertexRequirements = makeBaseGeometryVertexRequirements(types.DefaultShaderIdentifiers);
const BaseFragmentRequirements = makeBaseGeometryFragmentRequirements(types.DefaultShaderIdentifiers);

function makeBaseGeometryVertexRequirements(identifiers: types.ShaderIdentifierMap): types.ShaderRequirements {
  return {
    inputs: [
      types.makeGLSLVariable(identifiers.attributes.position, 'vec3'),
      types.makeGLSLVariable(identifiers.attributes.normal, 'vec3'),
    ],
    outputs: [
      types.makeGLSLVariable(identifiers.varyings.position, 'vec3'),
      types.makeGLSLVariable(identifiers.varyings.normal, 'vec3')
    ],
    temporaries: {
      worldPosition: identifiers.temporaries.worldPosition
    },
    uniforms: {
      model: types.makeGLSLVariable(identifiers.uniforms.model, 'mat4'),
      view: types.makeGLSLVariable(identifiers.uniforms.view, 'mat4'),
      projection: types.makeGLSLVariable(identifiers.uniforms.projection, 'mat4'),
    },
    sampler2DCoordinates: identifiers.varyings.uv,
    conditionallyRequireForMaterial: [
      (schema, material) => conditionallyRequireUv(schema, material, identifiers)
    ]
  }
}

function makeBaseGeometryFragmentRequirements(identifiers: types.ShaderIdentifierMap): types.ShaderRequirements {
  return {
    inputs: [
      types.makeGLSLVariable(identifiers.varyings.position, 'vec3'),
      types.makeGLSLVariable(identifiers.varyings.normal, 'vec3'),
    ],
    outputs: [],
    temporaries: {},
    uniforms: {},
    sampler2DCoordinates: identifiers.attributes.uv,
    conditionallyRequireForMaterial: [
      (schema, material) => conditionallyRequireUv(schema, material, identifiers)
    ]
  }
}

export function applyBaseGeometryVertexPipeline(toSchema: types.ShaderSchema, forMaterial: Material, identifiers?: types.ShaderIdentifierMap): void {
  let requirements: types.ShaderRequirements = null;

  if (identifiers === undefined) {
    requirements = BaseVertexRequirements;
    identifiers = types.DefaultShaderIdentifiers;
  } else {
    requirements = makeBaseGeometryVertexRequirements(identifiers);
  }

  addRequirements(toSchema, requirements, forMaterial);
  toSchema.body.push(() => baseVertexBody(identifiers));
}

export function applyBaseGeometryFragmentPipeline(toSchema: types.ShaderSchema, forMaterial: Material, identifiers?: types.ShaderIdentifierMap): void {
  const requirements = identifiers === undefined ? BaseFragmentRequirements : makeBaseGeometryFragmentRequirements(identifiers);
  addRequirements(toSchema, requirements, forMaterial);
}