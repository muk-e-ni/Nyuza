import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import { irrigationAPI, sensorAPI, recommendationAPI, systemAPI } from '../../services/api';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  TrendingFlat as TrendingFlatIcon,
  WaterDrop as WaterDropIcon,
  SmartToy as SmartToyIcon,
  CheckCircle as CheckCircleIcon,
  HourglassEmpty as HourglassEmptyIcon,
  PictureAsPdf as PictureAsPdfIcon,
  BarChart as BarChartIcon,
  Print as PrintIcon,
} from '@mui/icons-material';

const ReportsSection = () => {
  const [reportData, setReportData] = useState({});
  const [timeRange, setTimeRange] = useState('7d'); // 7d, 30d, 90d
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchReportData();
  }, [timeRange]);

  const getDaysFromRange = () => {
    switch (timeRange) {
      case '7d': return 7;
      case '30d': return 30;
      case '90d': return 90;
      default: return 30;
    }
  };

const fetchReportData = async () => {
  setLoading(true);
  setError(null);
  try {
    const days = getDaysFromRange();
    console.log('Fetching report data for', days, 'days');
    
    // Fetch real data from APIs with proper error handling
    const [
      irrigationHistoryResponse,
      irrigationAnalyticsResponse,
      sensorHistoryResponse,
      recommendationsResponse,
      zonesResponse
    ] = await Promise.all([
      irrigationAPI.getHistory(days).catch(err => {
        console.error('Error fetching irrigation history:', err);
        return { data: { data: [] } };
      }),
      irrigationAPI.getAnalytics(days).catch(err => {
        console.error('Error fetching irrigation analytics:', err);
        return { data: { data: {} } };
      }),
      sensorAPI.getHistory(days).catch(err => {
        console.error('Error fetching sensor history:', err);
        return { data: { data: [] } };
      }),
      recommendationAPI.getRecommendations('all').catch(err => {
        console.error('Error fetching basic recommendations:', err);
        return { data: [] };
      }),
      systemAPI.getZones().catch(err => {
        console.error('Error fetching zones:', err);
        return { data: { zones: [] } };
      })
    ]);

    // Try to fetch AI recommendations separately with better error handling
    let personalizedReport = {};
    let comprehensiveReport = {};
    
    try {
      const personalizedResponse = await recommendationAPI.getPersonalizedReport(days);
      personalizedReport = personalizedResponse?.data || {};
      console.log('Personalized report response:', personalizedReport);
    } catch (err) {
      console.warn('Personalized report not available:', err.message);
      personalizedReport = { success: false, error: err.message };
    }
    
    try {
      const comprehensiveResponse = await recommendationAPI.getComprehensiveReport(days);
      comprehensiveReport = comprehensiveResponse?.data || {};
      console.log('Comprehensive report response:', comprehensiveReport);
    } catch (err) {
      console.warn('Comprehensive report not available:', err.message);
      comprehensiveReport = { success: false, error: err.message };
    }

    console.log('API Responses:', {
      irrigationHistory: irrigationHistoryResponse?.data,
      irrigationAnalytics: irrigationAnalyticsResponse?.data,
      sensorHistory: sensorHistoryResponse?.data,
      recommendations: recommendationsResponse?.data,
      personalizedReport,
      comprehensiveReport,
      zones: zonesResponse?.data
    });

    // Extract data from responses
    const irrigationHistory = irrigationHistoryResponse?.data?.data || irrigationHistoryResponse?.data || [];
    const irrigationAnalytics = irrigationAnalyticsResponse?.data?.data || irrigationAnalyticsResponse?.data || {};
    const sensorHistory = sensorHistoryResponse?.data?.data || sensorHistoryResponse?.data || [];
    const basicRecommendations = recommendationsResponse?.data?.data || recommendationsResponse?.data || [];
    const zones = zonesResponse?.data?.zones || zonesResponse?.data || [];

    console.log('Processed Data:', {
      irrigationHistory,
      irrigationAnalytics,
      sensorHistory,
      basicRecommendations,
      personalizedReport,
      comprehensiveReport,
      zones
    });

    // Process the real data
    const processedData = processReportData(
      irrigationHistory,
      irrigationAnalytics,
      sensorHistory,
      basicRecommendations,
      personalizedReport,
      comprehensiveReport,
      zones,
      days
    );

    console.log('Final Processed Data:', processedData);
    setReportData(processedData);
  } catch (error) {
    console.error('Error fetching report data:', error);
    setError('Failed to load report data. Please try again.');
  } finally {
    setLoading(false);
  }
};
const processReportData = (irrigationHistory, analytics, sensorHistory, basicRecommendations, personalizedReport, comprehensiveReport, zones, days) => {
  console.log('Processing data with:', {
    irrigationHistoryCount: irrigationHistory?.length,
    analyticsKeys: Object.keys(analytics),
    sensorHistoryCount: sensorHistory?.length,
    basicRecommendationsCount: basicRecommendations?.length,
    personalizedReport: personalizedReport,
    comprehensiveReport: comprehensiveReport,
    zonesCount: zones?.length,
    days
  });

  // Ensure we have arrays
  const safeIrrigationHistory = Array.isArray(irrigationHistory) ? irrigationHistory : [];
  const safeZones = Array.isArray(zones) ? zones : [];
  const safeBasicRecommendations = Array.isArray(basicRecommendations) ? basicRecommendations : [];

  // Calculate current and previous period data
  const currentPeriod = safeIrrigationHistory.filter(log => {
    if (!log.start_time) return false;
    const logDate = new Date(log.start_time);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    return logDate >= cutoffDate;
  });

  const previousPeriod = safeIrrigationHistory.filter(log => {
    if (!log.start_time) return false;
    const logDate = new Date(log.start_time);
    const currentCutoff = new Date();
    currentCutoff.setDate(currentCutoff.getDate() - days);
    const previousCutoff = new Date();
    previousCutoff.setDate(previousCutoff.getDate() - (days * 2));
    return logDate >= previousCutoff && logDate < currentCutoff;
  });

  console.log('Period data:', {
    currentPeriodCount: currentPeriod.length,
    previousPeriodCount: previousPeriod.length
  });

  // Calculate metrics with safe defaults
  const currentWaterUsage = currentPeriod.reduce((sum, log) => sum + (parseFloat(log.water_used) || 0), 0);
  const previousWaterUsage = previousPeriod.reduce((sum, log) => sum + (parseFloat(log.water_used) || 0), 0);
  
  const currentEvents = currentPeriod.length;
  const previousEvents = previousPeriod.length;

  // Calculate water saved (estimated based on efficiency improvements)
  const waterSaved = Math.max(0, previousWaterUsage - currentWaterUsage);

  // Calculate energy consumption (estimate based on pump runtime)
  const currentEnergy = currentPeriod.reduce((sum, log) => sum + (parseFloat(log.duration) || 0) * 0.1, 0);
  const previousEnergy = previousPeriod.reduce((sum, log) => sum + (parseFloat(log.duration) || 0) * 0.1, 0);

  // Monthly data (last 6 months)
  const monthlyData = generateMonthlyData(safeIrrigationHistory);

  // Zone efficiency
  const zoneEfficiency = calculateZoneEfficiency(safeZones, safeIrrigationHistory, days);

  // Process recommendations - combine basic and AI recommendations
  const recentRecommendations = processRecommendations(
    safeBasicRecommendations, 
    personalizedReport, 
    comprehensiveReport
  );

  // Extract AI insights
  const aiInsights = extractAIInsights(personalizedReport, comprehensiveReport);

  const result = {
    waterUsage: {
      current: Math.round(currentWaterUsage),
      previous: Math.round(previousWaterUsage),
      trend: currentWaterUsage > previousWaterUsage ? 'up' : currentWaterUsage < previousWaterUsage ? 'down' : 'stable'
    },
    energyConsumption: {
      current: Math.round(currentEnergy),
      previous: Math.round(previousEnergy),
      trend: currentEnergy > previousEnergy ? 'up' : currentEnergy < previousEnergy ? 'down' : 'stable'
    },
    irrigationEvents: {
      current: currentEvents,
      previous: previousEvents,
      trend: currentEvents > previousEvents ? 'up' : currentEvents < previousEvents ? 'down' : 'stable'
    },
    waterSaved: {
      current: Math.round(waterSaved),
      previous: 0,
      trend: waterSaved > 0 ? 'up' : 'stable'
    },
    monthlyData,
    zoneEfficiency,
    recentRecommendations,
    aiInsights, // Add AI insights
    rawData: {
      irrigationHistory: currentPeriod,
      analytics,
      sensorHistory,
      personalizedReport,
      comprehensiveReport
    }
  };

  console.log('Final processed result:', result);
  return result;
};


  const generateMonthlyData = (irrigationHistory) => {
    if (!Array.isArray(irrigationHistory)) return [];
    
    const months = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = month.toLocaleDateString('en-US', { month: 'short' });
      
      const monthData = irrigationHistory.filter(log => {
        if (!log.start_time) return false;
        const logDate = new Date(log.start_time);
        return logDate.getMonth() === month.getMonth() && 
               logDate.getFullYear() === month.getFullYear();
      });

      const water = monthData.reduce((sum, log) => sum + (parseFloat(log.water_used) || 0), 0);
      const energy = monthData.reduce((sum, log) => sum + (parseFloat(log.duration) || 0) * 0.1, 0);
      const events = monthData.length;

      months.push({
        month: monthName,
        water: Math.round(water),
        energy: Math.round(energy),
        events: events
      });
    }

    return months;
  };

  const calculateZoneEfficiency = (zones, irrigationHistory, days) => {
    if (!Array.isArray(zones) || !Array.isArray(irrigationHistory)) return [];
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return zones.map(zone => {
      const zoneName = zone.zone_name || zone.name;
      const zoneLogs = irrigationHistory.filter(log => 
        log.zone === zoneName || log.zone_name === zoneName
      );

      const recentLogs = zoneLogs.filter(log => {
        if (!log.start_time) return false;
        const logDate = new Date(log.start_time);
        return logDate >= cutoffDate;
      });

      const totalWater = recentLogs.reduce((sum, log) => sum + (parseFloat(log.water_used) || 0), 0);
      const totalDuration = recentLogs.reduce((sum, log) => sum + (parseFloat(log.duration) || 0), 0);
      
      // Simple efficiency calculation based on water usage vs zone area
      const area = zone.area_sqm || 100;
      const expectedWater = area * 2 * (days / 30);
      const efficiency = Math.min(100, Math.round((expectedWater / Math.max(totalWater, 1)) * 100));

      return {
        zone: zoneName,
        efficiency: efficiency,
        waterUsed: Math.round(totalWater),
        area: area
      };
    });
  };

  const extractAIInsights = (personalizedReport, comprehensiveReport) => {
  const insights = {
    personalized: null,
    comprehensive: null,
    hasAIInsights: false
  };

  // Extract from personalized report
  if (personalizedReport?.success && personalizedReport?.recommendations) {
    insights.personalized = {
      summary: personalizedReport.summary || 'Personalized insights available',
      recommendations: Array.isArray(personalizedReport.recommendations) ? 
        personalizedReport.recommendations.slice(0, 3) : []
    };
    insights.hasAIInsights = true;
  }

  // Extract from comprehensive report
  if (comprehensiveReport?.success && comprehensiveReport?.analysis) {
    insights.comprehensive = {
      executiveSummary: comprehensiveReport.analysis?.executiveSummary || 
                        comprehensiveReport.analysis?.summary ||
                        'Comprehensive analysis available',
      keyFindings: comprehensiveReport.analysis?.keyFindings || 
                   comprehensiveReport.analysis?.findings ||
                   [],
      efficiencyScore: comprehensiveReport.analysis?.efficiencyScore ||
                      comprehensiveReport.analysis?.overallEfficiency
    };
    insights.hasAIInsights = true;
  }


  // If no structured data, check for raw text responses
  if (!insights.hasAIInsights) {
    if (personalizedReport?.response && typeof personalizedReport.response === 'string') {
      insights.personalized = {
        summary: personalizedReport.response.substring(0, 200) + '...',
        rawResponse: personalizedReport.response
      };
      insights.hasAIInsights = true;
    }
    
    if (comprehensiveReport?.response && typeof comprehensiveReport.response === 'string') {
      insights.comprehensive = {
        executiveSummary: comprehensiveReport.response.substring(0, 200) + '...',
        rawResponse: comprehensiveReport.response
      };
      insights.hasAIInsights = true;
    }
  }

  return insights;
};

const processRecommendations = (basicRecommendations, personalizedReport, comprehensiveReport) => {
  const allRecommendations = [...basicRecommendations];
  
  // Add AI recommendations from personalized report
  if (personalizedReport?.success && Array.isArray(personalizedReport.recommendations)) {
    personalizedReport.recommendations.forEach(rec => {
      allRecommendations.push({
        ...rec,
        id: rec.id || `ai_personal_${Date.now()}_${Math.random()}`,
        source: 'ai_personalized',
        isAI: true
      });
    });
  }

  // Add recommendations from comprehensive report
  if (comprehensiveReport?.success && Array.isArray(comprehensiveReport.recommendations)) {
    comprehensiveReport.recommendations.forEach(rec => {
      allRecommendations.push({
        ...rec,
        id: rec.id || `ai_comp_${Date.now()}_${Math.random()}`,
        source: 'ai_comprehensive',
        isAI: true
      });
    });
  }

  // If no structured recommendations but we have AI responses, create some
  if (allRecommendations.length === 0) {
    if (personalizedReport?.response && typeof personalizedReport.response === 'string') {
      allRecommendations.push({
        id: 'ai_fallback_1',
        title: 'AI Optimization Insight',
        description: personalizedReport.response.substring(0, 150) + '...',
        type: 'ai_optimization',
        priority: 'medium',
        source: 'ai_personalized',
        isAI: true
      });
    }
    
    if (comprehensiveReport?.response && typeof comprehensiveReport.response === 'string') {
      allRecommendations.push({
        id: 'ai_fallback_2',
        title: 'Comprehensive Analysis',
        description: comprehensiveReport.response.substring(0, 150) + '...',
        type: 'system_analysis',
        priority: 'high',
        source: 'ai_comprehensive',
        isAI: true
      });
    }
  }

  // Process and limit recommendations
  return allRecommendations.slice(0, 5).map(rec => ({
    id: rec.id || rec.recommendation_id,
    type: rec.type || 'optimization',
    impact: rec.priority || rec.impact || 'medium',
    description: rec.description || rec.title,
    applied: rec.status === 'applied',
    isAI: rec.isAI || false,
    source: rec.source || 'system'
  }));
};

  const calculateSavings = () => {
    if (!reportData.waterSaved) return { percentage: 0, amount: 0 };
    const previous = reportData.waterSaved.previous || reportData.waterUsage?.previous || 1;
    const current = reportData.waterSaved.current || 0;
    const percentage = previous > 0 ? ((current) / previous) * 100 : 0;
    return {
      percentage: percentage.toFixed(1),
      amount: current
    };
  };

  const getTrendIcon = (trend) => {
    return trend === 'up' ? <TrendingUpIcon sx={{ fontSize: 18 }} /> : trend === 'down' ? <TrendingDownIcon sx={{ fontSize: 18 }} /> : <TrendingFlatIcon sx={{ fontSize: 18 }} />;
  };

  const getTrendColor = (trend) => {
    return trend === 'up' ? '#e74c3c' : trend === 'down' ? '#27ae60' : '#f39c12';
  };

  const handleApplyRecommendation = async (recId) => {
  try {
    console.log('Applying recommendation:', recId);
    const response = await recommendationAPI.applyRecommendation(recId);
    
    if (response.data?.success) {
      // Refresh the report data to show updated status
      fetchReportData();
    } else {
      console.error('Failed to apply recommendation:', response.data?.error);
    }
  } catch (error) {
    console.error('Error applying recommendation:', error);
  }
};

const handleDismissRecommendation = async (recId) => {
  try {
    console.log('Dismissing recommendation:', recId);
    const response = await recommendationAPI.dismissRecommendation(recId);
    
    if (response.data?.success) {
      // Refresh the report data to show updated status
      fetchReportData();
    } else {
      console.error('Failed to dismiss recommendation:', response.data?.error);
    }
  } catch (error) {
    console.error('Error dismissing recommendation:', error);
  }
};
  
  const exportReport = async (format) => {
    setExporting(true);
    try {
      // Create export data
      const exportData = {
        ...reportData,
        exportDate: new Date().toISOString(),
        timeRange: timeRange,
        days: getDaysFromRange()
      };

      if (format === 'csv') {
        exportToCSV(exportData);
      } else if (format === 'pdf') {
        exportToPDF(exportData);
      } else {
        printReport(exportData);
      }
    } catch (error) {
      console.error('Error exporting report:', error);
      alert('Failed to export report');
    } finally {
      setExporting(false);
    }
  };

  const exportToCSV = (data) => {
    // Creating CSV content
    let csvContent = "Irrigation System Report\n\n";
    csvContent += `Period: ${timeRange}\n`;
    csvContent += `Generated: ${new Date().toLocaleString()}\n\n`;

    // Key Metrics
    csvContent += "Key Metrics\n";
    csvContent += "Metric,Current,Previous,Trend\n";
    csvContent += `Water Usage (L),${data.waterUsage?.current},${data.waterUsage?.previous},${data.waterUsage?.trend}\n`;
    csvContent += `Energy Consumption (kWh),${data.energyConsumption?.current},${data.energyConsumption?.previous},${data.energyConsumption?.trend}\n`;
    csvContent += `Irrigation Events,${data.irrigationEvents?.current},${data.irrigationEvents?.previous},${data.irrigationEvents?.trend}\n`;
    csvContent += `Water Saved (L),${data.waterSaved?.current},${data.waterSaved?.previous},${data.waterSaved?.trend}\n\n`;

    // Zone Efficiency
    csvContent += "Zone Efficiency\n";
    csvContent += "Zone,Efficiency (%),Water Used (L),Area (m²)\n";
    data.zoneEfficiency?.forEach(zone => {
      csvContent += `${zone.zone},${zone.efficiency},${zone.waterUsed},${zone.area}\n`;
    });

    // Create and download CSV file
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `irrigation-report-${timeRange}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };


const exportToPDF = (data) => {
  try {
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(20);
    doc.setTextColor(40, 40, 40);
    doc.text('Irrigation System Report', 20, 30);
    
    // Add date and period
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(`Period: ${timeRange === '7d' ? 'Last 7 Days' : timeRange === '30d' ? 'Last 30 Days' : 'Last 90 Days'}`, 20, 45);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 20, 55);
    
    // Key Metrics Section
    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);
    doc.text('Key Metrics', 20, 75);
    
    doc.setFontSize(10);
    let yPosition = 90;
    
    // Water Usage
    doc.setTextColor(60, 60, 60);
    doc.text('Water Usage:', 20, yPosition);
    doc.setTextColor(30, 30, 30);
    doc.text(`${data.waterUsage?.current || 0}L (${data.waterUsage?.trend || 'stable'})`, 80, yPosition);
    yPosition += 8;
    
    // Energy Consumption
    doc.setTextColor(60, 60, 60);
    doc.text('Energy Consumption:', 20, yPosition);
    doc.setTextColor(30, 30, 30);
    doc.text(`${data.energyConsumption?.current || 0}kWh (${data.energyConsumption?.trend || 'stable'})`, 80, yPosition);
    yPosition += 8;
    
    // Irrigation Events
    doc.setTextColor(60, 60, 60);
    doc.text('Irrigation Events:', 20, yPosition);
    doc.setTextColor(30, 30, 30);
    doc.text(`${data.irrigationEvents?.current || 0} (${data.irrigationEvents?.trend || 'stable'})`, 80, yPosition);
    yPosition += 8;
    
    // Water Saved
    doc.setTextColor(60, 60, 60);
    doc.text('Water Saved:', 20, yPosition);
    doc.setTextColor(30, 120, 30);
    doc.text(`${data.waterSaved?.current || 0}L`, 80, yPosition);
    yPosition += 15;
    
    // Zone Efficiency Section
    if (data.zoneEfficiency && data.zoneEfficiency.length > 0) {
      doc.setFontSize(16);
      doc.setTextColor(40, 40, 40);
      doc.text('Zone Efficiency', 20, yPosition);
      yPosition += 15;
      
      doc.setFontSize(10);
      data.zoneEfficiency.forEach((zone, index) => {
        if (yPosition > 250) {
          doc.addPage();
          yPosition = 20;
        }
        
        doc.setTextColor(60, 60, 60);
        doc.text(`${zone.zone}:`, 20, yPosition);
        doc.setTextColor(30, 30, 30);
        doc.text(`${zone.efficiency}% (${zone.waterUsed}L used)`, 70, yPosition);
        yPosition += 8;
      });
      yPosition += 10;
    }
    
    // Monthly Trends Section
    if (data.monthlyData && data.monthlyData.length > 0) {
      doc.setFontSize(16);
      doc.setTextColor(40, 40, 40);
      doc.text('Monthly Trends', 20, yPosition);
      yPosition += 15;
      
      doc.setFontSize(10);
      data.monthlyData.forEach((month, index) => {
        if (yPosition > 250) {
          doc.addPage();
          yPosition = 20;
        }
        
        doc.setTextColor(60, 60, 60);
        doc.text(`${month.month}:`, 20, yPosition);
        doc.setTextColor(30, 30, 30);
        doc.text(`Water: ${month.water}L, Energy: ${month.energy}kWh, Events: ${month.events}`, 50, yPosition);
        yPosition += 8;
      });
    }
    
    // Recommendations Section
    if (data.recentRecommendations && data.recentRecommendations.length > 0) {
      if (yPosition > 200) {
        doc.addPage();
        yPosition = 20;
      }
      
      doc.setFontSize(16);
      doc.setTextColor(40, 40, 40);
      doc.text('Optimization Recommendations', 20, yPosition);
      yPosition += 15;
      
      doc.setFontSize(10);
      data.recentRecommendations.forEach((rec, index) => {
        if (yPosition > 250) {
          doc.addPage();
          yPosition = 20;
        }
        
        doc.setTextColor(60, 60, 60);
        doc.text(`${rec.impact.toUpperCase()}:`, 20, yPosition);
        doc.setTextColor(30, 30, 30);
        
        // Split long descriptions into multiple lines
        const description = rec.description;
        const lines = doc.splitTextToSize(description, 150);
        doc.text(lines, 50, yPosition);
        yPosition += (lines.length * 6) + 4;
      });
    }
    
    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Page ${i} of ${pageCount}`, 180, 290, null, null, 'right');
      doc.text('Generated by Nyuza Smart Irrigation System', 20, 290);
    }
    
    // Save the PDF
    doc.save(`irrigation-report-${timeRange}-${new Date().toISOString().split('T')[0]}.pdf`);
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    alert('Failed to generate PDF. Please try again.');
  }
};
const printReport = () => {
  // Create a printable version of the report
  const printContent = document.createElement('div');
  printContent.innerHTML = `
    <div style="padding: 20px; font-family: Arial, sans-serif;">
      <h1 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">
        Irrigation System Report
      </h1>
      
      <div style="margin-bottom: 20px;">
        <p><strong>Period:</strong> ${timeRange === '7d' ? 'Last 7 Days' : timeRange === '30d' ? 'Last 30 Days' : 'Last 90 Days'}</p>
        <p><strong>Generated:</strong> ${new Date().toLocaleDateString()}</p>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px;">
        <div style="border: 1px solid #ddd; padding: 15px; border-radius: 5px;">
          <h3 style="margin-top: 0; color: #2c3e50;">Water Usage</h3>
          <p style="font-size: 24px; font-weight: bold; color: #e74c3c; margin: 10px 0;">
            ${reportData.waterUsage?.current || 0}L
          </p>
          <p style="color: #7f8c8d;">Trend: ${reportData.waterUsage?.trend || 'stable'}</p>
        </div>
        
        <div style="border: 1px solid #ddd; padding: 15px; border-radius: 5px;">
          <h3 style="margin-top: 0; color: #2c3e50;">Energy Consumption</h3>
          <p style="font-size: 24px; font-weight: bold; color: #f39c12; margin: 10px 0;">
            ${reportData.energyConsumption?.current || 0}kWh
          </p>
          <p style="color: #7f8c8d;">Trend: ${reportData.energyConsumption?.trend || 'stable'}</p>
        </div>
        
        <div style="border: 1px solid #ddd; padding: 15px; border-radius: 5px;">
          <h3 style="margin-top: 0; color: #2c3e50;">Irrigation Events</h3>
          <p style="font-size: 24px; font-weight: bold; color: #3498db; margin: 10px 0;">
            ${reportData.irrigationEvents?.current || 0}
          </p>
          <p style="color: #7f8c8d;">Trend: ${reportData.irrigationEvents?.trend || 'stable'}</p>
        </div>
        
        <div style="border: 1px solid #ddd; padding: 15px; border-radius: 5px; background: #f8f9fa;">
          <h3 style="margin-top: 0; color: #2c3e50;">Water Saved</h3>
          <p style="font-size: 24px; font-weight: bold; color: #27ae60; margin: 10px 0;">
            ${reportData.waterSaved?.current || 0}L
          </p>
          <p style="color: #7f8c8d;">+${calculateSavings().percentage}% efficiency</p>
        </div>
      </div>

      ${reportData.zoneEfficiency ? `
        <div style="margin-bottom: 30px;">
          <h2 style="color: #2c3e50; border-bottom: 1px solid #bdc3c7; padding-bottom: 5px;">Zone Efficiency</h2>
          ${reportData.zoneEfficiency.map(zone => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #ecf0f1;">
              <span style="font-weight: bold;">${zone.zone}</span>
              <span>${zone.efficiency}% (${zone.waterUsed}L used)</span>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${reportData.monthlyData ? `
        <div style="margin-bottom: 30px;">
          <h2 style="color: #2c3e50; border-bottom: 1px solid #bdc3c7; padding-bottom: 5px;">Monthly Trends</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #34495e; color: white;">
                <th style="padding: 10px; text-align: left;">Month</th>
                <th style="padding: 10px; text-align: right;">Water (L)</th>
                <th style="padding: 10px; text-align: right;">Energy (kWh)</th>
                <th style="padding: 10px; text-align: right;">Events</th>
              </tr>
            </thead>
            <tbody>
              ${reportData.monthlyData.map(month => `
                <tr style="border-bottom: 1px solid #bdc3c7;">
                  <td style="padding: 8px;">${month.month}</td>
                  <td style="padding: 8px; text-align: right;">${month.water}</td>
                  <td style="padding: 8px; text-align: right;">${month.energy}</td>
                  <td style="padding: 8px; text-align: right;">${month.events}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
    </div>
  `;

  // Open print window
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
      <head>
        <title>Irrigation System Report</title>
        <style>
          @media print {
            body { margin: 0; }
            .no-print { display: none !important; }
          }
        </style>
      </head>
      <body>
        ${printContent.innerHTML}
        <script>
          window.onload = function() {
            window.print();
            setTimeout(() => window.close(), 500);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
};


 if (loading) {
    return (
      <div className="reports-section">
        <div className="loading">Loading reports...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="reports-section">
        <div className="error-message">
          <p>{error}</p>
          <button onClick={fetchReportData} className="btn-primary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="reports-section">
      <div className="section-header">
        <h2>Reports & Analytics</h2>
        <div className="time-filter">
          <select 
            value={timeRange} 
            onChange={(e) => setTimeRange(e.target.value)}
            className="time-select"
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>
        </div>
        <button onClick={fetchReportData} className="btn-secondary">
          Refresh Data
        </button>
      </div>

      {/* Debug info - remove in production */}
      <div style={{ background: '#f8f9fa', padding: '10px', marginBottom: '20px', borderRadius: '5px', fontSize: '12px' }}>
        <strong>Debug Info:</strong> 
        Irrigation Logs: {reportData.rawData?.irrigationHistory?.length || 0} | 
        Zones: {reportData.zoneEfficiency?.length || 0} |
        Recommendations: {reportData.recentRecommendations?.length || 0}
      </div>

      {/* Key Metrics */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-header">
            <h3>Water Usage</h3>
            <span className="trend-indicator" style={{ color: getTrendColor(reportData.waterUsage?.trend) }}>
              {getTrendIcon(reportData.waterUsage?.trend)}
            </span>
          </div>
          <div className="metric-value">{reportData.waterUsage?.current || 0}L</div>
          <div className="metric-comparison">
            vs previous: {reportData.waterUsage?.previous || 0}L
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <h3>Energy Consumption</h3>
            <span className="trend-indicator" style={{ color: getTrendColor(reportData.energyConsumption?.trend) }}>
              {getTrendIcon(reportData.energyConsumption?.trend)}
            </span>
          </div>
          <div className="metric-value">{reportData.energyConsumption?.current || 0}kWh</div>
          <div className="metric-comparison">
            vs previous: {reportData.energyConsumption?.previous || 0}kWh
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <h3>Irrigation Events</h3>
            <span className="trend-indicator" style={{ color: getTrendColor(reportData.irrigationEvents?.trend) }}>
              {getTrendIcon(reportData.irrigationEvents?.trend)}
            </span>
          </div>
          <div className="metric-value">{reportData.irrigationEvents?.current || 0}</div>
          <div className="metric-comparison">
            vs previous: {reportData.irrigationEvents?.previous || 0}
          </div>
        </div>

        <div className="metric-card highlight">
          <div className="metric-header">
            <h3>Water Saved</h3>
            <span className="trend-indicator" style={{ color: '#27ae60' }}>
              <WaterDropIcon sx={{ fontSize: 20 }} />
            </span>
          </div>
          <div className="metric-value">{reportData.waterSaved?.current || 0}L</div>
          <div className="metric-comparison">
            +{calculateSavings().percentage}% efficiency improvement
          </div>
        </div>
      </div>

      <div className="reports-content">
        {/* Zone Efficiency */}
        <div className="report-card">
          <h3>Zone Efficiency Analysis</h3>
          <div className="efficiency-list">
            {reportData.zoneEfficiency?.map((zone, index) => (
              <div key={zone.zone || index} className="efficiency-item">
                <div className="zone-info">
                  <span className="zone-name">{zone.zone}</span>
                  <span className="water-used">{zone.waterUsed}L used</span>
                </div>
                <div className="efficiency-bar">
                  <div 
                    className="efficiency-fill"
                    style={{ width: `${zone.efficiency}%` }}
                  ></div>
                  <span className="efficiency-value">{zone.efficiency}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly Trends */}
        <div className="report-card">
          <h3>Monthly Trends</h3>
          <div className="trends-chart">
            {reportData.monthlyData?.map((month, index) => (
              <div key={index} className="month-data">
                <div className="month-name">{month.month}</div>
                <div className="data-bars">
                  <div 
                    className="water-bar bar"
                    style={{ height: `${Math.min(month.water / 20, 100)}px` }}
                    title={`Water: ${month.water}L`}
                  ></div>
                  <div 
                    className="energy-bar bar"
                    style={{ height: `${Math.min(month.energy * 2, 100)}px` }}
                    title={`Energy: ${month.energy}kWh`}
                  ></div>
                  <div 
                    className="events-bar bar"
                    style={{ height: `${Math.min(month.events * 8, 100)}px` }}
                    title={`Events: ${month.events}`}
                  ></div>
                </div>
              </div>
            ))}
          </div>
          <div className="chart-legend">
            <div className="legend-item">
              <div className="legend-color water"></div>
              <span>Water Usage (L)</span>
            </div>
            <div className="legend-item">
              <div className="legend-color energy"></div>
              <span>Energy (kWh)</span>
            </div>
            <div className="legend-item">
              <div className="legend-color events"></div>
              <span>Irrigation Events</span>
            </div>
          </div>
        </div>

        {/* AI Insights Section */}
{reportData.aiInsights?.hasAIInsights && (
  <div className="report-card ai-insights">
    <h3 style={{ display: "flex", alignItems: "center", gap: 6 }}><SmartToyIcon sx={{ fontSize: 20 }} /> AI-Powered Insights</h3>
    
    {/* Personalized Insights */}
    {reportData.aiInsights.personalized && (
      <div className="ai-insight-section">
        <h4>Personalized Analysis</h4>
        <div className="ai-content">
          {reportData.aiInsights.personalized.summary && (
            <p className="ai-summary">{reportData.aiInsights.personalized.summary}</p>
          )}
          {reportData.aiInsights.personalized.rawResponse && (
            <div className="ai-full-response">
              <p>{reportData.aiInsights.personalized.rawResponse}</p>
            </div>
          )}
        </div>
      </div>
    )}

    {/* Comprehensive Analysis */}
    {reportData.aiInsights.comprehensive && (
      <div className="ai-insight-section">
        <h4>Comprehensive Analysis</h4>
        <div className="ai-content">
          {reportData.aiInsights.comprehensive.executiveSummary && (
            <p className="ai-summary">{reportData.aiInsights.comprehensive.executiveSummary}</p>
          )}
          {reportData.aiInsights.comprehensive.efficiencyScore && (
            <div className="efficiency-score">
              <strong>Overall Efficiency Score:</strong> {reportData.aiInsights.comprehensive.efficiencyScore}%
            </div>
          )}
          {reportData.aiInsights.comprehensive.rawResponse && (
            <div className="ai-full-response">
              <p>{reportData.aiInsights.comprehensive.rawResponse}</p>
            </div>
          )}
        </div>
      </div>
    )}
  </div>
)}

{/* Optimization Recommendations */}
<div className="report-card">
  <h3>Optimization Recommendations</h3>
  <div className="recommendations-header">
    <span className="recommendations-count">
      {reportData.recentRecommendations?.length || 0} recommendations
    </span>
    <span className="ai-badge">
      {reportData.recentRecommendations?.filter(rec => rec.isAI).length || 0} AI-powered
    </span>
  </div>
  
  <div className="recommendations-list">
    {reportData.recentRecommendations?.length > 0 ? (
      reportData.recentRecommendations.map(rec => (
        <div key={rec.id} className={`optimization-rec ${rec.isAI ? 'ai-recommendation' : ''}`}>
          <div className="rec-header">
            <div className="rec-type">
              <span className={`impact-badge ${rec.impact}`}>
                {rec.impact}
              </span>
              {rec.isAI && <span className="ai-badge-small" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><SmartToyIcon sx={{ fontSize: 12 }} /> AI</span>}
              {rec.source && <span className="source-badge">{rec.source}</span>}
            </div>
          </div>
          <div className="rec-description">
            {rec.description}
          </div>
          <div className="rec-actions">
            <button 
              className="btn-primary" 
              disabled={rec.applied}
              onClick={() => handleApplyRecommendation(rec.id)}
            >
              {rec.applied ? (<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><CheckCircleIcon sx={{ fontSize: 14 }} /> Applied</span>) : 'Apply'}
            </button>
            {!rec.applied && (
              <button 
                className="btn-secondary"
                onClick={() => handleDismissRecommendation(rec.id)}
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      ))
    ) : (
      <div className="no-recommendations">
        <p>No recommendations available.</p>
        <small>Recommendations are generated based on your irrigation patterns and system data.</small>
      </div>
    )}
  </div>
</div>
        {/* Export Options */}
        <div className="report-card">
          <h3>Export Reports</h3>
          <div className="export-options">
            <button 
              className="export-btn"
              onClick={() => exportReport('pdf')}
              disabled={exporting}
            >
              {exporting ? <HourglassEmptyIcon sx={{ fontSize: 16 }} /> : <PictureAsPdfIcon sx={{ fontSize: 16 }} />} Export as PDF
            </button>
            <button 
              className="export-btn"
              onClick={() => exportReport('csv')}
              disabled={exporting}
            >
              {exporting ? <HourglassEmptyIcon sx={{ fontSize: 16 }} /> : <BarChartIcon sx={{ fontSize: 16 }} />} Export as CSV
            </button>
            <button 
              className="export-btn"
              onClick={() => exportReport('print')}
              disabled={exporting}
            >
              {exporting ? <HourglassEmptyIcon sx={{ fontSize: 16 }} /> : <PrintIcon sx={{ fontSize: 16 }} />} Print Report
            </button>
          </div>
          {exporting && <div className="exporting-message">Preparing download...</div>}
        </div>
      </div>
    </div>
  );
};

export default ReportsSection;