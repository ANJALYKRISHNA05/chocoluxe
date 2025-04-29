const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');

// Add to cart
exports.addToCart = async (req, res) => {
  try {
    const { productId, variantId, quantity } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please log in to add items to cart' });
    }

    const product = await Product.findById(productId);
    if (!product || product.isBlocked) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const variant = product.variants.find(v => v._id.toString() === variantId);
    if (!variant || variant.stock_quantity < quantity) {
      return res.status(400).json({ success: false, message: 'Invalid variant or insufficient stock' });
    }

    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      cart = new Cart({ user: userId, items: [] });
    }

    const existingItemIndex = cart.items.findIndex(item => 
      item.product.toString() === productId && 
      item.flavor === variant.flavor && 
      item.sugarLevel === variant.sugarLevel && 
      item.weight === variant.weight
    );

    if (existingItemIndex > -1) {
      cart.items[existingItemIndex].quantity += quantity;
      cart.items[existingItemIndex].price = variant.salePrice * cart.items[existingItemIndex].quantity;
    } else {
      cart.items.push({
        product: productId,
        flavor: variant.flavor,
        sugarLevel: variant.sugarLevel,
        weight: variant.weight,
        quantity,
        price: variant.salePrice * quantity,
        productImage: variant.productImage[0]
      });
    }

    await cart.save();
    const itemCount = cart.items.length; // Count unique items

    res.json({ success: true, message: 'Product added to cart', itemCount });
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Load cart page
exports.loadCart = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect('/user/login');
    }

    const cart = await Cart.findOne({ user: userId }).populate('items.product');
    let cartItems = [];
    let total = 0;

    if (cart && cart.items.length > 0) {
      cartItems = cart.items.map(item => {
        const subtotal = item.price - (item.discount || 0);
        total += subtotal;
        return { ...item.toObject(), subtotal };
      });
    }

    res.render('user/cart', {
      cartItems,
      total,
      user: req.session.user || null,
      title: 'Your Cart'
    });
  } catch (error) {
    console.error('Error loading cart:', error);
    res.redirect('/user/pageNotfound');
  }
};

// Update cart item quantity
exports.updateCartQuantity = async (req, res) => {
  try {
    const { itemId, quantity } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please log in' });
    }

    if (!itemId || quantity < 1) {
      return res.status(400).json({ success: false, message: 'Invalid item ID or quantity' });
    }

    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const item = cart.items.find(item => item._id.toString() === itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found in cart' });
    }

    const product = await Product.findById(item.product);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const variant = product.variants.find(v => 
      v.flavor === item.flavor && 
      v.sugarLevel === item.sugarLevel && 
      v.weight === item.weight
    );

    if (!variant) {
      return res.status(400).json({ success: false, message: 'Variant not found' });
    }

    if (quantity > variant.stock_quantity) {
      return res.status(400).json({ success: false, message: `Only ${variant.stock_quantity} items available in stock` });
    }

    item.quantity = quantity;
    item.price = variant.salePrice * quantity;
    await cart.save();

    const cartTotal = cart.items.reduce((sum, item) => sum + (item.price - (item.discount || 0)), 0);
    const itemCount = cart.items.length; // Count unique items

    res.json({
      success: true,
      itemSubtotal: item.price,
      cartTotal,
      itemCount
    });
  } catch (error) {
    console.error('Error updating cart quantity:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Remove item from cart
exports.removeFromCart = async (req, res) => {
  try {
    const { itemId } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please log in' });
    }

    if (!itemId) {
      return res.status(400).json({ success: false, message: 'Invalid item ID' });
    }

    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const itemIndex = cart.items.findIndex(item => item._id.toString() === itemId);
    if (itemIndex === -1) {
      return res.status(404).json({ success: false, message: 'Item not found in cart' });
    }

    cart.items.splice(itemIndex, 1);
    await cart.save();

    const cartTotal = cart.items.reduce((sum, item) => sum + (item.price - (item.discount || 0)), 0);
    const itemCount = cart.items.length; // Count unique items

    res.json({
      success: true,
      message: 'Item removed from cart',
      cartTotal,
      itemCount
    });
  } catch (error) {
    console.error('Error removing item from cart:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};