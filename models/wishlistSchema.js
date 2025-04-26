
const mongoose = require("mongoose");
const { Schema } = mongoose;

const wishlistSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  products: [{
    type: Schema.Types.ObjectId,
    ref: "Product"
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Wishlist = mongoose.model("Wishlist", wishlistSchema);
module.exports = Wishlist;