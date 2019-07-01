import { Program } from './program';
import * as types from './types';

export class Light {
  private uniforms: types.StringMap<types.UniformValue>;
  private activeUniforms: Array<string>;
  readonly kind: types.Lights;

  index: number;

  private constructor(kind: types.Lights, uniforms: types.StringMap<types.UniformValue>) {
    this.uniforms = uniforms;
    this.activeUniforms = this.getActiveUniforms();
    this.index = 0;
    this.kind = kind;
  }

  private getActiveUniforms(): Array<string> {
    const keys = Object.keys(this.uniforms);
    const out: Array<string> = [];

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (this.uniforms.hasOwnProperty(key) && this.uniforms[key] !== undefined) {
        out.push(key);
      }
    }

    return out;
  }

  setUniforms(inProg: Program): void {
    for (let i = 0; i < this.activeUniforms.length; i++) {
      const activeUniform = this.uniforms[this.activeUniforms[i]];
      inProg.setArrayUniform(activeUniform, this.index);
    }
  }

  setUniformProperty(name: string, to: types.UniformSettable): void {
    const uniform = this.uniforms[name];

    if (uniform === undefined) {
      console.warn(`No such light property: "${name}".`);
      return;
    }

    uniform.set(to);
  }

  private static requireIdentifiers(identifiers: types.ShaderIdentifierMap): types.ShaderIdentifierMap {
    if (identifiers === undefined) {
      return types.DefaultShaderIdentifiers;
    } else {
      return identifiers;
    }
  }

  static Point(identifiers?: types.ShaderIdentifierMap): Light {
    identifiers = Light.requireIdentifiers(identifiers);

    return new Light(types.Lights.Point, {
      position: types.makeUniformFloat3Value(identifiers.uniforms.pointLightPositions, [0, 0, 0]).disallowNewType(),
      color: types.makeUniformFloat3Value(identifiers.uniforms.pointLightColors, [1, 1, 1]).disallowNewType()
    });
  }

  static Directional(identifiers?: types.ShaderIdentifierMap): Light {
    identifiers = Light.requireIdentifiers(identifiers);

    return new Light(types.Lights.Directional, {
      position: types.makeUniformFloat3Value(identifiers.uniforms.directionalLightPositions, [0, 0, 0]).disallowNewType(),
      color: types.makeUniformFloat3Value(identifiers.uniforms.directionalLightColors, [1, 1, 1]).disallowNewType()
    });
  }
}