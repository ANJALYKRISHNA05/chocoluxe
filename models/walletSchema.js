const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    balance: {
      type: Number,
      default: 0,
    },
    transactions: [
      {
        createdAt: {
          type: Date,
          default: Date.now,
        },
        transactionType: {
          type: String,
          enum: ["credit", "debit"],
        },
        transactionAmount: Number,
        description: {
          type: String,
          default: ""
        }
      },
    ],
  },
  { timestamps: true },
);

const Wallet = mongoose.model("Wallet", walletSchema);
module.exports = Wallet;