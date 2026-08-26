"""
Nyuza — leaf disease/pest classifier training script
------------------------------------------------------
Fine-tunes a pretrained MobileNetV2 (transfer learning) on a PlantVillage-style
dataset. 

Class counts here are imbalanced (gray_leaf_spot has ~2.3x fewer images than
the others), so this script computes inverse-frequency class weights from the
train set and feeds them into the loss function automatically — no manual
step needed beyond having the folders above in place.

Usage:
    pip install torch torchvision --break-system-packages
    python train_leaf_model.py --data_dir data --epochs 10 --out leaf_model.pt
"""

import argparse
import copy
import time
from collections import Counter
from pathlib import Path

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from torchvision import datasets, models, transforms


def build_dataloaders(data_dir: str, batch_size: int, image_size: int):
    # Standard ImageNet normalization — required since it's using an
    # ImageNet-pretrained backbone.
    mean = [0.485, 0.456, 0.406]
    std = [0.229, 0.224, 0.225]

    train_tf = transforms.Compose([
        transforms.RandomResizedCrop(image_size, scale=(0.8, 1.0)),
        transforms.RandomHorizontalFlip(),
        transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2),
        transforms.ToTensor(),
        transforms.Normalize(mean, std),
    ])
    val_tf = transforms.Compose([
        transforms.Resize(int(image_size * 1.14)),
        transforms.CenterCrop(image_size),
        transforms.ToTensor(),
        transforms.Normalize(mean, std),
    ])

    train_ds = datasets.ImageFolder(Path(data_dir) / "train", transform=train_tf)
    val_ds = datasets.ImageFolder(Path(data_dir) / "val", transform=val_tf)

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, num_workers=2)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=2)

    return train_loader, val_loader, train_ds.classes


def compute_class_weights(train_ds, device):
    """
    Inverse-frequency class weights, so the loss penalizes mistakes on
    under-represented classes (e.g. gray_leaf_spot at ~410 images) more
    than mistakes on over-represented ones (e.g. common_rust at ~950) —
    otherwise the model can lower its loss just by leaning on whichever
    classes it saw the most during training.
    """
    counts = Counter(train_ds.targets)
    num_classes = len(train_ds.classes)
    total = sum(counts.values())

    # weight_i = total / (num_classes * count_i) — a standard inverse-frequency
    # formula: rarer classes (small count_i) get a larger weight.
    weights = [
        total / (num_classes * counts[i]) for i in range(num_classes)
    ]

    print("class weights (higher = rarer class, penalized more):")
    for cls_name, w in zip(train_ds.classes, weights):
        print(f"  {cls_name}: {w:.3f} (n={counts[train_ds.class_to_idx[cls_name]]})")

    return torch.tensor(weights, dtype=torch.float32).to(device)


def build_model(num_classes: int, freeze_backbone: bool = True):
    model = models.mobilenet_v2(weights=models.MobileNet_V2_Weights.IMAGENET1K_V2)

    if freeze_backbone:
        for param in model.features.parameters():
            param.requires_grad = False

    # Replace the classifier head for our number of classes.
    in_features = model.classifier[1].in_features
    model.classifier[1] = nn.Linear(in_features, num_classes)

    return model


def train(model, train_loader, val_loader, device, epochs: int, lr: float, class_weights=None):
    criterion = nn.CrossEntropyLoss(weight=class_weights)
    # Only the (unfrozen) parameters need an optimizer entry.
    optimizer = optim.Adam(
        (p for p in model.parameters() if p.requires_grad), lr=lr
    )

    best_acc = 0.0
    best_weights = copy.deepcopy(model.state_dict())

    for epoch in range(epochs):
        start = time.time()

        # --- train ---
        model.train()
        running_loss, running_correct, seen = 0.0, 0, 0
        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device)
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()

            preds = outputs.argmax(dim=1)
            running_loss += loss.item() * images.size(0)
            running_correct += (preds == labels).sum().item()
            seen += images.size(0)

        train_loss = running_loss / seen
        train_acc = running_correct / seen

        # --- validate ---
        model.eval()
        val_correct, val_seen = 0, 0
        with torch.no_grad():
            for images, labels in val_loader:
                images, labels = images.to(device), labels.to(device)
                outputs = model(images)
                preds = outputs.argmax(dim=1)
                val_correct += (preds == labels).sum().item()
                val_seen += images.size(0)

        val_acc = val_correct / val_seen if val_seen else 0.0

        if val_acc > best_acc:
            best_acc = val_acc
            best_weights = copy.deepcopy(model.state_dict())

        elapsed = time.time() - start
        print(
            f"epoch {epoch + 1}/{epochs}  "
            f"train_loss={train_loss:.4f}  train_acc={train_acc:.3f}  "
            f"val_acc={val_acc:.3f}  ({elapsed:.1f}s)"
        )

    model.load_state_dict(best_weights)
    print(f"best val accuracy: {best_acc:.3f}")
    return model


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data_dir", default="data", help="folder with train/ and val/ subfolders")
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch_size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--image_size", type=int, default=224)
    parser.add_argument("--out", default="leaf_model.pt")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"using device: {device}")

    train_loader, val_loader, classes = build_dataloaders(
        args.data_dir, args.batch_size, args.image_size
    )
    print(f"classes: {classes}")

    class_weights = compute_class_weights(train_loader.dataset, device)

    model = build_model(num_classes=len(classes)).to(device)
    model = train(model, train_loader, val_loader, device, args.epochs, args.lr, class_weights)

    # Save both the weights and the class list — the inference script needs
    # the class names to turn predictions back into labels.
    torch.save({"model_state": model.state_dict(), "classes": classes}, args.out)
    print(f"saved model to {args.out}")


if __name__ == "__main__":
    main()