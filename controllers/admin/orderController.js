const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');

exports.loadOrders = async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      
      // Get search parameters
      const { orderId, status, username } = req.query;
      
      // Build query object
      const query = {};
      if (orderId) {
        query.orderId = { $regex: orderId, $options: 'i' };
      }
      if (status) {
        query.status = status;
      }
      
      // Find matching users if username search is provided
      let userIds = [];
      if (username) {
        const users = await User.find({ 
          username: { $regex: username, $options: 'i' } 
        }).select('_id');
        userIds = users.map(user => user._id);
        query.user = { $in: userIds };
      }
  
      // Execute query
      const ordersQuery = Order.find(query)
        .populate('user', 'username')
        .sort({ createdAt: -1 });
      
      // Apply pagination
      const orders = await ordersQuery
        .skip(skip)
        .limit(limit)
        .exec();
  
      // Get total count for pagination
      const totalOrders = await Order.countDocuments(query);
  
      res.render('admin/orders', {
        orders,
        currentPage: page,
        totalPages: Math.ceil(totalOrders / limit),
        totalOrders,
        limit,
        title: 'Orders',
        searchParams: { orderId, status, username }
      });
    } catch (error) {
      console.error('Error loading orders:', error);
      res.redirect('/admin/pageerror');
    }
  };
  

exports.loadOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const order = await Order.findOne({ orderId })
      .populate('user', 'username')
      .populate('items.product');

    if (!order) {
      return res.redirect('/admin/pageerror');
    }

    res.render('admin/order-details', {
      order,
      orderDate: new Date(order.createdAt).toLocaleDateString(),
      title: 'Order Details'
    });
  } catch (error) {
    console.error('Error loading order details:', error);
    res.redirect('/admin/pageerror');
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const { status } = req.body;

    const validStatuses = ['Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled', 'Return Requested', 'Returned'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const statusTransitions = {
      Pending: ['Confirmed', 'Cancelled'],
      Confirmed: ['Shipped', 'Cancelled'],
      Shipped: ['Delivered', 'Cancelled'],
      Delivered: ['Return Requested'],
      'Return Requested': ['Returned', 'Delivered'],
      Returned: [],
      Cancelled: []
    };

    const currentStatus = order.status;
    if (!statusTransitions[currentStatus]) {
      return res.status(400).json({
        success: false,
        message: `No transitions defined for status ${currentStatus}`
      });
    }

    if (!statusTransitions[currentStatus].includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot transition from ${currentStatus} to ${status}`
      });
    }

    const updatedOrder = await Order.findOneAndUpdate(
      { orderId },
      { status },
      { new: true }
    );

    res.json({ success: true, message: 'Order status updated successfully' });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ success: false, message: 'Error updating order status' });
  }
};

exports.acceptReturn = async (req, res) => {
  try {
    const orderId = req.params.orderId;

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    if (!order.return.requested || order.return.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'No pending return request for this order.' });
    }

    for (const item of order.items) {
      await Product.updateOne(
        { _id: item.product, 'variants.sku': item.sku },
        { $inc: { 'variants.$.stock_quantity': item.quantity } }
      );
    }

    order.status = 'Returned';
    order.return.status = 'approved';
    order.return.processedAt = new Date();
    await order.save();

    res.json({ success: true, message: 'Return request approved successfully.' });
  } catch (error) {
    console.error('Error accepting return:', error);
    res.status(500).json({ success: false, message: 'Error accepting return.' });
  }
};

exports.rejectReturn = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const { rejectionReason } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    if (!order.return.requested || order.return.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'No pending return request for this order.' });
    }

    order.status = 'Delivered';
    order.return.status = 'rejected';
    order.return.rejectionReason = rejectionReason;
    order.return.processedAt = new Date();
    await order.save();

    res.json({ success: true, message: 'Return request rejected successfully.' });
  } catch (error) {
    console.error('Error rejecting return:', error);
    res.status(500).json({ success: false, message: 'Error rejecting return.' });
  }
};