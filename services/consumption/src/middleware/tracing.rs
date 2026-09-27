use opentelemetry::{
    global,
    sdk::{
        propagation::TraceContextPropagator,
        trace::{self, RandomIdGenerator, Sampler},
        Resource,
    },
    KeyValue,
};
use opentelemetry_jaeger::new_agent_pipeline;
use tracing_subscriber::{layer::SubscriberExt, EnvFilter, Registry};

/// Initialize OpenTelemetry tracing with Jaeger
pub fn init_tracing() -> Result<(), Box<dyn std::error::Error>> {
    // Set up TraceContext propagator
    global::set_text_map_propagator(TraceContextPropagator::new());

    // Configure Jaeger tracer
    let tracer = new_agent_pipeline()
        .with_service_name("llm-marketplace-consumption")
        .with_auto_split_batch(true)
        .with_max_packet_size(65_000)
        .with_trace_config(
            trace::config()
                .with_sampler(Sampler::AlwaysOn)
                .with_id_generator(RandomIdGenerator::default())
                .with_resource(Resource::new(vec![
                    KeyValue::new("service.name", "llm-marketplace-consumption"),
                    KeyValue::new("service.version", env!("CARGO_PKG_VERSION")),
                ])),
        )
        .install_batch(opentelemetry::runtime::Tokio)?;

    // Create OpenTelemetry tracing layer
    let telemetry = tracing_opentelemetry::layer().with_tracer(tracer);

    // Create fmt layer for console output
    let fmt_layer = tracing_subscriber::fmt::layer()
        .json()
        .with_target(true)
        .with_line_number(true)
        .with_thread_ids(true);

    // Create env filter
    let filter_layer = EnvFilter::try_from_default_env()
        .or_else(|_| EnvFilter::try_new("info"))
        .unwrap();

    // Combine layers
    let subscriber = Registry::default()
        .with(filter_layer)
        .with(fmt_layer)
        .with(telemetry);

    // Set global subscriber
    tracing::subscriber::set_global_default(subscriber)?;

    Ok(())
}

/// Shutdown tracing gracefully
pub fn shutdown_tracing() {
    global::shutdown_tracer_provider();
}
