import * as types from '../types';
import * as phong from './phong';
import * as noLight from './no-light';
import * as geometry from './geometry';
import * as physical from './physical';
import * as fragColor from './frag-color';
import { Program } from '../program';
import { Material } from '../material';
import { shaderSchemaToString } from './common';
import { Stopwatch } from '../../util';

type ProgramCacheMap = {
  [key: string]: Program;
}

export class ProgramBuilder {
  private gl: WebGLRenderingContext;
  private programs: ProgramCacheMap;
  private stopWatch: Stopwatch;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.programs = {};
    this.stopWatch = new Stopwatch();
  }

  private generateHash(forDescriptor: types.MaterialDescriptor): string {
    const into: Array<string> = [];
    this.generateUniformIdentifierTypeIds(forDescriptor.uniforms, into);
    this.generateAdditionalPropertyIds(forDescriptor, into);
    return into.join(',');
  }

  private generateAdditionalPropertyIds(descriptor: types.MaterialDescriptor, into: Array<string>): void {
    const props = Object.keys(descriptor);

    for (let i = 0; i < props.length; i++) {
      const prop = props[i];

      if (descriptor.hasOwnProperty(prop) && (<any>descriptor)[prop] !== undefined) {
        const value = (<any>descriptor)[prop];
        if (typeof value === 'boolean' || typeof value === 'string') {
          into.push(`${prop},${value}`);
        }
      }
    }
  }

  private generateUniformIdentifierTypeIds(uniforms: {[key: string]: types.UniformValue}, into: Array<string>): void {
    for (let prop in uniforms) {
      if (uniforms.hasOwnProperty(prop) && uniforms[prop] !== undefined) {
        const uniform = uniforms[prop];
        into.push(`${uniform.identifier},${uniform.type}`);
      }
    }
  }

  private makeProgram(forMaterial: Material): Program {
    const fragSchema = new types.ShaderSchema(types.Shader.Fragment);
    const vertSchema = new types.ShaderSchema(types.Shader.Vertex);

    geometry.applyBaseGeometryVertexPipeline(vertSchema, forMaterial);
    geometry.applyBaseGeometryFragmentPipeline(fragSchema, forMaterial);

    const lightingModel = forMaterial.descriptor.lightingModel;

    switch (lightingModel) {
      case 'phong':
        phong.applyPhongVertexPipeline(vertSchema, forMaterial);
        phong.applyPhongFragmentPipeline(fragSchema, forMaterial);
        break;
      case 'physical':
        physical.applyComponent(fragSchema, forMaterial, physical.makeDefaultInputPlug(), physical.makeDefaultOutputPlug());
        fragColor.applyComponent(fragSchema, forMaterial, fragColor.makeDefaultInputPlug());
        break;
      case 'none':
        noLight.applyNoLightVertexPipeline(vertSchema, forMaterial);
        noLight.applyNoLightFragmentPipeline(fragSchema, forMaterial);
        break;
      default:
        console.warn(`Unsupported lighting model: "${forMaterial.descriptor.lightingModel}". Using "none".`);
        noLight.applyNoLightVertexPipeline(vertSchema, forMaterial);
        noLight.applyNoLightFragmentPipeline(fragSchema, forMaterial);
    }
    // console.log(shaderSchemaToString(vertSchema));
    // console.log(shaderSchemaToString(fragSchema));

    return Program.fromSchemas(this.gl, vertSchema, fragSchema);
  }

  requireProgram(forMaterial: Material): Program {
    const programInfoHash = this.generateHash(forMaterial.descriptor);
    const maybeProg = this.programs[programInfoHash];
    
    if (maybeProg === undefined) {
      this.stopWatch.reset();
      const prog = this.makeProgram(forMaterial);
      console.log(`Made new program in ${this.stopWatch.elapsed().toFixed(2)} ms.`);
      this.programs[programInfoHash] = prog;
      return prog;
    } else {
      console.log('Using cached program...');
      return maybeProg;
    }
  }
}