const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const retell = require('../services/retell');
const User = require('../models/User');

// Time range options
const TIME_RANGES = {
  'all': { label: 'All time', days: null },
  '7d': { label: 'Last 7 days', days: 7 },
  '30d': { label: 'Last 30 days', days: 30 },
  '90d': { label: 'Last 90 days', days: 90 },
  'custom': { label: 'Custom', days: null }
};

router.get('/', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.user.id);
    const agentIds = user.assignedAgentIds || [];
    
    // Get time range from query params (default to 'all')
    let timeRange = req.query.range || 'all';
    const customStart = req.query.startDate;
    const customEnd = req.query.endDate;
    const agentFilter = req.query.agent || '';
    
    // If dates are provided, treat as custom range
    if (customStart || customEnd) {
      timeRange = 'custom';
    }
    
    // Calculate date range
    let startDate = null;
    let endDate = new Date();
    
    if (timeRange === 'custom') {
      if (customStart) {
        startDate = new Date(customStart);
      }
      if (customEnd) {
        endDate = new Date(customEnd);
        endDate.setHours(23, 59, 59, 999); // End of day
      }
    } else if (TIME_RANGES[timeRange] && TIME_RANGES[timeRange].days) {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - TIME_RANGES[timeRange].days);
    }
    // If 'all', startDate stays null (no filter)

    // Fetch calls for assigned agents
    let calls = [];
    let agents = [];
    
    if (agentIds.length > 0 || user.role === 'admin') {
      const callOptions = {
        limit: 1000
      };
      
      // Apply date filters if set
      if (startDate) {
        callOptions.afterTimestamp = startDate.getTime();
      }
      callOptions.beforeTimestamp = endDate.getTime();
      
      // Admin sees all calls, users see only their assigned agents
      if (user.role !== 'admin' && agentIds.length > 0) {
        callOptions.agentIds = agentIds;
      }
      
      // Agent filter
      if (agentFilter) {
        callOptions.agentIds = [agentFilter];
      }
      
      calls = await retell.listCalls(callOptions);
      
      // Filter by assigned agents for non-admin if agent filter not set
      if (user.role !== 'admin' && agentIds.length > 0 && !agentFilter) {
        calls = calls.filter(c => agentIds.includes(c.agent_id));
      }
      
      // Fetch all agents to map names
      const allAgents = await retell.listAgents();
      agents = user.role === 'admin' 
        ? allAgents 
        : allAgents.filter(a => agentIds.includes(a.agent_id));
    }

    // Aggregate analytics
    const analytics = retell.aggregateCallAnalytics(calls);
    
    // Create agent name map
    const agentNameMap = {};
    agents.forEach(agent => {
      agentNameMap[agent.agent_id] = agent.agent_name || agent.agent_id.substring(0, 8);
    });

    // Prepare chart data
    const sortedDates = Object.keys(analytics.callsByDate).sort();
    const chartLabels = sortedDates.map(d => {
      const date = new Date(d);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    // Call counts over time
    const callCountsData = sortedDates.map(d => analytics.callsByDate[d].count);
    
    // Stacked bar data for Call Success over time
    const successfulByDate = sortedDates.map(d => analytics.callsByDate[d].successful);
    const unsuccessfulByDate = sortedDates.map(d => analytics.callsByDate[d].unsuccessful);
    const unknownByDate = sortedDates.map(d => analytics.callsByDate[d].unknown || 0);
    
    // Stacked bar data for Sentiment over time
    const positiveByDate = sortedDates.map(d => analytics.callsByDate[d].positiveSentiment || 0);
    const negativeByDate = sortedDates.map(d => analytics.callsByDate[d].negativeSentiment || 0);
    const neutralByDate = sortedDates.map(d => analytics.callsByDate[d].neutralSentiment || 0);
    
    // Get top 5 disconnection reasons for stacked chart
    const topReasons = Object.entries(analytics.disconnectionReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason]) => reason);
    
    // Disconnection reasons by date (for stacked bar)
    const disconnectionByDate = {};
    topReasons.forEach(reason => {
      disconnectionByDate[reason] = sortedDates.map(d => {
        const dayReasons = analytics.callsByDate[d].disconnectionReasons || {};
        return dayReasons[reason] || 0;
      });
    });
    
    // Rates over time
    const pickedUpRateData = sortedDates.map(d => {
      const day = analytics.callsByDate[d];
      return day.count > 0 ? ((day.pickedUp / day.count) * 100).toFixed(1) : 0;
    });
    
    const successRateData = sortedDates.map(d => {
      const day = analytics.callsByDate[d];
      return day.count > 0 ? ((day.successful / day.count) * 100).toFixed(1) : 0;
    });
    
    const transferRateData = sortedDates.map(d => {
      const day = analytics.callsByDate[d];
      return day.count > 0 ? ((day.transferred / day.count) * 100).toFixed(1) : 0;
    });
    
    const voicemailRateData = sortedDates.map(d => {
      const day = analytics.callsByDate[d];
      return day.count > 0 ? ((day.voicemail / day.count) * 100).toFixed(1) : 0;
    });
    
    const avgDurationData = sortedDates.map(d => {
      const day = analytics.callsByDate[d];
      return day.count > 0 ? (day.totalDuration / day.count).toFixed(0) : 0;
    });
    
    const avgLatencyData = sortedDates.map(d => {
      const day = analytics.callsByDate[d];
      return day.latencyCount > 0 ? (day.totalLatency / day.latencyCount).toFixed(0) : 0;
    });

    // Agent performance data - sort by calls descending
    const chartAgentIds = Object.keys(analytics.byAgent)
      .sort((a, b) => analytics.byAgent[b].calls - analytics.byAgent[a].calls)
      .slice(0, 10);
    
    const agentLabels = chartAgentIds.map(id => agentNameMap[id] || id.substring(0, 12));
    
    const agentSuccessData = chartAgentIds.map(id => {
      const agent = analytics.byAgent[id];
      return agent.calls > 0 ? ((agent.successful / agent.calls) * 100).toFixed(1) : 0;
    });
    
    const agentTransferData = chartAgentIds.map(id => {
      const agent = analytics.byAgent[id];
      return agent.calls > 0 ? ((agent.transferred / agent.calls) * 100).toFixed(1) : 0;
    });
    
    const agentPickedUpData = chartAgentIds.map(id => {
      const agent = analytics.byAgent[id];
      return agent.calls > 0 ? ((agent.pickedUp / agent.calls) * 100).toFixed(1) : 0;
    });

    res.render('dashboard/index', {
      title: 'Dashboard',
      analytics,
      formatDuration: retell.formatDuration,
      filters: {
        range: timeRange,
        startDate: customStart || '',
        endDate: customEnd || '',
        agent: agentFilter
      },
      timeRanges: TIME_RANGES,
      agents,
      chartData: {
        labels: chartLabels,
        callCounts: callCountsData,
        // Stacked bar data
        successfulByDate,
        unsuccessfulByDate,
        unknownByDate,
        positiveByDate,
        negativeByDate,
        neutralByDate,
        disconnectionByDate,
        topReasons,
        // Rate trends
        pickedUpRate: pickedUpRateData,
        successRate: successRateData,
        transferRate: transferRateData,
        voicemailRate: voicemailRateData,
        avgDuration: avgDurationData,
        avgLatency: avgLatencyData,
        // Agent data
        agentLabels,
        agentSuccess: agentSuccessData,
        agentTransfer: agentTransferData,
        agentPickedUp: agentPickedUpData
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.render('dashboard/index', {
      title: 'Dashboard',
      analytics: retell.aggregateCallAnalytics([]),
      formatDuration: retell.formatDuration,
      filters: { range: 'all', startDate: '', endDate: '', agent: '' },
      timeRanges: TIME_RANGES,
      agents: [],
      chartData: {
        labels: [],
        callCounts: [],
        successfulByDate: [],
        unsuccessfulByDate: [],
        unknownByDate: [],
        positiveByDate: [],
        negativeByDate: [],
        neutralByDate: [],
        disconnectionByDate: {},
        topReasons: [],
        pickedUpRate: [],
        successRate: [],
        transferRate: [],
        voicemailRate: [],
        avgDuration: [],
        avgLatency: [],
        agentLabels: [],
        agentSuccess: [],
        agentTransfer: [],
        agentPickedUp: []
      },
      error: 'Failed to load analytics. Please check your Retell API key.'
    });
  }
});

module.exports = router;
