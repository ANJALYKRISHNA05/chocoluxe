const Wishlist = require('../../models/wishlistSchema');
const Product = require('../../models/productSchema');

exports.addToWishlist = async (req, res) => {
  try {
    const { productId, variantId } = req.body;
    const userId = req.session.user;
   

    if (!productId || !variantId) {
      return res.status(400).json({ success: false, message: 'Product ID and Variant ID are required' });
    }

    const product = await Product.findById(productId);
    if (!product || !product.variants.some(v => v._id.toString() === variantId)) {
      console.log('here is the')
      return res.status(400).json({ success: false, message: 'Invalid product or variant' });
    }

    let wishlist = await Wishlist.findOne({ user: userId });
    if (!wishlist) {
      wishlist = new Wishlist({ user: userId, items: [] });
    }
 
    const itemExists = wishlist.items.some(
      item => item.product.toString() === productId && item.variantId.toString() === variantId
    );

    if (itemExists) {
      return res.json({ success: false, message: 'Product variant already in wishlist' });
    }

    wishlist.items.push({ product: productId, variantId });
    await wishlist.save();

    const itemCount = wishlist.items.length;
    res.json({ success: true, itemCount, message: 'Product added to wishlist successfully' });
  } catch (error) {
    console.error('Error adding to wishlist:', error);
    res.status(500).json({ success: false, message: 'An error occurred. Please try again.' });
  }
};

exports.loadWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    const wishlist = await Wishlist.findOne({ user: userId }).populate({
      path: 'items.product',
      populate: { path: 'category' }
    });

    let wishlistItems = [];
    if (wishlist && wishlist.items.length > 0) {
      wishlistItems = wishlist.items.map(item => {
        const product = item.product;
        const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
    
        return {
          productId: product._id,
          productName: product.productName,
          variantId: item.variantId,
          flavor: variant.flavor,
          sugarLevel: variant.sugarLevel,
          weight: variant.weight,
          salePrice: variant.salePrice,
          regularPrice: variant.regularPrice,
          stockQuantity: variant.stock_quantity,
          productImage: variant.productImage[0]
        };
      });
    }

    res.render('user/wishlist', {
      wishlistItems,
      title: 'Wishlist',
      user: req.session.user || null
    });
  } catch (error) {
    console.error('Error loading wishlist:', error);
    res.redirect('/wishlist');
  }
};

exports.removeFromWishlist = async (req, res) => {
  try {
    const { productId, variantId } = req.body;
    const userId = req.session.user;

    const wishlist = await Wishlist.findOne({ user: userId });
    if (!wishlist) {
      return res.status(400).json({ success: false, message: 'Wishlist not found' });
    }

    wishlist.items = wishlist.items.filter(
      item => !(item.product.toString() === productId && item.variantId.toString() === variantId)
    );

    await wishlist.save();

    const itemCount = wishlist.items.length;
    res.json({ success: true, itemCount, message: 'Product removed from wishlist' });
  } catch (error) {
    console.error('Error removing from wishlist:', error);
    res.status(500).json({ success: false, message: 'An error occurred. Please try again.' });
  }
};

exports.getWishlistItemCount = async (req, res) => {
  try {
    const userId = req.session.user;
    const wishlist = await Wishlist.findOne({ user: userId });
    const itemCount = wishlist ? wishlist.items.length : 0;
    res.json({ itemCount });
  } catch (error) {
    console.error('Error fetching wishlist count:', error);
    res.status(500).json({ itemCount: 0 });
  }
};