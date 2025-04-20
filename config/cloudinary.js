require('dotenv').config();

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

const categoryStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'category_images', 
      allowed_formats: ['jpg', 'jpeg', 'png','webp', 'svg'],
      transformation: [{ width: 500, height: 500, crop: 'limit' }]
    }
  });
module.exports = {
  cloudinary,
  categoryStorage,
};
