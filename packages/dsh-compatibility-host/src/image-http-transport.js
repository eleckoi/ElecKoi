import http from 'node:http';
import https from 'node:https';
import { Readable, compose } from 'node:stream';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';
import { Request, Response } from 'undici';
import { HttpsProxyAgent } from 'https-proxy-agent';

/** Default NovelAI HTTP/1.1 transport, with no retries. Node owns framing, EOF validation and cancellation. */
export class ImageHttpTransport {
  constructor({ ca } = {}) { this.agents = new Map(); this.ca = ca; }
  async fetch(url, options = {}, proxyUrl) {
    const serialized = new Request(url, options);
    const body = options.body == null ? undefined : Buffer.from(await serialized.arrayBuffer());
    const headers = Object.fromEntries(serialized.headers);
    if (body) headers['content-length'] = String(body.length);
    const target = new URL(url), secure = target.protocol === 'https:';
    if (!secure && target.protocol !== 'http:') throw new TypeError('Unsupported image HTTP protocol');
    const key = JSON.stringify([target.protocol, proxyUrl || null]);
    let agent = this.agents.get(key);
    if (!agent) {
      agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : secure ? new https.Agent({ keepAlive: true }) : new http.Agent({ keepAlive: true });
      this.agents.set(key, agent);
    }
    options.signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      const request = (secure ? https : http).request(target, {
        method: options.method || 'GET', headers, agent, signal: options.signal,
        ...(secure ? { ALPNProtocols: ['http/1.1'], ...(this.ca ? { ca: this.ca } : {}) } : {}),
      });
      request.on('error', reject);
      request.on('response', response => {
        const responseHeaders = new Headers();
        for (let i = 0; i < response.rawHeaders.length; i += 2) responseHeaders.append(response.rawHeaders[i], response.rawHeaders[i + 1]);
        const empty = options.method === 'HEAD' || [204, 205, 304].includes(response.statusCode);
        const decoder = { gzip: createGunzip, deflate: createInflate, br: createBrotliDecompress }[response.headers['content-encoding']];
        const stream = !empty && decoder ? compose(response, decoder()) : response;
        resolve(new Response(empty ? null : Readable.toWeb(stream), {
          status: response.statusCode, statusText: response.statusMessage, headers: responseHeaders,
        }));
        if (empty) response.resume();
      });
      request.end(body);
    });
  }
  close() { for (const agent of this.agents.values()) agent.destroy(); this.agents.clear(); }
}
