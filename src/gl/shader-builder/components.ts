import * as types from '../types';

export function normalToCamera(identifiers: types.ShaderIdentifierMap): string {
  const normToCam = identifiers.temporaries.normalToCamera.identifier
  const camPos = identifiers.uniforms.cameraPosition;
  const pos = identifiers.varyings.position;

  return `${normToCam} = normalize(${camPos} - ${pos});`;
}