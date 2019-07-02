import { types, Program } from '.';

export class Material {
  readonly id: number;
  readonly activeUniforms: Array<string>;
  readonly descriptor: types.MaterialDescriptor;
  private schemaDidChange: boolean;

  private constructor(descriptor: types.MaterialDescriptor) {
    this.id = Material.ID++;
    this.descriptor = descriptor;
    this.activeUniforms = this.getActiveUniforms();
    this.schemaDidChange = true;
  }

  private getActiveUniforms(): Array<string> {
    const uniforms = this.descriptor.uniforms;
    const props = Object.keys(uniforms);

    const activeUniforms: Array<string> = [];

    for (let i = 0; i < props.length; i++) {
      if (uniforms.hasOwnProperty(props[i]) && uniforms[props[i]] !== undefined) {
        activeUniforms.push(props[i]);
      }
    }

    return activeUniforms;
  }

  hasUniform(name: string): boolean {
    return this.descriptor.uniforms[name] !== undefined;
  }

  makeVariableForUniform(name: string): types.GLSLVariable {
    if (this.hasUniform(name)) {
      const uniform = this.descriptor.uniforms[name];
      return types.makeGLSLVariable(uniform.identifier, uniform.type);
    } else {
      return null;
    }
  }

  useActiveUniforms(cb: (uniform: types.UniformValue, kind: string) => void): void {
    const uniforms = this.descriptor.uniforms;

    for (let i = 0; i < this.activeUniforms.length; i++) {
      const kind = this.activeUniforms[i];
      cb(uniforms[kind], kind);
    }
  }

  setUniforms(inProgram: Program): void {
    const uniforms = this.descriptor.uniforms;

    for (let i = 0; i < this.activeUniforms.length; i++) {
      const activeUniform = uniforms[this.activeUniforms[i]];
      inProgram.setUniform(activeUniform);
    }
  }

  hasTextureUniform(): boolean {
    for (let i = 0; i < this.activeUniforms.length; i++) {
      if (this.descriptor.uniforms[this.activeUniforms[i]].type === 'sampler2D') {
        return true;
      }
    }

    return false;
  }

  setUniformProperty(name: string, value: types.UniformSettable, numChannels?: number): void {
    const uniforms = this.descriptor.uniforms;

    if (!this.hasUniform(name)) {
      console.warn(`No such material property: "${name}".`);
      return;
    }

    const uniform = uniforms[name];
    uniform.set(value, numChannels);

    this.schemaDidChange = uniform.isNewType();
  }

  isNewSchema(): boolean {
    return this.schemaDidChange;
  }

  clearIsNewSchema(): void {
    this.schemaDidChange = false;

    for (let i = 0; i < this.activeUniforms.length; i++) {
      this.descriptor.uniforms[this.activeUniforms[i]].clearIsNewType();
    }
  }

  private static requireIdentifiers(identifiers: types.ShaderIdentifierMap): types.ShaderIdentifierMap {
    if (identifiers === undefined) {
      return types.DefaultShaderIdentifiers;
    } else {
      return identifiers;
    }
  } 

  private static ID: number = 0;

  static Empty(identifiers?: types.ShaderIdentifierMap): Material {
    identifiers = Material.requireIdentifiers(identifiers);

    return new Material({
      receivesShadow: false,
      castsShadow: false,
      lightingModel: 'none',
      uniforms: {}
    });
  }

  static Phong(identifiers?: types.ShaderIdentifierMap): Material {
    identifiers = Material.requireIdentifiers(identifiers);

    return new Material({
      receivesShadow: true,
      castsShadow: true,
      lightingModel: 'phong',
      uniforms: {
        ambientConstant: types.makeUniformFloatValue(identifiers.uniforms.ambientConstant, 0.25),
        diffuseConstant: types.makeUniformFloatValue(identifiers.uniforms.diffuseConstant, 0.25),
        specularConstant: types.makeUniformFloatValue(identifiers.uniforms.specularConstant, 0.25),
        specularPower: types.makeUniformFloatValue(identifiers.uniforms.specularPower, 16.0),
        modelColor: types.makeUniformFloat3Value(identifiers.uniforms.modelColor, [1, 1, 1])
      }
    });
  }

  static Physical(identifiers?: types.ShaderIdentifierMap): Material {
    identifiers = Material.requireIdentifiers(identifiers);

    return new Material({
      receivesShadow: true,
      castsShadow: true,
      lightingModel: 'physical',
      uniforms: {
        roughness: types.makeUniformFloatValue(identifiers.uniforms.roughness, 0.5),
        metallic: types.makeUniformFloatValue(identifiers.uniforms.metallic, 0.5),
        modelColor: types.makeUniformFloat3Value(identifiers.uniforms.modelColor, [1, 1, 1])
      }
    })
  }
}