import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
import joblib
import os
from datetime import datetime, timedelta
from models import SensorReadings, IrrigationLog, WeatherData

class MLEngine:
    def __init__(self):
        self.model_path = 'models/irrigation_model.joblib'
        self.scaler_path = 'models/scaler.joblib'
        self.input_size = 10
        self.model = None
        self.scaler = None
        self.load_or_train_model()
    
    def load_or_train_model(self):
        """Load existing model or train a new one"""
        try:
            if os.path.exists(self.model_path) and os.path.exists(self.scaler_path):
                self.model = joblib.load(self.model_path)
                self.scaler = joblib.load(self.scaler_path)
                print("✅ ML model loaded successfully")
            else:
                print("🔄 Training new ML model...")
                self.train_model()
        except Exception as e:
            print(f"❌ Error loading model: {e}")
            self.train_model()
    
    def train_model(self):
        """Train the ML model with realistic data"""
        try:
            # Generate realistic training data
            X, y = self.generate_training_data()
            
            # Split data
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.2, random_state=42
            )
            
            # Scale features
            self.scaler = StandardScaler()
            X_train_scaled = self.scaler.fit_transform(X_train)
            X_test_scaled = self.scaler.transform(X_test)
            
            # Train model
            self.model = RandomForestClassifier(
                n_estimators=100,
                max_depth=10,
                random_state=42,
                n_jobs=-1
            )
            
            self.model.fit(X_train_scaled, y_train)
            
            # Save model
            os.makedirs('models', exist_ok=True)
            joblib.dump(self.model, self.model_path)
            joblib.dump(self.scaler, self.scaler_path)
            
            # Calculate accuracy
            accuracy = self.model.score(X_test_scaled, y_test)
            print(f"✅ Model trained with accuracy: {accuracy:.2%}")
            
        except Exception as e:
            print(f"❌ Error training model: {e}")
            self.setup_fallback_model()
    
    def generate_training_data(self, n_samples=2000):
        """Generate realistic training data based on irrigation rules"""
        np.random.seed(42)
        
        # Feature columns: [moisture, temp, humidity, rainfall, wind_speed, hour, is_day, month, soil_type, crop_type]
        X = np.zeros((n_samples, self.input_size))
        y = np.zeros(n_samples)
        
        for i in range(n_samples):
            # Generate realistic feature values
            moisture = np.random.uniform(10, 90)
            temp = np.random.uniform(5, 40)
            humidity = np.random.uniform(20, 95)
            rainfall = np.random.exponential(2)
            wind_speed = np.random.exponential(3)
            hour = np.random.randint(0, 24)
            is_day = 1 if 6 <= hour <= 18 else 0
            month = np.random.randint(1, 13)
            soil_type = np.random.choice([0, 1, 2])  # 0=sandy, 1=loamy, 2=clay
            crop_type = np.random.choice([0, 1, 2])  # 0=vegetables, 1=fruits, 2=flowers
            
            X[i] = [moisture, temp, humidity, rainfall, wind_speed, hour, is_day, month, soil_type, crop_type]
            
            # Define irrigation rules (this is what the model will learn)
            needs_water = (
                (moisture < 30) or
                (moisture < 40 and temp > 30) or
                (moisture < 50 and temp > 25 and humidity < 40) or
                (rainfall < 1 and moisture < 45 and temp > 20)
            )
            
            y[i] = 1 if needs_water else 0
        
        return X, y
    
    def setup_fallback_model(self):
        """Setup a simple rule-based fallback model"""
        class FallbackModel:
            def predict_proba(self, X):
                # Simple rule-based probabilities
                probas = []
                for features in X:
                    moisture = features[0]
                    temp = features[1]
                    humidity = features[2]
                    
                    # Enhanced fallback logic
                    if moisture < 25:
                        probas.append([0.1, 0.9])  # 90% chance needs water
                    elif moisture < 35:
                        probas.append([0.3, 0.7])
                    elif moisture < 45 and temp > 25:
                        probas.append([0.5, 0.5])
                    else:
                        probas.append([0.8, 0.2])
                return np.array(probas)
            
            def predict(self, X):
                probas = self.predict_proba(X)
                return (probas[:, 1] > 0.5).astype(int)
        
        self.model = FallbackModel()
        self.scaler = StandardScaler()  # Dummy scaler
    
    def predict_irrigation_need(self, features):
        """Predict if irrigation is needed and return confidence"""
        try:
            if self.scaler and hasattr(self.scaler, 'transform'):
                features_scaled = self.scaler.transform([features])
            else:
                features_scaled = [features]
            
            if hasattr(self.model, 'predict_proba'):
                probability = self.model.predict_proba(features_scaled)[0][1]
                prediction = probability > 0.5
                confidence = probability if prediction else 1 - probability
            else:
                # Enhanced fallback rule-based decision
                moisture = features[0]
                temp = features[1]
                humidity = features[2]
                
                if moisture < 25:
                    prediction = True
                    confidence = 0.95
                elif moisture < 35:
                    prediction = True
                    confidence = 0.75
                elif moisture < 45 and temp > 25 and humidity < 50:
                    prediction = True
                    confidence = 0.6
                else:
                    prediction = False
                    confidence = 0.8
            
            return prediction, confidence
            
        except Exception as e:
            print(f"❌ Prediction error: {e}")
            # Enhanced fallback
            moisture = features[0] if len(features) > 0 else 50
            prediction = moisture < 35
            confidence = 0.7 if prediction else 0.6
            return prediction, confidence

# Global instance
ml_engine = MLEngine()