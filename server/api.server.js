/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use strict';

const babelRegister = require('@babel/register');

babelRegister({
  ignore: [/[\\\/](build|server|node_modules)[\\\/]/],
  presets: [['@babel/preset-react', {runtime: 'automatic'}]],
  plugins: [
    '@babel/transform-modules-commonjs',
    ['@babel/transform-runtime', {useESModules: false}],
  ],
});

// Our client code imports createFromReadableStream and createFromFetch from react-server-dom-webpack/client.
// This code expects webpack globals, so we need to polyfill them on the server:
//
// 1. __webpack_chunk_load__ needed by preloadModule
// https://github.com/facebook/react/blob/8e2bde6f2751aa6335f3cef488c05c3ea08e074a/packages/react-server-dom-webpack/src/ReactFlightClientWebpackBundlerConfig.js#L75
globalThis.__webpack_chunk_load__ = (chunk) => {
  console.log(chunk);
  // TODO: how do we polyfill this? Why does the server even want to load webpack chunks?
  return Promise.resolve();
};
// 2. __webpack_require__ needed by requireModule
// https://github.com/facebook/react/blob/8e2bde6f2751aa6335f3cef488c05c3ea08e074a/packages/react-server-dom-webpack/src/ReactFlightClientWebpackBundlerConfig.js#L94
// TODO: this needs to use react-client-manifest to look up. In production, this is a number
globalThis.__webpack_require__ = (name) => require(path.join('../', name));

const {Worker, MessageChannel} = require('node:worker_threads');
const {Readable} = require('node:stream');
const express = require('express');
const compress = require('compression');
const {readFileSync} = require('fs');
const {unlink, writeFile} = require('fs').promises;
const ReactDOMServer = require('react-dom/server');
const {createFromReadableStream} = require('react-server-dom-webpack/client');
const path = require('path');
const {Pool} = require('pg');
const React = require('react');
const Root = require('../src/Root.client').default;
const {MessagePortReadable} = require('./MessagePort');

// Don't keep credentials in the source tree in a real app!
const pool = new Pool(require('../credentials'));

const PORT = process.env.PORT || 4000;
const app = express();
const ABORT_DELAY = 10000;
const assets = {
  'main.js': '/main.js',
  'main.css': '/style.css',
};

app.use(compress());
app.use(express.json());
app.use(express.urlencoded());

/**
 * We need to use ReactDOMServer in a different thread to
 * `react-server-dom-webpack/node-register`
 * so that it is not affected by the code mod.
 *
 * We do this by starting a Worker thread.
 * __This has not been tested for performance__
 *
 * Alternatively, we could set up a proxy server.
 */
const worker = new Worker('./server/flight.server.js', {
  execArgv: ['--conditions=react-server'],
});

worker.on('message', console.log);
worker.on('error', console.error);
worker.on('exit', (code) => {
  throw new Error(`Worker stopped with exit code ${code}`);
});

async function sendResponseDOM(req, res) {
  let didError = false;
  const initialLocation = {
    selectedId: Number(req.query.selectedId) || null,
    isEditing: req.query.isEditing === 'true',
    searchText: req.query.searchText || '',
  };

  await waitForWebpack();
  const manifest = readFileSync(
    path.resolve(__dirname, '../build/react-client-manifest.json'),
    'utf8'
  );
  const moduleMap = JSON.parse(manifest);
  const stream = ReactDOMServer.renderToPipeableStream(
    React.createElement(Root, {
      stylesheets: [assets['main.css']],
      initialLocation,
      getServerComponent: (key) => {
        const props = JSON.parse(key);
        return createFromReadableStream(
          Readable.toWeb(getServerComponentStream(props, moduleMap))
        );
      },
    }),
    {
      bootstrapScripts: [assets['main.js']],
      onShellReady() {
        res.statusCode = didError ? 500 : 200;
        res.setHeader('Content-type', 'text/html');
        stream.pipe(res);
      },
      onError(x) {
        didError = true;
        console.error(x);
      },
    }
  );
  setTimeout(() => stream.abort(), ABORT_DELAY);
  // To support users without JS:
  // const stream = ReactDOMServer.renderToNodeStream(
  //   React.createElement(Root, {
  //     stylesheets: [assets['main.css']],
  //     scripts: [assets['main.js']],
  //     getServerComponent: (key) => {
  //       const props = JSON.parse(key);
  //       return createFromReadableStream(
  //         Readable.toWeb(getServerComponentStream(props, moduleMap))
  //       );
  //     },
  //     initialLocation,
  //   })
  // );
  // stream.pipe(res);
}

app
  .listen(PORT, () => {
    console.log(`React Notes listening at ${PORT}...`);
  })
  .on('error', function(error) {
    if (error.syscall !== 'listen') {
      throw error;
    }
    const isPipe = (portOrPipe) => Number.isNaN(portOrPipe);
    const bind = isPipe(PORT) ? 'Pipe ' + PORT : 'Port ' + PORT;
    switch (error.code) {
      case 'EACCES':
        console.error(bind + ' requires elevated privileges');
        process.exit(1);
        break;
      case 'EADDRINUSE':
        console.error(bind + ' is already in use');
        process.exit(1);
        break;
      default:
        throw error;
    }
  });

function handleErrors(fn) {
  return async function(req, res, next) {
    try {
      return await fn(req, res);
    } catch (x) {
      next(x);
    }
  };
}

app.get(
  '/',
  handleErrors(async function(req, res) {
    await waitForWebpack();
    await sendResponseDOM(req, res);
  })
);

async function renderReactTree(res, props) {
  res.socket.on('error', (error) => {
    console.error('Fatal', error);
  });
  await waitForWebpack();
  const manifest = readFileSync(
    path.resolve(__dirname, '../build/react-client-manifest.json'),
    'utf8'
  );
  const moduleMap = JSON.parse(manifest);
  const readable = getServerComponentStream(props, moduleMap);
  res.statusCode = 200;
  res.setHeader('Content-type', 'text/html');
  readable.pipe(res);
}

function getServerComponentStream(props, moduleMap) {
  const responseChannel = new MessageChannel();
  const readable = new MessagePortReadable(responseChannel.port2);

  worker.postMessage(
    {
      responsePort: responseChannel.port1,
      props,
      moduleMap,
    },
    [responseChannel.port1]
  );
  return readable;
}

function sendResponse(req, res, redirect, api) {
  let location;
  try {
    location = JSON.parse(req.query.location);
  } catch (e) {
    location = {};
  }
  if (redirect) {
    location = {
      ...location,
      ...redirect,
    };
  }
  res.set('X-Location', JSON.stringify(location));
  if (!api || req.header('content-type') === 'application/json') {
    renderReactTree(res, {
      selectedId: location.selectedId,
      isEditing: location.isEditing,
      searchText: location.searchText,
    });
  } else {
    res.redirect(`/?${new URLSearchParams(location)}`);
  }
}

function sendApiResponse(req, res, redirect) {
  sendResponse(req, res, redirect, true);
}

app.get('/react', function(req, res) {
  sendResponse(req, res, null);
});

const NOTES_PATH = path.resolve(__dirname, '../notes');

app.post(
  '/notes',
  handleErrors(async function(req, res) {
    const now = new Date();
    const result = await pool.query(
      'insert into notes (title, body, created_at, updated_at) values ($1, $2, $3, $3) returning id',
      [req.body.title, req.body.body, now]
    );
    const insertedId = result.rows[0].id;
    await writeFile(
      path.resolve(NOTES_PATH, `${insertedId}.md`),
      req.body.body,
      'utf8'
    );
    sendApiResponse(req, res, {selectedId: insertedId});
  })
);

app.post(
  '/notes/:id',
  handleErrors(async function(req, res) {
    const now = new Date();
    const updatedId = Number(req.params.id);
    if (req.body.action === 'delete') {
      await pool.query('delete from notes where id = $1', [req.params.id]);
      await unlink(path.resolve(NOTES_PATH, `${req.params.id}.md`));
      res.redirect('/');
    } else {
      await pool.query(
        'update notes set title = $1, body = $2, updated_at = $3 where id = $4',
        [req.body.title, req.body.body, now, updatedId]
      );
      await writeFile(
        path.resolve(NOTES_PATH, `${updatedId}.md`),
        req.body.body,
        'utf8'
      );
      res.redirect(`/?selectedId=${updatedId}`);
    }
  })
);

app.put(
  '/notes/:id',
  handleErrors(async function(req, res) {
    const now = new Date();
    const updatedId = Number(req.params.id);
    await pool.query(
      'update notes set title = $1, body = $2, updated_at = $3 where id = $4',
      [req.body.title, req.body.body, now, updatedId]
    );
    await writeFile(
      path.resolve(NOTES_PATH, `${updatedId}.md`),
      req.body.body,
      'utf8'
    );
    sendApiResponse(req, res, {isEditing: false});
  })
);

app.delete(
  '/notes/:id',
  handleErrors(async function(req, res) {
    await pool.query('delete from notes where id = $1', [req.params.id]);
    await unlink(path.resolve(NOTES_PATH, `${req.params.id}.md`));
    sendResponse(req, res, {selectedId: undefined, isEditing: undefined});
  })
);

app.get(
  '/notes',
  handleErrors(async function(_req, res) {
    const {rows} = await pool.query('select * from notes order by id desc');
    res.json(rows);
  })
);

app.get(
  '/notes/:id',
  handleErrors(async function(req, res) {
    const {rows} = await pool.query('select * from notes where id = $1', [
      req.params.id,
    ]);
    if (rows?.[0]) {
      res.json(rows[0]);
    } else {
      res.statusCode = 404;
      res.send();
    }
  })
);

app.get('/sleep/:ms', function(req, res) {
  setTimeout(() => {
    res.json({ok: true});
  }, req.params.ms);
});

app.use(express.static('build'));
app.use(express.static('public'));

async function waitForWebpack() {
  while (true) {
    try {
      readFileSync(path.resolve(__dirname, '../build/index.html'));
      return;
    } catch (err) {
      console.log(
        'Could not find webpack build output. Will retry in a second...'
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
