const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');

exports.loadShopHomepage = async (req, res) => {
  try {
    const categories = await Category.find({ isListed: true }).sort({ name: 1 });

    const products = await Product.find({ 
      isBlocked: false,
      category: { $in: await Category.find({ isListed: true }).distinct('_id') }
    })
      .populate('category')
      .sort({ createdAt: -1 })
      .limit(4);

  
    const processedProducts = products.map(product => {
    const processedProduct = JSON.parse(JSON.stringify(product));
      
  
      const productOffer = processedProduct.variants[0].productOffer || 0;
      const categoryOffer = processedProduct.category.categoryOffer || 0;
      
  
      const effectiveOffer = Math.max(productOffer, categoryOffer);
 
      const originalPrice = processedProduct.variants[0].salePrice > 0 
        ? processedProduct.variants[0].salePrice 
        : processedProduct.variants[0].regularPrice;
  
      const offerPrice = originalPrice * (1 - effectiveOffer / 100);
      
      processedProduct.originalPrice = originalPrice;
      processedProduct.offerPrice = offerPrice;
      processedProduct.effectiveOffer = effectiveOffer;
      
      return processedProduct;
    });

    res.render('user/home', {
      categories,
      products: processedProducts,
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
    
    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    const skip = (page - 1) * limit;

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

     
        const productOffer = variant.productOffer || 0;
        const categoryOffer = processedProduct.category.categoryOffer || 0;
        const effectiveOffer = Math.max(productOffer, categoryOffer);
        const originalPrice = variant.salePrice > 0 ? variant.salePrice : variant.regularPrice;
        const effectivePrice = originalPrice * (1 - effectiveOffer / 100);

        if (req.query.minPrice && effectivePrice < parseFloat(req.query.minPrice)) {
          return false;
        }
        
        if (req.query.maxPrice && effectivePrice > parseFloat(req.query.maxPrice)) {
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
            matchingVariants.sort((a, b) => {
              const aOffer = Math.max(a.productOffer || 0, processedProduct.category.categoryOffer || 0);
              const bOffer = Math.max(b.productOffer || 0, processedProduct.category.categoryOffer || 0);
              const aPrice = (a.salePrice > 0 ? a.salePrice : a.regularPrice) * (1 - aOffer / 100);
              const bPrice = (b.salePrice > 0 ? b.salePrice : b.regularPrice) * (1 - bOffer / 100);
              return aPrice - bPrice;
            });
            break;
          case 'price_high_low':
            matchingVariants.sort((a, b) => {
              const aOffer = Math.max(a.productOffer || 0, processedProduct.category.categoryOffer || 0);
              const bOffer = Math.max(b.productOffer || 0, processedProduct.category.categoryOffer || 0);
              const aPrice = (a.salePrice > 0 ? a.salePrice : a.regularPrice) * (1 - aOffer / 100);
              const bPrice = (b.salePrice > 0 ? b.salePrice : b.regularPrice) * (1 - bOffer / 100);
              return bPrice - aPrice;
            });
            break;
          default:
            break;
        }
      }
    
     
      const displayVariant = matchingVariants[0];
      const productOffer = displayVariant.productOffer || 0;
      const categoryOffer = processedProduct.category.categoryOffer || 0;
      const effectiveOffer = Math.max(productOffer, categoryOffer);
      const originalPrice = displayVariant.salePrice > 0 
        ? displayVariant.salePrice 
        : displayVariant.regularPrice;
      const offerPrice = originalPrice * (1 - effectiveOffer / 100);
      
      displayVariant.originalPrice = originalPrice;
      displayVariant.offerPrice = offerPrice;
      displayVariant.effectiveOffer = effectiveOffer;
      
      processedProduct.displayVariant = displayVariant;
      processedProduct.matchingVariants = matchingVariants;
      
      return processedProduct;
    }).filter(product => product !== null);
    
    if (req.query.sort) {
      switch (req.query.sort) {
        case 'price_low_high':
          processedProducts.sort((a, b) => a.displayVariant.salePrice - b.displayVariant.salePrice);
          break;
        case 'price_high_low':
          processedProducts.sort((a, b) => b.displayVariant.salePrice - b.displayVariant.salePrice);
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

    const buildPaginationUrl = (page) => {
      const queryParams = new URLSearchParams();
      
      if (req.query.search) queryParams.append('search', req.query.search);
      if (req.query.sort) queryParams.append('sort', req.query.sort);
      if (req.query.category) queryParams.append('category', req.query.category);
      if (req.query.flavor) queryParams.append('flavor', req.query.flavor);
      if (req.query.sugarLevel) queryParams.append('sugarLevel', req.query.sugarLevel);
      if (req.query.weight) queryParams.append('weight', req.query.weight);
      if (req.query.minPrice) queryParams.append('minPrice', req.query.minPrice);
      if (req.query.maxPrice) queryParams.append('maxPrice', req.query.maxPrice);
      
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
      buildPaginationUrl
    });
  } catch (error) {
    console.error('Error loading product listing:', error);
    res.redirect('/user/pageNotfound');
  }
};

exports.loadProductDetails = async (req, res) => {
  try {
    const productId = req.params.id;
    
    const product = await Product.findOne({ 
      _id: productId, 
      isBlocked: false,
      category: { $in: await Category.find({ isListed: true }).distinct('_id') }
    }).populate('category');
    
    if (!product) {
      return res.redirect('/user/pageNotfound');
    }

    const relatedProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: productId },
      isBlocked: false,
      category: { $in: await Category.find({ isListed: true }).distinct('_id') }
    }).populate('category').limit(4);

    
    const processedProduct = JSON.parse(JSON.stringify(product));
    processedProduct.variants = processedProduct.variants.map(variant => {
      const productOffer = variant.productOffer || 0;
      const categoryOffer = processedProduct.category.categoryOffer || 0;
      const effectiveOffer = Math.max(productOffer, categoryOffer);
      const originalPrice = variant.salePrice > 0 ? variant.salePrice : variant.regularPrice;
      const offerPrice = originalPrice * (1 - effectiveOffer / 100);
      
      return {
        ...variant,
        originalPrice,
        offerPrice,
        effectiveOffer
      };
    });

   
    const processedRelatedProducts = relatedProducts.map(relProduct => {
      const processedRelProduct = JSON.parse(JSON.stringify(relProduct));
      processedRelProduct.variants = processedRelProduct.variants.map(variant => {
        const productOffer = variant.productOffer || 0;
        const categoryOffer = processedRelProduct.category.categoryOffer || 0;
        const effectiveOffer = Math.max(productOffer, categoryOffer);
        const originalPrice = variant.salePrice > 0 ? variant.salePrice : variant.regularPrice;
        const offerPrice = originalPrice * (1 - effectiveOffer / 100);
        
        return {
          ...variant,
          originalPrice,
          offerPrice,
          effectiveOffer
        };
      });
      return processedRelProduct;
    });

    res.render('user/product_details', {
      product: processedProduct,
      relatedProducts: processedRelatedProducts,
      title: product.productName,
      user: req.session.user || null
    });
  } catch (error) {
    console.error('Error loading product details:', error);
    res.redirect('/user/pageNotfound');
  }
};