const cloudinary = require('cloudinary').v2;

// Configure Cloudinary from environment variables on module load
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/**
 * Uploads an image from a remote URL to Cloudinary.
 * Stored under the qulo/carousels folder.
 *
 * @param {string} url - Public image URL (e.g., from DALL-E)
 * @returns {Promise<string>} Cloudinary secure_url
 */
async function uploadUrl(url) {
  try {
    console.log(`[cloudinaryService] Uploading URL to qulo/carousels...`);

    const result = await cloudinary.uploader.upload(url, {
      folder: 'qulo/carousels',
      resource_type: 'image',
      format: 'jpg',
      quality: 'auto:good',
      overwrite: false,
    });

    console.log(`[cloudinaryService] URL upload complete: ${result.public_id}`);
    return result.secure_url;
  } catch (err) {
    console.error('[cloudinaryService] uploadUrl error:', err.message);
    throw err;
  }
}

/**
 * Uploads a raw image buffer to Cloudinary.
 * Stored under the qulo/composed folder.
 *
 * @param {Buffer} buffer   - PNG image buffer (from compositor)
 * @param {string} filename - Logical filename (used as public_id base)
 * @returns {Promise<string>} Cloudinary secure_url
 */
async function uploadBuffer(buffer, filename) {
  try {
    console.log(`[cloudinaryService] Uploading buffer "${filename}" to qulo/composed...`);

    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'qulo/composed',
          public_id: filename,
          resource_type: 'image',
          format: 'png',
          overwrite: true,
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
      uploadStream.end(buffer);
    });

    console.log(`[cloudinaryService] Buffer upload complete: ${result.public_id}`);
    return result.secure_url;
  } catch (err) {
    console.error('[cloudinaryService] uploadBuffer error:', err.message);
    throw err;
  }
}

module.exports = { uploadUrl, uploadBuffer };
