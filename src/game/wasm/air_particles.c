#include "lilium.h"

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

LILIUM_MALLOC(float, lilium_new_float_array)
LILIUM_MALLOC(int32_t, lilium_new_int32_array)

LILIUM_FREE(float, lilium_free_float_array)
LILIUM_FREE(int32_t, lilium_free_int32_array)

void update(float* restrict translations, float* restrict offsets, float* restrict rotations, 
  float* restrict alphas, float* restrict alpha_signs, int32_t num_particles, float* restrict noise, int32_t* restrict noise_indices, int32_t num_noise_samples,
  float norm_x, float norm_z, float dt_factor, float* restrict player_position) {

  const float player_x = player_position[0];
  const float player_y = player_position[1];
  const float player_z = player_position[2];
  const float two_pi = LILIUM_PI * 2.0f;

  for (int32_t i = 0; i < num_particles; i++) {
    const int32_t noise_sample_index = (noise_indices[i] + 1) % num_noise_samples;
    const int32_t ind3 = i * 3;

    noise_indices[i] = noise_sample_index;

    const float noise_sample = noise[noise_sample_index];
    const float half_noise_sample = noise_sample - 0.5f;

    translations[ind3+0] += (half_noise_sample * 0.05f + 0.02f) * norm_x * dt_factor;
    translations[ind3+1] += half_noise_sample * 0.01f * dt_factor;
    translations[ind3+2] += (half_noise_sample * 0.05f + 0.02f) * norm_z * dt_factor;

    alphas[i] += alpha_signs[i] * 0.01f * noise_sample * dt_factor;

    if (alphas[i] < 0.0f) {
      alphas[i] = 0.0f;
      alpha_signs[i] = 1.0f;

      translations[ind3+0] = offsets[ind3] + player_x;
      translations[ind3+1] = offsets[ind3+1] + player_y;
      translations[ind3+2] = offsets[ind3+2] + player_z;

    } else if (alphas[i] > 1.0f) {
      alphas[i] = 1.0f;
      alpha_signs[i] = -1.0f;
    }
    
    rotations[ind3] += 0.01f * noise_sample * 2.0f * dt_factor;
    rotations[ind3+1] += 0.005f * half_noise_sample * dt_factor;

    for (int32_t j = 0; j < 3; j++) {
      const float rot = rotations[ind3+j];

      if (rot > two_pi) {
        rotations[ind3+j] = 0.0f;
      } else if (rot < 0) {
        rotations[ind3+j] = two_pi;
      }
    }
  }
}