from flask import Blueprint, request, jsonify, render_template, redirect, url_for, session, flash
from werkzeug.security import generate_password_hash, check_password_hash
from config import database
from utils.database_utils import execute_query
import re
from models import User, AdminLog, Sensors, IrrigationZone, SystemSettings
from datetime import datetime, timedelta, timezone
from functools import wraps
import jwt, os, time
from dotenv import load_dotenv

load_dotenv()

auth_bp = Blueprint('auth', __name__)

JWT_SECRET_KEY = os.getenv('SECRET_KEY', '')
JWT_ALGORITHM = 'HS256'

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None

        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '): 
            token = auth_header.split(' ')[1]

        if not token:
            return jsonify({'success': False, 'error': 'Token is missing'}), 401
        
        try:
            payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
            request.user_id = payload.get('user_id')
            request.user_role = payload.get('role')

            print(f"JWT DEBUG - User ID: {request.user_id}, Role: {request.user_role}")

        except jwt.ExpiredSignatureError:
            return jsonify({'success': False, 'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'success': False, 'error': 'Invalid token'}), 401
        except Exception as e:
            return jsonify({'success': False, 'error': 'Token verification failed'}), 401

        return f(*args, **kwargs)      
    return decorated

# Helper function for email validation
def validate_email(email):
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

# Helper function for input validation
def validate_registration_data(username, email, password, role):
    errors = []
    
    # Username validation
    if not username or len(username.strip()) < 3:
        errors.append('Username must be at least 3 characters long')
    elif not re.match(r'^[a-zA-Z0-9_]+$', username):
        errors.append('Username can only contain letters, numbers, and underscores')
    
    # Email validation
    if not email:
        errors.append('Email is required')
    elif not validate_email(email):
        errors.append('Please enter a valid email address')
    
    # Password validation
    if not password:
        errors.append('Password is required')
    elif len(password) < 6:
        errors.append('Password must be at least 6 characters long')
    
    # Role validation
    valid_roles = ['user', 'admin']
    if role not in valid_roles:
        errors.append('Invalid role specified')
    
    return errors

# ---------- Registration (API) ----------
@auth_bp.route('/api/register', methods=['POST'])
def register():
    try:
        # Get JSON data from React frontend
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'message': 'No data provided'
            }), 400
        
        username = data.get('username', '').strip()
        email = data.get('email', '').strip()
        password = data.get('password', '')
        role = data.get('role', 'user')  # Default to 'user' if not specified
        
        # Validate input data
        validation_errors = validate_registration_data(username, email, password, role)
        if validation_errors:
            return jsonify({
                'success': False,
                'message': 'Validation failed',
                'errors': validation_errors
            }), 400
        
        # Check if user already exists
        existing_user = User.query.filter(
            (User.username == username) | (User.email == email)
        ).first()

        if existing_user:
            return jsonify({
                'success': False,
                'message': 'Username or email already exists'
            }), 409
        
        # Create new user - PASSWORD WILL BE HASHED by User.set_password() method
        new_user = User(username=username, email=email, type=role)
        new_user.set_password(password)  # This hashes the password

        database.session.add(new_user)
        database.session.commit()

        return jsonify({
            'success': True,
            'message': 'Registration successful! Please log in.',
            'user': {
                'id': new_user.user_id,
                'username': new_user.username,
                'email': new_user.email,
                'role': new_user.type
            }
        }), 201

    except Exception as e:
        database.session.rollback()
        return jsonify({
            'success': False,
            'message': 'An error occurred during registration',
            'error': str(e)
        }), 500

# ---------- Login (API) ----------
@auth_bp.route('/api/login', methods=['POST'])
def login():
    try:
        # Get JSON data from React frontend
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'message': 'No data provided'
            }), 400
        
        login_identifier = data.get('login', '').strip()
        password = data.get('password', '')
        
        # Validate input
        if not login_identifier:
            return jsonify({
                'success': False,
                'message': 'Email or username is required'
            }), 400
        
        if not password:
            return jsonify({
                'success': False,
                'message': 'Password is required'
            }), 400
        
        # Query user by either username or email
        user = User.query.filter(
            (User.username == login_identifier) | (User.email == login_identifier)
        ).first()

        # Validate user and password - check_password_hash is used here
        if not user or not user.check_password(password):
            return jsonify({
                'success': False,
                'message': 'Invalid email/username or password'
            }), 401
        
        secret_key = os.getenv('SECRET_KEY', '')
        expiration_time = int(time.time()) + (24 * 60 * 60)
        
        print("🔍 [LOGIN DEBUG] Creating JWT token...")   
        
        token = jwt.encode({
            'user_id': user.user_id,
            'role': user.type,
            'exp': expiration_time,
        }, secret_key, algorithm='HS256')  # 
        
        print(f"🔍 [LOGIN DEBUG] Token created: {token[:50]}...")
        print(f"🔍 [LOGIN DEBUG] Expiration timestamp: {expiration_time}")
        # Store user info in session
        session['user_id'] = user.user_id
        session['role'] = user.type
        session['username'] = user.username
        
        # Log admin login
        if user.type == 'admin':
            # will create a log_admin_action function here
            print(f"Admin login: {user.username}")
        
        return jsonify({
            'success': True,
            'message': f'Welcome back, {user.username}!',
            'token': token,
            'user': {
                'id': user.user_id,
                'username': user.username,
                'email': user.email,
                'role': user.type,
                'is_admin': user.type == 'admin',
                'phone_number': user.phone_number,
                'profile_picture': user.profile_picture,
                'date_registered': user.date_registered.isoformat() if user.date_registered else None
            }
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'message': 'An error occurred during login',
            'error': str(e)
        }), 500

# NOTE: this route is currently unreachable — the frontend's authAPI.updateProfile
# calls PUT /profile/api/profile, which resolves to profile_update_routes.py's
# update_profile() instead (profile_bp is mounted at /profile, this auth_bp
# route lives under /auth). Kept in sync anyway in case that ever changes,
# but the live logic to edit is in profile_update_routes.py.
@auth_bp.route('/api/profile', methods=['PUT'])
@token_required
def update_profile():
    try:
        data = request.get_json()
        user_id = request.user_id
        
        user = User.query.get(user_id)
        if not user:
            return jsonify({'success': False, 'message': 'User not found'}), 404
        
        # Update username if provided
        if 'username' in data:
            user.username = data['username']

        # Update phone/contact number if provided
        if 'phone_number' in data:
            user.phone_number = data['phone_number']
        
        # Update password if provided
        if 'new_password' in data and 'current_password' in data:
            # Verify current password
            if not user.check_password(data['current_password']):
                return jsonify({'success': False, 'message': 'Current password is incorrect'}), 400
            
            user.set_password(data['new_password'])
        
        # Update preferences (you might want to store these in a separate table)
        # user.preferences = {
        #     'notifications': data.get('notifications', True),
        #     'language': data.get('language', 'en'),
        #     'timezone': data.get('timezone', 'Africa/Nairobi')
        # }
        
        database.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Profile updated successfully',
            'user': {
                'id': user.user_id,
                'username': user.username,
                'email': user.email,
                'phone_number': user.phone_number
            }
        })
        
    except Exception as e:
        database.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500
    
# ---------- Logout (API) ----------
@auth_bp.route('/api/logout', methods=['POST'])
def logout():
    try:
        # Clear the session
        session.clear()
        return jsonify({
            'success': True,
            'message': 'Logged out successfully'
        }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'message': 'An error occurred during logout',
            'error': str(e)
        }), 500

# ---------- Check Auth Status (API) ----------
@auth_bp.route('/api/check-auth', methods=['GET'])
def check_auth():
    try:
        if 'user_id' in session:
            user = User.query.get(session['user_id'])
            if user:
                return jsonify({
                    'success': True,
                    'authenticated': True,
                    'user': {
                        'id': user.user_id,
                        'username': user.username,
                        'email': user.email,
                        'role': user.type,
                        'is_admin': user.type == 'admin'
                    }
                }), 200
        
        return jsonify({
            'success': True,
            'authenticated': False,
            'message': 'Not authenticated'
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'message': 'An error occurred while checking authentication status',
            'error': str(e)
        }), 500

# ---------- Get Current User (API) ----------
@auth_bp.route('/api/current-user', methods=['GET'])
def get_current_user():
    try:
        if 'user_id' not in session:
            return jsonify({
                'success': False,
                'message': 'Not authenticated'
            }), 401
        
        user = User.query.get(session['user_id'])
        if not user:
            return jsonify({
                'success': False,
                'message': 'User not found'
            }), 404
        
        return jsonify({
            'success': True,
            'user': {
                'id': user.user_id,
                'username': user.username,
                'email': user.email,
                'role': user.type,
                'is_admin': user.type == 'admin'
            }
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'message': 'An error occurred while fetching user data',
            'error': str(e)
        }), 500



# ---------- Registration (Template) ----------
@auth_bp.route('/register', methods=['GET', 'POST'])
def register_template():
    if request.method == 'POST':
        username = request.form['username']
        email = request.form['email']
        password = request.form['password']
        role = request.form['role']

        if not username or not email or not password:
            flash('All fields are required!', "error")
            return render_template('register.html')

        existing_user = User.query.filter(
            (User.username == username) | (User.email == email)
        ).first()

        if existing_user:
            flash("Username or email already exists", "error")
            return render_template('register.html')

        new_user = User(username=username, email=email, type=role)
        new_user.set_password(password)  # Password is hashed here

        database.session.add(new_user)
        database.session.commit()

        flash("Registration successful! Please log in.", "success")
        return redirect(url_for("auth.login_template"))

    return render_template('register.html')

# ---------- Login (Template) ----------
@auth_bp.route('/login', methods=['GET', 'POST'])
def login_template():
    if request.method == 'POST':
        username_or_email = request.form.get('username_or_email', '').strip()
        password = request.form.get('password', '').strip()

        if not username_or_email or not password:
            flash("Please fill in all fields.", "error")
            return render_template('login.html')

        user = User.query.filter(
            (User.username == username_or_email) | (User.email == username_or_email)
        ).first()

        # Password verification using check_password_hash
        if not user or not user.check_password(password):
            flash("Invalid username/email or password.", "error")
            return render_template('login.html')

        session['user_id'] = user.user_id
        session['role'] = user.type
        session['username'] = user.username

        flash(f"Welcome back, {user.username}!", "success")
        return redirect(url_for("auth.dashboard"))

    return render_template('login.html')

# ---------- Dashboard (Template) ----------
@auth_bp.route('/dashboard')
def dashboard():
    if 'user_id' not in session:
        flash("Please log in first.", "error")
        return redirect(url_for('auth.login_template'))

    if session['role'] == 'admin':
        return render_template('admin_dashboard.html')
    else:
        return render_template('user_dashboard.html')