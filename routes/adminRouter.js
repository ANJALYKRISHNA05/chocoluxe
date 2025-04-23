const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const userController = require('../controllers/admin/userController');
const categoryController = require('../controllers/admin/categoryController');
const productController = require('../controllers/admin/productController');
const { adminAuth } = require('../middlewares/auth');
const multer = require('multer');
const { productStorage } = require('../config/cloudinary');

const productUpload = multer({ storage: productStorage });

// Error and Admin Auth Routes
router.get('/pageerror', adminController.pageerror);
router.get('/login', adminController.loadLogin);
router.post('/login', adminController.login);
router.get('/dashboard', adminAuth, adminController.loadDashboard);
router.get('/', adminAuth, adminController.loadDashboard);
router.post('/logout', adminController.logout);

// User Management Routes
router.get('/users', adminAuth, userController.loadUsers);
router.patch('/users/toggle-block/:id', adminAuth, userController.toggleBlockUser);

// Category Routes
router.get('/category', adminAuth, categoryController.loadCategories);
router.get('/category/add', adminAuth, categoryController.loadCategoryForm);
router.get('/category/edit/:id', adminAuth, categoryController.loadCategoryForm);
router.post('/category/add', adminAuth, categoryController.addCategory);
router.post('/category/edit/:id', adminAuth, categoryController.editCategory);
router.patch('/category/toggle-status/:id', adminAuth, categoryController.toggleCategoryStatus);

// Product Routes
router.get('/products', adminAuth, productController.loadProducts);
router.get('/products/add', adminAuth, productController.loadProductForm);
router.get('/products/edit/:id', adminAuth, productController.loadProductForm);
router.post('/products/add', adminAuth, productUpload.any(), productController.addProduct);
router.post('/products/edit/:id', adminAuth, productUpload.any(), productController.editProduct);
router.patch('/products/toggle-status/:id', adminAuth, productController.toggleProductStatus);

module.exports = router;