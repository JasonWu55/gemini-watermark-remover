import { removeWatermarkFromBuffer } from '../sdk/node.js';

let sharpPromise = null;

async function getSharp() {
  if (!sharpPromise) {
    sharpPromise = import('sharp').then((module) => module.default ?? module);
  }
  return sharpPromise;
}

export async function processImage(inputBuffer, { mimeType } = {}) {
  const sharp = await getSharp();
  const result = await removeWatermarkFromBuffer(inputBuffer, {
    mimeType,
    async decodeImageData(buffer) {
      const { data, info } = await sharp(buffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return {
        width: info.width,
        height: info.height,
        data: Uint8ClampedArray.from(data)
      };
    },
    async encodeImageData(imageData) {
      return sharp(Buffer.from(imageData.data), {
        raw: {
          width: imageData.width,
          height: imageData.height,
          channels: 4
        }
      }).png().toBuffer();
    }
  });

  return {
    buffer: result.buffer,
    mimeType: 'image/png',
    meta: result.meta
  };
}
