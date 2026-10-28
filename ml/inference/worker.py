from __future__ import annotations

import base64
import io
import json
import os
import sys
from pathlib import Path

os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '2')

import numpy as np
import tensorflow as tf
from PIL import Image, ImageOps, UnidentifiedImageError

ML_DIR = Path(__file__).resolve().parents[1]
MODEL_PATH = ML_DIR / 'output' / 'crop_disease_model.keras'
CLASS_NAMES_PATH = ML_DIR / 'output' / 'class_names.json'
IMAGE_SIZE = (224, 224)
CROP_PREFIXES = {
    'tomato': ('Tomato_',),
    'potato': ('Potato___',),
    'pepper': ('Pepper__bell___',),
}


def load_model_and_classes():
    with CLASS_NAMES_PATH.open(encoding='utf-8') as class_file:
        class_names = json.load(class_file)

    for device in tf.config.list_physical_devices('GPU'):
        try:
            tf.config.experimental.set_memory_growth(device, True)
        except RuntimeError:
            pass

    model = tf.keras.models.load_model(MODEL_PATH, compile=False)
    if model.output_shape[-1] != len(class_names):
        raise ValueError('Model output does not match class names.')
    return model, class_names


def predict_image(model, class_names, encoded_image, crop='auto'):
    image_bytes = base64.b64decode(encoded_image, validate=True)
    with Image.open(io.BytesIO(image_bytes)) as source:
        image = ImageOps.exif_transpose(source).convert('RGB')
        image = image.resize(IMAGE_SIZE, Image.Resampling.BILINEAR)
        array = np.asarray(image, dtype=np.float32) / 255.0

    probabilities = model(np.expand_dims(array, axis=0), training=False).numpy()[0]
    if crop not in {'auto', *CROP_PREFIXES}:
        raise ValueError('Unsupported crop filter.')
    class_indices = [
        index for index, class_name in enumerate(class_names)
        if crop == 'auto' or class_name.startswith(CROP_PREFIXES[crop])
    ]
    top_indices = sorted(
        class_indices, key=lambda index: probabilities[index], reverse=True
    )[:3]
    top_predictions = [
        {
            'class_name': class_names[int(index)],
            'confidence': float(probabilities[index]),
        }
        for index in top_indices
    ]
    return {
        'prediction': top_predictions[0]['class_name'],
        'confidence': top_predictions[0]['confidence'],
        'top_predictions': top_predictions,
        'crop_filter': crop,
    }


def main():
    model, class_names = load_model_and_classes()
    print(json.dumps({'type': 'ready'}), flush=True)

    for line in sys.stdin:
        request = None
        try:
            request = json.loads(line)
            result = predict_image(
                model, class_names, request['image'], request.get('crop', 'auto')
            )
            response = {'id': request['id'], 'result': result}
        except (UnidentifiedImageError, OSError, ValueError) as error:
            response = {
                'id': request.get('id') if request else None,
                'error': 'The uploaded file is not a readable image.',
            }
        except Exception as error:
            print(f'Prediction error: {error}', file=sys.stderr, flush=True)
            response = {
                'id': request.get('id') if request else None,
                'error': 'Model prediction failed.',
            }
        print(json.dumps(response), flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'Model worker failed to start: {error}', file=sys.stderr, flush=True)
        raise