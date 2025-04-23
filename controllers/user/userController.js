const bcrypt = require('bcrypt');
const User = require('../../models/userSchema');
const nodemailer = require('nodemailer');
require('dotenv').config();

const loadHomepage = async (req, res) => {
    try {
        
        res.render('user/home', { user: req.session.user });
    } catch (error) {
        console.log('Home page not found:', error);
        res.status(500).send('Server error');
    }
};

const pageNotfound = async (req, res) => {
    try {
        res.render('page-404');
    } catch (error) {
        res.redirect('/pageNotfound');
    }
};

const loadSignup = (req, res) => {
    try {
        if (req.session.user) {
            return res.redirect('/');
        }
        if (req.session) {
            req.session.message = '';
        }
        res.render('user/signup', { message: '' });
    } catch (error) {
        console.error('Error loading signup page:', error);
        res.status(500).send('Internal Server Error');
    }
};

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString(); 
}

async function sendVerificationEmail(email, otp) {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        });

        const info = await transporter.sendMail({
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Verify your account",
            text: `Your OTP is ${otp}`,
            html: `<b>Your OTP: ${otp}</b>`
        });

        console.log('Email sent:', info.response);
        return info.accepted.length > 0;
    } catch (error) {
        console.log('Error sending email:', error);
        return false;
    }
}

const signup = async (req, res) => {
    try {
        const { username, email, phone, password, confirmPassword } = req.body;

        const usernamePattern = /^[a-z]{5,20}$/;
        const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        const phonePattern = /^\d{10}$/;
        const passwordPatterns = {
            length: password.length >= 8,
            uppercase: /[A-Z]/.test(password),
            lowercase: /[a-z]/.test(password),
            number: /[0-9]/.test(password),
            special: /[^A-Za-z0-9]/.test(password)
        };

        if (!username || !usernamePattern.test(username) ||
            !email || !emailPattern.test(email) ||
            (phone && (!phonePattern.test(phone) || /^0{10}$/.test(phone) || /^0/.test(phone))) ||
            Object.values(passwordPatterns).filter(Boolean).length < 4 ||
            password !== confirmPassword) {
            return res.render('user/signup', { message: 'Please fill the form correctly' });
        }

        const existingUser = await User.findOne({ $or: [{ email }, { username: username }] });
        if (existingUser) {
            return res.render('user/signup', { message: 'User with this email or username already exists' });
        }

        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);
        if (!emailSent) {
            return res.render('user/signup', { message: 'Failed to send verification email. Please try again.' });
        }
        req.session.userOtp = otp;
        req.session.userData = { username, email, phone, password };
        res.render('user/verify-otp');
        console.log('OTP sent:', otp);
    } catch (error) {
        console.error('Error during signup:', error);
        let errorMessage = 'An error occurred during signup. Please try again.';
        if (error.username === 'ValidationError') {
            errorMessage = `Validation error: ${error.message}`;
        } else if (error.code === 11000) {
            errorMessage = 'A user with this email or username already exists.';
        }
        res.render('user/signup', { message: errorMessage });
    }
};

const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        const storedOtp = req.session.userOtp;
        const userData = req.session.userData;
        console.log(userData);

        if (!storedOtp || !userData || otp !== storedOtp) {
            return res.json({ success: false, message: 'Invalid OTP. Please try again.' });
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(userData.password, saltRounds);
        console.log(hashedPassword);

        const newUser = new User({
            username: userData.username,
            email: userData.email,
            phone: userData.phone || null,
            password: hashedPassword
        });

        await newUser.save();

        req.session.user = {
            id: newUser._id,
            username: newUser.username,
            email: newUser.email,
            isBlocked: newUser.isBlocked
        };
        delete req.session.userOtp;
        delete req.session.userData; 
        res.json({ success: true, redirectUrl: '/' });
    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.json({ success: false, message: 'An error occurred. Please try again.' });
    }
};

const loadLogin = async (req, res) => {
    try {
        if (req.session.user) {
            return res.redirect('/');
        }
        res.render('user/login', { message: req.session.message || '' });
        if (req.session.message) {
            delete req.session.message;
        }
    } catch (error) {
        console.error('Login page error:', error);
        res.status(500).send('Server error');
    }
};
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = await User.findOne({ isAdmin: 0, email });
        
        if (!user || !(await bcrypt.compare(password, user.password))) {
            req.session.message = 'Invalid email or password';
            console.log('Login failed - Invalid credentials'); 
            return res.redirect('/user/login');
        }

        if (user.isBlocked) {
            req.session.message = 'User is blocked by admin';
            console.log('Login failed - User is blocked');
            return res.redirect('/user/login');
        }

        req.session.user = {
            id: user._id,
            username: user.username,
            email: user.email,
            isBlocked: user.isBlocked
        };
        console.log('Login successful - Session user:', req.session.user); 
        res.redirect('/');
    } catch (error) {
        console.error('Login error:', error);
        req.session.message = 'An error occurred during login. Please try again.';
        res.redirect('/user/login');
    }
};

const logout = (req, res) => {
    try {
        if (req.session.user) {
            delete req.session.user;
        }
        res.redirect('/user/login');
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).send('Server error');
    }
};

const resendOtp = async (req, res) => {
    try {
        // Check for email in either signup or forgot password session data
        const email = req.session.userData?.email || req.session.forgotPasswordEmail;
        if (!email) {
            return res.status(400).json({ success: false, message: "Email not found in session" });
        }

        const otp = generateOtp();
        // Store OTP in the appropriate session variable
        if (req.session.userData) {
            req.session.userOtp = otp; // Signup flow
        } else {
            req.session.forgotPasswordOtp = otp; // Forgot password flow
        }

        const emailSent = await sendVerificationEmail(email, otp);
        if (emailSent) {
            console.log("Resend OTP:", otp);
            res.status(200).json({ success: true, message: "OTP resent successfully" });
        } else {
            res.status(500).json({ success: false, message: "Failed to resend OTP. Please try again" });
        }
    } catch (error) {
        console.log("Error resending OTP:", error);
        res.status(500).json({ success: false, message: "Internal server error. Please try again" });
    }
};
const forgotPassword = async (req, res) => {
    try {
        if (req.session.user) {
            return res.redirect('/');
        }
        res.render('user/forgot-password', { message: req.session.message || '' });
        if (req.session.message) {
            delete req.session.message;
        }
    } catch (error) {
        console.error('Forgot password page error:', error);
        res.status(500).send('Server error');
    }
};

const sendOtpForForgotPassword = async (req, res) => {
 
    
    try {
        const { email } = req.body;
        const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

        if (!email || !emailPattern.test(email)) {
            req.session.message = 'Please enter a valid email address';
            return res.redirect('/user/forgot-password');
        }

        const user = await User.findOne({ email, isAdmin: 0 });
        if (!user) {
            req.session.message = 'No account found with this email';
            return res.redirect('/user/forgot-password');
        }

        const otp = generateOtp();
        console.log('Generated OTP:', otp); 
        const emailSent = await sendVerificationEmail(email, otp);
        if (!emailSent) {
            req.session.message = 'Failed to send OTP. Please try again.';
            return res.redirect('/user/forgot-password');
        }

        req.session.forgotPasswordEmail = email;
        req.session.forgotPasswordOtp = otp;
        console.log('Stored OTP in session:', req.session.forgotPasswordOtp); 
        res.redirect('/user/verify-otp-forgot');
    } catch (error) {
        console.error('Error sending OTP for forgot password:', error);
        req.session.message = 'An error occurred. Please try again.';
        res.redirect('/user/forgot-password');
    }
};

const verifyOtpForForgotPassword = async (req, res) => {
    try {
        const { otp } = req.body;
        console.log('Submitted OTP:', otp);
        const storedOtp = req.session.forgotPasswordOtp;
        console.log('Stored OTP:', storedOtp); 
        const email = req.session.forgotPasswordEmail;

        if (!storedOtp || !email || otp !== storedOtp) {
            return res.json({ success: false, message: 'Invalid OTP. Please try again.' });
        }

        delete req.session.forgotPasswordOtp;
        res.json({ success: true, redirectUrl: '/user/reset-password' });
    } catch (error) {
        console.error('Error verifying OTP for forgot password:', error);
        res.json({ success: false, message: 'An error occurred. Please try again.' });
    }
};

const loadResetPassword = async (req, res) => {
    try {
        if (!req.session.forgotPasswordEmail) {
            return res.redirect('/user/forgot-password');
        }
        res.render('user/reset-password', { email: req.session.forgotPasswordEmail, message: req.session.message || '' });
        if (req.session.message) {
            delete req.session.message;
        }
    } catch (error) {
        console.error('Error loading reset password page:', error);
        res.status(500).send('Server error');
    }
};

const resetPassword = async (req, res) => {
    try {
        const { newPassword, confirmPassword } = req.body;
        const email = req.session.forgotPasswordEmail;
        console.log('Resetting password for email:', email); 
       
        if (!email) {
            req.session.message = 'Session expired. Please start over.';
            return res.redirect('/user/forgot-password');
        }

        const passwordPatterns = {
            length: newPassword.length >= 8,
            uppercase: /[A-Z]/.test(newPassword),
            lowercase: /[a-z]/.test(newPassword),
            number: /[0-9]/.test(newPassword),
            special: /[^A-Za-z0-9]/.test(newPassword)
        };

        if (Object.values(passwordPatterns).filter(Boolean).length < 4 || newPassword !== confirmPassword) {
            req.session.message = 'Password must be at least 8 characters with uppercase, lowercase, number, and special character, and must match confirmation.';
            return res.redirect('/user/reset-password');
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
        console.log('Hashed Password:', hashedPassword); 

        const result = await User.updateOne({ email }, { password: hashedPassword });
        console.log('Update Result:', result); 

        if (result.nModified === 0) {
           
            req.session.message = 'Failed to update password. Please try again.';
            return res.redirect('/user/reset-password');
        }

        delete req.session.forgotPasswordEmail;
        req.session.message = 'Password reset successfully. Please log in.';
        res.redirect('/user/login');
    } catch (error) {
        console.error('Error resetting password:', error);
        req.session.message = 'An error occurred. Please try again.';
        res.redirect('/user/reset-password');
    }
};

module.exports = {
    loadHomepage,
    pageNotfound,
    loadSignup,
    signup,
    loadLogin,
    login,
    logout,
    verifyOtp,
    resendOtp,
    forgotPassword,
    sendOtpForForgotPassword,
    verifyOtpForForgotPassword,
    loadResetPassword,
    resetPassword
};