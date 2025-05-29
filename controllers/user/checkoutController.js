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


const calculateDeliveryCharge = (subtotal) => {
  // Delivery charge structure
  if (subtotal >= 1000) {
    return 0; // Free delivery for orders ₹1000 and above
  } else if (subtotal >= 750) {
    return 30; // ₹30 for orders between ₹750 - ₹999
  } else if (subtotal >= 500) {
    return 40; // ₹40 for orders between ₹500 - ₹749
  } else if (subtotal >= 250) {
    return 50; // ₹50 for orders between ₹250 - ₹499
  } else {
    return 60; // ₹60 for orders below ₹250
  }
};

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

    // Calculate the discounted subtotal
    const discountedSubtotal = subtotal - discount;
    
    // Calculate delivery charge based on discounted subtotal
    const deliveryCharge = calculateDeliveryCharge(discountedSubtotal);
    
    // Calculate final total including delivery charge
    cartTotal = discountedSubtotal + deliveryCharge;
  }

  return { 
    cartTotal, 
    totalSavings, 
    itemCount, 
    subtotal, 
    discount, 
    appliedCoupon,
    deliveryCharge: cart && cart.items.length > 0 ? calculateDeliveryCharge(subtotal - discount) : 0
  };
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
     
      const itemMessages = outOfStockItems.map(item => 
        `${item.productName} (Available: ${item.available}, Requested: ${item.requested})`
      ).join(', ');
      
      req.session.message = `Some items in your cart are out of stock: ${itemMessages}. Please update quantities or remove these items to proceed.`;
      return res.redirect("/cart");
    }

    const { subtotal, totalSavings, discount, cartTotal: total, appliedCoupon } = await calculateCartTotals(cart, userId);
    
    // Calculate delivery charge based on discounted subtotal
    const discountedSubtotal = subtotal - discount;
    const deliveryCharge = calculateDeliveryCharge(discountedSubtotal);
    
    const addresses = await Address.find({ userId }).sort({ isDefault: -1, createdAt: -1 });
    const wallet = await Wallet.findOne({ userId }) || { balance: 0 }; 

    const message = req.session.message || '';
    req.session.message = null;

    // Check if COD is available (not available for orders above Rs 1000)
    const isCodAvailable = total <= 1000;

    res.render("user/checkout", {
      cartItems,
      subtotal,
      totalSavings,
      discount,
      deliveryCharge,
      total,
      appliedCoupon,
      addresses,
      wallet, 
      user: req.session.user,
      title: "Checkout",
      message,
      isCodAvailable
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

    // Get cart to validate payment method against total
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

    const { subtotal, totalSavings, discount, appliedCoupon, deliveryCharge, cartTotal: total } = await calculateCartTotals(cart, userId);

    // Validate COD is not used for orders above Rs 1000
    if (paymentMethod === "Cash on Delivery" && total > 1000) {
      req.session.message = "Cash on Delivery is not available for orders above ₹1000. Please choose another payment method.";
      return res.redirect("/checkout");
    }

    
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
      deliveryCharge,
      totalSavings,
      total,
      paymentMethod,
      status: paymentMethod === "Wallet" ? "Confirmed" : 
       paymentMethod === "Razorpay" ? "Pending Payment" : "Pending", 
    });

    await order.save();


    await Cart.findOneAndUpdate({ user: userId }, { $set: { items: [], coupon: null, discount: 0 } });

    res.redirect(`/order-confirmation/${order.orderId}`);
  } catch (error) {
    console.error("Error placing order:", error);
    req.session.message = "Error placing order: " + error.message;
    res.redirect("/checkout");
  }
};

exports.createRazorpayOrder = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { addressId } = req.body;

    
    const address = await Address.findOne({ _id: addressId, userId });
    if (!address) {
      return res.json({ success: false, message: "Please select a valid address." });
    }

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

    const { subtotal, totalSavings, discount, cartTotal: total, appliedCoupon } = await calculateCartTotals(cart, userId);
    
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

    
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(total * 100), 
      currency: 'INR',
      receipt: orderId,
      payment_capture: 1, 
    });

    
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


exports.verifyPayment = async (req, res) => {
  try {
    const { payment, order: razorpayOrder } = req.body;
    
    
    const pendingOrder = req.session.pendingRazorpayOrder;
    if (!pendingOrder || pendingOrder.razorpayOrderId !== razorpayOrder.id) {
      return res.json({ success: false, message: "Invalid order details." });
    }

    
    const text = razorpayOrder.id + "|" + payment.razorpay_payment_id;
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(text)
      .digest("hex");

    if (generatedSignature !== payment.razorpay_signature) {
      return res.json({ success: false, message: "Invalid payment signature." });
    }


   
    const userId = pendingOrder.userId;
    const addressId = pendingOrder.addressId;
    const orderId = pendingOrder.orderId;

    
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

   
    for (const update of stockUpdates) {
      await Product.updateOne(
        { _id: update.productId, "variants.sku": update.sku },
        { $inc: { "variants.$.stock_quantity": -update.quantity } }
      );
    }

    
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
      status: "Confirmed", 
      paymentDetails: {
        razorpayOrderId: razorpayOrder.id,
        razorpayPaymentId: payment.razorpay_payment_id,
        razorpaySignature: payment.razorpay_signature
      }
    });

    await newOrder.save();

    
    await Cart.findOneAndUpdate({ user: userId }, { $set: { items: [], coupon: null, discount: 0 } });
    

    delete req.session.pendingRazorpayOrder;

    return res.json({ success: true, orderId: newOrder.orderId });
  } catch (error) {
    console.error("Error verifying payment:", error);
    return res.json({ success: false, message: "Error verifying payment: " + error.message });
  }
};


exports.handlePaymentFailure = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const pendingOrder = req.session.pendingRazorpayOrder;
    

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


exports.handlePaymentCancellation = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const pendingOrder = req.session.pendingRazorpayOrder;
    
   
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


exports.retryPayment = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.session.user._id;
    
    
    const order = await Order.findOne({ orderId, user: userId });
    if (!order) {
      
      return res.redirect("/checkout");
    }
    
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(order.total * 100), 
      currency: 'INR',
      receipt: order.orderId,
      payment_capture: 1, 
    });
    
  
    req.session.pendingRazorpayOrder = {
      orderId: order.orderId,
      addressId: null, 
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

    
    for (const item of order.items) {
      await Product.updateOne(
        { _id: item.product, "variants.sku": item.sku },
        { $inc: { "variants.$.stock_quantity": item.quantity } }
      );
    }


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

    if (order.paymentMethod === 'Wallet' || order.paymentMethod === 'Razorpay') {
      
      let wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        wallet = new Wallet({
          userId,
          balance: 0,
          transactions: []
        });
      }

      
      if (order.paymentMethod === 'Razorpay' && order.paymentDetails && order.paymentDetails.razorpayPaymentId) {
        try {
          
          const refund = await razorpay.payments.refund(order.paymentDetails.razorpayPaymentId, {
            amount: Math.round(order.total * 100), 
            notes: {
              orderId: order.orderId,
              reason: reason
            }
          });

          
          order.refundDetails = {
            refundId: refund.id,
            amount: order.total,
            status: refund.status,
            processedAt: new Date()
          };

          
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

          
          wallet.balance += order.total;
          wallet.transactions.push({
            transactionType: "credit",
            transactionAmount: order.total,
            description: `Refund for order ${order.orderId} (cancelled) - Added to wallet`,
            createdAt: new Date(),
          });
        }
      } else if (order.paymentMethod === 'Wallet') {
        
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