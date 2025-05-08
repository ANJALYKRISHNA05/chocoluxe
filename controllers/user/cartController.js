const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");

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

    if (existingItemIndex > -1) {
      const newQuantity = cart.items[existingItemIndex].quantity + quantity;
      if (newQuantity > MAX_QUANTITY_PER_ITEM) {
        return res.status(400).json({
          success: false,
          message: `Cannot add more than ${MAX_QUANTITY_PER_ITEM} units of this item to the cart`,
        });
      }
      cart.items[existingItemIndex].quantity = newQuantity;
      cart.items[existingItemIndex].price =
        variant.salePrice * cart.items[existingItemIndex].quantity;
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

    await cart.save();
    const itemCount = cart.items.length;

    res.json({ success: true, message: "Product added to cart", itemCount });
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
        const price = variant && typeof variant.salePrice === 'number' ? variant.salePrice : 0;
        const subtotal = errorMessage ? 0 : price * item.quantity;
        if (!errorMessage) {
          total += subtotal;
        }

        return {
          ...item.toObject(),
          product,
          variant,
          subtotal,
          errorMessage,
        };
      });

      // Do not remove items from cart; let them display with error messages
      await cart.save();
    }

    res.render("user/cart", {
      cartItems,
      total,
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

    const cart = await Cart.findOne({ user: userId }).populate("items.product");
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

    item.quantity = quantity;
    await cart.save();

    const cartTotal = cart.items.reduce((sum, cartItem) => {
      const itemProduct = cartItem.product;
      if (!itemProduct || itemProduct.isBlocked) return sum;
      const itemVariant = itemProduct.variants.find((v) => v.sku === cartItem.sku);
      if (!itemVariant) return sum;
      const price = itemVariant && typeof itemVariant.salePrice === 'number' ? itemVariant.salePrice : 0;
      return sum + price * cartItem.quantity;
    }, 0);

    const itemCount = cart.items.filter(
      (cartItem) => cartItem.product && !cartItem.product.isBlocked
    ).length;
    const itemSubtotal = (variant && typeof variant.salePrice === 'number' ? variant.salePrice : 0) * quantity;

    res.json({
      success: true,
      itemSubtotal,
      cartTotal,
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

    const cart = await Cart.findOne({ user: userId }).populate("items.product");
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

    const cartTotal = cart.items.reduce((sum, cartItem) => {
      const itemProduct = cartItem.product;
      if (!itemProduct || itemProduct.isBlocked) return sum;
      const itemVariant = itemProduct.variants.find((v) => v.sku === cartItem.sku);
      if (!itemVariant) return sum;
      const price = itemVariant && typeof itemVariant.salePrice === 'number' ? itemVariant.salePrice : 0;
      return sum + price * cartItem.quantity;
    }, 0);

    const itemCount = cart.items.length;

    res.json({
      success: true,
      message: "Item removed from cart",
      cartTotal,
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