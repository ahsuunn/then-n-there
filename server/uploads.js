import multer from 'multer';

export const MAX_BYTES = 15 * 1024 * 1024;

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 1 },
});

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// Identify the file by magic bytes only, never by name or extension.
// Returns 'jpg', 'png', or null when the bytes are neither.
export function sniffImage(buffer) {
  if (!buffer || buffer.length < 8) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }
  if (PNG_SIG.every((byte, i) => buffer[i] === byte)) {
    return 'png';
  }
  return null;
}

// Best-effort pixel dimensions. Null when the container does not carry them
// in a readable position; the schema allows nulls.
export function imageDimensions(buffer, type) {
  if (type === 'png' && buffer.length >= 24) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }
  if (type === 'jpg') {
    return jpegDimensions(buffer);
  }
  return { width: null, height: null };
}

function jpegDimensions(buffer) {
  if (buffer.length < 4) return { width: null, height: null };
  let offset = 2; // skip SOI (FF D8)
  while (offset + 4 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }
    // Markers with no length field: TEM and RSTn/SOI/EOI.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isSof) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return { width: null, height: null };
}
