const mongoose = require("mongoose");
const { Schema } = mongoose;

const productSchema = new Schema(
  {
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    variants: [
      {
        sku: {
          type: String,
          unique: true,
        },
        flavor: {
          type: String,
          required: true,
          enum: ["Almond", "Caramel", "Peanut"],
        },
        sugarLevel: {
          type: String,
          required: true,
          enum: ["Low", "Medium", "Sugar-Free"],
        },
        weight: {
          type: Number,
          required: true,
          enum: [50, 100, 200],
        },
        stock_quantity: {
          type: Number,
          required: true,
          min: 0,
        },
        regularPrice: {
          type: Number,
          required: true,
          min: 0,
        },
        salePrice: {
          type: Number,
          required: true,
          min: 0,
        },
        productImage: [
          {
            type: String,
            required: true,
          },
        ],
      },
    ],
    isBlocked: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);


productSchema.pre("save", function (next) {
  this.variants.forEach((variant) => {
    if (!variant.sku) {
      const { productName } = this;
      const { flavor, sugarLevel, weight } = variant;

      
      const namePrefix = productName.replace(/\s+/g, "").slice(0, 3);
      const flavorPrefix = flavor.replace(/\s+/g, "").slice(0, 3);
      const sugarPrefix = sugarLevel.replace(/\s+/g, "").slice(0, 3);

    
      variant.sku = `${namePrefix}-${flavorPrefix}-${sugarPrefix}-${weight}`
        .toUpperCase()
        .replace(/\s+/g, "-");
    }
  });
  next();
});

productSchema.index({ "variants.sku": 1 });

const Product = mongoose.model("Product", productSchema);
module.exports = Product;