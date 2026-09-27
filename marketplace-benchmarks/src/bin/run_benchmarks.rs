//! Benchmark runner CLI binary
//!
//! This binary provides a command-line interface for running benchmarks,
//! generating reports, and managing benchmark results.

use anyhow::Result;
use clap::{Parser, Subcommand};
use marketplace_benchmarks::{
    run_all_benchmarks, generate_markdown_report, save_all_results, load_benchmark_results,
};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "run_benchmarks")]
#[command(about = "LLM Marketplace Benchmark Runner", long_about = None)]
#[command(version)]
struct Cli {
    #[command(subcommand)]
    command: Commands,

    /// Enable verbose logging
    #[arg(short, long, global = true)]
    verbose: bool,
}

#[derive(Subcommand)]
enum Commands {
    /// Run all registered benchmarks
    Run {
        /// Output directory for raw results
        #[arg(short, long, default_value = "benchmarks/output/raw")]
        output_dir: PathBuf,

        /// Generate markdown report after running
        #[arg(short, long)]
        report: bool,

        /// Path for the markdown report
        #[arg(short = 'm', long, default_value = "benchmarks/output/summary.md")]
        markdown_path: PathBuf,
    },

    /// Generate a markdown report from existing results
    Report {
        /// Input directory containing benchmark results
        #[arg(short, long, default_value = "benchmarks/output/raw")]
        input_dir: PathBuf,

        /// Output path for the markdown report
        #[arg(short, long, default_value = "benchmarks/output/summary.md")]
        output_path: PathBuf,
    },

    /// List all available benchmark targets
    List,
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    // Initialize logging
    let log_level = if cli.verbose { "debug" } else { "info" };
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or(log_level)).init();

    match cli.command {
        Commands::Run {
            output_dir,
            report,
            markdown_path,
        } => {
            log::info!("Starting benchmark run");

            // Run all benchmarks
            let results = run_all_benchmarks()?;
            log::info!("Completed {} benchmarks", results.len());

            // Save results to disk
            let paths = save_all_results(&results, Some(&output_dir))?;
            log::info!("Saved {} result files to {:?}", paths.len(), output_dir);

            // Generate markdown report if requested
            if report {
                let markdown = generate_markdown_report(&results)?;
                std::fs::create_dir_all(markdown_path.parent().unwrap())?;
                std::fs::write(&markdown_path, markdown)?;
                log::info!("Generated markdown report at {:?}", markdown_path);
                println!("\nReport saved to: {}", markdown_path.display());
            }

            println!("\nBenchmark run completed successfully!");
            println!("Results saved to: {}", output_dir.display());
        }

        Commands::Report {
            input_dir,
            output_path,
        } => {
            log::info!("Generating report from existing results");

            // Load existing results
            let results = load_benchmark_results(Some(&input_dir))?;
            if results.is_empty() {
                log::warn!("No benchmark results found in {:?}", input_dir);
                println!("No benchmark results found. Run benchmarks first with 'run' command.");
                return Ok(());
            }

            log::info!("Loaded {} benchmark results", results.len());

            // Generate and save markdown report
            let markdown = generate_markdown_report(&results)?;
            std::fs::create_dir_all(output_path.parent().unwrap())?;
            std::fs::write(&output_path, markdown)?;

            println!("\nReport generated successfully!");
            println!("Report saved to: {}", output_path.display());
        }

        Commands::List => {
            println!("Available benchmark targets:\n");

            let targets = marketplace_benchmarks::all_targets();
            for (i, target) in targets.iter().enumerate() {
                println!("  {}. {}", i + 1, target.id());
            }

            println!("\nTotal: {} benchmarks", targets.len());
        }
    }

    Ok(())
}
