const express = require('express');
const router = express.Router();
const passport = require("passport");
const userController = require('../controllers/user/userController');
const shopController = require('../controllers/user/shopController');
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
router.get('/user/auth/google', (req, res, next) => {
    // Store referral code in session if it exists in query params
    console.log('Google Auth Route - Query params:', req.query);
    if (req.query.referralCode) {
        req.session.referralCode = req.query.referralCode;
        console.log('Google Auth Route - Stored referral code in session:', req.query.referralCode);
    }
    next();
}, passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/user/auth/google/callback', passport.authenticate('google', { failureRedirect: '/signup' }), async (req, res) => {
    const user = req.user;
    req.session.user = {
        _id: user._id.toString(),
        username: user.username,
        email: user.email,
        isBlocked: user.isBlocked,
        profileImage: user.profileImage || '/Images/default-profile.jpg'
    };
    
    console.log('Google Callback - Session data:', req.session);
    
    // Check if this is a new user with a referral
    const isNewUser = await Wallet.findOne({ userId: user._id }) ? false : true;
    console.log('Google Callback - Is new user:', isNewUser);
    console.log('Google Callback - User object:', user);
    
    if (isNewUser) {
        // Check for referral info in the session
        console.log('Google Callback - Google Referral data:', req.session.googleReferral);
        
        // Get referrer info from either the user object or the session
        let referredBy = user.referredBy;
        let referrerUsername = '';
        
        // If we have referral info in the session but not in the user object, update the user
        if (!referredBy && req.session.googleReferral && req.session.googleReferral.referrerId) {
            referredBy = req.session.googleReferral.referrerId;
            referrerUsername = req.session.googleReferral.referrerUsername;
            
            // Update the user with the referral info
            console.log('Google Callback - Updating user with referral info:', referredBy);
            await User.findByIdAndUpdate(user._id, { referredBy: referredBy });
        }
        
        console.log('Google Callback - Final referredBy value:', referredBy);
        
        // Create wallet for the new user with referral bonus if applicable
        const userId = user._id;
        const existingWallet = await Wallet.findOne({ userId });
        if (!existingWallet) {
            const newWallet = new Wallet({
                userId,
                balance: referredBy ? 50 : 0,
                transactions: referredBy ? [{
                    transactionType: 'credit',
                    transactionAmount: 50,
                    description: 'Referral bonus for signing up with referral code'
                }] : []
            });
            await newWallet.save();
            
            // Credit the referrer's wallet if applicable
            if (referredBy) {
                const referrerWallet = await Wallet.findOne({ userId: referredBy });
                if (referrerWallet) {
                    referrerWallet.balance += 100;
                    referrerWallet.transactions.push({
                        transactionType: 'credit',
                        transactionAmount: 100,
                        description: `Referral bonus for referring ${user.username}`
                    });
                    await referrerWallet.save();
                } else {
                    const newReferrerWallet = new Wallet({
                        userId: referredBy,
                        balance: 100,
                        transactions: [{
                            transactionType: 'credit',
                            transactionAmount: 100,
                            description: `Referral bonus for referring ${user.username}`
                        }]
                    });
                    await newReferrerWallet.save();
                }
            }
        }
        
        // Clear the session data
        delete req.session.newGoogleUser;
        delete req.session.referralCode;
    }
    
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

router.post('/add-to-cart', userAuth, cartController.addToCart);
router.get('/cart', userAuth, cartController.loadCart);
router.post('/cart/update-quantity', userAuth, cartController.updateCartQuantity);
router.post('/cart/remove', userAuth, cartController.removeFromCart);
router.get('/cart/item-count', userAuth, cartController.getCartItemCount);
router.post('/cart/apply-coupon', userAuth, cartController.applyCoupon);
router.post('/cart/remove-coupon', userAuth, cartController.removeCoupon);

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
router.get('/user/wallet', userAuth, walletController.loadWallet);

module.exports = router;