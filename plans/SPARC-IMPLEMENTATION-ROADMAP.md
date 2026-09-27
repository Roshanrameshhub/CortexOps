# LLM-Marketplace: SPARC Implementation Roadmap

**Document Version:** 1.0
**Created:** 2025-11-18
**Methodology:** SPARC (Specification, Pseudocode, Architecture, Refinement, Completion)
**Author:** Technical Writing Team

---

## Executive Summary

This document provides a comprehensive implementation roadmap for the LLM-Marketplace following Reuven Cohen's SPARC methodology. The marketplace serves as a centralized hub for discovering, publishing, rating, and distributing LLM models, prompts, and configurations within an enterprise ecosystem.

**Project Timeline:** 12 months (3 phases)
- Phase 1 (MVP): Months 0-3
- Phase 2 (Beta): Months 3-6
- Phase 3 (V1): Months 6-12

**Core Value Proposition:** Democratize LLM asset distribution through a secure, policy-compliant, community-driven marketplace.

---

# SPARC Phase 1: SPECIFICATION

## 1.1 Vision Statement

The LLM-Marketplace enables organizations to:
- **Discover** LLM models, prompts, and configurations through intelligent search
- **Publish** assets with comprehensive metadata and versioning
- **Evaluate** quality through community ratings and reviews
- **Retrieve** assets securely with policy enforcement
- **Monetize** contributions through flexible licensing models (future)

## 1.2 Formal Requirements

### Functional Requirements

#### FR-1: Asset Publishing
- **FR-1.1**: Users SHALL publish LLM models with metadata (name, version, description, tags, license)
- **FR-1.2**: Users SHALL publish prompt templates with parameters and examples
- **FR-1.3**: Users SHALL publish configuration files with schema validation
- **FR-1.4**: System SHALL support semantic versioning (MAJOR.MINOR.PATCH)
- **FR-1.5**: System SHALL validate asset integrity via checksums (SHA-256)
- **FR-1.6**: System SHALL support multi-file asset bundles (ZIP/TAR)
- **FR-1.7**: Publishers SHALL provide minimum metadata: name, description, category, license
- **FR-1.8**: System SHALL auto-generate asset UUIDs upon publication

#### FR-2: Discovery & Search
- **FR-2.1**: Users SHALL search by keywords, tags, categories, authors
- **FR-2.2**: System SHALL support full-text search on metadata
- **FR-2.3**: System SHALL provide faceted filtering (category, license, rating, date)
- **FR-2.4**: System SHALL rank results by relevance, popularity, recency
- **FR-2.5**: System SHALL support semantic search using embeddings (Phase 2)
- **FR-2.6**: Users SHALL browse trending/popular/recent assets
- **FR-2.7**: System SHALL provide related asset recommendations
- **FR-2.8**: System SHALL support saved searches and alerts (Phase 3)

#### FR-3: Asset Retrieval
- **FR-3.1**: Users SHALL download assets via CLI, API, or Web UI
- **FR-3.2**: System SHALL verify user permissions before download
- **FR-3.3**: System SHALL log all download events for auditing
- **FR-3.4**: System SHALL support resumable downloads for large assets
- **FR-3.5**: System SHALL provide CDN-accelerated delivery (Phase 2)
- **FR-3.6**: System SHALL enforce rate limits per user/organization
- **FR-3.7**: System SHALL track download counts per asset

#### FR-4: Rating & Review System
- **FR-4.1**: Users SHALL rate assets on 5-star scale
- **FR-4.2**: Users SHALL write text reviews (100-2000 characters)
- **FR-4.3**: System SHALL calculate aggregated ratings with weighted averages
- **FR-4.4**: System SHALL prevent duplicate ratings from same user
- **FR-4.5**: Users SHALL edit/delete their own reviews
- **FR-4.6**: System SHALL flag suspicious reviews for moderation (Phase 2)
- **FR-4.7**: Users SHALL upvote/downvote helpful reviews (Phase 2)

#### FR-5: Policy Integration
- **FR-5.1**: System SHALL verify asset compliance via LLM-Policy-Engine
- **FR-5.2**: System SHALL block publication of non-compliant assets
- **FR-5.3**: System SHALL display compliance badges (e.g., "SOC2 Approved")
- **FR-5.4**: System SHALL auto-retire assets failing policy updates
- **FR-5.5**: System SHALL notify publishers of policy violations

#### FR-6: Registry Integration
- **FR-6.1**: System SHALL sync asset metadata with LLM-Registry
- **FR-6.2**: System SHALL resolve asset dependencies from Registry
- **FR-6.3**: System SHALL update Registry on asset publication/deletion
- **FR-6.4**: System SHALL validate asset references exist in Registry

#### FR-7: Analytics Integration
- **FR-7.1**: System SHALL send usage events to LLM-Analytics-Hub
- **FR-7.2**: System SHALL track: downloads, views, searches, ratings
- **FR-7.3**: System SHALL provide publisher dashboards (Phase 2)
- **FR-7.4**: System SHALL generate trending metrics daily

#### FR-8: Governance Integration
- **FR-8.1**: System SHALL surface marketplace metrics in LLM-Governance-Dashboard
- **FR-8.2**: System SHALL alert on anomalous activity (download spikes, rating manipulation)
- **FR-8.3**: System SHALL provide audit trails for compliance reporting

### Non-Functional Requirements

#### NFR-1: Performance
- **NFR-1.1**: Search queries SHALL return results within 200ms (p95)
- **NFR-1.2**: Asset downloads SHALL support 100MB/s transfer rates
- **NFR-1.3**: System SHALL handle 10,000 concurrent users (Phase 2)
- **NFR-1.4**: Database queries SHALL execute within 50ms (p95)
- **NFR-1.5**: API response time SHALL not exceed 500ms (p99)

#### NFR-2: Scalability
- **NFR-2.1**: System SHALL store 100,000 assets at launch
- **NFR-2.2**: System SHALL scale to 1M assets by Phase 3
- **NFR-2.3**: System SHALL handle 1M downloads/day (Phase 3)
- **NFR-2.4**: Search index SHALL rebuild within 1 hour

#### NFR-3: Security
- **NFR-3.1**: All API endpoints SHALL require JWT authentication
- **NFR-3.2**: Asset uploads SHALL be scanned for malware
- **NFR-3.3**: System SHALL encrypt data at rest (AES-256)
- **NFR-3.4**: System SHALL encrypt data in transit (TLS 1.3)
- **NFR-3.5**: System SHALL implement rate limiting (100 req/min per user)
- **NFR-3.6**: System SHALL support SSO via OAuth2/SAML

#### NFR-4: Availability
- **NFR-4.1**: System SHALL maintain 99.9% uptime SLA
- **NFR-4.2**: System SHALL recover from failures within 5 minutes (RPO)
- **NFR-4.3**: System SHALL backup data every 6 hours
- **NFR-4.4**: System SHALL replicate data across 3 availability zones

#### NFR-5: Usability
- **NFR-5.1**: Web UI SHALL be responsive (mobile, tablet, desktop)
- **NFR-5.2**: System SHALL provide OpenAPI documentation
- **NFR-5.3**: CLI SHALL support bash/zsh autocomplete
- **NFR-5.4**: System SHALL provide onboarding tutorials

## 1.3 Use Cases & User Stories

### Use Case 1: Publishing a Model

**Actor:** Data Scientist (Publisher)
**Precondition:** User authenticated, model trained and validated
**Main Flow:**
1. User prepares model package (weights, config, README)
2. User runs `llm-marketplace publish --type model --path ./my-model/`
3. System validates package structure and metadata
4. System checks policy compliance via Policy Engine
5. System calculates checksum and generates UUID
6. System uploads to storage and indexes metadata
7. System syncs to Registry
8. System sends confirmation and asset URL

**Postcondition:** Model discoverable in marketplace, logged in Analytics Hub

**User Story:**
```
AS A data scientist
I WANT TO publish my fine-tuned sentiment analysis model
SO THAT other teams can reuse it for their projects
GIVEN I have a trained model with documentation
WHEN I run the publish command with required metadata
THEN the model appears in the marketplace within 2 minutes
AND I receive a unique asset URL for sharing
```

### Use Case 2: Discovering Assets

**Actor:** ML Engineer (Consumer)
**Precondition:** User authenticated
**Main Flow:**
1. User searches "customer support chatbot prompts"
2. System queries Elasticsearch index
3. System returns ranked results with filters
4. User applies filters: category=prompts, rating>4, license=MIT
5. User views asset details (metadata, reviews, dependencies)
6. User previews README and examples
7. User bookmarks asset for later (Phase 2)

**Postcondition:** Search logged in Analytics Hub

**User Story:**
```
AS AN ML engineer
I WANT TO search for pre-built customer service prompts
SO THAT I can accelerate my chatbot development
GIVEN the marketplace has 10,000+ assets
WHEN I search with filters
THEN I see relevant results ranked by quality within 200ms
AND I can preview prompts before downloading
```

### Use Case 3: Installing an Asset

**Actor:** Developer (Consumer)
**Precondition:** User authenticated, asset exists
**Main Flow:**
1. User runs `llm-marketplace install llm://marketplace/sentiment-analyzer:1.2.3`
2. System verifies user permissions
3. System checks Policy Engine for compliance
4. System resolves dependencies from Registry
5. System downloads asset to local cache
6. System validates checksum
7. System extracts files to specified directory
8. System logs download event to Analytics Hub

**Postcondition:** Asset available locally, download counted

**User Story:**
```
AS A developer
I WANT TO install a specific version of a prompt template
SO THAT my application uses a tested, stable prompt
GIVEN the asset is published and compliant
WHEN I run the install command with version
THEN the exact version is downloaded to my project
AND all dependencies are automatically resolved
```

### Use Case 4: Rating & Reviewing

**Actor:** ML Practitioner (Consumer)
**Precondition:** User authenticated, asset previously downloaded
**Main Flow:**
1. User runs `llm-marketplace review <asset-id> --rating 5 --text "Excellent!"`
2. System verifies user downloaded asset (prevents fake reviews)
3. System checks for duplicate review
4. System saves review with timestamp
5. System recalculates aggregate rating
6. System updates search index with new rating
7. Review appears on asset page

**Postcondition:** Review visible, aggregate rating updated

**User Story:**
```
AS AN ML practitioner
I WANT TO rate and review a prompt I used
SO THAT I can help others evaluate its quality
GIVEN I successfully used the prompt in production
WHEN I submit a 5-star review with feedback
THEN my review appears on the asset page
AND the overall rating updates immediately
```

## 1.4 Success Criteria

### Business Metrics
- **M1**: 500+ published assets within 3 months of launch
- **M2**: 5,000+ unique users within 6 months
- **M3**: 50,000+ downloads within 6 months
- **M4**: 70%+ assets with at least one review by month 9
- **M5**: 30%+ monthly active user retention
- **M6**: Average 4.0+ star rating across assets

### Technical Metrics
- **M7**: 99.9% uptime SLA achievement
- **M8**: <200ms search response time (p95)
- **M9**: <500ms API response time (p99)
- **M10**: Zero security incidents
- **M11**: 100% policy-compliant assets published
- **M12**: <0.1% failed downloads

### User Satisfaction
- **M13**: Net Promoter Score (NPS) >40
- **M14**: 80%+ users successfully publish on first attempt
- **M15**: 90%+ users find desired assets within 3 searches

## 1.5 Constraints & Assumptions

### Constraints
- **C1**: Must integrate with existing LLM-Registry, Policy-Engine, Analytics-Hub, Governance-Dashboard
- **C2**: Must comply with enterprise security policies (SOC2, GDPR, HIPAA)
- **C3**: Budget: $150K Phase 1, $100K Phase 2, $150K Phase 3
- **C4**: Team size: 1 PM, 2 Backend, 2 Frontend, 1 DevOps, 1 QA
- **C5**: Launch deadline: 12 months from kickoff
- **C6**: Must use existing tech stack: Node.js/Python backend, React frontend
- **C7**: Must deploy on AWS infrastructure

### Assumptions
- **A1**: LLM-Registry provides stable API for asset metadata sync
- **A2**: LLM-Policy-Engine can validate assets within 5 seconds
- **A3**: LLM-Analytics-Hub can ingest 10K events/second
- **A4**: Users have 100MB+ network bandwidth for downloads
- **A5**: Most assets <1GB in size (95th percentile)
- **A6**: Users trust community ratings for quality assessment
- **A7**: Enterprise SSO integration available by Phase 2
- **A8**: Legal team approves marketplace terms of service

## 1.6 Integration Contracts

### Integration with LLM-Registry

**Purpose:** Sync asset metadata, resolve dependencies
**Protocol:** REST API + Webhooks
**Endpoints:**

```
POST /registry/assets
GET /registry/assets/{id}
PUT /registry/assets/{id}
DELETE /registry/assets/{id}
GET /registry/assets/{id}/dependencies
```

**Contract:**
- Marketplace SHALL register all published assets in Registry within 30 seconds
- Registry SHALL provide webhook callbacks on asset updates
- Marketplace SHALL resolve dependency chains via Registry API
- Registry SHALL be source of truth for asset provenance

**Error Handling:**
- Registry unavailable: Queue sync, retry with exponential backoff
- Duplicate asset: Return error to publisher
- Invalid dependency: Block publication until resolved

### Integration with LLM-Policy-Engine

**Purpose:** Validate asset compliance with organizational policies
**Protocol:** gRPC for low latency
**Endpoints:**

```
rpc ValidateAsset(AssetValidationRequest) returns (ValidationResult)
rpc GetPolicies(PolicyQuery) returns (PolicyList)
rpc SubscribePolicyUpdates(PolicySubscription) returns (stream PolicyUpdate)
```

**Contract:**
- Policy Engine SHALL validate assets within 5 seconds (p99)
- Policy Engine SHALL return structured violation details
- Marketplace SHALL block publication of non-compliant assets
- Marketplace SHALL subscribe to policy updates and re-validate assets
- Policy Engine SHALL support batch validation for re-scans

**Error Handling:**
- Policy Engine timeout: Fail-open with warning (Phase 1), fail-closed (Phase 2)
- Network error: Retry 3 times, then queue for later validation
- Invalid policy: Alert governance team, allow publication with flag

### Integration with LLM-Analytics-Hub

**Purpose:** Track usage events, power recommendations
**Protocol:** Kafka event streaming
**Event Schema:**

```json
{
  "event_type": "asset_published|asset_downloaded|asset_viewed|asset_rated|search_performed",
  "timestamp": "ISO-8601",
  "user_id": "UUID",
  "asset_id": "UUID",
  "metadata": {
    "search_query": "string",
    "rating": "integer",
    "download_size_mb": "float"
  }
}
```

**Contract:**
- Marketplace SHALL emit events asynchronously (non-blocking)
- Analytics Hub SHALL process events within 1 minute
- Analytics Hub SHALL provide aggregated metrics via REST API
- Marketplace SHALL query Analytics Hub for trending/popular assets

**Error Handling:**
- Kafka unavailable: Buffer events locally (max 10K), replay on recovery
- Analytics Hub slow: Continue operations, log warning

### Integration with LLM-Governance-Dashboard

**Purpose:** Surface marketplace health metrics, audit trails
**Protocol:** REST API + Scheduled exports
**Endpoints:**

```
GET /marketplace/metrics/daily
GET /marketplace/audit-trail?start_date&end_date
GET /marketplace/compliance-report
GET /marketplace/top-publishers
GET /marketplace/policy-violations
```

**Contract:**
- Marketplace SHALL expose metrics API for dashboard consumption
- Marketplace SHALL generate daily compliance reports
- Marketplace SHALL export audit logs to S3 every 24 hours
- Dashboard SHALL poll metrics every 5 minutes
- Marketplace SHALL alert on SLA breaches

**Error Handling:**
- Dashboard unavailable: Continue operations, cache metrics
- Report generation failure: Retry once, alert DevOps

---

# SPARC Phase 2: PSEUDOCODE

## 2.1 Publishing Workflow Pseudocode

```
FUNCTION publishAsset(assetPackage, metadata, user):
    // Step 1: Validate inputs
    IF NOT authenticated(user):
        RETURN error("Authentication required")

    IF NOT validateMetadata(metadata):
        RETURN error("Invalid metadata: " + getValidationErrors(metadata))

    IF NOT validatePackageStructure(assetPackage):
        RETURN error("Invalid package structure")

    // Step 2: Policy compliance check
    policyResult = policyEngine.validateAsset(assetPackage, metadata)
    IF policyResult.status == "FAILED":
        logEvent("asset_rejected_policy", user, policyResult.violations)
        RETURN error("Policy violations: " + policyResult.violations)

    // Step 3: Generate asset ID and version
    assetId = generateUUID()
    version = metadata.version OR autoIncrementVersion(metadata.name)

    // Step 4: Calculate checksum
    checksum = sha256(assetPackage)

    // Step 5: Upload to storage
    storageUrl = uploadToS3(
        bucket = "llm-marketplace-assets",
        key = "{assetId}/{version}/package.tar.gz",
        data = assetPackage,
        metadata = {
            "checksum": checksum,
            "publisher": user.id,
            "published_at": currentTimestamp()
        }
    )

    // Step 6: Create database record
    assetRecord = {
        "id": assetId,
        "name": metadata.name,
        "version": version,
        "description": metadata.description,
        "category": metadata.category,
        "tags": metadata.tags,
        "license": metadata.license,
        "publisher_id": user.id,
        "storage_url": storageUrl,
        "checksum": checksum,
        "size_bytes": assetPackage.size,
        "published_at": currentTimestamp(),
        "download_count": 0,
        "average_rating": null
    }

    TRY:
        database.insert("assets", assetRecord)
    CATCH DatabaseError:
        // Rollback: delete from S3
        deleteFromS3(storageUrl)
        RETURN error("Database error, upload rolled back")

    // Step 7: Index in search engine
    searchIndex.index({
        "id": assetId,
        "name": metadata.name,
        "description": metadata.description,
        "tags": metadata.tags,
        "category": metadata.category,
        "embedding": generateEmbedding(metadata.description)  // Phase 2
    })

    // Step 8: Sync to Registry
    registryResponse = registry.createAsset({
        "marketplace_id": assetId,
        "name": metadata.name,
        "version": version,
        "type": metadata.type,
        "checksum": checksum
    })

    IF registryResponse.error:
        logWarning("Registry sync failed, will retry", registryResponse.error)
        queueForRetry("registry_sync", assetId)

    // Step 9: Emit analytics event
    analyticsHub.emit({
        "event_type": "asset_published",
        "asset_id": assetId,
        "user_id": user.id,
        "metadata": metadata
    })

    // Step 10: Send confirmation
    RETURN {
        "status": "success",
        "asset_id": assetId,
        "version": version,
        "url": "llm://marketplace/{assetId}:{version}",
        "storage_url": storageUrl
    }
END FUNCTION

FUNCTION validateMetadata(metadata):
    required = ["name", "description", "category", "license"]
    FOR field IN required:
        IF NOT metadata.has(field):
            RETURN false

    IF length(metadata.description) < 50:
        RETURN false

    IF metadata.category NOT IN allowedCategories:
        RETURN false

    IF metadata.version AND NOT isSemanticVersion(metadata.version):
        RETURN false

    RETURN true
END FUNCTION
```

## 2.2 Indexing and Search Algorithms

```
FUNCTION searchAssets(query, filters, pagination):
    // Step 1: Parse query
    tokens = tokenize(query)
    stemmed = stemTokens(tokens)

    // Step 2: Build Elasticsearch query
    esQuery = {
        "bool": {
            "must": [
                {
                    "multi_match": {
                        "query": query,
                        "fields": ["name^3", "description^2", "tags^2", "category"],
                        "type": "best_fields",
                        "fuzziness": "AUTO"
                    }
                }
            ],
            "filter": []
        }
    }

    // Step 3: Apply filters
    IF filters.category:
        esQuery.bool.filter.append({"term": {"category": filters.category}})

    IF filters.license:
        esQuery.bool.filter.append({"terms": {"license": filters.license}})

    IF filters.min_rating:
        esQuery.bool.filter.append({"range": {"average_rating": {"gte": filters.min_rating}}})

    IF filters.publisher:
        esQuery.bool.filter.append({"term": {"publisher_id": filters.publisher}})

    IF filters.date_after:
        esQuery.bool.filter.append({"range": {"published_at": {"gte": filters.date_after}}})

    // Step 4: Add ranking factors
    esQuery.bool.should = [
        {"rank_feature": {"field": "download_count", "boost": 2.0}},
        {"rank_feature": {"field": "average_rating", "boost": 3.0}},
        {"rank_feature": {"field": "recency_score", "boost": 1.5}}
    ]

    // Step 5: Execute search
    results = elasticsearch.search(
        index = "marketplace_assets",
        query = esQuery,
        size = pagination.size,
        from = pagination.offset,
        sort = determineSortOrder(filters.sort_by)
    )

    // Step 6: Enrich results with additional data
    enrichedResults = []
    FOR hit IN results.hits:
        assetData = hit._source

        // Fetch review count and recent reviews
        reviewStats = database.query(
            "SELECT COUNT(*) as count, AVG(rating) as avg FROM reviews WHERE asset_id = ?",
            assetData.id
        )

        // Fetch publisher info
        publisher = cache.get("publisher:" + assetData.publisher_id) OR database.query(
            "SELECT name, avatar_url FROM users WHERE id = ?",
            assetData.publisher_id
        )

        enrichedResults.append({
            ...assetData,
            "review_count": reviewStats.count,
            "average_rating": reviewStats.avg,
            "publisher": publisher,
            "relevance_score": hit._score
        })
    END FOR

    // Step 7: Log search event
    analyticsHub.emit({
        "event_type": "search_performed",
        "query": query,
        "filters": filters,
        "result_count": results.total,
        "user_id": currentUser.id
    })

    RETURN {
        "results": enrichedResults,
        "total": results.total,
        "page": pagination.offset / pagination.size,
        "facets": calculateFacets(results.aggregations)
    }
END FUNCTION

FUNCTION indexAsset(asset):
    // Calculate recency score (exponential decay)
    daysSincePublish = (currentTimestamp() - asset.published_at) / 86400
    recencyScore = exp(-0.05 * daysSincePublish)  // Decays over ~20 days

    // Generate semantic embedding (Phase 2)
    embedding = embeddingModel.encode(asset.description)

    document = {
        "id": asset.id,
        "name": asset.name,
        "description": asset.description,
        "tags": asset.tags,
        "category": asset.category,
        "license": asset.license,
        "publisher_id": asset.publisher_id,
        "download_count": asset.download_count,
        "average_rating": asset.average_rating OR 0,
        "published_at": asset.published_at,
        "recency_score": recencyScore,
        "embedding_vector": embedding  // For semantic search
    }

    elasticsearch.index(
        index = "marketplace_assets",
        id = asset.id,
        document = document
    )
END FUNCTION

FUNCTION semanticSearch(query, topK):
    // Phase 2: Semantic search using embeddings
    queryEmbedding = embeddingModel.encode(query)

    // k-NN search in Elasticsearch
    results = elasticsearch.search(
        index = "marketplace_assets",
        knn = {
            "field": "embedding_vector",
            "query_vector": queryEmbedding,
            "k": topK,
            "num_candidates": topK * 10
        }
    )

    RETURN results.hits
END FUNCTION
```

## 2.3 Retrieval and Installation Process

```
FUNCTION installAsset(assetUri, targetPath, options):
    // Step 1: Parse asset URI (llm://marketplace/{id}:{version})
    parsed = parseAssetUri(assetUri)
    IF NOT parsed:
        RETURN error("Invalid asset URI format")

    assetId = parsed.id
    version = parsed.version OR "latest"

    // Step 2: Fetch asset metadata
    asset = database.query(
        "SELECT * FROM assets WHERE id = ? AND version = ?",
        assetId, version
    )

    IF NOT asset:
        RETURN error("Asset not found: " + assetUri)

    // Step 3: Check permissions
    IF NOT hasPermission(currentUser, asset):
        logEvent("unauthorized_access", currentUser, assetId)
        RETURN error("Access denied")

    // Step 4: Policy compliance check (real-time)
    IF NOT options.skipPolicyCheck:
        policyStatus = policyEngine.checkCompliance(assetId)
        IF policyStatus.compliant == false:
            RETURN error("Asset violates current policies: " + policyStatus.violations)

    // Step 5: Resolve dependencies
    dependencies = registry.getDependencies(assetId, version)
    FOR dep IN dependencies:
        IF NOT isInstalled(dep):
            depResult = installAsset(dep.uri, targetPath, options)
            IF depResult.error:
                RETURN error("Dependency installation failed: " + dep.uri)

    // Step 6: Check local cache
    cacheKey = assetId + ":" + version
    cachedPath = cache.getPath(cacheKey)

    IF cachedPath AND verifyCacheChecksum(cachedPath, asset.checksum):
        logEvent("cache_hit", assetId, version)
        RETURN copyFromCache(cachedPath, targetPath)

    // Step 7: Download asset
    logEvent("asset_download_started", currentUser, assetId)

    TRY:
        IF options.resumable AND partialDownloadExists(assetId):
            downloadedBytes = resumeDownload(asset.storage_url, assetId)
        ELSE:
            downloadedBytes = downloadFile(
                url = asset.storage_url,
                destination = tempPath("/tmp/" + assetId),
                progressCallback = updateProgressBar
            )
    CATCH NetworkError:
        RETURN error("Download failed, please retry")

    // Step 8: Verify checksum
    downloadedChecksum = sha256(downloadedBytes)
    IF downloadedChecksum != asset.checksum:
        deleteFile(downloadedBytes)
        logEvent("checksum_mismatch", assetId, downloadedChecksum, asset.checksum)
        RETURN error("Checksum verification failed, file may be corrupted")

    // Step 9: Extract to target path
    IF asset.type == "bundle":
        extractArchive(downloadedBytes, targetPath)
    ELSE:
        copyFile(downloadedBytes, targetPath)

    // Step 10: Update local cache
    cache.store(cacheKey, downloadedBytes)

    // Step 11: Update download count
    database.execute(
        "UPDATE assets SET download_count = download_count + 1 WHERE id = ?",
        assetId
    )

    // Step 12: Emit analytics event
    analyticsHub.emit({
        "event_type": "asset_downloaded",
        "asset_id": assetId,
        "version": version,
        "user_id": currentUser.id,
        "download_size_mb": asset.size_bytes / 1048576,
        "duration_seconds": timer.elapsed()
    })

    // Step 13: Create installation manifest
    manifest = {
        "asset_id": assetId,
        "version": version,
        "installed_at": currentTimestamp(),
        "installed_by": currentUser.id,
        "target_path": targetPath,
        "dependencies": dependencies
    }

    saveManifest(targetPath + "/.llm-marketplace-manifest.json", manifest)

    RETURN {
        "status": "success",
        "asset_id": assetId,
        "version": version,
        "path": targetPath,
        "size_mb": asset.size_bytes / 1048576
    }
END FUNCTION

FUNCTION hasPermission(user, asset):
    // Check if asset is public or user has access
    IF asset.visibility == "public":
        RETURN true

    IF asset.visibility == "organization":
        RETURN user.organization_id == asset.publisher_organization_id

    IF asset.visibility == "private":
        RETURN user.id == asset.publisher_id OR user.id IN asset.authorized_users

    RETURN false
END FUNCTION
```

## 2.4 Rating and Review Aggregation

```
FUNCTION submitReview(assetId, userId, rating, reviewText):
    // Step 1: Validate inputs
    IF rating < 1 OR rating > 5:
        RETURN error("Rating must be between 1 and 5")

    IF length(reviewText) < 100 OR length(reviewText) > 2000:
        RETURN error("Review text must be 100-2000 characters")

    // Step 2: Check if user downloaded asset
    downloaded = database.query(
        "SELECT 1 FROM download_logs WHERE user_id = ? AND asset_id = ? LIMIT 1",
        userId, assetId
    )

    IF NOT downloaded:
        RETURN error("You must download the asset before reviewing")

    // Step 3: Check for duplicate review
    existing = database.query(
        "SELECT id FROM reviews WHERE user_id = ? AND asset_id = ?",
        userId, assetId
    )

    IF existing:
        RETURN error("You already reviewed this asset. Use update instead.")

    // Step 4: Content moderation (Phase 2)
    moderationResult = moderateText(reviewText)
    IF moderationResult.flagged:
        logEvent("review_flagged", userId, assetId, moderationResult.reason)
        RETURN error("Review flagged for moderation: " + moderationResult.reason)

    // Step 5: Insert review
    reviewId = generateUUID()
    database.insert("reviews", {
        "id": reviewId,
        "asset_id": assetId,
        "user_id": userId,
        "rating": rating,
        "review_text": reviewText,
        "created_at": currentTimestamp(),
        "updated_at": currentTimestamp(),
        "helpful_count": 0,
        "flagged": false
    })

    // Step 6: Recalculate aggregate rating
    aggregateRating = calculateAggregateRating(assetId)
    database.execute(
        "UPDATE assets SET average_rating = ?, review_count = review_count + 1 WHERE id = ?",
        aggregateRating, assetId
    )

    // Step 7: Update search index
    searchIndex.update(assetId, {"average_rating": aggregateRating})

    // Step 8: Emit analytics event
    analyticsHub.emit({
        "event_type": "asset_rated",
        "asset_id": assetId,
        "user_id": userId,
        "rating": rating
    })

    // Step 9: Notify publisher (Phase 2)
    notificationService.send(
        to = asset.publisher_id,
        type = "new_review",
        data = {"asset_id": assetId, "rating": rating}
    )

    RETURN {
        "status": "success",
        "review_id": reviewId,
        "aggregate_rating": aggregateRating
    }
END FUNCTION

FUNCTION calculateAggregateRating(assetId):
    // Weighted average: recent reviews count more
    reviews = database.query(
        "SELECT rating, created_at FROM reviews WHERE asset_id = ? ORDER BY created_at DESC",
        assetId
    )

    IF reviews.count == 0:
        RETURN null

    totalWeight = 0
    weightedSum = 0

    FOR review IN reviews:
        // Exponential decay: newer reviews have more weight
        daysSinceReview = (currentTimestamp() - review.created_at) / 86400
        weight = exp(-0.01 * daysSinceReview)  // Half-life ~69 days

        weightedSum += review.rating * weight
        totalWeight += weight
    END FOR

    aggregateRating = weightedSum / totalWeight
    RETURN round(aggregateRating, 2)
END FUNCTION

FUNCTION detectReviewManipulation(assetId):
    // Phase 2: Detect suspicious rating patterns
    reviews = database.query(
        "SELECT user_id, rating, created_at FROM reviews WHERE asset_id = ?",
        assetId
    )

    // Flag 1: Burst of 5-star reviews in short time
    recentFiveStars = countWhere(reviews, r => r.rating == 5 AND r.created_at > yesterday())
    IF recentFiveStars > 10:
        alertGovernanceTeam("Possible review manipulation", assetId)

    // Flag 2: All reviews from same organization
    organizations = getOrganizations(reviews.map(r => r.user_id))
    IF organizations.unique().count == 1 AND reviews.count > 5:
        alertGovernanceTeam("Reviews from single organization", assetId)

    // Flag 3: Suspicious user patterns (new accounts, single review)
    suspiciousUsers = 0
    FOR review IN reviews:
        user = getUser(review.user_id)
        IF user.account_age_days < 7 OR user.review_count == 1:
            suspiciousUsers++

    IF suspiciousUsers / reviews.count > 0.5:
        alertGovernanceTeam("High percentage of suspicious reviewers", assetId)
END FUNCTION
```

## 2.5 Policy Verification Logic

```
FUNCTION verifyPolicyCompliance(asset):
    // Step 1: Fetch applicable policies
    policies = policyEngine.getPolicies({
        "asset_type": asset.type,
        "organization_id": asset.publisher_organization_id,
        "tags": asset.tags
    })

    violations = []

    // Step 2: Check each policy
    FOR policy IN policies:
        result = evaluatePolicy(policy, asset)
        IF result.violated:
            violations.append({
                "policy_id": policy.id,
                "policy_name": policy.name,
                "severity": policy.severity,
                "violation_details": result.details
            })
    END FOR

    // Step 3: Check license compliance
    IF NOT isApprovedLicense(asset.license):
        violations.append({
            "policy_id": "LICENSE_001",
            "policy_name": "Approved License Requirement",
            "severity": "HIGH",
            "violation_details": "License '" + asset.license + "' not in approved list"
        })

    // Step 4: Check metadata completeness
    requiredFields = ["description", "readme", "version", "category"]
    FOR field IN requiredFields:
        IF NOT asset.has(field) OR isEmpty(asset[field]):
            violations.append({
                "policy_id": "METADATA_001",
                "policy_name": "Complete Metadata Required",
                "severity": "MEDIUM",
                "violation_details": "Missing required field: " + field
            })
    END FOR

    // Step 5: Malware scan (asynchronous)
    IF asset.type == "model" OR asset.type == "bundle":
        scanResult = malwareScanner.scan(asset.storage_url)
        IF scanResult.threats_detected > 0:
            violations.append({
                "policy_id": "SECURITY_001",
                "policy_name": "Malware-Free Requirement",
                "severity": "CRITICAL",
                "violation_details": "Detected threats: " + scanResult.threat_names
            })
    END IF

    // Step 6: Check size limits
    IF asset.size_bytes > policy.max_asset_size:
        violations.append({
            "policy_id": "SIZE_001",
            "policy_name": "Asset Size Limit",
            "severity": "MEDIUM",
            "violation_details": "Asset size " + formatBytes(asset.size_bytes) + " exceeds limit"
        })
    END IF

    // Step 7: Return compliance result
    IF violations.count > 0:
        highSeverity = violations.filter(v => v.severity IN ["HIGH", "CRITICAL"])

        RETURN {
            "compliant": highSeverity.count == 0,
            "violations": violations,
            "action": highSeverity.count > 0 ? "BLOCK" : "WARN"
        }
    ELSE:
        RETURN {
            "compliant": true,
            "violations": [],
            "action": "ALLOW"
        }
    END IF
END FUNCTION

FUNCTION handlePolicyUpdate(policyUpdate):
    // Triggered when Policy Engine updates a policy
    affectedAssets = database.query(
        "SELECT id FROM assets WHERE policy_applies(?, id)",
        policyUpdate.policy_id
    )

    FOR assetId IN affectedAssets:
        asset = getAsset(assetId)
        complianceResult = verifyPolicyCompliance(asset)

        IF NOT complianceResult.compliant:
            // Retire non-compliant asset
            database.execute(
                "UPDATE assets SET status = 'retired', retired_reason = ? WHERE id = ?",
                "Policy violation: " + complianceResult.violations,
                assetId
            )

            // Remove from search index
            searchIndex.delete(assetId)

            // Notify publisher
            notificationService.send(
                to = asset.publisher_id,
                type = "asset_retired",
                data = {
                    "asset_id": assetId,
                    "reason": complianceResult.violations
                }
            )

            logEvent("asset_retired_policy", assetId, policyUpdate.policy_id)
    END FOR
END FUNCTION
```

---

# SPARC Phase 3: ARCHITECTURE

## 3.1 Component Breakdown

### 3.1.1 System Context Diagram (Text-Based)

```
┌─────────────────────────────────────────────────────────────────┐
│                     LLM-MARKETPLACE ECOSYSTEM                    │
│                                                                  │
│  ┌──────────┐        ┌──────────────────┐       ┌────────────┐ │
│  │   Web    │───────▶│                  │──────▶│ LLM-Registry│ │
│  │    UI    │        │  API Gateway     │       └────────────┘ │
│  └──────────┘        │  (Auth, Rate     │                       │
│                      │   Limiting)       │       ┌────────────┐ │
│  ┌──────────┐        │                  │──────▶│  Policy    │ │
│  │   CLI    │───────▶│                  │       │  Engine    │ │
│  │   Tool   │        └────────┬─────────┘       └────────────┘ │
│  └──────────┘                 │                                 │
│                               │                 ┌────────────┐  │
│  ┌──────────┐                 │                 │ Analytics  │  │
│  │ External │───────▶         ▼                 │    Hub     │  │
│  │   Apps   │        ┌────────────────┐        └─────▲──────┘  │
│  └──────────┘        │                │              │          │
│                      │   Marketplace  │              │          │
│                      │   Core Service │──────────────┘          │
│                      │                │                         │
│                      └────────┬───────┘        ┌────────────┐  │
│                               │                │ Governance │  │
│                               │                │ Dashboard  │  │
│                               │                └─────▲──────┘  │
│                               │                      │          │
│                               ▼                      │          │
│  ┌────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┴──────┐   │
│  │  S3    │  │Postgres  │  │Elastic-  │  │   Metrics &    │   │
│  │Storage │  │Database  │  │ search   │  │    Logs        │   │
│  └────────┘  └──────────┘  └──────────┘  └────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.1.2 Core Components

#### Component: API Gateway

**Responsibility:** Request routing, authentication, rate limiting, request validation

**Technology:** Node.js + Express.js + Kong

**Interfaces:**
- REST API endpoints (public-facing)
- JWT token validation
- Rate limiting middleware
- Request/response logging

**Key Functions:**
- Authenticate incoming requests via JWT
- Enforce rate limits (100 req/min per user)
- Route requests to backend services
- Transform responses to standard format
- Collect API metrics

**Dependencies:**
- Redis (rate limiting state)
- Auth0/Cognito (SSO integration)

#### Component: Marketplace Core Service

**Responsibility:** Business logic for publishing, searching, retrieving, rating

**Technology:** Node.js + TypeScript + Express.js

**Modules:**
1. **Publishing Module**
   - Asset validation
   - Checksum calculation
   - Storage orchestration
   - Registry sync

2. **Search Module**
   - Query parsing
   - Elasticsearch integration
   - Result ranking
   - Facet calculation

3. **Retrieval Module**
   - Permission checking
   - Download management
   - Dependency resolution
   - Cache management

4. **Rating Module**
   - Review CRUD operations
   - Aggregate calculation
   - Moderation integration

**Interfaces:**
- REST API (internal)
- gRPC (for Policy Engine)
- Kafka producer (Analytics events)

**Dependencies:**
- PostgreSQL (metadata storage)
- Elasticsearch (search index)
- S3 (asset storage)
- Redis (caching)

#### Component: Asset Storage

**Responsibility:** Durable storage of asset files

**Technology:** AWS S3 with CloudFront CDN (Phase 2)

**Structure:**
```
llm-marketplace-assets/
  {asset-id}/
    {version}/
      package.tar.gz
      manifest.json
      metadata.json
```

**Features:**
- Versioned buckets
- Server-side encryption (AES-256)
- Lifecycle policies (archive old versions to Glacier after 1 year)
- Pre-signed URLs for downloads
- Access logging

#### Component: Metadata Database

**Responsibility:** Store asset metadata, reviews, users, download logs

**Technology:** PostgreSQL 15

**Schema:**

```sql
-- Assets table
CREATE TABLE assets (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    readme TEXT,
    category VARCHAR(100) NOT NULL,
    tags TEXT[],
    license VARCHAR(100) NOT NULL,
    publisher_id UUID REFERENCES users(id),
    storage_url VARCHAR(500) NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    size_bytes BIGINT NOT NULL,
    published_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'active',  -- active, retired, flagged
    download_count INTEGER DEFAULT 0,
    average_rating DECIMAL(3,2),
    review_count INTEGER DEFAULT 0,
    visibility VARCHAR(20) DEFAULT 'public',  -- public, organization, private
    UNIQUE(name, version)
);

CREATE INDEX idx_assets_category ON assets(category);
CREATE INDEX idx_assets_publisher ON assets(publisher_id);
CREATE INDEX idx_assets_published ON assets(published_at DESC);
CREATE INDEX idx_assets_rating ON assets(average_rating DESC);

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    organization_id UUID,
    avatar_url VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    role VARCHAR(50) DEFAULT 'user'  -- user, publisher, admin
);

-- Reviews table
CREATE TABLE reviews (
    id UUID PRIMARY KEY,
    asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    review_text TEXT CHECK (LENGTH(review_text) BETWEEN 100 AND 2000),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    helpful_count INTEGER DEFAULT 0,
    flagged BOOLEAN DEFAULT false,
    UNIQUE(asset_id, user_id)
);

CREATE INDEX idx_reviews_asset ON reviews(asset_id);
CREATE INDEX idx_reviews_rating ON reviews(rating);

-- Download logs table
CREATE TABLE download_logs (
    id SERIAL PRIMARY KEY,
    asset_id UUID REFERENCES assets(id),
    user_id UUID REFERENCES users(id),
    version VARCHAR(50),
    downloaded_at TIMESTAMP NOT NULL DEFAULT NOW(),
    size_bytes BIGINT,
    duration_seconds DECIMAL(10,2),
    ip_address INET
);

CREATE INDEX idx_downloads_asset ON download_logs(asset_id);
CREATE INDEX idx_downloads_user ON download_logs(user_id);
CREATE INDEX idx_downloads_date ON download_logs(downloaded_at);

-- Dependencies table (Phase 2)
CREATE TABLE asset_dependencies (
    asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
    dependency_id UUID REFERENCES assets(id),
    version_constraint VARCHAR(100),  -- e.g., ">=1.0.0,<2.0.0"
    PRIMARY KEY (asset_id, dependency_id)
);
```

#### Component: Search Index

**Responsibility:** Fast full-text and semantic search

**Technology:** Elasticsearch 8.x

**Index Mapping:**

```json
{
  "mappings": {
    "properties": {
      "id": {"type": "keyword"},
      "name": {
        "type": "text",
        "analyzer": "standard",
        "fields": {
          "keyword": {"type": "keyword"}
        }
      },
      "description": {
        "type": "text",
        "analyzer": "english"
      },
      "tags": {"type": "keyword"},
      "category": {"type": "keyword"},
      "license": {"type": "keyword"},
      "publisher_id": {"type": "keyword"},
      "download_count": {"type": "rank_feature"},
      "average_rating": {"type": "rank_feature"},
      "recency_score": {"type": "rank_feature"},
      "published_at": {"type": "date"},
      "embedding_vector": {
        "type": "dense_vector",
        "dims": 768,
        "index": true,
        "similarity": "cosine"
      }
    }
  }
}
```

**Features:**
- Synonym expansion (e.g., "LLM" → "large language model")
- Fuzzy matching for typos
- Aggregations for faceted search
- k-NN search for semantic similarity (Phase 2)

#### Component: Cache Layer

**Responsibility:** Cache frequently accessed data, rate limiting state

**Technology:** Redis 7.x

**Use Cases:**
- User session cache (TTL: 1 hour)
- Asset metadata cache (TTL: 5 minutes)
- Search result cache (TTL: 1 minute)
- Rate limiting counters (TTL: 1 minute)
- Download URL pre-signing cache (TTL: 15 minutes)

**Data Structures:**
```
user:{user_id}:session         → Hash (user metadata)
asset:{asset_id}:metadata      → Hash (asset metadata)
search:{query_hash}:results    → List (result IDs)
ratelimit:{user_id}:minute     → String (request count)
download:{asset_id}:url        → String (pre-signed S3 URL)
```

### 3.1.3 Service Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                      Service Boundaries                          │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Publishing Service                                        │  │
│  │ - Owns: Asset creation, validation, storage              │  │
│  │ - Reads: Policy compliance status                        │  │
│  │ - Writes: Asset metadata to DB, search index, Registry   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Discovery Service                                         │  │
│  │ - Owns: Search, filtering, recommendations               │  │
│  │ - Reads: Search index, asset metadata, analytics data    │  │
│  │ - Writes: Search logs to Analytics Hub                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Retrieval Service                                         │  │
│  │ - Owns: Downloads, caching, dependency resolution        │  │
│  │ - Reads: Asset metadata, policy status, dependencies     │  │
│  │ - Writes: Download logs, cache entries                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Rating Service                                            │  │
│  │ - Owns: Reviews, ratings, moderation                     │  │
│  │ - Reads: Download history (verify eligibility)           │  │
│  │ - Writes: Reviews to DB, updated ratings to search index │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Integration Service (Adapters)                            │  │
│  │ - Registry Adapter: Sync asset metadata                  │  │
│  │ - Policy Adapter: Validate compliance                    │  │
│  │ - Analytics Adapter: Emit events                         │  │
│  │ - Governance Adapter: Export metrics/reports             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

Service Communication:
- Internal services: gRPC (high performance)
- External integrations: REST + Kafka
- Client-facing: REST API over HTTPS
```

## 3.2 Data Flow Diagrams (Text-Based)

### 3.2.1 Publishing Flow

```
┌──────┐
│ User │
└──┬───┘
   │ 1. POST /assets (package + metadata)
   ▼
┌────────────┐
│API Gateway │
└──┬─────────┘
   │ 2. Validate JWT, rate limit
   ▼
┌─────────────────┐
│ Publishing Svc  │
└──┬──────────────┘
   │ 3. Validate metadata
   ▼
┌────────────────┐
│ Policy Engine  │
│ (gRPC call)    │
└──┬─────────────┘
   │ 4. Return compliance status
   ▼
┌──────────────┐
│Publishing Svc│────5. Upload to S3────────────▶┌──────────┐
└──┬───────────┘                                 │   S3     │
   │                                             └──────────┘
   │ 6. Insert metadata
   ▼
┌──────────┐
│PostgreSQL│
└──────────┘
   │ 7. Index for search
   ▼
┌──────────────┐
│Elasticsearch │
└──────────────┘
   │ 8. Sync to Registry
   ▼
┌──────────────┐
│ LLM-Registry │
└──────────────┘
   │ 9. Emit event
   ▼
┌──────────────┐
│Analytics Hub │
│  (Kafka)     │
└──────────────┘
   │ 10. Return success
   ▼
┌──────┐
│ User │
└──────┘
```

### 3.2.2 Search Flow

```
┌──────┐
│ User │
└──┬───┘
   │ 1. GET /assets?q=chatbot&category=prompts
   ▼
┌────────────┐
│API Gateway │
└──┬─────────┘
   │ 2. Authenticate, rate limit
   ▼
┌──────────────┐
│Discovery Svc │
└──┬───────────┘
   │ 3. Check cache
   ▼
┌───────┐
│ Redis │
└───┬───┘
    │ 4. Cache miss
    ▼
┌──────────────┐
│Elasticsearch │
└──┬───────────┘
   │ 5. Return result IDs + scores
   ▼
┌──────────────┐
│Discovery Svc │────6. Fetch metadata (batch)──▶┌──────────┐
└──┬───────────┘                                 │PostgreSQL│
   │◀─────────7. Return metadata────────────────┘          │
   │                                             └──────────┘
   │ 8. Enrich with analytics
   ▼
┌──────────────┐
│Analytics Hub │
│   (REST)     │
└──┬───────────┘
   │ 9. Return trending scores
   ▼
┌──────────────┐
│Discovery Svc │───10. Cache results (1 min)────▶┌───────┐
└──┬───────────┘                                  │ Redis │
   │                                              └───────┘
   │ 11. Return enriched results
   ▼
┌──────┐
│ User │
└──────┘
```

### 3.2.3 Download Flow

```
┌──────┐
│ User │
└──┬───┘
   │ 1. GET /assets/{id}/download?version=1.2.3
   ▼
┌────────────┐
│API Gateway │
└──┬─────────┘
   │ 2. Authenticate
   ▼
┌──────────────┐
│Retrieval Svc │
└──┬───────────┘
   │ 3. Fetch asset metadata
   ▼
┌──────────┐
│PostgreSQL│
└──┬───────┘
   │ 4. Return metadata + storage URL
   ▼
┌──────────────┐
│Retrieval Svc │────5. Check policy compliance──▶┌──────────────┐
└──┬───────────┘                                  │Policy Engine │
   │◀────6. Return compliant: true───────────────┘              │
   │                                              └──────────────┘
   │ 7. Check cache for pre-signed URL
   ▼
┌───────┐
│ Redis │
└───┬───┘
    │ 8. Cache miss
    ▼
┌──────────────┐
│Retrieval Svc │────9. Generate pre-signed URL──▶┌──────────┐
└──┬───────────┘                                  │   S3     │
   │◀────10. Return signed URL (15 min TTL)──────┘          │
   │                                              └──────────┘
   │ 11. Cache URL
   ▼
┌───────┐
│ Redis │
└───────┘
   │ 12. Return URL to user
   ▼
┌──────┐
│ User │────13. Direct download from S3──────────▶┌──────────┐
└──┬───┘                                           │   S3     │
   │◀──────14. Stream asset file─────────────────┘          │
   │                                              └──────────┘
   │ 15. Log download event
   ▼
┌──────────────┐
│Analytics Hub │
│  (Kafka)     │
└──────────────┘
```

## 3.3 Technology Selection Matrix

| Component | Options Evaluated | Selected | Rationale |
|-----------|-------------------|----------|-----------|
| **Backend Framework** | Express.js, Fastify, NestJS | **Express.js** | Mature ecosystem, team familiarity, extensive middleware |
| **Database** | PostgreSQL, MongoDB, DynamoDB | **PostgreSQL 15** | ACID compliance, rich query capabilities, JSON support |
| **Search Engine** | Elasticsearch, Algolia, Meilisearch | **Elasticsearch 8.x** | Open-source, vector search, powerful aggregations |
| **Object Storage** | AWS S3, MinIO, Azure Blob | **AWS S3** | 99.999999999% durability, CDN integration, cost-effective |
| **Cache** | Redis, Memcached | **Redis 7.x** | Rich data structures, persistence, pub/sub |
| **Message Queue** | Kafka, RabbitMQ, SQS | **Kafka** | Already used by Analytics Hub, high throughput |
| **API Gateway** | Kong, AWS API Gateway, Traefik | **Kong** | Open-source, plugin ecosystem, rate limiting |
| **Container Orchestration** | Kubernetes, ECS, Docker Swarm | **Kubernetes** | Industry standard, auto-scaling, service mesh support |
| **CI/CD** | GitHub Actions, GitLab CI, Jenkins | **GitHub Actions** | Integrated with repo, free for open-source |
| **Monitoring** | Prometheus+Grafana, DataDog, New Relic | **Prometheus+Grafana** | Open-source, flexible, Kubernetes-native |
| **Logging** | ELK Stack, Splunk, Loki | **ELK Stack (Elasticsearch+Logstash+Kibana)** | Integrates with existing Elasticsearch |
| **Auth** | Auth0, AWS Cognito, Keycloak | **AWS Cognito** | Native AWS integration, SSO support, scalable |
| **Frontend** | React, Vue, Angular | **React 18** | Large ecosystem, team expertise, Next.js for SSR |
| **CLI Framework** | Commander.js, oclif, yargs | **oclif** | Plugin architecture, autocomplete, TypeScript support |

## 3.4 Deployment Patterns

### 3.4.1 Infrastructure Architecture (AWS)

```
┌─────────────────────────────────────────────────────────────────┐
│                        AWS Cloud (us-east-1)                     │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Route 53                                                    │ │
│  │ marketplace.company.com                                     │ │
│  └───────────────────────┬────────────────────────────────────┘ │
│                          │                                       │
│  ┌───────────────────────▼────────────────────────────────────┐ │
│  │ CloudFront CDN (Phase 2)                                   │ │
│  │ - Cache static assets                                      │ │
│  │ - Edge locations worldwide                                 │ │
│  └───────────────────────┬────────────────────────────────────┘ │
│                          │                                       │
│  ┌───────────────────────▼────────────────────────────────────┐ │
│  │ Application Load Balancer (ALB)                            │ │
│  │ - SSL termination (TLS 1.3)                                │ │
│  │ - Health checks                                            │ │
│  └───────────────────────┬────────────────────────────────────┘ │
│                          │                                       │
│  ┌───────────────────────▼────────────────────────────────────┐ │
│  │ EKS Cluster (Kubernetes)                                   │ │
│  │                                                             │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │ │
│  │  │ API Gateway │  │ API Gateway │  │ API Gateway │        │ │
│  │  │   Pod 1     │  │   Pod 2     │  │   Pod 3     │        │ │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │ │
│  │         │                │                │                 │ │
│  │  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐        │ │
│  │  │Marketplace  │  │Marketplace  │  │Marketplace  │        │ │
│  │  │Service Pod 1│  │Service Pod 2│  │Service Pod 3│        │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘        │ │
│  │                                                             │ │
│  │  Horizontal Pod Autoscaler (HPA):                          │ │
│  │  - Min: 3 pods, Max: 20 pods                               │ │
│  │  - Target: 70% CPU, 80% memory                             │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Data Layer                                                  │ │
│  │                                                             │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │ │
│  │  │ RDS Postgres │  │ Elasticsearch│  │ ElastiCache  │     │ │
│  │  │ Multi-AZ     │  │ 3-node cluster│  │ Redis Cluster│     │ │
│  │  │ Primary +    │  │               │  │ 6 nodes      │     │ │
│  │  │ Read Replica │  │               │  │              │     │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘     │ │
│  │                                                             │ │
│  │  ┌──────────────┐  ┌──────────────┐                       │ │
│  │  │ S3 Bucket    │  │ S3 Glacier   │                       │ │
│  │  │ (Hot data)   │  │ (Archive)    │                       │ │
│  │  │ Versioning ON│  │ (>1 year old)│                       │ │
│  │  └──────────────┘  └──────────────┘                       │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ External Services                                           │ │
│  │                                                             │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │ │
│  │  │ LLM-Registry │  │Policy Engine │  │Analytics Hub │     │ │
│  │  │ (VPC Peering)│  │ (gRPC)       │  │ (Kafka)      │     │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘     │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Monitoring & Logging                                        │ │
│  │                                                             │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │ │
│  │  │ Prometheus   │  │ Grafana      │  │ ELK Stack    │     │ │
│  │  │ (Metrics)    │  │ (Dashboards) │  │ (Logs)       │     │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘     │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.4.2 Deployment Strategy

**Blue-Green Deployment:**
- Maintain two identical production environments (Blue & Green)
- Deploy new version to inactive environment
- Run smoke tests and health checks
- Switch traffic via load balancer DNS update
- Keep old version running for 1 hour for rollback

**Rollout Phases:**
1. **Canary (5%)**: Route 5% traffic to new version, monitor for 15 minutes
2. **Staged (25%)**: Increase to 25%, monitor for 30 minutes
3. **Full (100%)**: Complete rollout if no errors

**Rollback Criteria:**
- Error rate > 1%
- P99 latency > 1000ms
- Health check failures > 10%

### 3.4.3 High Availability Configuration

**Multi-AZ Deployment:**
- Application pods distributed across 3 availability zones
- Database primary in AZ-1, read replica in AZ-2
- Elasticsearch cluster: 1 master per AZ (3 total)
- Redis cluster: 2 shards × 3 replicas = 6 nodes

**Disaster Recovery:**
- RPO (Recovery Point Objective): 1 hour
- RTO (Recovery Time Objective): 15 minutes
- Daily automated backups to S3 (retained 30 days)
- Cross-region replication for critical data (Phase 3)

**Health Checks:**
```
Liveness Probe:
  - Endpoint: GET /health/live
  - Interval: 10s
  - Timeout: 5s
  - Failure threshold: 3

Readiness Probe:
  - Endpoint: GET /health/ready
  - Interval: 5s
  - Timeout: 3s
  - Failure threshold: 2
```

---

# SPARC Phase 4: REFINEMENT

## 4.1 Performance Optimization Strategies

### 4.1.1 Database Optimization

**Query Optimization:**
```sql
-- Before: Slow query (3000ms)
SELECT a.*, u.name as publisher_name, COUNT(r.id) as review_count
FROM assets a
LEFT JOIN users u ON a.publisher_id = u.id
LEFT JOIN reviews r ON a.id = r.asset_id
WHERE a.category = 'models'
GROUP BY a.id, u.name
ORDER BY a.download_count DESC
LIMIT 20;

-- After: Optimized query (45ms)
-- 1. Materialize review counts in assets table
-- 2. Denormalize publisher name
-- 3. Add covering index
CREATE INDEX idx_assets_category_downloads ON assets(category, download_count DESC)
INCLUDE (id, name, description, publisher_name, review_count);

SELECT id, name, description, publisher_name, review_count, download_count
FROM assets
WHERE category = 'models'
ORDER BY download_count DESC
LIMIT 20;
```

**Connection Pooling:**
- Pool size: 20-50 connections per pod
- Idle timeout: 30 seconds
- Max lifetime: 30 minutes
- Statement caching enabled

**Read Replicas:**
- Route read-only queries (searches, asset details) to read replicas
- Write queries (publish, rate) to primary
- Use connection string routing: `postgres://primary/` vs `postgres://replica/`

### 4.1.2 Caching Strategy

**Multi-Layer Cache:**

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Application Cache (In-Memory)                      │
│ - Frequently used data (user sessions, popular assets)      │
│ - Size: 256MB per pod                                       │
│ - Eviction: LRU                                             │
│ - TTL: 1-5 minutes                                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Redis Cache (Distributed)                          │
│ - Asset metadata, search results, user profiles             │
│ - Size: 16GB cluster                                        │
│ - TTL: 5-60 minutes (varies by data type)                   │
│ - Invalidation: Event-driven (on updates)                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: CDN Cache (CloudFront)                             │
│ - Asset files, static content                               │
│ - Edge locations: Global                                    │
│ - TTL: 24 hours                                             │
│ - Invalidation: Manual or webhook-triggered                 │
└─────────────────────────────────────────────────────────────┘
```

**Cache Invalidation:**
```javascript
// Event-driven invalidation
function onAssetUpdated(assetId) {
    // Invalidate specific asset cache
    redis.del(`asset:${assetId}:metadata`);

    // Invalidate search caches containing this asset
    redis.del(`search:*:results`);  // Simple approach: clear all search caches

    // Invalidate CDN cache for asset files
    cloudfront.createInvalidation({
        Paths: [`/assets/${assetId}/*`]
    });

    // Update search index
    elasticsearch.update(assetId, updatedData);
}
```

### 4.1.3 Search Performance

**Index Sharding:**
- Primary index: 3 shards (for 100K assets)
- Replica factor: 2 (for fault tolerance)
- Shard allocation: Distribute evenly across nodes

**Query Optimization:**
```json
{
  "query": {
    "bool": {
      "must": {
        "multi_match": {
          "query": "chatbot prompt",
          "fields": ["name^3", "description^2", "tags^2"]
        }
      },
      "filter": [
        {"term": {"category": "prompts"}},
        {"range": {"average_rating": {"gte": 4.0}}}
      ]
    }
  },
  "aggs": {
    "categories": {
      "terms": {"field": "category", "size": 10}
    }
  },
  "size": 20,
  "_source": ["id", "name", "description", "average_rating"],
  "track_total_hits": false  // Faster if exact count not needed
}
```

**Result Pagination:**
- Use `search_after` instead of `from`/`size` for deep pagination
- Limit max results to 10,000 (prevents resource exhaustion)

### 4.1.4 Asset Download Optimization

**Pre-signed URL Caching:**
- Generate pre-signed S3 URLs with 15-minute expiration
- Cache URLs in Redis to avoid repeated signature calculations
- Cache key: `download:${assetId}:${version}:url`
- TTL: 10 minutes (buffer before expiration)

**Range Request Support:**
```javascript
// Enable resumable downloads
app.get('/assets/:id/download', async (req, res) => {
    const range = req.headers.range;

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': end - start + 1
        });

        const stream = s3.getObject({
            Bucket: 'llm-marketplace-assets',
            Key: assetKey,
            Range: `bytes=${start}-${end}`
        }).createReadStream();

        stream.pipe(res);
    } else {
        // Full download
    }
});
```

**Parallel Downloads (Phase 2):**
- Split large files (>1GB) into 100MB chunks
- Download chunks in parallel (max 4 concurrent)
- Reassemble locally after checksum verification

## 4.2 Scalability Testing Approach

### 4.2.1 Load Testing Strategy

**Tools:** Apache JMeter, k6, Locust

**Test Scenarios:**

**Scenario 1: Normal Load**
- 1,000 concurrent users
- Duration: 30 minutes
- Request mix:
  - 60% searches
  - 25% asset detail views
  - 10% downloads
  - 5% publishes

**Scenario 2: Peak Load**
- 10,000 concurrent users
- Duration: 15 minutes
- Request mix: Same as normal

**Scenario 3: Spike Load**
- Ramp from 1,000 to 10,000 users in 2 minutes
- Sustain for 10 minutes
- Validate auto-scaling responsiveness

**Scenario 4: Stress Test**
- Gradually increase load until system breaks
- Identify breaking point and bottlenecks
- Target: >15,000 concurrent users (Phase 2)

**Success Criteria:**
- P95 response time <200ms (search)
- P95 response time <500ms (API)
- Error rate <0.1%
- Successful auto-scaling (target utilization: 70% CPU)
- No database connection pool exhaustion

### 4.2.2 Scalability Metrics

**Horizontal Scalability:**
```
Pods = ceil((Total RPS × Avg Response Time) / (Target CPU% × CPU per Pod))

Example:
- Target: 10,000 RPS
- Avg response time: 50ms = 0.05s
- Target CPU: 70%
- CPU per pod: 2 cores

Pods = ceil((10,000 × 0.05) / (0.7 × 2)) = ceil(357) = 357 pods

Actual scaling with efficiency factor (0.8):
Pods needed = 357 / 0.8 ≈ 446 pods
```

**Database Scalability:**
- Vertical scaling: Up to db.r6g.8xlarge (32 vCPU, 256GB RAM)
- Read replicas: 3-5 replicas for read-heavy workload
- Connection pooling: PgBouncer for 1000+ concurrent connections

**Elasticsearch Scalability:**
- Add data nodes: Start with 3, scale to 10 for 1M assets
- Increase shard count: 3 → 6 → 12 as data grows
- Use tiered storage: Hot nodes (SSD), warm nodes (HDD) for old data

### 4.2.3 Cost Optimization

**Right-Sizing:**
- Start with t3.medium pods, monitor, then adjust
- Use spot instances for non-critical workloads (20% savings)
- Reserved instances for baseline capacity (30% savings)

**Storage Optimization:**
- S3 Intelligent-Tiering for automatic cost optimization
- Archive versions >1 year old to Glacier (90% cheaper)
- Compress large assets (models) before upload

**Data Transfer:**
- Use CloudFront CDN to reduce S3 data transfer costs
- Enable S3 Transfer Acceleration for uploads (Phase 2)

## 4.3 Security Hardening

### 4.3.1 Authentication & Authorization

**JWT Token Security:**
```javascript
// Token structure
{
  "sub": "user-uuid",
  "email": "user@company.com",
  "role": "publisher",
  "org_id": "org-uuid",
  "iat": 1700000000,
  "exp": 1700003600,  // 1 hour expiration
  "jti": "token-uuid"  // Unique token ID for revocation
}

// Token validation
function validateToken(token) {
    // 1. Verify signature
    const decoded = jwt.verify(token, PUBLIC_KEY, {
        algorithms: ['RS256'],
        issuer: 'llm-marketplace',
        audience: 'marketplace-api'
    });

    // 2. Check revocation list (Redis)
    if (redis.sismember('revoked_tokens', decoded.jti)) {
        throw new Error('Token has been revoked');
    }

    // 3. Check expiration (JWT lib handles this)

    return decoded;
}
```

**RBAC (Role-Based Access Control):**
```javascript
const permissions = {
    'user': ['search', 'download', 'rate'],
    'publisher': ['search', 'download', 'rate', 'publish', 'update_own', 'delete_own'],
    'moderator': ['search', 'download', 'flag_review', 'remove_review'],
    'admin': ['*']  // All permissions
};

function authorize(user, action, resource) {
    const userRole = user.role;

    // Check global permissions
    if (permissions[userRole].includes(action) || permissions[userRole].includes('*')) {
        // Check resource ownership for restricted actions
        if (action === 'update_own' || action === 'delete_own') {
            return resource.publisher_id === user.id;
        }
        return true;
    }

    return false;
}
```

### 4.3.2 Input Validation & Sanitization

**Metadata Validation:**
```javascript
const assetMetadataSchema = {
    name: {
        type: 'string',
        minLength: 3,
        maxLength: 100,
        pattern: '^[a-zA-Z0-9-_]+$',  // Prevent XSS in URLs
        required: true
    },
    description: {
        type: 'string',
        minLength: 50,
        maxLength: 5000,
        sanitize: 'html',  // Strip dangerous HTML tags
        required: true
    },
    tags: {
        type: 'array',
        items: {type: 'string', maxLength: 30},
        maxItems: 10,
        required: true
    },
    license: {
        type: 'string',
        enum: ['MIT', 'Apache-2.0', 'GPL-3.0', 'BSD-3-Clause', 'Proprietary'],
        required: true
    }
};

function validateAndSanitize(metadata) {
    const validator = new JSONSchemaValidator(assetMetadataSchema);
    const errors = validator.validate(metadata);

    if (errors.length > 0) {
        throw new ValidationError(errors);
    }

    // Sanitize HTML in description
    metadata.description = DOMPurify.sanitize(metadata.description, {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'code', 'pre'],
        ALLOWED_ATTR: ['href']
    });

    return metadata;
}
```

### 4.3.3 Malware Scanning

**ClamAV Integration:**
```javascript
async function scanAssetForMalware(filePath) {
    const clamav = require('clamscan')();

    const {isInfected, viruses} = await clamav.scanFile(filePath);

    if (isInfected) {
        logSecurityEvent('malware_detected', {
            file: filePath,
            viruses: viruses
        });

        // Delete file
        await fs.unlink(filePath);

        throw new SecurityError(`Malware detected: ${viruses.join(', ')}`);
    }

    return true;
}
```

**File Type Validation:**
```javascript
const allowedMimeTypes = {
    'model': ['application/octet-stream', 'application/x-tar', 'application/gzip'],
    'prompt': ['text/plain', 'application/json'],
    'config': ['application/json', 'application/yaml', 'text/yaml']
};

function validateFileType(file, assetType) {
    const actualMimeType = mime.lookup(file.name);

    if (!allowedMimeTypes[assetType].includes(actualMimeType)) {
        throw new ValidationError(`Invalid file type for ${assetType}: ${actualMimeType}`);
    }
}
```

### 4.3.4 Rate Limiting

**Implementation:**
```javascript
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');

// API rate limit: 100 requests per minute per user
const apiLimiter = rateLimit({
    store: new RedisStore({
        client: redisClient,
        prefix: 'rl:api:'
    }),
    windowMs: 60 * 1000,  // 1 minute
    max: 100,
    keyGenerator: (req) => req.user.id,
    handler: (req, res) => {
        res.status(429).json({
            error: 'Too many requests',
            retryAfter: 60
        });
    }
});

// Download rate limit: 10 downloads per hour per user
const downloadLimiter = rateLimit({
    store: new RedisStore({
        client: redisClient,
        prefix: 'rl:download:'
    }),
    windowMs: 60 * 60 * 1000,  // 1 hour
    max: 10,
    keyGenerator: (req) => req.user.id
});

app.use('/api', apiLimiter);
app.use('/assets/:id/download', downloadLimiter);
```

### 4.3.5 Secrets Management

**AWS Secrets Manager Integration:**
```javascript
const AWS = require('aws-sdk');
const secretsManager = new AWS.SecretsManager();

async function getSecret(secretName) {
    const data = await secretsManager.getSecretValue({
        SecretId: secretName
    }).promise();

    if (data.SecretString) {
        return JSON.parse(data.SecretString);
    }

    throw new Error('Secret not found');
}

// Usage
const dbCredentials = await getSecret('llm-marketplace/db/credentials');
const jwtKeys = await getSecret('llm-marketplace/jwt/keys');
```

**Environment Variables:**
- Never commit secrets to Git
- Use `.env.example` with placeholder values
- Inject secrets via Kubernetes secrets at runtime

## 4.4 User Feedback Integration

### 4.4.1 Feedback Collection Mechanisms

**In-App Feedback:**
```javascript
// POST /feedback
{
  "type": "bug|feature_request|usability",
  "page": "/assets/search",
  "description": "Search filters are confusing",
  "severity": "low|medium|high",
  "user_agent": "Mozilla/5.0...",
  "screenshot_url": "https://..."  // Optional
}
```

**Usage Analytics:**
- Track feature usage via Analytics Hub
- Identify underused features (candidates for removal/improvement)
- Heatmaps on web UI (Phase 2)

**User Interviews:**
- Bi-weekly sessions with 5-10 users
- Focus on: pain points, feature requests, workflow friction

### 4.4.2 Feedback Prioritization

**RICE Scoring:**
```
Score = (Reach × Impact × Confidence) / Effort

Reach: Number of users affected per month
Impact: 0.25 (minimal), 0.5 (low), 1 (medium), 2 (high), 3 (massive)
Confidence: 0% - 100%
Effort: Person-weeks
```

**Example:**
- Feature: "Advanced search filters"
- Reach: 5,000 users/month
- Impact: 2 (high)
- Confidence: 80%
- Effort: 4 person-weeks

Score = (5000 × 2 × 0.8) / 4 = 2,000

**Prioritization Tiers:**
- P0: Security issues, data loss bugs (fix within 24 hours)
- P1: RICE score >1000 (next sprint)
- P2: RICE score 500-1000 (next 2 sprints)
- P3: RICE score <500 (backlog)

### 4.4.3 A/B Testing Framework (Phase 2)

```javascript
// Feature flags for gradual rollout
const featureFlags = {
    'semantic_search': {
        enabled: true,
        rollout_percentage: 20,  // 20% of users
        target_groups: ['beta_testers']
    },
    'personalized_recommendations': {
        enabled: false  // Not yet ready
    }
};

function isFeatureEnabled(featureName, user) {
    const flag = featureFlags[featureName];

    if (!flag || !flag.enabled) {
        return false;
    }

    // Check target groups
    if (flag.target_groups && flag.target_groups.includes(user.group)) {
        return true;
    }

    // Percentage-based rollout
    const userHash = hashCode(user.id);
    return (userHash % 100) < flag.rollout_percentage;
}
```

## 4.5 Iterative Improvement Cycles

### 4.5.1 Sprint Cadence

**2-Week Sprints:**
- Sprint Planning: Monday (2 hours)
- Daily Standups: Every day (15 minutes)
- Sprint Review: Friday week 2 (1 hour)
- Sprint Retrospective: Friday week 2 (1 hour)

**Sprint Goals (Example):**
- Sprint 1-3: MVP core features (publish, search, download)
- Sprint 4-5: Rating system
- Sprint 6: Policy integration
- Sprint 7-8: Performance optimization
- Sprint 9: Beta launch prep

### 4.5.2 Continuous Improvement Process

**Weekly Metrics Review:**
- SLA achievement (99.9% uptime)
- Performance metrics (P95, P99 latency)
- Error rates
- User satisfaction (NPS)

**Monthly Architecture Review:**
- Identify technical debt
- Plan refactoring sprints
- Evaluate new technologies

**Quarterly Product Review:**
- Analyze user feedback trends
- Adjust roadmap based on learnings
- Sunset unused features

---

# SPARC Phase 5: COMPLETION

## 5.1 MVP Scope (Phase 1: 0-3 Months)

### 5.1.1 Core Features

**Must Have:**
1. **Asset Publishing**
   - Support: Models, prompts, configs
   - CLI: `llm-marketplace publish`
   - Metadata: Name, description, category, tags, license, version
   - Storage: S3 with checksum verification
   - Validation: Schema validation, malware scan

2. **Asset Discovery**
   - Full-text search (Elasticsearch)
   - Filters: Category, license, date range
   - Sorting: Relevance, date, downloads
   - Results: 20 per page, max 10,000 total

3. **Asset Retrieval**
   - CLI: `llm-marketplace install llm://marketplace/{id}:{version}`
   - Checksum verification
   - Local caching
   - Download logging

4. **Basic Rating**
   - 5-star rating scale
   - Text reviews (100-2000 chars)
   - Aggregate rating calculation
   - Display on asset page

5. **Policy Integration**
   - Pre-publication compliance check
   - Block non-compliant assets
   - Display compliance badges

6. **Registry Sync**
   - Auto-register published assets
   - Sync metadata on updates

7. **Analytics Events**
   - Emit: publish, search, download, rate events
   - Kafka integration

8. **Web UI (Basic)**
   - Homepage with featured assets
   - Search interface
   - Asset detail page
   - Publish form

**Won't Have (MVP):**
- Advanced search (semantic, autocomplete)
- Dependency resolution
- CDN acceleration
- User dashboards
- Notifications
- Monetization
- P2P distribution

### 5.1.2 MVP Milestones

**Month 1: Foundation**
- Week 1-2: Infrastructure setup (EKS, RDS, S3, Elasticsearch)
- Week 3: Authentication & authorization (JWT, RBAC)
- Week 4: Database schema & API scaffolding

**Month 2: Core Functionality**
- Week 5-6: Publishing service (upload, validate, store)
- Week 7: Search service (index, query, rank)
- Week 8: Retrieval service (download, verify)

**Month 3: Polish & Launch**
- Week 9: Rating service
- Week 10: Policy & Registry integrations
- Week 11: Web UI
- Week 12: Testing, bug fixes, documentation

**MVP Validation Metrics:**
- 50+ assets published
- 500+ searches performed
- 200+ downloads
- 99% uptime
- <300ms search response time (P95)

## 5.2 Beta Features (Phase 2: 3-6 Months)

### 5.2.1 Advanced Discovery

**Semantic Search:**
- Generate embeddings for asset descriptions (Sentence-BERT)
- k-NN search in Elasticsearch
- Hybrid ranking: combine keyword + semantic scores

**Autocomplete:**
- Suggest queries as user types
- Based on popular searches + asset names
- Elasticsearch completion suggester

**Related Assets:**
- Content-based filtering (similar tags, descriptions)
- Collaborative filtering (users who downloaded X also downloaded Y)

**Saved Searches & Alerts:**
- Users save search queries
- Email alerts when matching assets published

### 5.2.2 Enhanced Rating System

**Review Helpfulness:**
- Upvote/downvote reviews
- Sort reviews by: Most helpful, Recent, Highest/Lowest rating

**Review Moderation:**
- Flag suspicious reviews (manipulation detection)
- Admin moderation queue
- Auto-flag based on ML model (toxic content)

**Publisher Response:**
- Publishers can respond to reviews
- Displayed below review

### 5.2.3 User Dashboards

**Publisher Dashboard:**
- Assets published
- Download trends (chart)
- Rating distribution
- Recent reviews
- Compliance status

**Consumer Dashboard:**
- Download history
- Saved searches
- Bookmarked assets
- Review activity

### 5.2.4 CDN & Performance

**CloudFront Integration:**
- Serve asset files from edge locations
- Reduce latency for global users
- Cache static content (Web UI assets)

**Parallel Downloads:**
- Split large files into chunks
- Download in parallel
- Auto-resume on network failure

### 5.2.5 Dependency Management

**Dependency Resolution:**
- Assets declare dependencies (other assets)
- Auto-install dependencies during retrieval
- Version constraint support (semver ranges)

**Dependency Graph Visualization:**
- Show dependency tree on asset page
- Detect circular dependencies

### 5.2.6 Beta Milestones

**Month 4: Advanced Discovery**
- Week 13-14: Semantic search implementation
- Week 15: Autocomplete & suggestions
- Week 16: Saved searches & alerts

**Month 5: Enhanced Engagement**
- Week 17: Review helpfulness & moderation
- Week 18-19: User dashboards
- Week 20: Dependency resolution

**Month 6: Performance & Scale**
- Week 21: CDN integration
- Week 22: Parallel downloads
- Week 23: Load testing & optimization
- Week 24: Beta launch

**Beta Validation Metrics:**
- 1,000+ assets
- 2,000+ users
- 10,000+ downloads
- 50%+ assets with reviews
- 99.9% uptime
- <200ms search response time (P95)

## 5.3 V1 Features (Phase 3: 6-12 Months)

### 5.3.1 Monetization

**Paid Assets:**
- Publishers set pricing (one-time or subscription)
- Payment processing (Stripe integration)
- License key generation
- Revenue sharing (platform fee: 10%)

**Premium Tiers:**
- Free: Public assets, basic features
- Pro ($49/month): Private assets, priority support, advanced analytics
- Enterprise ($499/month): Custom SLA, dedicated support, SSO

### 5.3.2 P2P Distribution (IPFS)

**Decentralized Storage:**
- Upload assets to IPFS network
- Content addressing (CID)
- Redundancy across multiple nodes

**Hybrid Retrieval:**
- Prefer P2P if available (faster, cheaper)
- Fallback to S3 if P2P unavailable
- Track data transfer savings

### 5.3.3 Advanced Analytics

**Publisher Analytics:**
- Geographic distribution of downloads
- Download trends by version
- User retention (% returning downloaders)
- A/B testing results (different descriptions)

**Marketplace Analytics:**
- Top publishers
- Trending categories
- Search funnel analysis
- Asset lifecycle metrics (time to first download)

### 5.3.4 Social Features

**Following:**
- Follow publishers
- Get notified of new assets

**Collections:**
- Curated asset collections (e.g., "Best chatbot prompts")
- Community-contributed or official

**Badges & Achievements:**
- "Top Contributor" (50+ assets published)
- "Helpful Reviewer" (100+ helpful votes)
- Display on profile

### 5.3.5 Enterprise Features

**Private Marketplace:**
- Organization-specific assets
- Invite-only access
- Custom branding

**SSO Integration:**
- SAML 2.0 support
- LDAP integration
- Multi-factor authentication (MFA)

**Audit Compliance:**
- Detailed audit logs (who, what, when)
- Compliance reports (SOC2, HIPAA)
- Data retention policies

### 5.3.6 V1 Milestones

**Month 7-8: Monetization**
- Week 25-26: Payment integration (Stripe)
- Week 27: Licensing system
- Week 28: Premium tiers & billing

**Month 9-10: P2P & Advanced Analytics**
- Week 29-30: IPFS integration
- Week 31: Hybrid retrieval logic
- Week 32-33: Advanced analytics dashboards

**Month 11-12: Social & Enterprise**
- Week 34: Following & notifications
- Week 35: Collections & badges
- Week 36: SSO & MFA
- Week 37-38: Private marketplace
- Week 39-40: Audit compliance
- Week 41-44: V1 launch prep (testing, docs, marketing)

**V1 Validation Metrics:**
- 10,000+ assets
- 10,000+ users
- 100,000+ downloads
- 20%+ assets monetized
- 30%+ MAU retention
- 99.9% uptime
- <200ms search response time (P95)
- $50K+ monthly revenue (target)

## 5.4 Milestone Dependencies

```
Milestone Dependency Graph:

MVP (Month 1-3)
├─ Infrastructure Setup (M1)
│  ├─ Database Schema (M1)
│  └─ API Gateway (M1)
├─ Publishing Service (M2)
│  ├─ Depends: Infrastructure, Policy Engine Integration
│  └─ Enables: Search Service
├─ Search Service (M2)
│  ├─ Depends: Publishing Service, Elasticsearch Setup
│  └─ Enables: Web UI
├─ Retrieval Service (M2)
│  ├─ Depends: Publishing Service, Registry Integration
│  └─ Enables: Dependency Resolution (Beta)
├─ Rating Service (M3)
│  ├─ Depends: Retrieval Service (verify downloads)
│  └─ Enables: Review Moderation (Beta)
└─ Web UI (M3)
   ├─ Depends: All backend services
   └─ Enables: User Dashboards (Beta)

Beta (Month 4-6)
├─ Semantic Search (M4)
│  ├─ Depends: Search Service
│  └─ Enables: Advanced Recommendations
├─ User Dashboards (M5)
│  ├─ Depends: Web UI, Analytics Integration
│  └─ Enables: Publisher Analytics (V1)
├─ Dependency Resolution (M5)
│  ├─ Depends: Retrieval Service, Registry Enhancements
│  └─ Enables: Complex Asset Ecosystems
└─ CDN Integration (M6)
   ├─ Depends: Retrieval Service
   └─ Enables: Global Performance

V1 (Month 7-12)
├─ Monetization (M7-8)
│  ├─ Depends: Web UI, Retrieval Service
│  └─ Enables: Revenue Generation
├─ P2P Distribution (M9-10)
│  ├─ Depends: Retrieval Service
│  └─ Enables: Cost Reduction, Decentralization
├─ Advanced Analytics (M9-10)
│  ├─ Depends: Analytics Hub Integration, User Dashboards
│  └─ Enables: Data-Driven Decisions
├─ Social Features (M11)
│  ├─ Depends: User Dashboards
│  └─ Enables: Community Engagement
└─ Enterprise Features (M11-12)
   ├─ Depends: All core services
   └─ Enables: Enterprise Adoption
```

## 5.5 Validation Metrics Per Phase

### 5.5.1 MVP Metrics (Month 3)

**Adoption Metrics:**
- Total assets published: ≥50
- Total users registered: ≥100
- Total downloads: ≥200
- Daily active users: ≥20

**Quality Metrics:**
- Assets with descriptions >100 words: ≥80%
- Assets with at least 1 review: ≥20%
- Average rating: ≥3.5 stars

**Technical Metrics:**
- Uptime: ≥99%
- Search response time (P95): <300ms
- API response time (P95): <500ms
- Error rate: <1%
- Successful publishes: ≥95%

**Business Metrics:**
- Publisher satisfaction (survey): ≥4/5
- Consumer satisfaction (survey): ≥4/5
- Support tickets per user: <0.1

### 5.5.2 Beta Metrics (Month 6)

**Adoption Metrics:**
- Total assets: ≥1,000
- Total users: ≥2,000
- Total downloads: ≥10,000
- Monthly active users: ≥500

**Engagement Metrics:**
- Assets with reviews: ≥50%
- Average reviews per asset: ≥2
- Return users (monthly): ≥30%
- Saved searches per user: ≥1

**Quality Metrics:**
- Average rating: ≥4.0 stars
- Review helpfulness votes: ≥5,000
- Flagged reviews: <2%

**Technical Metrics:**
- Uptime: ≥99.9%
- Search response time (P95): <200ms
- Download success rate: ≥99%
- CDN cache hit rate: ≥80%

**Business Metrics:**
- NPS (Net Promoter Score): ≥40
- User retention (month 2): ≥40%
- Average session duration: ≥5 minutes

### 5.5.3 V1 Metrics (Month 12)

**Adoption Metrics:**
- Total assets: ≥10,000
- Total users: ≥10,000
- Total downloads: ≥100,000
- Monthly active users: ≥2,000

**Monetization Metrics:**
- Paid assets: ≥20% of total
- Monthly recurring revenue: ≥$50K
- Average revenue per user: ≥$5
- Conversion rate (free → paid): ≥5%

**Engagement Metrics:**
- Return users (monthly): ≥30%
- Assets per publisher (avg): ≥5
- Downloads per user (avg): ≥10
- Review participation rate: ≥30%

**Technical Metrics:**
- Uptime: ≥99.95%
- Search response time (P95): <200ms
- Download speed: ≥50MB/s (avg)
- P2P offload rate: ≥30%

**Business Metrics:**
- NPS: ≥50
- User retention (month 6): ≥40%
- Enterprise customers: ≥10
- Support ticket resolution time: <24 hours

## 5.6 Launch Criteria

### 5.6.1 MVP Launch Checklist

**Functionality:**
- [ ] All MVP features implemented and tested
- [ ] Integration tests passing (>95% coverage)
- [ ] Load testing passed (1,000 concurrent users)
- [ ] Security audit completed (no critical vulnerabilities)

**Documentation:**
- [ ] API documentation (OpenAPI/Swagger)
- [ ] CLI user guide
- [ ] Publisher onboarding guide
- [ ] Architecture documentation

**Operations:**
- [ ] Production infrastructure provisioned
- [ ] Monitoring dashboards configured (Grafana)
- [ ] Alerting rules defined (PagerDuty)
- [ ] Backup & disaster recovery tested
- [ ] Runbooks for common incidents

**Legal & Compliance:**
- [ ] Terms of Service finalized
- [ ] Privacy Policy published
- [ ] Data retention policy defined
- [ ] GDPR compliance validated

**Marketing:**
- [ ] Landing page live
- [ ] Internal announcement prepared
- [ ] Beta tester list ready (50+ users)
- [ ] Feedback collection mechanism in place

### 5.6.2 Beta Launch Checklist

**Functionality:**
- [ ] All Beta features implemented
- [ ] User acceptance testing completed
- [ ] Load testing passed (10,000 concurrent users)
- [ ] Performance benchmarks met

**Scale:**
- [ ] Database scaled to handle 10K+ assets
- [ ] CDN configured and tested
- [ ] Auto-scaling tested under load
- [ ] Cost projections validated

**User Experience:**
- [ ] Onboarding flow optimized (time to first publish <10 min)
- [ ] Error messages user-friendly
- [ ] Accessibility (WCAG 2.1 AA compliant)
- [ ] Mobile responsive UI

**Community:**
- [ ] Beta tester feedback incorporated
- [ ] Feature request process defined
- [ ] Community forum/Slack channel launched
- [ ] Monthly newsletter setup

### 5.6.3 V1 Launch Checklist

**Functionality:**
- [ ] All V1 features implemented
- [ ] Enterprise features validated with pilot customers
- [ ] Payment processing tested (Stripe)
- [ ] SSO integrations tested (3+ providers)

**Scale & Performance:**
- [ ] Load testing passed (50,000 concurrent users)
- [ ] Chaos engineering tests passed
- [ ] Global CDN performance validated
- [ ] P2P distribution tested at scale

**Security & Compliance:**
- [ ] Penetration testing completed
- [ ] SOC2 Type II audit passed
- [ ] HIPAA compliance validated (if applicable)
- [ ] Bug bounty program launched

**Business:**
- [ ] Revenue targets met (>$50K MRR)
- [ ] 10+ enterprise customers onboarded
- [ ] Pricing model validated
- [ ] Sales & marketing materials ready

**Operations:**
- [ ] 24/7 on-call rotation established
- [ ] SLA commitments defined and monitored
- [ ] Incident response playbook tested
- [ ] Quarterly business review process

---

## 5.7 Risk Assessment & Mitigation

### 5.7.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Elasticsearch performance degradation at scale** | Medium | High | - Implement index sharding strategy<br>- Use tiered storage (hot/warm)<br>- Monitor query performance, optimize slow queries<br>- Consider managed service (AWS OpenSearch) |
| **S3 storage costs exceed budget** | Medium | Medium | - Implement lifecycle policies (archive to Glacier)<br>- Compress large assets<br>- Monitor storage growth weekly<br>- Negotiate AWS EDP for discounts |
| **Database connection pool exhaustion** | Low | High | - Use PgBouncer for connection pooling<br>- Implement read replicas<br>- Monitor connection usage, alert at 80%<br>- Tune pool size based on load tests |
| **Policy Engine integration latency** | Medium | Medium | - Implement async validation with queues<br>- Cache policy decisions (5 min TTL)<br>- SLA with Policy Engine team (<5s response)<br>- Fail-open with warnings for MVP |
| **CDN cache invalidation delays** | Low | Low | - Use versioned URLs for assets<br>- Implement webhook-triggered invalidations<br>- Monitor cache hit rates |

### 5.7.2 Operational Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Insufficient on-call coverage** | Medium | High | - Hire dedicated SRE by Month 6<br>- Implement 24/7 rotation (3+ engineers)<br>- Automate common incident resolutions<br>- Runbooks for all critical alerts |
| **Data loss due to misconfiguration** | Low | Critical | - Enable versioning on S3 buckets<br>- Automated daily backups<br>- Test disaster recovery quarterly<br>- Immutable infrastructure (IaC) |
| **Compliance audit failure** | Low | High | - Engage compliance consultant early<br>- Implement audit logging from day 1<br>- Quarterly internal audits<br>- SOC2 prep by Month 9 |
| **DDoS attack** | Low | High | - AWS Shield Standard (free)<br>- Rate limiting at API Gateway<br>- WAF rules for common attack patterns<br>- DDoS response playbook |

### 5.7.3 Business Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Low adoption (< 50 assets in 3 months)** | Medium | High | - Pre-launch partnerships with 5+ key publishers<br>- Seed marketplace with curated assets<br>- Incentive program (featured placements)<br>- Monthly usage reports to stakeholders |
| **Poor user retention (< 30%)** | Medium | Medium | - Implement user onboarding flow<br>- Send personalized recommendations<br>- Regular user interviews<br>- Quick wins (time to first download <5 min) |
| **Monetization fails (< $10K MRR by Month 12)** | Medium | Medium | - Validate pricing with pilot customers<br>- Offer free trials (30 days)<br>- Flexible pricing tiers<br>- Enterprise sales strategy |
| **Competitor launches similar product** | Low | Medium | - Focus on integration with existing LLM ecosystem<br>- Build network effects (more assets = more value)<br>- Unique features (P2P, policy integration)<br>- Strong community engagement |

### 5.7.4 Dependency Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **LLM-Registry API breaking change** | Low | High | - Establish API versioning contract<br>- Subscribe to Registry changelog<br>- Maintain adapter layer for isolation<br>- Regular integration tests in CI/CD |
| **Policy Engine downtime** | Medium | High | - Implement circuit breaker pattern<br>- Cached policy decisions (stale-while-revalidate)<br>- Fail-open mode for non-critical paths<br>- SLA monitoring and escalation |
| **Analytics Hub data loss** | Low | Medium | - Buffer events locally (max 10K)<br>- Replay mechanism on reconnect<br>- Dual-write to backup queue (SQS)<br>- Accept eventual consistency |
| **Governance Dashboard unavailable** | Low | Low | - Make reporting async (daily exports)<br>- S3-based data lake for historical data<br>- Dashboard reads from data lake |

---

## 5.8 Resource Requirements

### 5.8.1 Team Structure

**MVP (Month 1-3):**
- 1 Product Manager (PM)
- 2 Backend Engineers
- 1 Frontend Engineer
- 1 DevOps Engineer
- 1 QA Engineer

**Beta (Month 4-6):**
- 1 PM
- 3 Backend Engineers (+1 for advanced features)
- 2 Frontend Engineers (+1 for dashboards)
- 1 DevOps Engineer
- 1 QA Engineer
- 0.5 Technical Writer (documentation)

**V1 (Month 7-12):**
- 1 PM
- 4 Backend Engineers (+1 for monetization)
- 2 Frontend Engineers
- 1 SRE (+1 for 24/7 coverage)
- 1 QA Engineer
- 1 Technical Writer (full-time)
- 0.5 Security Engineer (audits, compliance)

**Total Headcount:** 7 FTE (MVP) → 8.5 FTE (Beta) → 10.5 FTE (V1)

### 5.8.2 Budget Breakdown

**Phase 1 (MVP): $150,000**
- Personnel: $120,000 (7 FTE × 3 months × $5,714/FTE/month avg)
- AWS Infrastructure: $15,000
  - EKS: $2,000
  - RDS: $3,000
  - S3: $2,000
  - Elasticsearch: $5,000
  - Redis: $1,000
  - Networking: $2,000
- Tools & Services: $10,000
  - Auth0/Cognito: $1,000
  - Monitoring (DataDog): $2,000
  - ClamAV: Free
  - Development tools: $7,000
- Contingency (10%): $5,000

**Phase 2 (Beta): $100,000**
- Personnel: $75,000 (8.5 FTE × 3 months × $2,941/FTE/month)
- AWS Infrastructure: $18,000 (scale up)
- CDN (CloudFront): $3,000
- Tools & Services: $3,000
- Contingency: $1,000

**Phase 3 (V1): $150,000**
- Personnel: $105,000 (10.5 FTE × 6 months × $1,667/FTE/month)
- AWS Infrastructure: $25,000 (P2P, global scale)
- Payment Processing (Stripe): $5,000 setup
- SSO Integrations: $3,000
- Security Audit: $7,000
- SOC2 Audit: $10,000
- Contingency: $5,000

**Total Budget: $400,000 over 12 months**

### 5.8.3 Infrastructure Costs (Detailed)

**Monthly AWS Costs (MVP):**
```
EKS Control Plane:              $73/month
EC2 Instances (t3.large × 3):   $450/month
RDS (db.r5.large):              $600/month
Elasticsearch (t3.medium × 3):  $300/month
ElastiCache Redis (m5.large):   $150/month
S3 Storage (100TB):             $2,300/month
Data Transfer:                  $1,000/month
Load Balancer:                  $25/month
Route 53:                       $1/month
-----------------------------------------------
Total:                          ~$5,000/month
```

**Scaling Projections:**
- Beta (Month 6): ~$7,000/month (+CDN, more storage)
- V1 (Month 12): ~$12,000/month (global scale, P2P infrastructure)

---

## Conclusion

This SPARC-compliant roadmap provides a comprehensive blueprint for building the LLM-Marketplace over 12 months. By following the phased approach (MVP → Beta → V1), the project balances speed to market with quality and scalability.

**Key Success Factors:**
1. **Integration-First**: Seamless integration with LLM-Registry, Policy-Engine, Analytics-Hub, Governance-Dashboard
2. **Community-Driven**: Ratings, reviews, and feedback loops ensure quality
3. **Policy-Compliant**: Built-in compliance prevents governance issues
4. **Performance**: Sub-200ms search, 99.9% uptime SLA
5. **Scalable**: Designed to grow from 100 to 1M+ assets

**Next Steps:**
1. Secure budget approval ($400K)
2. Assemble team (hire 7 FTE)
3. Kick off Sprint 1 (Infrastructure setup)
4. Establish integration contracts with dependent services
5. Begin weekly stakeholder demos

---

**Document Metadata:**
- **Created:** 2025-11-18
- **Version:** 1.0
- **Next Review:** 2025-12-18 (monthly updates)
- **Owner:** Product Management Team
- **Stakeholders:** Engineering, DevOps, Legal, Compliance, Executive Leadership
