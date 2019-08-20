const path = require('path');

module.exports = {
  entry: './build/src/client.js',
  output: {
    filename: 'client.js',
    path: path.resolve(__dirname, 'dist')
  },
  mode: 'development',
  // module: {
  //   rules: [
  //     {
  //       test: /fast-grass\.js$/,
  //     },
  //     {
  //       test: /fast-grass\.wasm$/,
  //       type: 'javascript/auto',
  //       loader: 'file-loader',
  //       options: {
  //         publicPath: 'playground/wasm/'
  //       }
  //     }
  //   ]
  // }
};
