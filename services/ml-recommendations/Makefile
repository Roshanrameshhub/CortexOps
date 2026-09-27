.PHONY: help install dev-install test lint format clean docker-build docker-run k8s-deploy train-models

help:
	@echo "ML Recommendations Service - Make Commands"
	@echo ""
	@echo "Development:"
	@echo "  make install          Install production dependencies"
	@echo "  make dev-install      Install development dependencies"
	@echo "  make run              Run service locally"
	@echo "  make test             Run tests"
	@echo "  make test-cov         Run tests with coverage"
	@echo "  make lint             Run linters"
	@echo "  make format           Format code"
	@echo "  make clean            Clean build artifacts"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-build     Build Docker image"
	@echo "  make docker-run       Run Docker container"
	@echo "  make docker-compose   Run with docker-compose"
	@echo ""
	@echo "Kubernetes:"
	@echo "  make k8s-deploy       Deploy to Kubernetes"
	@echo "  make k8s-delete       Delete from Kubernetes"
	@echo "  make k8s-logs         View logs"
	@echo ""
	@echo "ML:"
	@echo "  make train-models     Train recommendation models"
	@echo "  make evaluate         Evaluate models"

install:
	pip install -r requirements.txt
	pip install -e .

dev-install: install
	pip install pytest pytest-cov pytest-asyncio black flake8 mypy

run:
	uvicorn ml_recommendations.api.main:app --reload --host 0.0.0.0 --port 8000

test:
	pytest -v

test-cov:
	pytest --cov=ml_recommendations --cov-report=html --cov-report=term-missing

lint:
	flake8 src/ tests/
	mypy src/

format:
	black src/ tests/
	isort src/ tests/

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	find . -type f -name "*.pyo" -delete
	find . -type f -name "*.egg-info" -exec rm -rf {} +
	rm -rf build/ dist/ .pytest_cache/ .coverage htmlcov/

# Docker commands
docker-build:
	docker build -t ml-recommendations:latest .

docker-run:
	docker run -p 8000:8000 ml-recommendations:latest

docker-compose:
	docker-compose up -d

docker-compose-down:
	docker-compose down

docker-compose-logs:
	docker-compose logs -f ml-recommendations

# Kubernetes commands
k8s-deploy:
	kubectl apply -f k8s/deployment.yaml

k8s-delete:
	kubectl delete -f k8s/deployment.yaml

k8s-logs:
	kubectl logs -f -l app=ml-recommendations -n llm-marketplace

k8s-port-forward:
	kubectl port-forward svc/ml-recommendations-service 8000:80 -n llm-marketplace

# ML commands
train-models:
	python -m ml_recommendations.training.pipeline

evaluate:
	python -m ml_recommendations.training.evaluation

# Database commands
db-init:
	python scripts/init_db.py

db-migrate:
	alembic upgrade head

db-seed:
	python scripts/seed_data.py
