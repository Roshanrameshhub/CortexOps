"""
FastAPI application for ML Recommendations service
"""
from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging
from datetime import datetime
from typing import List, Optional

from ml_recommendations.models.data_models import (
    RecommendationRequest,
    RecommendationResponse,
    RecommendationScore,
    UserInteraction,
    ModelMetrics
)
from ml_recommendations.api.dependencies import (
    get_recommender_service,
    get_feature_store,
    get_ab_test_manager
)
from ml_recommendations.core.recommender_service import RecommenderService

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# Startup and shutdown events
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle events for the application"""
    # Startup
    logger.info("Starting ML Recommendations Service...")
    # Load models, initialize connections, etc.
    yield
    # Shutdown
    logger.info("Shutting down ML Recommendations Service...")


# Create FastAPI application
app = FastAPI(
    title="Advanced ML Recommendations Service",
    description="Enterprise-grade recommendation system with deep learning and personalization",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "ml-recommendations",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat()
    }


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "ML Recommendations API",
        "version": "1.0.0",
        "endpoints": {
            "recommend": "/api/v1/recommend",
            "batch_recommend": "/api/v1/recommend/batch",
            "similar_items": "/api/v1/similar/{item_id}",
            "trending": "/api/v1/trending",
            "personalized": "/api/v1/personalized/{user_id}",
            "track_interaction": "/api/v1/track",
            "health": "/health",
            "metrics": "/metrics"
        }
    }


@app.post(
    "/api/v1/recommend",
    response_model=RecommendationResponse,
    tags=["Recommendations"]
)
async def get_recommendations(
    request: RecommendationRequest,
    recommender: RecommenderService = Depends(get_recommender_service),
    ab_test_manager = Depends(get_ab_test_manager)
):
    """
    Get personalized recommendations for a user

    Args:
        request: Recommendation request with user_id and parameters

    Returns:
        RecommendationResponse with ranked recommendations
    """
    try:
        logger.info(f"Recommendation request for user {request.user_id}")

        # A/B testing: assign variant
        experiment_id = None
        model_variant = 'default'
        if ab_test_manager:
            experiment_id = "recommendation_model_v2"
            model_variant = ab_test_manager.assign_variant(request.user_id, experiment_id)
            logger.info(f"Assigned variant: {model_variant}")

        # Get recommendations
        recommendations = await recommender.recommend(
            user_id=request.user_id,
            limit=request.limit,
            context=request.context.dict() if request.context else None,
            exclude_services=request.exclude_services,
            candidate_services=request.candidate_services,
            diversity_weight=request.diversity_weight,
            novelty_weight=request.novelty_weight,
            model_variant=model_variant
        )

        # Format response
        response = RecommendationResponse(
            user_id=request.user_id,
            recommendations=[
                RecommendationScore(
                    service_id=rec['service_id'],
                    score=rec['score'],
                    rank=idx + 1,
                    algorithm=rec.get('algorithm', 'hybrid'),
                    explanation=rec.get('explanation')
                )
                for idx, rec in enumerate(recommendations)
            ],
            model_version=recommender.model_version,
            timestamp=datetime.now(),
            experiment_id=experiment_id
        )

        return response

    except Exception as e:
        logger.error(f"Error generating recommendations: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post(
    "/api/v1/recommend/batch",
    tags=["Recommendations"]
)
async def get_batch_recommendations(
    requests: List[RecommendationRequest],
    background_tasks: BackgroundTasks,
    recommender: RecommenderService = Depends(get_recommender_service)
):
    """
    Get recommendations for multiple users in batch

    Args:
        requests: List of recommendation requests

    Returns:
        List of recommendations for each user
    """
    try:
        logger.info(f"Batch recommendation request for {len(requests)} users")

        results = []
        for request in requests:
            recommendations = await recommender.recommend(
                user_id=request.user_id,
                limit=request.limit,
                context=request.context.dict() if request.context else None,
                exclude_services=request.exclude_services
            )

            results.append({
                "user_id": request.user_id,
                "recommendations": recommendations
            })

        return {"results": results, "count": len(results)}

    except Exception as e:
        logger.error(f"Error in batch recommendations: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/api/v1/similar/{item_id}",
    tags=["Recommendations"]
)
async def get_similar_items(
    item_id: str,
    limit: int = 10,
    recommender: RecommenderService = Depends(get_recommender_service)
):
    """
    Get items similar to the given item

    Args:
        item_id: Service/item identifier
        limit: Number of similar items to return

    Returns:
        List of similar items with scores
    """
    try:
        logger.info(f"Similar items request for {item_id}")

        similar_items = await recommender.get_similar_items(
            item_id=item_id,
            limit=limit
        )

        return {
            "item_id": item_id,
            "similar_items": similar_items,
            "count": len(similar_items)
        }

    except Exception as e:
        logger.error(f"Error getting similar items: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/api/v1/trending",
    tags=["Recommendations"]
)
async def get_trending(
    limit: int = 20,
    category: Optional[str] = None,
    recommender: RecommenderService = Depends(get_recommender_service)
):
    """
    Get trending items

    Args:
        limit: Number of trending items
        category: Optional category filter

    Returns:
        List of trending items
    """
    try:
        logger.info(f"Trending items request (category: {category})")

        trending = await recommender.get_trending(
            limit=limit,
            category=category
        )

        return {
            "trending": trending,
            "count": len(trending),
            "category": category
        }

    except Exception as e:
        logger.error(f"Error getting trending items: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/api/v1/personalized/{user_id}",
    tags=["Recommendations"]
)
async def get_personalized_home(
    user_id: str,
    recommender: RecommenderService = Depends(get_recommender_service)
):
    """
    Get personalized home page recommendations

    Args:
        user_id: User identifier

    Returns:
        Personalized recommendation sections
    """
    try:
        logger.info(f"Personalized home request for user {user_id}")

        # Get multiple recommendation sections
        sections = {
            "for_you": await recommender.recommend(
                user_id=user_id,
                limit=10
            ),
            "trending": await recommender.get_trending(limit=10),
            "popular_in_categories": await recommender.get_popular_by_category(
                user_id=user_id,
                limit=5
            ),
            "because_you_liked": await recommender.get_related_to_history(
                user_id=user_id,
                limit=10
            )
        }

        return {
            "user_id": user_id,
            "sections": sections,
            "timestamp": datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"Error generating personalized home: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post(
    "/api/v1/track",
    tags=["Tracking"]
)
async def track_interaction(
    interaction: UserInteraction,
    background_tasks: BackgroundTasks,
    recommender: RecommenderService = Depends(get_recommender_service)
):
    """
    Track user interaction for model training

    Args:
        interaction: User interaction data

    Returns:
        Confirmation
    """
    try:
        logger.info(
            f"Tracking {interaction.interaction_type} for user {interaction.user_id}"
        )

        # Process interaction asynchronously
        background_tasks.add_task(
            recommender.track_interaction,
            interaction
        )

        return {
            "status": "accepted",
            "interaction_id": f"{interaction.user_id}_{interaction.timestamp.timestamp()}"
        }

    except Exception as e:
        logger.error(f"Error tracking interaction: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/api/v1/models",
    tags=["Models"]
)
async def list_models(
    recommender: RecommenderService = Depends(get_recommender_service)
):
    """
    List available recommendation models

    Returns:
        List of available models with metadata
    """
    try:
        models = await recommender.list_models()
        return {
            "models": models,
            "count": len(models)
        }

    except Exception as e:
        logger.error(f"Error listing models: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/api/v1/models/{model_name}/metrics",
    response_model=ModelMetrics,
    tags=["Models"]
)
async def get_model_metrics(
    model_name: str,
    recommender: RecommenderService = Depends(get_recommender_service)
):
    """
    Get performance metrics for a specific model

    Args:
        model_name: Model identifier

    Returns:
        Model performance metrics
    """
    try:
        metrics = await recommender.get_model_metrics(model_name)
        if not metrics:
            raise HTTPException(status_code=404, detail=f"Model {model_name} not found")

        return metrics

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting model metrics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/metrics",
    tags=["Monitoring"]
)
async def get_metrics():
    """
    Get service metrics (for Prometheus)

    Returns:
        Prometheus-compatible metrics
    """
    # TODO: Implement Prometheus metrics
    return {
        "status": "metrics endpoint",
        "note": "Prometheus metrics will be available here"
    }


@app.post(
    "/api/v1/feedback",
    tags=["Feedback"]
)
async def submit_feedback(
    user_id: str,
    service_id: str,
    feedback_type: str,
    value: Optional[float] = None,
    background_tasks: BackgroundTasks = None,
    recommender: RecommenderService = Depends(get_recommender_service)
):
    """
    Submit user feedback on recommendations

    Args:
        user_id: User identifier
        service_id: Service identifier
        feedback_type: Type of feedback (click, like, dislike, rating)
        value: Optional feedback value

    Returns:
        Confirmation
    """
    try:
        logger.info(f"Feedback: {feedback_type} from user {user_id} on service {service_id}")

        if background_tasks:
            background_tasks.add_task(
                recommender.process_feedback,
                user_id,
                service_id,
                feedback_type,
                value
            )

        return {
            "status": "accepted",
            "message": "Feedback received"
        }

    except Exception as e:
        logger.error(f"Error processing feedback: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# Exception handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """Handle HTTP exceptions"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "status_code": exc.status_code,
            "timestamp": datetime.now().isoformat()
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """Handle general exceptions"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "detail": str(exc),
            "timestamp": datetime.now().isoformat()
        }
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
