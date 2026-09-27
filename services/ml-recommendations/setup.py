from setuptools import setup, find_packages

setup(
    name="ml-recommendations",
    version="1.0.0",
    description="Advanced ML Recommendation System for LLM Marketplace",
    author="LLM Marketplace Team",
    author_email="team@llm-marketplace.com",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    python_requires=">=3.9",
    install_requires=[
        "tensorflow>=2.15.0",
        "torch>=2.1.0",
        "scikit-learn>=1.4.0",
        "fastapi>=0.109.0",
        "uvicorn>=0.27.0",
        "pydantic>=2.5.0",
        "redis>=5.0.0",
        "mlflow>=2.10.0",
        "optuna>=3.5.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.4.0",
            "black>=24.0.0",
            "flake8>=7.0.0",
            "mypy>=1.8.0",
        ],
    },
    entry_points={
        "console_scripts": [
            "ml-recommendations=ml_recommendations.main:app",
            "train-models=ml_recommendations.training.train:main",
        ],
    },
)
