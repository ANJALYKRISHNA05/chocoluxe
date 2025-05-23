const { default: items } = require("razorpay/dist/types/items");
const Cart = require("./models/cartSchema");
const Wallet = require("./models/walletSchema");

exports.addToCart=async(req,res)=>{
    try{
        const{productId,variantId,quantity}=req.body
        const userId=req.session.userId
        const MAXQUANTITY_PER_ITEM=5;
        if(!userId){
            return res.status(500).json({success:false,message:"Please login to add items to the cart"})
        }
        const product=await Product.findById(productId).populate("category")
        if(!product||product.isBlocked){
            return res.status(500).json({success:false,message:"Product Not found"})
        }
        if(!product.category||!product.category.isListed){
            return res.status(400).json({success:false,message:"Product category not found"})

        }
       const variant=product.variants.find((v)=>v._id.toString()===variantId)
       if(!variant||variant.stock_quantity<quantity){
        return res.status(400).json({success:false,message:"Invalid variant"})
       }

    let cart=await Cart.findOne({user:userId});
    if(!cart){
        cart=new Cart({user:userId,items:[]})
    }

    const productOffer=variant.productOffer||0
    const categoryOffer=product.category.categoryOffer||0
    const effectiveOffer=Math.max(productOffer,categoryOffer)
    const basePrice=variant.salePrice<variant.regularPrice&&variant.salePrice>0?variant.salePrice:variant.regularPrice
    const offerPrice=effectiveOffer>0?baseprice*(1-effectiveOffer/100):basePrice
    const originalPrice=basePrice;

    const existingItemIndex=cart.items.findIndex((item)=>item.product.toString===productId&&item.sku===variant.sku)

    

    if(existingItemIndex>-1){
        const newQuantity=cart.items[existingItemIndex].quantity+quantity
        if(newQuantity>MAXQUANTITY_PER_ITEM){
            return res.status(400).json({success:false,message:`Cannot add more than ${MAXQUANTITY_PER_ITEM}`})
        }
        cart.items[existingItemIndex].quantity=newQuantity
    }else{
        if(quantity>MAXQUANTITY_PER_ITEM){
             return res.status(400).json({success:false,message:`Cannot add more than ${MAXQUANTITY_PER_ITEM}`})
        }
        cart.items.push({
            product:productId,
            sku:variant.sku,
            quantity,
            productImage:variant.productImage[0],
        })
    }

    let wishlist=await Wishlist.findOne({user:userId})
    if(wishlist){
        const wishlistItemIndex=wishlist.items.findIndex((item)=>item.product.toString===productId&&item.sku===variant.sku)
        if(wishlistItemIndex>-1){
            wishlist.items.splice(wishlistItemIndex,1)
            await Wishlist.save()
        }
    }

    if(cart.coupon){
        if(mongoose.Types.ObjectId.isValid(cart.coupon)){
              const coupon=await Coupon.findById(cart.coupon)
              if(coupon){

              }
        }

          
    }



    }catch(error){
        console.log('Error in adding product to cart',error)
        res.status(500).json({success:false,message:"Server error"})

    }
}




const validateCoupon=async(coupon,userId,subtotal,cart)=>{
    if(!coupon.isActive){
        cart.coupon=null;
        cart.discount=0;
        await Cart.save()
        return null
    }
    const now=new Date()
    if(now<coupon.startDate&&now>coupon.endDate){
        cart.coupon=null;
        cart.discount=0;
        await Cart.save()
        return null;
    }
    if(subtotol<coupon.minPurchase){
        return null;
    }

    if(coupon.usedCount>coupon.usageLimit){
        cart.coupon=null;
        cart.discount=0;
        await Cart.save();
        return null;
    }

    const userIdString=userId._id?userId.id.toString():userId.toString()

  const userUsed=coupon.usedBy.some((entry)=>{
    const entryuserId=entry.user.toString()
    return entryUserId===usedIdString
  })
  if(userUsed){
    cart.coupon=null;
    cart.discout=0;
    await Cart.save();
    throw new Error('You have already used this coupon')
  }

let discount=0;
if(coupon.discountType==="percentage"){
    discount=(coupon.discountAmount/100)*subtotal
    if(coupon.maxDiscount&&discount>coupon.maxDiscount){
        discount=coupon.maxDiscount
    }
}else if(coupon.discountType==="fixed"){
    discount=coupon.discountAmount
}
return discount

}

const calculateCartTotals=async(cart,userId)=>{
    let cartTotal=0;
    let totalSaving=0;
    let subTotal=0;
    let itemCount=0;
    let discount=cart.discount||0;
    let appliedCoupon=null;
}
if(cart&&cart.items.length>0){
    for(const item of cart.items){
        const itemProduct=await Product.findById(item.product).populate("category")
        consst itemVariant=itemProduct.variants.find((v)=>)

    }
}

if(cart.coupon){
    if(mongoose.Types.ObjectId.isValid(cart.coupon)){
        const coupon=await Coupon.findById(cart.coupon)
        if(coupon){
            const {subtotal}=await calculateCartTotals(cart,userId)
            const discount=await validateAndApplycoupon(coupon,userId,subtotal,cart)
            if(discount!=null){
                cart.discount=discount
            }else{
                cart.coupon=null;
                cart.discount=0;
            }
        

    }
    else{
         cart.coupon=null;
        cart.discount=0;
    }
}else{
    cart.coupon=null;
    cart.discount=0;
}
}
await Cart.save()
const{cartTotal,totalSaving,itemCount,subtotal,discount}=await calculateCartTotals(cart,userId)

res.json({success:true,message:"Product added to cart",})



exports.validateCoupon=async(req,res)=>{
    try{
        const userId=req.session.user
        if(!user){
            return res.status(500).json({success:false,message:"please login"})
        }
        const cart=await Cart.findOne({user:userId}).populate("coupon")
        if(!cart.coupon){
            return res.status(401).json({success:true,message:"No coupon applied"})
        }
        const coupon=await Coupon.findById(cart.coupon._id)
        if(!coupon){
            cart.coupon=null;
            cart.discount=0;
            await Cart.save()
            const{cartTotal,totalSavings,itemcount,subtotal,discount,appliedCoupon}=await calculateCartTotals(cart,userId)
            return res.json({success:false,
                message:"no longer available",
                couponremoved:true,
                cartTotal,
                totalSavings,
                itemCount,
                subtotal,
                discount,
                appliedcoupon

            })
        }

        const now=new Date()
        if(now<coupon.startDate||now>coupon.endDate){
            cart.coupon=null;
            cart.discount=0;
            await Cart.save()
            const{cartTotal,totalsavings,itemCount,subtotal,discount,appliedcoupon}=await calculateCartTotals(cart,userId)
            return res.json({success:false,message:"The coupon has expired",couponremoved:true,cartTotal,totalSaving,itemCount,subtotal,discount,appliedcoupon})
        }

        if(coupon.usedcount>=usagelimit){
            cart.coupon=null,
            cart.discount=0;
            await cart.save()
            const{cartTotal,totalsavings,itemcount,discount,subtotal,appliedcoupon}=await calculateCartTotals(cart,userId)
            return res.json({success:false,message:"limit reached",couponremoved:true,cartTotal,totalsavings,itemcount,discount,subtotal,appliedcoupon})
        }
        const useduser=coupon.usedBy.some((entry)=>entry.user.toString===userId)
        if(userused){
            cart.coupon=null,
            cart.discount=0;
            await cart.save()
            const{carttotal,totalSavings,itemcount,subtotal,discount,appliedcoupon}=await calculateCartTotals(cart,userId)
            return res.json({
                success:false,message:"u have already used this coupon",
                couponremoved,carttotal,subtotal,totalsavings,discount,couponapplied
            })
        }
        const{subtotal}=await calculateCartTotals(cart,userId)
        if(subtotal<coupon.minpurchase){
            cart.coupon=null;
            cart.discount=0;
            await cart.save()
            const{cartTotal,totalsavings,itemcount,discount,subtotal}
        }



    }catch(error){
        console.log(error)
        res.status(500).json({success:false,message:"Server error"})
    }
}

exports.loadcart=async(req,res)=>{
    try{
        const userId=req.session.user
        if(!userId){
            return res.redirect("/user/login")
        }
        const cart=await Cart.findOne({user:userId}).populate({path:"items.product",populate:{path:"category",model:"Category"}}).populate("coupon")
        let cartItems=[];
        let hasInvalidItems=false;
        let hasoutofstocks=false;

        const availablecoupons=await Coupon.find({isActive:true,startDate:{$lte:new Date()},endDate:{$gte:new Date()},
    $or:[
        {usedBy:{$not:{$elemMatch:{user:userId}}}},
        {usagelimit:{$gt:0}}
    ]})
    if(cart&&cart.items.length>0){
        cartItems=cart.items.map(item)=>{
            const product=item.product;
            let errormesage=null;
            if(!product){
                errorMesage="Product not found"
                hasInvalidItem=true
            }else if(product.isBlocked){

            }
        }

        const variant=product.variants.find((v)=>v.sku===item.sku)
        if(cart.coupon){
            const coupon=await Cart.findById(cart.coupon)
            if(coupon){
                const {subtotal}=await calculateCartTotals(cart,userId)
                const discount=await validateAndApplycoupon(coupon,cart,userId,subtotal)
                await Cart.save()
            }else{
                cart.coupon=null;
                cart.discount=0;
                await Cart.save()
            }
        }

        
    }
    const{cartTotal,totalSaving,subTotal,itemCount,discount,couponapplied}=await calculateCartTotals
    res.render("user/cart",{

    })
    }catch(error){
        console.log(error)
        res.redirect("/user/pageNotfound")
    }
}

exports.updateCartQuantity=async(req,res)=>{
    try{
        const{itemId,quantity}=req.body
        const MAXQUANTITY_PER_ITEM=5;
        const userId=req.session.user
        if(!userId){
            return res.status(401).json({success:false,message:"olease login"})

        }
        if(!itemId||quantity<1){
            return res.status(500).json({success:false,message:"lkjkj"})
        }
        if(quantity>MAXQUANTITY_PER_ITEM){
            return res.status(400).json({success:false,message:"jjkkjh"})
        }
        const cart=await Cart.findOne({user:userId}).populate({path:"items.product",populate:{path:"category",model:"Category"}}).populate("coupon")
        if(!cart){
            return res.status(404).json({success:false,message:"Cart not found"})
        }
        const item=cart.items.find((item)=>item._id.toString()===itemId)
        if(!item){
            return res.status(500).json({success:false,message:"fdkjjskjf"})
        }
        const product=item.product
        if(!product){

        }
        if(product.isBlocked){

        }
        if(!product.category||!product.category.isListed){

        }
        const variant=product.variants.find((v)=>v.sku===item.sku)
        if(!variant){

        }
        if(quantity>variant.stock_quantity){
            return res.status(401).json({})
        }
        const productOffer=variant.productoffer||0
        const categoryOffer=product.category.categoryOffer||0
        const effectiveOffer=MAth.max(productOffer,categoryOffer)
        const basePrice=variant.salePrice>0&&variant.salePrice<variant.regualrPrice?variant.salePrice:variant.regualrPrice
        const offerPrice=effectiveOffer>0?basePrice*(1-effectiveOffer/100):baseprice
        const originalPrice=basePrice;
        item.quantity=quantity
        await cart.save()


        if(cart.coupon){
            const coupon=await Coupon.findById(cart.coupon)
            if(coupon){
                const {subtotal}=await calculateCartTotals(cart,userId)
            }
            if(subtotal<coupon.minPurchase){
                cart.coupon=null
                cart.discount=0;

            }else{
                try{
                    const newDiscount=await validateAndApplycoupon(coupon,cart,userId,subtotal)
                }
            }

        }

        const{carttotal,totalsavings,itemcount,subtotal,discount,appliedcoupon}=await calculateCartTotals(cart,userId)
        const itemSubtotal=offerPrice*quantity
        const itemsavings=(originalprice-offerPrice)*quantity
        res.json({
            success:true,
            cartTotal,
            offerPrice,
            itemsubTotal,


        })



    }catch(error){
        console.log(error)
        res.status(500).json({success:false,message:"Server error"})
    }
}


exports.removeFromCart=async(req,res)=>{
    try{
        const{itemId}=req.body
        const userId=req.session.user
        if(!userId){
            return res.status(401).json({success:false,message:"please login"})
        }
        if(!itemId){
            return res.status(401)
        }
        const cart=await Cart.findOne({user:userId}).populate({path:"product",populate:{path:"category",model:"Category"
        }}).populate("coupon")
        if(!cart){
            return res.status(401).json({success:false,message:"Cart not found"})
        }
        const cartItemIndex=cart.items.findIndex((item)=>item._id.toString===itemId)
        if(itemIndex===-1){

        }
        cart.items.splice(itemIndex,1)

        if(cart.coupon){
            const coupon=await Coupon.findById(cart.coupon)
            if(coupon){
                const {subtotal}=await calculateCartTotals(cart,userId)
                if(subtotal<coupon.minPurchase){
                    cart.discount=0;
                    cart.coupon=null;
                }else{
                    try{
                        const newDiscout=await validateAndApplycoupon(userId,cart,coupon,subtotal)
                        if(newDiscoount==null){
                            cart.coupon=null
                            cart.discount=0
                        }else{
                            cart.discount=newDiscount
                        }


                    }catch(error){
                        cart.discount=0;
                        cart.coupon=null
                    }
                }
                await cart.save()
            }else{
                cart.coupon=null
                cart.discount=0;
                await cart.save()
            }
        }
        await cart.save()
        const{cartTotal,totalsavings,discount,subtotal,apppliedcoupon,itemcount}=await calculateCartTotals(cart,userId)
        res.json({success:true,message:"Item removed from cart",cartTotal,totalsavings,itemcount,discount,subtotal,appliedcoupon})




    }catch(error){
        console.log(error)
        res.status(401).json({success:false,message:"server error"})
    }
}

exports.getCartItemCount=async(req,res)=>{
    try{
        const userId=req.session.user
        if(!userId){
            return res.status(401).json({success:false,message:"kjdnjkhjkh"})
        }
        const cart=await Cart.findOne(user:userId)
        const itemcount=cart?cart.items.length:0;
        res.json({success:true,itemcount})

    }catch(error){
        console.log(error)
        res.status(401).json({success:false,message:Server error})
    }
}

exports.applycoupon=async(req,res)=>{
    try{
        const {couponcode}=req.body
        const userId=req.session.user
        if(!userId){
            return res.status(401).json({success:false,message:"Plleaselogin"})
        }
        if(!couponcode){
            return res.status(400).json({success:false,message:"fdwfdf"})
        }
        const cart=await Cart.findOne({user:userId}).populate({path:"items.product"},populate:{path:"category",model:"Category"}).populate("coupon")
        if(!cart||cart.items.length==0){
            return res.status(401).json({success:false,message:"cart is empty"})
        }
        const coupon=await Coupon.findOne({code:couponcode.trim().toUpperCase()})
        if(!coupon){
            return res.status(400).json({success:false,message:"Invalid credentials"})
        }
        const {subtotal}=await calculateCartTotals(cart,userId)
        try{
            const discount=await validateAndApplycoupon(cart,subtotal,userId,coupon)
            if(discount==null){
                return res.status(400).json9{success:false,message:"jdhfhshk"}
            }
          const userIdString=userId._id?userId.id.toString():userId.toStrinG()
          coupon.usedBy.push({user:new Mongoose.Types.ObjectId(userIdString)})
          coupon.usedCount+=1
          await coupon.save()
          cart.coupon=coupon._id
          cart.discount=coupon.discount;
          await Cart.save()
          const{cartTotal,itemCount,subtotal}

          res.json({
            success:true,message:"Coupon applied suucessfully",
            cartTotal,itemcount,totalsavings,discount,subtotal,appliedCoupon
          })



        }catch(errror){
            res.status(401).json({success:false,message:"Coupon applied failed"})
        }



    }catch(error){
        console.error("Error applying coupon")
        res.status(401).json({success:false,message:"error applying coupon"})
    }
}



exports.removeCoupon=async(req,res)=>{
    try{
        const userId=req.session.user;
        if(!userId){
            return res.status(401).json({success:false,message:"please login"})
        }
        const cart=await Cart.findOne({user:userId}).populate({path:"items.product",populate:{path:"category",model:"Category"}})
        if(!cart){

        }
        cart.coupon=null;
        cart.discount=0;
        await Cart.save()
        const{cartTotal,itemcount,totalSavings,subtotal,discount,appliedcoupon}
        res.json({success:true,message:"Coupon removed successfully",cartTotal,totalSavings,itemcount,subtotal,discount,appliedcoupon})

    }catch(error){
        console.error("Error removing coupon",error)
        res.status(500).json({success:false,message:"Server error"})
    }
}


const existingitems=wishlist.items.some((item)=>item.product.toString()===productId&&item.sku==var)


exports.loadwallet=async(req,res)=>{
    try{
        const userId=req.session.user._id
        const wallet=await Wallet.findOne({userId}).populate("userId")
        const user=await User.findById(userId).select("referralCode")
        if(!wallet){
            const newwallet=new Wallet({userId,balance:0,transaction:[]})
            await newwallet.save()
            return res.render("user/wallet",{
                wallet:newwallet,user:req.session.user,title:"your wallet",message:"",referralcode=user.referralCode,referralBonus:0
            })
        }
        const referralBonus=wallet.transactions.filter(t=>t.description.includes('Referral Bonus')).reduce((sum,t)=>sum+transactionAmount,0)
        res.render("user/wallet",{
            wallet,user:req.session.user,message:req.session.message,referralcode:user.referralCode,referralBonus
        })

    }catch(error){
        console.error("Error loading wallet",error)
        res.status(500).json({success:false,message:"Error loading wallet"})
    }
}
const referralBonus=wallet.transaction.filter(t=>t.desctiption.includes('Referral Bonus')).reduce((sum,t)=>sum+t.transactionAmount,0)


exports.requestreturn=async(req,res)=>{
    try{
        const userId=req.session.user._id
        const orderId=req.params.orderId
        const {reason}=req.body
        if(!reason){
            return res.status(401).json({success:false,message:'reason should be there'})
        }
        const order=await Order.findOne({orderId,user:userId})
        if(!order){
            return res
        }
        if(order.status!==Delivered||order.return.requested){
            return res.status
        }

    }catch(error){
        console.log('Error requesting',error)
        res.status(401).json({success:false,message:'Error requesting'})
    }
}
const totalProducts=await Product.countDocuments({isBlocked:false})
const ordestatuscounts=await Order.aggregate([
    {
        $group:{
            _id:"$status",
            count:{$sum:1}
        }
    }
])