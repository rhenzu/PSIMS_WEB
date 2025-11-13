require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const Scholar = require('./models/Scholar');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const ActivityProgram = require('./models/ActivityProgram');
const ejs = require('ejs');
const path = require('path');
const multer = require('multer'); // Added for file uploads

const app = express();
app.set('views', path.join(__dirname, 'views'));
// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// Multer configuration for file uploads (memory storage for base64 conversion)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.session.scholarId) {
        return next();
    }
    res.redirect('/login');
};

// --- Email Transport Setup ---
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || "587"), // Default to 587
    secure: process.env.EMAIL_SECURE === 'true', // Convert string 'true' to boolean
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    // Optional: for localhost testing with services like Ethereal or Mailtrap
    // tls: { rejectUnauthorized: false } // Use only for testing/development!
});

transporter.verify()
    .then(() => console.log('Nodemailer transport verified successfully.'))
    .catch(err => console.error('Nodemailer transport verification error:', err));

// Helper function to get the current school year
const getCurrentSchoolYear = () => {
    const year = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    return `${year}-${year + 1}`;
};

// Helper function to render with layout
const renderWithLayout = async (res, childTemplate, childData, layoutData) => {
    const childContent = await ejs.renderFile(
        `${__dirname}/views/dashboard/${childTemplate}.ejs`,
        childData
    );
    res.render('layout', {
        ...layoutData,
        bodyContent: childContent
    });
};

// Routes
app.get('/', (req, res) => {
    res.redirect('/login');
});

// Initialization Page
app.get('/initialize', (req, res) => {
    res.render('initialize', { error: null });
});

app.post('/initialize', async (req, res) => {
    const { initializationCode, username, password, confirmPassword } = req.body;

    console.log('Initialize attempt:', { initializationCode, username });

    if (password !== confirmPassword) {
        return res.render('initialize', { error: 'Passwords do not match' });
    }

    try {
        // Case-insensitive search for InitializationCode
        const scholar = await Scholar.findOne({ InitializationCode: initializationCode });
        console.log('Query result:', scholar ? scholar.toObject() : null);

        if (!scholar) {
            return res.render('initialize', { error: 'Invalid Initialization Code' });
        }
        if (scholar.Password) {
            return res.render('initialize', { error: 'Account already initialized. Please log in.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Update scholar with new credentials
        await Scholar.findByIdAndUpdate(
            scholar._id,
            {
                Username: username,
                Password: hashedPassword,
                InitializationCode: Math.random().toString(36).substring(2, 15) // Randomize code after use
            },
            { runValidators: false } // Skip validation for unchanged fields
        );

        req.session.scholarId = scholar._id;
        res.redirect('/dashboard/profile');
    } catch (err) {
        console.error('Error during initialization:', err);
        res.render('initialize', { error: 'An error occurred. Please try again.' });
    }
});

// Login Page
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

// Activities Page (GET and POST)
app.get('/dashboard/activities', isAuthenticated, async (req, res) => {
    try {
        // Fetch the scholar data (needed for layout)
        const scholar = await Scholar.findById(req.session.scholarId);
        if (!scholar) {
            return res.redirect('/login');
        }
        // Fetch only the current scholar's activity programs, sorted by most recent
        const programs = await ActivityProgram.find({ scholar: req.session.scholarId })
                                             .sort({ createdAt: -1 })
                                             .populate('scholar', 'FirstName LastName') // Populate name for display
                                             .lean();
        // Render the activities page using the layout helper
        await renderWithLayout(res, 'activities',
            {
                scholar: scholar,
                programs: programs
            },
            {
                page: 'activities',
                pageTitle: 'My Activities & Programs',
                pageCss: 'activities.css'
            });
    } catch (err) {
        console.error('Error fetching activities:', err);
        res.redirect('/dashboard/profile');
    }
});

app.post('/dashboard/activities', isAuthenticated, upload.single('image'), async (req, res) => {
    try {
        const { title, description, startDate, endDate } = req.body;
        const scholar = await Scholar.findById(req.session.scholarId);
        if (!scholar) {
            return res.redirect('/login');
        }

        // Validate required fields
        if (!title || !startDate || !endDate) {
            return res.redirect('/dashboard/activities'); // Could add flash message for error
        }

        // Prepare image data if uploaded
        let imageBase64 = null;
        let imageMimeType = null;
        if (req.file) {
            imageBase64 = req.file.buffer.toString('base64');
            imageMimeType = req.file.mimetype;
        }

        // Create new activity program
        const newProgram = new ActivityProgram({
            title: title.trim(),
            description: description ? description.trim() : '',
            imageBase64,
            imageMimeType,
            startDate: new Date(startDate),
            endDate: new Date(endDate)
        });

        await newProgram.save();

        // Redirect back to activities page
        res.redirect('/dashboard/activities');
    } catch (err) {
        console.error('Error creating activity program:', err);
        // For now, redirect back (could pass error via session flash in production)
        res.redirect('/dashboard/activities');
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    console.log('Login attempt:', { Username: username });

    try {
        const scholar = await Scholar.findOne({ Username: username });
        console.log('Query result:', scholar);

        if (!scholar || !scholar.Password) {
            return res.render('login', { error: 'Account not found or not initialized' });
        }

        const isMatch = await bcrypt.compare(password, scholar.Password);
        if (!isMatch) {
            return res.render('login', { error: 'Invalid password' });
        }

        req.session.scholarId = scholar._id;
        res.redirect('/dashboard/profile');
    } catch (err) {
        console.error('Error during login:', err);
        res.render('login', { error: 'An error occurred. Please try again.' });
    }
});

// Dashboard Routes
app.get('/dashboard/profile', isAuthenticated, async (req, res) => {
    try {
        const scholar = await Scholar.findById(req.session.scholarId);
        await renderWithLayout(res, 'profile', { scholar, currentSchoolYear: getCurrentSchoolYear() }, {
            page: 'profile',
            pageTitle: 'Profile',
            pageCss: 'profile.css'
        });
    } catch (err) {
        console.error(err);
        res.redirect('/login');
    }
});

app.get('/dashboard/payroll', isAuthenticated, async (req, res) => {
    try {
        const scholar = await Scholar.findById(req.session.scholarId);
        await renderWithLayout(res, 'payroll', { scholar, currentSchoolYear: getCurrentSchoolYear() }, {
            page: 'payroll',
            pageTitle: 'Payroll',
            pageCss: 'payroll.css'
        });
    } catch (err) {
        console.error(err);
        res.redirect('/login');
    }
});

app.get('/dashboard/settings', isAuthenticated, async (req, res) => {
    try {
        const scholar = await Scholar.findById(req.session.scholarId);
        await renderWithLayout(res, 'settings', { scholar, currentSchoolYear: getCurrentSchoolYear() }, {
            page: 'settings',
            pageTitle: 'Settings',
            pageCss: 'settings.css'
        });
    } catch (err) {
        console.error(err);
        res.redirect('/login');
    }
});

app.post('/dashboard/update-contact', isAuthenticated, async (req, res) => {
    const { contactNumber } = req.body;
    const scholarId = req.session.scholarId;
    let message = null;
    let error = null;

    // Basic validation (you might want more specific phone number validation)
    if (!contactNumber || contactNumber.trim().length < 5) { // Example: very basic length check
         error = 'Please enter a valid contact number.';
    } else {
        try {
            await Scholar.findByIdAndUpdate(
                scholarId,
                { ContactNumber: contactNumber.trim() },
                // Use runValidators if your Scholar schema has validators for ContactNumber
                // Use { new: true } if you needed the updated scholar object back
                { runValidators: false } // Assuming simple update for now
            );
            message = 'Contact number updated successfully!';
        } catch (err) {
            console.error('Error updating contact number:', err);
            error = 'Failed to update contact number. Please try again.';
        }
    }

    // Re-render the settings page with feedback
    try {
        const scholar = await Scholar.findById(scholarId).lean(); // Fetch updated data
        if (!scholar) return res.redirect('/login');

        await renderWithLayout(res, 'settings',
            { scholar, currentSchoolYear: getCurrentSchoolYear(), message, error }, // Pass message/error
            { page: 'settings', pageTitle: 'Settings', pageCss: 'settings.css' }
        );
    } catch (renderErr) {
         console.error('Error re-rendering settings page:', renderErr);
         res.redirect('/dashboard/profile'); // Fallback redirect
    }
});

// POST route to change password
app.post('/dashboard/change-password', isAuthenticated, async (req, res) => {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;
    const scholarId = req.session.scholarId;
    let message = null;
    let error = null;

    // Validation
    if (!currentPassword || !newPassword || !confirmNewPassword) {
        error = 'Please fill in all password fields.';
    } else if (newPassword.length < 8) {
         error = 'New password must be at least 8 characters long.';
    } else if (newPassword !== confirmNewPassword) {
        error = 'New passwords do not match.';
    }

    if (!error) { // Proceed if basic validation passes
        try {
            // Fetch the scholar *without* .lean() to access virtuals/methods if needed, and the password
            const scholar = await Scholar.findById(scholarId);
            if (!scholar) {
                 // Should not happen if authenticated, but check anyway
                return res.redirect('/login');
            }

            // Verify current password
            const isMatch = await bcrypt.compare(currentPassword, scholar.Password);
            if (!isMatch) {
                error = 'Incorrect current password.';
            } else {
                // Hash the new password
                const newHashedPassword = await bcrypt.hash(newPassword, 10);

                // Update the scholar's password
                await Scholar.findByIdAndUpdate(
                    scholarId,
                    { Password: newHashedPassword },
                     // Use runValidators: false because we are only changing the password
                     // and don't want other schema validations (like required fields
                     // that might be missing after initialization) to interfere.
                    { runValidators: false }
                );
                message = 'Password changed successfully!';
            }
        } catch (err) {
            console.error('Error changing password:', err);
            error = 'An error occurred while changing the password. Please try again.';
        }
    }

     // Re-render the settings page with feedback
    try {
        // Fetch fresh scholar data (even if password change failed, to show current contact info)
        const scholarData = await Scholar.findById(scholarId).lean();
        if (!scholarData) return res.redirect('/login');

        await renderWithLayout(res, 'settings',
            { scholar: scholarData, currentSchoolYear: getCurrentSchoolYear(), message, error }, // Pass message/error
            { page: 'settings', pageTitle: 'Settings', pageCss: 'settings.css' }
        );
    } catch (renderErr) {
         console.error('Error re-rendering settings page:', renderErr);
         res.redirect('/dashboard/profile'); // Fallback redirect
    }
});


app.get('/dashboard/notifications', isAuthenticated, async (req, res) => {
    try {
        const scholar = await Scholar.findById(req.session.scholarId);
        await renderWithLayout(res, 'notifications', { scholar, currentSchoolYear: getCurrentSchoolYear() }, {
            page: 'notifications',
            pageTitle: 'Notifications',
            pageCss: 'notifications.css'
        });
    } catch (err) {
        console.error(err);
        res.redirect('/login');
    }
});

// Request Payroll Route
app.post('/dashboard/request-payroll', isAuthenticated, async (req, res) => {
    try {
        const scholar = await Scholar.findById(req.session.scholarId);
        const currentSchoolYear = getCurrentSchoolYear();

        // Check if a staged payroll exists for the current school year
        if (!scholar.StagedPayroll || scholar.StagedPayroll.SchoolYear !== currentSchoolYear) {
            return res.json({ success: false, message: 'Payroll is still not available.' });
        }

        // Check if a payroll request has already been made since the last renewal
        if (scholar.LastPayrollRequestDate && scholar.RenewalDate) {
            if (scholar.LastPayrollRequestDate > scholar.RenewalDate) {
                return res.json({ success: false, message: 'Payroll already requested for this renewal period.' });
            }
        }

        // If a staged payroll exists and no request has been made in this renewal period, allow the request
        if (scholar.PayrollRequestStatus === 'Pending') {
            return res.json({ success: false, message: 'Payroll request already pending.' });
        }

        // Update only the fields we care about, bypassing full validation
        await Scholar.findByIdAndUpdate(
            req.session.scholarId,
            {
                PayrollRequestStatus: 'Pending',
                LastPayrollRequestDate: new Date()
            },
            { runValidators: false } // Skip validation for unchanged fields like Password
        );

        res.json({ success: true, message: 'Payroll request submitted successfully.' });
    } catch (err) {
        console.error('Error during payroll request:', err);
        res.json({ success: false, message: 'An error occurred. Please try again.' });
    }
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});


// GET route for the forgot password form
app.get('/forgot-password', (req, res) => {
    res.render('forgot-password', { error: null, message: null });
});

// POST route to handle the forgot password request
app.post('/forgot-password', async (req, res) => {
    const email = req.body.email;
    let message = 'If an account with that email exists, a password reset link has been sent.'; // Generic message
    let error = null;

    try {
        const scholar = await Scholar.findOne({ Email: email });

        if (scholar) {
            // Generate token
            const token = crypto.randomBytes(20).toString('hex');

            // Set token and expiration on scholar document
            scholar.resetPasswordToken = token;
            scholar.resetPasswordExpires = Date.now() + 3600000; // 1 hour from now

            await scholar.save({ validateBeforeSave: false }); // Save the updated scholar

            // Send email
            const resetURL = `http://${req.headers.host}/reset-password/${token}`;
            const mailOptions = {
                to: scholar.Email,
                from: `"PSIMS Admin" <${process.env.EMAIL_USER}>`, // Sender address with name
                subject: 'PSIMS Scholar Password Reset Request',
                text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n` +
                      `Please click on the following link, or paste this into your browser to complete the process:\n\n` +
                      `${resetURL}\n\n` +
                      `This link will expire in one hour.\n\n` +
                      `If you did not request this, please ignore this email and your password will remain unchanged.\n`
            };

            try {
                 await transporter.sendMail(mailOptions);
                 console.log('Password reset email sent to:', scholar.Email);
            } catch (mailErr) {
                 console.error("Error sending password reset email:", mailErr);
                 // Don't expose detailed mail errors to user, but signal failure internally
                 error = 'Failed to send reset email. Please try again later or contact support.';
                 // Reset token fields if email failed? Maybe, depends on policy.
                 // scholar.resetPasswordToken = undefined;
                 // scholar.resetPasswordExpires = undefined;
                 // await scholar.save({ validateBeforeSave: false });
            }
        } else {
             console.log('Forgot password attempt for non-existent email:', email);
             // Still show generic message to prevent email enumeration
        }
    } catch (err) {
        console.error('Error during forgot password process:', err);
        error = 'An error occurred. Please try again.';
    }

    // Render the page again, showing the generic message or an error
    res.render('forgot-password', { error, message });
});

// GET route for the password reset form (link from email)
app.get('/reset-password/:token', async (req, res) => {
    const token = req.params.token;
    try {
        const scholar = await Scholar.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() } // Check token and expiry
        });

        if (!scholar) {
             // Use flash messages here ideally, or render a specific error page
            return res.render('forgot-password', { error: 'Password reset token is invalid or has expired.', message: null });
        }

        // Token is valid, render the reset form
        res.render('reset-password', { token: token, error: null, message: null });

    } catch (err) {
        console.error('Error finding token:', err);
        res.render('forgot-password', { error: 'An error occurred.', message: null });
    }
});

// POST route to handle the actual password reset
app.post('/reset-password/:token', async (req, res) => {
    const token = req.params.token;
    const { password, confirmPassword } = req.body;
    let error = null;
    let message = null;

    // Basic validation
    if (!password || !confirmPassword) {
        error = 'Please enter and confirm your new password.';
    } else if (password.length < 8) {
        error = 'Password must be at least 8 characters long.';
    } else if (password !== confirmPassword) {
        error = 'Passwords do not match.';
    }

    if (error) {
        // Re-render the reset form with the error
        return res.render('reset-password', { token: token, error: error, message: null });
    }

    try {
        const scholar = await Scholar.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!scholar) {
            return res.render('forgot-password', { error: 'Password reset token is invalid or has expired.', message: null });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Update scholar
        scholar.Password = hashedPassword;
        scholar.resetPasswordToken = undefined; // Clear the token
        scholar.resetPasswordExpires = undefined; // Clear the expiry

        await scholar.save({ validateBeforeSave: false }); // Save changes

        // Optional: Log the user in automatically after reset
        // req.session.scholarId = scholar._id;

        // Redirect to login with success message (using flash ideally)
        // For now, render login page with a message (less ideal)
         console.log('Password reset successfully for user:', scholar.Username);
         res.render('login', { error: null, message: 'Your password has been successfully reset. Please log in.' });

    } catch (err) {
        console.error('Error during password reset:', err);
        res.render('reset-password', { token: token, error: 'An error occurred while resetting your password.', message: null });
    }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
