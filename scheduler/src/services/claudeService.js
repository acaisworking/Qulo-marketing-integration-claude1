const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ARCHETYPE_ANGLES = {
  Explorer: 'curiosity and discovery angle — highlight how children learn by exploring the world around them',
  Friend: 'emotional support and companionship angle — highlight how connection and friendship help children thrive',
  Teacher: 'learning and development angle — highlight educational milestones and skill-building for young minds',
  Creator: 'creativity and imagination angle — highlight how creative play sparks innovation and self-expression',
  Storyteller: 'adventure and narrative angle — highlight how stories build empathy, vocabulary, and a love of reading',
  Helper: 'problem-solving angle — highlight how guiding children through challenges builds confidence and resilience',
};

/**
 * Generates a 6-slide TikTok carousel content plan for the given topic.
 * Uses adaptive thinking so Claude reasons through the best structure first.
 *
 * @param {string} topic - Content topic (e.g., "Bedtime routines for kids")
 * @returns {Promise<{ title: string, slides: Array<{ slideNumber: number, caption: string, imagePrompt: string }> }>}
 */
async function generateCarouselContent(topic) {
  const systemPrompt = `You are a content creator for Qulo, an AI voice companion app for children ages 4-10. \
Create engaging, educational, and playful TikTok carousel content. Content must be parent-approved and child-friendly. \
Always respond with valid JSON only — no markdown, no code fences, just raw JSON.`;

  const userPrompt = `Create a 6-slide TikTok carousel about: "${topic}"

Return a JSON object with this exact structure:
{
  "title": "Carousel title (max 60 chars, engaging and parent-friendly)",
  "slides": [
    {
      "slideNumber": 1,
      "caption": "Slide caption (max 120 chars, conversational, emoji-friendly)",
      "imagePrompt": "DALL-E image prompt — children's book illustration style, bright colors, cute characters, age 4-10 appropriate. Describe the scene in detail."
    }
  ]
}

Rules:
- Slide 1: Hook — surprising fact or relatable problem that stops the scroll
- Slides 2-4: Core value — educational, actionable tips or story beats
- Slide 5: Emotional connection — heartwarming moment or empowering message
- Slide 6: CTA — invite parents to try Qulo with their child
- Captions must be warm, simple (grade 4 reading level), and include 1-2 emojis
- Image prompts must be specific, vivid, and safe for children`;

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    // Extract the text block (skip thinking blocks)
    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock) {
      throw new Error('Claude returned no text block in carousel response');
    }

    const parsed = JSON.parse(textBlock.text.trim());

    if (!parsed.title || !Array.isArray(parsed.slides) || parsed.slides.length === 0) {
      throw new Error('Claude response missing required fields: title or slides');
    }

    console.log(`[claudeService] Generated carousel for "${topic}": ${parsed.slides.length} slides`);
    return parsed;
  } catch (err) {
    console.error('[claudeService] generateCarouselContent error:', err.message);
    // Return a safe fallback structure so the pipeline does not fully crash
    return {
      title: `${topic} — Tips for Kids`,
      slides: Array.from({ length: 6 }, (_, i) => ({
        slideNumber: i + 1,
        caption: `Slide ${i + 1}: ${topic} 🌟`,
        imagePrompt: `Children's book illustration style, bright colors, cute cartoon child character, age 4-10 appropriate, ${topic}, happy and safe environment`,
      })),
    };
  }
}

/**
 * Generates a single tweet for the given context using streaming.
 * Stream is consumed fully before returning to avoid partial text.
 *
 * @param {object} opts
 * @param {string} opts.topic      - Content topic
 * @param {string} opts.archetype  - One of: Explorer, Friend, Teacher, Creator, Storyteller, Helper
 * @param {number} opts.tweetIndex - 0, 1, or 2 (used for tone variation within the day)
 * @returns {Promise<string>} Tweet text (max 280 chars)
 */
async function generateTweet({ topic, archetype, tweetIndex }) {
  const archetypeAngle = ARCHETYPE_ANGLES[archetype] || ARCHETYPE_ANGLES.Friend;

  const toneVariations = [
    'informative and inspiring',
    'warm and conversational, like advice from a friend',
    'energetic and motivational with a clear call to action',
  ];
  const tone = toneVariations[tweetIndex] || toneVariations[0];

  const systemPrompt = `You are a social media manager for Qulo, an AI voice companion app for children ages 4-10. \
Write engaging tweets for parents and caregivers. Keep it warm, educational, and trustworthy. \
Return only the tweet text — no quotes, no explanation, just the tweet itself.`;

  const userPrompt = `Write a tweet about: "${topic}"

Angle: ${archetypeAngle}
Tone: ${tone}

Requirements:
- Maximum 260 characters (leaving room for a link)
- Include 2-3 relevant hashtags from: #ParentingTips #KidsLearning #Qulo #EarlyChildhood #KidsDevelopment #ChildhoodMagic #ParentLife
- Must feel authentic, not sales-y
- Must be relevant to parents of children ages 4-10
- Use 1-2 emojis maximum`;

  let tweetText = '';

  try {
    const stream = await client.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    for await (const chunk of stream) {
      if (
        chunk.type === 'content_block_delta' &&
        chunk.delta.type === 'text_delta'
      ) {
        tweetText += chunk.delta.text;
      }
    }

    tweetText = tweetText.trim();

    // Enforce hard 280-char limit
    if (tweetText.length > 280) {
      tweetText = tweetText.substring(0, 277) + '...';
    }

    console.log(`[claudeService] Generated tweet (${tweetText.length} chars) for "${topic}" [${archetype}]`);
    return tweetText;
  } catch (err) {
    console.error('[claudeService] generateTweet error:', err.message);
    // Fallback tweet so the pipeline continues
    return `Helping your child grow with Qulo — the AI voice companion for ages 4-10. ${topic}. #Qulo #KidsLearning #ParentingTips`;
  }
}

module.exports = { generateCarouselContent, generateTweet };
