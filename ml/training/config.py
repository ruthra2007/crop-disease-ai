from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
DATASET_DIR = ROOT_DIR / 'dataset'
OUTPUT_DIR = ROOT_DIR / 'output'
MODEL_PATH = OUTPUT_DIR / 'crop_disease_model.keras'
CLASS_NAMES_PATH = OUTPUT_DIR / 'class_names.json'
TRAINING_LOG_PATH = OUTPUT_DIR / 'training_log.csv'

IMG_SIZE = (224, 224)
BATCH_SIZE = 16
EPOCHS = 20
LEARNING_RATE = 1e-3
SEED = 42
VALIDATION_SPLIT = 0.10
TEST_SPLIT = 0.10
