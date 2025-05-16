const Wallet = require("../../models/walletSchema");
const User = require("../../models/userSchema");

exports.loadWallet = async (req, res) => {
  try {
    const userId = req.session.user._id;

    const wallet = await Wallet.findOne({ userId }).populate("userId", "name");
    const user = await User.findById(userId).select("referralCode");
    
    if (!wallet) {
      const newWallet = new Wallet({
        userId,
        balance: 0,
        transactions: [],
      });
      await newWallet.save();
      return res.render("user/wallet", {
        wallet: newWallet,
        user: req.session.user,
        title: "Your Wallet",
        message: "",
        referralCode: user.referralCode,
        referralBonus: 0
      });
    }

    const referralBonus = wallet.transactions
      .filter(t => t.description.includes('Referral bonus'))
      .reduce((sum, t) => sum + t.transactionAmount, 0);

    res.render("user/wallet", {
      wallet,
      user: req.session.user,
      title: "Your Wallet",
      message: req.session.message || "",
      referralCode: user.referralCode,
      referralBonus
    });
    req.session.message = null;
  } catch (error) {
    console.error("Error loading wallet:", error);
    req.session.message = "Error loading wallet page.";
    res.redirect("/user/profile");
  }
};