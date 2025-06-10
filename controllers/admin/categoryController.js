const Category = require("../../models/categorySchema")
const { categoryStorage } = require("../../config/cloudinary")
const multer = require("multer")
const upload = multer({ storage: categoryStorage })

const categoryController = {
  loadCategories: async (req, res) => {
    try {
      const page = Number.parseInt(req.query.page) || 1
      const limit = Number.parseInt(req.query.limit) || 5
      const skip = (page - 1) * limit
      const searchQuery = req.query.search || ""

      const query = {}
      if (searchQuery) {
        query.name = { $regex: searchQuery, $options: "i" }
      }

      const totalCategories = await Category.countDocuments(query)
      const categories = await Category.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit)

      res.render("admin/admin_category_list", {
        categories,
        activePage: "category",
        title: "Category Management",
        currentPage: page,
        totalPages: Math.ceil(totalCategories / limit),
        limit,
        searchQuery,
        totalCategories,
      })
    } catch (error) {
      console.error("Error loading categories:", error)
      res.redirect("/admin/pageerror")
    }
  },

  loadCategoryForm: async (req, res) => {
    try {
      const categoryId = req.params.id

      if (categoryId) {
        const category = await Category.findById(categoryId)
        if (!category) {
          return res.redirect("/admin/category")
        }

        return res.render("admin/admin_category_form", {
          category,
          error: null,
          errors: {},
          activePage: "category",
          title: "Edit Category",
        })
      }

      res.render("admin/admin_category_form", {
        category: null,
        error: null,
        errors: {},
        activePage: "category",
        title: "Add Category",
      })
    } catch (error) {
      console.error("Error loading category form:", error)
      res.redirect("/admin/pageerror")
    }
  },

  validateCategoryData: (req, isEdit = false) => {
    const { name, description, categoryOffer } = req.body
    const errors = {}

    if (!name || name.trim() === "") {
      errors.name = "Category name is required"
    } else if (name.trim().length < 2) {
      errors.name = "Category name must be at least 2 characters long"
    } else if (name.trim().length > 50) {
      errors.name = "Category name must not exceed 50 characters"
    } else if (!/^[a-zA-Z0-9\s&-]+$/.test(name.trim())) {
      errors.name = "Category name can only contain letters, numbers, spaces, & and -"
    }

    if (!description || description.trim() === "") {
      errors.description = "Description is required"
    } else if (description.trim().length < 10) {
      errors.description = "Description must be at least 10 characters long"
    } else if (description.trim().length > 500) {
      errors.description = "Description must not exceed 500 characters"
    }


    if (categoryOffer === undefined || categoryOffer === null || categoryOffer === "") {
      errors.categoryOffer = "Category offer is required"
    } else {
      const offer = Number(categoryOffer)
      if (isNaN(offer)) {
        errors.categoryOffer = "Category offer must be a valid number"
      } else if (offer < 0) {
        errors.categoryOffer = "Category offer cannot be negative"
      } else if (offer > 100) {
        errors.categoryOffer = "Category offer cannot exceed 100%"
      } else if (!Number.isInteger(offer)) {
        errors.categoryOffer = "Category offer must be a whole number"
      }
    }

    
    if (!isEdit && !req.file) {
      errors.image = "Category image is required"
    }


    if (req.file) {
      const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]
      if (!allowedTypes.includes(req.file.mimetype)) {
        errors.image = "Please upload a valid image file (JPEG, PNG, GIF, or WebP)"
      }

     
      if (req.file.size > 5 * 1024 * 1024) {
        errors.image = "Image file size must not exceed 5MB"
      }
    }

    return errors
  },

  addCategory: [
    upload.single("image"),
    async (req, res) => {
      try {
        const { name, description, categoryOffer } = req.body
        const isListed = req.body.isListed === "on"

        const validationErrors = categoryController.validateCategoryData(req, false)

        if (!validationErrors.name && name) {
          const existingCategory = await Category.findOne({
           name: { $regex: new RegExp(`^${name.trim()}$`, "i") },

          })
          if (existingCategory) {
            
            validationErrors.name = "Category name already exists"
          }
        }

       
        if (Object.keys(validationErrors).length > 0) {
          return res.render("admin/admin_category_form", {
            error: "Please correct the errors below",
            errors: validationErrors,
            category: {
              name: name || "",
              description: description || "",
              categoryOffer: categoryOffer || 0,
              isListed,
            },
            activePage: "category",
            title: "Add Category",
          })
        }

        const slug = name.trim().toLowerCase().replace(/\s+/g, "-")
        const image = req.file ? req.file.path : ""
        const offer = Number.parseInt(categoryOffer) || 0

        const category = new Category({
          name: name.trim(),
          description: description.trim(),
          image,
          slug,
          isListed,
          categoryOffer: offer,
        })

        await category.save()
        res.redirect("/admin/category")
      } catch (error) {
        console.error("Error adding category:", error)
        res.render("admin/admin_category_form", {
          error: "An error occurred while adding the category. Please try again.",
          errors: {},
          category: {
            name: req.body.name || "",
            description: req.body.description || "",
            categoryOffer: req.body.categoryOffer || 0,
            isListed: req.body.isListed === "on",
          },
          activePage: "category",
          title: "Add Category",
        })
      }
    },
  ],

  editCategory: [
    upload.single("image"),
    async (req, res) => {
      try {
        const { name, description, categoryOffer } = req.body
        const isListed = req.body.isListed === "on"
        const categoryId = req.params.id

        
        const existingCategory = await Category.findById(categoryId)
        if (!existingCategory) {
          return res.redirect("/admin/category")
        }

     
        const validationErrors = categoryController.validateCategoryData(req, true)

    
        if (!validationErrors.name && name) {
          const duplicateCategory = await Category.findOne({
         
            name: { $regex: new RegExp(`^${name.trim()}$`, "i") },

            _id: { $ne: categoryId },
          })
          if (duplicateCategory) {
            validationErrors.name = "Category name already exists"
          }
        }

      
        if (Object.keys(validationErrors).length > 0) {
          return res.render("admin/admin_category_form", {
            error: "Please correct the errors below",
            errors: validationErrors,
            category: {
              _id: categoryId,
              name: name || "",
              description: description || "",
              image: existingCategory.image,
              isListed,
              categoryOffer: categoryOffer || 0,
            },
            activePage: "category",
            title: "Edit Category",
          })
        }

        const slug = name.trim().toLowerCase().replace(/\s+/g, "-")
        const offer = Number.parseInt(categoryOffer) || 0

        existingCategory.name = name.trim()
        existingCategory.description = description.trim()
        existingCategory.slug = slug
        existingCategory.isListed = isListed
        existingCategory.categoryOffer = offer

        if (req.file) {
          existingCategory.image = req.file.path
        }

        await existingCategory.save()
        res.redirect("/admin/category")
      } catch (error) {
        console.error("Error editing category:", error)
        const categoryId = req.params.id
        const existingCategory = await Category.findById(categoryId)

        res.render("admin/admin_category_form", {
          error: "An error occurred while updating the category. Please try again.",
          errors: {},
          category: {
            _id: categoryId,
            name: req.body.name || "",
            description: req.body.description || "",
            image: existingCategory ? existingCategory.image : "",
            isListed: req.body.isListed === "on",
            categoryOffer: req.body.categoryOffer || 0,
          },
          activePage: "category",
          title: "Edit Category",
        })
      }
    },
  ],

  toggleCategoryStatus: async (req, res) => {
    try {
      const categoryId = req.params.id
      const category = await Category.findById(categoryId)
      if (!category) {
        return res.status(404).json({ success: false, message: "Category not found" })
      }

      category.isListed = !category.isListed
      await category.save()
      res.json({ success: true, isListed: category.isListed })
    } catch (error) {
      console.error("Error toggling category status:", error)
      res.status(500).json({ success: false, message: "Server error" })
    }
  },

  updateCategoryOffer: async (req, res) => {
    try {
      const categoryId = req.params.id
      const { categoryOffer } = req.body
      const offer = Number.parseInt(categoryOffer) || 0

      if (offer < 0 || offer > 100) {
        return res.status(400).json({ success: false, message: "Offer percentage must be between 0 and 100" })
      }

      const category = await Category.findById(categoryId)
      if (!category) {
        return res.status(404).json({ success: false, message: "Category not found" })
      }

      category.categoryOffer = offer
      await category.save()
      res.json({ success: true })
    } catch (error) {
      console.error("Error updating category offer:", error)
      res.status(500).json({ success: false, message: "Error updating category offer" })
    }
  },
}

module.exports = categoryController