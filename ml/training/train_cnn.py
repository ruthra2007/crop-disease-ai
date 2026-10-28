from __future__ import annotations

import json
from pathlib import Path

import tensorflow as tf
from tensorflow import keras

from config import BATCH_SIZE, EPOCHS, IMG_SIZE, LEARNING_RATE, MODEL_PATH, OUTPUT_DIR
from dataset_loader import load_dataset, make_tf_dataset, save_class_names


def build_model(num_classes: int):
    inputs = keras.Input(shape=(IMG_SIZE[0], IMG_SIZE[1], 3))

    x = keras.layers.Conv2D(32, (3, 3), padding='same', kernel_initializer='he_normal')(inputs)
    x = keras.layers.BatchNormalization()(x)
    x = keras.layers.ReLU()(x)
    x = keras.layers.MaxPooling2D((2, 2))(x)

    x = keras.layers.Conv2D(64, (3, 3), padding='same', kernel_initializer='he_normal')(x)
    x = keras.layers.BatchNormalization()(x)
    x = keras.layers.ReLU()(x)
    x = keras.layers.MaxPooling2D((2, 2))(x)

    x = keras.layers.Conv2D(128, (3, 3), padding='same', kernel_initializer='he_normal')(x)
    x = keras.layers.BatchNormalization()(x)
    x = keras.layers.ReLU()(x)
    x = keras.layers.MaxPooling2D((2, 2))(x)

    x = keras.layers.Conv2D(256, (3, 3), padding='same', kernel_initializer='he_normal')(x)
    x = keras.layers.BatchNormalization()(x)
    x = keras.layers.ReLU()(x)
    x = keras.layers.GlobalAveragePooling2D()(x)
    x = keras.layers.Dense(128, activation='relu')(x)
    x = keras.layers.Dropout(0.4)(x)
    outputs = keras.layers.Dense(num_classes, activation='softmax')(x)

    model = keras.Model(inputs, outputs)
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=LEARNING_RATE),
        loss='categorical_crossentropy',
        metrics=['accuracy'],
    )
    return model


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    x_train_paths, x_val_paths, x_test_paths, y_train, y_val, y_test, class_names = load_dataset()
    save_class_names(class_names)

    train_dataset = make_tf_dataset(
        x_train_paths, y_train, BATCH_SIZE, len(class_names), is_training=True
    )
    val_dataset = make_tf_dataset(x_val_paths, y_val, BATCH_SIZE, len(class_names))
    test_dataset = make_tf_dataset(x_test_paths, y_test, BATCH_SIZE, len(class_names))

    model = build_model(len(class_names))
    model.summary()

    history = model.fit(
        train_dataset,
        validation_data=val_dataset,
        epochs=EPOCHS,
        verbose=1,
    )

    test_loss, test_acc = model.evaluate(test_dataset, verbose=0)
    print(f'Test accuracy: {test_acc:.4f}')
    print(f'Test loss: {test_loss:.4f}')

    model.save(MODEL_PATH)
    print(f'Model saved to: {MODEL_PATH}')

    metrics_path = OUTPUT_DIR / 'history.json'
    with open(metrics_path, 'w', encoding='utf-8') as f:
        json.dump({
            'history': history.history,
            'test_accuracy': float(test_acc),
            'test_loss': float(test_loss),
        }, f, indent=2)

    print('Training complete.')


if __name__ == '__main__':
    main()
