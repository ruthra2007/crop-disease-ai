from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image
from sklearn.model_selection import train_test_split

from config import DATASET_DIR, IMG_SIZE, SEED, TEST_SPLIT, VALIDATION_SPLIT


def load_dataset():
    image_paths = []
    labels = []

    class_dirs = sorted([p for p in DATASET_DIR.iterdir() if p.is_dir()])
    if not class_dirs:
        raise FileNotFoundError(f'No class directories found in {DATASET_DIR}')

    class_names = [d.name for d in class_dirs]
    class_to_idx = {name: idx for idx, name in enumerate(class_names)}

    for class_dir in class_dirs:
        for img_path in sorted(class_dir.glob('*')):
            if img_path.suffix.lower() not in {'.jpg', '.jpeg', '.png', '.bmp'}:
                continue
            image_paths.append(str(img_path))
            labels.append(class_to_idx[class_dir.name])

    if len(image_paths) == 0:
        raise ValueError(f'No image files were found in {DATASET_DIR}')

    X_train, X_temp, y_train, y_temp = train_test_split(
        image_paths,
        labels,
        test_size=TEST_SPLIT + VALIDATION_SPLIT,
        random_state=SEED,
        stratify=labels,
    )

    X_val, X_test, y_val, y_test = train_test_split(
        X_temp,
        y_temp,
        test_size=(TEST_SPLIT / (TEST_SPLIT + VALIDATION_SPLIT)),
        random_state=SEED,
        stratify=y_temp,
    )

    return X_train, X_val, X_test, y_train, y_val, y_test, class_names


def preprocess_image(path: str, target_size: tuple[int, int] = IMG_SIZE):
    image = Image.open(path).convert('RGB')
    image = image.resize(target_size)
    array = np.asarray(image, dtype=np.float32) / 255.0
    return array


def make_tf_dataset(paths, labels, batch_size, num_classes, is_training=False):
    import tensorflow as tf

    dataset = tf.data.Dataset.from_tensor_slices((paths, labels))
    if is_training:
        dataset = dataset.shuffle(
            buffer_size=len(paths), seed=SEED, reshuffle_each_iteration=True
        )

    def load_image(path, label):
        image = tf.io.decode_image(
            tf.io.read_file(path), channels=3, expand_animations=False
        )
        image.set_shape((None, None, 3))
        image = tf.image.resize(image, IMG_SIZE)
        image = tf.cast(image, tf.float32) / 255.0
        return image, tf.one_hot(label, depth=num_classes)

    dataset = dataset.map(load_image, num_parallel_calls=tf.data.AUTOTUNE)
    return dataset.batch(batch_size).prefetch(tf.data.AUTOTUNE)


def save_class_names(class_names: list[str]):
    with open(Path(__file__).resolve().parents[1] / 'output' / 'class_names.json', 'w', encoding='utf-8') as f:
        json.dump(class_names, f, indent=2)
