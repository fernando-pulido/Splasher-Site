const express = require("express");
const session = require("express-session");
const mysql = require('mysql');
const moment = require("moment");
const bcrypt = require("bcrypt");
const { time } = require("console");
const req = require("express/lib/request");
const saltRounds = 10;
require("dotenv").config();
const app = express();
const pool = dbConnection();

app.set('trust proxy', 1) // trust first proxy
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true
    // cookie: { secure: true }
}))

app.set("view engine", "ejs");
app.use(express.static("public"));

//to parse Form data sent using POST method
app.use(express.urlencoded({ extended: true }));

//routes
app.get('/', (req, res) => {
    console.log("Now visiting GET route ('/')...");
    res.render('login', { title: 'Splasher! - Log In' })
});

app.get('/signup', (req, res) => {
    console.log("Now visiting GET route ('/signup')...");
    res.render('signup', { title: 'Splasher! - Sign Up' })
});

app.get('/home', isAuthenticated, (req, res) => {
    console.log("Now visiting GET route ('/home')...");
    const user = req.session.user;
    console.log("Authenticated user:\n" + user);
    res.render('home', { title: "Splasher!", user });
});

app.get('/profile', isAuthenticated, async (req, res) => {
    console.log("Now visiting GET route ('/profile')...");
    const user = req.session.user;
    console.log("Authenticated user:\n" + user);

    let userID = user.userID;
    let sql = `SELECT u.username, p.puddleImagePath, p.puddleText, p.timeStamp
               FROM users u
               JOIN puddle p USING (userID)
               WHERE userID = ?
               GROUP BY u.username, p.puddleText, p.timeStamp
               ORDER BY p.timeStamp DESC`;
    let params = [userID];
    let rows = await executeSQL(sql, params);

    sql = `SELECT COUNT(f.followsID) AS totalFollowers
           FROM users u
           LEFT JOIN follows f ON u.userID = f.followeeID
           WHERE userID = ?
           GROUP BY u.username`;
    let followerRows = await executeSQL(sql, params); 

    sql = `SELECT u.username, COUNT(f.followerID) as totalFollowing
           FROM users u
           LEFT JOIN follows f ON u.userID = f.followerID
           GROUP BY u.username`;
    let followingRows = await executeSQL(sql, params);

    res.render('profile', { title: "Splasher! - Profile", user, puddles: rows, followers: followerRows[0], following: followingRows[0]});
});

app.get('/create', isAuthenticated, (req, res) => {
    console.log("Now visiting GET route ('/create')...");
    const user = req.session.user;
    console.log("Authenticated user:\n" + user);

    res.render('create', { title: "Splasher! - Create Puddle", user });
});

app.get('/explore', isAuthenticated, (req, res) => {
    console.log("Now visiting GET route ('/explore')...");
    const user = req.session.user;
    console.log("Authenticated user:\n" + user);

    res.render('explore', {title: "Splasher! - Explore", user});
});

app.get('/editprofile', isAuthenticated, async (req, res) => {
    console.log("Now visiting GET route ('/editprofile')...");
    const user = req.session.user;
    console.log("Authenticated user:\n" + user);

    res.render('editprofile', { title: "Splasher! - Edit Profile", user });
});

app.post('/editprofile', isAuthenticated, async (req, res) => {
    console.log("Now visiting POST route ('/editprofile')...");
    const user = req.session.user;
    console.log("Authenticated user:\n" + user);

    let userID = user.userID;
    let profilePicturePath = req.body.profilePicturePath;
    let username = req.body.username;
    let firstName = req.body.firstName;
    let lastName = req.body.lastName;
    let sex = req.body.sex;
    let email = req.body.email;
    let phoneNumber = req.body.phoneNumber;
    let isPublic = req.body.isPublic;

    console.log("About to update profile");

    let sql = `UPDATE users
                SET profilePicturePath = ?,
                    username = ?,
                    firstName = ?,
                    lastName = ?,
                    sex = ?,
                    email = ?,
                    phoneNumber = ?,
                    isPublic = ?
                WHERE userID = ?`;
    let params = [profilePicturePath, username, firstName, lastName, sex, email, phoneNumber, isPublic, userID];
    let rows = await executeSQL(sql, params);

    sql = `SELECT *
            FROM users
            WHERE userID = ?`;
    params = [userID];
    userRows = await executeSQL(sql, params);

    req.session.user = userRows[0];

    res.redirect('/profile');
});

app.post('/create', isAuthenticated, async (req, res) => {
    console.log("Now visiting POST route ('/create')...");
    const user = req.session.user;
    console.log("Authenticated user:\n" + user);
    let puddleImagePath = req.body.puddleImagePath;
    let puddleText = req.body.puddleText;
    let timeStamp = getCurrentTimestamp();
    let userID = user.userID;

    console.log(puddleImagePath);
    console.log(puddleText);
    console.log(timeStamp);
    console.log(userID);

    if (!puddleImagePath && !puddleText) {
        console.log("Can't be empty!");
        res.render('create');
    } else {
        console.log("This is valid.")
        let sql = `INSERT INTO puddle (puddleImagePath, puddleText, timeStamp, userID)
                   VALUES (?, ?, ?, ?)`;
        let params = [puddleImagePath, puddleText, timeStamp, userID];
        let rows = await executeSQL(sql, params);
        res.redirect('/profile');
    }
});

app.post('/signup', async (req, res) => {
    console.log("Now visiting POST route ('/signup')...");
    // get fields from sign up page
    let username = req.body.username;
    let firstName = req.body.firstName;
    let lastName = req.body.lastName;
    let dateOfBirth = req.body.dateOfBirth;
    let sex = req.body.sex;
    let email = req.body.email;
    let phoneNumber = req.body.phoneNumber;
    let password = req.body.password;

    // hash password
    let passwordHash = bcrypt.hashSync(password, saltRounds);

    // get time stamp of account creation
    let timeStamp = getCurrentTimestamp();

    // make sure fields are not empty
    if (username && firstName && lastName && dateOfBirth && sex && email && phoneNumber && password) {
        try { // insert data into database
            let sql = `INSERT INTO users (username, firstName, lastName, dateOfBirth, sex, email, phoneNumber, passwordHash, timeStamp)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            let params = [username, firstName, lastName, dateOfBirth, sex, email, phoneNumber, passwordHash, timeStamp];
            let rows = await executeSQL(sql, params);
            console.log("sex:" + sex);
            req.session.authenticated = true;
            console.log(rows);
            req.session.user = rows[0];
            res.redirect('/home');
        } catch (error) {
            res.render('signup', { title: "Splasher! - Sign Up" });
        }
    }

});

app.post('/login', async (req, res) => {
    console.log("Now visiting POST route ('/login')...");
    // get fields from log in page
    let username = req.body.username;
    let password = req.body.password;
    let passwordHash = "";

    // SQL query statement to retrieve user
    let sql = `SELECT * FROM users WHERE username = ?`;

    // set username as the parameter
    let params = [username];

    // execute the SQL statement
    let rows = await executeSQL(sql, params);

    console.log(rows);

    // ensure user exists
    if (rows.length > 0) {
        passwordHash = rows[0].passwordHash;
    }

    // match passwords
    const match = await bcrypt.compare(password, passwordHash);

    if (match) {
        req.session.authenticated = true;
        req.session.user = rows[0];
        res.redirect('/home');
    } else {
        res.render('login', { title: "Splasher! - Login" });
    }
});

// simple database test
app.get("/dbTest", async function (req, res) {
    let sql = "SELECT CURDATE()";
    let rows = await executeSQL(sql);
    res.send(rows);
});

// functions

// executes the sql statements
async function executeSQL(sql, params) {
    console.log("Now visiting executeSQL() function...");
    return new Promise(function (resolve, reject) {
        pool.query(sql, params, function (err, rows, fields) {
            if (err) {
                console.error('SQL Error:', err.message);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// authenticates or fails a session
function isAuthenticated(req, res, next) {
    console.log("Authentication check - Session:", req.session);
    if (req.session.authenticated) {
        next();
    } else {
        console.log("Authentication Failed - Redirecting to /")
        res.redirect('/');
    }
}

// gets the current DATETIME
function getCurrentTimestamp() {
    return moment().format('YYYY-MM-DD HH:mm:ss');
}

// connects to the database
function dbConnection() {
    const pool = mysql.createPool({
        connectionLimit: 1000,
        connectTimeout: 60 * 60 * 1000,
        acquireTimeout: 60 * 60 * 1000,
        timeout: 60 * 60 * 1000,
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE
    });

    return pool;
}

// starts server
app.listen(3000, () => {
    console.log("Expresss server running on localhost:3000/");
})
