import os
from dotenv import load_dotenv
from flask_sqlalchemy import SQLAlchemy 
from urllib.parse import quote_plus

load_dotenv()

database = SQLAlchemy()

def get_db_conn(app):
    user = os.getenv("user")
    password = os.getenv("password")
    host = os.getenv("Host")
    db_name = os.getenv("database")

    if not all([user, password, host, db_name]):
        raise ValueError("Missing required database environment variables")

    encoded_password = quote_plus(password)

    app.config["SQLALCHEMY_DATABASE_URI"] = f"mysql+pymysql://{user}:{encoded_password}@{host}/{db_name}"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "fallback-secret-key")

    # Initialize the database with the app
    database.init_app(app)
    
    # RETURN the database object
    return database

def get_database_connection():
    try:
        import mysql.connector
        cn = mysql.connector.connect(
            host=os.getenv("Host"),
            user=os.getenv("user"),
            password=os.getenv("password"),
            database=os.getenv("database"),
        )
        return cn
    except Exception as err:
        print(f"Error: {err}")
        return None