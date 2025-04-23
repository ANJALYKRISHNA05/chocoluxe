const express = require('express');
const router = express.Router();
const { productStorage } = require('../config/cloudinary');
const multer = require('multer');
const upload = multer({ storage: productStorage });

router.post('/upload', upload.any(), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }
    const imageUrls = req.files.map(file => file.path);
    res.json({ success: true, imageUrls });
  } catch (error) {
    console.error('Error uploading images:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;