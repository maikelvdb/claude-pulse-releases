const path = require('path');

const commonConfig = {
  mode: 'development',
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.main.json',
          },
        },
        exclude: /node_modules/,
      },
    ],
  },
  externals: {
    electron: 'commonjs electron',
  },
};

/** @type {import('webpack').Configuration[]} */
module.exports = [
  {
    ...commonConfig,
    target: 'electron-main',
    entry: './src/main/index.ts',
    output: {
      path: path.resolve(__dirname, 'dist', 'main'),
      filename: 'index.js',
    },
    node: {
      __dirname: false,
      __filename: false,
    },
  },
  {
    ...commonConfig,
    target: 'electron-preload',
    entry: './src/preload/index.ts',
    output: {
      path: path.resolve(__dirname, 'dist', 'preload'),
      filename: 'index.js',
    },
  },
];
