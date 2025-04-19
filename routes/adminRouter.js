const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const userController = require('../controllers/admin/userController');
const { userAuth, adminAuth } = require('../middlewares/auth');

router.get('/pageerror', adminController.pageerror);
router.get('/login', adminController.loadLogin);
router.post('/login', adminController.login);
router.get('/dashboard', adminAuth, adminController.loadDashboard);
router.get('/', adminAuth, adminController.loadDashboard);
router.post('/logout', adminController.logout);

router.get('/users', adminAuth, userController.loadUsers);
router.patch('/users/toggle-block/:id', adminAuth, userController.toggleBlockUser);

module.exports = router;