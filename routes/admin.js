const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/admin');
const retell = require('../services/retell');
const User = require('../models/User');
const AgentChangeRequest = require('../models/AgentChangeRequest');

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

// List all agent change requests (support ticket history: pending + completed)
router.get('/agent-change-requests', requireAdmin, async (req, res) => {
  try {
    const requests = await AgentChangeRequest.find({})
      .sort({ createdAt: -1 })
      .populate('userId', 'name email role')
      .populate('completedBy', 'name email')
      .lean();

    // Pending first, then newest first within each group
    requests.sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    const allAgents = await retell.listAgents();
    const agentNameMap = {};
    allAgents.forEach(a => {
      agentNameMap[a.agent_id] = a.agent_name || a.agent_id.substring(0, 12);
    });

    const mappedRequests = requests.map(r => ({
      ...r,
      user: r.userId,
      completedByUser: r.completedBy
    }));

    res.render('admin/agentChangeRequests/index', {
      title: 'Agent Change Requests',
      requests: mappedRequests,
      agentNameMap,
      error: null
    });
  } catch (error) {
    console.error('Agent change requests error:', error);
    res.render('admin/agentChangeRequests/index', {
      title: 'Agent Change Requests',
      requests: [],
      agentNameMap: {},
      error: 'Failed to load requests.'
    });
  }
});

// Complete a pending request (admin action)
router.post('/agent-change-requests/:requestId/complete', requireAdmin, async (req, res) => {
  try {
    const adminId = req.session.user.id;

    const request = await AgentChangeRequest.findById(req.params.requestId);
    if (!request) {
      return res.status(404).render('error', {
        title: 'Request Not Found',
        message: 'The agent change request does not exist.'
      });
    }

    if (request.status !== 'pending') {
      return res.redirect('/admin/agent-change-requests');
    }

    // Update the target user's assigned agents.
    await User.findByIdAndUpdate(request.userId, {
      $set: {
        assignedAgentIds: [request.requestedAgentId]
      }
    });

    // Mark request as completed.
    request.status = 'completed';
    request.completedAt = new Date();
    request.completedBy = adminId;
    await request.save();

    return res.redirect('/admin/agent-change-requests');
  } catch (error) {
    console.error('Complete agent change request error:', error);
    return res.redirect('/admin/agent-change-requests');
  }
});

module.exports = router;

