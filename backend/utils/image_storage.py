"""
Nyuza — plant health image storage
--------------------------------------
Saves captured/uploaded leaf images to disk so real image data accumulates
over time. exactly what's needed once a human-verification step exists to label them properly.
"""

import os
from datetime import datetime

IMAGE_DIR = os.path.join('static', 'plant_health_images')


def save_plant_image(image_bytes: bytes, user_id, predicted_class: str) -> str:
    """Save raw image bytes to disk and return the relative path to store
    in the DB. Filename encodes user, predicted class, and timestamp so
    images are easy to browse/sort later, even before any human labeling
    step exists."""
    os.makedirs(IMAGE_DIR, exist_ok=True)

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S_%f')
    filename = f"user{user_id}_{predicted_class}_{timestamp}.jpg"
    filepath = os.path.join(IMAGE_DIR, filename)

    with open(filepath, 'wb') as f:
        f.write(image_bytes)

    return filepath