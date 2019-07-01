import * as types from '../types';
import * as phong from './phong';
import * as noLight from './no-light';
import { Program } from '../program';
import { Material } from '../material';
import { shaderSchemaToString } from './common';

type ProgramCacheMap = {
  [key: string]: Program;
}

export class ProgramBuilder {
  private gl: WebGLRenderingContext;
  private programs: ProgramCacheMap;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.programs = {};
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
    const fragSchema = new types.ShaderSchema();
    const vertSchema = new types.ShaderSchema();

    const lightingModel = forMaterial.descriptor.lightingModel;

    if (lightingModel === 'phong') {
      phong.applyPhongVertexPipeline(vertSchema, forMaterial);
      phong.applyPhongFragmentPipeline(fragSchema, forMaterial);

    } else if (lightingModel === 'none') {
      noLight.applyNoLightVertexPipeline(vertSchema, forMaterial);
      noLight.applyNoLightFragmentPipeline(fragSchema, forMaterial);

    } else {
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
      console.log('Making new program ...');
      const prog = this.makeProgram(forMaterial);
      this.programs[programInfoHash] = prog;
      return prog;
    } else {
      console.log('Using cached program...');
      return maybeProg;
    }
  }
}