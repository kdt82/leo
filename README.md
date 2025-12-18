# Leonardo Bulk Studio

A production-ready application for bulk-generating images via the Leonardo.ai API.

## Features
- **Bulk Generation**: Submit 20+ prompts at once.
- **Reference Image Workflow**: Use an image to guide generations (Image Guidance).
- **Queue System**: Robust job tracking (Queued -> Processing -> Completed).
- **Local Storage**: Images saved to `outputs/YYYY-MM-DD/batch_...`.
- **API Key Security**: Keys stored locally in browser/localStorage (not sent to server storage in local mode).

## Prerequisites
- **Node.js 18+**
- **Python 3.10+** (or Docker)
- **Leonardo.ai API Key**

## Quick Start (Local)
Double-click `start.bat` to launch both Backend and Frontend.

> **Note**: If you encounter Python compatibility issues (e.g. with Python 3.14+), use the Docker method below.

## Docker Start (Recommended)
This method isolates the environment and guarantees dependencies work regardless of your local Python version.

1. Create a `.env` file in `backend/` (see `.env.example`).
2. Run:
   ```bash
   docker-compose up --build
   ```
3. Open http://localhost:5173

## Manual Start

### Backend
1. Navigate to `backend`
2. Create venv (in root): `python -m venv ../venv`
3. Activate: `../venv/Scripts/activate`
4. Install: `pip install -r requirements.txt`
5. Run: `uvicorn app.main:app --reload`

### Frontend
1. Navigate to `frontend`
2. Install: `npm install`
3. Run: `npm run dev`

## Usage
1. Open the web interface.
2. Enter your Leonardo API Key in the settings (or it will prompt you).
3. **Generate**:
   - Select a model (fetched from your account).
   - Enter prompts (one per line).
   - Adjust width, height, num images.
   - (Optional) Upload a reference image for image-to-image/controlnet flows.
   - Click **Start Batch**.
4. **Dashboard**:
   - Watch the progress of your generations.
   - Images appear as they complete.
   - Images are saved to your disk in `outputs/`.

## Project Structure
- `backend/`: FastAPI Python app
- `frontend/`: React + Vite + Tailwind app
- `outputs/`: Generated images and CSVs
