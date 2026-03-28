const cron = require('node-cron');
const { runCarouselPipeline, runTweetPipeline } = require('../pipeline');

/**
 * Registers all daily cron jobs for the Qulo content pipeline.
 * All times are in Asia/Dubai timezone (UTC+4).
 *
 * Schedule:
 *   08:00 — 3 TikTok carousels pushed to drafts + Tweet #1 posted
 *   13:00 — Tweet #2 posted
 *   19:00 — Tweet #3 posted
 *
 * @param {object} opts
 * @param {object} opts.status - Shared status object from server.js for tracking last run info
 */
function initCronJobs({ status } = {}) {
  const tz = 'Asia/Dubai';

  // ── 08:00 Dubai ──────────────────────────────────────────────────────────
  // Runs full carousel pipeline (3 carousels → TikTok drafts)
  // AND posts the first tweet of the day.
  cron.schedule(
    '0 8 * * *',
    async () => {
      console.log('[cron] 08:00 Dubai — running carousel pipeline + tweet[0]');

      // Run carousel pipeline
      try {
        const results = await runCarouselPipeline();
        if (status) {
          status.carousel.lastRun = new Date().toISOString();
          status.carousel.lastResult = results;
          status.carousel.lastError = null;
        }
        console.log(`[cron] Carousel pipeline complete: ${results.length} carousels`);
      } catch (err) {
        if (status) {
          status.carousel.lastRun = new Date().toISOString();
          status.carousel.lastError = err.message;
        }
        console.error('[cron] Carousel pipeline failed:', err.message);
      }

      // Run tweet[0]
      try {
        const result = await runTweetPipeline(0);
        if (status) {
          status.tweet[0].lastRun = new Date().toISOString();
          status.tweet[0].lastResult = result;
          status.tweet[0].lastError = null;
        }
        console.log('[cron] Tweet[0] posted');
      } catch (err) {
        if (status) {
          status.tweet[0].lastRun = new Date().toISOString();
          status.tweet[0].lastError = err.message;
        }
        console.error('[cron] Tweet[0] failed:', err.message);
      }
    },
    { timezone: tz }
  );

  // ── 13:00 Dubai ──────────────────────────────────────────────────────────
  // Posts the second tweet of the day.
  cron.schedule(
    '0 13 * * *',
    async () => {
      console.log('[cron] 13:00 Dubai — running tweet[1]');
      try {
        const result = await runTweetPipeline(1);
        if (status) {
          status.tweet[1].lastRun = new Date().toISOString();
          status.tweet[1].lastResult = result;
          status.tweet[1].lastError = null;
        }
        console.log('[cron] Tweet[1] posted');
      } catch (err) {
        if (status) {
          status.tweet[1].lastRun = new Date().toISOString();
          status.tweet[1].lastError = err.message;
        }
        console.error('[cron] Tweet[1] failed:', err.message);
      }
    },
    { timezone: tz }
  );

  // ── 19:00 Dubai ──────────────────────────────────────────────────────────
  // Posts the third tweet of the day.
  cron.schedule(
    '0 19 * * *',
    async () => {
      console.log('[cron] 19:00 Dubai — running tweet[2]');
      try {
        const result = await runTweetPipeline(2);
        if (status) {
          status.tweet[2].lastRun = new Date().toISOString();
          status.tweet[2].lastResult = result;
          status.tweet[2].lastError = null;
        }
        console.log('[cron] Tweet[2] posted');
      } catch (err) {
        if (status) {
          status.tweet[2].lastRun = new Date().toISOString();
          status.tweet[2].lastError = err.message;
        }
        console.error('[cron] Tweet[2] failed:', err.message);
      }
    },
    { timezone: tz }
  );

  console.log('[cron] Jobs registered: 08:00, 13:00, 19:00 Asia/Dubai');
}

module.exports = { initCronJobs };
