'use strict';

const register = require('react-server-dom-webpack/node-register');
register();
const babelRegister = require('@babel/register');
babelRegister({
  ignore: [/[\\\/](build|server|node_modules)[\\\/]/],
  presets: [['@babel/preset-react', {runtime: 'automatic'}]],
  plugins: ['@babel/transform-modules-commonjs'],
});

const {parentPort} = require('node:worker_threads');
const assert = require('node:assert');
const {renderToPipeableStream} = require('react-server-dom-webpack/server');
const React = require('react');
const ReactApp = require('../src/App.server').default;
const {MessagePortWritable} = require('./MessagePort');

let proxy = new Proxy(
  {},
  {
    get(_, id) {
      return new Proxy(
        {},
        {
          get(_, n) {
            return {
              id,
              chunks: [],
              name: n,
            };
          },
        }
      );
    },
  }
);

parentPort.on('message', async ({responsePort, props, moduleMap}) => {
  assert(responsePort instanceof MessagePort);

  const res = new MessagePortWritable(responsePort);

  const stream = renderToPipeableStream(
    React.createElement(ReactApp, props),
    moduleMap ?? proxy
  );
  stream.pipe(res);
});
