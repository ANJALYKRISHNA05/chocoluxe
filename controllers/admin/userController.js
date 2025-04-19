const User = require('../../models/userSchema');

const loadUsers = async (req, res) => {
  try {
    const perPage = 5; 
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * perPage;
    const searchQuery = req.query.search || '';

    const searchConditions = {
      isAdmin: false,
      $or: [
        { username: { $regex: searchQuery, $options: 'i' } },
        { email: { $regex: searchQuery, $options: 'i' } },
        { phone: { $regex: searchQuery, $options: 'i' } },
      ],
    };

    const users = await User.find(searchConditions)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(perPage);

    const totalUsers = await User.countDocuments(searchConditions);
    const totalPages = Math.ceil(totalUsers / perPage);

    res.render('admin/users', {
      users,
      currentPage: page,
      totalPages,
      totalUsers,
      searchQuery,
      activePage: 'users',
      admin: req.session.admin,
    });
  } catch (error) {
    console.error('Error loading users:', error);
    res.status(500).send('Server error');
  }
};

const toggleBlockUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.isBlocked = !user.isBlocked;
    await user.save();

    res.status(200).json({
      success: true,
      isBlocked: user.isBlocked,
      message: user.isBlocked ? 'User blocked successfully' : 'User unblocked successfully',
    });
  } catch (error) {
    console.error('Error toggling user block status:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  loadUsers,
  toggleBlockUser,
};