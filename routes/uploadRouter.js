const express = require('express');
const router = express.Router();
const { categoryStorage } = require('../config/cloudinary');
const multer = require('multer');
const upload = multer({ storage: categoryStorage });

router.post('/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    res.json({ success: true, imageUrl: req.file.path });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;