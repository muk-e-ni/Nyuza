from pathlib import Path

from shutil import copytree

copytree("data/train/healthy", "pest_data/train/no_pest")
copytree("data/val/healthy", "pest_data/val/no_pest")

for split in [ "train", "val"]:
    folder =Path("pest_data") / split / "no_pest"
    print(f"{split}/no_pest: {len(list(folder.glob("*")))}")

    