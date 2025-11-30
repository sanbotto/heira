#!/bin/bash
# Quick deployment script for Express fallback server

set -e

echo "Deploying Heira Express Fallback Server..."

# Check if .env file exists
if [ ! -f "backend/.env" ]; then
    echo "Error: backend/.env file not found"
    echo "Please create backend/.env with required environment variables"
    exit 1
fi

# Build the backend
echo "Building backend..."
cd backend
npm install
npm run build

# Check if build succeeded
if [ ! -d "dist" ]; then
    echo "Build failed, dist directory not found"
    exit 1
fi

echo "Build completed successfully"
echo ""
echo "Next steps:"
echo "1. Set up your Node.js hosting (e.g., Railway, Render, DigitalOcean)"
echo "2. Deploy the backend/ directory"
echo "3. Set environment variables from backend/.env"
echo "4. Run: npm start"
echo ""
echo "The Express server will use file-based storage by default"
echo "Set USE_D1_STORAGE=true to use D1 (requires D1 HTTP API client)"
