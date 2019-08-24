#include "lilium.h"

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

LILIUM_MALLOC(float, fast_grass_new_float_array)
LILIUM_MALLOC(int32_t, fast_grass_new_int32_array)
LILIUM_MALLOC(uint8_t, fast_grass_new_uint8_array)

LILIUM_FREE(float, fast_grass_free_float_array)
LILIUM_FREE(int32_t, fast_grass_free_int32_array)
LILIUM_FREE(uint8_t, fast_grass_free_uint8_array)

void fast_grass_update_wind(uint8_t* restrict wind_texture, uint8_t* restrict velocity_texture, const uint8_t* restrict noise, int32_t* restrict noise_indices, int32_t num_pixels, int32_t num_samples, float wind_vx, float wind_vz, float decay_amt) {
  const uint8_t vx = (uint8_t)((wind_vx + 1.0f) * 0.5f * 255.0f);
  const uint8_t vz = (uint8_t)((wind_vz + 1.0f) * 0.5f * 255.0f);

  for (int32_t i = 0; i < num_pixels; i++) {
    const int32_t sample_index = (noise_indices[i] + 1) % num_samples;
    const uint8_t sample = noise[sample_index];

    wind_texture[i*4] = vx;
    wind_texture[i*4+2] = vz;
    wind_texture[i*4+3] = sample;

    noise_indices[i] = sample_index;

    velocity_texture[i*4+3] /= decay_amt;
  }
}

void fast_grass_update_velocity_displacement(uint8_t* restrict velocity_texture, int32_t texture_size, float player_x, float player_y, float player_z, float player_width, float player_depth, float scale_x, float scale_z, float max_dim, float blade_height) {
  float frac_loc_x = player_x / max_dim;
  float frac_loc_z = player_z / max_dim;

  float scaled_x = player_width * scale_x / max_dim;
  float scaled_z = player_depth * scale_z / max_dim;

  float frac_width = LILIUM_CLAMP(scaled_x, 0.0f, 1.0f);
  float frac_depth = LILIUM_CLAMP(scaled_z, 0.0f, 1.0f);

  float min_x = frac_loc_x - frac_width/2.0f;
  float min_z = frac_loc_z - frac_depth/2.0f;

  min_x = LILIUM_CLAMP(min_x, 0.0f, 1.0f);
  min_z = LILIUM_CLAMP(min_z, 0.0f, 1.0f);

  float f_texture_size = (float)texture_size;

  int32_t num_pixels_x = (int32_t)(f_texture_size * frac_width);
  int32_t num_pixels_z = (int32_t)(f_texture_size * frac_depth);

  int32_t start_pixel_x = f_texture_size * min_x;
  int32_t start_pixel_z = f_texture_size * min_z;

  float mid_pixel_x = (min_x + frac_width/2.0f) * f_texture_size;
  float mid_pixel_z = (min_z + frac_depth/2.0f) * f_texture_size;

  const int out_of_bounds_xz = frac_loc_x > 1.0f || frac_loc_x < 0.0f || frac_loc_z > 1.0f || frac_loc_z < 0.0f;
  const int out_of_bounds_y = player_y < 0.0f || player_y > blade_height;

  if (out_of_bounds_xz || out_of_bounds_y) {
    num_pixels_x = 0;
    num_pixels_z = 0;
  }

  for (int32_t i = 0; i < num_pixels_x; i++) {
    for (int32_t j = 0; j < num_pixels_z; j++) {
      int32_t index_x = i + start_pixel_x;
      int32_t index_z = j + start_pixel_z;

      int32_t pixel_index = index_z * texture_size + index_x;
      int32_t texture_index = pixel_index * 4;

      float direction_x = ((float)index_x - mid_pixel_x) / (mid_pixel_x - (float)start_pixel_x);
      float direction_z = ((float)index_z - mid_pixel_z) / (mid_pixel_z - (float)start_pixel_z);

      float norm_x = (-direction_x + 1.0f) * 0.5f;
      float norm_z = (direction_z + 1.0f) * 0.5f;

      velocity_texture[texture_index] = (uint8_t)(norm_x * 255.0f);
      velocity_texture[texture_index+2] = (uint8_t)(norm_z * 255.0f);
      velocity_texture[texture_index+3] = 100;
    }
  }
}