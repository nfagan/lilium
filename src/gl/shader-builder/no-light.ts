import { types, Material } from '..';
import { addUniformsForMaterial, declareRequiredTemporaries, applySimpleVertexPipeline,
  extractUniformsToTemporaries, addPositionNormalUvVaryings, assignFragColorToModelColor } from './common';

export function applyNoLightVertexPipeline(toSchema: types.ShaderSchema, forMaterial: Material, identifiers?: types.ShaderIdentifierMap): void {
  if (identifiers === undefined) {
    identifiers = types.DefaultShaderIdentifiers;
  }

  applySimpleVertexPipeline(toSchema, forMaterial, identifiers);
}

export function applyNoLightFragmentPipeline(toSchema: types.ShaderSchema, forMaterial: Material, identifiers?: types.ShaderIdentifierMap): void {
  if (identifiers === undefined) {
    identifiers = types.DefaultShaderIdentifiers;
  }

  addUniformsForMaterial(toSchema, forMaterial);
  addPositionNormalUvVaryings(toSchema, forMaterial, identifiers);

  toSchema.body.push(() => declareRequiredTemporaries(types.RequiredNoLightingTemporaries, identifiers.temporaries));
  toSchema.body.push(() => extractUniformsToTemporaries(forMaterial, identifiers.temporaries, identifiers.varyings.uv));
  toSchema.body.push(() => assignFragColorToModelColor(identifiers));
}