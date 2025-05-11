const express = require('express');
const app = express();
const path = require('path');
const env = require('dotenv').config();
const db = require('./config/db');
const nocache = require('nocache');
const session = require('express-session');
const passport = require('./config/passport');
const userRouter = require('./routes/userRouter');
const adminRouter = require('./routes/adminRouter');
const uploadRouter = require('./routes/uploadRouter');
const MongoStore = require('connect-mongo'); 

db();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(nocache());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI, 
        collectionName: 'sessions',
        ttl: 72 * 60 * 60 
    }),
    cookie: {
        secure: false, 
        httpOnly: true,
        maxAge: 72 * 60 * 60 * 1000 
    }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use('/', userRouter);
app.use('/admin', adminRouter);
app.use('/upload', uploadRouter);

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;