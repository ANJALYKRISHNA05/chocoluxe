const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const { cloudinary } = require('../../config/cloudinary');

exports.loadProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;

    const totalProducts = await Product.countDocuments();
    const products = await Product.find()
      .populate('category')
      .sort({ createdAt: -1 }) 
      .skip(skip)
      .limit(limit);

    res.render('admin/admin_product_list', {
      products,
      activePage: 'products',
      currentPage: page,
      totalPages: Math.ceil(totalProducts / limit),
      limit,
      totalProducts
    });
  } catch (error) {
    console.error('Error loading products:', error);
    res.redirect('/admin/pageerror');
  }
};

exports.loadProductForm = async (req, res) => {
  try {
    const categories = await Category.find({ isListed: true });
    let product = null;
    if (req.params.id) {
      product = await Product.findById(req.params.id).populate('category');
    }
    res.render('admin/admin_product_form', {
      product,
      categories,
      activePage: 'products',
      errors: null
    });
  } catch (error) {
    console.error('Error loading product form:', error);
    res.redirect('/admin/pageerror');
  }
};

exports.addProduct = async (req, res) => {
  try {
    const { productName, description, category, variants } = req.body;
    const files = req.files;

    let parsedVariants = Array.isArray(variants) ? variants : JSON.parse(variants);

    const variantImages = {};
    files.forEach(file => {
      const match = file.fieldname.match(/variants\[(\d+)\]\[images\]/);
      if (match) {
        const variantIndex = match[1];
        if (!variantImages[variantIndex]) variantImages[variantIndex] = [];
        variantImages[variantIndex].push(file.path);
      }
    });

    const errors = [];
    parsedVariants = parsedVariants.map((variant, index) => {
      const images = variantImages[index] || [];
      if (images.length < 3) {
        errors.push({ msg: `Variant ${index + 1} must have at least 3 images` });
      }
      return {
        ...variant,
        weight: Number(variant.weight),
        stock_quantity: Number(variant.stock_quantity),
        regularPrice: Number(variant.regularPrice),
        salePrice: Number(variant.salePrice),
        productOffer: Number(variant.productOffer || 0),
        productImage: images
      };
    });

    if (errors.length > 0) {
      const categories = await Category.find({ isListed: true });
      return res.render('admin/admin_product_form', {
        product: null,
        categories,
        activePage: 'products',
        errors
      });
    }

    const product = new Product({
      productName,
      description,
      category,
      variants: parsedVariants
    });

    await product.save();
    
    res.redirect('/admin/products?success=true');
  } catch (error) {
    console.error('Error adding product:', error);
    const categories = await Category.find({ isListed: true });
    res.render('admin/admin_product_form', {
      product: null,
      categories,
      activePage: 'products',
      errors: [{ msg: 'Error adding product. Please try again.' }]
    });
  }
};

exports.editProduct = async (req, res) => {
  try {
    const { productName, description, category, variants } = req.body;
    const files = req.files;

    let parsedVariants = Array.isArray(variants) ? variants : JSON.parse(variants);

    const variantImages = {};
    files.forEach(file => {
      const match = file.fieldname.match(/variants\[(\d+)\]\[images\]/);
      if (match) {
        const variantIndex = match[1];
        if (!variantImages[variantIndex]) variantImages[variantIndex] = [];
        variantImages[variantIndex].push(file.path);
      }
    });

    const errors = [];
    const product = await Product.findById(req.params.id);

    parsedVariants = parsedVariants.map((variant, index) => {
      const newImages = variantImages[index] || [];
      if (newImages.length > 0 && newImages.length < 3) {
        errors.push({ msg: `Variant ${index + 1} must have at least 3 images if updating images` });
      }
      return {
        ...variant,
        weight: Number(variant.weight),
        stock_quantity: Number(variant.stock_quantity),
        regularPrice: Number(variant.regularPrice),
        salePrice: Number(variant.salePrice),
        productOffer: Number(variant.productOffer || 0),
        productImage: newImages.length > 0 ? newImages : product.variants[index]?.productImage || []
      };
    });

    if (errors.length > 0) {
      const categories = await Category.find({ isListed: true });
      return res.render('admin/admin_product_form', {
        product,
        categories,
        activePage: 'products',
        errors
      });
    }

    product.productName = productName;
    product.description = description;
    product.category = category;
    product.variants = parsedVariants;

    await product.save();
    res.redirect('/admin/products');
  } catch (error) {
    console.error('Error editing product:', error);
    const categories = await Category.find({ isListed: true });
    const product = await Product.findById(req.params.id);
    res.render('admin/admin_product_form', {
      product,
      categories,
      activePage: 'products',
      errors: [{ msg: 'Error editing product. Please try again.' }]
    });
  }
};

exports.toggleProductStatus = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    product.isBlocked = !product.isBlocked;
    await product.save();
    res.json({ success: true });
  } catch (error) {
    console.error('Error toggling product status:', error);
    res.status(500).json({ success: false, message: 'Error toggling product status' });
  }
};