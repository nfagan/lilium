// ~/repositories/emsdk/fastcomp/emscripten/emcc -o fast-grass.html ./fastGrassUpdate.cpp -s EXPORTED_FUNCTIONS='["_fast_grass_update"]' -s EXTRA_EXPORTED_RUNTIME_METHODS='["ccall", "cwrap"]' -s MODULARIZE=1 -s 'EXPORT_NAME="FastGrass"'

const grassModuleInit = require('./fast-grass.js');

grassModuleInit().then(module => {
  console.log(module._fast_grass_update(3));
});