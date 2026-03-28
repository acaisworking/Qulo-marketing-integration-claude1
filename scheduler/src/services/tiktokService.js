const axios = require('axios');

const PUBLER_API_BASE = 'https://app.publer.io/api/v1';

/**
 * Schedules a TikTok photo carousel post via the Publer REST API.
 *
 * Publer queues the post for the connected TikTok account using the
 * supplied image URLs as carousel slides. If PUBLER_TIKTOK_SCHEDULE_AT
 * is set (ISO-8601 string) the post will be scheduled at that time;
 * otherwise it is queued for Publer's optimal auto-schedule slot.
 *
 * Required env vars:
 *   PUBLER_API_KEY             — Publer workspace API key
 *   PUBLER_TIKTOK_PROFILE_ID   — Publer profile ID for the connected TikTok account
 *
 * Optional env vars:
 *   PUBLER_TIKTOK_SCHEDULE_AT  — ISO-8601 datetime to schedule the post (e.g. "2025-06-01T08:00:00+04:00")
 *
 * @param {object}   opts
 * @param {string}   opts.title      - Carousel caption / title (max 150 chars)
 * @param {string[]} opts.imageUrls  - Ordered array of public image URLs (1–35 images)
 * @returns {Promise<{ publish_id: string|null, status: string }>}
 */
async function postCarouselDraft({ title, imageUrls }) {
  const apiKey   = process.env.PUBLER_API_KEY;
  const profileId = process.env.PUBLER_TIKTOK_PROFILE_ID;

  if (!apiKey)     throw new Error('PUBLER_API_KEY is not configured');
  if (!profileId)  throw new Error('PUBLER_TIKTOK_PROFILE_ID is not configured');

  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    throw new Error('imageUrls must be a non-empty array');
  }

  const caption     = title ? title.substring(0, 150) : 'Qulo — Tips for Kids';
  const scheduleAt  = process.env.PUBLER_TIKTOK_SCHEDULE_AT || null;

  const payload = {
    profiles:   [profileId],
    text:       caption,
    media_urls: imageUrls,
    ...(scheduleAt ? { publish_at: scheduleAt } : {}),
  };

  try {
    console.log(`[tiktokService] Scheduling TikTok carousel via Publer: "${caption}" (${imageUrls.length} images)`);

    const response = await axios.post(
      `${PUBLER_API_BASE}/post`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    // Publer returns the created post(s) under response.data.posts[] or response.data.post
    const posts    = response.data?.posts;
    const post     = Array.isArray(posts) ? posts[0] : (response.data?.post || response.data);
    const publishId = post?.uid ?? post?.id ?? null;

    console.log(`[tiktokService] TikTok carousel scheduled via Publer. publish_id: ${publishId}`);
    return { publish_id: publishId, status: 'scheduled' };
  } catch (err) {
    if (err.response) {
      const detail = JSON.stringify(err.response.data || {});
      console.error(`[tiktokService] Publer HTTP ${err.response.status}: ${detail}`);
      throw new Error(`Publer API HTTP ${err.response.status}: ${detail}`);
    }
    console.error('[tiktokService] postCarouselDraft error:', err.message);
    throw err;
  }
}

module.exports = { postCarouselDraft };
