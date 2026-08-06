from config import get_database_connection

def execute_query(query, params=None):
    conn = get_database_connection()
    if not conn:
        return None
    
    cursor = conn.cursor(dictionary=True)
    cursor.execute(query, params or ())

    result = cursor.fetchall()
    cursor.close()
    conn.close()
    return result

def insert_data(query, params =None):
    conn=get_database_connection()
    if not conn:
        return False
    cursor = conn.cursor()
    cursor.execute(query, params or ())
    conn.commit()
    cursor.close()
    conn.close()
    return True
