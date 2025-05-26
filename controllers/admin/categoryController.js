const Category = require('../../models/categorySchema');
const { categoryStorage } = require('../../config/cloudinary');
const multer = require('multer');
const upload = multer({ storage: categoryStorage });

const categoryController = {
  loadCategories: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 3;
      const skip = (page - 1) * limit;
      const searchQuery = req.query.search || ''; 

      let query = {}; 
      if (searchQuery) {
        query.name = { $regex: searchQuery, $options: 'i' }; 
      }

      const totalCategories = await Category.countDocuments(query); 
      const categories = await Category.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      res.render('admin/admin_category_list', {
        categories,
        activePage: 'category',
        title: 'Category Management',
        currentPage: page,
        totalPages: Math.ceil(totalCategories / limit),
        limit,
        searchQuery,
        totalCategories 
      });
    } catch (error) {
      console.error('Error loading categories:', error);
      res.redirect('/admin/pageerror');
    }
  },

  loadCategoryForm: async (req, res) => {
    try {
      const categoryId = req.params.id;
      
      if (categoryId) {
        const category = await Category.findById(categoryId);
        if (!category) {
          return res.redirect('/admin/category');
        }
        
        return res.render('admin/admin_category_form', {
          category,
          error: null,
          activePage: 'category',
          title: 'Edit Category'
        });
      }
      
      res.render('admin/admin_category_form', {
        category: null,
        error: null,
        activePage: 'category',
        title: 'Add Category'
      });
    } catch (error) {
      console.error('Error loading category form:', error);
      res.redirect('/admin/pageerror');
    }
  },

  addCategory: [
    upload.single('image'),
    async (req, res) => {
      try {
        const { name, description, categoryOffer } = req.body;
        const isListed = req.body.isListed === 'on'; 
        const slug = name.toLowerCase().replace(/\s+/g, '-');
        const image = req.file ? req.file.path : '';

        const offer = parseInt(categoryOffer) || 0;
        if (offer < 0 || offer > 100) {
          return res.render('admin/admin_category_form', {
            error: 'Offer percentage must be between 0 and 100',
            category: { name, description, categoryOffer: offer, isListed },
            activePage: 'category',
            title: 'Add Category'
          });
        }

        const existingCategory = await Category.findOne({ name });
        if (existingCategory) {
          return res.render('admin/admin_category_form', {
            error: 'Category name already exists',
            category: { name, description, categoryOffer: offer, isListed },
            activePage: 'category',
            title: 'Add Category'
          });
        }

        const category = new Category({
          name,
          description,
          image,
          slug,
          isListed,
          categoryOffer: offer
        });

        await category.save();
        res.redirect('/admin/category');
      } catch (error) {
        console.error('Error adding category:', error);
        res.redirect('/admin/pageerror');
      }
    }
  ],

  editCategory: [
    upload.single('image'),
    async (req, res) => {
      try {
        const { name, description, categoryOffer } = req.body;
        const isListed = req.body.isListed === 'on'; 
        const categoryId = req.params.id;
        const slug = name.toLowerCase().replace(/\s+/g, '-');

        const offer = parseInt(categoryOffer) || 0;
        if (offer < 0 || offer > 100) {
          return res.render('admin/admin_category_form', {
            error: 'Offer percentage must be between 0 and 100',
            category: { 
              _id: categoryId,
              name, 
              description, 
              image: category.image,
              isListed,
              categoryOffer: offer
            },
            activePage: 'category',
            title: 'Edit Category'
          });
        }

        const category = await Category.findById(categoryId);
        if (!category) {
          return res.redirect('/admin/category');
        }

        const existingCategory = await Category.findOne({ name, _id: { $ne: categoryId } });
        if (existingCategory) {
          return res.render('admin/admin_category_form', {
            error: 'Category name already exists',
            category: { 
              _id: categoryId,
              name, 
              description, 
              image: category.image,
              isListed,
              categoryOffer: offer
            },
            activePage: 'category',
            title: 'Edit Category'
          });
        }

        category.name = name;
        category.description = description;
        category.slug = slug;
        category.isListed = isListed;
        category.categoryOffer = offer;
        
        if (req.file) {
          category.image = req.file.path;
        }

        await category.save();
        res.redirect('/admin/category');
      } catch (error) {
        console.error('Error editing category:', error);
        res.redirect('/admin/pageerror');
      }
    }
  ],

  toggleCategoryStatus: async (req, res) => {
    try {
      const categoryId = req.params.id;
      const category = await Category.findById(categoryId);
      if (!category) {
        return res.status(404).json({ success: false, message: 'Category not found' });
      }

      category.isListed = !category.isListed;
      await category.save();
      res.json({ success: true, isListed: category.isListed });
    } catch (error) {
      console.error('Error toggling category status:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  updateCategoryOffer: async (req, res) => {
    try {
      const categoryId = req.params.id;
      const { categoryOffer } = req.body;
      const offer = parseInt(categoryOffer) || 0;

      if (offer < 0 || offer > 100) {
        return res.status(400).json({ success: false, message: 'Offer percentage must be between 0 and 100' });
      }

      const category = await Category.findById(categoryId);
      if (!category) {
        return res.status(404).json({ success: false, message: 'Category not found' });
      }

      category.categoryOffer = offer;
      await category.save();
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating category offer:', error);
      res.status(500).json({ success: false, message: 'Error updating category offer' });
    }
  }
};

module.exports = categoryController;