require('dotenv').config();
const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(fileUpload());
app.use('/uploads', express.static('uploads'));

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Simple file upload endpoint
app.post('/api/upload', async (req, res) => {
  try {
    if (!req.files || !req.files.image) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const image = req.files.image;
    const timestamp = Date.now();
    const uploadPath = path.join(__dirname, 'uploads', `${timestamp}-${image.name}`);
    const resultPath = path.join(__dirname, 'uploads', `result-${timestamp}-${image.name}`);

    // Save the uploaded file
    await image.mv(uploadPath);

    // For now, just copy the image as a placeholder
    await sharp(uploadPath).toFile(resultPath);

    res.json({
      success: true,
      original: `/uploads/${path.basename(uploadPath)}`,
      result: `/uploads/${path.basename(resultPath)}`
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Server error during image processing' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Upload endpoint: POST http://localhost:3001/api/upload');
});
