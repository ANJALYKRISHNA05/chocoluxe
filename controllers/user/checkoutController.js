const Cart = require("../../models/cartSchema");
const Address = require("../../models/addressSchema");
const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

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
    });
    if (!cart || cart.items.length === 0) {
      req.session.message = "Your cart is empty.";
      return res.redirect("/cart");
    }

    let invalidItems = [];
    let subtotal = 0;
    let totalSavings = 0;
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

        subtotal += itemSubtotal;
        totalSavings += itemSavings;
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

    const total = subtotal;
    const addresses = await Address.find({ userId }).sort({ isDefault: -1, createdAt: -1 });

    const message = req.session.message || '';
    req.session.message = null;

    res.render("user/checkout", {
      cartItems,
      subtotal,
      totalSavings,
      total,
      addresses,
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

    if (!paymentMethod || paymentMethod !== "Cash on Delivery") {
      req.session.message = "Please select a valid payment method.";
      return res.redirect("/checkout");
    }

    const cart = await Cart.findOne({ user: userId }).populate({
      path: "items.product",
      populate: {
        path: "category",
        model: "Category",
      },
    });
    if (!cart || cart.items.length === 0) {
      req.session.message = "Your cart is empty.";
      return res.redirect("/cart");
    }

    let subtotal = 0;
    let totalSavings = 0;
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
      const originalPrice = basePrice;
      const itemSubtotal = offerPrice * item.quantity;
      const itemSavings = (originalPrice - offerPrice) * item.quantity;

      subtotal += itemSubtotal;
      totalSavings += itemSavings;

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

    const total = subtotal;

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
      subtotal,
      totalSavings,
      total,
      paymentMethod,
      status: "Pending",
    });

    await order.save();

    await Cart.findOneAndUpdate({ user: userId }, { $set: { items: [] } });

    res.redirect(`/order-confirmation/${order.orderId}`);
  } catch (error) {
    console.error("Error placing order:", error);
    req.session.message = "Error placing order: " + error.message;
    res.redirect("/checkout");
  }
};

exports.loadOrderConfirmation = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const orderId = req.params.orderId;

    const order = await Order.findOne({ orderId, user: userId }).populate("items.product");
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

    const order = await Order.findOne({ orderId, user: userId }).populate("items.product");
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

    const order = await Order.findOne({ orderId, user: userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    if (order.status !== 'Pending' && order.status !== 'confirmed') {
      return res.status(400).json({ success: false, message: 'Order cannot be cancelled in this status.' });
    }

    for (const item of order.items) {
      await Product.updateOne(
        { _id: item.product, "variants.sku": item.sku },
        { $inc: { "variants.$.stock_quantity": item.quantity } }
      );
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
      .populate('items.product');

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
      .text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`, 50, 170);

    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('Bill To:', 50, 200)
      .font('Helvetica')
      .fontSize(10)
      .text(order.shippingAddress.name, 50, 215)
      .text(order.shippingAddress.address, 50, 230)
      .text(`${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.pincode}`, 50, 245)
      .text(`Phone: ${order.shippingAddress.phone}`, 50, 260);

    const tableTop = 300;
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
      .text(`Total Savings: -₹${order.totalSavings.toFixed(2)}`, 400, summaryTop + 15, { align: 'right' })
      .text('Shipping: Free', 400, summaryTop + 30, { align: 'right' })
      .font('Helvetica-Bold')
      .text(`Total: ₹${order.total.toFixed(2)}`, 400, summaryTop + 45, { align: 'right' });

    doc
      .fontSize(10)
      .font('Helvetica')
      .text('Thank you for shopping with CHOCOLUXE!', 50, summaryTop + 80, { align: 'center' })
      .text('For any queries, contact us at contact@chocoluxe.com', 50, summaryTop + 95, { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Error generating invoice:', error);
    req.session.message = 'Error generating invoice.';
    res.redirect(`/order-details/${req.params.orderId}`);
  }
};