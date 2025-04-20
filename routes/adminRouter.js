const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const userController = require('../controllers/admin/userController');
const categoryController = require('../controllers/admin/categoryController');
const { adminAuth } = require('../middlewares/auth');

router.get('/pageerror', adminController.pageerror);
router.get('/login', adminController.loadLogin);
router.post('/login', adminController.login);
router.get('/dashboard', adminAuth, adminController.loadDashboard);
router.get('/', adminAuth, adminController.loadDashboard);
router.post('/logout', adminController.logout);

router.get('/users', adminAuth, userController.loadUsers);
router.patch('/users/toggle-block/:id', adminAuth, userController.toggleBlockUser);

// Category routes
router.get('/category', adminAuth, categoryController.loadCategories);
router.get('/category/add', adminAuth, categoryController.loadCategoryForm);
router.get('/category/edit/:id', adminAuth, categoryController.loadCategoryForm);
router.post('/category/add', adminAuth, categoryController.addCategory);
router.post('/category/edit/:id', adminAuth, categoryController.editCategory);
router.patch('/category/toggle-status/:id', adminAuth, categoryController.toggleCategoryStatus);

module.exports = router;