const mongoose = require("mongoose");
const Cart = require("../../models/cartSchema");
const Address = require("../../models/addressSchema");
const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const Coupon = require("../../models/couponSchema");
const Wallet = require("../../models/walletSchema");
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const Razorpay = require('razorpay');
const crypto = require('crypto');


const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Helper functions from cartController.js
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

const validateAndApplyCoupon = async (coupon, userId, subtotal, cart) => {
  if (!coupon.isActive) {
    cart.coupon = null;
    cart.discount = 0;
    await cart.save();
    return null;
  }

  const now = new Date();
  if (now < coupon.startDate || now > coupon.endDate) {
    cart.coupon = null;
    cart.discount = 0;
    await cart.save();
    return null;
  }

  if (subtotal < coupon.minPurchase) {
    return null;
  }

  if (coupon.usedCount >= coupon.usageLimit) {
    cart.coupon = null;
    cart.discount = 0;
    await cart.save();
    return null;
  }

  const userUsed = coupon.usedBy.some((entry) => entry.user.toString() === userId);
  if (userUsed) {
    return null;
  }

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

exports.addCheckoutAddress = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { name, addressType, address, city, state, pincode, phone, isDefault } = req.body;

    if (!name || !addressType || !address || !city || !state || !pincode || !phone) {
      req.session.message = "All fields are required.";
      return res.redirect("/checkout");
    }

    if (!/^\d{6}$/.test(pincode)) {
      req.session.message = "Pincode must be 6 digits.";
      return res.redirect("/checkout");
    }
    if (!/^\d{10}$/.test(phone)) {
      req.session.message = "Phone number must be 10 digits.";
      return res.redirect("/checkout");
    }

    if (isDefault === "true") {
      await Address.updateMany({ userId }, { $set: { isDefault: false } });
    }

    const newAddress = new Address({
      userId,
      name,
      addressType,
      address,
      city,
      state,
      pincode,
      phone,
      isDefault: isDefault === "true",
    });

    await newAddress.save();
    req.session.message = "Address added successfully.";
    res.redirect("/checkout");
  } catch (error) {
    console.error("Error adding checkout address:", error);
    req.session.message = "Error adding address.";
    res.redirect("/checkout");
  }
};

exports.updateCheckoutAddress = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { addressId, name, addressType, address, city, state, pincode, phone, isDefault } = req.body;

    if (!name || !addressType || !address || !city || !state || !pincode || !phone) {
      req.session.message = "All fields are required.";
      return res.redirect("/checkout");
    }

    if (!/^\d{6}$/.test(pincode)) {
      req.session.message = "Pincode must be 6 digits.";
      return res.redirect("/checkout");
    }
    if (!/^\d{10}$/.test(phone)) {
      req.session.message = "Phone number must be 10 digits.";
      return res.redirect("/checkout");
    }

    if (isDefault === "true") {
      await Address.updateMany({ userId, _id: { $ne: addressId } }, { $set: { isDefault: false } });
    }

    await Address.findOneAndUpdate(
      { _id: addressId, userId },
      {
        name,
        addressType,
        address,
        city,
        state,
        pincode,
        phone,
        isDefault: isDefault === "true",
      },
      { new: true }
    );

    req.session.message = "Address updated successfully.";
    res.redirect("/checkout");
  } catch (error) {
    console.error("Error updating checkout address:", error);
    req.session.message = "Error updating address.";
    res.redirect("/checkout");
  }
};

exports.loadCheckout = async (req, res) => {
  try {
    const userId = req.session.user._id;

    const cart = await Cart.findOne({ user: userId }).populate({
      path: "items.product",
      populate: {
        path: "category",
        model: "Category",
      },
    }).populate("coupon");
    if (!cart || cart.items.length === 0) {
      req.session.message = "Your cart is empty.";
      return res.redirect("/cart");
    }

    let invalidItems = [];
    let outOfStockItems = [];
    const cartItems = cart.items.map((item) => {
      let errorMessage = null;
      const product = item.product;

      if (!product) {
        errorMessage = "Product not found";
        invalidItems.push({ sku: item.sku, errorMessage });
      } else if (product.isBlocked) {
        errorMessage = "Product is no longer available";
        invalidItems.push({ sku: item.sku, errorMessage });
      } else if (!product.category || !product.category.isListed) {
        errorMessage = "Product category is unavailable";
        invalidItems.push({ sku: item.sku, errorMessage });
      }
      
      // Check if the product is out of stock
      const variant = product?.variants.find((v) => v.sku === item.sku);
      if (variant && variant.stock_quantity < item.quantity) {
        errorMessage = "Product is out of stock";
        outOfStockItems.push({ 
          sku: item.sku, 
          productName: product.productName,
          available: variant.stock_quantity,
          requested: item.quantity 
        });
      }
      let effectiveOffer = 0;
      let offerPrice = 0;
      let originalPrice = 0;
      let itemSubtotal = 0;
      let itemSavings = 0;

      if (variant && !errorMessage) {
        const productOffer = variant.productOffer || 0;
        const categoryOffer = product.category.categoryOffer || 0;
        effectiveOffer = Math.max(productOffer, categoryOffer);
        const basePrice = variant.salePrice < variant.regularPrice && variant.salePrice > 0 ? variant.salePrice : variant.regularPrice;
        offerPrice = effectiveOffer > 0 ? basePrice * (1 - effectiveOffer / 100) : basePrice;
        originalPrice = basePrice;
        itemSubtotal = offerPrice * item.quantity;
        itemSavings = (originalPrice - offerPrice) * item.quantity;
      }

      return {
        ...item.toObject(),
        product,
        variant,
        effectiveOffer,
        offerPrice,
        originalPrice,
        subtotal: itemSubtotal,
        savings: itemSavings,
        errorMessage,
      };
    });

    if (invalidItems.length > 0) {
      req.session.message = "Some items in your cart are invalid. Please remove them to proceed.";
      return res.redirect("/cart");
    }
    
    if (outOfStockItems.length > 0) {
      // Format a detailed message about out-of-stock items
      const itemMessages = outOfStockItems.map(item => 
        `${item.productName} (Available: ${item.available}, Requested: ${item.requested})`
      ).join(', ');
      
      req.session.message = `Some items in your cart are out of stock: ${itemMessages}. Please update quantities or remove these items to proceed.`;
      return res.redirect("/cart");
    }

    const { subtotal, totalSavings, discount, cartTotal: total, appliedCoupon } = await calculateCartTotals(cart, userId);
    const addresses = await Address.find({ userId }).sort({ isDefault: -1, createdAt: -1 });
    const wallet = await Wallet.findOne({ userId }) || { balance: 0 }; // Fetch wallet for balance display

    const message = req.session.message || '';
    req.session.message = null;

    res.render("user/checkout", {
      cartItems,
      subtotal,
      totalSavings,
      discount,
      total,
      appliedCoupon,
      addresses,
      wallet, // Pass wallet to the template
      user: req.session.user,
      title: "Checkout",
      message,
    });
  } catch (error) {
    console.error("Error loading checkout:", error);
    req.session.message = "Error loading checkout page.";
    res.redirect("/cart");
  }
};

exports.placeOrder = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { addressId, paymentMethod } = req.body;

    const address = await Address.findOne({ _id: addressId, userId });
    if (!address) {
      req.session.message = "Please select a valid address.";
      return res.redirect("/checkout");
    }

    if (!paymentMethod || !["Cash on Delivery", "Wallet", "Razorpay"].includes(paymentMethod)) {
      req.session.message = "Please select a valid payment method.";
      return res.redirect("/checkout");
    }

    const cart = await Cart.findOne({ user: userId }).populate({
      path: "items.product",
      populate: {
        path: "category",
        model: "Category",
      },
    }).populate("coupon");
    if (!cart || cart.items.length === 0) {
      req.session.message = "Your cart is empty.";
      return res.redirect("/cart");
    }

    const { subtotal, totalSavings, discount, appliedCoupon } = await calculateCartTotals(cart, userId);
    const total = subtotal - discount;

    // Wallet payment validation
    if (paymentMethod === "Wallet") {
      let wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        wallet = new Wallet({ userId, balance: 0, transactions: [] });
        await wallet.save();
      }
      if (wallet.balance < total) {
        req.session.message = "Insufficient wallet balance.";
        return res.redirect("/checkout");
      }
    }

    const orderItems = [];
    const stockUpdates = [];
    let invalidItems = [];

    for (const item of cart.items) {
      const product = item.product;
      let errorMessage = null;

      if (!product) {
        errorMessage = `Product not found for SKU ${item.sku}`;
        invalidItems.push({ sku: item.sku, errorMessage });
        continue;
      }
      if (product.isBlocked) {
        errorMessage = `Product ${product.productName} is no longer available`;
        invalidItems.push({ sku: item.sku, errorMessage });
        continue;
      }
      if (!product.category || !product.category.isListed) {
        errorMessage = `Category for product ${product.productName} is unavailable`;
        invalidItems.push({ sku: item.sku, errorMessage });
        continue;
      }

      const variant = product.variants.find((v) => v.sku === item.sku);
      if (!variant) {
        errorMessage = `Variant with SKU ${item.sku} not found`;
        invalidItems.push({ sku: item.sku, errorMessage });
        continue;
      }

      if (variant.stock_quantity < item.quantity) {
        errorMessage = `Insufficient stock for ${product.productName} (${variant.flavor}, ${variant.sugarLevel}, ${variant.weight}g)`;
        invalidItems.push({ sku: item.sku, errorMessage });
        continue;
      }

      const productOffer = variant.productOffer || 0;
      const categoryOffer = product.category.categoryOffer || 0;
      const effectiveOffer = Math.max(productOffer, categoryOffer);
      const basePrice = variant.salePrice < variant.regularPrice && variant.salePrice > 0 ? variant.salePrice : variant.regularPrice;
      const offerPrice = effectiveOffer > 0 ? basePrice * (1 - effectiveOffer / 100) : basePrice;
      const itemSubtotal = offerPrice * item.quantity;

      orderItems.push({
        product: product._id,
        sku: item.sku,
        quantity: item.quantity,
        price: offerPrice,
        subtotal: itemSubtotal,
        effectiveOffer,
      });

      stockUpdates.push({
        productId: product._id,
        sku: item.sku,
        quantity: item.quantity,
      });
    }

    if (invalidItems.length > 0) {
      req.session.message = "Some items in your cart are invalid. Please remove them to proceed.";
      return res.redirect("/checkout");
    }

    let unique = false;
    let attempt = 0;
    const maxAttempts = 10;
    let orderId;
    const prefix = 'ORD';

    while (!unique && attempt < maxAttempts) {
      const randomNum = Math.floor(100000 + Math.random() * 900000);
      const potentialOrderId = `${prefix}-${randomNum}`;

      const existingOrder = await Order.findOne({ orderId: potentialOrderId });
      if (!existingOrder) {
        orderId = potentialOrderId;
        unique = true;
      }
      attempt++;
    }

    if (!unique) {
      throw new Error('Unable to generate a unique orderId after maximum attempts');
    }

    for (const update of stockUpdates) {
      await Product.updateOne(
        { _id: update.productId, "variants.sku": update.sku },
        { $inc: { "variants.$.stock_quantity": -update.quantity } }
      );
    }

    // Mark coupon as used if applied
    let couponId = null;
    if (cart.coupon && appliedCoupon) {
      const coupon = await Coupon.findById(cart.coupon);
      if (coupon) {
        coupon.usedCount += 1;
        coupon.usedBy.push({ user: userId, usedAt: new Date() });
        await coupon.save();
        couponId = coupon._id;
      }
    }

    // Process wallet payment
    if (paymentMethod === "Wallet") {
      const wallet = await Wallet.findOne({ userId });
      wallet.balance -= total;
      wallet.transactions.push({
        transactionType: "debit",
        transactionAmount: total,
        description: `Purchase for order ${orderId}`,
        createdAt: new Date(),
      });
      await wallet.save();
    }
    
    // For Razorpay, we don't process payment here as it's handled separately
    // The order is created with 'Pending Payment' status

    const order = new Order({
      orderId,
      user: userId,
      items: orderItems,
      shippingAddress: {
        name: address.name,
        addressType: address.addressType,
        address: address.address,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        phone: address.phone,
      },
      coupon: couponId,
      subtotal,
      discount,
      totalSavings,
      total,
      paymentMethod,
      status: paymentMethod === "Wallet" ? "Confirmed" : 
              paymentMethod === "Razorpay" ? "Pending Payment" : "Pending", // Set appropriate status based on payment method
    });

    await order.save();

    // Clear cart
    await Cart.findOneAndUpdate({ user: userId }, { $set: { items: [], coupon: null, discount: 0 } });

    res.redirect(`/order-confirmation/${order.orderId}`);
  } catch (error) {
    console.error("Error placing order:", error);
    req.session.message = "Error placing order: " + error.message;
    res.redirect("/checkout");
  }
};

// Create Razorpay order
exports.createRazorpayOrder = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { addressId } = req.body;

    // Validate address
    const address = await Address.findOne({ _id: addressId, userId });
    if (!address) {
      return res.json({ success: false, message: "Please select a valid address." });
    }

    // Get cart details
    const cart = await Cart.findOne({ user: userId }).populate({
      path: "items.product",
      populate: {
        path: "category",
        model: "Category",
      },
    }).populate("coupon");

    if (!cart || cart.items.length === 0) {
      return res.json({ success: false, message: "Your cart is empty." });
    }

    // Calculate totals
    const { subtotal, totalSavings, discount, cartTotal: total, appliedCoupon } = await calculateCartTotals(cart, userId);
    
    // Generate unique order ID
    let unique = false;
    let attempt = 0;
    const maxAttempts = 10;
    let orderId;
    const prefix = 'ORD';

    while (!unique && attempt < maxAttempts) {
      const randomNum = Math.floor(100000 + Math.random() * 900000);
      const potentialOrderId = `${prefix}-${randomNum}`;

      const existingOrder = await Order.findOne({ orderId: potentialOrderId });
      if (!existingOrder) {
        orderId = potentialOrderId;
        unique = true;
      }
      attempt++;
    }

    if (!unique) {
      throw new Error('Unable to generate a unique orderId after maximum attempts');
    }

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(total * 100), // Convert to paise
      currency: 'INR',
      receipt: orderId,
      payment_capture: 1, // Auto capture payment
    });

    // Store temporary order details in session for verification later
    req.session.pendingRazorpayOrder = {
      orderId,
      addressId,
      razorpayOrderId: razorpayOrder.id,
      amount: total,
      userId
    };

    return res.json({
      success: true,
      order: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        receipt: razorpayOrder.receipt
      }
    });
  } catch (error) {
    console.error("Error creating Razorpay order:", error);
    return res.json({ success: false, message: "Error creating order: " + error.message });
  }
};

// Verify Razorpay payment
exports.verifyPayment = async (req, res) => {
  try {
    const { payment, order: razorpayOrder } = req.body;
    
    // Get the pending order details from session
    const pendingOrder = req.session.pendingRazorpayOrder;
    if (!pendingOrder || pendingOrder.razorpayOrderId !== razorpayOrder.id) {
      return res.json({ success: false, message: "Invalid order details." });
    }

    // Verify payment signature
    const text = razorpayOrder.id + "|" + payment.razorpay_payment_id;
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(text)
      .digest("hex");

    if (generatedSignature !== payment.razorpay_signature) {
      return res.json({ success: false, message: "Invalid payment signature." });
    }

    // Process the order now that payment is verified
    const userId = pendingOrder.userId;
    const addressId = pendingOrder.addressId;
    const orderId = pendingOrder.orderId;

    // Get necessary data
    const address = await Address.findOne({ _id: addressId, userId });
    const cart = await Cart.findOne({ user: userId }).populate({
      path: "items.product",
      populate: {
        path: "category",
        model: "Category",
      },
    }).populate("coupon");

    const { subtotal, totalSavings, discount, appliedCoupon } = await calculateCartTotals(cart, userId);
    const total = subtotal - discount;

    // Process order items
    const orderItems = [];
    const stockUpdates = [];

    for (const item of cart.items) {
      const product = item.product;
      const variant = product.variants.find((v) => v.sku === item.sku);
      
      const productOffer = variant.productOffer || 0;
      const categoryOffer = product.category.categoryOffer || 0;
      const effectiveOffer = Math.max(productOffer, categoryOffer);
      const basePrice = variant.salePrice < variant.regularPrice && variant.salePrice > 0 ? variant.salePrice : variant.regularPrice;
      const offerPrice = effectiveOffer > 0 ? basePrice * (1 - effectiveOffer / 100) : basePrice;
      const itemSubtotal = offerPrice * item.quantity;

      orderItems.push({
        product: product._id,
        sku: item.sku,
        quantity: item.quantity,
        price: offerPrice,
        subtotal: itemSubtotal,
        effectiveOffer,
      });

      stockUpdates.push({
        productId: product._id,
        sku: item.sku,
        quantity: item.quantity,
      });
    }

    // Update stock
    for (const update of stockUpdates) {
      await Product.updateOne(
        { _id: update.productId, "variants.sku": update.sku },
        { $inc: { "variants.$.stock_quantity": -update.quantity } }
      );
    }

    // Mark coupon as used if applied
    let couponId = null;
    if (cart.coupon && appliedCoupon) {
      const coupon = await Coupon.findById(cart.coupon);
      if (coupon) {
        coupon.usedCount += 1;
        coupon.usedBy.push({ user: userId, usedAt: new Date() });
        await coupon.save();
        couponId = coupon._id;
      }
    }

    // Create order
    const newOrder = new Order({
      orderId,
      user: userId,
      items: orderItems,
      shippingAddress: {
        name: address.name,
        addressType: address.addressType,
        address: address.address,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        phone: address.phone,
      },
      coupon: couponId,
      subtotal,
      discount,
      totalSavings,
      total,
      paymentMethod: "Razorpay",
      status: "Confirmed", // Payment is already confirmed
      paymentDetails: {
        razorpayOrderId: razorpayOrder.id,
        razorpayPaymentId: payment.razorpay_payment_id,
        razorpaySignature: payment.razorpay_signature
      }
    });

    await newOrder.save();

    // Clear cart
    await Cart.findOneAndUpdate({ user: userId }, { $set: { items: [], coupon: null, discount: 0 } });
    
    // Clear the pending order from session
    delete req.session.pendingRazorpayOrder;

    return res.json({ success: true, orderId: newOrder.orderId });
  } catch (error) {
    console.error("Error verifying payment:", error);
    return res.json({ success: false, message: "Error verifying payment: " + error.message });
  }
};

// Handle payment failure
exports.handlePaymentFailure = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const pendingOrder = req.session.pendingRazorpayOrder;
    
    // Clear the pending order from session
    if (pendingOrder && pendingOrder.orderId === orderId) {
      delete req.session.pendingRazorpayOrder;
    }
    
    res.render("user/order-failure", {
      orderId,
      errorMessage: "Your payment was not successful. Please try again.",
      user: req.session.user,
      title: "Payment Failed"
    });
  } catch (error) {
    console.error("Error handling payment failure:", error);
    req.session.message = "Error processing payment failure.";
    res.redirect("/checkout");
  }
};

// Handle payment cancellation
exports.handlePaymentCancellation = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const pendingOrder = req.session.pendingRazorpayOrder;
    
    // Clear the pending order from session
    if (pendingOrder && pendingOrder.orderId === orderId) {
      delete req.session.pendingRazorpayOrder;
    }
    
    res.render("user/order-failure", {
      orderId,
      errorMessage: "You cancelled the payment process. You can try again or choose a different payment method.",
      user: req.session.user,
      title: "Payment Cancelled"
    });
  } catch (error) {
    console.error("Error handling payment cancellation:", error);
    req.session.message = "Error processing payment cancellation.";
    res.redirect("/checkout");
  }
};

// Retry payment for a failed order
exports.retryPayment = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.session.user._id;
    
    // Find the order
    const order = await Order.findOne({ orderId, user: userId });
    if (!order) {
      // Simply redirect to checkout without showing error message
      return res.redirect("/checkout");
    }
    
    // Create a new Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(order.total * 100), // Convert to paise
      currency: 'INR',
      receipt: order.orderId,
      payment_capture: 1, // Auto capture payment
    });
    
    // Store order details in session
    req.session.pendingRazorpayOrder = {
      orderId: order.orderId,
      addressId: null, // Not needed for retry
      razorpayOrderId: razorpayOrder.id,
      amount: order.total,
      userId
    };
    
    res.render("user/retry-payment", {
      order,
      razorpayOrder: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency
      },
      user: req.session.user,
      title: "Retry Payment",
      razorpayKeyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error("Error retrying payment:", error);
    req.session.message = "Error setting up payment retry.";
    res.redirect("/checkout");
  }
};

exports.loadOrderConfirmation = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const orderId = req.params.orderId;

    const order = await Order.findOne({ orderId, user: userId }).populate("items.product").populate("coupon");
    if (!order) {
      req.session.message = "Order not found.";
      return res.redirect("/user/profile");
    }

    const orderDate = new Date(order.createdAt);
    const estimatedDelivery = new Date(orderDate);
    estimatedDelivery.setDate(orderDate.getDate() + 5);

    const message = req.session.message || '';
    req.session.message = null;

    res.render("user/order-confirmation", {
      order,
      orderDate: orderDate.toLocaleDateString(),
      estimatedDelivery: estimatedDelivery.toLocaleDateString(),
      user: req.session.user,
      title: "Order Confirmation",
      message,
    });
  } catch (error) {
    console.error("Error loading order confirmation:", error);
    req.session.message = "Error loading order confirmation page.";
    res.redirect("/user/profile");
  }
};

// Update orderSchema to include payment details
exports.updateOrderSchema = async () => {
  try {
    // This is just a placeholder function to document the schema change
    // In a real application, we'd use a migration script
    // The actual schema update is in the orderSchema.js file
    console.log('Order schema updated to include payment details');
  } catch (error) {
    console.error('Error updating order schema:', error);
  }
};

exports.loadOrderDetails = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const orderId = req.params.orderId;

    const order = await Order.findOne({ orderId, user: userId }).populate("items.product").populate("coupon");
    if (!order) {
      req.session.message = "Order not found.";
      return res.redirect("/user/profile");
    }

    const orderDate = new Date(order.createdAt);
    const estimatedDelivery = new Date(orderDate);
    estimatedDelivery.setDate(orderDate.getDate() + 5);

    const message = req.session.message || '';
    req.session.message = null;

    res.render("user/order-details", {
      order,
      orderDate: orderDate.toLocaleDateString(),
      estimatedDelivery: estimatedDelivery.toLocaleDateString(),
      user: req.session.user,
      title: "Order Details",
      message,
    });
  } catch (error) {
    console.error("Error loading order details:", error);
    req.session.message = "Error loading order details page.";
    res.redirect("/user/profile");
  }
};

exports.loadOrderHistory = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';

    let query = { user: userId };
    if (search) {
      query = {
        user: userId,
        $or: [
          { orderId: { $regex: search, $options: 'i' } },
          { status: { $regex: search, $options: 'i' } },
          {
            'items.product': {
              $in: await Product.find({
                productName: { $regex: search, $options: 'i' }
              }).distinct('_id')
            }
          }
        ]
      };
    }

    const orders = await Order.find(query)
      .populate("items.product")
      .populate("coupon")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalOrders = await Order.countDocuments(query);

    const message = req.session.message || '';
    req.session.message = null;

    res.render("user/orders", {
      orders,
      page,
      limit,
      totalOrders,
      user: req.session.user,
      title: "Order History",
      message,
      search
    });
  } catch (error) {
    console.error("Error loading order history:", error);
    req.session.message = "Error loading order history page.";
    res.redirect("/user/profile");
  }
};

exports.cancelOrder = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const orderId = req.params.orderId;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ success: false, message: 'Cancellation reason is required.' });
    }

    const order = await Order.findOne({ orderId, user: userId }).populate("coupon");
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    if (order.status !== 'Pending' && order.status !== 'Confirmed') {
      return res.status(400).json({ success: false, message: 'Order cannot be cancelled at this stage.' });
    }

    // Return stock to inventory
    for (const item of order.items) {
      await Product.updateOne(
        { _id: item.product, "variants.sku": item.sku },
        { $inc: { "variants.$.stock_quantity": item.quantity } }
      );
    }

    // Return coupon usage if applicable
    if (order.coupon) {
      const coupon = await Coupon.findById(order.coupon);
      if (coupon) {
        coupon.usedCount -= 1;
        coupon.usedBy = coupon.usedBy.filter(
          (entry) => entry.user.toString() !== userId.toString()
        );
        await coupon.save();
      }
    }

    // Process refund based on payment method
    if (order.paymentMethod === 'Wallet' || order.paymentMethod === 'Razorpay') {
      // Get or create wallet
      let wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        wallet = new Wallet({
          userId,
          balance: 0,
          transactions: []
        });
      }

      // For Razorpay payments, try to process refund through Razorpay first
      if (order.paymentMethod === 'Razorpay' && order.paymentDetails && order.paymentDetails.razorpayPaymentId) {
        try {
          // Attempt to refund through Razorpay API
          const refund = await razorpay.payments.refund(order.paymentDetails.razorpayPaymentId, {
            amount: Math.round(order.total * 100), // Convert to paise
            notes: {
              orderId: order.orderId,
              reason: reason
            }
          });

          // Record refund details in order
          order.refundDetails = {
            refundId: refund.id,
            amount: order.total,
            status: refund.status,
            processedAt: new Date()
          };

          // Also add to wallet for record keeping
          wallet.balance += order.total;
          wallet.transactions.push({
            transactionType: "credit",
            transactionAmount: order.total,
            description: `Refund for order ${order.orderId} (cancelled) - Razorpay refund ID: ${refund.id}`,
            createdAt: new Date(),
          });

          console.log(`Razorpay refund processed successfully for order ${order.orderId}`);
        } catch (refundError) {
          console.error(`Razorpay refund failed for order ${order.orderId}:`, refundError);

          // Fallback to wallet refund if Razorpay refund fails
          wallet.balance += order.total;
          wallet.transactions.push({
            transactionType: "credit",
            transactionAmount: order.total,
            description: `Refund for order ${order.orderId} (cancelled) - Added to wallet`,
            createdAt: new Date(),
          });
        }
      } else if (order.paymentMethod === 'Wallet') {
        // Direct wallet refund for wallet payments
        wallet.balance += order.total;
        wallet.transactions.push({
          transactionType: "credit",
          transactionAmount: order.total,
          description: `Refund for order ${order.orderId} (cancelled)`,
          createdAt: new Date(),
        });
      }

      await wallet.save();
    }

    order.status = 'Cancelled';
    order.cancelReason = reason;
    await order.save();

    res.json({ success: true, message: 'Order cancelled successfully.' });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ success: false, message: 'Error cancelling order.' });
  }
};

exports.requestReturn = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const orderId = req.params.orderId;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ success: false, message: 'Return reason is required.' });
    }

    const order = await Order.findOne({ orderId, user: userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    if (order.status !== 'Delivered' || order.return.requested) {
      return res.status(400).json({ success: false, message: 'Return cannot be requested for this order.' });
    }

    order.status = 'Return Requested';
    order.return.requested = true;
    order.return.reason = reason;
    order.return.status = 'pending';
    order.return.requestedAt = new Date();
    order.returnReason = reason;
    await order.save();

    res.json({ success: true, message: 'Return request submitted successfully.' });
  } catch (error) {
    console.error('Error requesting return:', error);
    res.status(500).json({ success: false, message: 'Error requesting return.' });
  }
};

exports.generateInvoice = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const orderId = req.params.orderId;

    const order = await Order.findOne({ orderId, user: userId })
      .populate('items.product')
      .populate('coupon');

    if (!order) {
      req.session.message = 'Order not found.';
      return res.redirect('/user/orders');
    }

    if (order.status !== 'Delivered') {
      req.session.message = 'Invoice can only be generated for delivered orders.';
      return res.redirect(`/order-details/${orderId}`);
    }

    const doc = new PDFDocument({
      size: 'A4',
      margin: 50
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice_${order.orderId}.pdf`);

    doc.pipe(res);

    doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('CHOCOLUXE', 50, 50)
      .fontSize(10)
      .font('Helvetica')
      .text('123 Sweet Street, Chocolate City, India', 50, 75)
      .text('Phone: +91 12345 67890', 50, 90)
      .text('Email: contact@chocoluxe.com', 50, 105);

    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .text(`Invoice #${order.orderId}`, 50, 150)
      .fontSize(12)
      .font('Helvetica')
      .text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`, 50, 170)
      .text(`Payment Method: ${order.paymentMethod}`, 50, 190); // Added payment method to invoice

    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('Bill To:', 50, 220)
      .font('Helvetica')
      .fontSize(10)
      .text(order.shippingAddress.name, 50, 235)
      .text(order.shippingAddress.address, 50, 250)
      .text(`${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.pincode}`, 50, 265)
      .text(`Phone: ${order.shippingAddress.phone}`, 50, 280);

    const tableTop = 320;
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('Item', 50, tableTop)
      .text('Description', 150, tableTop)
      .text('Quantity', 350, tableTop, { width: 50, align: 'right' })
      .text('Price', 400, tableTop, { width: 50, align: 'right' })
      .text('Subtotal', 450, tableTop, { width: 50, align: 'right' });

    doc
      .strokeColor('#aaaaaa')
      .lineWidth(1)
      .moveTo(50, tableTop + 15)
      .lineTo(550, tableTop + 15)
      .stroke();

    let y = tableTop + 30;
    order.items.forEach((item, index) => {
      const variant = item.product.variants.find(v => v.sku === item.sku);
      doc
        .font('Helvetica')
        .fontSize(10)
        .text(item.product.productName, 50, y)
        .text(`Flavor: ${variant.flavor}, Sugar: ${variant.sugarLevel}, Weight: ${variant.weight}g`, 150, y)
        .text(item.quantity.toString(), 350, y, { width: 50, align: 'right' })
        .text(`₹${item.price.toFixed(2)}`, 400, y, { width: 50, align: 'right' })
        .text(`₹${item.subtotal.toFixed(2)}`, 450, y, { width: 50, align: 'right' });
      y += 20;
    });

    const summaryTop = y + 20;
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(`Subtotal: ₹${order.subtotal.toFixed(2)}`, 400, summaryTop, { align: 'right' })
      .text(`Total Savings: -₹${order.totalSavings.toFixed(2)}`, 400, summaryTop + 15, { align: 'right' });

    if (order.coupon) {
      doc
        .text(`Coupon (${order.coupon.code}): -₹${order.discount.toFixed(2)}`, 400, summaryTop + 30, { align: 'right' });
      doc
        .text('Shipping: Free', 400, summaryTop + 45, { align: 'right' })
        .font('Helvetica-Bold')
        .text(`Total: ₹${order.total.toFixed(2)}`, 400, summaryTop + 60, { align: 'right' });
    } else {
      doc
        .text('Shipping: Free', 400, summaryTop + 30, { align: 'right' })
        .font('Helvetica-Bold')
        .text(`Total: ₹${order.total.toFixed(2)}`, 400, summaryTop + 45, { align: 'right' });
    }

    doc
      .fontSize(10)
      .font('Helvetica')
      .text('Thank you for shopping with CHOCOLUXE!', 50, summaryTop + 95, { align: 'center' })
      .text('For any queries, contact us at contact@chocoluxe.com', 50, summaryTop + 110, { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Error generating invoice:', error);
    req.session.message = 'Error generating invoice.';
    res.redirect(`/order-details/${req.params.orderId}`);
  }
};