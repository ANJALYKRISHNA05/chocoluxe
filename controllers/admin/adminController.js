const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');
const Category = require('../../models/categorySchema');
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
           
            const totalProducts = await Product.countDocuments({ isBlocked: false });
            
           
            const totalUsers = await User.countDocuments({ isAdmin: false });
            

            const totalOrders = await Order.countDocuments();
            
       
            const orderStatusCounts = await Order.aggregate([
                {
                    $group: {
                        _id: "$status",
                        count: { $sum: 1 }
                    }
                }
            ]);
            
            const statusColorMap = {
                'Pending': '#ffc107',
                'Pending Payment': '#ffc107',
                'Confirmed': '#17a2b8',
                'Shipped': '#007bff',
                'Delivered': '#28a745',
                'Cancelled': '#dc3545',
                'Return Requested': '#fd7e14',
                'Returned': '#6c757d'
            };
            
            orderStatusCounts.forEach(status => {
                status.color = statusColorMap[status._id] || '#6c757d';
            });
            
         
            const revenueData = await Order.aggregate([
                {
                    $match: {
                        status: { $nin: ['Cancelled', 'Returned'] }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalRevenue: { $sum: "$total" },
                        totalDiscount: { $sum: "$discount" },
                        totalSavings: { $sum: "$totalSavings" }
                    }
                }
            ]);
            console.log(revenueData);
            
            const totalRevenue = revenueData.length > 0 ? revenueData[0].totalRevenue : 0;
            const totalDiscount = revenueData.length > 0 ? revenueData[0].totalDiscount : 0;
            const totalSavings = revenueData.length > 0 ? revenueData[0].totalSavings : 0;
            
        
            const topProducts = await Order.aggregate([
                { $unwind: "$items" },
                {
                    $group: {
                        _id: "$items.product",
                        totalQuantity: { $sum: "$items.quantity" },
                        totalRevenue: { $sum: "$items.subtotal" }
                    }
                },
                { $sort: { totalQuantity: -1 } },
                { $limit: 5 },
                {
                    $lookup: {
                        from: "products",
                        localField: "_id",
                        foreignField: "_id",
                        as: "productDetails"
                    }
                },
                { $unwind: "$productDetails" },
                {
                    $project: {
                        productName: "$productDetails.productName",
                        totalQuantity: 1,
                        totalRevenue: 1
                    }
                }
            ]);
     
            const recentOrders = await Order.find()
                .sort({ createdAt: -1 })
                .limit(5)
                .populate({
                    path: 'items.product',
                    select: 'productName'
                });
                
     
            const formattedRecentOrders = recentOrders.map(order => {
                const firstItem = order.items[0];
                const productName = firstItem?.product?.productName || 'Product Unavailable';
                const additionalItems = order.items.length > 1 ? ` + ${order.items.length - 1} more` : '';
                
                return {
                    orderId: order.orderId,
                    date: order.createdAt,
                    item: `${productName}${additionalItems}`,
                    total: order.total,
                    status: order.status
                };
            });
            
            res.render('admin/dashboard', {
                totalProducts,
                totalUsers,
                totalOrders,
                totalRevenue,
                orderStatusCounts,
                topProducts,
                recentOrders: formattedRecentOrders
            });
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
                console.log("Error destroying session",err)
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