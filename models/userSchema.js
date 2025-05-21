const mongoose = require("mongoose");
const { Schema } = mongoose;
const crypto = require("crypto");

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  phone: {
    type: String,
    sparse: true,
    required: false,
    unique: false,
    default: null,
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true,
  },
  password: {
    type: String,
    required: function () {
      return !this.googleId;
    },
  },
  profileImage: {
    type: String,
    default: "/Images/default-profile.jpg",
  },
  referralCode: {
    type: String,
    unique: true,
    sparse: true,
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  isBlocked: {
    type: Boolean,
    default: false,
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
  addresses: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Address",
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});


userSchema.pre("save", async function (next) {
  if (this.isNew && !this.referralCode) {
    let isUnique = false;
    let referralCode;
    while (!isUnique) {
      referralCode = crypto.randomBytes(4).toString("hex").toUpperCase();
      const existingUser = await mongoose.model("User").findOne({ referralCode });
      if (!existingUser) {
        isUnique = true;
      }
    }
    this.referralCode = referralCode;
  }
  next();
});

const User = mongoose.model("User", userSchema);

module.exports = User;