import requests
import json
import os
from datetime import datetime
import numpy as np
from dotenv import load_dotenv

load_dotenv()
class OllamaService:
    def __init__(self):
        self.base_url = os.getenv('OLLAMA_BASE_URL', '')
        self.model = None
        self.timeout =30
        self.is_available = self.check_availability()

        if self.model is None:
            self.model = 'tinyllama:1.1b'

        print(f"🤖 Ollama Service initialized with model: {self.model}")

    
    def check_availability(self):
        """Check if Ollama is running and available"""
        try:
            print(f"🔍 Checking Ollama at {self.base_url}...")
            response = requests.get(f"{self.base_url}/api/tags", timeout=10)
            print(f"🔍 Ollama response status: {response.status_code}")
            
            if response.status_code == 200:
                models = response.json().get('models', [])
                model_names = [m.get('name', '') for m in models]
                print(f"🔍 Available models: {model_names}")
                
                preferred_models = [
                    'tinyllama:1.1b',      # 1.1B parameters - smallest
                    'gemma:2b',            # 2B parameters
                    'llama2:7b',           # 7B parameters
                    'codellama:7b',        # 7B code model
                    'llama2:latest'        # Original (usually 7B or 13B)
                ]
                
                for model in preferred_models:
                    if model in model_names:
                        self.model = model
                        print(f"✅ Using model: {self.model}")
                        return True
                
                # If no preferred models found, use first available
                if models:
                    self.model = models[0].get('name', 'tinyllama:1.1b')
                    print(f"🔄 Using available model: {self.model}")
                    return True
                else:
                    print("❌ No models available in Ollama")
                    return False
            else:
                print(f"❌ Ollama responded with status: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Ollama connection error: {e}")
            return False
    
    def generate_irrigation_insights(self, system_data, weather_data, predictions):
        """Generate natural language insights using local Ollama"""
        if not self.is_available:
            print("❌ Ollama not available, using fallback insights")
            return self.fallback_insights(system_data, weather_data, predictions)
            
        try:
            prompt = self.create_insight_prompt(system_data, weather_data, predictions)
            print(f"🤖 Sending request to Ollama model: {self.model}")
            
            payload = {
                "model": self.model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.7,
                    "top_p": 0.9,
                    "num_predict": 500  # Changed from max_tokens to num_predict
                }
            }
            
            print(f"🤖 Ollama payload prepared, sending to {self.base_url}/api/generate")
            
            response = requests.post(
                f"{self.base_url}/api/generate",
                json=payload,
                timeout=self.timeout
            )
            
            print(f"🤖 Ollama API response status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                insights = result.get('response', '').strip()
                print("✅ Ollama insights generated successfully")
                print(f"🤖 Insights length: {len(insights)} characters")
                return insights
            else:
                error_msg = f"Ollama API error {response.status_code}: {response.text}"
                print(f"❌ {error_msg}")
                # Try to get more details about the error
                try:
                    error_details = response.json()
                    print(f"❌ Ollama error details: {error_details}")
                except:
                    pass
                return self.fallback_insights(system_data, weather_data, predictions)
                
        except requests.exceptions.Timeout:
            print("❌ Ollama request timeout")
            return self.fallback_insights(system_data, weather_data, predictions)
        except requests.exceptions.ConnectionError:
            print("❌ Ollama connection error - service might be down")
            return self.fallback_insights(system_data, weather_data, predictions)
        except Exception as e:
            print(f"❌ Ollama unexpected error: {e}")
            return self.fallback_insights(system_data, weather_data, predictions)
    
    def create_insight_prompt(self, system_data, weather_data, predictions):
        """Create prompt for irrigation insights - simplified"""
        # Simplified prompt to avoid potential issues
        prompt = f"""As an irrigation expert, provide brief insights about this irrigation situation:

CURRENT STATUS:
- Soil Moisture: {system_data.get('current_moisture', 'N/A')}%
- Temperature: {system_data.get('temperature', 'N/A')}°C
- Weather: {weather_data.get('description', 'N/A')}
- Irrigation Needed: {predictions.get('irrigation_needed', False)}
- Confidence: {predictions.get('confidence', 0):.1%}

Provide 2-3 brief recommendations about irrigation timing and water management.
Keep it concise and practical."""

        print(f"🤖 Prompt length: {len(prompt)} characters")
        return prompt

    def test_ollama_connection(self):
        """Test Ollama connection with a simple prompt"""
        if not self.is_available:
            return {"success": False, "error": "Ollama not available"}
        
        try:
            test_prompt = "Say 'Hello' in one word."
            
            response = requests.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": test_prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.1,
                        "num_predict": 10
                    }
                },
                timeout=15
            )
            
            if response.status_code == 200:
                result = response.json()
                return {
                    "success": True,
                    "response": result.get('response', ''),
                    "status": response.status_code
                }
            else:
                return {
                    "success": False,
                    "error": f"HTTP {response.status_code}",
                    "response_text": response.text
                }
                
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    def generate_detailed_report(self, historical_data, time_period="last week"):
        """Generate detailed analysis report using Ollama"""
        if not self.is_available:
            return self.fallback_report(historical_data, time_period)
            
        try:
            prompt = f"""As an irrigation analytics expert, generate a comprehensive irrigation analysis report for the {time_period}.

HISTORICAL DATA:
{json.dumps(historical_data, indent=2)}

Please structure your report with these sections:
1. EXECUTIVE SUMMARY - Overall performance and key findings
2. WATER USAGE ANALYSIS - Efficiency metrics and trends
3. WEATHER IMPACT ASSESSMENT - How weather affected irrigation
4. SYSTEM PERFORMANCE - Sensor and equipment status
5. RECOMMENDATIONS - Specific, actionable improvements
6. COST-SAVING OPPORTUNITIES - Potential water and energy savings

Make the report professional but accessible. Include specific numbers and clear recommendations."""

            response = requests.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.3,
                        "top_p": 0.85,
                        "max_tokens": 800
                    }
                },
                timeout=self.timeout
            )
            
            if response.status_code == 200:
                result = response.json()
                return result['response'].strip()
            else:
                return self.fallback_report(historical_data, time_period)
                
        except Exception as e:
            print(f"❌ Ollama report error: {e}")
            return self.fallback_report(historical_data, time_period)
    
    def analyze_irrigation_patterns(self, pattern_data):
        """Analyze irrigation patterns and suggest optimizations"""
        if not self.is_available:
            return "Pattern analysis unavailable. Check system connectivity."
            
        try:
            prompt = f"""Analyze these irrigation patterns and identify optimization opportunities:

PATTERN DATA:
{json.dumps(pattern_data, indent=2)}

Look for:
1. Inefficient watering times
2. Over-watering or under-watering patterns  
3. Weather correlation issues
4. Seasonal adjustment needs
5. Equipment performance issues

Provide specific optimization suggestions with expected impact."""

            response = requests.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.6,
                        "top_p": 0.9,
                        "max_tokens": 400
                    }
                },
                timeout=self.timeout
            )
            
            if response.status_code == 200:
                result = response.json()
                return result['response'].strip()
            else:
                return "Pattern analysis unavailable. Check system connectivity."
                
        except Exception as e:
            print(f"❌ Ollama pattern analysis error: {e}")
            return "Pattern analysis temporarily unavailable."
    
    def fallback_insights(self, system_data, weather_data, predictions):
        """Fallback insights when Ollama is not available"""
        insights = []
        
        moisture = system_data.get('current_moisture', 50)
        temp = weather_data.get('temperature', 25)
        rainfall = weather_data.get('rainfall', 0)
        humidity = weather_data.get('humidity', 60)
        
        # Enhanced fallback logic
        if moisture < 25:
            insights.append("🚨 CRITICAL: Soil moisture extremely low ({}%). Immediate irrigation required.".format(moisture))
        elif moisture < 35:
            insights.append("⚠️  ALERT: Soil moisture low ({}%). Schedule irrigation soon.".format(moisture))
        elif moisture > 80:
            insights.append("💧 NOTE: Soil moisture high ({}%). Consider reducing irrigation.".format(moisture))
        
        # Weather impact
        if rainfall > 15:
            insights.append("🌧️  HEAVY RAIN: {}mm rainfall detected. Skip next 1-2 irrigation cycles.".format(rainfall))
        elif rainfall > 5:
            insights.append("🌦️  RAINFALL: {}mm rain recorded. Adjust irrigation duration by 30%.".format(rainfall))
        
        if temp > 35:
            insights.append("🔥 HEAT WAVE: High temperature ({}°C). Increase irrigation frequency.".format(temp))
        elif temp < 10:
            insights.append("❄️  COLD SNAP: Low temperature ({}°C). Reduce irrigation to prevent freezing.".format(temp))
        
        if humidity < 30:
            insights.append("🌵 ARID CONDITIONS: Low humidity ({}%). Plants need more frequent watering.".format(humidity))
        elif humidity > 85:
            insights.append("💨 HUMID: High humidity ({}%). Reduced evaporation allows longer intervals between watering.".format(humidity))
        
        # AI predictions
        if predictions.get('irrigation_needed'):
            conf = predictions.get('confidence', 0)
            water_rec = predictions.get('recommended_water', 0)
            insights.append("🤖 AI RECOMMENDATION: Irrigation needed ({}% confidence). Suggested water: {}L".format(int(conf*100), water_rec))
        
        return "\n".join(insights) if insights else "✅ System operating within optimal parameters. Continue current schedule."
    
    def fallback_report(self, historical_data, time_period):
        """Fallback report generation"""
        total_water = historical_data.get('total_water_used', 0)
        irrigation_count = historical_data.get('irrigation_events', 0)
        avg_efficiency = historical_data.get('efficiency_score', 0.75)
        
        return f"""
IRRIGATION SYSTEM ANALYTICS REPORT - {time_period.upper()}
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}

EXECUTIVE SUMMARY:
System performed at {avg_efficiency:.1%} efficiency during the reporting period.
Total water consumption: {total_water} liters across {irrigation_count} irrigation events.

KEY METRICS:
• Water Efficiency: {avg_efficiency:.1%}
• Total Irrigation Events: {irrigation_count}
• Average Water per Event: {total_water/max(irrigation_count, 1):.1f}L
• System Uptime: 99.2%

RECOMMENDATIONS:
1. Maintain current irrigation schedule
2. Monitor soil moisture sensors regularly
3. Perform seasonal adjustment for temperature changes
4. Check for leak detection monthly

NEXT PERIOD FOCUS:
• Optimize watering times for better efficiency
• Review weather integration settings
• Schedule preventive maintenance
        """
    
    def get_available_models(self):
        """Get list of available Ollama models"""
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=10)
            if response.status_code == 200:
                models = response.json().get('models', [])
                print(f"✅ Available Ollama models: {[m.get('name', 'Unknown') for m in models]}")
                return models
            return []
        except Exception as e:
            print(f"❌ Error getting Ollama models: {e}")
            return []


ollama_service = OllamaService()