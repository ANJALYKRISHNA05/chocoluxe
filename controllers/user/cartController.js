const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Wishlist = require("../../models/wishlistSchema");

exports.addToCart = async (req, res) => {
  try {
    const { productId, variantId, quantity } = req.body;
    const userId = req.session.user;
    const MAX_QUANTITY_PER_ITEM = 5;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Please log in to add items to cart",
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
    if (!variant || variant.stock_quantity < quantity) {
      return res.status(400).json({
        success: false,
        message: "Invalid variant or insufficient stock",
      });
    }

    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      cart = new Cart({ user: userId, items: [] });
    }

    const existingItemIndex = cart.items.findIndex(
      (item) => item.product.toString() === productId && item.sku === variant.sku
    );

    
    const productOffer = variant.productOffer || 0;
    const categoryOffer = product.category.categoryOffer || 0;
    const effectiveOffer = Math.max(productOffer, categoryOffer);
    const basePrice = variant.salePrice < variant.regularPrice && variant.salePrice > 0 ? variant.salePrice : variant.regularPrice;
    const offerPrice = effectiveOffer > 0 ? basePrice * (1 - effectiveOffer / 100) : basePrice;
    const originalPrice = basePrice; 

    if (existingItemIndex > -1) {
      const newQuantity = cart.items[existingItemIndex].quantity + quantity;
      if (newQuantity > MAX_QUANTITY_PER_ITEM) {
        return res.status(400).json({
          success: false,
          message: `Cannot add more than ${MAX_QUANTITY_PER_ITEM} units of this item to the cart`,
        });
      }
      cart.items[existingItemIndex].quantity = newQuantity;
      cart.items[existingItemIndex].price = offerPrice * newQuantity;
    } else {
      if (quantity > MAX_QUANTITY_PER_ITEM) {
        return res.status(400).json({
          success: false,
          message: `Cannot add more than ${MAX_QUANTITY_PER_ITEM} units of this item to the cart`,
        });
      }
      cart.items.push({
        product: productId,
        sku: variant.sku,
        quantity,
        price: offerPrice * quantity,
        productImage: variant.productImage[0],
      });
    }

    // Remove from wishlist if exists
    let wishlist = await Wishlist.findOne({ user: userId });
    if (wishlist) {
      const wishlistItemIndex = wishlist.items.findIndex(
        (item) => item.product.toString() === productId && item.sku === variant.sku
      );
      if (wishlistItemIndex > -1) {
        wishlist.items.splice(wishlistItemIndex, 1);
        await wishlist.save();
      }
    }

    await cart.save();

    // Recalculate cart totals and savings
    let cartTotal = 0;
    let totalSavings = 0;
    for (const item of cart.items) {
      const itemProduct = await Product.findById(item.product).populate("category");
      if (!itemProduct || itemProduct.isBlocked || !itemProduct.category || !itemProduct.category.isListed) continue;
      const itemVariant = itemProduct.variants.find((v) => v.sku === item.sku);
      if (!itemVariant) continue;
      const itemProductOffer = itemVariant.productOffer || 0;
      const itemCategoryOffer = itemProduct.category.categoryOffer || 0;
      const itemEffectiveOffer = Math.max(itemProductOffer, itemCategoryOffer);
      const itemBasePrice = itemVariant.salePrice < itemVariant.regularPrice && itemVariant.salePrice > 0 ? itemVariant.salePrice : itemVariant.regularPrice;
      const itemOfferPrice = itemEffectiveOffer > 0 ? itemBasePrice * (1 - itemEffectiveOffer / 100) : itemBasePrice;
      const itemOriginalPrice = itemBasePrice;
      cartTotal += itemOfferPrice * item.quantity;
      totalSavings += (itemOriginalPrice - itemOfferPrice) * item.quantity;
    }

    const itemCount = cart.items.length;

    res.json({
      success: true,
      message: "Product added to cart",
      itemCount,
      cartTotal,
      totalSavings,
    });
  } catch (error) {
    console.error("Error adding to cart:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.loadCart = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect("/user/login");
    }

    const cart = await Cart.findOne({ user: userId }).populate({
      path: "items.product",
      populate: {
        path: "category",
        model: "Category",
      },
    });
    let cartItems = [];
    let total = 0;
    let totalSavings = 0;
    let hasInvalidItems = false;

    if (cart && cart.items.length > 0) {
      cartItems = cart.items.map((item) => {
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
        let price = 0;
        let effectiveOffer = 0;
        let offerPrice = 0;
        let originalPrice = 0;
        let subtotal = 0;
        let savings = 0;

        if (variant && !errorMessage) {
          const productOffer = variant.productOffer || 0;
          const categoryOffer = product.category.categoryOffer || 0;
          effectiveOffer = Math.max(productOffer, categoryOffer);
          const basePrice = variant.salePrice < variant.regularPrice && variant.salePrice > 0 ? variant.salePrice : variant.regularPrice;
          offerPrice = effectiveOffer > 0 ? basePrice * (1 - effectiveOffer / 100) : basePrice;
          originalPrice = basePrice; // Price before the offer
          price = offerPrice;
          subtotal = price * item.quantity;
          savings = (originalPrice - offerPrice) * item.quantity;
          total += subtotal;
          totalSavings += savings;

          // Update the stored price in the cart item to reflect the offerPrice
          item.price = subtotal;
        }

        return {
          ...item.toObject(),
          product,
          variant,
          effectiveOffer,
          offerPrice,
          originalPrice,
          subtotal,
          savings,
          errorMessage,
        };
      });

      await cart.save();
    }

    res.render("user/cart", {
      cartItems,
      total,
      totalSavings,
      user: req.session.user || null,
      title: "Your Cart",
      hasInvalidItems,
    });
  } catch (error) {
    console.error("Error loading cart:", error);
    res.redirect("/user/pageNotfound");
  }
};

exports.updateCartQuantity = async (req, res) => {
  try {
    const { itemId, quantity } = req.body;
    const userId = req.session.user;
    const MAX_QUANTITY_PER_ITEM = 5;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Please log in" });
    }

    if (!itemId || quantity < 1) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid item ID or quantity" });
    }

    if (quantity > MAX_QUANTITY_PER_ITEM) {
      return res.status(400).json({
        success: false,
        message: `Cannot set more than ${MAX_QUANTITY_PER_ITEM} units of this item`,
      });
    }

    const cart = await Cart.findOne({ user: userId }).populate({
      path: "items.product",
      populate: {
        path: "category",
        model: "Category",
      },
    });
    if (!cart) {
      return res
        .status(404)
        .json({ success: false, message: "Cart not found" });
    }

    const item = cart.items.find((item) => item._id.toString() === itemId);
    if (!item) {
      return res
        .status(404)
        .json({ success: false, message: "Item not found in cart" });
    }

    const product = item.product;
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    if (product.isBlocked) {
      return res
        .status(400)
        .json({ success: false, message: "Product is no longer available" });
    }

    if (!product.category || !product.category.isListed) {
      return res.status(400).json({
        success: false,
        message: "Product category is unavailable",
      });
    }

    const variant = product.variants.find((v) => v.sku === item.sku);
    if (!variant) {
      return res
        .status(400)
        .json({ success: false, message: "Variant not found" });
    }

    if (quantity > variant.stock_quantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${variant.stock_quantity} items available in stock`,
      });
    }

    // Calculate the offer price
    const productOffer = variant.productOffer || 0;
    const categoryOffer = product.category.categoryOffer || 0;
    const effectiveOffer = Math.max(productOffer, categoryOffer);
    const basePrice = variant.salePrice < variant.regularPrice && variant.salePrice > 0 ? variant.salePrice : variant.regularPrice;
    const offerPrice = effectiveOffer > 0 ? basePrice * (1 - effectiveOffer / 100) : basePrice;
    const originalPrice = basePrice;

    item.quantity = quantity;
    item.price = offerPrice * quantity;
    await cart.save();

    // Recalculate cart totals and savings
    let cartTotal = 0;
    let totalSavings = 0;
    let itemCount = 0;
    for (const cartItem of cart.items) {
      const itemProduct = cartItem.product;
      if (!itemProduct || itemProduct.isBlocked || !itemProduct.category || !itemProduct.category.isListed) continue;
      const itemVariant = itemProduct.variants.find((v) => v.sku === cartItem.sku);
      if (!itemVariant) continue;
      const itemProductOffer = itemVariant.productOffer || 0;
      const itemCategoryOffer = itemProduct.category.categoryOffer || 0;
      const itemEffectiveOffer = Math.max(itemProductOffer, itemCategoryOffer);
      const itemBasePrice = itemVariant.salePrice < itemVariant.regularPrice && itemVariant.salePrice > 0 ? itemVariant.salePrice : itemVariant.regularPrice;
      const itemOfferPrice = itemEffectiveOffer > 0 ? itemBasePrice * (1 - itemEffectiveOffer / 100) : itemBasePrice;
      const itemOriginalPrice = itemBasePrice;
      cartTotal += itemOfferPrice * cartItem.quantity;
      totalSavings += (itemOriginalPrice - itemOfferPrice) * cartItem.quantity;
      itemCount++;
    }

    const itemSubtotal = offerPrice * quantity;
    const itemSavings = (originalPrice - offerPrice) * quantity;

    res.json({
      success: true,
      itemSubtotal,
      itemSavings,
      effectiveOffer,
      offerPrice,
      originalPrice,
      cartTotal,
      totalSavings,
      itemCount,
    });
  } catch (error) {
    console.error("Error updating cart quantity:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.removeFromCart = async (req, res) => {
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

    const cart = await Cart.findOne({ user: userId }).populate({
      path: "items.product",
      populate: {
        path: "category",
        model: "Category",
      },
    });
    if (!cart) {
      return res
        .status(404)
        .json({ success: false, message: "Cart not found" });
    }

    const itemIndex = cart.items.findIndex(
      (item) => item._id.toString() === itemId
    );
    if (itemIndex === -1) {
      return res
        .status(404)
        .json({ success: false, message: "Item not found in cart" });
    }

    cart.items.splice(itemIndex, 1);
    await cart.save();

    // Recalculate cart totals and savings
    let cartTotal = 0;
    let totalSavings = 0;
    let itemCount = 0;
    for (const cartItem of cart.items) {
      const itemProduct = cartItem.product;
      if (!itemProduct || itemProduct.isBlocked || !itemProduct.category || !itemProduct.category.isListed) continue;
      const itemVariant = itemProduct.variants.find((v) => v.sku === cartItem.sku);
      if (!itemVariant) continue;
      const itemProductOffer = itemVariant.productOffer || 0;
      const itemCategoryOffer = itemProduct.category.categoryOffer || 0;
      const itemEffectiveOffer = Math.max(itemProductOffer, itemCategoryOffer);
      const itemBasePrice = itemVariant.salePrice < itemVariant.regularPrice && itemVariant.salePrice > 0 ? itemVariant.salePrice : itemVariant.regularPrice;
      const itemOfferPrice = itemEffectiveOffer > 0 ? itemBasePrice * (1 - itemEffectiveOffer / 100) : itemBasePrice;
      const itemOriginalPrice = itemBasePrice;
      cartTotal += itemOfferPrice * cartItem.quantity;
      totalSavings += (itemOriginalPrice - itemOfferPrice) * cartItem.quantity;
      itemCount++;
    }

    res.json({
      success: true,
      message: "Item removed from cart",
      cartTotal,
      totalSavings,
      itemCount,
    });
  } catch (error) {
    console.error("Error removing item from cart:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getCartItemCount = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Please log in" });
    }

    const cart = await Cart.findOne({ user: userId });
    const itemCount = cart ? cart.items.length : 0;

    res.json({ success: true, itemCount });
  } catch (error) {
    console.error("Error fetching cart item count:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};