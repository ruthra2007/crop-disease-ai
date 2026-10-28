from __future__ import annotations

import os
from collections import Counter
from pathlib import Path

from PIL import Image


def inspect_dataset(root_dir: str | Path, limit_per_class: int | None = None) -> None:
    root = Path(root_dir)
    if not root.exists():
        raise FileNotFoundError(f"Dataset root not found: {root}")

    class_dirs = [d for d in root.iterdir() if d.is_dir()]
    print(f"Dataset root: {root}")
    print(f"Found class directories: {len(class_dirs)}")

    class_counts: Counter[str] = Counter()
    invalid_files: list[str] = []
    sample_summary: list[tuple[str, int, list[str]]] = []

    for class_dir in sorted(class_dirs):
        files = sorted(class_dir.iterdir())
        image_files = [f for f in files if f.is_file() and f.suffix.lower() in {'.jpg', '.jpeg', '.png', '.bmp'}]
        selected = image_files[:limit_per_class] if limit_per_class else image_files

        valid = 0
        dims: list[str] = []
        for img_path in selected:
            try:
                with Image.open(img_path) as img:
                    img.verify()
                valid += 1
                with Image.open(img_path) as img:
                    dims.append(f"{img.size[0]}x{img.size[1]}")
            except Exception:
                invalid_files.append(str(img_path))

        class_counts[class_dir.name] = valid
        sample_summary.append((class_dir.name, valid, dims[:5]))

    print("\nClass summary:")
    for name, count, dims in sample_summary:
        print(f"- {name}: {count} valid images | sample dims: {dims[:5]}")

    total_valid = sum(class_counts.values())
    print(f"\nTotal valid images: {total_valid}")

    if invalid_files:
        print(f"\nInvalid files found ({len(invalid_files)}):")
        for p in invalid_files[:20]:
            print(f"- {p}")
    else:
        print("\nNo invalid image files detected in this sample.")


if __name__ == "__main__":
    dataset_root = Path(__file__).resolve().parents[1] / 'dataset'
    inspect_dataset(dataset_root, limit_per_class=20)
