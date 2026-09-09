"""
Nyuza — pest detection service
----------------------------------
Loads the corn pest classifier (aphid, army_worm, corn_borer,
potosia_brevitarsis, no_pest) trained via train_leaf_model.py on the IP102
corn subset. Structurally identical to disease_model_service.py — same
load-once pattern, same predict() shape — so vision_monitoring_service.py
can treat both models the same way via the shared 'is_negative' key.
"""

import os
import io

import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image


class PestModelService:
    # This model's "nothing wrong" class is 'no_pest', not 'healthy' —
    # that's the only meaningful difference from DiseaseModelService.
    NEGATIVE_CLASS = 'no_pest'

    def __init__(self):
        self.model_path = os.path.join('models', 'pest_model.pt')
        self.image_size = 224
        self.model = None
        self.classes = []
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.transform = self._build_transform()
        self.load_model()

    def _build_transform(self):
        mean = [0.485, 0.456, 0.406]
        std = [0.229, 0.224, 0.225]
        return transforms.Compose([
            transforms.Resize(int(self.image_size * 1.14)),
            transforms.CenterCrop(self.image_size),
            transforms.ToTensor(),
            transforms.Normalize(mean, std),
        ])

    def load_model(self):
        try:
            if not os.path.exists(self.model_path):
                print(f"⚠️  Pest model not found at {self.model_path} — "
                      f"pest detection disabled until it's placed there")
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
            print(f"✅ Pest model loaded successfully — classes: {self.classes}")

        except Exception as e:
            print(f"❌ Error loading pest model: {e}")
            self.model = None

    def is_ready(self):
        return self.model is not None

    def predict(self, image_bytes: bytes) -> dict:
        if not self.is_ready():
            raise RuntimeError(
                "Pest model is not loaded — check that models/pest_model.pt exists"
            )

        image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        tensor = self.transform(image).unsqueeze(0).to(self.device)

        with torch.no_grad():
            outputs = self.model(tensor)
            probabilities = torch.softmax(outputs, dim=1)[0]
            confidence, idx = probabilities.max(dim=0)

        predicted_class = self.classes[idx.item()]
        is_negative = predicted_class == self.NEGATIVE_CLASS

        return {
            'predicted_class': predicted_class,
            'confidence': round(confidence.item(), 4),
            'is_no_pest': is_negative,   # named to match this model's semantics
            'is_negative': is_negative,  # generic key: true = "nothing wrong"
            'model_version': 'pest_v1',
            'probabilities': {
                cls: round(p.item(), 4)
                for cls, p in zip(self.classes, probabilities)
            },
        }


# Global instance — loaded once when the Flask app imports this module.
pest_model_service = PestModelService()