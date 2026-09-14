"""
Nyuza — Gemini (Google GenAI) service
--------------------------------------
Drop-in replacement for ollama_service.py. Local Ollama was too slow and
too RAM-hungry on this deployment (frequent timeouts), so recommendation
and report generation now goes to Google's hosted Gemini API instead.

Same public interface as ollama_service (generate_irrigation_insights,
generate_detailed_report, analyze_irrigation_patterns, generate_weather_insights,
generate_predictive_schedule, get_available_models, is_available, model,
base_url) so callers didn't need to change beyond the import line.

Setup: set GEMINI_API_KEY in your .env (get one free at
https://aistudio.google.com/apikey). Optionally set GEMINI_MODEL to override
the default — model names shift over time; gemini-2.5-flash-lite is used
here as a cheap, fast default as of when this was written (Sept 2026),
but check https://ai.google.dev/gemini-api/docs/models for what's current.
"""

import os
import json
import logging
from datetime import datetime
from dotenv import load_dotenv

from google import genai
from google.genai import types
from google.genai.errors import ClientError, ServerError

load_dotenv()
logger = logging.getLogger(__name__)


class GenAIService:
    def __init__(self):
        self.api_key = os.getenv('GEMINI_API_KEY', '')
        self.model = os.getenv('GEMINI_MODEL', 'gemini-3.5-flash-lite')
        self.base_url = 'https://generativelanguage.googleapis.com'  # informational only, kept for parity with ollama_service.base_url
        self.timeout = 30
        self._client = None
        self.is_available = bool(self.api_key)

        if self.is_available:
            try:
                self._client = genai.Client(api_key=self.api_key)
                print(f"✅ Gemini service initialized with model: {self.model}")
            except Exception as e:
                print(f"❌ Gemini client init error: {e}")
                self.is_available = False
        else:
            print("⚠️ GEMINI_API_KEY not set — AI insights will use fallback text until it's configured")

    def _generate(self, prompt, temperature=0.7, max_output_tokens=500):
        """Single shared call path — every method below funnels through here
        so timeout/error handling only lives in one place."""
        if not self.is_available:
            return None
        try:
            response = self._client.models.generate_content(
                model=self.model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=temperature,
                    max_output_tokens=max_output_tokens,
                ),
            )
            return (response.text or '').strip()
        except (ClientError, ServerError) as e:
            logger.error(f"Gemini API error: {e}")
            return None
        except Exception as e:
            logger.error(f"Gemini unexpected error: {e}")
            return None

    # ---- irrigation insights ----

    def generate_irrigation_insights(self, system_data, weather_data, predictions):
        """Generate natural language insights using Gemini."""
        prompt = self._create_insight_prompt(system_data, weather_data, predictions)
        insights = self._generate(prompt, temperature=0.7, max_output_tokens=500)
        if insights:
            return insights
        return self.fallback_insights(system_data, weather_data, predictions)

    def _create_insight_prompt(self, system_data, weather_data, predictions):
        return f"""As an irrigation expert, provide brief insights about this irrigation situation:

CURRENT STATUS:
- Soil Moisture: {system_data.get('current_moisture', 'N/A')}%
- Temperature: {system_data.get('temperature', 'N/A')}°C
- Weather: {weather_data.get('description', 'N/A')}
- Irrigation Needed: {predictions.get('irrigation_needed', False)}
- Confidence: {predictions.get('confidence', 0):.1%}

Provide 2-3 brief recommendations about irrigation timing and water management.
Keep it concise and practical."""

    # ---- reports ----

    def generate_detailed_report(self, historical_data, time_period="last week"):
        """Generate detailed analysis report using Gemini."""
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

        report = self._generate(prompt, temperature=0.3, max_output_tokens=800)
        if report:
            return report
        return self.fallback_report(historical_data, time_period)

    # ---- pattern analysis ----

    def analyze_irrigation_patterns(self, pattern_data):
        """Analyze irrigation patterns and suggest optimizations."""
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

        result = self._generate(prompt, temperature=0.6, max_output_tokens=400)
        return result or "Pattern analysis temporarily unavailable — check that GEMINI_API_KEY is set."

    # ---- weather-specific insights ----

    def generate_weather_insights(self, current_weather, forecast, irrigation_data):
        """Generate insights specifically framed around weather conditions."""
        prompt = f"""As an irrigation expert, explain how the current weather should affect irrigation decisions.

CURRENT WEATHER:
{json.dumps(current_weather, indent=2, default=str)}

FORECAST:
{json.dumps(forecast, indent=2, default=str) if forecast else 'Not available'}

RECENT IRRIGATION ACTIVITY:
{json.dumps(irrigation_data.get('metrics', {}), indent=2, default=str)}

Give 2-3 concise, practical recommendations for adjusting irrigation based on this weather."""

        result = self._generate(prompt, temperature=0.6, max_output_tokens=400)
        return result or "Weather-based insights unavailable — check that GEMINI_API_KEY is set."

    # ---- predictive scheduling ----

    def generate_predictive_schedule(self, forecast, zone_data, historical_data):
        """Suggest schedule adjustments based on the forecast. Returns a
        dict (this method never existed on ollama_service, so there's no
        prior return shape to match — designed fresh here)."""
        prompt = f"""As an irrigation expert, suggest schedule adjustments for the next few days given this forecast.

FORECAST:
{json.dumps(forecast, indent=2, default=str) if forecast else 'Not available'}

ZONES:
{json.dumps(zone_data, indent=2, default=str)}

RECENT HISTORY (most recent {min(len(historical_data), 10)} events):
{json.dumps(historical_data[:10], indent=2, default=str)}

Respond with 2-4 short, specific scheduling suggestions (e.g. 'skip Tuesday's cycle for Zone 2 — rain expected')."""

        narrative = self._generate(prompt, temperature=0.5, max_output_tokens=400)
        if narrative:
            return {
                'success': True,
                'narrative': narrative,
                'generated_at': datetime.now().isoformat(),
            }
        return {
            'success': False,
            'narrative': "Predictive scheduling unavailable — check that GEMINI_API_KEY is set.",
        }

    # ---- diagnostics ----

    def test_connection(self):
        """Quick connectivity check — used by the /ollama-status style debug routes."""
        if not self.is_available:
            return {"success": False, "error": "GEMINI_API_KEY not set"}
        result = self._generate("Say 'Hello' in one word.", temperature=0.1, max_output_tokens=10)
        if result is not None:
            return {"success": True, "response": result}
        return {"success": False, "error": "Gemini request failed — see server logs"}

    def get_available_models(self):
        """Kept for compatibility with routes that display 'available models' —
        Gemini doesn't have a local model list the way Ollama did, so this
        just reports the one currently configured."""
        return [{'name': self.model}] if self.is_available else []

    # ---- fallbacks (used when GEMINI_API_KEY is missing or a call fails) ----

    def fallback_insights(self, system_data, weather_data, predictions):
        insights = []

        moisture = system_data.get('current_moisture', 50)
        temp = weather_data.get('temperature', 25)
        rainfall = weather_data.get('rainfall', 0)
        humidity = weather_data.get('humidity', 60)

        if moisture < 25:
            insights.append(f"CRITICAL: Soil moisture extremely low ({moisture}%). Immediate irrigation required.")
        elif moisture < 35:
            insights.append(f"ALERT: Soil moisture low ({moisture}%). Schedule irrigation soon.")
        elif moisture > 80:
            insights.append(f"NOTE: Soil moisture high ({moisture}%). Consider reducing irrigation.")

        if rainfall > 15:
            insights.append(f"HEAVY RAIN: {rainfall}mm rainfall detected. Skip next 1-2 irrigation cycles.")
        elif rainfall > 5:
            insights.append(f"RAINFALL: {rainfall}mm rain recorded. Adjust irrigation duration by 30%.")

        if temp > 35:
            insights.append(f"HEAT: High temperature ({temp}°C). Increase irrigation frequency.")
        elif temp < 10:
            insights.append(f"COLD: Low temperature ({temp}°C). Reduce irrigation to prevent freezing.")

        if humidity < 30:
            insights.append(f"ARID CONDITIONS: Low humidity ({humidity}%). Plants need more frequent watering.")
        elif humidity > 85:
            insights.append(f"HUMID: High humidity ({humidity}%). Reduced evaporation allows longer intervals between watering.")

        if predictions.get('irrigation_needed'):
            conf = predictions.get('confidence', 0)
            water_rec = predictions.get('recommended_water', 0)
            insights.append(f"AI RECOMMENDATION: Irrigation needed ({int(conf * 100)}% confidence). Suggested water: {water_rec}L")

        return "\n".join(insights) if insights else "System operating within optimal parameters. Continue current schedule."

    def fallback_report(self, historical_data, time_period):
        total_water = historical_data.get('total_water_used', 0)
        irrigation_count = historical_data.get('irrigation_events', 0)
        avg_efficiency = historical_data.get('efficiency_score', 0.75)

        return f"""IRRIGATION SYSTEM ANALYTICS REPORT - {time_period.upper()}
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}

EXECUTIVE SUMMARY:
System performed at {avg_efficiency:.1%} efficiency during the reporting period.
Total water consumption: {total_water} liters across {irrigation_count} irrigation events.

KEY METRICS:
- Water Efficiency: {avg_efficiency:.1%}
- Total Irrigation Events: {irrigation_count}
- Average Water per Event: {total_water / max(irrigation_count, 1):.1f}L

RECOMMENDATIONS:
1. Maintain current irrigation schedule
2. Monitor soil moisture sensors regularly
3. Perform seasonal adjustment for temperature changes
4. Check for leak detection monthly

(This is a fallback report — set GEMINI_API_KEY in .env for AI-generated analysis.)"""


genai_service = GenAIService()
