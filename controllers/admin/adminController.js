const User = require('../../models/userSchema');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');


const pageerror=async(req,res)=>{
    res.render("pageerror")
}

const loadLogin = (req, res) => {
    if (req.session.admin) {
        return res.redirect('/admin/dashboard');
    }
    res.render('admin/login', { message: null });
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const admin = await User.findOne({ email, isAdmin: true });

        if (!admin) {
            return res.render('admin/login', { message: 'Invalid credentials' });
        }
        const passwordMatch = await bcrypt.compare(password, admin.password);

        if (!passwordMatch) {
            return res.render('admin/login', { message: 'Invalid credentials' });
        }

       
        req.session.admin = admin._id;
        return res.redirect('/admin/dashboard');
    } catch (error) {
        console.error('Login error:', error);
        return res.render('admin/login', { message: 'Invalid credentials' });
    }
};

const loadDashboard = async (req, res) => {
    if (req.session.admin) {
        try {
            res.render('admin/dashboard');
        } catch (error) {
            console.error('Dashboard error:', error);
            res.redirect('/admin/pageerror');
        }
    } else {
        res.redirect('/admin/login');
    }
};


const logout=async(req,res)=>{
    try {
        req.session.destroy(err=>{
            if(err){
                consoel.log("Error destroying session",err)
                return res.redirect("/admin/pageerror")
            }
            res.redirect("/admin/login")
        })
        
    } catch (error) {
        console.log(("unexpected error during logout",error))
        res.redirect("/admin/pageerror")
        
    }
}

module.exports = {
    loadLogin,
    login,
    loadDashboard,
    pageerror,
    logout,
}