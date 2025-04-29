const mongoose = require('mongoose');
const { Schema } = mongoose;

const wishlistSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [
    {
      product: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true
      },
      addedAt: {
        type: Date,
        default: Date.now
      }
    }
  ]
}, { timestamps: true });

// Create a unique compound index to prevent duplicate products in a user's wishlist
wishlistSchema.index({ user: 1, 'items.product': 1 }, { unique: true });

const Wishlist = mongoose.model('Wishlist', wishlistSchema);
module.exports = Wishlist;