const express = require("express");
const User = require("./models/user");
const dotenv = require("dotenv").config();
const cookieParser = require("cookie-parser");
const port = 2006;
const app = express();
const mongoose = require("mongoose");
const generateUniqueId = require('generate-unique-id');
const signUser = require("./jwt");
const check = require("./middlewares/Check");
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const cors = require("cors");
const { log } = require("console");

// Dummy in-memory user database
const users = {};
const otpStore = {};

// CORS Configuration to Allow All Origins
const corsOptions = {
    origin: process.env.FRONTENDURL,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// To Begin The Connection With Database
mongoose.connect(process.env.DBURL)
    .then(() => console.log("MongoDB connected"))
    .catch(err => console.log("MongoDB connection error:", err));

// Middlewares
app.use(cookieParser());
app.use(express.json());
app.use(cors(corsOptions));

app.get('/', (req, res) => {
    return res.status(200).send("Hello World!");
});

// Setup email transport
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465, // or 587 for TLS
    secure: true, // true for 465, false for 587
    auth: {
        user: process.env.EMAIL,
        pass: process.env.EPASS, // App Password
    }
});

// Function to generate and send OTP
function sendOtp(email, otp, resend = false) {
    const mailOptions = {
        from: process.env.EMAIL,
        to: email,
        subject: resend ? 'Resend OTP' : 'Your OTP Code',
        text: `Your OTP code is: ${otp} for conformation on todo
Thank you for choosing Todo to keep your tasks on track!

Best regards,
The Todo Team
Email: blackash.github@gmail.com        
        `
    };
    return transporter.sendMail(mailOptions);
}

// Function to send registration successful email
const sendRegistationEmail = async (email, username) => {
    const mailOptions = {
        from: process.env.EMAIL,
        to: email,
        subject: `Welcome to Todo, ${username}! 🎉`,
        text: `
        Hi ${username},

Welcome to Todo! We are excited to have you on board. Your registration has been successfully completed, and you can now start organizing your tasks efficiently with Todo.
Here’s a quick summary of your account details:

Username: ${username}

Feel free to log in and begin managing your tasks. If you have any questions or need help, our support team is here for you. Just drop us an email at blackash.github@gmail.com.

Thank you for choosing Todo to keep your tasks on track!

Best regards,
The Todo Team
Email: blackash.github@gmail.com
        `
    };
    return transporter.sendMail(mailOptions);
}

// To Register User
app.post("/api/register/", async (req, res) => {
    const { email, username, password } = req.body;
    try {
        // Find the user by email
        const isEmail = await User.findOne({ email });
        const isUsername = await User.findOne({ username });


        // Check if user exists
        if (isEmail) {
            return res.status(400).json({ message: "User Already Exist" });
        }
        // Check if username is already taken or nor
        if (isUsername) {
            return res.status(400).json({ message: "Username Already Exist" });
        }

        // Creating a user if already not exist
        const user = await User.create({ username, email, password });

        // Creating Payload
        const payload = {
            id: user.id,
            username: user.username,
            email: user.email
        }

        // To Create User Token
        const token = signUser(payload);
        sendRegistationEmail(email, username)
        return res.status(200).json({ status: "success", payload, token })

    } catch (err) {
        console.error("Error logging in:", err);
        res.status(500).json({ message: "Server error" });
    }

})

// For Request Otp
app.post('/api/register-otp', (req, res) => {
    const { email } = req.body;

    // Generate a unique OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit OTP
    otpStore[email] = otp;

    // Send OTP email
    sendOtp(email, otp)
        .then(() => {
            users[email] = { verified: false };
            res.status(200).send('OTP sent successfully. Please check your email for the OTP.');
        })
        .catch((error) => {
            console.error('Error sending OTP email:', error);
            res.status(500).send('Error sending OTP email.');
        });

});

// To Verify Otp
app.post('/api/verify-otp', async (req, res) => {
    const { email, otp } = req.body;

    // Check if user exists
    const isUser = await User.findOne({ email });

    if (isUser) {
        return res.status(400).json({ message: "User Already Exist" });
    }

    const storedOtp = otpStore[email];

    if (storedOtp && storedOtp === otp) {
        users[email].verified = true;
        delete otpStore[email];
        res.status(200).send('Email verified successfully!');
    } else {
        res.status(400).send('Invalid OTP.');
    }
});

// For Resend Otp
app.post('/api/resend-otp', (req, res) => {
    const { email } = req.body;

    // Generate a unique OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit OTP
    otpStore[email] = otp;

    // Send OTP email
    sendOtp(email, otp, true)
        .then(() => {
            users[email] = { verified: false };
            res.status(200).send('OTP resend successful! Please check your email for the OTP.');
        })
        .catch((error) => {
            console.error('Error sending OTP email:', error);
            res.status(500).send('Error sending OTP email.');
        });
});

// To Login User
app.post('/api/login/', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        // Don't send the request if fields are empty
        return res.status(400).json({ message: "Email or Password is missing" });
    }

    try {
        // Find the user by email
        const user = await User.findOne({ email });

        // Check if user exists
        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }

        // Compare the entered password with the stored hashed password
        const isMatch = await user.matchPassword(password)

        // Checking if password is correct or not
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        //Creating Payload
        const payload = {
            id: user.id,
            username: user.username,
            email: user.email
        }

        //Genrating Token
        const token = signUser(payload);

        return res.status(200).json({ status: "success", payload, token })

    } catch (err) {
        console.error("Error logging in:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// To Reset Password Function
const sendResetOtp = async (email, otp) => {
    const mailOptions = {
        from: process.env.EMAIL,
        to: email,
        subject: 'Reset Password OTP',
        text: `Your OTP code is: ${otp} for reset password on todo app.
        
Thank you for choosing Todo to keep your tasks on track!

Best regards,
The Todo Team
Email: blackash.github@gmail.com
        `
    };
    return transporter.sendMail(mailOptions);
}

// To Forgot Password Otp
app.post('/api/reset-password-otp/', async (req, res) => {
    const { email } = req.body;

    const isUser = await User.findOne({ email });
    if (!isUser) {
        return res.status(400).json({ message: "User not found" });
    }

    // Generate a unique OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    otpStore[email] = otp;

    // Send Password Reset OTP email
    sendResetOtp(email, otp)
        .then(() => {
            users[email] = { resetVerified: false };
            res.status(200).send('OTP sent successfully. Please check your email for the OTP.');
        })
        .catch((error) => {
            console.error('Error sending OTP email:', error);
            res.status(500).send('Error sending OTP email.');
        });

})

// To Send Confirmation mail
const sendConfirmReset = async (email) => {
    const mailOptions = {
        from: process.env.EMAIL,
        to: email,
        subject: 'Password Reset Successful',
        text: `Your password has been reset successfully.
Please login with your new password.

If you did not request a password reset, please report this issue.
on todo app team.

Thank you for choosing Todo to keep your tasks on track!

Best regards,
The Todo Team
Email: blackash.github@gmail.com
         `
    };
    try {
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error('Error sending confirmation email:', error);
    }
}

// To Reset Password
app.post('/api/reset-password/', async (req, res) => {
    const { email, resetPassword, otp } = req.body;
    const storedOtp = otpStore[email];

    const user = await User.findOne({ email });
    if (!user) {
        return res.status(400).json({ message: "User not found" });
    }

    try {
        if (storedOtp && storedOtp === otp) {
            users[email].resetVerified = true;
            user.password = resetPassword;
            delete otpStore[email];
            await user.save();
            sendConfirmReset(email);
            return res.status(200).json({ message: "Password reset successful" });
        } else {
            return res.status(400).json({ message: "Invalid OTP" });
        }
    }
    catch (err) {
        console.error("Error resetting password:", err);
        res.status(500).json({ message: "Server error" });
    }


})

// To Get User Profile
app.get("/api/user/profile/", check, async (req, res) => {
    try {
        const user = await User.findOne({ email: req.user.email }).select('-password');
        let totalTask = user.todos;
        totalTask = totalTask.length;
        const taskCompleted = user.todos.filter(todo => todo.isCompleted).length;
        const taskRemaining = parseInt(totalTask) - parseInt(taskCompleted)

        // To Create User Profile Payload
        const profile = {
            id: user._id,
            email: user.email,
            username: user.username,
            totalTask: totalTask,
            taskCompleted: taskCompleted,
            taskRemaining: taskRemaining

        }
        // Exclude the password field
        return res.json(profile);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
})

// To Update User Profile
app.put("/api/user/profile/", check, async (req, res) => {
    const { username } = req.body
    try {
        const user = await User.findOneAndUpdate({ email: req.user.email }, { username: username });
        return res.json("Profile Updated Successfully");
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Username already exists" });
    }
});

// To Add User Todo 
app.put("/api/user/todos", check, async (req, res) => {
    try {
        // Getting user from database
        const user = await User.findOne({ email: req.user.email }).select('-password');
        // User new todo
        let newTodo = req.body;
        newTodo.isCompleted = false
        newTodo.id = generateUniqueId({
            length: 15
        });

        // Getting user initial todos
        let userNewTodos = user.todos;
        userNewTodos.push(newTodo)

        // Updating todos in database
        await User.findByIdAndUpdate(req.user.id, { todos: userNewTodos })

        // Exclude the password field
        return res.json("Todo Added Successfully");
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
})

// To Get User Todo
app.get("/api/user/todos", check, async (req, res) => {
    try {
        // Getting user from database
        const user = await User.findOne({ email: req.user.email }).select('-password');

        return res.json({ todos: user.todos });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
})

// To Update User Todo
app.patch("/api/user/todos", check, async (req, res) => {
    try {
        // Getting user info 
        const user = await User.findOne({ email: req.user.email }).select('-password');

        // Getting user update info
        const { todo, isCompleted, id } = req.body;

        // Getting user initial todos
        let userTodos = user.todos;
        userTodos = userTodos.filter((e) => {
            if (e) {
                return e;
            }
        })

        // Updating the user todo
        const updatedNewTodo = userTodos.map((e) => {
            if (e.id === id) {
                return {
                    todo: todo,
                    id: id,
                    isCompleted: isCompleted
                }
            }
            return e
        })

        // Updating todos in database
        await User.findByIdAndUpdate(req.user.id, { todos: updatedNewTodo })

        return res.json({ message: "Todo Updated Successfully", status: "success" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
})

// To Delete User Todo
app.delete("/api/user/todos/:id", check, async (req, res) => {
    try {
        // Getting user info 
        const user = await User.findOne({ email: req.user.email }).select('-password');

        // Getting user update info
        const id = req.params.id;

        // Getting user initial todos
        let userTodos = user.todos;
        userTodos = userTodos.filter((e) => {
            if (e) {
                return e;
            }
        })

        // Finding the todo which users wants to delete
        const updatedTodo = userTodos.filter((e) => {
            if (e.id !== id) {
                //console.log(e.id);
                return e;
            }
        });

        // Deleting todo in database
        await User.findByIdAndUpdate(req.user.id, { todos: updatedTodo })

        return res.json({ message: "Todo Deleted succesfully Successfully", status: "success" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }

})

// To Start The Server
app.listen(port, () => {
    console.log(`The App Is Running on Port ${port}`);

})