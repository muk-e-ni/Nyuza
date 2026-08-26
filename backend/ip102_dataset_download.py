from pathlib import Path

import kagglehub

path = kagglehub.dataset_download('rtlmhjbn/ip102cropped')
print('Downloaded to:', path)

"""base = Path(path)  # reuse the path printed above
for item in sorted(base.rglob('*')):
    if item.is_dir():
        print(item.relative_to(base))"""


base = Path(path)  
target_classes = ['22', '23', '24', '25']

for split in ['train', 'val', 'test']:
    print(f"\n{split}:")
    for class_id in target_classes:
        folder = base / split / class_id
        count = len(list(folder.glob('*'))) if folder.exists() else 0
        print(f"  {class_id}: {count} images")

import shutil

pest_data_dest = Path("pest_data")

class_map = {
    "22": "corn_borer",
    "23": "army_worm",
    "24": "aphid",
    "25": "potosia_brevitarsis",
}

for split in ["train", "val"]:
    for class_id, class_name in class_map.items():
        src = base / split / class_id
        dst = pest_data_dest / split / class_name
        shutil.copytree(src, dst)
        count = len(list(dst.glob("*")))
        print(f"{split}/{class_name}: {count} images")