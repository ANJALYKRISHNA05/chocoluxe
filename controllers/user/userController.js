const bcrypt = require('bcrypt');
const User = require('../../models/userSchema');
const Address = require("../../models/addressSchema");
const nodemailer = require('nodemailer');
const crypto = require("crypto");
require('dotenv').config();

const pageNotfound = async (req, res) => {
    try {
        res.render('user/page-404');
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

        if (!storedOtp || !userData || otp !== storedOtp) {
            return res.json({ success: false, message: 'Invalid OTP. Please try again.' });
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(userData.password, saltRounds);

        const newUser = new User({
            username: userData.username,
            email: userData.email,
            phone: userData.phone || null,
            password: hashedPassword
        });

        await newUser.save();

       
        req.session.user = {
            _id: newUser._id.toString(),
            username: newUser.username,
            email: newUser.email,
            isBlocked: newUser.isBlocked,
            profileImage: newUser.profileImage || '/Images/default-profile.jpg' 
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
            _id: user._id.toString(),
            username: user.username,
            email: user.email,
            phone: user.phone, 
            isBlocked: user.isBlocked,
            profileImage: user.profileImage || '/Images/default-profile.jpg'
        };
        console.log('Login successful - Session:', req.session);
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
        const email = req.session.userData?.email || req.session.forgotPasswordEmail;
        if (!email) {
            return res.status(400).json({ success: false, message: "Email not found in session" });
        }

        const otp = generateOtp();
   
        if (req.session.userData) {
            req.session.userOtp = otp; 
        } else {
            req.session.forgotPasswordOtp = otp; 
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

const loadProfile = async (req, res) => {
    try {
        console.log('loadProfile - Session:', req.session);
        const user = await User.findById(req.session.user._id);
        if (!user) {
            console.log('User not found for session ID:', req.session.user._id);
            return res.redirect('/user/login');
        }
        
        req.session.user = {
            _id: user._id.toString(),
            username: user.username,
            email: user.email,
            phone: user.phone,
            isBlocked: user.isBlocked,
            profileImage: user.profileImage || '/Images/default-profile.jpg'
        };
        
        res.render('user/profile', {
            user: {
                _id: user._id.toString(),
                username: user.username,
                email: user.email,
                phone: user.phone,
                profileImage: user.profileImage || '/Images/default-profile.jpg'
            },
            userData: req.session.userData,
            activeTab: 'details'
        });
    } catch (error) {
        console.error('Error loading profile:', error);
        res.status(500).redirect('/user/pageNotfound');
    }
};


const loadEditProfile = async (req, res) => {
    try {
        const user = await User.findById(req.session.user._id);
        if (!user) {
            return res.redirect('/user/login');
        }
        
       
        req.session.user.profileImage = user.profileImage || '/Images/default-profile.jpg';

        res.render('user/edit-profile', {
            user: req.session.user,
            message: req.session.message || '',
            activeTab: 'edit'
        });
        if (req.session.message) {
            delete req.session.message;
        }
    } catch (error) {
        console.error('Error loading edit profile:', error);
        res.status(500).redirect('/user/pageNotfound');
    }
};

const updateProfile = async (req, res) => {
    try {
        const { username, phone, currentEmail, newEmail } = req.body;
        const userId = req.session.user._id;
        
        const usernamePattern = /^[a-zA-Z0-9_]{5,20}$/;
        const phonePattern = /^[6-9]\d{9}$/;
        const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      
        if (!username || !usernamePattern.test(username)) {
            req.session.message = 'Username must be 5-20 characters long and can only contain letters, numbers, and underscores';
            return res.redirect('/user/edit-profile');
        }
        
        if (phone && !phonePattern.test(phone)) {
            req.session.message = 'Please enter a valid 10-digit phone number starting with 6-9';
            return res.redirect('/user/edit-profile');
        }
        
        if (newEmail && !emailPattern.test(newEmail)) {
            req.session.message = 'Please enter a valid email address';
            return res.redirect('/user/edit-profile');
        }
       
        if (username !== req.session.user.username) {
            const existingUsername = await User.findOne({ username, _id: { $ne: userId } });
            if (existingUsername) {
                req.session.message = 'Username already taken';
                return res.redirect('/user/edit-profile');
            }
        }
      
        const updateData = {
            username,
            phone: phone || null
        };
   
        if (req.file) {
            updateData.profileImage = req.file.path;
        }
       
        if (newEmail && newEmail !== currentEmail) {
            const existingEmail = await User.findOne({ email: newEmail, _id: { $ne: userId } });
            if (existingEmail) {
                req.session.message = 'Email already registered to another account';
                return res.redirect('/user/edit-profile');
            }
            
            const otp = generateOtp();
            console.log(`OTP for email update to ${newEmail}: ${otp}`); 
            const emailSent = await sendVerificationEmail(newEmail, otp);
            
            if (!emailSent) {
                req.session.message = 'Failed to send verification email. Please try again.';
                return res.redirect('/user/edit-profile');
            }
            
            req.session.emailUpdateData = {
                userId,
                newEmail,
                otp,
                username,
                phone: phone || null,
                profileImage: updateData.profileImage
            };
            
            return res.render('user/verify-email-update', { email: newEmail });
        }
      
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            updateData,
            { new: true }
        );
        
        
        req.session.user = {
            _id: updatedUser._id,
            username: updatedUser.username,
            email: updatedUser.email,
            isBlocked: updatedUser.isBlocked,
            profileImage: updatedUser.profileImage || '/Images/default-profile.jpg' 
        };
        
        req.session.message = 'Profile updated successfully';
        res.redirect('/user/profile');
        
    } catch (error) {
        console.error('Error updating profile:', error);
        req.session.message = 'An error occurred while updating profile';
        res.redirect('/user/edit-profile');
    }
};

const verifyEmailUpdate = async (req, res) => {
    try {
        const { otp } = req.body;
        const updateData = req.session.emailUpdateData;
        
        if (!updateData || !updateData.otp) {
            return res.json({ success: false, message: 'OTP verification session expired' });
        }
        
        if (otp !== updateData.otp) {
            return res.json({ success: false, message: 'Invalid OTP. Please try again.' });
        }
        
        const updatedUser = await User.findByIdAndUpdate(
            updateData.userId,
            {
                email: updateData.newEmail,
                username: updateData.username,
                phone: updateData.phone,
                ...(updateData.profileImage && { profileImage: updateData.profileImage })
            },
            { new: true }
        );
        
       
        req.session.user = {
            _id: updatedUser._id,
            username: updatedUser.username,
            email: updatedUser.email,
            isBlocked: updatedUser.isBlocked,
            profileImage: updatedUser.profileImage || '/Images/default-profile.jpg' 
        };
        
        delete req.session.emailUpdateData;
        
        return res.json({ success: true, redirectUrl: '/user/profile' });
        
    } catch (error) {
        console.error('Error verifying email update:', error);
        return res.json({ success: false, message: 'An error occurred. Please try again.' });
    }
};

const resendEmailUpdateOtp = async (req, res) => {
    try {
        const updateData = req.session.emailUpdateData;
        
        if (!updateData || !updateData.newEmail) {
            return res.status(400).json({ success: false, message: 'Email update session expired' });
        }
        
        const otp = generateOtp();
        console.log(`Resent OTP for email update to ${updateData.newEmail}: ${otp}`); 
        const emailSent = await sendVerificationEmail(updateData.newEmail, otp);
        
        if (!emailSent) {
            return res.status(500).json({ success: false, message: 'Failed to send verification email' });
        }
        
        req.session.emailUpdateData.otp = otp;
        
        return res.json({ success: true, message: 'OTP sent successfully' });
        
    } catch (error) {
        console.error('Error resending email update OTP:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

const loadAddresses = async (req, res) => {
    try {
        const userId = req.session.user._id;
        
        const addresses = await Address.find({ userId }).sort({ isDefault: -1, createdAt: -1 });
        
       
        res.render('user/address', {
            addresses,
            user: req.session.user,
            activeTab: 'address',
            message: req.session.message || ''
        });
        
        if (req.session.message) {
            delete req.session.message;
        }
    } catch (error) {
        console.error('Error loading addresses:', error);
        req.session.message = 'Error loading addresses.';
        res.redirect('/user/profile');
    }
};

const loadAddAddressForm = async (req, res) => {
    try {
     
        res.render('user/address-form', {
            user: req.session.user,
            activeTab: 'address',
            isEdit: false,
            message: req.session.message || ''
        });
        
        if (req.session.message) {
            delete req.session.message;
        }
    } catch (error) {
        console.error('Error loading address form:', error);
        req.session.message = 'Error loading address form.';
        res.redirect('/user/address');
    }
};

const loadEditAddressForm = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const addressId = req.params.id;
        
        const address = await Address.findOne({ _id: addressId, userId });
        
        if (!address) {
            req.session.message = 'Address not found.';
            return res.redirect('/user/address');
        }
      
        res.render('user/address-form', {
            user: req.session.user,
            activeTab: 'address',
            isEdit: true,
            address,
            message: req.session.message || ''
        });
        
        if (req.session.message) {
            delete req.session.message;
        }
    } catch (error) {
        console.error('Error loading edit address form:', error);
        req.session.message = 'Error loading edit address form.';
        res.redirect('/user/address');
    }
};

const addAddress = async (req, res) => {
    try {
        const userId = req.session.user._id;
        let { name, addressType, address, city, state, pincode, phone, isDefault } = req.body;
        
        name = name ? name.trim() : '';
        addressType = addressType ? addressType.trim() : '';
        address = address ? address.trim() : '';
        city = city ? city.trim() : '';
        state = state ? state.trim() : '';
        pincode = pincode ? pincode.trim() : '';
        phone = phone ? phone.trim() : '';
        
        if (!name || !addressType || !address || !city || !state || !pincode || !phone) {
            req.session.message = 'All fields are required.';
            return res.redirect('/user/address/add');
        }
        
        const namePattern = /^[A-Za-z\s\.\-']{2,50}$/;
        if (!namePattern.test(name)) {
            req.session.message = 'Name must contain only letters, spaces, and basic punctuation (2-50 characters).';
            return res.redirect('/user/address/add');
        }
        
        if (address.length < 5) {
            req.session.message = 'Please enter a valid address (minimum 5 characters).';
            return res.redirect('/user/address/add');
        }
        
        const locationPattern = /^[A-Za-z\s\-']{2,30}$/;
        if (!locationPattern.test(city)) {
            req.session.message = 'City must contain only letters(2-30 characters).';
            return res.redirect('/user/address/add');
        }
        
        if (!locationPattern.test(state)) {
            req.session.message = 'State must contain only letters (2-30 characters).';
            return res.redirect('/user/address/add');
        }
        
        const pincodePattern = /^\d{6}$/;
        const phonePattern = /^\d{10}$/;
        
        if (!pincodePattern.test(pincode)) {
            req.session.message = 'Pincode must be 6 digits.';
            return res.redirect('/user/address/add');
        }
        
        if (!phonePattern.test(phone)) {
            req.session.message = 'Phone number must be 10 digits.';
            return res.redirect('/user/address/add');
        }
        
        const validAddressTypes = ['home', 'work', 'office', 'other'];
        if (!validAddressTypes.includes(addressType.toLowerCase())) {
            req.session.message = 'Please select a valid address type.';
            return res.redirect('/user/address/add');
        }
        
        if (isDefault === 'true') {
            await Address.updateMany(
                { userId },
                { $set: { isDefault: false } }
            );
        }
        
        const newAddress = new Address({
            userId,
            name,
            addressType,
            address,
            city,
            state,
            pincode,
            phone,
            isDefault: isDefault === 'true'
        });
        
        await newAddress.save();
        
        await User.findByIdAndUpdate(
            userId,
            { $push: { addresses: newAddress._id } }
        );
        
        req.session.message = 'Address added successfully.';
        res.redirect('/user/address');
    } catch (error) {
        console.error('Error adding address:', error);
        req.session.message = 'Error adding address.';
        res.redirect('/user/address/add');
    }
};

const updateAddress = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const addressId = req.body.addressId;
        let { name, addressType, address, city, state, pincode, phone, isDefault } = req.body;
        
        name = name ? name.trim() : '';
        addressType = addressType ? addressType.trim() : '';
        address = address ? address.trim() : '';
        city = city ? city.trim() : '';
        state = state ? state.trim() : '';
        pincode = pincode ? pincode.trim() : '';
        phone = phone ? phone.trim() : '';
        
        if (!name || !addressType || !address || !city || !state || !pincode || !phone) {
            req.session.message = 'All fields are required.';
            return res.redirect(`/user/address/edit/${addressId}`);
        }
        
        const namePattern = /^[A-Za-z\s\.\-']{2,50}$/;
        if (!namePattern.test(name)) {
            req.session.message = 'Name must contain only letters, spaces, and basic punctuation (2-50 characters).';
            return res.redirect(`/user/address/edit/${addressId}`);
        }
        
        if (address.length < 5) {
            req.session.message = 'Please enter a valid address (minimum 5 characters).';
            return res.redirect(`/user/address/edit/${addressId}`);
        }
        
        const locationPattern = /^[A-Za-z\s\-']{2,30}$/;
        if (!locationPattern.test(city)) {
            req.session.message = 'City must contain only letters and spaces (2-30 characters).';
            return res.redirect(`/user/address/edit/${addressId}`);
        }
        
        if (!locationPattern.test(state)) {
            req.session.message = 'State must contain only letters and spaces (2-30 characters).';
            return res.redirect(`/user/address/edit/${addressId}`);
        }
        
        const pincodePattern = /^\d{6}$/;
        const phonePattern = /^\d{10}$/;
        
        if (!pincodePattern.test(pincode)) {
            req.session.message = 'Pincode must be 6 digits.';
            return res.redirect(`/user/address/edit/${addressId}`);
        }
        
        if (!phonePattern.test(phone)) {
            req.session.message = 'Phone number must be 10 digits.';
            return res.redirect(`/user/address/edit/${addressId}`);
        }
     
        const validAddressTypes = ['home', 'work', 'office', 'other'];
        if (!validAddressTypes.includes(addressType.toLowerCase())) {
            req.session.message = 'Please select a valid address type.';
            return res.redirect(`/user/address/edit/${addressId}`);
        }
        
        const existingAddress = await Address.findOne({ _id: addressId, userId });
        if (!existingAddress) {
            req.session.message = 'Address not found.';
            return res.redirect('/user/address');
        }
        
        if (isDefault === 'true') {
            await Address.updateMany(
                { userId, _id: { $ne: addressId } },
                { $set: { isDefault: false } }
            );
        }
        
        await Address.findByIdAndUpdate(
            addressId,
            {
                name,
                addressType,
                address,
                city,
                state,
                pincode,
                phone,
                isDefault: isDefault === 'true' || (existingAddress.isDefault && isDefault !== 'false')
            }
        );
        
        req.session.message = 'Address updated successfully.';
        res.redirect('/user/address');
    } catch (error) {
        console.error('Error updating address:', error);
        req.session.message = 'Error updating address.';
        res.redirect('/user/address');
    }
};

const deleteAddress = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const { addressId } = req.body;
        
        const address = await Address.findOne({ _id: addressId, userId });
        if (!address) {
            req.session.message = 'Address not found.';
            return res.redirect('/user/address');
        }
        
        const wasDefault = address.isDefault;
     
        await Address.findByIdAndDelete(addressId);
        
        await User.findByIdAndUpdate(
            userId,
            { $pull: { addresses: addressId } }
        );
        
        if (wasDefault) {
            const anotherAddress = await Address.findOne({ userId });
            if (anotherAddress) {
                await Address.findByIdAndUpdate(
                    anotherAddress._id,
                    { isDefault: true }
                );
            }
        }
        
        req.session.message = 'Address deleted successfully.';
        res.redirect('/user/address');
    } catch (error) {
        console.error('Error deleting address:', error);
        req.session.message = 'Error deleting address.';
        res.redirect('/user/address');
    }
};

const setDefaultAddress = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const { addressId } = req.body;

        const address = await Address.findOne({ _id: addressId, userId });
        if (!address) {
            req.session.message = 'Address not found.';
            return res.redirect('/user/address');
        }
        
        await Address.updateMany(
            { userId },
            { $set: { isDefault: false } }
        );
        
        await Address.findByIdAndUpdate(
            addressId,
            { isDefault: true }
        );
        
        req.session.message = 'Default address updated.';
        res.redirect('/user/address');
    } catch (error) {
        console.error('Error setting default address:', error);
        req.session.message = 'Error setting default address.';
        res.redirect('/user/address');
    }
};

const loadChangePassword = async (req, res) => {
    try {
      
        res.render('user/change-password', {
            user: req.session.user,
            activeTab: 'password',
            message: req.session.message || ''
        });
        
        if (req.session.message) {
            delete req.session.message;
        }
    } catch (error) {
        console.error('Error loading change password page:', error);
        req.session.message = 'Error loading change password page.';
        res.redirect('/user/profile');
    }
};

const changePassword = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const { currentPassword, newPassword, confirmPassword } = req.body;
        
        const user = await User.findById(userId);
        if (!user) {
            req.session.message = 'User not found.';
            return res.redirect('/user/change-password');
        }
        
        if (!currentPassword || !newPassword || !confirmPassword) {
            req.session.message = 'All fields are required.';
            return res.redirect('/user/change-password');
        }
      
        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordValid) {
            req.session.message = 'Current password is incorrect.';
            return res.redirect('/user/change-password');
        }
        
        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            req.session.message = 'New password cannot be the same as your current password.';
            return res.redirect('/user/change-password');
        }
        
        const passwordPatterns = {
            length: newPassword.length >= 8,
            uppercase: /[A-Z]/.test(newPassword),
            lowercase: /[a-z]/.test(newPassword),
            number: /[0-9]/.test(newPassword),
            special: /[^A-Za-z0-9]/.test(newPassword)
        };
        
        if (Object.values(passwordPatterns).filter(Boolean).length < 5) {
            req.session.message = 'Password must be at least 8 characters long and include uppercase, lowercase, number, and special character.';
            return res.redirect('/user/change-password');
        }
  
        if (newPassword !== confirmPassword) {
            req.session.message = 'New password and confirmation do not match.';
            return res.redirect('/user/change-password');
        }
     
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
        
        await User.findByIdAndUpdate(userId, { password: hashedPassword });
        
        req.session.message = 'Password changed successfully.';
        res.redirect('/user/profile');
        
    } catch (error) {
        console.error('Error changing password:', error);
        req.session.message = 'An error occurred while changing your password.';
        res.redirect('/user/change-password');
    }
};

module.exports = {
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
    resetPassword,
    loadProfile,
    loadEditProfile,
    updateProfile,
    verifyEmailUpdate,  
    resendEmailUpdateOtp,
    loadAddresses,
    loadAddAddressForm,
    loadEditAddressForm,
    addAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
    loadChangePassword, 
    changePassword 
};