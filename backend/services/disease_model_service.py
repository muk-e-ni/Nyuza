"""
Nyuza — disease detection service
------------------------------------
Loads the corn disease classifier trained by train_leaf_model.py and exposes
a predict() method for the vision routes to call.

Follows the same load-once-at-startup pattern as services/ml_engine.py:
a single global instance is created at the bottom of this file and imported
wherever it's needed, so the model is loaded into memory exactly once, not
on every request.
"""

import os
import io

import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image


class DiseaseModelService:
    def __init__(self):
        self.model_path = os.path.join('models', 'leaf_model.pt')
        self.image_size = 224
        self.model = None
        self.classes = []
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.transform = self._build_transform()
        self.load_model()

    def _build_transform(self):
        # Must match the eval-time transform used in train_leaf_model.py /
        # eval_disease_model.py — same resize/crop/normalize, no augmentation.
        mean = [0.485, 0.456, 0.406]
        std = [0.229, 0.224, 0.225]
        return transforms.Compose([
            transforms.Resize(int(self.image_size * 1.14)),
            transforms.CenterCrop(self.image_size),
            transforms.ToTensor(),
            transforms.Normalize(mean, std),
        ])

    def load_model(self):
        """Load the trained checkpoint. If it's missing, log a clear warning
        and leave the service in a 'not ready' state rather than crashing the
        whole Flask app on startup — the rest of Nyuza should keep working
        even if this one model file hasn't been placed yet."""
        try:
            if not os.path.exists(self.model_path):
                print(f"⚠️  Disease model not found at {self.model_path} — "
                      f"vision detection disabled until it's placed there")
                return

            checkpoint = torch.load(self.model_path, map_location=self.device)
            self.classes = checkpoint['classes']

            model = models.mobilenet_v2()
            in_features = model.classifier[1].in_features
            model.classifier[1] = nn.Linear(in_features, len(self.classes))
            model.load_state_dict(checkpoint['model_state'])
            model.to(self.device)
            model.eval()

            self.model = model
            print(f"✅ Disease model loaded successfully — classes: {self.classes}")

        except Exception as e:
            print(f"❌ Error loading disease model: {e}")
            self.model = None

    def is_ready(self):
        return self.model is not None

    def predict(self, image_bytes: bytes) -> dict:
        """
        image_bytes: raw bytes of an uploaded image file (jpg/png).
        Returns predicted_class, confidence (0-1), is_healthy, and the full
        per-class probability breakdown.
        """
        if not self.is_ready():
            raise RuntimeError(
                "Disease model is not loaded — check that models/disease_model.pt exists"
            )

        image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        tensor = self.transform(image).unsqueeze(0).to(self.device)

        with torch.no_grad():
            outputs = self.model(tensor)
            probabilities = torch.softmax(outputs, dim=1)[0]
            confidence, idx = probabilities.max(dim=0)

        predicted_class = self.classes[idx.item()]

        return {
            'predicted_class': predicted_class,
            'confidence': round(confidence.item(), 4),
            'is_healthy': predicted_class == 'healthy',
            'probabilities': {
                cls: round(p.item(), 4)
                for cls, p in zip(self.classes, probabilities)
            },
        }


disease_model_service = DiseaseModelService()