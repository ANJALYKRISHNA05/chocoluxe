const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/userSchema");
require("dotenv").config();

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/user/auth/google/callback',
    passReqToCallback: true  
},
async (req, accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ googleId: profile.id });
        if (user) {
            return done(null, user);
        } else {
          
            const referralCode = req.session.referralCode;
            console.log('Google Auth - Referral Code from session:', referralCode);
            let referredBy = null;
            
            if (referralCode) {
                const referrer = await User.findOne({ referralCode });
                console.log('Google Auth - Referrer found:', referrer ? 'Yes' : 'No');
                if (referrer) {
                    referredBy = referrer._id;
                    console.log('Google Auth - Referrer ID:', referredBy);
                   
                    req.session.googleReferral = {
                        referralCode,
                        referrerId: referrer._id,
                        referrerUsername: referrer.username
                    };
                    await new Promise((resolve) => req.session.save(resolve));
                    console.log('Google Auth - Saved referral info to session');
                }
            }
            
            user = new User({ 
                username: profile.displayName,
                email: profile.emails[0].value,
                googleId: profile.id,
                referredBy: referredBy
            });
            await user.save();
            
            
            req.session.newGoogleUser = {
                userId: user._id,
                referredBy: referredBy
            };
            
            return done(null, user);
        }
    } catch (err) {
        return done(err, null);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    User.findById(id)
        .then(user => {
            done(null, user);
        })
        .catch(err => {
            done(err, null);
        });
});

module.exports = passport;