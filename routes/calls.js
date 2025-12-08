const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const retell = require('../services/retell');
const User = require('../models/User');

router.get('/', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.user.id);
    const agentIds = user.assignedAgentIds || [];
    
    // Get filter params
    const { agent, status, startDate, endDate, page = 1 } = req.query;
    const limit = 25;
    
    // Build filter options
    const filterOptions = {
      limit: 1000 // Fetch more to filter and paginate locally
    };
    
    // Date filters
    if (startDate) {
      filterOptions.afterTimestamp = new Date(startDate).getTime();
    } else {
      // Default to last 30 days
      const defaultStart = new Date();
      defaultStart.setDate(defaultStart.getDate() - 30);
      filterOptions.afterTimestamp = defaultStart.getTime();
    }
    
    if (endDate) {
      filterOptions.beforeTimestamp = new Date(endDate).getTime() + (24 * 60 * 60 * 1000); // Include end date
    }
    
    // Agent filter - respect user's assigned agents
    if (user.role !== 'admin') {
      if (agentIds.length === 0) {
        // No assigned agents, show empty
        return res.render('calls/index', {
          title: 'Calls',
          calls: [],
          agents: [],
          pagination: { page: 1, totalPages: 1, total: 0 },
          filters: { agent, status, startDate, endDate },
          formatDuration: retell.formatDuration
        });
      }
      filterOptions.agentIds = agent ? [agent] : agentIds;
    } else if (agent) {
      filterOptions.agentIds = [agent];
    }
    
    // Fetch calls
    let calls = await retell.listCalls(filterOptions);
    
    // Filter by assigned agents for non-admin
    if (user.role !== 'admin' && agentIds.length > 0) {
      calls = calls.filter(c => agentIds.includes(c.agent_id));
    }
    
    // Filter by status
    if (status) {
      calls = calls.filter(c => {
        if (status === 'successful') return c.call_successful === true;
        if (status === 'unsuccessful') return c.call_successful === false;
        if (status === 'unknown') return c.call_successful === null || c.call_successful === undefined;
        return true;
      });
    }
    
    // Sort by start time (newest first)
    calls.sort((a, b) => (b.start_timestamp || 0) - (a.start_timestamp || 0));
    
    // Pagination
    const total = calls.length;
    const totalPages = Math.ceil(total / limit);
    const currentPage = Math.min(Math.max(1, parseInt(page)), totalPages || 1);
    const startIdx = (currentPage - 1) * limit;
    const paginatedCalls = calls.slice(startIdx, startIdx + limit);
    
    // Fetch agents for filter dropdown
    const allAgents = await retell.listAgents();
    const agents = user.role === 'admin' 
      ? allAgents 
      : allAgents.filter(a => agentIds.includes(a.agent_id));
    
    // Create agent name map
    const agentNameMap = {};
    allAgents.forEach(a => {
      agentNameMap[a.agent_id] = a.agent_name || a.agent_id.substring(0, 12);
    });
    
    // Enrich calls with agent names
    const enrichedCalls = paginatedCalls.map(call => ({
      ...call,
      agentName: agentNameMap[call.agent_id] || call.agent_id?.substring(0, 12) || 'Unknown',
      duration: call.end_timestamp && call.start_timestamp 
        ? (call.end_timestamp - call.start_timestamp) / 1000 
        : 0,
      formattedDate: call.start_timestamp 
        ? new Date(call.start_timestamp).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Los_Angeles'
          })
        : 'N/A'
    }));
    
    res.render('calls/index', {
      title: 'Calls',
      calls: enrichedCalls,
      agents,
      pagination: {
        page: currentPage,
        totalPages,
        total
      },
      filters: { agent, status, startDate, endDate },
      formatDuration: retell.formatDuration
    });
  } catch (error) {
    console.error('Calls error:', error);
    res.render('calls/index', {
      title: 'Calls',
      calls: [],
      agents: [],
      pagination: { page: 1, totalPages: 1, total: 0 },
      filters: {},
      formatDuration: retell.formatDuration,
      error: 'Failed to load calls. Please check your Retell API key.'
    });
  }
});

// Get single call details
router.get('/:callId', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.user.id);
    const call = await retell.getCall(req.params.callId);
    
    // Check if user has access to this call's agent
    if (user.role !== 'admin') {
      const agentIds = user.assignedAgentIds || [];
      if (!agentIds.includes(call.agent_id)) {
        return res.status(403).render('error', {
          title: 'Access Denied',
          message: 'You do not have access to this call.'
        });
      }
    }
    
    // Get agent info
    let agentName = call.agent_id?.substring(0, 12) || 'Unknown';
    try {
      const agent = await retell.getAgent(call.agent_id);
      agentName = agent.agent_name || agentName;
    } catch (e) {
      // Agent might be deleted
    }
    
    const enrichedCall = {
      ...call,
      agentName,
      duration: call.end_timestamp && call.start_timestamp 
        ? (call.end_timestamp - call.start_timestamp) / 1000 
        : 0,
      formattedStartDate: call.start_timestamp 
        ? new Date(call.start_timestamp).toLocaleString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: 'America/Los_Angeles'
          })
        : 'N/A',
      formattedEndDate: call.end_timestamp 
        ? new Date(call.end_timestamp).toLocaleString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: 'America/Los_Angeles'
          })
        : 'N/A'
    };
    
    res.render('calls/detail', {
      title: 'Call Details',
      call: enrichedCall,
      formatDuration: retell.formatDuration
    });
  } catch (error) {
    console.error('Call detail error:', error);
    res.status(404).render('error', {
      title: 'Call Not Found',
      message: 'The call you are looking for does not exist.'
    });
  }
});

module.exports = router;

