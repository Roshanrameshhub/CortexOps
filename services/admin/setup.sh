#!/bin/bash

# Admin Service Setup Script
# Automates the initial setup and configuration

set -e

echo "=================================="
echo "Admin Service Setup"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Python 3.11+ is installed
echo "Checking Python version..."
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
REQUIRED_VERSION="3.11"

if python3 -c "import sys; exit(0 if sys.version_info >= (3, 11) else 1)"; then
    echo -e "${GREEN}✓${NC} Python $PYTHON_VERSION is installed"
else
    echo -e "${RED}✗${NC} Python 3.11+ is required (found $PYTHON_VERSION)"
    exit 1
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo ""
    echo "Creating virtual environment..."
    python3 -m venv venv
    echo -e "${GREEN}✓${NC} Virtual environment created"
else
    echo -e "${GREEN}✓${NC} Virtual environment already exists"
fi

# Activate virtual environment
echo ""
echo "Activating virtual environment..."
source venv/bin/activate
echo -e "${GREEN}✓${NC} Virtual environment activated"

# Install dependencies
echo ""
echo "Installing dependencies..."
pip install --upgrade pip > /dev/null 2>&1
pip install -r requirements.txt > /dev/null 2>&1
echo -e "${GREEN}✓${NC} Dependencies installed"

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo ""
    echo "Creating .env file from template..."
    cp .env.example .env
    echo -e "${YELLOW}⚠${NC} Please edit .env file with your configuration"
    echo -e "${GREEN}✓${NC} .env file created"
else
    echo -e "${GREEN}✓${NC} .env file already exists"
fi

# Check PostgreSQL connection
echo ""
echo "Checking database connection..."
if python3 -c "from database import health_check; exit(0 if health_check() else 1)" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Database connection successful"

    # Initialize database
    echo ""
    echo "Initializing database tables..."
    python3 -c "from database import init_db; init_db()"
    echo -e "${GREEN}✓${NC} Database tables created"
else
    echo -e "${YELLOW}⚠${NC} Database connection failed"
    echo "  Please ensure PostgreSQL is running and configure DATABASE_URL in .env"
fi

# Check Redis connection
echo ""
echo "Checking Redis connection..."
REDIS_URL=$(grep REDIS_URL .env | cut -d '=' -f2)
if [ ! -z "$REDIS_URL" ]; then
    if redis-cli -u "$REDIS_URL" ping > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Redis connection successful"
    else
        echo -e "${YELLOW}⚠${NC} Redis connection failed"
        echo "  Please ensure Redis is running and configure REDIS_URL in .env"
    fi
else
    echo -e "${YELLOW}⚠${NC} Redis URL not configured"
fi

# Run tests
echo ""
read -p "Do you want to run tests? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Running tests..."
    pytest
fi

echo ""
echo "=================================="
echo -e "${GREEN}Setup Complete!${NC}"
echo "=================================="
echo ""
echo "Next steps:"
echo "  1. Edit .env file with your configuration"
echo "  2. Run the service: make run"
echo "  3. Access API docs: http://localhost:3004/docs"
echo ""
echo "Quick commands:"
echo "  make run        - Start development server"
echo "  make test       - Run tests"
echo "  make coverage   - Run tests with coverage"
echo "  make help       - Show all available commands"
echo ""
