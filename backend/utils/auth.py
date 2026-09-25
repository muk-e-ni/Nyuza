"""
Shared JWT auth decorator. Several route files (irrigations_routes.py,
vision_routes.py, etc.) each have their own private copy of this same
decorator — this file existed as an empty stub, apparently meant to hold
it, so new route files (sensor_routes.py, system_routes.py) use this
shared version instead of adding yet another copy. The existing
per-file copies are left as-is for now — consolidating those too is a
reasonable future cleanup, not done here to avoid touching already-working
code that isn't part of what's being fixed right now.
"""

import os
import jwt
from functools import wraps
from flask import request, jsonify
from dotenv import load_dotenv

load_dotenv()

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
        except jwt.ExpiredSignatureError:
            return jsonify({'success': False, 'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'success': False, 'error': 'Invalid token'}), 401
        except Exception:
            return jsonify({'success': False, 'error': 'Token verification failed'}), 401

        return f(*args, **kwargs)
    return decorated
