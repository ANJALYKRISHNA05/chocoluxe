const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');


exports.loadShopHomepage = async (req, res) => {
  try {
    
    const categories = await Category.find({ isListed: true }).sort({ name: 1 });

    const products = await Product.find({ isBlocked: false })
      .populate('category') 
      .sort({ createdAt: -1 }) 
      .limit(4); 

    
    res.render('user/home', {
      categories,
      products,
      user: req.session.user || null 
    });
  } catch (error) {
    console.error('Error loading shop homepage:', error);
    res.redirect('/user/pageNotfound'); 
  }
};



exports.loadProductListing = async (req, res) => {
  try {
    // Get all categories for the filter sidebar
    const categories = await Category.find({ isListed: true }).sort({ name: 1 });
    
    // Initialize query to find products that are not blocked
    let query = { isBlocked: false };
    
    // Filter by search term (product name or description)
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      query.$or = [
        { productName: searchRegex },
        { description: searchRegex }
      ];
    }
    
    // Filter by category
    if (req.query.category) {
      query.category = req.query.category;
    }
    
    // Get all products based on the initial filters
    let products = await Product.find(query).populate('category');
    
    // Apply variant filters (doing this after the initial query as these are nested fields)
    const variantFiltersApplied = !!(req.query.flavor || req.query.sugarLevel || req.query.weight || 
                                    req.query.minPrice || req.query.maxPrice);
    
    // Process products with variant filtering and find the best variant for each product
    let processedProducts = products.map(product => {
      // Deep clone the product object to avoid modifying the original
      const processedProduct = JSON.parse(JSON.stringify(product));
      
      // Find all matching variants based on applied filters
      let matchingVariants = processedProduct.variants.filter(variant => {
        // If no variant filters applied, consider all variants as matching
        if (!variantFiltersApplied) return true;
        
        // Filter by flavor
        if (req.query.flavor && variant.flavor !== req.query.flavor) {
          return false;
        }
        
        // Filter by sugar level
        if (req.query.sugarLevel && variant.sugarLevel !== req.query.sugarLevel) {
          return false;
        }
        
        // Filter by weight
        if (req.query.weight && variant.weight !== parseInt(req.query.weight)) {
          return false;
        }
        
        // Filter by price range
        if (req.query.minPrice && variant.regularPrice < parseFloat(req.query.minPrice)) {
          return false;
        }
        
        if (req.query.maxPrice && variant.regularPrice > parseFloat(req.query.maxPrice)) {
          return false;
        }
        
        return true;
      });
      
      // If no matching variants, product should not be included
      if (matchingVariants.length === 0) {
        return null;
      }
      
      // Sort variants based on the requested sort option
      if (req.query.sort) {
        switch (req.query.sort) {
          case 'price_low_high':
            matchingVariants.sort((a, b) => a.regularPrice - b.regularPrice);
            break;
          case 'price_high_low':
            matchingVariants.sort((a, b) => b.regularPrice - a.regularPrice);
            break;
          default:
            // For other sort types, we'll handle at the product level
            break;
        }
      }
      
      // Attach the best matching variant to the product for display
      processedProduct.displayVariant = matchingVariants[0];
      
      // Also keep all matching variants for possible further use
      processedProduct.matchingVariants = matchingVariants;
      
      return processedProduct;
    }).filter(product => product !== null); // Remove products with no matching variants
    
    // Now sort the products based on the selected sort option
    if (req.query.sort) {
      switch (req.query.sort) {
        case 'price_low_high':
          processedProducts.sort((a, b) => a.displayVariant.regularPrice - b.displayVariant.regularPrice);
          break;
        case 'price_high_low':
          processedProducts.sort((a, b) => b.displayVariant.regularPrice - a.displayVariant.regularPrice);
          break;
        case 'name_asc':
          processedProducts.sort((a, b) => a.productName.localeCompare(b.productName));
          break;
        case 'name_desc':
          processedProducts.sort((a, b) => b.productName.localeCompare(a.productName));
          break;
        default:
          processedProducts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }
    } else {
      // Default sort by creation date (newest first)
      processedProducts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    
    // Prepare filter options for the template
    const flavors = ["Almond", "Caramel", "Peanut"];
    const sugarLevels = ["Low", "Medium", "Sugar-Free"];
    const weights = [50, 100, 200];
    
    res.render('user/product_listing', {
      products: processedProducts,
      categories,
      flavors,
      sugarLevels,
      weights,
      filters: req.query, // Pass current filters to maintain state
      user: req.session.user || null,
      title: 'Products'
    });
    
  } catch (error) {
    console.error('Error loading product listing:', error);
    res.redirect('/user/pageNotfound');
  }
};









exports.loadProductDetails = async (req, res) => {
  try {
    const productId = req.params.id;
    
    
    const product = await Product.findById(productId).populate('category');
    
    if (!product || product.isBlocked) {
      return res.redirect('/user/pageNotfound');
    }

    // Get related products from the same category
    const relatedProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: productId }, // exclude current product
      isBlocked: false
    }).limit(4);

    res.render('user/product_details', {
      product,
      relatedProducts,
      title: product.productName,
      user: req.session.user || null
    });
  } catch (error) {
    console.error('Error loading product details:', error);
    res.redirect('/user/pageNotfound');
  }
};



