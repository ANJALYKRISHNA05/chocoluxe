const bcrypt = require('bcrypt');
const User = require('../../models/userSchema');
const nodemailer = require('nodemailer');
require('dotenv').config();

const loadHomepage = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.redirect('/user/login');
        }
        return res.render('home', { user: req.session.user });
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
            return res.redirect('/user/home');
        }
        if (req.session) {
            req.session.message = '';
        }
        res.render('signup', { message: '' });
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
            return res.render('signup', { message: 'Please fill the form correctly' });
        }

        const existingUser = await User.findOne({ $or: [{ email }, { name: username }] });
        if (existingUser) {
            return res.render('signup', { message: 'User with this email or username already exists' });
        }

        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);
        if (!emailSent) {
            return res.render('signup', { message: 'Failed to send verification email. Please try again.' });
        }
        req.session.userOtp = otp;
        req.session.userData = { username, email, phone, password };
        res.render('verify-otp');
        console.log('OTP sent:', otp);
    } catch (error) {
        console.error('Error during signup:', error);
        let errorMessage = 'An error occurred during signup. Please try again.';
        if (error.name === 'ValidationError') {
            errorMessage = `Validation error: ${error.message}`;
        } else if (error.code === 11000) {
            errorMessage = 'A user with this email or username already exists.';
        }
        res.render('signup', { message: errorMessage });
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
            name: userData.username,
            email: userData.email,
            phone: userData.phone || null,
            password: hashedPassword
        });

        await newUser.save();

        req.session.user = {
            id: newUser._id,
            name: newUser.name,
            email: newUser.email,
            isBlocked: newUser.isBlocked
        };
        delete req.session.userOtp;
        delete req.session.userData; 
        res.json({ success: true, redirectUrl: '/user/home' });
    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.json({ success: false, message: 'An error occurred. Please try again.' });
    }
};

const loadLogin = async (req, res) => {
    try {
        if (req.session.user) {
            return res.redirect('/user/home');
        }
        res.render('login', { message: req.session.message || '' });
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

        const user = await User.findOne({isAdmin:0,email });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            req.session.message = 'Invalid email or password';
            return res.redirect('/user/login');
        }

        if (user.isBlocked) {
            req.session.message = 'User is blocked';
            return res.redirect('/user/login',{message:"User is blocked by admin"});
        }

        req.session.user = {
            id: user._id,
            name: user.name,
            email: user.email,
            isBlocked: user.isBlocked
        };
        res.redirect('/user/home');
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
        const userData = req.session.userData;
        if (!userData || !userData.email) {
            return res.status(400).json({ success: false, message: "Email not found in session" });
        }

        const otp = generateOtp();
        req.session.userOtp = otp;
        const emailSent = await sendVerificationEmail(userData.email, otp);
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

module.exports = {
    loadHomepage,
    pageNotfound,
    loadSignup,
    signup,
    loadLogin,
    login,
    logout,
    verifyOtp,
    resendOtp
};