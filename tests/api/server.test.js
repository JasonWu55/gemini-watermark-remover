import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import { createApiServer } from '../../src/api/server.js';

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

async function withServer(options, callback) {
  const server = createApiServer(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const { port } = server.address();
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('health check is public', async () => {
  await withServer({ token: 'secret' }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/healthz`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  });
});

test('remove endpoint requires the configured Bearer token', async () => {
  await withServer({ token: 'secret' }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: PNG
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, 'unauthorized');
  });
});

test('remove endpoint validates MIME type and image signature', async () => {
  await withServer({ token: '' }, async (baseUrl) => {
    const unsupported = await fetch(`${baseUrl}/v1/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: PNG
    });
    assert.equal(unsupported.status, 415);

    const mismatch = await fetch(`${baseUrl}/v1/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg' },
      body: PNG
    });
    assert.equal(mismatch.status, 415);
    assert.equal((await mismatch.json()).error.code, 'invalid_image_type');
  });
});

test('remove endpoint rejects oversized input', async () => {
  await withServer({ token: '', maxBytes: 8 }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: PNG
    });
    assert.equal(response.status, 413);
    assert.equal((await response.json()).error.code, 'payload_too_large');
  });
});

test('remove endpoint returns the processed image and metadata headers', async () => {
  const output = Buffer.from('processed');
  await withServer({
    token: 'secret',
    processor: async (input, context) => {
      assert.deepEqual(input, PNG);
      assert.equal(context.mimeType, 'image/png');
      return {
        buffer: output,
        mimeType: 'image/png',
        meta: { applied: true, decisionTier: 'direct-match', qualityStatus: 'clean' }
      };
    }
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/remove`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret',
        'Content-Type': 'image/png'
      },
      body: PNG
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('x-gwr-applied'), 'true');
    assert.equal(response.headers.get('x-gwr-decision-tier'), 'direct-match');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), output);
  });
});
