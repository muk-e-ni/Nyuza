import json
from datetime import datetime, timedelta
from models import IrrigationLog, IrrigationZone, MoistureReading, Recommendation, database
from services.genai_service import genai_service
from services.weather_service import weather_service

class AIRecommendationEngine:
    def __init__(self):
        self.ollama_service = genai_service  # kept the attribute name for now — many call sites below still say self.ollama_service, but it's Gemini-backed as of this change
        # In-memory cache for AI-backed results: serve the last generated
        # result indefinitely per cache key, until the caller explicitly asks
        # for force_refresh=True. This is what "click refresh if you want a
        # new one" maps to — no TTL, no background regeneration, just: don't
        # call the AI again unless asked. Resets on server restart, which is
        # fine for this use case.
        self._result_cache = {}

    def _cached_or_generate(self, cache_key, generator_fn, force_refresh=False):
        if not force_refresh and cache_key in self._result_cache:
            cached = self._result_cache[cache_key]
            result = dict(cached) if isinstance(cached, dict) else cached
            if isinstance(result, dict):
                result['cached'] = True
            return result

        result = generator_fn()
        self._result_cache[cache_key] = result
        if isinstance(result, dict):
            result = dict(result)
            result['cached'] = False
        return result

    def generate_intelligent_recommendations(self, user_id, zone_id=None, force_refresh=False):
        """Generate AI-powered irrigation recommendations — cached per (user, zone)
        until force_refresh=True is passed."""
        cache_key = ('recommendations', user_id, zone_id)
        return self._cached_or_generate(
            cache_key,
            lambda: self._generate_intelligent_recommendations_impl(user_id, zone_id),
            force_refresh,
        )

    def _generate_intelligent_recommendations_impl(self, user_id, zone_id=None):
        """Generate AI-powered irrigation recommendations"""
        try:
            # Get comprehensive data for analysis
            analysis_data = self._gather_analysis_data(user_id, zone_id)
            
            # Generate AI insights using Ollama
            ai_insights = self._generate_ai_insights(analysis_data)
            
            # Create actionable recommendations
            recommendations = self._create_recommendations(analysis_data, ai_insights)
            
            # Store recommendations in database
            self._store_recommendations(user_id, recommendations)
            
            return {
                'success': True,
                'recommendations': recommendations,
                'ai_insights': ai_insights,
                'analysis_period': analysis_data.get('analysis_period'),
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            print(f"AI recommendation error: {e}")
            return {
                'success': False,
                'error': str(e),
                'fallback_recommendations': self._generate_fallback_recommendations(user_id)
            }
    
    def _gather_analysis_data(self, user_id, zone_id=None):
        """Gather comprehensive data for AI analysis"""
        # Get irrigation history (last 30 days)
        end_date = datetime.now()
        start_date = end_date - timedelta(days=30)
        
        # Build query
        query = IrrigationLog.query.filter(
            IrrigationLog.user_id == user_id,
            IrrigationLog.start_time >= start_date
        )
        
        if zone_id:
            query = query.filter(IrrigationLog.zone_id == zone_id)
            
        irrigation_logs = query.order_by(IrrigationLog.start_time.desc()).all()
        
        # Get zone information
        zones_query = IrrigationZone.query.filter_by(user_id=user_id)
        if zone_id:
            zones_query = zones_query.filter_by(zone_id=zone_id)
        zones = zones_query.all()
        
        # Get recent moisture readings
        moisture_readings = []
        for zone in zones:
            readings = MoistureReading.query.filter_by(
                zone_id=zone.zone_id
            ).order_by(MoistureReading.timestamp.desc()).limit(100).all()
            moisture_readings.extend(readings)
        
        # Get weather data
        weather_data = weather_service.get_forecast() or {}
        
        # Calculate key metrics
        total_water = sum(log.water_used or 0 for log in irrigation_logs)
        total_events = len(irrigation_logs)
        auto_events = len([log for log in irrigation_logs if log.trigger_type == 'automatic'])
        
        return {
            'user_id': user_id,
            'irrigation_history': [
                {
                    'zone_id': log.zone_id,
                    'zone_name': log.zone,
                    'duration': log.duration,
                    'water_used': log.water_used,
                    'start_time': log.start_time.isoformat(),
                    'trigger_type': log.trigger_type,
                    'status': log.status
                } for log in irrigation_logs
            ],
            'zones': [
                {
                    'zone_id': zone.zone_id,
                    'zone_name': zone.zone_name,
                    'crop_type': zone.crop_type,
                    'soil_type': zone.soil_type,
                    'area_sqm': zone.area_sqm,
                    'water_requirement': zone.water_requirement
                } for zone in zones
            ],
            'moisture_readings': [
                {
                    'zone_id': reading.zone_id,
                    'moisture_level': reading.moisture_level,
                    'timestamp': reading.timestamp.isoformat()
                } for reading in moisture_readings
            ],
            'weather_data': weather_data,
            'metrics': {
                'total_water_used': total_water,
                'total_irrigation_events': total_events,
                'automation_rate': (auto_events / max(total_events, 1)) * 100,
                'average_water_per_event': total_water / max(total_events, 1),
                'analysis_period_days': 30
            },
            'analysis_period': {
                'start': start_date.isoformat(),
                'end': end_date.isoformat()
            }
        }
    
    def _generate_ai_insights(self, analysis_data):
        """Generate AI insights using Ollama"""
        try:
            # Prepare data for AI analysis
            ai_prompt_data = {
                'irrigation_summary': analysis_data['metrics'],
                'zones': analysis_data['zones'],
                'recent_weather': analysis_data.get('weather_data', {}),
                'analysis_period': analysis_data['analysis_period']
            }
            
            # Use Ollama to generate insights
            insights = self.ollama_service.generate_irrigation_insights(
                system_data={
                    'current_moisture': self._get_average_moisture(analysis_data['moisture_readings']),
                    'total_water_used': analysis_data['metrics']['total_water_used'],
                    'automation_rate': analysis_data['metrics']['automation_rate']
                },
                weather_data=analysis_data.get('weather_data', {}),
                predictions={
                    'irrigation_needed': self._check_irrigation_needed(analysis_data),
                    'confidence': 0.85,
                    'efficiency_score': self._calculate_efficiency_score(analysis_data)
                }
            )
            
            return insights
            
        except Exception as e:
            print(f"AI insights generation failed: {e}")
            return "AI analysis temporarily unavailable. Using rule-based recommendations."
    
    def _create_recommendations(self, analysis_data, ai_insights):
        """Create actionable recommendations based on analysis"""
        recommendations = []
        metrics = analysis_data['metrics']
        
        # Water efficiency recommendations
        if metrics['average_water_per_event'] > 50:  # High water usage
            recommendations.append({
                'type': 'water_efficiency',
                'priority': 'high',
                'title': 'Optimize Water Usage',
                'description': f"High average water usage ({metrics['average_water_per_event']:.1f}L per event). Consider shorter durations or zone-specific adjustments.",
                'action': 'Adjust irrigation durations based on zone requirements',
                'expected_savings': '15-25% water reduction'
            })
        
        # Automation recommendations
        if metrics['automation_rate'] < 70:
            recommendations.append({
                'type': 'automation',
                'priority': 'medium',
                'title': 'Increase Automation',
                'description': f"Only {metrics['automation_rate']:.1f}% of irrigations are automated. Enable more moisture-based triggers.",
                'action': 'Review and activate moisture-based schedules',
                'expected_savings': '10-20% efficiency improvement'
            })
        
        # Zone-specific recommendations
        for zone in analysis_data['zones']:
            zone_water = self._get_zone_water_usage(analysis_data['irrigation_history'], zone['zone_id'])
            if zone_water > (zone.get('water_requirement', 10) * 30 * 1.2):  # 20% over requirement
                recommendations.append({
                    'type': 'zone_optimization',
                    'priority': 'medium',
                    'title': f"Optimize {zone['zone_name']} Irrigation",
                    'description': f"{zone['zone_name']} is using {zone_water:.1f}L, exceeding requirements.",
                    'action': f"Adjust {zone['zone_name']} schedule or moisture thresholds",
                    'expected_savings': f"10-15% water savings for {zone['zone_name']}"
                })
        
        # Add AI-generated recommendation if available
        if ai_insights and "unavailable" not in ai_insights.lower():
            recommendations.append({
                'type': 'ai_optimization',
                'priority': 'high',
                'title': 'AI-Powered Optimization',
                'description': ai_insights,
                'action': 'Implement AI-suggested adjustments',
                'expected_savings': '15-30% overall efficiency improvement'
            })
        
        return recommendations[:5]  # Return top 5 recommendations
    
    def _store_recommendations(self, user_id, recommendations):
        """Store recommendations in database"""
        try:
            for rec in recommendations:
                recommendation = Recommendation(
                    user_id=user_id,
                    title=rec['title'],
                    description=rec['description'],
                    recommendation_type=rec['type'],
                    priority=rec['priority'],
                    status='pending',
                    created_at=datetime.now(),
                    ai_model_version='ollama_v1',
                    confidence_score=0.85
                )
                database.session.add(recommendation)
            
            database.session.commit()
        except Exception as e:
            print(f"Error storing recommendations: {e}")
            database.session.rollback()
    
    def _get_average_moisture(self, moisture_readings):
        """Calculate average moisture from recent readings"""
        if not moisture_readings:
            return 50
        recent_readings = moisture_readings[:10]  # Last 10 readings
        return sum(reading['moisture_level'] for reading in recent_readings) / len(recent_readings)
    
    def _check_irrigation_needed(self, analysis_data):
        """Check if irrigation is needed based on recent data"""
        if not analysis_data['moisture_readings']:
            return False
        
        latest_moisture = analysis_data['moisture_readings'][0]['moisture_level']
        return latest_moisture < 40  # Threshold for needed irrigation
    
    def _calculate_efficiency_score(self, analysis_data):
        """Calculate overall efficiency score"""
        metrics = analysis_data['metrics']
        automation_score = metrics['automation_rate'] / 100
        water_score = 1 - min(1, metrics['average_water_per_event'] / 100)
        return (automation_score + water_score) / 2
    
    def _get_zone_water_usage(self, irrigation_history, zone_id):
        """Get total water usage for a specific zone"""
        return sum(log['water_used'] for log in irrigation_history if log['zone_id'] == zone_id)
    
    def _generate_fallback_recommendations(self, user_id):
        """Generate fallback recommendations when AI fails"""
        return [
            {
                'type': 'system_optimization',
                'priority': 'medium',
                'title': 'Review Irrigation Schedule',
                'description': 'Check and optimize your irrigation schedules for better water efficiency.',
                'action': 'Review zone schedules and moisture thresholds',
                'expected_savings': '10-20% water savings'
            }
        ]
    
    def analyze_irrigation_event(self, user_id, zone_id, log_id):
        """Analyze a specific irrigation event for optimization"""
        try:
            # This can be called after each irrigation event — something just
            # changed, so this is exactly the case that should bypass the cache.
            self.generate_intelligent_recommendations(user_id, zone_id, force_refresh=True)
        except Exception as e:
            print(f"Event analysis error: {e}")

    def generate_personalized_report(self, user_id, days, force_refresh=False):
        """Generate personalized report for a user — cached per (user, days)."""
        cache_key = ('personalized_report', user_id, days)
        return self._cached_or_generate(
            cache_key,
            lambda: self._generate_personalized_report_impl(user_id, days),
            force_refresh,
        )

    def _generate_personalized_report_impl(self, user_id, days):
        """Generate personalized report for a user"""
        try:
            # Get analysis data
            analysis_data = self._gather_analysis_data(user_id, None)
            
            # Generate AI insights using Ollama
            ai_insights = self.ollama_service.generate_irrigation_insights(
                system_data={
                    'current_moisture': self._get_average_moisture(analysis_data['moisture_readings']),
                    'total_water_used': analysis_data['metrics']['total_water_used'],
                    'analysis_period_days': days
                },
                weather_data=analysis_data.get('weather_data', {}),
                predictions={
                    'irrigation_needed': self._check_irrigation_needed(analysis_data),
                    'confidence': 0.85,
                    'efficiency_score': self._calculate_efficiency_score(analysis_data)
                }
            )
            
            return {
                'success': True,
                'user_id': user_id,
                'days': days,
                'summary': ai_insights,
                'recommendations': self._create_recommendations(analysis_data, ai_insights),
                'timestamp': datetime.now().isoformat()
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def generate_comprehensive_report(self, user_id, days, force_refresh=False):
        """Generate comprehensive AI analysis report — cached per (user, days)."""
        cache_key = ('comprehensive_report', user_id, days)
        return self._cached_or_generate(
            cache_key,
            lambda: self._generate_comprehensive_report_impl(user_id, days),
            force_refresh,
        )

    def _generate_comprehensive_report_impl(self, user_id, days):
        """Generate comprehensive AI analysis report"""
        try:
            analysis_data = self._gather_analysis_data(user_id, None)
            
            # Generate comprehensive analysis using Ollama
            comprehensive_analysis = self.ollama_service.generate_detailed_report(
                analysis_data, 
                f"last {days} days"
            )
            
            return {
                'success': True,
                'user_id': user_id,
                'days': days,
                'analysis': {
                    'executiveSummary': comprehensive_analysis,
                    'keyFindings': self._extract_key_findings(analysis_data),
                    'efficiencyScore': self._calculate_efficiency_score(analysis_data)
                },
                'timestamp': datetime.now().isoformat()
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    
    def _extract_key_findings(self, analysis_data):
        """Extract key findings from analysis data"""
        findings = []
        metrics = analysis_data['metrics']
        
        if metrics['total_water_used'] > 10000:
            findings.append(f"High water usage detected: {metrics['total_water_used']} liters")
        
        if metrics['automation_rate'] < 70:
            findings.append(f"Low automation rate: {metrics['automation_rate']:.1f}%")
        
        if len(analysis_data.get('zones', [])) > 1:
            findings.append(f"Multiple zones ({len(analysis_data['zones'])}) configured")
        
        return findings
    
    def _calculate_optimal_water(self, analysis_data):
        """Calculate optimal water usage based on analysis"""
        metrics = analysis_data['metrics']
        if metrics['total_irrigation_events'] > 0:
            return metrics['total_water_used'] / metrics['total_irrigation_events']
        return 0
    def generate_weather_insights(self, current_weather, forecast, user_id, force_refresh=False):
        """Generate AI insights specifically for weather data — cached per user.
        Raw weather numbers are already cached separately at the weather_service
        level; this caches just the Ollama-generated narrative on top of them."""
        cache_key = ('weather_insights', user_id)
        return self._cached_or_generate(
            cache_key,
            lambda: self._generate_weather_insights_impl(current_weather, forecast, user_id),
            force_refresh,
        )

    def _generate_weather_insights_impl(self, current_weather, forecast, user_id):
        """Generate AI insights specifically for weather data"""
        try:
            analysis_data = self._gather_analysis_data(user_id, None)
            
            insights = self.ollama_service.generate_weather_insights(
                current_weather=current_weather,
                forecast=forecast,
                irrigation_data=analysis_data
            )
            
            return {
                'success': True,
                'insights': insights,
                'recommendations': self._create_weather_recommendations(current_weather, forecast),
                'risk_assessment': self._assess_weather_risks(current_weather, forecast)
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def generate_predictive_schedule(self, user_id, zone_id, forecast):
        """Generate predictive irrigation schedule based on weather forecast"""
        try:
            analysis_data = self._gather_analysis_data(user_id, zone_id)
            
            predictive_schedule = self.ollama_service.generate_predictive_schedule(
                forecast=forecast,
                zone_data=analysis_data.get('zones', []),
                historical_data=analysis_data.get('irrigation_history', [])
            )
            
            return predictive_schedule
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def _create_weather_recommendations(self, current_weather, forecast):
        """Create weather-specific recommendations"""
        recommendations = []
        
        # Add weather-based logic here
        if current_weather.get('rainfall', 0) > 10:
            recommendations.append({
                'type': 'weather_advisory',
                'priority': 'high',
                'title': 'Heavy Rain Expected',
                'description': 'Delay irrigation due to significant rainfall',
                'action': 'Skip next scheduled irrigation'
            })
        
        return recommendations

    def _assess_weather_risks(self, current_weather, forecast):
        """Assess weather-related risks for irrigation"""
        risks = []
        
        if current_weather.get('temperature', 20) > 35:
            risks.append('heat_stress')
        if current_weather.get('wind_speed', 0) > 25:
            risks.append('high_evaporation')
        if any(day.get('rainfall', 0) > 5 for day in forecast.get('forecast', [])):
            risks.append('over_watering')
        
        return risks
ai_recommendation_engine = AIRecommendationEngine()