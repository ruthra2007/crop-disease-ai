from __future__ import annotations

import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import tensorflow as tf
from sklearn.metrics import classification_report, confusion_matrix

TRAINING_DIR = Path(__file__).resolve().parents[1] / 'training'
sys.path.insert(0, str(TRAINING_DIR))

from config import BATCH_SIZE, MODEL_PATH, OUTPUT_DIR
from dataset_loader import load_dataset, make_tf_dataset


def main():
    _, _, test_paths, _, _, test_labels, class_names = load_dataset()
    test_dataset = make_tf_dataset(
        test_paths, test_labels, BATCH_SIZE, len(class_names)
    )
    model = tf.keras.models.load_model(MODEL_PATH, compile=False)
    probabilities = model.predict(test_dataset, verbose=1)
    predicted_labels = np.argmax(probabilities, axis=1)
    matrix = confusion_matrix(
        test_labels, predicted_labels, labels=np.arange(len(class_names))
    )
    report = classification_report(
        test_labels,
        predicted_labels,
        labels=np.arange(len(class_names)),
        target_names=class_names,
        output_dict=True,
        zero_division=0,
    )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    report_path = OUTPUT_DIR / 'evaluation.json'
    report_path.write_text(
        json.dumps({
            'test_samples': len(test_labels),
            'accuracy': report['accuracy'],
            'classification_report': report,
            'class_names': class_names,
            'confusion_matrix': matrix.tolist(),
        }, indent=2),
        encoding='utf-8',
    )
    np.savetxt(
        OUTPUT_DIR / 'confusion_matrix.csv', matrix, delimiter=',', fmt='%d',
        header=','.join(class_names), comments='',
    )

    figure, axis = plt.subplots(figsize=(11, 9))
    image = axis.imshow(matrix, cmap='YlGnBu')
    axis.set(
        xticks=np.arange(len(class_names)),
        yticks=np.arange(len(class_names)),
        xticklabels=class_names,
        yticklabels=class_names,
        xlabel='Predicted class',
        ylabel='True class',
        title='Crop disease model confusion matrix',
    )
    plt.setp(axis.get_xticklabels(), rotation=45, ha='right', rotation_mode='anchor')
    threshold = matrix.max() / 2
    for row in range(matrix.shape[0]):
        for column in range(matrix.shape[1]):
            axis.text(
                column, row, str(matrix[row, column]),
                ha='center', va='center',
                color='white' if matrix[row, column] > threshold else 'black',
            )
    figure.colorbar(image, ax=axis, label='Test images')
    figure.tight_layout()
    figure.savefig(OUTPUT_DIR / 'confusion_matrix.png', dpi=160)
    plt.close(figure)

    print(f"Test accuracy: {report['accuracy']:.4f} ({len(test_labels)} images)")
    print(classification_report(
        test_labels,
        predicted_labels,
        labels=np.arange(len(class_names)),
        target_names=class_names,
        zero_division=0,
    ))
    print(f'Evaluation saved to: {report_path}')


if __name__ == '__main__':
    main()