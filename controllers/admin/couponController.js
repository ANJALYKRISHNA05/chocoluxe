const Coupon = require("../../models/couponSchema")

const getCoupons = async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 3
    const skip = (page - 1) * limit

    const totalCoupons = await Coupon.countDocuments()
    const totalPages = Math.ceil(totalCoupons / limit)

    const coupons = await Coupon.find().sort({ createdAt: -1 }).skip(skip).limit(limit)

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
    })
  } catch (error) {
    console.error("Error fetching coupons:", error)
    res.redirect("/admin/pageerror")
  }
}

const addCoupon = async (req, res) => {
  try {
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
    } = req.body

    // Validation errors object
    const errors = {}

    // Validate required fields
    if (!code || code.trim() === "") {
      errors.code = "Coupon code is required"
    }

    if (!description || description.trim() === "") {
      errors.description = "Description is required"
    }

    if (!discountType) {
      errors.discountType = "Discount type is required"
    }

    if (!discountAmount) {
      errors.discountAmount = "Discount amount is required"
    } else if (isNaN(discountAmount) || Number(discountAmount) <= 0) {
      errors.discountAmount = "Discount amount must be a positive number"
    }

    if (!startDate) {
      errors.startDate = "Start date is required"
    }

    if (!endDate) {
      errors.endDate = "End date is required"
    }

    // Remove leading spaces but allow spaces between words
    const cleanedCode = code.trimStart()

    // Validate coupon code format (alphanumeric and spaces allowed)
    if (code && !/^[A-Za-z0-9\s]+$/.test(cleanedCode)) {
      errors.code = "Coupon code must contain only letters, numbers, and spaces"
    }

    // Check if coupon code already exists
    if (code && !errors.code) {
      const existingCoupon = await Coupon.findOne({
        code: cleanedCode.toUpperCase(),
      })

      if (existingCoupon) {
        errors.code = "Coupon code already exists"
      }
    }

    // Validate dates
    if (startDate && endDate) {
      const startDateTime = new Date(startDate)
      const endDateTime = new Date(endDate)
      const currentDate = new Date()

      if (isNaN(startDateTime.getTime())) {
        errors.startDate = "Invalid start date"
      }

      if (isNaN(endDateTime.getTime())) {
        errors.endDate = "Invalid end date"
      }

      if (startDateTime < currentDate) {
        errors.startDate = "Start date cannot be in the past"
      }

      if (endDateTime < startDateTime) {
        errors.endDate = "End date cannot be earlier than start date"
      }
    }

    // Validate numeric fields
    if (minPurchase && (isNaN(minPurchase) || Number(minPurchase) < 0)) {
      errors.minPurchase = "Minimum purchase must be a non-negative number"
    }

    if (maxDiscount && (isNaN(maxDiscount) || Number(maxDiscount) <= 0)) {
      errors.maxDiscount = "Maximum discount must be a positive number"
    }

    if (usageLimit && (isNaN(usageLimit) || Number(usageLimit) <= 0)) {
      errors.usageLimit = "Usage limit must be a positive number"
    }

    // Validate discount amount vs minimum purchase for fixed discount type
    if (discountType === "fixed" && discountAmount && minPurchase && Number(discountAmount) > Number(minPurchase)) {
      errors.discountAmount = "Discount amount cannot be greater than minimum purchase for fixed discounts"
    }

    // Validate percentage discount (must be between 1 and 100)
    if (
      discountType === "percentage" &&
      discountAmount &&
      (Number(discountAmount) <= 0 || Number(discountAmount) > 100)
    ) {
      errors.discountAmount = "Percentage discount must be between 1 and 100"
    }

    // If there are validation errors, return them
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors,
      })
    }

    // Create and save the new coupon
    const newCoupon = new Coupon({
      code: cleanedCode.toUpperCase(),
      description: description.trim(),
      discountType,
      discountAmount: Number(discountAmount),
      minPurchase: minPurchase ? Number(minPurchase) : 0,
      maxDiscount: maxDiscount ? Number(maxDiscount) : null,
      startDate,
      endDate,
      usageLimit: usageLimit ? Number(usageLimit) : 1,
    })

    await newCoupon.save()

    return res.status(201).json({
      success: true,
      message: "Coupon created successfully",
    })
  } catch (error) {
    console.error("Error creating coupon:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to create coupon",
    })
  }
}

const getEditCoupon = async (req, res) => {
  try {
    const couponId = req.params.id
    const coupon = await Coupon.findById(couponId).populate({
      path: "usedBy.user",
      select: "username email",
    })

    if (!coupon) {
      return res.redirect("/admin/coupons")
    }

    res.render("admin/admin-edit-coupon", {
      coupon,
      currentPage: "coupons",
    })
  } catch (error) {
    console.error("Error fetching coupon for edit:", error)
    res.redirect("/admin/pageerror")
  }
}

const updateCoupon = async (req, res) => {
  try {
    const couponId = req.params.id
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
    } = req.body

    // Validation errors object
    const errors = {}

    // Validate required fields
    if (!description || description.trim() === "") {
      errors.description = "Description is required"
    }

    if (!discountType) {
      errors.discountType = "Discount type is required"
    }

    if (!discountAmount) {
      errors.discountAmount = "Discount amount is required"
    } else if (isNaN(discountAmount) || Number(discountAmount) <= 0) {
      errors.discountAmount = "Discount amount must be a positive number"
    }

    if (!startDate) {
      errors.startDate = "Start date is required"
    }

    if (!endDate) {
      errors.endDate = "End date is required"
    }

    // Clean the code by removing leading spaces but allow spaces between words
    const cleanedCode = code ? code.trimStart() : ""

    // Validate coupon code format if provided - FIXED: Now allows spaces like in addCoupon
    if (code && !/^[A-Za-z0-9\s]+$/.test(cleanedCode)) {
      errors.code = "Coupon code must contain only letters, numbers, and spaces"
    }

    // Check if coupon code already exists (excluding current coupon)
    if (code && !errors.code) {
      const existingCoupon = await Coupon.findOne({
        code: cleanedCode.toUpperCase(),
        _id: { $ne: couponId },
      })

      if (existingCoupon) {
        errors.code = "Coupon code already exists"
      }
    }

    // Validate dates
    if (startDate && endDate) {
      const startDateTime = new Date(startDate)
      const endDateTime = new Date(endDate)

      if (isNaN(startDateTime.getTime())) {
        errors.startDate = "Invalid start date"
      }

      if (isNaN(endDateTime.getTime())) {
        errors.endDate = "Invalid end date"
      }

      if (endDateTime < startDateTime) {
        errors.endDate = "End date cannot be earlier than start date"
      }
    }

    // Validate numeric fields
    if (minPurchase && (isNaN(minPurchase) || Number(minPurchase) < 0)) {
      errors.minPurchase = "Minimum purchase must be a non-negative number"
    }

    if (maxDiscount && (isNaN(maxDiscount) || Number(maxDiscount) <= 0)) {
      errors.maxDiscount = "Maximum discount must be a positive number"
    }

    if (usageLimit && (isNaN(usageLimit) || Number(usageLimit) <= 0)) {
      errors.usageLimit = "Usage limit must be a positive number"
    }

    // Validate discount amount vs minimum purchase for fixed discount type
    if (discountType === "fixed" && discountAmount && minPurchase && Number(discountAmount) > Number(minPurchase)) {
      errors.discountAmount = "Discount amount cannot be greater than minimum purchase for fixed discounts"
    }

    // Validate percentage discount (must be between 1 and 100)
    if (
      discountType === "percentage" &&
      discountAmount &&
      (Number(discountAmount) <= 0 || Number(discountAmount) > 100)
    ) {
      errors.discountAmount = "Percentage discount must be between 1 and 100"
    }

    // If there are validation errors, return them
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors,
      })
    }

    const updatedCoupon = await Coupon.findByIdAndUpdate(
      couponId,
      {
        ...(code && { code: cleanedCode.toUpperCase() }),
        description: description.trim(),
        discountType,
        discountAmount: Number(discountAmount),
        minPurchase: minPurchase ? Number(minPurchase) : 0,
        maxDiscount: maxDiscount ? Number(maxDiscount) : null,
        startDate,
        endDate,
        usageLimit: usageLimit ? Number(usageLimit) : 1,
      },
      { new: true },
    )

    if (!updatedCoupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      })
    }

    return res.status(200).json({
      success: true,
      message: "Coupon updated successfully",
    })
  } catch (error) {
    console.error("Error updating coupon:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to update coupon",
    })
  }
}

const toggleCouponStatus = async (req, res) => {
  try {
    const couponId = req.params.id
    const coupon = await Coupon.findById(couponId)

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      })
    }

    coupon.isActive = !coupon.isActive
    await coupon.save()

    return res.status(200).json({
      success: true,
      message: `Coupon ${coupon.isActive ? "activated" : "deactivated"} successfully`,
    })
  } catch (error) {
    console.error("Error toggling coupon status:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to update coupon status",
    })
  }
}

const deleteCoupon = async (req, res) => {
  try {
    const couponId = req.params.id
    const result = await Coupon.findByIdAndDelete(couponId)

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      })
    }

    return res.status(200).json({
      success: true,
      message: "Coupon deleted successfully",
    })
  } catch (error) {
    console.error("Error deleting coupon:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to delete coupon",
    })
  }
}

const getCouponUsage = async (req, res) => {
  try {
    const couponId = req.params.id
    const coupon = await Coupon.findById(couponId).populate({
      path: "usedBy.user",
      select: "username email",
    })

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      })
    }

    return res.status(200).json({
      success: true,
      usedBy: coupon.usedBy,
    })
  } catch (error) {
    console.error("Error fetching coupon usage data:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to fetch coupon usage data",
    })
  }
}

module.exports = {
  getCoupons,
  addCoupon,
  getEditCoupon,
  updateCoupon,
  toggleCouponStatus,
  deleteCoupon,
  getCouponUsage,
}
