const User=require("../models/userSchema")
const userAuth = (req, res, next) => {
    if (req.session.user) {
        User.findById(req.session.user)
            .then(data => {
                if (data && !data.isBlocked) {
                    next();
                } else {
                    res.status(401).json({ success: false, message: 'User is blocked or not found' });
                }
            })
            .catch(error => {
                console.log('Error in user auth middleware:', error);
                res.status(500).json({ success: false, message: 'Internal Server Error' });
            });
    } else {
        res.status(401).json({ success: false, message: 'Please log in' });
    }
};

const adminAuth=(req,res,next)=>{
    User.findOne({isAdmin:true})
    .then(data=>{
        if(data){
            next();
        }else{
            res.redirect("admin/login")
        }
    })
    .catch(error=>{
        console.log("Error in adminauth middleware",error);
        res.status(500).send("Internal Server Error")

    })
}

module.exports={
    userAuth,
    adminAuth,
}