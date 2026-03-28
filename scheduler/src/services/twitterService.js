const { TwitterApi } = require('twitter-api-v2');

// Initialize Twitter client with OAuth 1.0a credentials
const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_APP_KEY,
  appSecret: process.env.TWITTER_APP_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

// Read-write client used for posting
const rwClient = twitterClient.readWrite;

const RATE_LIMIT_WAIT_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Posts a tweet. Retries once if a rate-limit error (429) is encountered.
 *
 * @param {string} text - Tweet content (max 280 chars)
 * @returns {Promise<object>} Twitter API v2 tweet data object
 */
async function postTweet(text) {
  if (!text || text.trim().length === 0) {
    throw new Error('Tweet text must not be empty');
  }

  const trimmed = text.trim().substring(0, 280);

  try {
    console.log(`[twitterService] Posting tweet (${trimmed.length} chars): "${trimmed.substring(0, 60)}..."`);
    const result = await rwClient.v2.tweet(trimmed);
    console.log(`[twitterService] Tweet posted. ID: ${result.data.id}`);
    return result.data;
  } catch (err) {
    // Retry once on rate limit
    if (err.code === 429 || (err.rateLimitError && err.rateLimit)) {
      console.warn(`[twitterService] Rate limited. Waiting ${RATE_LIMIT_WAIT_MS / 60000} minutes before retry...`);
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_WAIT_MS));

      try {
        const retryResult = await rwClient.v2.tweet(trimmed);
        console.log(`[twitterService] Tweet posted after retry. ID: ${retryResult.data.id}`);
        return retryResult.data;
      } catch (retryErr) {
        console.error('[twitterService] Retry failed:', retryErr.message);
        throw retryErr;
      }
    }

    console.error('[twitterService] postTweet error:', err.message);
    throw err;
  }
}

module.exports = { postTweet };
