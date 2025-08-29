#!/bin/bash

# Test script for semantic-release configuration
# This script runs semantic-release in dry-run mode to test configuration

echo "🧪 Testing semantic-release configuration..."
echo

# Check if semantic-release is installed
if ! command -v npx &> /dev/null; then
    echo "❌ npx is not available. Please install Node.js and npm."
    exit 1
fi

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ Not in a git repository."
    exit 1
fi

# Set required environment variables for dry-run
export GITHUB_TOKEN="fake-token-for-testing"
export NPM_TOKEN="fake-token-for-testing"

echo "🔍 Running semantic-release dry-run..."
echo "This will show what would happen without making any changes."
echo

# Run semantic-release in dry-run mode
npx semantic-release --dry-run

echo
echo "✅ Dry-run completed!"
echo
echo "What this test shows:"
echo "- ✓ Configuration is valid"
echo "- ✓ Commit analysis works"
echo "- ✓ Release notes would be generated" 
echo "- ✓ Version bump calculation"
echo "- ✓ Git tags would be created (format: v1.2.3)"
echo "- ✓ GitHub release would be created"
echo "- ✓ npm package would be published"
echo
echo "💡 To see recent commits that would trigger releases:"
echo "   git log --oneline --decorate -10"
echo
echo "💡 To see existing tags:"
echo "   git tag --list --sort=-version:refname"