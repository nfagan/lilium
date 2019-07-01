import { Model } from './model';
import { Transform } from './transform';
import { Light } from './lights';
import { types } from '.';

export class Scene {
  transform: Transform;
  models: Array<Model>;
  lights: Array<Light>;

  private numLightsByType: Map<types.Lights, number>;

  constructor() {
    this.transform = new Transform();
    this.models = [];
    this.lights = [];
    this.numLightsByType = new Map();
  }

  private setLightIndex(light: Light): void {
    let lightIndex = this.numLightsByType.get(light.kind);
    
    if (lightIndex === undefined) {
      lightIndex = 0;
    }

    light.index = lightIndex;
    this.numLightsByType.set(light.kind, lightIndex+1);
  }

  addModel(model: Model): void {
    this.models.push(model);
  }

  addLight(light: Light): void {
    this.setLightIndex(light);
    this.lights.push(light);
  }
}