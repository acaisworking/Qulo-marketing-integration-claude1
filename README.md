Qulo Marketing Automation System

Instructions for Claude Code: Read this entire README before writing any code. Build every file listed in the structure below, in the order specified. Do not skip any file. After building, verify each service starts correctly.


What This System Does
Automated TikTok carousel and X/Twitter content pipeline for Qulo — an AI voice companion app for children aged 4–10.
Daily output:

3 TikTok carousels pushed to drafts (generated at 08:00 Dubai time)
3 X/Twitter tweets auto-posted (08:00, 13:00, 19:00 Dubai time)

Pipeline per carousel:

Claude API generates 6 slide captions + image prompts + post caption (structured JSON)
DALL-E 3 generates 6 clean images (no text, 1024×1792)
Cloudinary re-hosts images (DALL-E URLs expire in 1hr)
Sharp compositor overlays captions onto images → outputs 6 finished PNGs
TikTok Content Posting API pushes carousel to drafts
Airtable logs everything

Pipeline per tweet:

Claude API generates tweet based on topic + archetype rotation
X API v2 posts immediately
Airtable logs tweet ID + status


Tech Stack
LayerToolRuntimeNode.js 20Orchestrationn8n (self-hosted on Railway)Content generationAnthropic Claude API (claude-sonnet-4-5-20251001)Image generationOpenAI DALL-E 3Image storageCloudinary (free tier)Image compositorSharp (Node.js library)DistributionX API v2 + TikTok Content Posting APIContent logAirtableHostingRailway (3 services)

Repository Structure
Build every file listed below. Do not deviate from this structure.
qulo-marketing/
├── compositor/
│   ├── src/
│   │   ├── index.js
│   │   ├── renderer.js
│   │   └── fonts.js
│   ├── assets/
│   │   └── cta-background.jpg        ← copy from root cta-background.png
│   ├── fonts/
│   │   └── Poppins-Bold.ttf          ← download from Google Fonts
│   ├── package.json
│   ├── Dockerfile
│   └── .env.example
├── scheduler/
│   ├── src/
│   │   ├── index.js
│   │   ├── carousel.js
│   │   ├── twitter.js
│   │   ├── claude.js
│   │   ├── dalle.js
│   │   ├── cloudinary.js
│   │   ├── tiktok.js
│   │   ├── airtable.js
│   │   └── topics.js
│   ├── package.json
│   ├── Dockerfile
│   └── .env.example
├── n8n/
│   └── workflow.json
├── .env.example
├── .gitignore
└── README.md

Environment Variables
Root .env.example
# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI
OPENAI_API_KEY=sk-...

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Airtable
AIRTABLE_TOKEN=pat...
AIRTABLE_BASE_ID=app...
AIRTABLE_TOPIC_TABLE_ID=tbl...
AIRTABLE_CAROUSEL_LOG_TABLE_ID=tbl...
AIRTABLE_X_LOG_TABLE_ID=tbl...

# X / Twitter
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_SECRET=

# TikTok
TIKTOK_ACCESS_TOKEN=

# Compositor service URL (internal Railway URL)
COMPOSITOR_URL=http://compositor.railway.internal:3000

# Timezone
TZ=Asia/Dubai

File Specifications
Build each file exactly as specified below.

compositor/package.json
json{
  "name": "qulo-compositor",
  "version": "1.0.0",
  "description": "Sharp-based image compositor for Qulo carousels",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "sharp": "^0.33.2",
    "axios": "^1.6.7",
    "dotenv": "^16.4.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.3"
  }
}

compositor/Dockerfile
dockerfileFROM node:20-alpine
RUN apk add --no-cache vips-dev fftw-dev build-base python3
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "src/index.js"]

compositor/src/index.js
Express server that accepts POST requests and returns finished PNG URLs.
Endpoint: POST /render
Request body:
json{
  "slideNum": 1,
  "imageUrl": "https://cloudinary.com/...",
  "caption": "5 ways to make your child smarter",
  "variant": "top",
  "slideType": "hook"
}

slideNum: 1–6
imageUrl: Cloudinary URL of the DALL-E image
caption: text to overlay
variant: "top" or "center" (A/B test variant)
slideType: "hook" | "middle" | "cta"

Response:
json{
  "success": true,
  "pngBase64": "data:image/png;base64,..."
}
For slideType: "cta", ignore imageUrl and use the local assets/cta-background.jpg as the background instead.
Add a GET /health endpoint that returns { "status": "ok" }.

compositor/src/renderer.js
Sharp-based compositor. Build the following function:
javascriptasync function renderSlide({ imageUrl, caption, variant, slideType })
Canvas size: 1080 × 1920 (9:16 portrait)
Layer order (bottom to top):
Layer 1 — Background:

If slideType === 'cta': load from assets/cta-background.jpg, resize to 1080×1920 (cover fit)
Otherwise: fetch image from imageUrl using axios, pipe to Sharp, resize to 1080×1920 (cover fit)

Layer 2 — Scrim rectangle:

A semi-transparent dark overlay
If variant === 'top': position top of canvas, height 460px
If variant === 'center': position centered vertically (y: 680), height 560px
Color: rgba(0, 0, 0, 0.52)
Implement using Sharp's composite with an SVG rectangle overlay

Layer 3 — Caption text:

Font: Poppins Bold (load from fonts/Poppins-Bold.ttf)
Color: #FFFFFF
If variant === 'top': position y: 80, text area height 360px
If variant === 'center': position y: 700, text area height 460px
X padding: 72px from each side (text width: 936px)
Font size: 72px for hook, 62px for middle, 60px for cta
Line height: 1.35
Max 3 lines — truncate with ellipsis if longer
Implement text rendering using Sharp SVG composite overlay
Text must word-wrap within the 936px width

Output: PNG buffer (return as base64 string)
Important Sharp notes:

Use sharp().composite([]) to layer elements
SVG overlays must have xmlns="http://www.w3.org/2000/svg"
For text rendering, use SVG <text> elements with <tspan> for line breaks
Calculate word wrap in JavaScript before generating SVG
Always use await — Sharp operations are async


compositor/src/fonts.js
Helper that returns the absolute path to Poppins-Bold.ttf for use in SVG font embedding. Export a function getFontBase64() that reads the font file and returns it as a base64 data URI for embedding in SVG text elements.

scheduler/package.json
json{
  "name": "qulo-scheduler",
  "version": "1.0.0",
  "description": "Qulo content pipeline scheduler",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  },
  "dependencies": {
    "node-cron": "^3.0.3",
    "@anthropic-ai/sdk": "^0.20.1",
    "openai": "^4.28.0",
    "cloudinary": "^2.0.3",
    "airtable": "^0.12.2",
    "twitter-api-v2": "^1.17.0",
    "axios": "^1.6.7",
    "dotenv": "^16.4.1",
    "winston": "^3.11.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.3"
  }
}

scheduler/Dockerfile
dockerfileFROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
CMD ["node", "src/index.js"]

scheduler/src/index.js
Main entry point. Sets up cron jobs using node-cron.
Cron schedule (Dubai time — UTC+4):
javascript// Carousel batch — 08:00 Dubai = 04:00 UTC
cron.schedule('0 4 * * *', runCarouselBatch)

// Tweet 1 — 08:00 Dubai = 04:00 UTC (runs after carousel)
cron.schedule('30 4 * * *', () => runTweet('morning'))

// Tweet 2 — 13:00 Dubai = 09:00 UTC
cron.schedule('0 9 * * *', () => runTweet('afternoon'))

// Tweet 3 — 19:00 Dubai = 15:00 UTC
cron.schedule('0 15 * * *', () => runTweet('evening'))
Log every cron trigger with timestamp using winston.
Export runCarouselBatch and runTweet so they can be triggered manually via HTTP for testing.
Add a simple Express server on port 3001 with:

GET /health → { status: 'ok', nextRun: '...' }
POST /trigger/carousel → manually trigger carousel batch
POST /trigger/tweet → manually trigger a tweet


scheduler/src/claude.js
Anthropic API wrapper. Build two functions:
1. generateCarouselContent(topic, carouselIndex)
Calls Claude API with this system prompt:
You are a TikTok carousel content writer for Qulo, an AI voice companion for children aged 4-10. Write for parents aged 25-40.

Output ONLY valid JSON. No markdown, no explanation, no code fences.

Schema:
{
  "slides": [
    {
      "slideNum": 1,
      "caption": "max 10 words, punchy, no period at end",
      "slideType": "hook",
      "imagePrompt": "detailed DALL-E 3 prompt, 9:16 vertical portrait, photorealistic OR abstract OR illustrated OR minimal, absolutely no text no words no letters anywhere in the image"
    }
  ],
  "postCaption": "2-3 sentence TikTok caption, max 3 hashtags, ends with soft Qulo mention"
}

Rules:
- 6 slides total
- Slide 1: slideType "hook" — bold claim, stat, or question
- Slides 2-5: slideType "middle" — one actionable tip each, max 10 words
- Slide 6: slideType "cta" — soft Qulo recommendation, natural, no hype, no exclamation marks
- Rotate image styles: slide 1 realistic, slide 2 abstract, slide 3 illustrated, slide 4 minimal, slide 5 realistic, slide 6 is always CTA (no imagePrompt needed)
- imagePrompt: specific, vivid, no text in image, 9:16 vertical portrait
- postCaption: warm parenting tone, Qulo mentioned as "Qulo — an AI voice companion for kids (4-10)" only on first mention
- Never invent statistics. Never cite fake studies. Keep claims general and truthful.
User message: Topic: ${topic}
Model: claude-sonnet-4-5-20251001
Max tokens: 1200
Parse the JSON response. If parsing fails, retry once. If retry fails, throw error.
2. generateTweet(topic, archetype, timeOfDay)
Archetypes rotate: ['stat_hook', 'question_hook', 'myth_bust', 'list_tips', 'story', 'qulo_soft']
System prompt:
You are a sharp, science-literate content writer for Qulo — an AI voice companion app for children aged 4-10. Write X/Twitter posts for parents aged 25-40.

VOICE: Direct, warm, slightly contrarian. Cite science casually not academically. No fluff. Max 2 hashtags. No emoji unless critical.

QULO RULES: Qulo is NEVER the lead. It appears only at the end, only when the archetype is "qulo_soft", as one casual sentence. Never say "download now". Never use exclamation marks for Qulo mentions.

ARCHETYPE: ${archetype}
- stat_hook: Open with a shocking research number. Unpack in 2-3 sentences. No Qulo.
- question_hook: Pattern-interrupt question for parents. Under 220 chars. No Qulo.
- myth_bust: Bust a common parenting belief with science. 2-3 sentences. No Qulo.
- list_tips: 3 quick tips. Can end with "PS: Qulo (AI voice companion, 4-10 yrs) is worth a look." Keep PS casual.
- story: Cinematic 1-2 sentence opener then insight. Under 280 chars. No Qulo.
- qulo_soft: Write about the PROBLEM. Last sentence mentions Qulo as practical solution — one sentence, zero hype.

OUTPUT: Just the tweet text. No intro, no explanation. If thread, separate tweets with blank line and prefix 1/ 2/ etc.
User message: Topic: ${topic}\nTime of day: ${timeOfDay}
Model: claude-sonnet-4-5-20251001
Max tokens: 400
Return the raw text string.

scheduler/src/dalle.js
OpenAI DALL-E 3 wrapper.
Function: generateImage(prompt)

Model: dall-e-3
Size: 1024x1792
Quality: standard
n: 1
Add to every prompt automatically: " Absolutely no text, no words, no letters, no numbers anywhere in the image. 9:16 vertical portrait orientation."
Return the image URL string
Log the prompt and returned URL
On error, retry once after 5 seconds

Function: generateSlideImages(slides)

Takes the slides array from Claude output
Skips slide 6 (CTA — uses static background)
Runs all 5 image generations in parallel using Promise.all
Returns array of URLs indexed by slideNum


scheduler/src/cloudinary.js
Cloudinary wrapper for re-hosting DALL-E images.
Function: uploadFromUrl(imageUrl, publicId)

Uploads image from URL to Cloudinary
Folder: qulo-carousels
Public ID: slide-${Date.now()}-${publicId}
Returns permanent Cloudinary URL
DALL-E URLs expire in 1 hour — this must run immediately after DALL-E generation

Function: uploadBatch(urlArray)

Takes array of DALL-E URLs
Uploads all in parallel
Returns array of permanent Cloudinary URLs in same order


scheduler/src/carousel.js
Main carousel pipeline. This is the core orchestration file.
Function: runCarouselBatch()
Runs 3 carousels sequentially (not parallel — avoid rate limits).
For each carousel (index 0, 1, 2):

Call airtable.getNextTopic() → get unused topic
Call claude.generateCarouselContent(topic, index) → get slides + postCaption
Call dalle.generateSlideImages(slides) → get 5 DALL-E URLs
Call cloudinary.uploadBatch(urls) → get 5 permanent URLs
Determine variant: index 0 → 'top', index 1 → 'center', index 2 → 'top' (A/B rotation)
For each of 6 slides, call compositor service:

   POST ${COMPOSITOR_URL}/render
   {
     slideNum, 
     imageUrl: cloudinaryUrl (null for slide 6),
     caption: slide.caption,
     variant,
     slideType: slide.slideType
   }
Collect 6 base64 PNG responses
7. Upload each finished PNG to Cloudinary (folder: qulo-finished)
8. Call tiktok.pushToDrafts(finishedUrls, postCaption)
9. Call airtable.logCarousel({ topic, slides, finishedUrls, postCaption, variant, tiktokResult })
10. Call airtable.markTopicUsed(topicId)
11. Log success with carousel index and topic
12. Wait 30 seconds before next carousel
On any error: log full error, log to Airtable with status 'failed', continue to next carousel.

scheduler/src/twitter.js
X API v2 wrapper using twitter-api-v2.
Function: runTweet(timeOfDay)

Call airtable.getNextTopic('twitter') → get topic
Determine archetype from rotation (cycle through 6 archetypes, tracked in Airtable)
Call claude.generateTweet(topic, archetype, timeOfDay)
Post to X:

If single tweet (under 280 chars): post directly
If thread (contains 1/ prefix): split by blank line, post as reply chain (post tweet 1, get ID, reply to it for tweet 2, etc.)


Call airtable.logTweet({ topic, archetype, tweetText, tweetId, timeOfDay })
Call airtable.markTopicUsed(topicId, 'twitter')


scheduler/src/tiktok.js
TikTok Content Posting API wrapper.
Function: pushToDrafts(imageUrls, caption)
POST to https://open.tiktokapis.com/v2/post/publish/content/init/
Headers:
Authorization: Bearer ${TIKTOK_ACCESS_TOKEN}
Content-Type: application/json; charset=UTF-8
Body:
json{
  "post_info": {
    "title": "<caption truncated to 150 chars>",
    "privacy_level": "SELF_ONLY",
    "disable_duet": false,
    "disable_comment": false,
    "disable_stitch": false
  },
  "source_info": {
    "source": "PULL_FROM_URL",
    "photo_cover_index": 0,
    "photo_images": ["<url1>", "<url2>", "...6 urls"]
  },
  "post_mode": "MEDIA_UPLOAD",
  "media_type": "PHOTO"
}
Return { success: true, publishId: data.data.publish_id } on success.
On error: log full response, return { success: false, error: message }.

scheduler/src/airtable.js
Airtable wrapper. All table IDs come from environment variables.
Functions to implement:
getNextTopic(platform = 'tiktok')

Queries Topic Bank table
Filter: Status = 'Active' AND (Last Used Date is empty OR Last Used Date < 30 days ago)
Filter by Platform = platform or 'Both'
Returns random record from results (not always the first — shuffle)
Returns { id, topic } object

markTopicUsed(recordId)

PATCHes the topic record
Sets Last Used Date to today
Increments Use Count by 1

logCarousel({ topic, slides, finishedUrls, postCaption, variant, tiktokResult })

Creates new record in Carousel Log table
Fields: Date (today), Topic (topic string), Slide 1-6 URLs, Post Caption, Variant Used, TikTok Status ('Drafted' or 'Failed'), TikTok Publish ID

logTweet({ topic, archetype, tweetText, tweetId, timeOfDay })

Creates new record in X Log table
Fields: Date, Topic, Archetype, Tweet Text, Tweet ID, Status ('Posted'), Time Of Day

getArchetypeIndex()

Reads last tweet from X Log
Returns next archetype index (cycles 0–5)


scheduler/src/topics.js
Fallback topic bank — used if Airtable returns empty results.
Export an array of 50 topics covering:

Science of child development
Parenting habits and routines
Emotional intelligence for kids
Screen time and focus
Sleep and brain development
Curiosity and learning
Reading habits
Confidence building
Morning and bedtime routines
Communication between parent and child

Each topic should be a short string suitable for passing to Claude as carousel/tweet topic.

n8n/workflow.json
Create a valid n8n workflow JSON that:

Has a Manual Trigger node
Has an HTTP Request node that calls POST ${COMPOSITOR_URL}/trigger/carousel
Has an HTTP Request node that calls POST ${COMPOSITOR_URL}/trigger/tweet
Has a Schedule Trigger node matching the cron times above
Has basic error handling (IF node checking response status)
Is importable via n8n UI → Import from JSON

This is a backup visual layer — the scheduler handles primary execution.

.gitignore
node_modules/
.env
*.env.local
dist/
.DS_Store
*.log
logs/

Airtable Schema
Table 1: Topic Bank
FieldTypeOptionsTopicSingle line textPlatformSingle selectTikTok, X, BothLast Used DateDateUse CountNumberDefault 0StatusSingle selectActive, Paused, Retired
Seed with at least 30 topics from the topics.js fallback bank.
Table 2: Carousel Log
FieldTypeCarousel IDAutonumberDateDateTopicSingle line textSlide 1 URLURLSlide 2 URLURLSlide 3 URLURLSlide 4 URLURLSlide 5 URLURLSlide 6 URLURLPost CaptionLong textTikTok StatusSingle select: Pending, Drafted, Published, FailedTikTok Publish IDSingle line textVariant UsedSingle select: top, centerCost EstimateCurrency
Table 3: X Log
FieldTypeTweet IDSingle line textDateDateTopicSingle line textTweet TextLong textArchetypeSingle select: stat_hook, question_hook, myth_bust, list_tips, story, qulo_softStatusSingle select: Posted, FailedTime Of DaySingle select: morning, afternoon, evening

Railway Deployment
Service 1: compositor

Root directory: /compositor
Build command: npm install
Start command: npm start
Port: 3000
Environment variables: COMPOSITOR_URL (not needed for this service)

Service 2: scheduler

Root directory: /scheduler
Build command: npm install
Start command: npm start
Port: 3001
All environment variables required

Service 3: n8n

Use Railway's n8n template directly from Railway marketplace
Or deploy from Docker image: n8nio/n8n:latest
Port: 5678
Environment variable: N8N_BASIC_AUTH_ACTIVE=true, N8N_BASIC_AUTH_USER, N8N_BASIC_AUTH_PASSWORD


Build Order for Claude Code
Execute in this exact order:

Create root .gitignore and .env.example
Build compositor/ service completely — all files
Download Poppins-Bold.ttf from Google Fonts CDN and save to compositor/fonts/
Copy CTA background image to compositor/assets/cta-background.jpg
Build scheduler/ service completely — all files
Build n8n/workflow.json
Update root README.md with setup instructions
Run npm install in both compositor/ and scheduler/
Verify compositor starts: cd compositor && npm start — should see "Compositor running on port 3000"
Verify scheduler starts: cd scheduler && npm start — should see cron jobs registered


Testing
After build, test each component:
Test compositor:
bashcurl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{
    "slideNum": 1,
    "imageUrl": "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=1080",
    "caption": "5 ways to make your child smarter",
    "variant": "top",
    "slideType": "hook"
  }'
Expected: JSON response with pngBase64 field containing a valid base64 PNG.
Test CTA slide (static background):
bashcurl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{
    "slideNum": 6,
    "imageUrl": null,
    "caption": "Your child can practice this daily with Qulo",
    "variant": "top",
    "slideType": "cta"
  }'
Expected: JSON with base64 PNG using the Qulo app screenshot as background.
Test scheduler health:
bashcurl http://localhost:3001/health
Expected: { "status": "ok" }
Manually trigger one carousel:
bashcurl -X POST http://localhost:3001/trigger/carousel
Expected: Pipeline runs, logs to console, check Airtable for new record.

Notes for Claude Code

Never commit .env files — only .env.example
The cta-background.jpg asset must be included in the compositor Docker image — add it to the Dockerfile COPY step
Sharp must be installed with the correct native binaries for the Alpine Linux Docker image — use npm install --platform=linux --arch=x64 sharp in the Dockerfile
All API keys come from environment variables only — never hardcode
Winston logger should write to both console and logs/ directory
The compositor service must be always-on (Railway will keep it running) — the scheduler can sleep between cron triggers
Use process.env.TZ = 'Asia/Dubai' at the top of scheduler/src/index.js to ensure correct timezone for cron
Airtable API rate limit: 5 requests/second — add 200ms delay between batch operations
If TikTok access token is missing or expired, log the error and save carousel PNGs to Cloudinary with status 'Pending' in Airtable — do not crash the pipeline
