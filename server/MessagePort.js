/**
The MIT License (MIT)

Copyright (c) 2020 James M Snell and the Piscina contributors

Piscina contributors listed at https://github.com/jasnell/piscina#the-team and
in the README file.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

https://github.com/piscinajs/piscina/blob/832006494122bffc375db47ca023a110387f5cc1/examples/stream/stream.mjs
*/

const {Readable, Writable} = require('stream');

const kPort = Symbol('kPort');
class MessagePortWritable extends Writable {
  constructor(port, options) {
    super(options);
    this[kPort] = port;
  }

  _write(buf, _, cb) {
    this[kPort].postMessage(buf, [buf.buffer]);
    cb();
  }

  _writev(data, cb) {
    const chunks = new Array(data.length);
    const transfers = new Array(data.length);
    for (let n = 0; n < data.length; n++) {
      chunks[n] = data[n].chunk;
      transfers[n] = data[n].chunk.buffs;
    }
    this[kPort].postMessage(chunks, transfers);
    cb();
  }

  _final(cb) {
    this[kPort].postMessage(null);
    cb();
  }

  _destroy(err, cb) {
    this[kPort].close(() => cb(err));
  }

  unref() {
    this[kPort].unref();
    return this;
  }
  ref() {
    this[kPort].ref();
    return this;
  }
}

class MessagePortReadable extends Readable {
  constructor(port, options) {
    super(options);
    this[kPort] = port;
    port.onmessage = ({data}) => this.push(data);
  }

  _read() {
    this[kPort].start();
  }

  _destroy(err, cb) {
    this[kPort].close(() => {
      this[kPort].onmessage = undefined;
      cb(err);
    });
  }

  unref() {
    this[kPort].unref();
    return this;
  }
  ref() {
    this[kPort].ref();
    return this;
  }
}
module.exports = {MessagePortWritable, MessagePortReadable};
