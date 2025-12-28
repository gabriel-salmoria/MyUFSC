mod export;
mod parse;
mod scrape;

use anyhow::Result;
use scrape::{scrape_last_n_semesters, Campus, Semester};

fn filter_out_errors(
    semester: &Semester,
    data: Vec<(Campus, Result<Vec<parse::Class>>)>,
) -> Vec<(Campus, Vec<parse::Class>)> {
    data.into_iter()
        .filter_map(|(campus, classes)| {
            classes
                .map_err(|err| {
                    log::error!(
                        "An error occurred when scraping {campus} on {semester}: {:?}",
                        err
                    )
                })
                .ok()
                .map(|classes| (campus, classes))
        })
        .collect()
}

#[tokio::main]
async fn main() -> Result<()> {
    env_logger::init();

    let args: Vec<String> = std::env::args().collect();
    let force = args.iter().any(|arg| arg == "--force" || arg == "-f");

    if force {
        log::info!("Force flag detected. Ignoring cache.");
    }

    let semesters = scrape_last_n_semesters(3, enum_iterator::all::<Campus>(), force).await?;

    for (semester, campus_classes_pairs) in semesters {
        let data = filter_out_errors(&semester, campus_classes_pairs);

        if data.is_empty() {
            log::info!("No data scraped for semester {} (cached or empty)", semester);
            continue;
        }

        log::info!("Processing semester {}", semester);
        export::to_matrufsc_json(data, &semester.to_string())?;
    }

    Ok(())
}
