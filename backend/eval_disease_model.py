"""
Nyuza — disease model evaluation
------------------------------------
Loads a trained checkpoint (from leaf_disease_training.py) and reports per-class
precision/recall/F1 plus a confusion matrix on the validation set.


Usage:
    python eval_disease_model.py --data_dir data --model disease_model.pt
"""

import argparse
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torchvision import datasets, models, transforms
from sklearn.metrics import classification_report, confusion_matrix


def build_val_loader(data_dir: str, batch_size: int, image_size: int):
    mean = [0.485, 0.456, 0.406]
    std = [0.229, 0.224, 0.225]
    val_tf = transforms.Compose([
        transforms.Resize(int(image_size * 1.14)),
        transforms.CenterCrop(image_size),
        transforms.ToTensor(),
        transforms.Normalize(mean, std),
    ])
    val_ds = datasets.ImageFolder(Path(data_dir) / "val", transform=val_tf)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=2)
    return val_loader, val_ds.classes


def load_model(model_path: str, device):
    checkpoint = torch.load(model_path, map_location=device)
    classes = checkpoint["classes"]

    model = models.mobilenet_v2()
    in_features = model.classifier[1].in_features
    model.classifier[1] = nn.Linear(in_features, len(classes))
    model.load_state_dict(checkpoint["model_state"])
    model.to(device)
    model.eval()

    return model, classes


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data_dir", default="data")
    parser.add_argument("--model", default="leaf_model.pt")
    parser.add_argument("--batch_size", type=int, default=32)
    parser.add_argument("--image_size", type=int, default=224)
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model, classes = load_model(args.model, device)
    val_loader, ds_classes = build_val_loader(args.data_dir, args.batch_size, args.image_size)
    assert classes == ds_classes, "checkpoint classes don't match the val folder classes — wrong data_dir?"

    all_preds, all_labels = [], []
    with torch.no_grad():
        for images, labels in val_loader:
            images = images.to(device)
            outputs = model(images)
            preds = outputs.argmax(dim=1).cpu()
            all_preds.extend(preds.tolist())
            all_labels.extend(labels.tolist())

    print("\nPer-class report:")
    print(classification_report(all_labels, all_preds, target_names=classes, digits=3))

    print("Confusion matrix (rows = actual, columns = predicted):")
    print("classes:", classes)
    cm = confusion_matrix(all_labels, all_preds)
    for cls_name, row in zip(classes, cm):
        print(f"  {cls_name:>20}: {row}")


if __name__ == "__main__":
    main()