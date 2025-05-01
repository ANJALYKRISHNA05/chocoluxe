const mongoose = require("mongoose");
const { Schema } = mongoose;

const wishlistSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  items: [{
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },
    variantId: {
      type: Schema.Types.ObjectId,
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, { timestamps: true });

wishlistSchema.index({ user: 1 });
wishlistSchema.index({ 'items.product': 1, 'items.variantId': 1 });

wishlistSchema.pre('save', async function (next) {
  try {
    for (const item of this.items) {
      const product = await mongoose.model('Product').findById(item.product);
      if (!product || !product.variants.some(v => v._id.toString() === item.variantId.toString())) {
        return next(new Error('Invalid product or variant'));
      }
    }
    next();
  } catch (error) {
    next(error);
  }
});

const Wishlist = mongoose.model("Wishlist", wishlistSchema);
module.exports = Wishlist;