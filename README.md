# Leonardo Bulk Studio

A production-ready application for bulk-generating images via the Leonardo.ai API.

## Features
- **Bulk Generation**: Submit 20+ prompts at once.
- **Reference Image Workflow**: Use an image to guide generations (Image Guidance).
- **Queue System**: Robust job tracking (Queued -> Processing -> Completed).
- **Local Storage**: Images saved to `outputs/YYYY-MM-DD/batch_...`.
- **Gallery View**: Browse, tag, and export generated images.
- **Prompt Enhancement**: AI-powered prompt improvement using OpenAI.
- **Password Authentication**: Protect your instance with a simple password.

## Quick Start (Local Development)

### Prerequisites
- **Node.js 18+**
- **Python 3.10+**
- **Leonardo.ai API Key**

### Run Locally
1. Double-click `start.bat` to launch both Backend and Frontend.
2. Open http://localhost:5173

> **Note**: For local development, no authentication is required unless `AUTH_PASSWORD` is set.

---

## Production Deployment (Docker + Traefik)

### Prerequisites
- A VPS with Docker and Docker Compose installed
- A domain pointing to your server (e.g., `leo.yourdomain.com`)
- Leonardo AI API key

### Deployment Steps

1. **Clone the repository** to your server:
   ```bash
   git clone https://github.com/yourusername/LeonardoNFT.git
   cd LeonardoNFT
   ```

2. **Create your `.env` file** from the example:
   ```bash
   cp .env.example .env
   nano .env
   ```

3. **Configure `.env`** with your values:
   ```env
   # Domain & SSL
   DOMAIN=leo.yourdomain.com
   ACME_EMAIL=admin@yourdomain.com

   # Database
   POSTGRES_PASSWORD=your-secure-db-password

   # Authentication
   AUTH_PASSWORD=your-app-password
   AUTH_SECRET_KEY=generate-a-random-32-char-string

   # Leonardo AI
   VITE_LEONARDOAI_API_KEY=your-leonardo-api-key

   # OpenAI (optional)
   VITE_OPENAI_API_KEY=your-openai-key
   ```

4. **Deploy**:
   ```bash
   docker-compose up -d --build
   ```

5. **Check logs**:
   ```bash
   docker-compose logs -f
   ```

6. **Access your app** at `https://leo.yourdomain.com`

### Updating

To update to the latest version:
```bash
git pull
docker-compose up -d --build
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Traefik (HTTPS, SSL, Routing)                                  │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (React + Vite → Static Nginx)                         │
├─────────────────────────────────────────────────────────────────┤
│  Backend (FastAPI + Python)                                     │
│  - JWT Authentication                                           │
│  - Async Queue Manager                                          │
│  - Leonardo AI Client                                           │
├─────────────────────────────────────────────────────────────────┤
│  PostgreSQL (Persistent Storage)                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DOMAIN` | Your domain (e.g., `leo.example.com`) | Yes |
| `ACME_EMAIL` | Email for Let's Encrypt SSL | Yes |
| `POSTGRES_PASSWORD` | Database password | Yes |
| `AUTH_PASSWORD` | App login password | Yes (production) |
| `AUTH_SECRET_KEY` | JWT signing key (32+ chars) | Yes (production) |
| `VITE_LEONARDOAI_API_KEY` | Leonardo AI API key | Yes |
| `VITE_OPENAI_API_KEY` | OpenAI API key | No |
| `VITE_OPENAI_MODEL` | OpenAI model (default: gpt-4o-mini) | No |

---

## Security Notes

- **Never commit `.env` files** - they contain secrets
- The `.gitignore` is configured to exclude all `.env` files
- Authentication uses JWT tokens stored in httpOnly cookies
- All traffic is encrypted via HTTPS (Let's Encrypt)

---

## Manual Start (Development)

### Backend
```bash
cd backend
python -m venv ../venv
../venv/Scripts/activate  # Windows
source ../venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## Project Structure
- `backend/` - FastAPI Python application
- `frontend/` - React + Vite + Tailwind application
- `outputs/` - Generated images and CSVs (excluded from git)
- `docker-compose.yml` - Production deployment configuration
- `.env.example` - Environment variable template

---

## License
MIT
