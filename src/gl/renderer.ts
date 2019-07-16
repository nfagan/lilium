import { RenderContext } from './render-context';
import { ProgramBuilder } from './shader-builder';
import { Material } from './material';
import { Light } from './lights';
import { Program } from './program';
import { Scene } from './scene';
import { mat4 } from 'gl-matrix';
import { types } from '.';
import { ICamera } from './camera';
import { Texture2D } from './texture';

export class Renderer {
  identifiers: types.ShaderIdentifierMap;

  private renderContext: RenderContext;
  private programBuilder: ProgramBuilder;
  private programsByMaterialId: Map<number, Program>;
  private inverseTransposeModel: mat4;
  private textureSetter: (tex: Texture2D) => void;
  private textureFinisher: (tex: Texture2D) => void;

  constructor(renderContext: RenderContext) {
    this.renderContext = renderContext;
    this.programBuilder = new ProgramBuilder(renderContext.gl);
    this.programsByMaterialId = new Map();
    this.identifiers = types.DefaultShaderIdentifiers;
    this.textureSetter = tex => textureSetter(this.renderContext, tex);
    this.textureFinisher = tex => textureFinisher(this.renderContext, tex);
    this.inverseTransposeModel = mat4.create();
  }

  private makeCurrentInverseTransposeModel(model: mat4): void {
    const invModel = this.inverseTransposeModel;
    mat4.invert(mat4.transpose(invModel, model), invModel);
  }

  setTextures(mat: Material): void {
    mat.useTextures(this.textureSetter);
  }

  unsetTextures(mat: Material): void {
    mat.useTextures(this.textureFinisher);
  }

  setModelViewProjection(prog: Program, model: mat4, view: mat4, proj: mat4): void {
    const idents = this.identifiers;
    prog.setMat4(idents.uniforms.model, model);
    prog.setMat4(idents.uniforms.view, view);
    prog.setMat4(idents.uniforms.projection, proj);
  }

  setLightUniforms(prog: Program, lights: Array<Light>, camera: ICamera): void {
    for (let j = 0; j < lights.length; j++) {
      lights[j].setUniforms(prog);
    }
    prog.setVec3(this.identifiers.uniforms.cameraPosition, camera.position);
  }

  render(scene: Scene, camera: ICamera, view: mat4, proj: mat4): void {
    const models = scene.models;
    const lights = scene.lights;
    const renderContext = this.renderContext;
    const identifiers = this.identifiers;

    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      const material = model.material;
      const drawComponent = model.drawable;
      const progForMaterial = this.requireProgram(material);

      renderContext.useProgram(progForMaterial);

      if (material.descriptor.lightingModel !== types.LightingModel.None) {
        this.setLightUniforms(progForMaterial, lights, camera);
        this.makeCurrentInverseTransposeModel(model.transform.matrix);
        progForMaterial.setMat4(identifiers.uniforms.inverseTransposeModel, this.inverseTransposeModel);
      }

      this.setModelViewProjection(progForMaterial, model.transform.matrix, view, proj);

      material.useTextures(this.textureSetter);
      material.setUniforms(progForMaterial);

      renderContext.bindVao(drawComponent.vao);
      drawComponent.draw();

      material.useTextures(this.textureFinisher);
      material.clearIsNewSchema();
    }
  }

  requireProgram(forMaterial: Material): Program {
    let progForMaterial = this.programsByMaterialId.get(forMaterial.id);

    if (progForMaterial === undefined || forMaterial.isNewSchema()) {
      progForMaterial = this.programBuilder.requireProgram(forMaterial);
      this.programsByMaterialId.set(forMaterial.id, progForMaterial);
    }

    return progForMaterial;
  }
}

function textureSetter(renderContext: RenderContext, texture: Texture2D): void {
  renderContext.pushActiveTexture2DAndBind(texture);
}

function textureFinisher(renderContext: RenderContext, texture: Texture2D): void {
  renderContext.popTexture2D();
}