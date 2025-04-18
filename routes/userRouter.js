const express = require('express');
const router = express.Router();
const passport = require("passport");
const userController = require('../controllers/user/userController');


router.get('/', userController.loadHomepage);
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
    res.redirect('/user/home');
});
router.get('user/logout', userController.logout);

router.get('/user/forgot-password', userController.forgotPassword);
router.post('/user/forgot-password', userController.sendOtpForForgotPassword);
router.get('/user/verify-otp-forgot', (req, res) => res.render('verify-otp-forgot', { message: req.session.message || '' }));
router.post('/user/verify-otp-forgot', userController.verifyOtpForForgotPassword);
router.get('/user/reset-password', userController.loadResetPassword);
router.post('/user/reset-password', userController.resetPassword);

module.exports = router;