// Preloaded into the site build (NODE_OPTIONS=--require). Any non-loopback TCP connection attempt is
// recorded to BALLOT_REF_NET_LOG and refused, proving the build makes no network calls (SC-009).
const net = require('node:net');
const fs = require('node:fs');
const original = net.Socket.prototype.connect;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', undefined]);
net.Socket.prototype.connect = function (...args) {
  const o = args[0];
  const host = o && typeof o === 'object' ? o.host : undefined;
  const isPath = o && typeof o === 'object' && 'path' in o;
  if (!isPath && !LOOPBACK.has(host)) {
    if (process.env.BALLOT_REF_NET_LOG)
      fs.appendFileSync(process.env.BALLOT_REF_NET_LOG, `${host}\n`);
    throw new Error(`network blocked in build: ${host}`);
  }
  return original.apply(this, args);
};
