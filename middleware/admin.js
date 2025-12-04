// Admin middleware - requires user to be admin
const requireAdmin = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  
  if (req.session.user.role !== 'admin') {
    return res.status(403).render('error', {
      title: 'Access Denied',
      message: 'You do not have permission to access this page.'
    });
  }
  
  next();
};

module.exports = { requireAdmin };

