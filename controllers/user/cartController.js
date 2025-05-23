const mongoose = require("mongoose");
const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Wishlist = require("../../models/wishlistSchema");
const Coupon = require("../../models/couponSchema");

exports.addToCart = async (req, res) => {
  try {
    const { productId, variantId, quantity } = req.body;
    const userId = req.session.user;
    const MAX_QUANTITY_PER_ITEM = 5;

    if (!userId) {
      return res.json({
        success: false,
        requireLogin: true,
        message: "Please log in to add items to cart",
        redirectUrl: "/user/login"
      });
    }

    const product = await Product.findById(productId).populate("category");
    if (!product || product.isBlocked) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    if (!product.category || !product.category.isListed) {
      return res.status(400).json({
        success: false,
        message: "Product category is unavailable",
      });
    }

    const variant = product.variants.find((v) => v._id.toString() === variantId);
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

    const productOffer = variant.productOffer || 0;
    const categoryOffer = product.category.categoryOffer || 0;
    const effectiveOffer = Math.max(productOffer, categoryOffer);
    const basePrice = variant.salePrice < variant.regularPrice && variant.salePrice > 0 ? variant.salePrice : variant.regularPrice;
    const offerPrice = effectiveOffer > 0 ? basePrice * (1 - effectiveOffer / 100) : basePrice;
    const originalPrice = basePrice;

    const existingItemIndex = cart.items.findIndex(
      (item) => item.product.toString() === productId && item.sku === variant.sku
    );

    if (existingItemIndex > -1) {
      const newQuantity = cart.items[existingItemIndex].quantity + quantity;
      if (newQuantity > MAX_QUANTITY_PER_ITEM) {
        return res.status(400).json({
          success: false,
          message: `Cannot add more than ${MAX_QUANTITY_PER_ITEM} units of this item to the cart`,
        });
      }
      cart.items[existingItemIndex].quantity = newQuantity;
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
        productImage: variant.productImage[0],
      });
    }

    
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

    if (cart.coupon) {
      if (mongoose.Types.ObjectId.isValid(cart.coupon)) {
        const coupon = await Coupon.findById(cart.coupon);
        if (coupon) {
         
          const { subtotal } = await calculateCartTotals(cart, userId);
          const discount = await validateAndApplyCoupon(coupon, userId, subtotal, cart);
          if (discount !== null) {
            cart.discount = discount;
          } else {
            cart.coupon = null;
            cart.discount = 0;
          }
        } else {
          cart.coupon = null;
          cart.discount = 0;
        }
      } else {
        cart.coupon = null;
        cart.discount = 0;
      }
    }

    await cart.save();

    const { cartTotal, totalSavings, itemCount, subtotal, discount, appliedCoupon } = await calculateCartTotals(cart, userId);

    res.json({
      success: true,
      message: "Product added to cart",
      itemCount,
      cartTotal,
      totalSavings,
      subtotal,
      discount,
      appliedCoupon,
    });
  } catch (error) {
    console.error("Error adding to cart:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};




exports.validateCoupon = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Please log in" });
    }

    const cart = await Cart.findOne({ user: userId }).populate("coupon");
    if (!cart || !cart.coupon) {
      return res.json({ success: true, message: "No coupon applied" });
    }

    
    const coupon = await Coupon.findById(cart.coupon._id);
    if (!coupon) {
      cart.coupon = null;
      cart.discount = 0;
      await cart.save();
      
      const { cartTotal, totalSavings, itemCount, subtotal, discount, appliedCoupon } = await calculateCartTotals(cart, userId);
      
      return res.json({
        success: false,
        message: "The coupon you applied is no longer available.",
        couponRemoved: true,
        cartTotal,
        totalSavings,
        itemCount,
        subtotal,
        discount,
        appliedCoupon
      });
    }

  
    if (!coupon.isActive) {
      cart.coupon = null;
      cart.discount = 0;
      await cart.save();
      
      const { cartTotal, totalSavings, itemCount, subtotal, discount, appliedCoupon } = await calculateCartTotals(cart, userId);
      
      return res.json({
        success: false,
        message: "The coupon has been deactivated by the admin.",
        couponRemoved: true,
        cartTotal,
        totalSavings,
        itemCount,
        subtotal,
        discount,
        appliedCoupon
      });
    }

    const now = new Date();
    if (now < coupon.startDate || now > coupon.endDate) {
      cart.coupon = null;
      cart.discount = 0;
      await cart.save();
      
      const { cartTotal, totalSavings, itemCount, subtotal, discount, appliedCoupon } = await calculateCartTotals(cart, userId);
      
      return res.json({
        success: false,
        message: "The coupon has expired.",
        couponRemoved: true,
        cartTotal,
        totalSavings,
        itemCount,
        subtotal,
        discount,
        appliedCoupon
      });
    }

    
    if (coupon.usedCount >= coupon.usageLimit) {
      cart.coupon = null;
      cart.discount = 0;
      await cart.save();
      
      const { cartTotal, totalSavings, itemCount, subtotal, discount, appliedCoupon } = await calculateCartTotals(cart, userId);
      
      return res.json({
        success: false,
        message: "This coupon has reached its usage limit.",
        couponRemoved: true,
        cartTotal,
        totalSavings,
        itemCount,
        subtotal,
        discount,
        appliedCoupon
      });
    }

   
    const userUsed = coupon.usedBy.some((entry) => entry.user.toString() === userId);
    if (userUsed) {
      cart.coupon = null;
      cart.discount = 0;
      await cart.save();
      
      const { cartTotal, totalSavings, itemCount, subtotal, discount, appliedCoupon } = await calculateCartTotals(cart, userId);
      
      return res.json({
        success: false,
        message: "You have already used this coupon before.",
        couponRemoved: true,
        cartTotal,
        totalSavings,
        itemCount,
        subtotal,
        discount,
        appliedCoupon
      });
    }

    
    const { subtotal } = await calculateCartTotals(cart, userId);
    if (subtotal < coupon.minPurchase) {
      cart.coupon = null;
      cart.discount = 0;
      await cart.save();
      
      const { cartTotal, totalSavings, itemCount, subtotal: newSubtotal, discount, appliedCoupon } = await calculateCartTotals(cart, userId);
      
      return res.json({
        success: false,
        message: `This coupon requires a minimum purchase of ₹${coupon.minPurchase.toFixed(2)}. Your current subtotal is ₹${subtotal.toFixed(2)}.`,
        couponRemoved: true,
        cartTotal,
        totalSavings,
        itemCount,
        subtotal: newSubtotal,
        discount,
        appliedCoupon
      });
    }

   
    return res.json({
      success: true,
      message: "Coupon is valid"
    });
  } catch (error) {
    console.error("Error validating coupon:", error);
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
    }).populate("coupon");

    let cartItems = [];
    let hasInvalidItems = false;
    let hasOutOfStockItems = false;

   
    const availableCoupons = await Coupon.find({
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() },
      $or: [
        { usedBy: { $not: { $elemMatch: { user: userId } } } },
        { usageLimit: { $gt: 0 } },
      ],
    });

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
        let isOutOfStock = false;

        if (variant && !errorMessage) {
         
          if (variant.stock_quantity < item.quantity) {
            isOutOfStock = true;
            hasOutOfStockItems = true;
          }
          const productOffer = variant.productOffer || 0;
          const categoryOffer = product.category.categoryOffer || 0;
          effectiveOffer = Math.max(productOffer, categoryOffer);
          const basePrice = variant.salePrice < variant.regularPrice && variant.salePrice > 0 ? variant.salePrice : variant.regularPrice;
          offerPrice = effectiveOffer > 0 ? basePrice * (1 - effectiveOffer / 100) : basePrice;
          originalPrice = basePrice;
          price = offerPrice;
          subtotal = price * item.quantity;
          savings = (originalPrice - offerPrice) * item.quantity;
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
          isOutOfStock,
        };
      });

      
      if (cart.coupon) {
        const coupon = await Coupon.findById(cart.coupon);
        if (coupon) {
          const { subtotal } = await calculateCartTotals(cart, userId);
          cart.discount = await validateAndApplyCoupon(coupon, userId, subtotal, cart);
          await cart.save();
        } else {
          cart.coupon = null;
          cart.discount = 0;
          await cart.save();
        }
      }
    }

    const { cartTotal, totalSavings, itemCount, subtotal, discount, appliedCoupon } = await calculateCartTotals(cart, userId);

    res.render("user/cart", {
      cartItems,
      total: cartTotal,
      totalSavings,
      subtotal,
      discount,
      itemCount,
      user: req.session.user || null,
      title: "Your Cart",
      hasInvalidItems,
      hasOutOfStockItems,
      availableCoupons,
      appliedCoupon,
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
      return res.status(400).json({ success: false, message: "Invalid item ID or quantity" });
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
    }).populate("coupon");
    if (!cart) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    const item = cart.items.find((item) => item._id.toString() === itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: "Item not found in cart" });
    }

    const product = item.product;
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    if (product.isBlocked) {
      return res.status(400).json({ success: false, message: "Product is no longer available" });
    }

    if (!product.category || !product.category.isListed) {
      return res.status(400).json({
        success: false,
        message: "Product category is unavailable",
      });
    }

    const variant = product.variants.find((v) => v.sku === item.sku);
    if (!variant) {
      return res.status(400).json({ success: false, message: "Variant not found" });
    }

    if (quantity > variant.stock_quantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${variant.stock_quantity} items available in stock`,
      });
    }

    const productOffer = variant.productOffer || 0;
    const categoryOffer = product.category.categoryOffer || 0;
    const effectiveOffer = Math.max(productOffer, categoryOffer);
    const basePrice = variant.salePrice < variant.regularPrice && variant.salePrice > 0 ? variant.salePrice : variant.regularPrice;
    const offerPrice = effectiveOffer > 0 ? basePrice * (1 - effectiveOffer / 100) : basePrice;
    const originalPrice = basePrice;

    item.quantity = quantity;
    await cart.save();

    
    if (cart.coupon) {
      const coupon = await Coupon.findById(cart.coupon);
      if (coupon) {
        const { subtotal } = await calculateCartTotals(cart, userId);
        
       
        if (subtotal < coupon.minPurchase) {
        
          cart.coupon = null;
          cart.discount = 0;
        } else {
        
          try {
            const newDiscount = await validateAndApplyCoupon(coupon, userId, subtotal, cart);
            if (newDiscount === null) {
              
              cart.coupon = null;
              cart.discount = 0;
            } else {
              cart.discount = newDiscount;
            }
          } catch (error) {
           
            cart.coupon = null;
            cart.discount = 0;
          }
        }
        await cart.save();
      } else {
        cart.coupon = null;
        cart.discount = 0;
        await cart.save();
      }
    }

    const { cartTotal, totalSavings, itemCount, subtotal, discount, appliedCoupon } = await calculateCartTotals(cart, userId);

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
      subtotal,
      discount,
      appliedCoupon,
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
      return res.status(400).json({ success: false, message: "Invalid item ID" });
    }

    const cart = await Cart.findOne({ user: userId }).populate({
      path: "items.product",
      populate: {
        path: "category",
        model: "Category",
      },
    }).populate("coupon");
    if (!cart) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    const itemIndex = cart.items.findIndex((item) => item._id.toString() === itemId);
    if (itemIndex === -1) {
      return res.status(404).json({ success: false, message: "Item not found in cart" });
    }

    cart.items.splice(itemIndex, 1);

    if (cart.coupon) {
      const coupon = await Coupon.findById(cart.coupon);
      if (coupon) {
        const { subtotal } = await calculateCartTotals(cart, userId);
        
      
        if (subtotal < coupon.minPurchase) {
          
          cart.coupon = null;
          cart.discount = 0;
        } else {
          // Try to revalidate the coupon
          try {
            const newDiscount = await validateAndApplyCoupon(coupon, userId, subtotal, cart);
            if (newDiscount === null) {
              // Coupon is no longer valid
              cart.coupon = null;
              cart.discount = 0;
            } else {
              cart.discount = newDiscount;
            }
          } catch (error) {
            // Error in validation, remove coupon
            cart.coupon = null;
            cart.discount = 0;
          }
        }
        await cart.save();
      } else {
        cart.coupon = null;
        cart.discount = 0;
        await cart.save();
      }
    }

    await cart.save();

    const { cartTotal, totalSavings, itemCount, subtotal, discount, appliedCoupon } = await calculateCartTotals(cart, userId);

    res.json({
      success: true,
      message: "Item removed from cart",
      cartTotal,
      totalSavings,
      itemCount,
      subtotal,
      discount,
      appliedCoupon,
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

exports.applyCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Please log in" });
    }

    if (!couponCode) {
      return res.status(400).json({ success: false, message: "Coupon code is required" });
    }

    const cart = await Cart.findOne({ user: userId }).populate({
      path: "items.product",
      populate: {
        path: "category",
        model: "Category",
      },
    }).populate("coupon");

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    const coupon = await Coupon.findOne({ code: couponCode.trim().toUpperCase() });
    if (!coupon) {
      return res.status(400).json({ success: false, message: "Invalid coupon code" });
    }

    const { subtotal } = await calculateCartTotals(cart, userId);
    
    try {
      const discount = await validateAndApplyCoupon(coupon, userId, subtotal, cart);

      if (discount === null) {
        return res.status(400).json({ success: false, message: "Coupon is not applicable" });
      }

      
      const userIdString = userId._id ? userId._id.toString() : userId.toString();
    
      
      // Make sure we're using a proper ObjectId reference
      coupon.usedBy.push({ user: new mongoose.Types.ObjectId(userIdString) });
      coupon.usedCount += 1;
      
      // Save the coupon with updated usage information
      await coupon.save();

      
      // Update cart with coupon and discount
      cart.coupon = coupon._id;
      cart.discount = discount;
      await cart.save();

      const { cartTotal, totalSavings, itemCount, subtotal: newSubtotal, discount: newDiscount, appliedCoupon } = await calculateCartTotals(cart, userId);

      res.json({
        success: true,
        message: "Coupon applied successfully",
        cartTotal,
        totalSavings,
        itemCount,
        subtotal: newSubtotal,
        discount: newDiscount,
        appliedCoupon,
      });
    } catch (validationError) {
      return res.status(400).json({ success: false, message: validationError.message || "Coupon is not applicable" });
    }
  } catch (error) {
    console.error("Error applying coupon:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.removeCoupon = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Please log in" });
    }

    const cart = await Cart.findOne({ user: userId }).populate({
      path: "items.product",
      populate: {
        path: "category",
        model: "Category",
      },
    });

    if (!cart) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    cart.coupon = null;
    cart.discount = 0;
    await cart.save();

    const { cartTotal, totalSavings, itemCount, subtotal, discount, appliedCoupon } = await calculateCartTotals(cart, userId);

    res.json({
      success: true,
      message: "Coupon removed successfully",
      cartTotal,
      totalSavings,
      itemCount,
      subtotal,
      discount,
      appliedCoupon,
    });
  } catch (error) {
    console.error("Error removing coupon:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Helper function to calculate cart totals
const calculateCartTotals = async (cart, userId) => {
  let cartTotal = 0;
  let totalSavings = 0;
  let subtotal = 0;
  let itemCount = 0;
  let discount = cart.discount || 0;
  let appliedCoupon = null;

  if (cart && cart.items.length > 0) {
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
      const itemSubtotal = itemOfferPrice * item.quantity;
      subtotal += itemSubtotal;
      totalSavings += (itemOriginalPrice - itemOfferPrice) * item.quantity;
      itemCount++;
    }

    if (cart.coupon) {
      const coupon = await Coupon.findById(cart.coupon);
      if (coupon) {
        appliedCoupon = {
          code: coupon.code,
          description: coupon.description,
          discountType: coupon.discountType,
          discountAmount: coupon.discountAmount,
        };
        discount = cart.discount;
      } else {
        cart.coupon = null;
        cart.discount = 0;
        await cart.save();
        discount = 0;
      }
    }

    cartTotal = subtotal - discount;
  }

  return { cartTotal, totalSavings, itemCount, subtotal, discount, appliedCoupon };
};




// Helper function to validate and apply coupon
const validateAndApplyCoupon = async (coupon, userId, subtotal, cart) => {
  // Check if coupon is active
  if (!coupon.isActive) {
    cart.coupon = null;
    cart.discount = 0;
    await cart.save();
    return null;
  }

  // Check if coupon is within valid dates
  const now = new Date();
  if (now < coupon.startDate || now > coupon.endDate) {
    cart.coupon = null;
    cart.discount = 0;
    await cart.save();
    return null;
  }

  // Check minimum purchase requirement
  if (subtotal < coupon.minPurchase) {
    return null;
  }

  // Check usage limit
  if (coupon.usedCount >= coupon.usageLimit) {
    cart.coupon = null;
    cart.discount = 0;
    await cart.save();
    return null;
  }

  
  const userIdString = userId._id ? userId._id.toString() : userId.toString();

  
  
  const userUsed = coupon.usedBy.some((entry) => {
    const entryUserId = entry.user.toString();
   
    return entryUserId === userIdString;
  });
  
  if (userUsed) {
    console.log('User has already used this coupon');
    cart.coupon = null;
    cart.discount = 0;
    await cart.save();
    throw new Error('You have already used this coupon');
  } else {
    console.log('User has not used this coupon before');
  }

  // Calculate discount
  let discount = 0;
  if (coupon.discountType === "percentage") {
    discount = (coupon.discountAmount / 100) * subtotal;
    if (coupon.maxDiscount && discount > coupon.maxDiscount) {
      discount = coupon.maxDiscount;
    }
  } else if (coupon.discountType === "fixed") {
    discount = coupon.discountAmount;
  }

  return discount;
};