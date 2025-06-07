const Product = require("../../models/productSchema")
const Category = require("../../models/categorySchema")
const { cloudinary } = require("../../config/cloudinary")

exports.loadProducts = async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 4
    const skip = (page - 1) * limit
    const searchQuery = req.query.search || ""

    const filter = {}
    if (searchQuery) {
      filter.productName = { $regex: searchQuery, $options: "i" }
    }

    const totalProducts = await Product.countDocuments(filter)
    const products = await Product.find(filter).populate("category").sort({ createdAt: -1 }).skip(skip).limit(limit)

    res.render("admin/admin_product_list", {
      products,
      activePage: "products",
      currentPage: page,
      totalPages: Math.ceil(totalProducts / limit),
      limit,
      totalProducts,
      searchQuery,
    })
  } catch (error) {
    console.error("Error loading products:", error)
    res.redirect("/admin/pageerror")
  }
}

exports.loadProductForm = async (req, res) => {
  try {
    const categories = await Category.find({ isListed: true })
    let product = null
    if (req.params.id) {
      product = await Product.findById(req.params.id).populate("category")
    }
    res.render("admin/admin_product_form", {
      product,
      categories,
      activePage: "products",
      errors: null,
      success: null,
    })
  } catch (error) {
    console.error("Error loading product form:", error)
    res.redirect("/admin/pageerror")
  }
}

exports.addProduct = async (req, res) => {
  try {
    const { productName, description, category, variants } = req.body
    const files = req.files

    const errors = []

    const existingProduct = await Product.findOne({
      productName: { $regex: new RegExp(`^${productName.trim()}$`, "i") },
    })

    if (existingProduct) {
      errors.push({ msg: "Product name already exists. Please provide another name." })
    }

    if (!productName || productName.trim().length < 3) {
      errors.push({ msg: "Product name must be at least 3 characters long." })
    }

    if (!description || description.trim().length < 10) {
      errors.push({ msg: "Description must be at least 10 characters long." })
    }

    if (!category) {
      errors.push({ msg: "Please select a category." })
    }

    let parsedVariants
    try {
      parsedVariants = Array.isArray(variants) ? variants : JSON.parse(variants)
    } catch (parseError) {
      errors.push({ msg: "Invalid variant data format." })
      parsedVariants = []
    }

    if (!parsedVariants || parsedVariants.length === 0) {
      errors.push({ msg: "At least one variant is required." })
    }

    const variantImages = {}
    files.forEach((file) => {
      const match = file.fieldname.match(/variants\[(\d+)\]\[images\]/)
      if (match) {
        const variantIndex = match[1]
        if (!variantImages[variantIndex]) variantImages[variantIndex] = []
        variantImages[variantIndex].push(file.path)
      }
    })

    parsedVariants = parsedVariants.map((variant, index) => {
      const images = variantImages[index] || []

      if (!variant.flavor) {
        errors.push({ msg: `Variant ${index + 1}: Flavor is required.` })
      }
      if (!variant.sugarLevel) {
        errors.push({ msg: `Variant ${index + 1}: Sugar level is required.` })
      }
      if (!variant.weight || isNaN(variant.weight) || variant.weight <= 0) {
        errors.push({ msg: `Variant ${index + 1}: Valid weight is required.` })
      }
      if (!variant.stock_quantity || isNaN(variant.stock_quantity) || variant.stock_quantity < 0) {
        errors.push({ msg: `Variant ${index + 1}: Valid stock quantity is required.` })
      }
      if (!variant.regularPrice || isNaN(variant.regularPrice) || variant.regularPrice <= 0) {
        errors.push({ msg: `Variant ${index + 1}: Valid regular price is required.` })
      }
      if (!variant.salePrice || isNaN(variant.salePrice) || variant.salePrice <= 0) {
        errors.push({ msg: `Variant ${index + 1}: Valid sale price is required.` })
      }

      if (
        variant.regularPrice &&
        variant.salePrice &&
        Number.parseFloat(variant.salePrice) > Number.parseFloat(variant.regularPrice)
      ) {
        errors.push({ msg: `Variant ${index + 1}: Sale price should not be greater than regular price.` })
      }

      if (
        variant.productOffer &&
        (isNaN(variant.productOffer) || variant.productOffer < 0 || variant.productOffer > 100)
      ) {
        errors.push({ msg: `Variant ${index + 1}: Offer percentage must be between 0 and 100.` })
      }

      if (images.length < 3) {
        errors.push({ msg: `Variant ${index + 1}: Minimum 3 images are required.` })
      }

      return {
        ...variant,
        weight: Number(variant.weight),
        stock_quantity: Number(variant.stock_quantity),
        regularPrice: Number(variant.regularPrice),
        salePrice: Number(variant.salePrice),
        productOffer: Number(variant.productOffer || 0),
        productImage: images,
      }
    })

    if (errors.length > 0) {
      const categories = await Category.find({ isListed: true })
      return res.render("admin/admin_product_form", {
        product: null,
        categories,
        activePage: "products",
        errors,
        success: null,
      })
    }

    const product = new Product({
      productName: productName.trim(),
      description: description.trim(),
      category,
      variants: parsedVariants,
    })

    await product.save()

    res.redirect("/admin/products?success=Product added successfully")
  } catch (error) {
    console.error("Error adding product:", error)
    const categories = await Category.find({ isListed: true })
    res.render("admin/admin_product_form", {
      product: null,
      categories,
      activePage: "products",
      errors: [{ msg: "Error adding product. Please try again." }],
      success: null,
    })
  }
}

exports.editProduct = async (req, res) => {
  try {
    const { productName, description, category, variants, deletedImages } = req.body
    const files = req.files

    const errors = []
    const product = await Product.findById(req.params.id)

    if (!product) {
      errors.push({ msg: "Product not found." })
    }

    const existingProduct = await Product.findOne({
      productName: { $regex: new RegExp(`^${productName.trim()}$`, "i") },
      _id: { $ne: req.params.id },
    })

    if (existingProduct) {
      errors.push({ msg: "Product name already exists. Please provide another name." })
    }


    if (!productName || productName.trim().length < 3) {
      errors.push({ msg: "Product name must be at least 3 characters long." })
    }

   
    if (!description || description.trim().length < 10) {
      errors.push({ msg: "Description must be at least 10 characters long." })
    }

    if (!category) {
      errors.push({ msg: "Please select a category." })
    }

    let parsedVariants
    try {
      parsedVariants = Array.isArray(variants) ? variants : JSON.parse(variants)
    } catch (parseError) {
      errors.push({ msg: "Invalid variant data format." })
      parsedVariants = []
    }

    
    let deletedImagesList = []
    if (deletedImages) {
      try {
        deletedImagesList = JSON.parse(deletedImages)
      } catch (parseError) {
        console.error("Error parsing deleted images:", parseError)
      }
    }

    const variantImages = {}
    files.forEach((file) => {
      const match = file.fieldname.match(/variants\[(\d+)\]\[images\]/)
      if (match) {
        const variantIndex = match[1]
        if (!variantImages[variantIndex]) variantImages[variantIndex] = []
        variantImages[variantIndex].push(file.path)
      }
    })


    parsedVariants = parsedVariants.map((variant, index) => {
      const newImages = variantImages[index] || []
      const existingImages = product.variants[index]?.productImage || []

    
      const remainingImages = existingImages.filter(
        (img) => !deletedImagesList.some((deleted) => deleted.variantIndex == index && deleted.imageUrl === img),
      )

      const totalImages = remainingImages.length + newImages.length

  
      if (!variant.flavor) {
        errors.push({ msg: `Variant ${index + 1}: Flavor is required.` })
      }
      if (!variant.sugarLevel) {
        errors.push({ msg: `Variant ${index + 1}: Sugar level is required.` })
      }
      if (!variant.weight || isNaN(variant.weight) || variant.weight <= 0) {
        errors.push({ msg: `Variant ${index + 1}: Valid weight is required.` })
      }
      if (!variant.stock_quantity || isNaN(variant.stock_quantity) || variant.stock_quantity < 0) {
        errors.push({ msg: `Variant ${index + 1}: Valid stock quantity is required.` })
      }
      if (!variant.regularPrice || isNaN(variant.regularPrice) || variant.regularPrice <= 0) {
        errors.push({ msg: `Variant ${index + 1}: Valid regular price is required.` })
      }
      if (!variant.salePrice || isNaN(variant.salePrice) || variant.salePrice <= 0) {
        errors.push({ msg: `Variant ${index + 1}: Valid sale price is required.` })
      }

      
      if (
        variant.regularPrice &&
        variant.salePrice &&
        Number.parseFloat(variant.salePrice) > Number.parseFloat(variant.regularPrice)
      ) {
        errors.push({ msg: `Variant ${index + 1}: Sale price should not be greater than regular price.` })
      }

      
      if (
        variant.productOffer &&
        (isNaN(variant.productOffer) || variant.productOffer < 0 || variant.productOffer > 100)
      ) {
        errors.push({ msg: `Variant ${index + 1}: Offer percentage must be between 0 and 100.` })
      }

      if (totalImages < 3) {
        errors.push({ msg: `Variant ${index + 1}: Minimum 3 images are required.` })
      }

      return {
        ...variant,
        weight: Number(variant.weight),
        stock_quantity: Number(variant.stock_quantity),
        regularPrice: Number(variant.regularPrice),
        salePrice: Number(variant.salePrice),
        productOffer: Number(variant.productOffer || 0),
        productImage: [...remainingImages, ...newImages],
      }
    })

    if (errors.length > 0) {
      const categories = await Category.find({ isListed: true })
      return res.render("admin/admin_product_form", {
        product,
        categories,
        activePage: "products",
        errors,
        success: null,
      })
    }

    for (const deletedImage of deletedImagesList) {
      try {
        const publicId = deletedImage.imageUrl.split("/").pop().split(".")[0]
        await cloudinary.uploader.destroy(`product_images/${publicId}`)
      } catch (deleteError) {
        console.error("Error deleting image from cloudinary:", deleteError)
      }
    }

    product.productName = productName.trim()
    product.description = description.trim()
    product.category = category
    product.variants = parsedVariants

    await product.save()
    res.redirect("/admin/products?success=Product updated successfully")
  } catch (error) {
    console.error("Error editing product:", error)
    const categories = await Category.find({ isListed: true })
    const product = await Product.findById(req.params.id)
    res.render("admin/admin_product_form", {
      product,
      categories,
      activePage: "products",
      errors: [{ msg: "Error editing product. Please try again." }],
      success: null,
    })
  }
}

exports.toggleProductStatus = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
    product.isBlocked = !product.isBlocked
    await product.save()
    res.json({ success: true })
  } catch (error) {
    console.error("Error toggling product status:", error)
    res.status(500).json({ success: false, message: "Error toggling product status" })
  }
}

exports.updateProductOffer = async (req, res) => {
  try {
    const productId = req.params.id
    const { variants } = req.body
    const product = await Product.findById(productId)
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" })
    }

    for (const variantUpdate of variants) {
      const index = Number.parseInt(variantUpdate.index)
      if (index >= 0 && index < product.variants.length) {
        const productOffer = Number.parseInt(variantUpdate.productOffer) || 0
        if (productOffer < 0 || productOffer > 100) {
          return res.status(400).json({ success: false, message: `Invalid offer percentage for variant ${index + 1}` })
        }
        product.variants[index].productOffer = productOffer
      } else {
        return res.status(400).json({ success: false, message: `Invalid variant index ${index}` })
      }
    }

    await product.save()
    res.json({ success: true })
  } catch (error) {
    console.error("Error updating product offer:", error)
    res.status(500).json({ success: false, message: "Error updating product offer" })
  }
}
