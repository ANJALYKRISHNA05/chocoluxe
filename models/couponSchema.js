const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
      required: true,
    },
    discountAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    minPurchase: {
      type: Number,
      required: true,
      default: 0,
    },
    maxDiscount: {
      type: Number,
      default: null,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    usageLimit: {
      type: Number,
      default: 1,
    },
    usedCount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    usedBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        usedAt: {
          type: Date,
          default: Date.now,
        },
        orderCompleted: {
          type: Boolean,
          default: false,
        },
        orderId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Order",
          default: null,
        },
      },
    ],
  },
  { timestamps: true },
);

module.exports = mongoose.model("Coupon", couponSchema);