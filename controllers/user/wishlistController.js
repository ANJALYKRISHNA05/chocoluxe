const Wishlist = require("../../models/wishlistSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");

exports.addToWishlist = async (req, res) => {
  try {
    const { productId, variantId } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Please log in to add items to wishlist",
      });
    }

    const product = await Product.findById(productId).populate("category");
    if (!product || product.isBlocked) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    if (!product.category || !product.category.isListed) {
      return res.status(400).json({
        success: false,
        message: "Product category is unavailable",
      });
    }

    const variant = product.variants.find(
      (v) => v._id.toString() === variantId
    );
    if (!variant) {
      return res.status(400).json({
        success: false,
        message: "Invalid variant",
      });
    }

    let wishlist = await Wishlist.findOne({ user: userId });
    if (!wishlist) {
      wishlist = new Wishlist({ user: userId, items: [] });
    }

    const itemExists = wishlist.items.some(
      (item) => item.product.toString() === productId && item.sku === variant.sku
    );
    if (itemExists) {
      return res.status(400).json({
        success: false,
        message: "Product already in wishlist",
      });
    }

    wishlist.items.push({
      product: productId,
      sku: variant.sku,
      productImage: variant.productImage[0],
    });

    await wishlist.save();
    const itemCount = wishlist.items.length;

    res.json({
      success: true,
      message: "Product added to wishlist",
      itemCount,
    });
  } catch (error) {
    console.error("Error adding to wishlist:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};



exports.loadWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect("/user/login");
    }

    const wishlist = await Wishlist.findOne({ user: userId }).populate({
      path: "items.product",
      populate: {
        path: "category",
        model: "Category",
      },
    });

    let wishlistItems = [];
    let hasInvalidItems = false;

    if (wishlist && wishlist.items.length > 0) {
      wishlistItems = wishlist.items.map((item) => {
        const product = item.product;
        let errorMessage = null;

        if (!product) {
          errorMessage = "Product not found";
          hasInvalidItems = true;
        } else if (product.isBlocked) {
          errorMessage = "Product is no longer available";
          hasInvalidItems = true;
        } else if (!product.category || !product.category.isListed) {
          errorMessage = "Product category is unavailable";
          hasInvalidItems = true;
        }

        const variant = product?.variants.find((v) => v.sku === item.sku);

        let effectiveOffer = 0;
        let basePrice = 0;
        let offerPrice = 0;
        let itemSavings = 0;

        if (variant && !errorMessage) {
          const productOffer = variant.productOffer || 0;
          const categoryOffer = product.category?.categoryOffer || 0;
          effectiveOffer = Math.max(productOffer, categoryOffer);

          
          basePrice = variant.salePrice && variant.salePrice < variant.regularPrice && variant.salePrice > 0
            ? variant.salePrice
            : variant.regularPrice;

          // Calculate the offer price after applying the effective offer
          offerPrice = effectiveOffer > 0 ? basePrice * (1 - effectiveOffer / 100) : basePrice;

          // Calculate the savings (difference between base price and offer price)
          itemSavings = basePrice - offerPrice;
        }

        return {
          ...item.toObject(),
          product,
          variant,
          errorMessage,
          effectiveOffer,
          basePrice,
          offerPrice: offerPrice || 0,
          itemSavings: itemSavings || 0,
        };
      });

      await wishlist.save();
    }

    res.render("user/wishlist", {
      wishlistItems,
      user: req.session.user || null,
      title: "Your Wishlist",
      hasInvalidItems,
    });
  } catch (error) {
    console.error("Error loading wishlist:", error);
    res.redirect("/user/pageNotfound");
  }
};

exports.removeFromWishlist = async (req, res) => {
  try {
    const { itemId } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Please log in" });
    }

    if (!itemId) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid item ID" });
    }

    const wishlist = await Wishlist.findOne({ user: userId });
    if (!wishlist) {
      return res
        .status(404)
        .json({ success: false, message: "Wishlist not found" });
    }

    const itemIndex = wishlist.items.findIndex(
      (item) => item._id.toString() === itemId
    );
    if (itemIndex === -1) {
      return res
        .status(404)
        .json({ success: false, message: "Item not found in wishlist" });
    }

    wishlist.items.splice(itemIndex, 1);
    await wishlist.save();

    const itemCount = wishlist.items.length;

    res.json({
      success: true,
      message: "Item removed from wishlist",
      itemCount,
    });
  } catch (error) {
    console.error("Error removing item from wishlist:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getWishlistItemCount = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Please log in" });
    }

    const wishlist = await Wishlist.findOne({ user: userId });
    const itemCount = wishlist ? wishlist.items.length : 0;

    res.json({ success: true, itemCount });
  } catch (error) {
    console.error("Error fetching wishlist item count:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};