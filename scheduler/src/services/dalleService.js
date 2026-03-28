const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Safety prefix injected into every prompt to keep content child-appropriate
const SAFETY_PREFIX = 'Child-friendly illustration, suitable for ages 4-10. ';

/**
 * Generates an image using DALL-E 3 for a carousel slide.
 * Automatically prepends a safety prefix to every prompt.
 *
 * @param {string} prompt - Image description from Claude
 * @returns {Promise<string>} The generated image URL (valid for ~1 hour from OpenAI)
 */
async function generateImage(prompt) {
  const safePrompt = SAFETY_PREFIX + prompt;

  try {
    console.log(`[dalleService] Generating image: "${prompt.substring(0, 60)}..."`);

    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: safePrompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
      style: 'vivid',
    });

    const imageUrl = response.data[0].url;

    if (!imageUrl) {
      throw new Error('DALL-E returned no image URL');
    }

    console.log('[dalleService] Image generated successfully');
    return imageUrl;
  } catch (err) {
    console.error('[dalleService] generateImage error:', err.message);
    throw err;
  }
}

module.exports = { generateImage };
