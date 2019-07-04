import { types, Program } from '.';
import { Texture2D, Texture2DSet } from './texture';

export class Material {
  readonly id: number;
  readonly descriptor: types.MaterialDescriptor;
  private activeUniforms: Array<string>;
  private schemaDidChange: boolean;
  private textureSet: Texture2DSet;

  private constructor(descriptor: types.MaterialDescriptor) {
    this.id = Material.ID++;
    this.descriptor = descriptor;
    this.activeUniforms = this.getActiveUniforms();
    this.schemaDidChange = true;
    this.textureSet = new Texture2DSet();
    this.initializeTextureSet();
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

  private addTexture(tex: Texture2D): void {
    this.textureSet.addTexture(tex);
  }

  private removeTexture(tex: Texture2D): void {
    this.textureSet.removeTexture(tex as Texture2D);
  }

  private initializeTextureSet(): void {
    const self = this;
    this.useActiveUniforms((uniform, kind) => {
      if (uniform.isTexture()) {
        self.addTexture(uniform.value as Texture2D);
      }
    });
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

  useTextures(cb: (tex: Texture2D) => void): void {
    this.textureSet.useTextures(cb);
  }

  hasTextureUniform(): boolean {
    return this.textureSet.size() > 0;
  }

  removeUnusedUniforms(inProg: Program): void {
    for (let i = 0; i < this.activeUniforms.length; i++) {
      const kind = this.activeUniforms[i];
      const uniform = this.descriptor.uniforms[kind];
      const identifier = uniform.identifier;

      if (!inProg.isUniform(identifier)) {
        this.activeUniforms.splice(i, 1);

        if (uniform.isTexture()) {
          this.removeTexture(uniform.value as Texture2D);
        }
      }
    }
  }

  addUniformProperty(name: string, value: types.UniformValue): void {
    const hadUniform = this.hasUniform(name);
    this.descriptor.uniforms[name] = value;

    if (!hadUniform) {
      this.activeUniforms.push(name);
    }

    if (value.isTexture()) {
      this.addTexture(value.value as Texture2D);
    }
  }

  setUniformProperty(name: string, value: types.UniformSettable, numChannels?: number): void {
    const uniforms = this.descriptor.uniforms;

    if (!this.hasUniform(name)) {
      console.warn(`No such material property: "${name}".`);
      return;
    }

    const uniform = uniforms[name];
    const prevType = uniform.type;
    const prevValue = uniform.value;

    uniform.set(value, numChannels);
    const isNewType = uniform.isNewType();

    if (uniform.isTexture()) {
      this.addTexture(uniform.value as Texture2D);

    } else if (isNewType && prevType === 'sampler2D') {
      this.removeTexture(prevValue as Texture2D);
    }

    this.schemaDidChange = isNewType;
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

  static NoLight(identifiers?: types.ShaderIdentifierMap): Material {
    identifiers = Material.requireIdentifiers(identifiers);

    return new Material({
      receivesShadow: true,
      castsShadow: true,
      lightingModel: 'none',
      uniforms: {
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
        ambientConstant: types.makeUniformFloatValue(identifiers.uniforms.ambientConstant, 0.2),
        roughness: types.makeUniformFloatValue(identifiers.uniforms.roughness, 0.5),
        metallic: types.makeUniformFloatValue(identifiers.uniforms.metallic, 0.5),
        modelColor: types.makeUniformFloat3Value(identifiers.uniforms.modelColor, [1, 1, 1])
      }
    })
  }
}