const express = require('express');
const router = express.Router();
const passport = require("passport");
const userController = require('../controllers/user/userController');

router.get('/home', userController.loadHomepage);
router.get('/pageNotfound', userController.pageNotfound);
router.get('/signup', userController.loadSignup);
router.post('/signup', userController.signup);
router.get('/login', userController.loadLogin);
router.post('/login', userController.login);
router.post("/verify-otp", userController.verifyOtp);
router.post("/resend-otp", userController.resendOtp);
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/signup' }), (req, res) => {
    const user = req.user;
    req.session.user = user;
    res.redirect('/user/home');
});
router.get('/logout', userController.logout);

router.get('/forgot-password', userController.forgotPassword);
router.post('/forgot-password', userController.sendOtpForForgotPassword);
router.get('/verify-otp-forgot', (req, res) => res.render('verify-otp-forgot', { message: req.session.message || '' }));
router.post('/verify-otp-forgot', userController.verifyOtpForForgotPassword);
router.get('/reset-password', userController.loadResetPassword);
router.post('/reset-password', userController.resetPassword);

module.exports = router;