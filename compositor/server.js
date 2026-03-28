require('dotenv').config();

const express = require('express');
const { composeSlide } = require('./src/services/imageComposite');

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT_COMPOSITOR || process.env.PORT || 3000;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'qulo-compositor', timestamp: new Date().toISOString() });
});

// Compose a single carousel slide
app.post('/compose/carousel', async (req, res) => {
  const { imageUrl, caption, slideNumber, totalSlides, brandColor } = req.body;

  if (!imageUrl || !caption) {
    return res.status(400).json({ error: 'imageUrl and caption are required' });
  }

  try {
    console.log(`[compositor] Composing slide ${slideNumber}/${totalSlides}: "${caption.substring(0, 40)}..."`);

    const buffer = await composeSlide({
      imageUrl,
      caption,
      slideNumber: slideNumber || 1,
      totalSlides: totalSlides || 1,
      brandColor: brandColor || '#6C63FF',
    });

    res.set('Content-Type', 'image/png');
    res.set('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error('[compositor] Error composing slide:', err.message);
    res.status(500).json({ error: 'Failed to compose slide', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[compositor] Service running on port ${PORT}`);
});

module.exports = app;
