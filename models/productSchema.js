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
    
    flavor: {
        type: String,
        required: true,
        trim: true
    },
    sugarLevel: {
        type: Number,
        required: true,
        min: 0,
        max: 100
    },

   weight:[{weight:Number,stock_quantity:Number}],
    productImage: [
        {
          type: String,
          required: true,
        },
      ],
    isBlocked: {
        type: Boolean,
        default: false
    },

}, { timestamps: true });

const Product = mongoose.model("Product", productSchema);
module.exports = Product;