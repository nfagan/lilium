function addRequiredUniforms(toSchema: types.ShaderSchema, requiredUniforms: types.StringMap<types.GLSLVariable>, material: Material): void {
  for (let uniformName in requiredUniforms) {
    const uniform = material.hasUniform(uniformName) ? material.makeVariableForUniform(uniformName) : requiredUniforms[uniformName];
    toSchema.requireUniform(uniform);
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

  for (let i = 0; i < requirements.conditionallyRequireForMaterial.length; i++) {
    requirements.conditionallyRequireForMaterial[i](toSchema, forMaterial);
  }

  requireTemporaries(toSchema, requirements.temporaries);
  addUniformsToTemporaries(toSchema, requirements, forMaterial);
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