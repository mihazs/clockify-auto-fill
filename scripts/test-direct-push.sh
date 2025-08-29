#!/bin/bash

# Test script for direct push behavior
# This script demonstrates how direct pushes trigger automatic releases

set -e  # Exit on any error

echo "🚀 Testing Direct Push to Main Branch"
echo "======================================"
echo

# Check if we're in the correct repository
if [ ! -f "package.json" ] || ! grep -q "clockify-auto-fill" package.json; then
    echo "❌ This script must be run from the clockify-auto-fill root directory"
    exit 1
fi

# Check current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "📍 Current branch: $CURRENT_BRANCH"

# Check if we have uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "⚠️  Warning: You have uncommitted changes"
    git status --short
    echo
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "🔍 Checking current state:"
echo "- Latest commit: $(git log --oneline -1)"
echo "- Latest tag: $(git describe --tags --abbrev=0 2>/dev/null || echo 'No tags found')"
echo "- Remote URL: $(git remote get-url origin)"
echo

echo "📝 This is what happens when you push directly to main:"
echo "1. 🔍 GitHub Actions detects push to main branch"
echo "2. 🚀 Release workflow starts automatically"
echo "3. 📊 Semantic-release analyzes commits since last release"
echo "4. 🏷️  New Git tag created (if releasable commits found)"
echo "5. 📦 GitHub release created with changelog"
echo "6. 🌐 Package published to npm"
echo "7. 📝 package.json and CHANGELOG.md updated"
echo

echo "💡 To test this workflow:"
echo
echo "# Option 1: Make a conventional commit and push"
echo "git commit -m 'fix: improve error handling'"
echo "git push origin main"
echo
echo "# Option 2: Create an empty commit for testing"
echo "git commit --allow-empty -m 'feat: test direct push release'"
echo "git push origin main"
echo
echo "# Option 3: Use manual workflow trigger"
echo "# Go to: GitHub → Actions → Release → Run workflow"
echo

echo "⚡ Release triggers supported:"
echo "✅ Direct push to main (this method)"
echo "✅ PR merge to main"  
echo "✅ Manual workflow dispatch"
echo "✅ Push to develop (beta releases)"
echo

echo "🏷️  Tag format examples:"
echo "- Production: v1.0.0, v1.1.0, v2.0.0"
echo "- Beta: v1.1.0-beta.1, v1.1.0-beta.2"
echo

echo "🎯 Want to simulate a release? Run:"
echo "npm run semantic-release:dry-run"
echo
echo "This will show what would happen without making changes."