import smtplib
import requests
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from twilio.rest import Client
import os
from datetime import datetime
from models import NotificationLog, UserPreferences, User, database

class NotificationService:
    def __init__(self):
        self.smtp_host = os.getenv('SMTP_HOST', 'smtp.gmail.com')
        self.smtp_port = int(os.getenv('SMTP_PORT', 587))
        self.smtp_username = os.getenv('SMTP_USERNAME')
        self.smtp_password = os.getenv('SMTP_PASSWORD')
        
        # Twilio for SMS
        self.twilio_account_sid = os.getenv('TWILIO_ACCOUNT_SID')
        self.twilio_auth_token = os.getenv('TWILIO_AUTH_TOKEN')
        self.twilio_phone_number = os.getenv('TWILIO_PHONE_NUMBER')
        
        # Push notification service (OneSignal example)
        self.onesignal_app_id = os.getenv('ONESIGNAL_APP_ID')
        self.onesignal_api_key = os.getenv('ONESIGNAL_API_KEY')

    def send_notification(self, user_id, title, message, notification_type='info', methods=None):
        """Send notification through user's preferred methods"""
        try:
            user = User.query.get(user_id)
            if not user:
                print(f"User {user_id} not found")
                return False

            # Get user's notification preferences
            user_preferences = UserPreferences.query.filter_by(user_id=user_id).first()

            if methods:
                # Use provided methods
                user_methods = methods
            elif user_preferences and user_preferences.notification_methods:
                # Use preferences from UserPreferences
                user_methods = user_preferences.notification_methods
            else:
                # Default methods
                user_methods = {'web': True, 'email': False, 'sms': False, 'push': False}
            results = {
                'web': False,
                'email': False,
                'sms': False,
                'push': False
            }

            # Always send web notification (stored in database)
            results['web'] = self._store_web_notification(user_id, title, message, notification_type)

            # Send via other methods based on user preferences
            if user_methods.get('email') and getattr(user, 'email', None):
                results['email'] = self._send_email_notification(user.email, title, message)
            
            if user_methods.get('sms') and getattr(user, 'phone_number', None):
                results['sms'] = self._send_sms_notification(user.phone_number, message)
            
            if user_methods.get('push'):
                results['push'] = self._send_push_notification(user_id, title, message)

            # Log the notification
            self._log_notification(user_id, title, message, notification_type, results)
            
            return any(results.values())
            
        except Exception as e:
            print(f"Error sending notification: {e}")
            return False

    def _store_web_notification(self, user_id, title, message, notification_type):
        """Store notification in database for web dashboard"""
        try:
            notification = NotificationLog(
                user_id=user_id,
                title=title,
                message=message,
                notification_type=notification_type,
                sent_via='web',
                status='delivered',
                created_at=datetime.now()
            )
            database.session.add(notification)
            database.session.commit()
            return True
        except Exception as e:
            print(f"Error storing web notification: {e}")
            database.session.rollback()
            return False

    def _send_email_notification(self, email, title, message):
        """Send email notification"""
        try:
            if not all([self.smtp_username, self.smtp_password, email]):
                print("Email configuration incomplete")
                return False

            # Create message
            msg = MIMEMultipart()
            msg['From'] = self.smtp_username
            msg['To'] = email
            msg['Subject'] = f"🌱 Smart Irrigation: {title}"

            # Create HTML email
            html = f"""
            <html>
            <body>
                <h2>Smart Irrigation System Alert</h2>
                <h3>{title}</h3>
                <p>{message}</p>
                <hr>
                <p><small>Sent from your Smart Irrigation System</small></p>
            </body>
            </html>
            """
            
            msg.attach(MIMEText(html, 'html'))

            # Send email
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_username, self.smtp_password)
                server.send_message(msg)
            
            print(f"Email notification sent to {email}")
            return True
            
        except Exception as e:
            print(f"Error sending email notification: {e}")
            return False
    def _send_sms_notification(self, phone_number, message):
        """Send SMS notification using Twilio"""
        try:
            if not all([self.twilio_account_sid, self.twilio_auth_token, self.twilio_phone_number, phone_number]):
                print("SMS configuration incomplete")
                return False

            client = Client(self.twilio_account_sid, self.twilio_auth_token)
            
            # Format phone number to E.164 format
            formatted_phone = self._format_phone_number(phone_number)
            if not formatted_phone:
                print(f"Invalid phone number format: {phone_number}")
                return False
            
            # Truncate message for SMS
            sms_message = message[:160] if len(message) > 160 else message
            
            message_obj = client.messages.create(
                body=f"🌱 Irrigation Alert: {sms_message}",
                from_=self.twilio_phone_number,
                to=formatted_phone
            )
            
            print(f"SMS notification sent to {formatted_phone}")
            return True
            
        except Exception as e:
            print(f"Error sending SMS notification: {e}")
            return False
    def _format_phone_number(self, phone_number):
        """Format phone number to E.164 format"""
        try:
            # Remove any non-digit characters
            cleaned = ''.join(filter(str.isdigit, str(phone_number)))
            
            # Handle Kenyan numbers (assuming +254 country code)
            if cleaned.startswith('0'):
                # Convert 07... to +2547...
                return '+254' + cleaned[1:]
            elif cleaned.startswith('254'):
                # Convert 254... to +254...
                return '+' + cleaned
            elif cleaned.startswith('+254'):
                # Already in correct format
                return cleaned
            else:
                # Unknown format, return as is and let Twilio handle validation
                return '+' + cleaned
        except Exception as e:
            print(f"Error formatting phone number {phone_number}: {e}")
            return None
    def _send_push_notification(self, user_id, title, message):
        """Send push notification using OneSignal"""
        try:
            if not all([self.onesignal_app_id, self.onesignal_api_key]):
                print("Push notification configuration incomplete")
                return False

            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Basic {self.onesignal_api_key}"
            }
            
            payload = {
                "app_id": self.onesignal_app_id,
                "include_external_user_ids": [str(user_id)],
                "headings": {"en": title},
                "contents": {"en": message},
                "data": {"notification_type": "irrigation_alert"},
                "url": "http://localhost:3000/dashboard"  # Your frontend URL
            }
            
            response = requests.post(
                "https://onesignal.com/api/v1/notifications",
                json=payload,
                headers=headers
            )
            
            success = response.status_code == 200
            if success:
                print(f"Push notification sent to user {user_id}")
            else:
                print(f"Push notification failed: {response.text}")
            
            return success
            
        except Exception as e:
            print(f"Error sending push notification: {e}")
            return False

    def _log_notification(self, user_id, title, message, notification_type, results):
        """Log notification attempt"""
        try:
            sent_via = ','.join([method for method, success in results.items() if success])
            status = 'delivered' if any(results.values()) else 'failed'
            
            log = NotificationLog(
                user_id=user_id,
                title=title,
                message=message,
                notification_type=notification_type,
                sent_via=sent_via,
                status=status,
                created_at=datetime.now()
            )
            database.session.add(log)
            database.session.commit()
            print(f"Notification logged: {title} via {sent_via} - {status}")
        except Exception as e:
            print(f"Error logging notification: {e}")
            database.session.rollback()

    def send_system_alert(self, alert_type, details, user_id=None):
        """Send system-wide alerts"""
        alerts = {
            'low_water': {
                'title': 'Low Water Level Alert',
                'message': f'Water tank level is low: {details}% remaining. Consider refilling soon.'
            },
            'sensor_failure': {
                'title': 'Sensor Failure Detected',
                'message': f'Sensor {details} has stopped reporting data. Please check connection.'
            },
            'irrigation_failure': {
                'title': 'Irrigation System Issue',
                'message': f'Irrigation system encountered an issue: {details}'
            },
            'high_water_usage': {
                'title': 'High Water Usage Alert',
                'message': f'Unusually high water usage detected: {details}L used today.'
            },
            'moisture_low': {
                'title': 'Low Soil Moisture Alert',
                'message': f'Soil moisture is critically low: {details}%. Immediate irrigation needed.'
            },
            'weather_alert': {
                'title': 'Weather Alert',
                'message': f'Weather condition detected: {details}. Irrigation schedule adjusted.'
            }
        }
        
        if alert_type in alerts:
            alert = alerts[alert_type]
            if user_id:
                return self.send_notification(user_id, alert['title'], alert['message'], 'warning')
            else:
                # Send to all active users
                users = User.query.filter_by(is_active=True).all()
                results = []
                for user in users:
                    result = self.send_notification(user.user_id, alert['title'], alert['message'], 'warning')
                    results.append(result)
                return any(results)
        
        return False

    def test_notification(self, user_id, method):
        """Test specific notification method"""
        test_messages = {
            'email': 'This is a test email notification from your Smart Irrigation System.',
            'sms': 'Test SMS from Smart Irrigation System.',
            'push': 'Test push notification from your irrigation system.'
        }
        
        if method in test_messages:
            methods = {method: True}  # Only test the specified method
            return self.send_notification(
                user_id, 
                'Test Notification', 
                test_messages[method], 
                'info', 
                methods
            )
        
        return False

    def send_critical_alert(self, user_id, title, message):
        """Send critical alert that bypasses user preferences"""
        # For critical alerts, always try email and SMS if available
        user = User.query.get(user_id)
        if user:
            methods = {
                'web': True,
                'email': bool(getattr(user, 'email', None)),
                'sms': bool(getattr(user, 'phone_number', None)),
                'push': True
            }
            return self.send_notification(user_id, title, message, 'critical', methods)
        return False

# Global instance
notification_service = NotificationService()