# Crop Disease AI

CropAI is a React and Express prototype that scores pepper, potato, and tomato leaf images with a custom CNN trained on PlantVillage.

## Run locally

The Keras model runs in the WSL Ubuntu environment. Express exposes `/api/predict` and keeps a model worker loaded after the first prediction.

1. Copy `server/.env.example` to `server/.env`, set `ML_WSL_PYTHON` to the Python executable in the WSL environment containing TensorFlow, choose a private `CROP_OWNER_EMAIL` and strong `CROP_OWNER_PASSWORD`, and replace `JWT_SECRET` with at least 32 random characters (generate one with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`).
2. Start the backend and frontend with `npm run dev`.
3. Open the Vite URL printed in the terminal, then browse, drag, or paste (Ctrl+V) a JPG, PNG, or WebP image up to 8 MB.

The prediction endpoint accepts multipart form data with an `image` field and returns the top three model outputs. Prediction records retain the original model label separately from any reviewed label and appear in the owner's searchable analysis history.

CropAI is configured for one owner account using the `CROP_OWNER_EMAIL`, `CROP_OWNER_PASSWORD`, and `JWT_SECRET` environment values. API requests use an HTTP-only session cookie, and prediction queries, image access, review, and deletion are scoped to that owner. Existing records without an owner are intentionally hidden; back them up and manually set their `ownerId` to the normalized `CROP_OWNER_EMAIL` before exposing them to the signed-in account.

Images analyzed by the app are normalized to JPEG and stored under `server/uploads` using generated filenames; that directory is excluded from Git. The analysis history shows the saved image, model score, and label-review state. AI labels are provisional. A user can confirm or correct a label in the history, including marking an image as an unknown/new disease. The classifier only covers its nine trained classes and cannot reliably detect unseen diseases. Only reviewed labels are suitable as future training examples; do not automatically train on unreviewed model guesses.

The dashboard charts and summary values are calculated from the signed-in owner's actual MongoDB prediction records. Reports are generated from the selected saved result and include its stored model outputs, image (when available), and class guidance (when available). Display score bands are provisional UI guidance, not validated model calibration.

## Model evaluation

Run `ml/evaluation/evaluate_model.py` from the project's Python environment. It evaluates the deterministic held-out test split and writes `evaluation.json`, `confusion_matrix.csv`, and `confusion_matrix.png` to `ml/output`.

Metrics are a research baseline, not a field diagnosis. The model can be overconfident and should be checked against local field photos before operational use.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: MongoDB + Mongoose
- AI: TensorFlow/Keras custom CNN, invoked through a persistent WSL worker
