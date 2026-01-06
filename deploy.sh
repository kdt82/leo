#!/bin/bash
# Leonardo Bulk Studio - Server Deployment Script
# Run this on your server to set up the application
# Location: /opt/apps/leo/

set -e

APP_DIR="/opt/apps/leo"
REPO_URL="https://github.com/kdt82/leo.git"

echo "=========================================="
echo "Leonardo Bulk Studio - Server Setup"
echo "=========================================="

# Create directory if it doesn't exist
if [ ! -d "$APP_DIR" ]; then
    echo "Creating $APP_DIR..."
    sudo mkdir -p "$APP_DIR"
    sudo chown $USER:$USER "$APP_DIR"
fi

cd "$APP_DIR"

# Clone or pull the repository
if [ ! -d ".git" ]; then
    echo "Cloning repository..."
    git clone "$REPO_URL" .
else
    echo "Pulling latest changes..."
    git pull
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo ""
    echo "=========================================="
    echo "IMPORTANT: .env file not found!"
    echo "=========================================="
    echo ""
    echo "Copy .env.example to .env and fill in your values:"
    echo ""
    echo "  cp .env.example .env"
    echo "  nano .env"
    echo ""
    echo "Required values:"
    echo "  - DOMAIN=leo.kylescoins.au"
    echo "  - ACME_EMAIL=admin@kylescoins.au"
    echo "  - POSTGRES_PASSWORD=<secure-password>"
    echo "  - AUTH_PASSWORD=<app-login-password>"
    echo "  - AUTH_SECRET_KEY=<32-char-random-string>"
    echo "  - VITE_LEONARDOAI_API_KEY=<your-key>"
    echo ""
    echo "Generate a secret key with:"
    echo "  openssl rand -hex 32"
    echo ""
    echo "After creating .env, run this script again or run:"
    echo "  docker-compose up -d --build"
    echo ""
    exit 1
fi

# Create Docker network if it doesn't exist
if ! docker network ls | grep -q "web"; then
    echo "Creating 'web' Docker network..."
    docker network create web
fi

echo ""
echo "Building and starting containers..."
docker-compose up -d --build

echo ""
echo "=========================================="
echo "Deployment complete!"
echo "=========================================="
echo ""
echo "Check logs with:"
echo "  cd $APP_DIR && docker-compose logs -f"
echo ""
echo "Your app should be available at:"
echo "  https://leo.kylescoins.au"
echo ""
