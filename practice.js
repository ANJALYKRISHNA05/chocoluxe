exports.applycoupon=async(req,res)=>{
    try{
        const{couponcode}=req.body
        const userId=req.session.user
        if(!userId){
            return res.status(401).json({success:false,message:"please login"})
        }
        if(!couponcode){
            return res.status(401).json({success:false,message:"gsajgsjg"})
        }
        const cart=await Cart.findOne({user:userId}).populate({path:"items.product",populate:{path:"category",model:"Category"}}).populate("coupon")
        if(!cart){
             return res.status(401).json({success:false,message:"gsajgsjg"})

        }
        const coupon=await Coupon.findOne({code:couponcode.trim().toUpperCase()})
        if(!coupon){

        }
        

    }catch(error){
        console.error("error in aplying coupon",error)
        res.status(500).json({success:false,message:"server error"})
    }
}