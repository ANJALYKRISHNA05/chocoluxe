// models/cartSchema.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const cartSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  items: [
    {
      product: {
        type: Schema.Types.ObjectId,
        ref: "Product",
        required: true
      },
      flavor: {
        type: String,
        required: true,
        enum: ["Almond", "Caramel", "Peanut"]
      },
      sugarLevel: {
        type: String,
        required: true,
        enum: ["Low", "Medium", "Sugar-Free"]
      },
      weight: {
        type: Number,
        required: true,
        enum: [50, 100, 200]
      },
      quantity: {
        type: Number,
        required: true,
        min: 1
      },
      price: {
        type: Number,
        required: true,
        min: 0
      },
      discount: {
        type: Number,
        default: 0,
        min: 0
      },
      productImage: {
        type: String,
        required: true
      }
    }
  ]
}, { timestamps: true });



const Cart = mongoose.model("Cart", cartSchema);
module.exports = Cart;
