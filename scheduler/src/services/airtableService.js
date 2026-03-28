const Airtable = require('airtable');

// Fallback topics used when Airtable is unavailable or returns fewer records than needed
const DEFAULT_TOPICS = [
  'Bedtime routines for kids',
  'Learning numbers with Qulo',
  'Emotional intelligence for children',
  'Creative storytelling adventures',
  'Nature exploration for kids',
  'Building friendship skills',
];

const ARCHETYPES = ['Explorer', 'Friend', 'Teacher', 'Creator', 'Storyteller', 'Helper'];
const TOPICS_TABLE = 'Topics';
const ARCHETYPES_TABLE = 'Archetypes';

let base = null;

/**
 * Returns the Airtable base instance, creating it lazily.
 * Returns null if environment variables are missing (graceful degradation).
 */
function getBase() {
  if (base) return base;

  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!apiKey || !baseId) {
    console.warn('[airtableService] Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID — using fallbacks');
    return null;
  }

  Airtable.configure({ apiKey });
  base = new Airtable().base(baseId);
  return base;
}

/**
 * Returns the day-of-year (1–365) for today in Dubai timezone (UTC+4).
 */
function getDayOfYearDubai() {
  const now = new Date();
  // Convert to Dubai time (UTC+4)
  const dubaiOffset = 4 * 60; // minutes
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const dubai = new Date(utc + dubaiOffset * 60000);

  const start = new Date(dubai.getFullYear(), 0, 0);
  const diff = dubai - start;
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

/**
 * Fetches `count` unused topics from Airtable, sorted by LastUsed ascending
 * (oldest first), so content rotates naturally.
 * Falls back to DEFAULT_TOPICS slice if Airtable fails.
 *
 * @param {number} count - Number of topics to fetch
 * @returns {Promise<Array<{ id: string, name: string }>>}
 */
async function getTopics(count) {
  const db = getBase();

  if (!db) {
    return DEFAULT_TOPICS.slice(0, count).map((name, i) => ({ id: `default-${i}`, name }));
  }

  try {
    const records = await db(TOPICS_TABLE)
      .select({
        filterByFormula: 'NOT({Used})',
        sort: [{ field: 'LastUsed', direction: 'asc' }],
        maxRecords: count,
      })
      .all();

    if (records.length === 0) {
      console.warn('[airtableService] No unused topics found — resetting all topics and using defaults');
      // Could optionally reset all topics here; for now fall back gracefully
      return DEFAULT_TOPICS.slice(0, count).map((name, i) => ({ id: `default-${i}`, name }));
    }

    const topics = records.map((rec) => ({ id: rec.id, name: rec.fields.Name }));
    console.log(`[airtableService] Fetched ${topics.length} topics from Airtable`);
    return topics;
  } catch (err) {
    console.error('[airtableService] getTopics error:', err.message);
    return DEFAULT_TOPICS.slice(0, count).map((name, i) => ({ id: `default-${i}`, name }));
  }
}

/**
 * Marks an array of topic record IDs as used in Airtable.
 * Skips default (non-Airtable) IDs silently.
 *
 * @param {string[]} topicIds - Airtable record IDs
 */
async function markTopicsUsed(topicIds) {
  const db = getBase();

  if (!db) {
    console.log('[airtableService] Skipping markTopicsUsed — Airtable not configured');
    return;
  }

  // Filter out default/fallback IDs
  const realIds = topicIds.filter((id) => !id.startsWith('default-'));
  if (realIds.length === 0) return;

  try {
    const updates = realIds.map((id) => ({
      id,
      fields: { Used: true, LastUsed: new Date().toISOString() },
    }));

    // Airtable update accepts max 10 records per call
    const chunks = [];
    for (let i = 0; i < updates.length; i += 10) {
      chunks.push(updates.slice(i, i + 10));
    }

    for (const chunk of chunks) {
      await db(TOPICS_TABLE).update(chunk);
    }

    console.log(`[airtableService] Marked ${realIds.length} topics as used`);
  } catch (err) {
    console.error('[airtableService] markTopicsUsed error:', err.message);
  }
}

/**
 * Returns the current topic and archetype for a given tweet slot.
 * Archetype rotates based on day-of-year mod 6.
 * Topic is the first available unused topic for today.
 *
 * @param {number} tweetIndex - 0, 1, or 2
 * @returns {Promise<{ topic: string, archetype: string }>}
 */
async function getCurrentContext(tweetIndex) {
  try {
    const dayOfYear = getDayOfYearDubai();
    const archetypeIndex = dayOfYear % ARCHETYPES.length;
    const archetype = ARCHETYPES[archetypeIndex];

    // For tweet context we want a fresh topic (not necessarily "unused" tracked —
    // just the first default or Airtable topic relevant for today)
    const topics = await getTopics(3);
    // Use different topics for each tweet slot so content varies throughout the day
    const topicObj = topics[tweetIndex] || topics[0] || { name: DEFAULT_TOPICS[tweetIndex % DEFAULT_TOPICS.length] };

    console.log(`[airtableService] Context for tweet[${tweetIndex}]: topic="${topicObj.name}", archetype="${archetype}"`);
    return { topic: topicObj.name, archetype };
  } catch (err) {
    console.error('[airtableService] getCurrentContext error:', err.message);
    return {
      topic: DEFAULT_TOPICS[tweetIndex % DEFAULT_TOPICS.length],
      archetype: ARCHETYPES[tweetIndex % ARCHETYPES.length],
    };
  }
}

module.exports = { getTopics, markTopicsUsed, getCurrentContext };
