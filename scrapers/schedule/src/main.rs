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

    let semesters = scrape_last_n_semesters(5, enum_iterator::all::<Campus>()).await?;

    for (semester, campus_classes_pairs) in semesters {
        let data = filter_out_errors(&semester, campus_classes_pairs);

        log::info!("Processing semester {}", semester);
        export::to_matrufsc_json(data, &semester.to_string())?;
    }

    Ok(())
}
