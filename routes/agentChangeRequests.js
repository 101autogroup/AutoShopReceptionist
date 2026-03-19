const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const User = require('../models/User');
const AgentChangeRequest = require('../models/AgentChangeRequest');
const retell = require('../services/retell');

// User requests changing the agent(s) they are assigned to.
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.user.id);
    const assignedAgentIds = user.assignedAgentIds || [];
    const success = req.query.success;
    const error = req.query.error;

    // Use published agents for user selection to avoid sending requests for drafts.
    const allAgents = await retell.listAgents();
    const agents = allAgents.filter(a => a.is_published);

    const requests = await AgentChangeRequest.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(10);

    res.render('agentChangeRequests/index', {
      title: 'Request Agent Change',
      agents,
      assignedAgentIds,
      requests,
      success: success ? true : false,
      error: error || null
    });
  } catch (error) {
    console.error('Agent change request page error:', error);
    res.render('agentChangeRequests/index', {
      title: 'Request Agent Change',
      agents: [],
      assignedAgentIds: [],
      requests: [],
      success: false,
      error: 'Failed to load agent change request form.'
    });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.user.id);

    const requestedAgentId = (req.body.requestedAgentId || '').trim();
    const reason = (req.body.reason || '').trim();

    if (!requestedAgentId) {
      return res.redirect('/agent-change-requests?error=' + encodeURIComponent('Please select an agent.'));
    }

    // Create a pending request. Admin will complete it and update assignedAgentIds.
    await AgentChangeRequest.create({
      userId: user._id,
      requestedAgentId,
      reason,
      status: 'pending'
    });

    return res.redirect('/agent-change-requests?success=1');
  } catch (error) {
    console.error('Create agent change request error:', error);
    return res.redirect('/agent-change-requests?error=' + encodeURIComponent('Failed to submit request.'));
  }
});

module.exports = router;

