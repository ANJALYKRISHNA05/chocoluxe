const mongoose = require("mongoose");
const { Schema } = mongoose;

const categorySchema = new Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    image: {
        type: String,
        required: false,
        default: null
    },
    isListed: {
        type: Boolean,
        default: true
    },
    categoryOffer: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    }
}, { timestamps: true });

const Category = mongoose.model("Category", categorySchema);
module.exports = Category;