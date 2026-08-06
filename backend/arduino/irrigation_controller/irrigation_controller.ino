// Pins Definition
const int RAIN_SENSOR_PIN = 5;
const int SOIL_MOISTURE_ANALOG_PIN = A0;  // analog pin
const int SOIL_MOISTURE_DIGITAL_PIN = 7;   //digital as backup
const int ULTRASONIC_TRIG_PIN = 2;
const int ULTRASONIC_ECHO_PIN = 3;
const int RELAY_PIN = 6;

// Sensor Configuration
const bool RAIN_SENSOR_ACTIVE = LOW;
const bool SOIL_DRY_SENSOR_ACTIVE = LOW;

// Soil Moisture Calibration - cane be ADJUSTED  FOR THE SENSOR
const int SOIL_MOISTURE_DRY = 100;    // Value in dry soil (air)
const int SOIL_MOISTURE_WET = 280;    // Value in wet soil (water)
const int SOIL_MOISTURE_THRESHOLD = 40; // Auto irrigation threshold (percentage)

// Manual Irrigation Control
bool manualIrrigationInProgress = false;
unsigned long manualIrrigationStartTime = 0;
unsigned long manualIrrigationDuration = 0;

// Auto Mode Control
bool autoMode = true; // Start with auto mode enabled
bool autoIrrigationInProgress = false;
unsigned long autoIrrigationStartTime = 0;
unsigned long autoIrrigationDuration = 120000; // 5 minutes default for auto

// Sensor Values Storage
struct SensorData {
  bool isRaining;
  bool soilIsDry;
  int soilMoistureAnalog;
  int soilMoisturePercentage;
  float waterLevel;
  bool hasLowWater;
  bool pumpStatus;
  bool needsIrrigation;
};

SensorData currentData;

void setup() {
  // Initialize pins
  pinMode(RAIN_SENSOR_PIN, INPUT_PULLUP);
  pinMode(SOIL_MOISTURE_DIGITAL_PIN, INPUT_PULLUP);
  pinMode(SOIL_MOISTURE_ANALOG_PIN, INPUT);
  pinMode(ULTRASONIC_TRIG_PIN, OUTPUT);
  pinMode(ULTRASONIC_ECHO_PIN, INPUT);
  pinMode(RELAY_PIN, OUTPUT);
  
  // Ensure pump is off initially
  digitalWrite(RELAY_PIN, HIGH);
  
  // Initialize serial communication
  Serial.begin(9600);
  
  // Wait for serial connection
  while (!Serial) {
    delay(10);
  }
  
  // Clear any startup messages from buffer
  Serial.flush();
  
  Serial.println("🌱 Smart Irrigation System Started");
  Serial.println("Auto Mode: ENABLED");
}

void loop() {
  // Read all sensors
  readAllSensors();
  
  // Auto mode logic
  if (autoMode && !manualIrrigationInProgress) {
    checkAutoIrrigation();
  }
  
  // Process serial commands from backend
  processSerialCommands();
  
  // Check irrigation timeouts
  checkIrrigationTimeouts();
  
  delay(2000); // Read every 2 seconds
}

void readAllSensors() {
  // Read rain sensor
  bool rainSensorValue = digitalRead(RAIN_SENSOR_PIN);
  currentData.isRaining = (rainSensorValue == RAIN_SENSOR_ACTIVE);
  
  // Read soil moisture - ANALOG (primary)
  currentData.soilMoistureAnalog = analogRead(SOIL_MOISTURE_ANALOG_PIN);
  currentData.soilMoisturePercentage = calculateMoisturePercentage(currentData.soilMoistureAnalog);
  
  // Read soil moisture - DIGITAL (backup)
  bool soilSensorValue = digitalRead(SOIL_MOISTURE_DIGITAL_PIN);
  currentData.soilIsDry = (soilSensorValue == SOIL_DRY_SENSOR_ACTIVE);
  
  // Read water level using ultrasonic sensor
  currentData.waterLevel = readWaterLevel();
  currentData.hasLowWater = (currentData.waterLevel > 10); // Low water if distance > 10cm
  
  // Determine if irrigation is needed (for auto mode)
  currentData.needsIrrigation = (
    currentData.soilMoisturePercentage < SOIL_MOISTURE_THRESHOLD && 
    !currentData.isRaining && 
    !currentData.hasLowWater
  );
}

int calculateMoisturePercentage(int analogValue) {
  // Ensure value is within calibration range
  analogValue = constrain(analogValue, SOIL_MOISTURE_WET, SOIL_MOISTURE_DRY);
  
  // Convert to percentage (inverted because higher analog = drier)
  int percentage = 100 - ((analogValue - SOIL_MOISTURE_WET) * 100) / (SOIL_MOISTURE_DRY - SOIL_MOISTURE_WET);
  
  return constrain(percentage, 0, 100);
}

float readWaterLevel() {
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(ULTRASONIC_TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);
  
  long duration = pulseIn(ULTRASONIC_ECHO_PIN, HIGH, 30000);
  
  if (duration == 0) {
    return -1.0; // Error reading
  }
  
  float distance = duration * 0.0343 / 2;
  return distance;
}

void startIrrigation() {
  digitalWrite(RELAY_PIN, LOW); // Turn ON pump
  currentData.pumpStatus = true;
}

void stopIrrigation() {
  digitalWrite(RELAY_PIN, HIGH); // Turn OFF pump
  currentData.pumpStatus = false;
}

void startManualIrrigation(unsigned long duration) {
  if (manualIrrigationInProgress || autoIrrigationInProgress) {
    Serial.println("MANUAL_START_FAILED: Irrigation already in progress");
    sendSensorDataJSON();
    return;
  }
  
  manualIrrigationInProgress = true;
  manualIrrigationStartTime = millis();
  manualIrrigationDuration = duration;
  
  startIrrigation();
  Serial.println("MANUAL_STARTED: " + String(duration) + "ms");
  sendSensorDataJSON();
}

void startAutoIrrigation(unsigned long duration) {
  if (manualIrrigationInProgress || autoIrrigationInProgress) {
    return; // Don't interrupt manual irrigation
  }
  
  autoIrrigationInProgress = true;
  autoIrrigationStartTime = millis();
  autoIrrigationDuration = duration;
  
  startIrrigation();
  
  // Send immediate notification to backend
  Serial.println("AUTO_IRRIGATION_STARTED:" + String(duration));
  
  Serial.println("AUTO_STARTED: " + String(duration) + "ms");
  sendSensorDataJSON();
}

void checkAutoIrrigation() {
  // Check if conditions are met for auto irrigation
  if (currentData.needsIrrigation && !autoIrrigationInProgress && !manualIrrigationInProgress) {
    startAutoIrrigation(autoIrrigationDuration);
  }
}

void checkIrrigationTimeouts() {
  unsigned long currentTime = millis();
  
  // Check manual irrigation timeout
  if (manualIrrigationInProgress && 
      (currentTime - manualIrrigationStartTime >= manualIrrigationDuration)) {
    stopIrrigation();
    manualIrrigationInProgress = false;
    Serial.println("MANUAL_COMPLETED");
    sendSensorDataJSON();
  }
  
  // Check auto irrigation timeout
  if (autoIrrigationInProgress && 
      (currentTime - autoIrrigationStartTime >= autoIrrigationDuration)) {
    stopIrrigation();
    autoIrrigationInProgress = false;
    Serial.println("AUTO_COMPLETED");
    sendSensorDataJSON();
  }
}

void processSerialCommands() {
  if (Serial.available() > 0) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    
    if (command == "GET_DATA") {
      sendSensorDataJSON();
    } 
    else if (command.startsWith("START_MANUAL:")) {
      // Format: START_MANUAL:300000 (duration in milliseconds)
      int colonIndex = command.indexOf(':');
      if (colonIndex != -1) {
        String durationStr = command.substring(colonIndex + 1);
        unsigned long duration = durationStr.toInt();
        startManualIrrigation(duration);
      }
    }
    else if (command == "STOP_IRRIGATION") {
      stopIrrigation();
      manualIrrigationInProgress = false;
      autoIrrigationInProgress = false;
      Serial.println("IRRIGATION_STOPPED");
      sendSensorDataJSON();
    }
    else if (command == "AUTO_ON") {
      autoMode = true;
      Serial.println("AUTO_MODE: ON");
      sendSensorDataJSON();
    }
    else if (command == "AUTO_OFF") {
      autoMode = false;
      Serial.println("AUTO_MODE: OFF");
      sendSensorDataJSON();
    }
    else if (command == "CALIBRATE_SOIL") {
      // Send current analog value for calibration
      Serial.print("CALIBRATION: Soil analog value = ");
      Serial.println(currentData.soilMoistureAnalog);
    }
    else if (command.startsWith("SET_AUTO_DURATION:")) {
      // Set auto irrigation duration: SET_AUTO_DURATION:300000
      int colonIndex = command.indexOf(':');
      if (colonIndex != -1) {
        String durationStr = command.substring(colonIndex + 1);
        autoIrrigationDuration = durationStr.toInt();
        Serial.println("AUTO_DURATION_SET: " + String(autoIrrigationDuration) + "ms");
      }
    }
  }
}

void sendSensorDataJSON() {
  Serial.print("{");
  Serial.print("\"is_raining\":"); Serial.print(currentData.isRaining ? "true" : "false");
  Serial.print(",\"soil_is_dry\":"); Serial.print(currentData.soilIsDry ? "true" : "false");
  Serial.print(",\"soil_moisture_analog\":"); Serial.print(currentData.soilMoistureAnalog);
  Serial.print(",\"soil_moisture_percentage\":"); Serial.print(currentData.soilMoisturePercentage);
  Serial.print(",\"water_level\":"); Serial.print(currentData.waterLevel, 2);
  Serial.print(",\"pump_status\":"); Serial.print(currentData.pumpStatus ? "true" : "false");
  Serial.print(",\"has_low_water\":"); Serial.print(currentData.hasLowWater ? "true" : "false");
  Serial.print(",\"needs_irrigation\":"); Serial.print(currentData.needsIrrigation ? "true" : "false");
  Serial.print(",\"manual_irrigation_in_progress\":"); Serial.print(manualIrrigationInProgress ? "true" : "false");
  Serial.print(",\"auto_irrigation_in_progress\":"); Serial.print(autoIrrigationInProgress ? "true" : "false");
  Serial.print(",\"auto_mode\":"); Serial.print(autoMode ? "true" : "false");
  
  if (manualIrrigationInProgress) {
    unsigned long remaining = manualIrrigationDuration - (millis() - manualIrrigationStartTime);
    Serial.print(",\"manual_remaining_time\":"); Serial.print(remaining);
  }
  
  if (autoIrrigationInProgress) {
    unsigned long remaining = autoIrrigationDuration - (millis() - autoIrrigationStartTime);
    Serial.print(",\"auto_remaining_time\":"); Serial.print(remaining);
  }
  
  Serial.println("}");
}