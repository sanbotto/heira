#!/bin/bash
# Format all code in the project

echo "Formatting frontend code..."
cd frontend && npm run format && cd ..

echo "Formatting contracts code..."
cd contracts && npm run format && cd ..

echo "Done! All code has been formatted."
