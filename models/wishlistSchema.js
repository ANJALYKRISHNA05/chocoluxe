const mongoose = require("mongoose");
const { Schema } = mongoose;

const wishlistSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: [
      {
        product: {
          type: Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        sku: {
          type: String,
          required: true,
        },
        productImage: {
          type: String,
       
        },
      },
    ],
  },
  { timestamps: true }
);

const Wishlist = mongoose.model("Wishlist", wishlistSchema);
module.exports = Wishlist;