const User = require("../models/userSchema");

const userAuth = (req, res, next) => {
    // Public routes that don't require authentication
    const publicRoutes = [
        '/',
        '/products',
        '/product',
        '/about',
        '/contact',
        '/search'
    ];
    
    // Check if the current route is a public route
    const isPublicRoute = publicRoutes.some(route => req.originalUrl.startsWith(route));
    
    if (req.session.user) {
        User.findById(req.session.user._id)
            .then(data => {
                if (data && !data.isBlocked) {
                    req.session.user.profileImage = data.profileImage || '/Images/default-profile.jpg';
                    next();
                } else {
                    // Redirect to login page with message if user is blocked
                    req.session.message = 'Your account has been blocked. Please contact support.';
                    res.redirect('/user/login');
                }
            })
            .catch(error => {
                console.log('Error in user auth middleware:', error);
                req.session.message = 'An error occurred. Please try again.';
                res.redirect('/user/login');
            });
    } else if (isPublicRoute) {
        // Allow access to public routes without login
        next();
    } else {
        // Store the URL they were trying to access
        req.session.returnTo = req.originalUrl;
        req.session.message = 'Please log in to continue';
        res.redirect('/user/login');
    }
};

const adminAuth = (req, res, next) => {
    User.findOne({ isAdmin: true })
        .then(data => {
            if (data) {
                next();
            } else {
                res.redirect("admin/login");
            }
        })
        .catch(error => {
            console.log("Error in adminauth middleware", error);
            res.status(500).send("Internal Server Error");
        });
};

module.exports = {
    userAuth,
    adminAuth,
};