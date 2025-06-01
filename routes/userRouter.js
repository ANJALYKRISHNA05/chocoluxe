const express = require('express');
const router = express.Router();
const passport = require("passport");
const userController = require('../controllers/user/userController');
const shopController = require('../controllers/user/shopController');
const subscriptionController = require('../controllers/user/subscriptionController');
const cartController = require('../controllers/user/cartController');
const checkoutController = require('../controllers/user/checkoutController');
const walletController = require('../controllers/user/walletController');
const wishlistController = require('../controllers/user/wishlistController');
const Wallet = require('../models/walletSchema');
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
router.get('/user/auth/google', userController.handleGoogleAuth, passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/user/auth/google/callback', passport.authenticate('google', { failureRedirect: '/signup' }), userController.handleGoogleCallback);
router.get('/user/logout', userController.logout);

router.get('/user/forgot-password', userController.forgotPassword);
router.post('/user/forgot-password', userController.sendOtpForForgotPassword);
router.get('/user/verify-otp-forgot', (req, res) => res.render('user/verify-otp-forgot', { message: req.session.message || '' }));
router.post('/user/verify-otp-forgot', userController.verifyOtpForForgotPassword);
router.get('/user/reset-password', userController.loadResetPassword);
router.post('/user/reset-password', userController.resetPassword);
router.get('/', shopController.loadShopHomepage);


router.get('/faq', userController.loadFaq);
router.get('/about', userController.loadAbout);
router.get('/contact', userController.loadContact);
router.post('/contact', userController.handleContact);
router.get('/terms', userController.loadTerms);
router.get('/privacy', userController.loadPrivacy);
router.get('/careers', userController.loadCareers);
router.get('/shipping', userController.loadShipping);


router.post('/subscribe', subscriptionController.handleSubscription);

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

router.post('/add-to-cart', userAuth, cartController.addToCart);
router.get('/cart', userAuth, cartController.loadCart);
router.post('/cart/update-quantity', userAuth, cartController.updateCartQuantity);
router.post('/cart/remove', userAuth, cartController.removeFromCart);
router.get('/cart/item-count', userAuth, cartController.getCartItemCount);
router.post('/cart/apply-coupon', userAuth, cartController.applyCoupon);
router.post('/cart/remove-coupon', userAuth, cartController.removeCoupon);
router.get('/cart/validate-coupon', userAuth, cartController.validateCoupon);


router.post('/add-to-wishlist', userAuth, wishlistController.addToWishlist);
router.get('/wishlist', userAuth, wishlistController.loadWishlist);
router.post('/wishlist/remove', userAuth, wishlistController.removeFromWishlist);
router.get('/wishlist/item-count', userAuth, wishlistController.getWishlistItemCount);

router.get('/checkout', userAuth, checkoutController.loadCheckout);
router.post('/checkout/place-order', userAuth, checkoutController.placeOrder);
router.get('/order-confirmation/:orderId', userAuth, checkoutController.loadOrderConfirmation);
router.get('/order-details/:orderId', userAuth, checkoutController.loadOrderDetails);
router.post('/orders/:orderId/request-return', userAuth, checkoutController.requestReturn);
router.post('/checkout/address/add', userAuth, checkoutController.addCheckoutAddress);
router.post('/checkout/address/update', userAuth, checkoutController.updateCheckoutAddress);
router.get('/user/orders', userAuth, checkoutController.loadOrderHistory);
router.post('/orders/:orderId/cancel', userAuth, checkoutController.cancelOrder);
router.get('/orders/:orderId/invoice', userAuth, checkoutController.generateInvoice);


router.post('/checkout/create-razorpay-order', userAuth, checkoutController.createRazorpayOrder);
router.post('/checkout/verify-payment', userAuth, checkoutController.verifyPayment);
router.get('/checkout/payment-failed/:orderId', userAuth, checkoutController.handlePaymentFailure);
router.get('/checkout/payment-cancelled/:orderId', userAuth, checkoutController.handlePaymentCancellation);
router.get('/checkout/retry-payment/:orderId', userAuth, checkoutController.retryPayment);
router.get('/user/wallet', userAuth, walletController.loadWallet);

module.exports = router;