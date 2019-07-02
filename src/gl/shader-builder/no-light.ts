import { types, Material } from '..';
import { addRequirements } from './common';

function assignFragColorToModelColor(identifiers: types.ShaderIdentifierMap): string {
  return `gl_FragColor = vec4(${identifiers.temporaries.modelColor.identifier}, 1.0);`;
}

function makeNoLightVertexRequirements(identifiers: types.ShaderIdentifierMap): types.ShaderRequirements {
  return {
    inputs: [],
    outputs: [],
    temporaries: {},
    uniforms: {},
    sampler2DCoordinates: identifiers.attributes.uv,
    conditionallyRequireForMaterial: []
  }
}

function makeNoLightFragmentRequirements(identifiers: types.ShaderIdentifierMap): types.ShaderRequirements {
  const varyings = identifiers.varyings;
  const uniforms = identifiers.uniforms;
  const temporaries = identifiers.temporaries;

  return {
    inputs: [],
    outputs: [],
    temporaries: {
      modelColor: temporaries.modelColor
    },
    uniforms: {
      modelColor: types.makeGLSLVariable(uniforms.modelColor, 'vec3'),
    },
    sampler2DCoordinates: varyings.uv,
    conditionallyRequireForMaterial: []
  }
}

const NoLightFragmentRequirements = makeNoLightFragmentRequirements(types.DefaultShaderIdentifiers);
const NoLightVertexRequirements = makeNoLightVertexRequirements(types.DefaultShaderIdentifiers);

export function applyNoLightVertexPipeline(toSchema: types.ShaderSchema, forMaterial: Material, identifiers?: types.ShaderIdentifierMap): void {
  let requirements: types.ShaderRequirements;

  if (identifiers === undefined) {
    identifiers = types.DefaultShaderIdentifiers;
    requirements = NoLightVertexRequirements;
  } else {
    requirements = makeNoLightVertexRequirements(identifiers);
  }

  addRequirements(toSchema, requirements, forMaterial);
}

export function applyNoLightFragmentPipeline(toSchema: types.ShaderSchema, forMaterial: Material, identifiers?: types.ShaderIdentifierMap): void {
  let requirements: types.ShaderRequirements;

  if (identifiers === undefined) {
    identifiers = types.DefaultShaderIdentifiers;
    requirements = NoLightFragmentRequirements;
  } else {
    requirements = makeNoLightFragmentRequirements(identifiers);
  }

  addRequirements(toSchema, requirements, forMaterial);
  toSchema.body.push(() => assignFragColorToModelColor(identifiers));
}