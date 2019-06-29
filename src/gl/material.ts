import { types } from '.';

export type MaterialDescriptor = {
  receivesLight: boolean,
  receivesShadow: boolean,
  lightingModel: types.LightingModels
};