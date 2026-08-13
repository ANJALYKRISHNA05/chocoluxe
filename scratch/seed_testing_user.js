const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/userSchema');
const Wallet = require('../models/walletSchema');
require('dotenv').config();

async function seedTestingUser() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chocoluxe');
        console.log('DB connected for seeding...');

        const testEmail = 'testing@gmail.com';
        const testPassword = 'testing123#';

        let user = await User.findOne({ email: testEmail });
        const hashedPassword = await bcrypt.hash(testPassword, 10);

        if (!user) {
            user = new User({
                username: 'testinguser',
                email: testEmail,
                password: hashedPassword,
                phone: '9876543210',
                isBlocked: false
            });
            await user.save();
            console.log('Created testing@gmail.com user successfully!');
        } else {
            user.password = hashedPassword;
            user.isBlocked = false;
            await user.save();
            console.log('Updated password for existing testing@gmail.com user!');
        }

        // Ensure wallet exists
        let wallet = await Wallet.findOne({ userId: user._id });
        if (!wallet) {
            wallet = new Wallet({
                userId: user._id,
                balance: 1000,
                transactions: [{
                    amount: 1000,
                    type: 'credit',
                    description: 'Demo Welcome Bonus',
                    date: new Date()
                }]
            });
            await wallet.save();
            console.log('Created wallet for testing user with 1000 balance.');
        }

        await mongoose.disconnect();
        console.log('Seeding finished.');
    } catch (err) {
        console.error('Seeding error:', err);
    }
}

seedTestingUser();
