const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const User = require('../models/User');
const AgentChangeRequest = require('../models/AgentChangeRequest');
const retell = require('../services/retell');

function escapeHtmlText(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function agentsForUser(assignedAgentIds, allAgents) {
  const set = new Set(assignedAgentIds || []);
  return (allAgents || []).filter(a => set.has(a.agent_id));
}

// User requests a change only for agents currently assigned to them (support-ticket style).
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.user.id);
    const assignedAgentIds = user.assignedAgentIds || [];
    const success = req.query.success;
    const updated = req.query.updated;
    const error = req.query.error;

    const allAgents = await retell.listAgents();
    const agents = agentsForUser(assignedAgentIds, allAgents);

    const pendingRequest = await AgentChangeRequest.findOne({
      userId: user._id,
      status: 'pending'
    }).sort({ createdAt: -1 });

    const requests = await AgentChangeRequest.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(50);

    const agentNameMap = {};
    allAgents.forEach(a => {
      agentNameMap[a.agent_id] = a.agent_name || a.agent_id.substring(0, 12);
    });

    res.render('agentChangeRequests/index', {
      title: 'Request Agent Change',
      agents,
      assignedAgentIds,
      pendingRequest,
      pendingReasonEscaped: pendingRequest ? escapeHtmlText(pendingRequest.reason) : '',
      requests,
      agentNameMap,
      success: success ? true : false,
      updated: updated ? true : false,
      error: error || null
    });
  } catch (error) {
    console.error('Agent change request page error:', error);
    res.render('agentChangeRequests/index', {
      title: 'Request Agent Change',
      agents: [],
      assignedAgentIds: [],
      pendingRequest: null,
      pendingReasonEscaped: '',
      requests: [],
      agentNameMap: {},
      success: false,
      updated: false,
      error: 'Failed to load agent change request form.'
    });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.user.id);
    const assignedAgentIds = user.assignedAgentIds || [];

    const requestedAgentId = (req.body.requestedAgentId || '').trim();
    const reason = (req.body.reason || '').trim();

    if (!requestedAgentId) {
      return res.redirect('/agent-change-requests?error=' + encodeURIComponent('Please select an agent.'));
    }

    if (!assignedAgentIds.includes(requestedAgentId)) {
      return res.redirect('/agent-change-requests?error=' + encodeURIComponent('You can only request changes for agents assigned to your account.'));
    }

    const existingPending = await AgentChangeRequest.findOne({
      userId: user._id,
      status: 'pending'
    }).sort({ createdAt: -1 });

    if (existingPending) {
      existingPending.requestedAgentId = requestedAgentId;
      existingPending.reason = reason;
      await existingPending.save();
      return res.redirect('/agent-change-requests?updated=1');
    }

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

