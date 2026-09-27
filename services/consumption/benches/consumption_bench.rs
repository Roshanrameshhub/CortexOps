use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use serde_json::json;
use std::time::Duration;

/// Benchmark token bucket rate limiting algorithm
fn bench_rate_limiting(c: &mut Criterion) {
    let mut group = c.benchmark_group("rate_limiting");
    group.measurement_time(Duration::from_secs(10));

    for capacity in [10, 100, 1000].iter() {
        group.throughput(Throughput::Elements(*capacity as u64));
        group.bench_with_input(
            BenchmarkId::from_parameter(capacity),
            capacity,
            |b, &capacity| {
                b.iter(|| {
                    // Simulate token bucket algorithm
                    let mut tokens = capacity;
                    let rate = 10;
                    let now = std::time::Instant::now().elapsed().as_secs();

                    for _ in 0..capacity {
                        if tokens > 0 {
                            tokens -= 1;
                        }
                    }

                    black_box(tokens)
                });
            },
        );
    }
    group.finish();
}

/// Benchmark cost calculation
fn bench_cost_calculation(c: &mut Criterion) {
    let mut group = c.benchmark_group("cost_calculation");

    group.bench_function("per_token_pricing", |b| {
        b.iter(|| {
            let tokens = black_box(1000);
            let rate = black_box(0.0001);
            let cost = tokens as f64 * rate;
            black_box(cost)
        });
    });

    group.bench_function("tiered_pricing", |b| {
        b.iter(|| {
            let tokens = black_box(1000);
            let tiers = vec![
                (0, 1000, 0.0001),
                (1000, 10000, 0.00008),
                (10000, 100000, 0.00006),
            ];

            let mut cost = 0.0;
            let mut remaining = tokens;

            for (min, max, rate) in tiers {
                if remaining <= 0 {
                    break;
                }

                if tokens > min {
                    let tier_tokens = std::cmp::min(remaining, max - min);
                    cost += tier_tokens as f64 * rate;
                    remaining -= tier_tokens;
                }
            }

            black_box(cost)
        });
    });

    group.finish();
}

/// Benchmark JSON serialization/deserialization
fn bench_json_operations(c: &mut Criterion) {
    let mut group = c.benchmark_group("json_operations");

    let consume_request = json!({
        "prompt": "Explain quantum computing in simple terms",
        "max_tokens": 500,
        "temperature": 0.7,
        "metadata": {}
    });

    group.bench_function("serialize_request", |b| {
        b.iter(|| {
            let json_str = serde_json::to_string(&consume_request).unwrap();
            black_box(json_str)
        });
    });

    let json_str = serde_json::to_string(&consume_request).unwrap();

    group.bench_function("deserialize_request", |b| {
        b.iter(|| {
            let parsed: serde_json::Value = serde_json::from_str(&json_str).unwrap();
            black_box(parsed)
        });
    });

    group.finish();
}

/// Benchmark UUID generation
fn bench_uuid_generation(c: &mut Criterion) {
    c.bench_function("uuid_v4_generation", |b| {
        b.iter(|| {
            let id = uuid::Uuid::new_v4();
            black_box(id)
        });
    });
}

/// Benchmark hash operations
fn bench_hash_operations(c: &mut Criterion) {
    use argon2::{
        password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
        Argon2,
    };

    let mut group = c.benchmark_group("hash_operations");
    group.sample_size(10); // Argon2 is slow, use fewer samples

    group.bench_function("argon2_hash", |b| {
        b.iter(|| {
            let password = black_box("test_api_key_12345");
            let salt = SaltString::generate(&mut OsRng);
            let argon2 = Argon2::default();
            let hash = argon2.hash_password(password.as_bytes(), &salt).unwrap();
            black_box(hash)
        });
    });

    group.finish();
}

/// Benchmark request/response size calculations
fn bench_token_estimation(c: &mut Criterion) {
    c.bench_function("token_estimation", |b| {
        b.iter(|| {
            let text = black_box("This is a sample text for token estimation. We're approximating tokens by dividing character count by 4.");
            let estimated_tokens = text.len() / 4;
            black_box(estimated_tokens)
        });
    });
}

/// Comprehensive throughput benchmark
fn bench_end_to_end_throughput(c: &mut Criterion) {
    let mut group = c.benchmark_group("end_to_end");
    group.measurement_time(Duration::from_secs(20));

    // Simulate complete request processing pipeline
    group.bench_function("complete_request_pipeline", |b| {
        b.iter(|| {
            // 1. Generate request ID
            let request_id = uuid::Uuid::new_v4();

            // 2. Rate limit check (simulated)
            let mut tokens = 100;
            if tokens > 0 {
                tokens -= 1;
            }

            // 3. Quota check (simulated)
            let used_tokens = 50000;
            let quota_limit = 100000;
            let quota_available = used_tokens < quota_limit;

            // 4. Cost calculation
            let consumed_tokens = 250;
            let rate = 0.0001;
            let cost = consumed_tokens as f64 * rate;

            // 5. Response serialization
            let response = json!({
                "request_id": request_id.to_string(),
                "response": {
                    "text": "This is a response from the LLM service"
                },
                "usage": {
                    "prompt_tokens": 50,
                    "completion_tokens": 200,
                    "total_tokens": 250
                },
                "cost": {
                    "amount": cost,
                    "currency": "USD"
                }
            });

            let json_str = serde_json::to_string(&response).unwrap();

            black_box((request_id, tokens, quota_available, json_str))
        });
    });

    group.finish();
}

criterion_group!(
    benches,
    bench_rate_limiting,
    bench_cost_calculation,
    bench_json_operations,
    bench_uuid_generation,
    bench_hash_operations,
    bench_token_estimation,
    bench_end_to_end_throughput
);

criterion_main!(benches);
