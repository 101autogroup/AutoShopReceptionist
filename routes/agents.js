const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const retell = require('../services/retell');
const User = require('../models/User');

router.get('/', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.user.id);
    const agentIds = user.assignedAgentIds || [];
    
    // Fetch all agents
    const allAgents = await retell.listAgents();
    
    // Filter to assigned agents for non-admins
    const agents = user.role === 'admin' 
      ? allAgents 
      : allAgents.filter(a => agentIds.includes(a.agent_id));
    
    res.render('agents/index', {
      title: 'Agents',
      agents
    });
  } catch (error) {
    console.error('Agents error:', error);
    res.render('agents/index', {
      title: 'Agents',
      agents: [],
      error: 'Failed to load agents. Please check your Retell API key.'
    });
  }
});

// View single agent
router.get('/:agentId', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.user.id);
    
    // Check access
    if (user.role !== 'admin') {
      const agentIds = user.assignedAgentIds || [];
      if (!agentIds.includes(req.params.agentId)) {
        return res.status(403).render('error', {
          title: 'Access Denied',
          message: 'You do not have access to this agent.'
        });
      }
    }
    
    const agent = await retell.getAgent(req.params.agentId);
    
    res.render('agents/detail', {
      title: agent.agent_name || 'Agent Details',
      agent
    });
  } catch (error) {
    console.error('Agent detail error:', error);
    res.status(404).render('error', {
      title: 'Agent Not Found',
      message: 'The agent you are looking for does not exist.'
    });
  }
});

module.exports = router;

