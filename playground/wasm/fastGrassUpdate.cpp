#include <cstdint>
#include <emscripten.h>

// for (let i = 0; i < numPixelsTexture; i++) {
//   const sample = windAudioSamplers[i].nthNextSample(sampleIncrement);

//   const vx = (windVx + 1) * 0.5;
//   const vz = (windVz + 1) * 0.5;

//   windTextureData[i*4+0] = 255 * vx;
//   windTextureData[i*4+1] = 0;
//   windTextureData[i*4+2] = 255 * vz;
//   windTextureData[i*4+3] = 255 * sample;

//   velocityTextureData[i*4+3] /= decayAmt;
// }

extern "C" {
  std::int32_t fast_grass_update(int32_t value) {
    return value * 3;
  }
  // void fast_grass_update(float* wind_texture, float* velocity_texture, float* noise, std::int32_t* noise_indices, std::int32_t num_samples, float wind_vx, float wind_vz, float decay_amt) {
  //   for (int32_t i = 0; i < num_samples; i++) {
  //     const int32_t sample_index = (noise_indices[i] + 1) % num_samples;
  //     const float sample = noise[sample_index];

  //     const float vx = (wind_vx + 1.0f) * 0.5f;
  //     const float vz = (wind_vz + 1.0f) * 0.5f;
      
  //     const int32_t base_index = i * 4;

  //     wind_texture[base_index] = 255.0 * vx;
  //     wind_texture[base_index+1] = 0.0;
  //     wind_texture[base_index+2] = 255.0 * vz;
  //     wind_texture[base_index+3] = 255.0 * sample;

  //     velocity_texture[base_index+3] /= decay_amt;
  //   }
  // }
}