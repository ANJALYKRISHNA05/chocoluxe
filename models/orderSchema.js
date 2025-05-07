const mongoose = require("mongoose");
const { Schema } = mongoose;

const orderSchema = new Schema(
  {
    orderId: {
      type: String,
      unique: true,
      required: true,
    },
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
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        price: {
          type: Number,
          required: true,
        },
        subtotal: {
          type: Number,
          required: true,
        },
      },
    ],
    shippingAddress: {
      name: {
        type: String,
        required: true,
      },
      addressType: {
        type: String,
        enum: ["HOME", "WORK", "OTHER"],
        required: true,
      },
      address: {
        type: String,
        required: true,
      },
      city: {
        type: String,
        required: true,
      },
      state: {
        type: String,
        required: true,
      },
      pincode: {
        type: String,
        required: true,
      },
      phone: {
        type: String,
        required: true,
      },
    },
    subtotal: {
      type: Number,
      required: true,
    },
    discount: {
      type: Number,
      default: 0,
    },
    total: {
      type: Number,
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: ["Cash on Delivery"],
      required: true,
    },
    status: {
      type: String,
      enum: ["Pending", "Confirmed", "Shipped", "Delivered", "Cancelled", "Return Requested", "Returned"],
      default: "Pending",
    },
    returnReason: {
      type: String,
      required: false,
    },
    return: {
      requested: {
        type: Boolean,
        default: false,
      },
      reason: {
        type: String,
        required: false,
      },
      status: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending",
      },
      requestedAt: {
        type: Date,
        required: false,
      },
      processedAt: {
        type: Date,
        required: false,
      },
      rejectionReason: {
        type: String,
        required: false,
      },
    },
  },
  { timestamps: true }
);

// Pre-save hook as a fallback to generate a unique orderId
orderSchema.pre('save', async function(next) {
  try {
    if (this.isNew && !this.orderId) {
      const prefix = 'ORD';
      let unique = false;
      let attempt = 0;
      const maxAttempts = 10;

      while (!unique && attempt < maxAttempts) {
        const randomNum = Math.floor(100000 + Math.random() * 900000); // 6-digit random number
        const potentialOrderId = `${prefix}-${randomNum}`;
        
        const existingOrder = await mongoose.model("Order").findOne({ orderId: potentialOrderId });
        if (!existingOrder) {
          this.orderId = potentialOrderId;
          unique = true;
        }
        attempt++;
      }

      if (!unique) {
        throw new Error('Unable to generate a unique orderId after maximum attempts');
      }
    }
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model("Order", orderSchema);