const express = require('express');
const router = express.Router();
const passport = require("passport");
const userController = require('../controllers/user/userController');
const shopController = require('../controllers/user/shopController');
const cartController = require('../controllers/user/cartController');

const { userAuth } = require('../middlewares/auth');
const { profileStorage } = require('../config/cloudinary');
const multer = require('multer');
const profileUpload = multer({ storage: profileStorage });

router.get('/user/pageNotfound', userController.pageNotfound);
router.get('/user/signup', userController.loadSignup);
router.post('/user/signup', userController.signup);
router.get('/user/login', userController.loadLogin);
router.post('/user/login', userController.login);
router.post("/user/verify-otp", userController.verifyOtp);
router.post("/user/resend-otp", userController.resendOtp);
router.get('/user/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/user/auth/google/callback', passport.authenticate('google', { failureRedirect: '/signup' }), (req, res) => {
    const user = req.user;
    req.session.user = user;
    res.redirect('/');
});
router.get('/user/logout', userController.logout);

router.get('/user/forgot-password', userController.forgotPassword);
router.post('/user/forgot-password', userController.sendOtpForForgotPassword);
router.get('/user/verify-otp-forgot', (req, res) => res.render('user/verify-otp-forgot', { message: req.session.message || '' }));
router.post('/user/verify-otp-forgot', userController.verifyOtpForForgotPassword);
router.get('/user/reset-password', userController.loadResetPassword);
router.post('/user/reset-password', userController.resetPassword);
router.get('/', shopController.loadShopHomepage);

router.get('/product/:id', shopController.loadProductDetails);
router.get('/products', shopController.loadProductListing);

router.get('/user/profile', userAuth, userController.loadProfile);
router.get('/user/edit-profile', userAuth, userController.loadEditProfile);
router.post('/user/update-profile', userAuth, profileUpload.single('profileImage'), userController.updateProfile);
router.post('/user/verify-email-update', userAuth, userController.verifyEmailUpdate);
router.post('/user/resend-email-update-otp', userAuth, userController.resendEmailUpdateOtp);

router.get('/user/address', userAuth, userController.loadAddresses);
router.get('/user/address/add', userAuth, userController.loadAddAddressForm);
router.get('/user/address/edit/:id', userAuth, userController.loadEditAddressForm);
router.post('/user/address/add', userAuth, userController.addAddress);
router.post('/user/address/update', userAuth, userController.updateAddress);
router.post('/user/address/delete', userAuth, userController.deleteAddress);
router.post('/user/address/set-default', userAuth, userController.setDefaultAddress);

router.get('/user/change-password', userAuth, userController.loadChangePassword);
router.post('/user/change-password', userAuth, userController.changePassword);

// Cart routes
router.post('/add-to-cart', userAuth, cartController.addToCart);
router.get('/cart', userAuth, cartController.loadCart);
router.post('/cart/update-quantity', userAuth, cartController.updateCartQuantity);
router.post('/cart/remove', userAuth, cartController.removeFromCart);
router.get('/cart/item-count', userAuth, async (req, res) => {
    try {
        const cart = await require('../models/cartSchema').findOne({ user: req.session.user });
        const itemCount = cart ? cart.items.length : 0; // Count unique items
        res.json({ itemCount });
    } catch (error) {
        console.error('Error fetching cart count:', error);
        res.status(500).json({ itemCount: 0 });
    }
});

module.exports = router;