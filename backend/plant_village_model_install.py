#import kagglehub
#path=kagglehub.dataset_download('abdallahalidev/plantvillage-dataset')
#print(f"downloaded: {path}")

# base = Path(r"C:\Users\USER\.cache\kagglehub\datasets\abdallahalidev\plantvillage-dataset\versions\3\plantvillage dataset\color") - belongs under import

""" 
from pathlib import Path
import shutil


for folder in sorted(base.iterdir()):
    if "Corn" in folder.name:
        print(folder.name)

dest = Path("corn_raw")

class_map = {
    "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot": "gray_leaf_spot",
    "Corn_(maize)___Common_rust_": "common_rust",
    "Corn_(maize)___Northern_Leaf_Blight": "northern_leaf_blight",
    "Corn_(maize)___healthy": "healthy",

}

for src_name, dest_name in class_map.items():
    src_path = base / src_name
    dest_path = dest / dest_name 

    shutil.copytree(src_path, dest_path)
    count = len(list(dest_path.glob("*")))
    print(f"{dest_name}: {count} images") """

#import splitfolders 

#splitfolders.ratio("corn_raw", output="data", seed = 42, ratio = (.8, .2))

from pathlib import Path

for split in ["train", "val"]:
    print(f"\n{split}:")
    split_path = Path("data") / split
    for class_dir in sorted(split_path.iterdir()):
        count = len(list(class_dir.glob("*")))
        print(f"  {class_dir.name}: {count}")