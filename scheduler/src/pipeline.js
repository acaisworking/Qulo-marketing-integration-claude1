/**
 * Qulo Marketing Pipeline — Main Orchestrator
 * ============================================
 *
 * This module coordinates the two content pipelines:
 *
 * CAROUSEL PIPELINE (runs at 08:00 Dubai time)
 * ─────────────────────────────────────────────
 * 1. Fetch 3 unused topics from Airtable (falls back to defaults)
 * 2. For each topic — in parallel:
 *    a. Claude generates a 6-slide carousel plan (title + captions + image prompts)
 *    b. DALL-E 3 generates one image per slide (6 calls per carousel)
 *    c. Each raw image is uploaded to Cloudinary (qulo/carousels folder)
 *    d. Each raw Cloudinary image is composed with the compositor service
 *       (adds caption overlay, brand watermark, slide counter)
 *    e. Each composed PNG is uploaded to Cloudinary (qulo/composed folder)
 * 3. Each completed carousel (6 composed image URLs) is posted to TikTok as a draft
 * 4. Topics are marked as used in Airtable
 * 5. Results array is returned
 *
 * TWEET PIPELINE (runs at 08:00, 13:00, 19:00 Dubai time)
 * ─────────────────────────────────────────────────────────
 * 1. Fetch current topic + rotating archetype from Airtable
 * 2. Claude generates a tweet (streamed, max 280 chars)
 * 3. Tweet is posted to X/Twitter via API v2
 * 4. Result is returned
 *
 * All steps have individual error handling so a single failure does not
 * abort the entire pipeline run.
 */

require('dotenv').config();

const axios = require('axios');
const claudeService = require('./services/claudeService');
const dalleService = require('./services/dalleService');
const cloudinaryService = require('./services/cloudinaryService');
const tiktokService = require('./services/tiktokService');
const twitterService = require('./services/twitterService');
const airtableService = require('./services/airtableService');

const COMPOSITOR_URL = process.env.COMPOSITOR_URL || 'http://localhost:3000';
const SLIDES_PER_CAROUSEL = 6;

/**
 * Calls the compositor service to compose a single slide.
 * Returns the composed PNG as a Buffer.
 *
 * @param {object} opts
 * @param {string} opts.imageUrl
 * @param {string} opts.caption
 * @param {number} opts.slideNumber
 * @param {number} opts.totalSlides
 * @param {string} [opts.brandColor]
 * @returns {Promise<Buffer>}
 */
async function composeSlideViaService({ imageUrl, caption, slideNumber, totalSlides, brandColor }) {
  const response = await axios.post(
    `${COMPOSITOR_URL}/compose/carousel`,
    { imageUrl, caption, slideNumber, totalSlides, brandColor: brandColor || '#6C63FF' },
    { responseType: 'arraybuffer', timeout: 60000 }
  );
  return Buffer.from(response.data);
}

/**
 * Processes one carousel topic end-to-end:
 *   Claude → DALL-E → Cloudinary (raw) → Compositor → Cloudinary (composed)
 *
 * @param {object} topicObj - { id, name }
 * @param {number} carouselIndex - 0-based index for logging
 * @returns {Promise<{ topicId: string, title: string, composedUrls: string[], publishResult: object }>}
 */
async function processCarousel(topicObj, carouselIndex) {
  const { id: topicId, name: topic } = topicObj;
  console.log(`[pipeline] Carousel[${carouselIndex}] starting for topic: "${topic}"`);

  // Step a: Claude generates carousel plan
  const carouselPlan = await claudeService.generateCarouselContent(topic);
  const { title, slides } = carouselPlan;

  console.log(`[pipeline] Carousel[${carouselIndex}] plan ready: "${title}" (${slides.length} slides)`);

  // Steps b–e: process each slide in parallel
  const slideResults = await Promise.all(
    slides.map(async (slide) => {
      const { slideNumber, caption, imagePrompt } = slide;

      try {
        // b. DALL-E generates image
        const dalleUrl = await dalleService.generateImage(imagePrompt);

        // c. Upload raw DALL-E image to Cloudinary
        const rawCloudinaryUrl = await cloudinaryService.uploadUrl(dalleUrl);

        // d. Compose slide via compositor service
        const composedBuffer = await composeSlideViaService({
          imageUrl: rawCloudinaryUrl,
          caption,
          slideNumber,
          totalSlides: SLIDES_PER_CAROUSEL,
        });

        // e. Upload composed PNG to Cloudinary
        const composedFilename = `carousel-${Date.now()}-slide-${slideNumber}`;
        const composedUrl = await cloudinaryService.uploadBuffer(composedBuffer, composedFilename);

        console.log(`[pipeline] Carousel[${carouselIndex}] slide ${slideNumber}/${SLIDES_PER_CAROUSEL} composed`);
        return { slideNumber, composedUrl };
      } catch (err) {
        console.error(`[pipeline] Carousel[${carouselIndex}] slide ${slideNumber} failed:`, err.message);
        // Return null for failed slides so we can continue with the rest
        return { slideNumber, composedUrl: null };
      }
    })
  );

  // Collect composed URLs (filter out failed slides)
  const composedUrls = slideResults
    .sort((a, b) => a.slideNumber - b.slideNumber)
    .map((s) => s.composedUrl)
    .filter(Boolean);

  console.log(`[pipeline] Carousel[${carouselIndex}] ${composedUrls.length}/${SLIDES_PER_CAROUSEL} slides ready for TikTok`);

  // Step 3: Post to TikTok as draft
  let publishResult = null;
  if (composedUrls.length > 0) {
    publishResult = await tiktokService.postCarouselDraft({ title, imageUrls: composedUrls });
    console.log(`[pipeline] Carousel[${carouselIndex}] posted to TikTok. publish_id: ${publishResult.publish_id}`);
  } else {
    console.warn(`[pipeline] Carousel[${carouselIndex}] skipped TikTok posting — no valid slides`);
    publishResult = { publish_id: null, status: 'skipped_no_slides' };
  }

  return { topicId, title, composedUrls, publishResult };
}

/**
 * Runs the full carousel pipeline for 3 topics.
 * Topics are fetched from Airtable and processed in parallel.
 * After completion, topics are marked as used.
 *
 * @returns {Promise<Array>} Array of carousel results
 */
async function runCarouselPipeline() {
  console.log('[pipeline] === CAROUSEL PIPELINE START ===');
  const startTime = Date.now();

  // Step 1: Fetch 3 topics from Airtable
  const topics = await airtableService.getTopics(3);
  console.log(`[pipeline] Topics fetched: ${topics.map((t) => t.name).join(', ')}`);

  // Step 2: Process all 3 carousels in parallel
  const results = await Promise.allSettled(
    topics.map((topicObj, i) => processCarousel(topicObj, i))
  );

  const successes = [];
  const topicIdsToMark = [];

  for (let i = 0; i < results.length; i++) {
    const outcome = results[i];
    if (outcome.status === 'fulfilled') {
      successes.push(outcome.value);
      topicIdsToMark.push(outcome.value.topicId);
    } else {
      console.error(`[pipeline] Carousel[${i}] rejected:`, outcome.reason?.message);
    }
  }

  // Step 4: Mark successfully processed topics as used
  if (topicIdsToMark.length > 0) {
    await airtableService.markTopicsUsed(topicIdsToMark);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[pipeline] === CAROUSEL PIPELINE COMPLETE: ${successes.length}/${topics.length} carousels in ${elapsed}s ===`);

  return successes;
}

/**
 * Runs the tweet pipeline for a specific time slot.
 *
 * @param {number} tweetIndex - 0 (08:00), 1 (13:00), or 2 (19:00)
 * @returns {Promise<{ topic: string, archetype: string, tweetText: string, tweetId: string }>}
 */
async function runTweetPipeline(tweetIndex) {
  console.log(`[pipeline] === TWEET PIPELINE START (index ${tweetIndex}) ===`);

  // Step 1: Get current topic and archetype
  const { topic, archetype } = await airtableService.getCurrentContext(tweetIndex);
  console.log(`[pipeline] Tweet context: topic="${topic}", archetype="${archetype}"`);

  // Step 2: Generate tweet with Claude (streamed)
  const tweetText = await claudeService.generateTweet({ topic, archetype, tweetIndex });
  console.log(`[pipeline] Tweet generated (${tweetText.length} chars)`);

  // Step 3: Post to X/Twitter
  const tweetData = await twitterService.postTweet(tweetText);
  const tweetId = tweetData.id;

  console.log(`[pipeline] === TWEET PIPELINE COMPLETE: ID ${tweetId} ===`);

  return { topic, archetype, tweetText, tweetId };
}

module.exports = { runCarouselPipeline, runTweetPipeline };
