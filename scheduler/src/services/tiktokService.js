const axios = require('axios');

const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2';

/**
 * Posts a photo carousel as a draft to TikTok via the Content Posting API v2.
 * Privacy is set to SELF_ONLY so it lands in drafts for human review before publishing.
 *
 * @param {object} opts
 * @param {string}   opts.title      - Carousel title / caption (max 150 chars)
 * @param {string[]} opts.imageUrls  - Array of Cloudinary image URLs (1–35 images)
 * @returns {Promise<{ publish_id: string, status: string }>}
 */
async function postCarouselDraft({ title, imageUrls }) {
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error('TIKTOK_ACCESS_TOKEN is not configured');
  }

  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    throw new Error('imageUrls must be a non-empty array');
  }

  const payload = {
    post_info: {
      title: title ? title.substring(0, 150) : 'Qulo — Tips for Kids',
      privacy_level: 'SELF_ONLY',
      disable_duet: false,
      disable_comment: false,
      disable_stitch: false,
    },
    source_info: {
      source: 'PULL_FROM_URL',
      photo_cover_index: 0,
      photo_images: imageUrls,
    },
    post_mode: 'MEDIA_UPLOAD',
    media_type: 'PHOTO',
  };

  try {
    console.log(`[tiktokService] Posting carousel draft: "${title}" (${imageUrls.length} images)`);

    const response = await axios.post(
      `${TIKTOK_API_BASE}/post/publish/content/init/`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        timeout: 30000,
      }
    );

    const { data } = response;

    if (data.error && data.error.code !== 'ok') {
      throw new Error(`TikTok API error: ${data.error.code} — ${data.error.message}`);
    }

    const publish_id = data.data?.publish_id || null;
    console.log(`[tiktokService] Carousel draft posted. publish_id: ${publish_id}`);

    return { publish_id, status: 'draft_created' };
  } catch (err) {
    if (err.response) {
      const detail = JSON.stringify(err.response.data || {});
      console.error(`[tiktokService] HTTP ${err.response.status}: ${detail}`);
      throw new Error(`TikTok API HTTP ${err.response.status}: ${detail}`);
    }
    console.error('[tiktokService] postCarouselDraft error:', err.message);
    throw err;
  }
}

module.exports = { postCarouselDraft };
