import * as types from '../types';
import * as phong from './phong';
import * as noLight from './no-light';
import * as geometry from './geometry';
import * as components from './components';
import * as vertexPosition from './vertex-position';
import * as vertexVaryings from './vertex-varyings';
import * as worldPosition from './world-position';
import * as projectivePosition from './projective-position';
import * as physical from './physical';
import * as fragColor from './frag-color';
import { Program } from '../program';
import { Material } from '../material';
import { shaderSchemaToString } from './common';
import { Stopwatch } from '../../util';

type ProgramCacheMap = {
  [key: string]: Program;
}

function generateMaterialHash(forDescriptor: types.MaterialDescriptor): string {
  const into: Array<string> = [];
  generateUniformIdentifierTypeIds(forDescriptor.uniforms, into);
  generateAdditionalPropertyIds(forDescriptor, into);
  return into.join(',');
}

function generateAdditionalPropertyIds(descriptor: types.MaterialDescriptor, into: Array<string>): void {
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

function generateUniformIdentifierTypeIds(uniforms: {[key: string]: types.UniformValue}, into: Array<string>): void {
  for (let prop in uniforms) {
    if (uniforms[prop] !== undefined) {
      const uniform = uniforms[prop];
      into.push(`${uniform.identifier},${uniform.type}`);
    }
  }
}

function handleLightingModel(forMaterial: Material, fragSchema: types.ShaderSchema): void {
  const lightingModel = forMaterial.descriptor.lightingModel;
  const fragOutputPlug = fragColor.makeDefaultInputPlug();

  if (lightingModel === types.LightingModel.Phong) {
    const inputPlug = phong.makeDefaultInputPlug();
    const outputPlug = phong.makeDefaultOutputPlug();
    outputPlug.modelColor.connectTo(fragOutputPlug.modelColor);
    phong.applyComponent(fragSchema, forMaterial, inputPlug, outputPlug);

  } else if (lightingModel === types.LightingModel.Physical) {
    const inputPlug = physical.makeDefaultInputPlug();
    const outputPlug = physical.makeDefaultOutputPlug();
    outputPlug.modelColor.connectTo(fragOutputPlug.modelColor);
    physical.applyComponent(fragSchema, forMaterial, inputPlug, outputPlug);

  } else if (lightingModel === types.LightingModel.None) {
    const inputPlug = noLight.makeDefaultInputPlug();
    const outputPlug = noLight.makeDefaultOutputPlug();
    outputPlug.modelColor.connectTo(fragOutputPlug.modelColor);
    noLight.applyComponent(fragSchema, forMaterial, inputPlug, outputPlug);

  } else {
    console.warn(`Unsupported lighting model: "${forMaterial.descriptor.lightingModel}".`);
  }

  fragColor.applyComponent(fragSchema, forMaterial, fragOutputPlug);
}

function makeProgram(gl: WebGLRenderingContext, forMaterial: Material): Program {
  const vertSchema = types.ShaderSchema.Vertex();
  const fragSchema = types.ShaderSchema.Fragment();

  worldPosition.applyComponent(vertSchema, worldPosition.makeDefaultInputPlug(), worldPosition.makeDefaultOutputPlug());
  projectivePosition.applyComponent(vertSchema, projectivePosition.makeDefaultInputPlug(), projectivePosition.makeDefaultOutputPlug());
  vertexPosition.applyComponent(vertSchema, vertexPosition.makeDefaultInputPlug());

  // const vertVaryingPlug = vertexVaryings.makeDefaultInputPlug();
  // if (!forMaterial.hasTextureUniform()) {
  //   vertVaryingPlug.uv = undefined;
  // }

  // vertexVaryings.applyComponent(vertSchema, vertVaryingPlug);

  geometry.applyBaseGeometryVertexPipeline(vertSchema, forMaterial);
  geometry.applyBaseGeometryFragmentPipeline(fragSchema, forMaterial);

  handleLightingModel(forMaterial, fragSchema);

  // console.log(shaderSchemaToString(vertSchema));
  // console.log(shaderSchemaToString(fragSchema));

  return Program.fromSchemas(gl, vertSchema, fragSchema);
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

  private makeProgram(progHash: string, forMaterial: Material): Program {
    this.stopWatch.reset();
    const prog = makeProgram(this.gl, forMaterial);
    console.log(`Made new program in ${this.stopWatch.elapsed().toFixed(2)} ms.`);
    this.programs[progHash] = prog;
    return prog;
  }

  requireProgram(forMaterial: Material): Program {
    const programInfoHash = generateMaterialHash(forMaterial.descriptor);
    const maybeProg = this.programs[programInfoHash];
    
    if (maybeProg === undefined) {
      return this.makeProgram(programInfoHash, forMaterial);
    } else {
      console.log('Using cached program ...');
      return maybeProg;
    }
  }
}