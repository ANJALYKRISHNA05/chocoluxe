const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const userController = require('../controllers/admin/userController');
const categoryController = require('../controllers/admin/categoryController');
const productController = require('../controllers/admin/productController');
const orderController = require('../controllers/admin/orderController');
const couponController = require('../controllers/admin/couponController');
const { adminAuth } = require('../middlewares/auth');
const multer = require('multer');
const { productStorage } = require('../config/cloudinary');

const productUpload = multer({ storage: productStorage });

router.get('/pageerror', adminController.pageerror);
router.get('/login', adminController.loadLogin);
router.post('/login', adminController.login);
router.get('/dashboard', adminAuth, adminController.loadDashboard);
router.get('/', adminAuth, adminController.loadDashboard);
router.post('/logout', adminController.logout);

router.get('/users', adminAuth, userController.loadUsers);
router.patch('/users/toggle-block/:id', adminAuth, userController.toggleBlockUser);

router.get('/category', adminAuth, categoryController.loadCategories);
router.get('/category/add', adminAuth, categoryController.loadCategoryForm);
router.get('/category/edit/:id', adminAuth, categoryController.loadCategoryForm);
router.post('/category/add', adminAuth, categoryController.addCategory);
router.post('/category/edit/:id', adminAuth, categoryController.editCategory);
router.patch('/category/toggle-status/:id', adminAuth, categoryController.toggleCategoryStatus);
router.patch('/category/update-offer/:id', categoryController.updateCategoryOffer);

router.get('/products', adminAuth, productController.loadProducts);
router.get('/products/add', adminAuth, productController.loadProductForm);
router.get('/products/edit/:id', adminAuth, productController.loadProductForm);
router.post('/products/add', adminAuth, productUpload.any(), productController.addProduct);
router.post('/products/edit/:id', adminAuth, productUpload.any(), productController.editProduct);
router.patch('/products/toggle-status/:id', adminAuth, productController.toggleProductStatus);
router.patch('/products/update-offer/:id', productController.updateProductOffer);

router.get('/orders', adminAuth, orderController.loadOrders);
router.get('/orders/view/:orderId', adminAuth, orderController.loadOrderDetails);
router.patch('/orders/update-status/:orderId', adminAuth, orderController.updateOrderStatus);
router.patch('/orders/:orderId/accept-return', adminAuth, orderController.acceptReturn);
router.patch('/orders/:orderId/reject-return', adminAuth, orderController.rejectReturn);

router.get('/coupons', adminAuth, couponController.getCoupons);
router.post('/coupons/add', adminAuth, couponController.addCoupon);
router.get('/coupons/edit/:id', adminAuth, couponController.getEditCoupon);
router.post('/coupons/edit/:id', adminAuth, couponController.updateCoupon);
router.patch('/coupons/toggle-status/:id', adminAuth, couponController.toggleCouponStatus);
router.delete('/coupons/delete/:id', adminAuth, couponController.deleteCoupon);
router.get('/coupons/usage/:id', adminAuth, couponController.getCouponUsage);

module.exports = router;