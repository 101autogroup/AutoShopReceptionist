// Authentication middleware - requires user to be logged in
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
};

// Guest middleware - only for non-authenticated users
const requireGuest = (req, res, next) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  next();
};

module.exports = { requireAuth, requireGuest };

