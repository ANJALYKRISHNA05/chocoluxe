const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');

exports.loadShopHomepage = async (req, res) => {
  try {
    const categories = await Category.find({ isListed: true }).sort({ name: 1 });

    // Fetch products with unblocked status and listed category
    const products = await Product.find({ 
      isBlocked: false,
      category: { $in: await Category.find({ isListed: true }).distinct('_id') }
    })
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
    const categories = await Category.find({ isListed: true }).sort({ name: 1 });
    
    let query = { 
      isBlocked: false,
      category: { $in: await Category.find({ isListed: true }).distinct('_id') }
    };
    
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      query.$or = [
        { productName: searchRegex },
        { description: searchRegex }
      ];
    }
    
    if (req.query.category) {
      query.category = req.query.category;
    }
    
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = 4; // Number of products per page
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    let products = await Product.find(query)
      .populate('category')
      .skip(skip)
      .limit(limit);
   
    const variantFiltersApplied = !!(req.query.flavor || req.query.sugarLevel || req.query.weight || req.query.minPrice || req.query.maxPrice);
    
    let processedProducts = products.map(product => {
      const processedProduct = JSON.parse(JSON.stringify(product));
      
      let matchingVariants = processedProduct.variants.filter(variant => {
        if (!variantFiltersApplied) return true;
        
        if (req.query.flavor && variant.flavor !== req.query.flavor) {
          return false;
        }
        
        if (req.query.sugarLevel && variant.sugarLevel !== req.query.sugarLevel) {
          return false;
        }
  
        if (req.query.weight && variant.weight !== parseInt(req.query.weight)) {
          return false;
        }

        if (req.query.minPrice && variant.salePrice < parseFloat(req.query.minPrice)) {
          return false;
        }
        
        if (req.query.maxPrice && variant.salePrice > parseFloat(req.query.maxPrice)) {
          return false;
        }
        
        return true;
      });
   
      if (matchingVariants.length === 0) {
        return null;
      }
      
      if (req.query.sort) {
        switch (req.query.sort) {
          case 'price_low_high':
            matchingVariants.sort((a, b) => a.salePrice - b.salePrice);
            break;
          case 'price_high_low':
            matchingVariants.sort((a, b) => b.salePrice - a.salePrice);
            break;
          default:
            break;
        }
      }
    
      processedProduct.displayVariant = matchingVariants[0];
      processedProduct.matchingVariants = matchingVariants;
      
      return processedProduct;
    }).filter(product => product !== null); 
    
    if (req.query.sort) {
      switch (req.query.sort) {
        case 'price_low_high':
          processedProducts.sort((a, b) => a.displayVariant.salePrice - b.displayVariant.salePrice);
          break;
        case 'price_high_low':
          processedProducts.sort((a, b) => b.displayVariant.salePrice - a.displayVariant.salePrice);
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
      processedProducts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    
    const flavors = ["Almond", "Caramel", "Peanut"];
    const sugarLevels = ["Low", "Medium", "Sugar-Free"];
    const weights = [50, 100, 200];
    
    // Helper function for pagination URLs
    const buildPaginationUrl = (page) => {
      const queryParams = new URLSearchParams();
      
      // Add all existing query parameters
      if (req.query.search) queryParams.append('search', req.query.search);
      if (req.query.sort) queryParams.append('sort', req.query.sort);
      if (req.query.category) queryParams.append('category', req.query.category);
      if (req.query.flavor) queryParams.append('flavor', req.query.flavor);
      if (req.query.sugarLevel) queryParams.append('sugarLevel', req.query.sugarLevel);
      if (req.query.weight) queryParams.append('weight', req.query.weight);
      if (req.query.minPrice) queryParams.append('minPrice', req.query.minPrice);
      if (req.query.maxPrice) queryParams.append('maxPrice', req.query.maxPrice);
      
      // Add the page number
      queryParams.append('page', page);
      
      return `/products?${queryParams.toString()}`;
    };
    
    res.render('user/product_listing', {
      products: processedProducts,
      categories,
      flavors,
      sugarLevels,
      weights,
      filters: req.query, 
      user: req.session.user || null,
      title: 'Products',
      currentPage: page,
      totalPages,
      totalProducts,
      buildPaginationUrl // Pass the function to the template
    });
    
  } catch (error) {
    console.error('Error loading product listing:', error);
    res.redirect('/user/pageNotfound');
  }
};

exports.loadProductDetails = async (req, res) => {
  try {
    const productId = req.params.id;
    
    // Fetch product with listed category
    const product = await Product.findOne({ 
      _id: productId, 
      isBlocked: false,
      category: { $in: await Category.find({ isListed: true }).distinct('_id') }
    }).populate('category');
    
    if (!product) {
      return res.redirect('/user/pageNotfound');
    }

    // Fetch related products with listed category
    const relatedProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: productId }, 
      isBlocked: false,
      category: { $in: await Category.find({ isListed: true }).distinct('_id') }
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