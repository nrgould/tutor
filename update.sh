#!/bin/bash

# Eigen Update Script for macOS/Linux
# Run this to pull latest changes and start the app

echo "================================"
echo "  Eigen - Pulling Updates..."
echo "================================"

# Pull latest changes
git pull origin main

if [ $? -ne 0 ]; then
    echo ""
    echo "⚠️  Git pull failed. You may have local changes."
    echo "    Try: git stash && ./update.sh"
    exit 1
fi

echo ""
echo "================================"
echo "  Installing Dependencies..."
echo "================================"

npm install

if [ $? -ne 0 ]; then
    echo ""
    echo "⚠️  npm install failed. Check your Node.js installation."
    exit 1
fi

echo ""
echo "================================"
echo "  Starting Eigen..."
echo "================================"
echo ""

npm run tauri dev
