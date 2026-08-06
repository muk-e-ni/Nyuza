import React, { useState } from 'react';
import { authAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import './Auth.css'; // We'll create this CSS file

const Login = () => {
  const [formData, setFormData] = useState({ 
    login: '', 
    password: '' 
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  // Validation rules
  const validateField = (name, value) => {
    const newErrors = { ...errors };
    
    switch (name) {
      case 'login':
        if (!value.trim()) {
          newErrors.login = 'Email or username is required';
        } else if (value.length < 3) {
          newErrors.login = 'Must be at least 3 characters';
        } else {
          delete newErrors.login;
        }
        break;
        
      case 'password':
        if (!value) {
          newErrors.password = 'Password is required';
        } else if (value.length < 6) {
          newErrors.password = 'Password must be at least 6 characters';
        } else {
          delete newErrors.password;
        }
        break;
        
      default:
        break;
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Validate field on change
    validateField(name, value);
  };

  const validateForm = () => {
    const validations = [
      validateField('login', formData.login),
      validateField('password', formData.password)
    ];
    return validations.every(valid => valid);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    
    if (!validateForm()) {
      setErrors(prev => ({
        ...prev,
        form: 'Please fix the errors above'
      }));
      return;
    }
    
    setIsLoading(true);
    
    try {
      const response = await authAPI.login(formData);
      login(response.data.token, response.data.user);
      navigate('/dashboard');
    } catch (error) {
      if (error.response && error.response.data) {
        setErrors({ form: error.response.data.message });
      } else {
        setErrors({ form: 'Login failed. Please try again.' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleBlur = (e) => {
    validateField(e.target.name, e.target.value);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Login to Irrigation System</h2>
        <p className="auth-subtitle">Use your email or username</p>
        
        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="login">Email or Username</label>
            <input
              type="text"
              id="login"
              name="login"
              value={formData.login}
              onChange={handleChange}
              onBlur={handleBlur}
              className={errors.login ? 'error' : ''}
              placeholder="Enter your email or username"
              disabled={isLoading}
              required
            />
            {errors.login && <span className="error-message">{errors.login}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              onBlur={handleBlur}
              className={errors.password ? 'error' : ''}
              placeholder="Enter your password"
              disabled={isLoading}
              required
            />
            {errors.password && <span className="error-message">{errors.password}</span>}
          </div>

          {errors.form && <div className="error-message form-error">{errors.form}</div>}

          <button 
            type="submit" 
            className="auth-button"
            disabled={isLoading || Object.keys(errors).length > 0}
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="auth-footer">
          <p>Don't have an account? <Link to="/register">Sign up here</Link></p>
        </div>
      </div>
    </div>
  );
};

export default Login;