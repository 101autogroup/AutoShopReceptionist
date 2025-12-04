const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/admin');
const retell = require('../services/retell');
const User = require('../models/User');

// List all users
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    
    // Get all agents for count
    let agents = [];
    try {
      agents = await retell.listAgents();
    } catch (e) {
      console.error('Failed to fetch agents:', e);
    }
    
    // Create agent name map
    const agentNameMap = {};
    agents.forEach(a => {
      agentNameMap[a.agent_id] = a.agent_name || a.agent_id.substring(0, 12);
    });
    
    const enrichedUsers = users.map(u => ({
      ...u.toObject(),
      agentCount: u.assignedAgentIds?.length || 0,
      agentNames: (u.assignedAgentIds || [])
        .slice(0, 3)
        .map(id => agentNameMap[id] || id.substring(0, 8))
    }));
    
    res.render('admin/users', {
      title: 'User Management',
      users: enrichedUsers
    });
  } catch (error) {
    console.error('Admin users error:', error);
    res.render('admin/users', {
      title: 'User Management',
      users: [],
      error: 'Failed to load users.'
    });
  }
});

// Assign agents to user
router.get('/users/:userId/assign', requireAdmin, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) {
      return res.status(404).render('error', {
        title: 'User Not Found',
        message: 'The user you are looking for does not exist.'
      });
    }
    
    const agents = await retell.listAgents();
    const assignedIds = targetUser.assignedAgentIds || [];
    
    const agentsWithStatus = agents.map(agent => ({
      ...agent,
      isAssigned: assignedIds.includes(agent.agent_id)
    }));
    
    res.render('admin/assign', {
      title: 'Assign Agents',
      targetUser: targetUser.toObject(),
      agents: agentsWithStatus
    });
  } catch (error) {
    console.error('Assign agents error:', error);
    res.render('error', {
      title: 'Error',
      message: 'Failed to load agent assignment page.'
    });
  }
});

// Save agent assignments
router.post('/users/:userId/assign', requireAdmin, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) {
      return res.status(404).render('error', {
        title: 'User Not Found',
        message: 'The user you are looking for does not exist.'
      });
    }
    
    // Get selected agent IDs from form
    let agentIds = req.body.agents || [];
    if (!Array.isArray(agentIds)) {
      agentIds = [agentIds];
    }
    
    // Update user
    targetUser.assignedAgentIds = agentIds;
    await targetUser.save();
    
    res.redirect('/admin/users');
  } catch (error) {
    console.error('Save assignment error:', error);
    res.render('error', {
      title: 'Error',
      message: 'Failed to save agent assignments.'
    });
  }
});

// Toggle user role
router.post('/users/:userId/toggle-role', requireAdmin, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Don't allow demoting yourself
    if (targetUser._id.toString() === req.session.user.id) {
      return res.redirect('/admin/users');
    }
    
    targetUser.role = targetUser.role === 'admin' ? 'user' : 'admin';
    await targetUser.save();
    
    res.redirect('/admin/users');
  } catch (error) {
    console.error('Toggle role error:', error);
    res.redirect('/admin/users');
  }
});

// Delete user
router.post('/users/:userId/delete', requireAdmin, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) {
      return res.redirect('/admin/users');
    }
    
    // Don't allow deleting yourself
    if (targetUser._id.toString() === req.session.user.id) {
      return res.redirect('/admin/users');
    }
    
    await User.findByIdAndDelete(req.params.userId);
    
    res.redirect('/admin/users');
  } catch (error) {
    console.error('Delete user error:', error);
    res.redirect('/admin/users');
  }
});

module.exports = router;

