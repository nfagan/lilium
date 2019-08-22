#pragma once

#ifndef LILIUM_H
#define LILIUM_H

#define LILIUM_PI 3.1415926535897932

#define LILIUM_CLAMP(a, min, max) \
  (a) < (min) ? (min) : (a) > (max) ? (max) : (a)

#define LILIUM_MALLOC(T, name) \
  T* name(int32_t num_elements) { \
    T* data = (T*) malloc(num_elements * sizeof(T)); \
    memset(data, 0, num_elements * sizeof(T)); \
    return data; \
  } \

#define LILIUM_FREE(T, name) \
  void name(T* data) { \
    free(data); \
  } \

#endif