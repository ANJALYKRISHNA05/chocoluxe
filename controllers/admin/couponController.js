const Coupon = require("../../models/couponSchema");

const getCoupons = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 6;
    const skip = (page - 1) * limit;

    const totalCoupons = await Coupon.countDocuments();
    const totalPages = Math.ceil(totalCoupons / limit);

    const coupons = await Coupon.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.render("admin/admin-coupons", {
      coupons,
      currentPage: "coupons",
      pagination: {
        page,
        limit,
        totalCoupons,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching coupons:", error);
    res.redirect("/admin/pageerror");
  }
};

const addCoupon = async (req, res) => {
  try {
    const {code,description,discountType,discountAmount,minPurchase,maxDiscount,startDate,endDate,usageLimit,} = req.body;

    const existingCoupon = await Coupon.findOne({
      code: code.trim().toUpperCase(),
    });
    if (existingCoupon) {
      return res.status(400).json({
        success: false,
        message: "Coupon code already exists",
      });
    }

   
    const startDateTime = new Date(startDate);
    const endDateTime = new Date(endDate);

    if (endDateTime < startDateTime) {
      return res.status(400).json({
        success: false,
        message: "End date cannot be earlier than start date",
      });
    }

    const newCoupon = new Coupon({
      code: code.trim().toUpperCase(),
      description,
      discountType,
      discountAmount,
      minPurchase: minPurchase || 0,
      maxDiscount: maxDiscount || null,
      startDate,
      endDate,
      usageLimit: usageLimit || 1,
    });

    await newCoupon.save();

    return res.status(201).json({
      success: true,
      message: "Coupon created successfully",
    });
  } catch (error) {
    console.error("Error creating coupon:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create coupon",
    });
  }
};

const getEditCoupon = async (req, res) => {
  try {
    const couponId = req.params.id;
    const coupon = await Coupon.findById(couponId).populate({
      path: "usedBy.user",
      select: "username email",
    });

   

    if (!coupon) {
      return res.redirect("/admin/coupons");
    }

    res.render("admin/admin-edit-coupon", {
      coupon,
      currentPage: "coupons",
    });
  } catch (error) {
    console.error("Error fetching coupon for edit:", error);
    res.redirect("/admin/pageerror");
  }
};

const updateCoupon = async (req, res) => {
  try {
    const couponId = req.params.id;
    const {
      code,
      description,
      discountType,
      discountAmount,
      minPurchase,
      maxDiscount,
      startDate,
      endDate,
      usageLimit,
    } = req.body;

   
    const startDateTime = new Date(startDate);
    const endDateTime = new Date(endDate);

    if (endDateTime < startDateTime) {
      return res.status(400).json({
        success: false,
        message: "End date cannot be earlier than start date",
      });
    }

   
    if (code) {
      const existingCoupon = await Coupon.findOne({
        code: code.trim().toUpperCase(),
        _id: { $ne: couponId },
      });
      if (existingCoupon) {
        return res.status(400).json({
          success: false,
          message: "Coupon code already exists",
        });
      }
    }

    const updatedCoupon = await Coupon.findByIdAndUpdate(
      couponId,
      {
        ...(code && { code: code.trim().toUpperCase() }),
        description,
        discountType,
        discountAmount,
        minPurchase: minPurchase || 0,
        maxDiscount: maxDiscount || null,
        startDate,
        endDate,
        usageLimit: usageLimit || 1,
      },
      { new: true },
    );

    if (!updatedCoupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Coupon updated successfully",
    });
  } catch (error) {
    console.error("Error updating coupon:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update coupon",
    });
  }
};

const toggleCouponStatus = async (req, res) => {
  try {
    const couponId = req.params.id;
    const coupon = await Coupon.findById(couponId);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    coupon.isActive = !coupon.isActive;
    await coupon.save();

    return res.status(200).json({
      success: true,
      message: `Coupon ${coupon.isActive ? "activated" : "deactivated"} successfully`,
    });
  } catch (error) {
    console.error("Error toggling coupon status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update coupon status",
    });
  }
};

const deleteCoupon = async (req, res) => {
  try {
    const couponId = req.params.id;
    const result = await Coupon.findByIdAndDelete(couponId);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Coupon deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting coupon:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete coupon",
    });
  }
};

const getCouponUsage = async (req, res) => {
  try {
    const couponId = req.params.id;
    const coupon = await Coupon.findById(couponId).populate({
      path: "usedBy.user",
      select: "username email",
    });

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    return res.status(200).json({
      success: true,
      usedBy: coupon.usedBy,
    });
  } catch (error) {
    console.error("Error fetching coupon usage data:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch coupon usage data",
    });
  }
};

module.exports = {
  getCoupons,
  addCoupon,
  getEditCoupon,
  updateCoupon,
  toggleCouponStatus,
  deleteCoupon,
  getCouponUsage,
};