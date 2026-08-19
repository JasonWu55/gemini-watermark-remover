import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

import { processImage } from './processor.js';

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

class ApiError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function json(response, statusCode, body, requestId) {
  const payload = Buffer.from(JSON.stringify(body));
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': payload.length,
    'Cache-Control': 'no-store',
    'X-Request-Id': requestId
  });
  response.end(payload);
}

function tokenMatches(actual, expected) {
  const actualBuffer = Buffer.from(actual || '');
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function authorize(request, token) {
  if (!token) return;
  const header = request.headers.authorization || '';
  const actual = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!tokenMatches(actual, token)) {
    throw new ApiError(401, 'unauthorized', 'A valid Bearer token is required.');
  }
}

function sniffMimeType(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

async function readBody(request, maxBytes) {
  const contentLength = Number(request.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    request.resume();
    throw new ApiError(413, 'payload_too_large', `Image exceeds the ${maxBytes}-byte limit.`);
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      request.resume();
      throw new ApiError(413, 'payload_too_large', `Image exceeds the ${maxBytes}-byte limit.`);
    }
    chunks.push(chunk);
  }
  if (size === 0) throw new ApiError(400, 'empty_body', 'Request body must contain an image.');
  return Buffer.concat(chunks);
}

function headerValue(value) {
  return value === null || value === undefined ? '' : String(value).replace(/[\r\n]/g, '');
}

export function createApiServer(options = {}) {
  const token = options.token ?? process.env.GWR_API_TOKEN ?? '';
  const configuredMaxBytes = Number(options.maxBytes ?? process.env.GWR_API_MAX_BYTES ?? DEFAULT_MAX_BYTES);
  const maxBytes = Number.isFinite(configuredMaxBytes) && configuredMaxBytes > 0
    ? configuredMaxBytes
    : DEFAULT_MAX_BYTES;
  const processor = options.processor ?? processImage;

  return createServer(async (request, response) => {
    const requestId = randomUUID();
    try {
      const url = new URL(request.url || '/', 'http://localhost');
      if (request.method === 'GET' && url.pathname === '/healthz') {
        json(response, 200, { status: 'ok' }, requestId);
        return;
      }
      if (url.pathname !== '/v1/remove') {
        throw new ApiError(404, 'not_found', 'Route not found.');
      }
      if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        throw new ApiError(405, 'method_not_allowed', 'Use POST for this route.');
      }

      authorize(request, token);
      const mimeType = String(request.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
      if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
        throw new ApiError(415, 'unsupported_media_type', 'Content-Type must be image/png, image/jpeg, or image/webp.');
      }

      const input = await readBody(request, maxBytes);
      if (sniffMimeType(input) !== mimeType) {
        throw new ApiError(415, 'invalid_image_type', 'Content-Type does not match the uploaded image.');
      }

      const result = await processor(input, { mimeType, requestId });
      const output = Buffer.from(result.buffer);
      const meta = result.meta || {};
      response.writeHead(200, {
        'Content-Type': result.mimeType || 'image/png',
        'Content-Length': output.length,
        'Content-Disposition': 'attachment; filename="watermark-removed.png"',
        'Cache-Control': 'no-store',
        'X-Request-Id': requestId,
        'X-GWR-Applied': headerValue(meta.applied),
        'X-GWR-Decision-Tier': headerValue(meta.decisionTier),
        'X-GWR-Quality-Status': headerValue(meta.qualityStatus)
      });
      response.end(output);
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const statusCode = error instanceof ApiError ? error.statusCode : 500;
      const code = error instanceof ApiError ? error.code : 'processing_failed';
      const message = error instanceof ApiError ? error.message : 'The image could not be processed.';
      if (!(error instanceof ApiError)) console.error(`[${requestId}]`, error);
      json(response, statusCode, { error: { code, message } }, requestId);
    }
  });
}

export function startApiServer(options = {}) {
  const host = options.host ?? process.env.HOST ?? '0.0.0.0';
  const port = Number(options.port ?? process.env.PORT ?? 3000);
  const server = createApiServer(options);
  server.listen(port, host, () => {
    const auth = (options.token ?? process.env.GWR_API_TOKEN) ? 'enabled' : 'disabled';
    console.log(`GWR API listening on http://${host}:${port} (Bearer auth ${auth})`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startApiServer();
}
