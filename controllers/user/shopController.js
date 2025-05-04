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
    const categories = await Category.find({ isListed: true }).sort({ name: 1 });
    
    let query = { isBlocked: false };
    
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
    
    let products = await Product.find(query).populate('category');
   
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
    
    res.render('user/product_listing', {
      products: processedProducts,
      categories,
      flavors,
      sugarLevels,
      weights,
      filters: req.query, 
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

   
    const relatedProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: productId }, 
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



