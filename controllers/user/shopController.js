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


