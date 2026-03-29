const axios = require('axios');

const PUBLER_API_BASE = 'https://app.publer.io/api/v1';
const RATE_LIMIT_WAIT_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Posts a tweet via the Publer REST API.
 * Retries once if a rate-limit (HTTP 429) is encountered.
 *
 * Required env vars:
 *   PUBLER_API_KEY              — Publer workspace API key
 *   PUBLER_TWITTER_PROFILE_ID   — Publer profile ID for the connected X/Twitter account
 *
 * @param {string} text - Tweet content (max 280 chars)
 * @returns {Promise<{ id: string }>}
 */
async function postTweet(text) {
  if (!text || text.trim().length === 0) {
    throw new Error('Tweet text must not be empty');
  }

  const apiKey = process.env.PUBLER_API_KEY;
  const profileId = process.env.PUBLER_TWITTER_PROFILE_ID;

  if (!apiKey) throw new Error('PUBLER_API_KEY is not configured');
  if (!profileId) throw new Error('PUBLER_TWITTER_PROFILE_ID is not configured');

  const trimmed = text.trim().substring(0, 280);

  const postPayload = {
    profile_ids: [profileId],
    text: trimmed,
    shorten_links: false,
  };

  async function attemptPost() {
    const response = await axios.post(
      `${PUBLER_API_BASE}/posts`,
      postPayload,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    // Publer returns the created post(s) under response.data.posts[] or response.data.post
    const posts = response.data?.posts;
    const post  = Array.isArray(posts) ? posts[0] : (response.data?.post || response.data);
    const id    = post?.uid ?? post?.id ?? null;

    return { id };
  }

  try {
    console.log(`[twitterService] Posting tweet via Publer (${trimmed.length} chars): "${trimmed.substring(0, 60)}..."`);
    const result = await attemptPost();
    console.log(`[twitterService] Tweet posted via Publer. ID: ${result.id}`);
    return result;
  } catch (err) {
    // Retry once on rate limit
    if (err.response?.status === 429) {
      console.warn(`[twitterService] Rate limited by Publer. Waiting ${RATE_LIMIT_WAIT_MS / 60000} minutes before retry...`);
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_WAIT_MS));

      try {
        const retryResult = await attemptPost();
        console.log(`[twitterService] Tweet posted after retry. ID: ${retryResult.id}`);
        return retryResult;
      } catch (retryErr) {
        console.error('[twitterService] Retry failed:', retryErr.message);
        throw retryErr;
      }
    }

    const detail = err.response ? JSON.stringify(err.response.data || {}) : err.message;
    console.error(`[twitterService] postTweet error: ${detail}`);
    throw err;
  }
}

module.exports = { postTweet };
