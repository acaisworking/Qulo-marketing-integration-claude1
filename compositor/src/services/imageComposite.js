const sharp = require('sharp');
const axios = require('axios');

const CANVAS_SIZE = 1080;
const BRAND_COLOR_DEFAULT = '#6C63FF';
const OVERLAY_HEIGHT = 280;
const FONT_SIZE = 36;
const WATERMARK_FONT_SIZE = 28;
const COUNTER_FONT_SIZE = 24;
const PADDING = 32;

/**
 * Wraps text into lines that fit within maxWidth characters (approx).
 * At 36px font, ~28 chars per line is a safe estimate for 1080-wide canvas with padding.
 */
function wrapText(text, maxCharsPerLine = 38) {
  const words = text.split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    if ((current + ' ' + word).trim().length <= maxCharsPerLine) {
      current = (current + ' ' + word).trim();
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Converts a hex color string to an rgba object with the given alpha.
 */
function hexToRgba(hex, alpha = 1) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return { r, g, b, alpha };
}

/**
 * Builds an SVG overlay containing:
 *  - Semi-transparent bottom gradient panel
 *  - Caption text (white, wrapped)
 *  - "Qulo" brand watermark top-right
 *  - Slide counter bottom-right (e.g., "2/6")
 *
 * @param {object} opts
 * @param {string} opts.caption
 * @param {number} opts.slideNumber
 * @param {number} opts.totalSlides
 * @param {string} opts.brandColor - hex string
 * @returns {Buffer} SVG buffer
 */
function buildSvgOverlay({ caption, slideNumber, totalSlides, brandColor }) {
  const { r, g, b } = hexToRgba(brandColor);
  const lines = wrapText(caption, 38);
  const lineHeight = FONT_SIZE + 10;
  const textBlockHeight = lines.length * lineHeight;

  // Position caption text block above the bottom counter area
  const textStartY = CANVAS_SIZE - OVERLAY_HEIGHT + (OVERLAY_HEIGHT - textBlockHeight - 50) / 2 + FONT_SIZE;

  const captionLines = lines
    .map((line, i) => {
      const y = textStartY + i * lineHeight;
      return `<text
        x="${PADDING}"
        y="${y}"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${FONT_SIZE}"
        font-weight="bold"
        fill="white"
        paint-order="stroke"
        stroke="rgba(0,0,0,0.6)"
        stroke-width="3"
        stroke-linejoin="round"
      >${escapeXml(line)}</text>`;
    })
    .join('\n');

  const svg = `<svg
    xmlns="http://www.w3.org/2000/svg"
    width="${CANVAS_SIZE}"
    height="${CANVAS_SIZE}"
    viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}"
  >
    <defs>
      <linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(0,0,0,0)" />
        <stop offset="100%" stop-color="rgba(0,0,0,0.78)" />
      </linearGradient>
      <linearGradient id="topBrand" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="rgb(${r},${g},${b})" stop-opacity="0.92" />
        <stop offset="100%" stop-color="rgb(${r},${g},${b})" stop-opacity="0.7" />
      </linearGradient>
    </defs>

    <!-- Bottom gradient overlay for text legibility -->
    <rect
      x="0"
      y="${CANVAS_SIZE - OVERLAY_HEIGHT}"
      width="${CANVAS_SIZE}"
      height="${OVERLAY_HEIGHT}"
      fill="url(#bottomFade)"
    />

    <!-- Caption text -->
    ${captionLines}

    <!-- Qulo brand watermark pill (top-right) -->
    <rect
      x="${CANVAS_SIZE - 130}"
      y="18"
      width="112"
      height="40"
      rx="20"
      ry="20"
      fill="url(#topBrand)"
    />
    <text
      x="${CANVAS_SIZE - 74}"
      y="44"
      font-family="Arial, Helvetica, sans-serif"
      font-size="${WATERMARK_FONT_SIZE}"
      font-weight="900"
      fill="white"
      text-anchor="middle"
      letter-spacing="1"
    >Qulo</text>

    <!-- Slide counter pill (bottom-right) -->
    <rect
      x="${CANVAS_SIZE - 90}"
      y="${CANVAS_SIZE - 50}"
      width="74"
      height="34"
      rx="17"
      ry="17"
      fill="rgba(0,0,0,0.55)"
    />
    <text
      x="${CANVAS_SIZE - 53}"
      y="${CANVAS_SIZE - 27}"
      font-family="Arial, Helvetica, sans-serif"
      font-size="${COUNTER_FONT_SIZE}"
      font-weight="bold"
      fill="white"
      text-anchor="middle"
    >${slideNumber}/${totalSlides}</text>
  </svg>`;

  return Buffer.from(svg);
}

/**
 * Escapes XML special characters to prevent broken SVG.
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Downloads an image from a URL and returns it as a Buffer.
 */
async function downloadImage(url) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    headers: { 'User-Agent': 'Qulo-Compositor/1.0' },
  });
  return Buffer.from(response.data);
}

/**
 * Composes a single TikTok carousel slide.
 *
 * @param {object} opts
 * @param {string} opts.imageUrl     - Source image URL (DALL-E or Cloudinary)
 * @param {string} opts.caption      - Text caption to overlay
 * @param {number} opts.slideNumber  - Current slide index (1-based)
 * @param {number} opts.totalSlides  - Total slides in carousel
 * @param {string} opts.brandColor   - Hex brand color (default: #6C63FF)
 * @returns {Promise<Buffer>}         PNG image buffer
 */
async function composeSlide({ imageUrl, caption, slideNumber, totalSlides, brandColor = BRAND_COLOR_DEFAULT }) {
  // Download the base image
  const rawImageBuffer = await downloadImage(imageUrl);

  // Resize and normalize to 1080x1080 JPEG quality
  const baseImage = await sharp(rawImageBuffer)
    .resize(CANVAS_SIZE, CANVAS_SIZE, {
      fit: 'cover',
      position: 'centre',
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .toBuffer();

  // Build SVG overlay
  const svgOverlay = buildSvgOverlay({ caption, slideNumber, totalSlides, brandColor });

  // Composite: base image + SVG overlay → PNG output
  const composedBuffer = await sharp(baseImage)
    .composite([
      {
        input: svgOverlay,
        top: 0,
        left: 0,
      },
    ])
    .png({ compressionLevel: 8 })
    .toBuffer();

  return composedBuffer;
}

module.exports = { composeSlide };
