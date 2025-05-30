const Subscription = require('../../models/subscriptionSchema');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD
    }
});

const handleSubscription = async (req, res) => {
    try {
        const { email } = req.body;

       
        const existingSubscription = await Subscription.findOne({ email });
        if (existingSubscription) {
            return res.json({
                success: false,
                message: 'This email is already subscribed to our newsletter.'
            });
        }

      
        const subscription = new Subscription({ email });
        await subscription.save();

        const mailOptions = {
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: 'Welcome to the Chocoluxe Community! 🍫',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h1 style="color: #4a2c2a; text-align: center;">Welcome to Chocoluxe!</h1>
                    
                    <p style="color: #666; font-size: 16px; line-height: 1.6;">
                        Dear Chocolate Lover,
                    </p>
                    
                    <p style="color: #666; font-size: 16px; line-height: 1.6;">
                        Thank you for joining our sweet community! We're thrilled to have you as part of our chocolate-loving family.
                    </p>
                    
                    <p style="color: #666; font-size: 16px; line-height: 1.6;">
                        As a subscriber, you'll be the first to know about:
                    </p>
                    
                    <ul style="color: #666; font-size: 16px; line-height: 1.6;">
                        <li>Exclusive offers and discounts</li>
                        <li>New product launches</li>
                        <li>Seasonal collections</li>
                        <li>Chocolate tasting events</li>
                        <li>Behind-the-scenes content</li>
                    </ul>
                    
                   
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://chocoluxe.com/products" 
                           style="background-color: #4a2c2a; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                            Shop Now
                        </a>
                    </div>
                    
                    <p style="color: #666; font-size: 16px; line-height: 1.6;">
                        Follow us on social media for daily chocolate inspiration:
                        <br>
                        Instagram: @chocoluxe
                        <br>
                        Facebook: @chocoluxeofficial
                    </p>
                    
                    <p style="color: #666; font-size: 16px; line-height: 1.6;">
                        With sweet regards,
                        <br>
                        The Chocoluxe Team
                    </p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);

        res.json({
            success: true,
            message: 'Thank you for subscribing! Please check your email for a welcome message.'
        });

    } catch (error) {
        console.error('Subscription error:', error);
        res.json({
            success: false,
            message: 'Sorry, there was an error processing your subscription. Please try again.'
        });
    }
};

module.exports = {
    handleSubscription
};
