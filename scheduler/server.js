require('dotenv').config();

const express = require('express');
const { initCronJobs } = require('./src/cron/jobs');
const { runCarouselPipeline, runTweetPipeline } = require('./src/pipeline');

const app = express();
app.use(express.json());

const PORT = process.env.PORT_SCHEDULER || process.env.PORT || 3001;

// In-memory status tracker
const status = {
  carousel: { lastRun: null, lastResult: null, lastError: null },
  tweet: [
    { index: 0, lastRun: null, lastResult: null, lastError: null },
    { index: 1, lastRun: null, lastResult: null, lastError: null },
    { index: 2, lastRun: null, lastResult: null, lastError: null },
  ],
};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'qulo-scheduler', timestamp: new Date().toISOString() });
});

// Status overview
app.get('/status', (req, res) => {
  res.json({ status, uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Manual trigger: carousel pipeline
app.post('/run/carousel', async (req, res) => {
  console.log('[scheduler] Manual carousel pipeline triggered');
  res.json({ message: 'Carousel pipeline started', timestamp: new Date().toISOString() });

  try {
    const results = await runCarouselPipeline();
    status.carousel.lastRun = new Date().toISOString();
    status.carousel.lastResult = results;
    status.carousel.lastError = null;
    console.log('[scheduler] Manual carousel pipeline completed:', results.length, 'carousels');
  } catch (err) {
    status.carousel.lastRun = new Date().toISOString();
    status.carousel.lastError = err.message;
    console.error('[scheduler] Manual carousel pipeline failed:', err.message);
  }
});

// Manual trigger: tweet pipeline
app.post('/run/tweet', async (req, res) => {
  const tweetIndex = req.body.tweetIndex !== undefined ? Number(req.body.tweetIndex) : 0;

  if (![0, 1, 2].includes(tweetIndex)) {
    return res.status(400).json({ error: 'tweetIndex must be 0, 1, or 2' });
  }

  console.log(`[scheduler] Manual tweet pipeline triggered (index ${tweetIndex})`);
  res.json({ message: `Tweet pipeline ${tweetIndex} started`, timestamp: new Date().toISOString() });

  try {
    const result = await runTweetPipeline(tweetIndex);
    status.tweet[tweetIndex].lastRun = new Date().toISOString();
    status.tweet[tweetIndex].lastResult = result;
    status.tweet[tweetIndex].lastError = null;
    console.log(`[scheduler] Manual tweet pipeline ${tweetIndex} completed`);
  } catch (err) {
    status.tweet[tweetIndex].lastRun = new Date().toISOString();
    status.tweet[tweetIndex].lastError = err.message;
    console.error(`[scheduler] Manual tweet pipeline ${tweetIndex} failed:`, err.message);
  }
});

// Start cron jobs
initCronJobs({ status });

app.listen(PORT, () => {
  console.log(`[scheduler] Service running on port ${PORT}`);
  console.log(`[scheduler] Timezone: ${process.env.TZ || 'system default'}`);
});

module.exports = app;
