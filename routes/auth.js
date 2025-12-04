const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { requireGuest } = require('../middleware/auth');

// GET /login
router.get('/login', requireGuest, (req, res) => {
  res.render('auth/login', {
    title: 'Login',
    error: null
  });
});

// POST /login
router.post('/login', requireGuest, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.render('auth/login', {
        title: 'Login',
        error: 'Please provide email and password'
      });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.render('auth/login', {
        title: 'Login',
        error: 'Invalid email or password'
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.render('auth/login', {
        title: 'Login',
        error: 'Invalid email or password'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Create session
    req.session.user = user.toSafeObject();
    
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Login error:', error);
    res.render('auth/login', {
      title: 'Login',
      error: 'An error occurred. Please try again.'
    });
  }
});

// GET /signup
router.get('/signup', requireGuest, (req, res) => {
  res.render('auth/signup', {
    title: 'Sign Up',
    error: null
  });
});

// POST /signup
router.post('/signup', requireGuest, async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    // Validate input
    if (!name || !email || !password || !confirmPassword) {
      return res.render('auth/signup', {
        title: 'Sign Up',
        error: 'All fields are required'
      });
    }

    if (password !== confirmPassword) {
      return res.render('auth/signup', {
        title: 'Sign Up',
        error: 'Passwords do not match'
      });
    }

    if (password.length < 8) {
      return res.render('auth/signup', {
        title: 'Sign Up',
        error: 'Password must be at least 8 characters'
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.render('auth/signup', {
        title: 'Sign Up',
        error: 'Email already registered'
      });
    }

    // Create user (always as regular user - admins created via script)
    const user = new User({
      name,
      email: email.toLowerCase(),
      passwordHash: password, // Will be hashed by pre-save hook
      role: 'user'
    });

    await user.save();

    // Create session
    req.session.user = user.toSafeObject();
    
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Signup error:', error);
    res.render('auth/signup', {
      title: 'Sign Up',
      error: 'An error occurred. Please try again.'
    });
  }
});

// GET /logout
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/login');
  });
});

module.exports = router;

