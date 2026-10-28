# Machine Learning

The custom CNN covers nine pepper, potato, and tomato classes. Keep the original dataset in `ml/dataset`, with one class per folder.

## Inspect and train

```bash
python ml/inspection/inspect_dataset.py
python ml/training/train_cnn.py
```

For GPU training on Windows, run these commands inside the configured WSL environment with TensorFlow's CUDA dependencies installed.

## Evaluate

```bash
python ml/evaluation/evaluate_model.py
```

Evaluation reproduces the seeded train/validation/test split and writes per-class precision/recall, a confusion matrix CSV/PNG, and aggregate metrics to `ml/output`.

The Express API starts the persistent worker in `ml/inference/worker.py`. It loads `ml/output/crop_disease_model.keras` and `ml/output/class_names.json` once, then returns the top three class scores for each upload.
