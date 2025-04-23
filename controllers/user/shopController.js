const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');

// Load the homepage with categories and products
exports.loadShopHomepage = async (req, res) => {
  try {
    // Fetch all categories that are listed (isListed: true)
    const categories = await Category.find({ isListed: true }).sort({ name: 1 });

    // Fetch all products that are not blocked (isBlocked: false)
    const products = await Product.find({ isBlocked: false })
      .populate('category') // Get category details for each product
      .sort({ createdAt: -1 }) // Sort by newest first
      .limit(4); // Limit to 8 products for the homepage

    // Render the home.ejs template with categories, products, and user session data
    res.render('user/home', {
      categories,
      products,
      user: req.session.user || null // Pass user data if logged in
    });
  } catch (error) {
    console.error('Error loading shop homepage:', error);
    res.redirect('/user/pageNotfound'); // Redirect to 404 page on error
  }
};


exports.loadProductListing = async (req, res) => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = 12; // Products per page
    const skip = (page - 1) * limit;
    
    // Build filter query
    const filterQuery = { isBlocked: false };
    const selectedFilters = {
      categories: [],
      weights: [],
      flavors: [],
      sugarLevels: []
    };
    
    // Category filters
    if (req.query.category) {
      const categoryIds = Array.isArray(req.query.category) ? req.query.category : [req.query.category];
      filterQuery.category = { $in: categoryIds };
      selectedFilters.categories = categoryIds;
    }
    
    // Weight filters
    if (req.query.weight) {
      const weights = Array.isArray(req.query.weight) ? req.query.weight : [req.query.weight];
      filterQuery['variants.weight'] = { $in: weights.map(Number) };
      selectedFilters.weights = weights;
    }
    
    // Flavor filters
    if (req.query.flavor) {
      const flavors = Array.isArray(req.query.flavor) ? req.query.flavor : [req.query.flavor];
      filterQuery['variants.flavor'] = { $in: flavors };
      selectedFilters.flavors = flavors;
    }
    
    // Sugar level filters
    if (req.query.sugar) {
      const sugarLevels = Array.isArray(req.query.sugar) ? req.query.sugar : [req.query.sugar];
      const formattedSugarLevels = sugarLevels.map(level => {
        if (level === 'low') return 'Low';
        if (level === 'medium') return 'Medium';
        if (level === 'sugar-free') return 'Sugar-Free';
        return level;
      });
      filterQuery['variants.sugarLevel'] = { $in: formattedSugarLevels };
      selectedFilters.sugarLevels = sugarLevels;
    }
    
    // Sort options
    let sortOption = req.query.sort || 'newest';
    let sortCriteria = { createdAt: -1 }; // Default: newest first
    
    switch (sortOption) {
      case 'price-low-high':
        sortCriteria = { 'variants.0.salePrice': 1 };
        break;
      case 'price-high-low':
        sortCriteria = { 'variants.0.salePrice': -1 };
        break;
      case 'name-a-z':
        sortCriteria = { productName: 1 };
        break;
      case 'name-z-a':
        sortCriteria = { productName: -1 };
        break;
      default:
        sortOption = 'newest';
        sortCriteria = { createdAt: -1 };
    }
    
    // Fetch all categories for the filter sidebar
    const categories = await Category.find({ isListed: true });
    
    // Get all unique flavors from products
    const uniqueFlavors = await Product.distinct('variants.flavor');
    
    // Count total products that match the filter
    const totalProducts = await Product.countDocuments(filterQuery);
    const totalPages = Math.ceil(totalProducts / limit);
    
    // Fetch products with pagination
    const products = await Product.find(filterQuery)
      .populate('category')
      .sort(sortCriteria)
      .skip(skip)
      .limit(limit);
    
    // Build query string for pagination links
    let queryParams = '';
    if (req.query.category) {
      const categoryParams = Array.isArray(req.query.category) 
        ? req.query.category.map(c => `&category=${c}`).join('') 
        : `&category=${req.query.category}`;
      queryParams += categoryParams;
    }
    
    if (req.query.weight) {
      const weightParams = Array.isArray(req.query.weight) 
        ? req.query.weight.map(w => `&weight=${w}`).join('') 
        : `&weight=${req.query.weight}`;
      queryParams += weightParams;
    }
    
    if (req.query.flavor) {
      const flavorParams = Array.isArray(req.query.flavor) 
        ? req.query.flavor.map(f => `&flavor=${f}`).join('') 
        : `&flavor=${req.query.flavor}`;
      queryParams += flavorParams;
    }
    
    if (req.query.sugar) {
      const sugarParams = Array.isArray(req.query.sugar) 
        ? req.query.sugar.map(s => `&sugar=${s}`).join('') 
        : `&sugar=${req.query.sugar}`;
      queryParams += sugarParams;
    }
    
    if (req.query.sort) {
      queryParams += `&sort=${req.query.sort}`;
    }
    
    // Render the product listing page
    res.render('user/userProductList', {
      products,
      categories,
      flavors: uniqueFlavors,
      selectedFilters,
      sortOption,
      currentPage: page,
      totalPages,
      queryParams,
      title: 'Chocolate Collection'
    });
  } catch (error) {
    console.error('Error loading product listing:', error);
    res.status(500).render('user/error', { message: 'Something went wrong while loading products' });
  }
};

