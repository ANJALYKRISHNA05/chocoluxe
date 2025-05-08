const Wallet = require("../../models/walletSchema");

exports.loadWallet = async (req, res) => {
  try {
    const userId = req.session.user._id;

    // Fetch the user's wallet
    const wallet = await Wallet.findOne({ userId }).populate("userId", "name");
    if (!wallet) {
      // If no wallet exists, create one with zero balance
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
      });
    }

    res.render("user/wallet", {
      wallet,
      user: req.session.user,
      title: "Your Wallet",
      message: req.session.message || "",
    });
    req.session.message = null;
  } catch (error) {
    console.error("Error loading wallet:", error);
    req.session.message = "Error loading wallet page.";
    res.redirect("/user/profile");
  }
};