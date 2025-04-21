const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const { cloudinary } = require('../../config/cloudinary');

const productController = {
  // Get all products (with pagination and search)
  getProducts: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 5;
      const skip = (page - 1) * limit;
      const searchQuery = req.query.search || '';

      let query = {};
      if (searchQuery) {
        query.productName = { $regex: searchQuery, $options: 'i' };
      }

      const totalProducts = await Product.countDocuments(query);
      const products = await Product.find(query)
        .populate('category')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      res.render('admin/admin_product_list', {
        products,
        activePage: 'products',
        title: 'Product Management',
        currentPage: page,
        totalPages: Math.ceil(totalProducts / limit),
        limit,
        searchQuery
      });
    } catch (error) {
      console.error('Error loading products:', error);
      res.redirect('/admin/pageerror');
    }
  },

  // Get add product page
  getAddProductPage: async (req, res) => {
    try {
      const categories = await Category.find({ isListed: true });
      res.render('admin/admin_product_form', {
        product: null,
        categories,
        error: null,
        activePage: 'products',
        title: 'Add Product',
        isEdit: false
      });
    } catch (error) {
      console.error('Error loading add product page:', error);
      res.redirect('/admin/pageerror');
    }
  },

  // Get edit product page
  getEditProductPage: async (req, res) => {
    try {
      const productId = req.params.id;
      const product = await Product.findById(productId).populate('category');
      
      if (!product) {
        return res.redirect('/admin/products');
      }
      
      const categories = await Category.find({ isListed: true });
      
      res.render('admin/admin_product_form', {
        product,
        categories,
        error: null,
        activePage: 'products',
        title: 'Edit Product',
        isEdit: true
      });
    } catch (error) {
      console.error('Error loading edit product page:', error);
      res.redirect('/admin/pageerror');
    }
  },

  // Add new product
  addProduct: async (req, res) => {
    try {
      const {
        productName,
        description,
        category,
        flavors,
        sugarLevels,
        weights,
        stockQuantities,
        regularPrices,
        salePrices,
        existingImages
      } = req.body;
      
      // Validate minimum requirement of at least one variant
      if (!flavors || (typeof flavors === 'string' ? [flavors] : flavors).length === 0) {
        const categories = await Category.find({ isListed: true });
        return res.render('admin/admin_product_form', {
          product: req.body,
          categories,
          error: 'Product must have at least one variant',
          activePage: 'products',
          title: 'Add Product',
          isEdit: false
        });
      }

      // Process uploaded images
      let uploadedImages = [];
      if (req.files && req.files.length > 0) {
        uploadedImages = req.files.map(file => file.path);
      }
      
      // Handle both single and multiple variants
      const flavorArray = Array.isArray(flavors) ? flavors : [flavors];
      const sugarLevelArray = Array.isArray(sugarLevels) ? sugarLevels : [sugarLevels];
      const weightArray = Array.isArray(weights) ? weights : [weights];
      const stockQuantityArray = Array.isArray(stockQuantities) ? stockQuantities : [stockQuantities];
      const regularPriceArray = Array.isArray(regularPrices) ? regularPrices : [regularPrices];
      const salePriceArray = Array.isArray(salePrices) ? salePrices : [salePrices];
      
      // Create variants array
      const variants = [];
      for (let i = 0; i < flavorArray.length; i++) {
        variants.push({
          flavor: flavorArray[i],
          sugarLevel: sugarLevelArray[i],
          weight: weightArray[i],
          stock_quantity: stockQuantityArray[i],
          regularPrice: regularPriceArray[i],
          salePrice: salePriceArray[i],
          productImage: uploadedImages // All variants share the same images
        });
      }
      
      // Create and save new product
      const newProduct = new Product({
        productName,
        description,
        category,
        variants,
        isBlocked: false
      });
      
      await newProduct.save();
      res.redirect('/admin/products');
    } catch (error) {
      console.error('Error adding product:', error);
      res.redirect('/admin/pageerror');
    }
  },

  // Edit existing product
  editProduct: async (req, res) => {
    try {
      const productId = req.params.id;
      const {
        productName,
        description,
        category,
        flavors,
        sugarLevels,
        weights,
        stockQuantities,
        regularPrices,
        salePrices,
        existingImages
      } = req.body;
      
      // Get the existing product
      const product = await Product.findById(productId);
      if (!product) {
        return res.redirect('/admin/products');
      }
      
      // Validate minimum requirement of at least one variant
      if (!flavors || (typeof flavors === 'string' ? [flavors] : flavors).length === 0) {
        const categories = await Category.find({ isListed: true });
        return res.render('admin/admin_product_form', {
          product: { ...req.body, _id: productId },
          categories,
          error: 'Product must have at least one variant',
          activePage: 'products',
          title: 'Edit Product',
          isEdit: true
        });
      }
      
      // Process existing images
      let images = [];
      if (existingImages) {
        // Handle both single and multiple existing images
        images = Array.isArray(existingImages) ? existingImages : [existingImages];
      }
      
      // Add newly uploaded images
      if (req.files && req.files.length > 0) {
        const uploadedImages = req.files.map(file => file.path);
        images = [...images, ...uploadedImages];
      }
      
      // Handle both single and multiple variants
      const flavorArray = Array.isArray(flavors) ? flavors : [flavors];
      const sugarLevelArray = Array.isArray(sugarLevels) ? sugarLevels : [sugarLevels];
      const weightArray = Array.isArray(weights) ? weights.map(Number) : [Number(weights)];
      const stockQuantityArray = Array.isArray(stockQuantities) ? stockQuantities.map(Number) : [Number(stockQuantities)];
      const regularPriceArray = Array.isArray(regularPrices) ? regularPrices.map(Number) : [Number(regularPrices)];
      const salePriceArray = Array.isArray(salePrices) ? salePrices.map(Number) : [Number(salePrices)];
      
      // Create updated variants array
      const updatedVariants = [];
      for (let i = 0; i < flavorArray.length; i++) {
        updatedVariants.push({
          flavor: flavorArray[i],
          sugarLevel: sugarLevelArray[i],
          weight: weightArray[i],
          stock_quantity: stockQuantityArray[i],
          regularPrice: regularPriceArray[i],
          salePrice: salePriceArray[i],
          productImage: images // All variants share the same images
        });
      }
      
      // Update product
      product.productName = productName;
      product.description = description;
      product.category = category;
      product.variants = updatedVariants;
      
      await product.save();
      res.redirect('/admin/products');
    } catch (error) {
      console.error('Error editing product:', error);
      res.redirect('/admin/pageerror');
    }
  },

  // Block product
  blockProduct: async (req, res) => {
    try {
      const productId = req.params.id;
      await Product.findByIdAndUpdate(productId, { isBlocked: true });
      res.json({ success: true, message: 'Product blocked successfully' });
    } catch (error) {
      console.error('Error blocking product:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  // Unblock product
  unblockProduct: async (req, res) => {
    try {
      const productId = req.params.id;
      await Product.findByIdAndUpdate(productId, { isBlocked: false });
      res.json({ success: true, message: 'Product unblocked successfully' });
    } catch (error) {
      console.error('Error unblocking product:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
};

module.exports = productController;