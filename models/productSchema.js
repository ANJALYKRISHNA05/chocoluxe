const mongoose = require("mongoose");
const { Schema } = mongoose;

const productSchema = new Schema({
  productName: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: Schema.Types.ObjectId,
    ref: "Category",
    required: true
  },
  variants: [
    {
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
      stock_quantity: {
        type: Number,
        required: true,
        min: 0
      },
      regularPrice: {
        type: Number,
        required: true,
        min: 0
      },
      salePrice: {
        type: Number,
        required: true,
        min: 0
      },
      productImage: [
        {
          type: String,
          required: true
        }
      ]
    }
  ],
  isBlocked: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

const Product = mongoose.model("Product", productSchema);
module.exports = Product;