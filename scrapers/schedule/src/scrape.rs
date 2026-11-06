use crate::parse::Class;

use core::fmt;
use std::collections::HashMap;

use anyhow::{Context, Result};
use enum_iterator::Sequence;
use futures::{future::join_all, FutureExt, TryFutureExt};
use reqwest::Client;
use select::{
    document::Document,
    predicate::{Attr, Name, Predicate},
};
use serde::Serialize;

const CAGR_URL: &str = "https://cagr.sistemas.ufsc.br/modules/comunidade/cadastroTurmas/";

#[allow(clippy::upper_case_acronyms)]
#[derive(Clone, Copy, Debug, Sequence, Serialize, PartialEq, Eq, Hash)]
pub enum Campus {
    // EAD = 0,
    FLO = 1,
    JOI = 2,
    CBS = 3,
    ARA = 4,
    BLN = 5,
}

impl fmt::Display for Campus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            // Self::EAD => "EAD",
            Self::FLO => "FLO",
            Self::JOI => "JOI",
            Self::CBS => "CBS",
            Self::ARA => "ARA",
            Self::BLN => "BLN",
        }
        .fmt(f)
    }
}

#[derive(Clone, Debug, PartialEq, PartialOrd, Eq, Ord)]
pub struct Semester(String);

impl fmt::Display for Semester {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(f)
    }
}

impl Semester {
    /// A real term: YYYY + 1/2/3, at most next year. CAGR's dropdown also lists
    /// bogus codes (26261, 20264) that always come back empty and used to take
    /// two of the three scraped slots.
    fn is_plausible(&self) -> bool {
        use chrono::Datelike;
        let code = self.0.as_bytes();
        let next_year = chrono::Local::now().year() + 1;
        code.len() == 5
            && code.iter().all(u8::is_ascii_digit)
            && matches!(code[4], b'1' | b'2' | b'3')
            && self.0[..4].parse::<i32>().is_ok_and(|year| year <= next_year)
    }
}

fn form_data(
    semester: &Semester,
    campus: &Campus,
    page_index: usize,
) -> HashMap<&'static str, String> {
    [
        ("formBusca", "formBusca".to_owned()),
        ("javax.faces.ViewState", "j_id1".to_owned()),
        ("formBusca:selectSemestre", semester.to_string()),
        ("formBusca:selectCampus", (*campus as u32).to_string()),
        ("formBusca:dataScroller1", page_index.to_string()),
    ]
    .into_iter()
    .collect::<HashMap<_, _>>()
}

pub struct Scraper {
    client: Client,
}

impl Scraper {
    pub async fn new() -> Result<Self> {
        let client = Client::builder().cookie_store(true).build()?;

        // the site requires the client to be primed with the cookies
        client.post(CAGR_URL).send().await?;

        Ok(Self { client })
    }

    async fn page_count(&self, semester: &Semester, campus: &Campus) -> Result<usize> {
        let response = self
            .client
            .post(CAGR_URL)
            .form(&form_data(semester, campus, 2)) // page 1 does not work
            .send()
            .await?;

        let contents = response.text().await?;
        let document = Document::from(contents.as_ref());

        let entries = document
            .find(
                Name("span")
                    .and(Attr("id", "formBusca:dataTableGroup"))
                    .child(Name("span")),
            )
            .next()
            .and_then(|node| node.inner_html().parse::<u32>().ok())
            .unwrap_or(0); // TODO: error out on this

        let pages = (f64::from(entries) / 50.).ceil() as usize;

        Ok(pages)
    }

    pub async fn scrape(self, semester: &Semester, campus: &Campus) -> Result<Vec<Class>> {
        let mut entries = Vec::new();

        let mut previous: Option<String> = None;
        let page_count = self.page_count(semester, campus).await?;
        log::info!("Starting to scrape {campus} on {semester} with {page_count} pages");

        for page_index in 1..=page_count {
            log::info!("Fetching page {page_index} for {campus} on {semester}");

            // CAGR sometimes answers a page without the results table. Retry it;
            // if the LAST page still has none, treat it as the end instead of
            // failing (which used to drop every page of the campus).
            let mut attempt = 0;
            let (contents, parsed) = loop {
                attempt += 1;
                let response = self
                    .client
                    .post(CAGR_URL)
                    .form(&form_data(semester, campus, page_index))
                    .send()
                    .await?;
                let contents = response.text().await?;
                match crate::parse::classes_from_html(&contents) {
                    Ok(parsed) => break (contents, Some(parsed)),
                    Err(err) if attempt < 3 => {
                        log::warn!("Retrying page {page_index} for {campus} on {semester} ({err})");
                        tokio::time::sleep(std::time::Duration::from_secs(2 * attempt)).await;
                    }
                    Err(err) if page_index == page_count => {
                        log::warn!(
                            "Last page {page_index} for {campus} on {semester} has no table after {attempt} tries; stopping there ({err})"
                        );
                        break (contents, None);
                    }
                    Err(err) => {
                        return Err(err).with_context(|| {
                            format!("Parsing page {page_index} for {campus} on {semester}")
                        })
                    }
                }
            };

            if Some(&contents) == previous.as_ref() {
                log::warn!(
                    "Stopping at page {page_index} for {campus} on {semester} because of a page repeat"
                );
                break;
            }

            match parsed {
                Some(parsed) => entries.extend(parsed),
                None => break,
            }

            previous.replace(contents);
        }

        Ok(entries)
    }
}

async fn available_semesters() -> Result<Vec<Semester>> {
    let response = reqwest::get(CAGR_URL).await?;
    let contents = response.text().await?;
    let document = Document::from(contents.as_ref());

    let dropdown = Name("select").and(Attr("id", "formBusca:selectSemestre"));
    let options = dropdown.child(Name("option"));

    Ok(document
        .find(options)
        .filter_map(|option| option.attr("value"))
        .map(|value| Semester(value.to_owned()))
        .collect())
}

async fn scrape_semester(
    semester: Semester,
    campi: &[Campus],
) -> Vec<(Campus, Result<Vec<Class>>)> {
    let tasks = campi.iter().map(|campus| {
        Scraper::new()
            .and_then(|s| s.scrape(&semester, campus))
            .map(|classes| (*campus, classes))
    });

    join_all(tasks).await
}

fn cache_file_path(semester: &Semester) -> std::path::PathBuf {
    std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../data/schedule")
        .join(format!("{}-FLO.json", semester))
}

fn is_cache_valid(semester: &Semester, _campi: &[Campus]) -> bool {
    let path = cache_file_path(semester);

    if !path.exists() {
        return false;
    }

    let age = std::fs::metadata(&path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|modified| std::time::SystemTime::now().duration_since(modified).ok());

    match age {
        Some(duration) => duration.as_secs() < 2 * 24 * 60 * 60, // 48 hours, matching update schedule
        None => false,
    }
}

pub async fn scrape_last_n_semesters(
    n: usize,
    campi: impl Iterator<Item = Campus>,
    force: bool,
) -> Result<Vec<(Semester, Vec<(Campus, Result<Vec<Class>>)>)>> {
    let campi = campi.collect::<Vec<_>>();

    let semesters = available_semesters().await?;
    let last_n_semesters = semesters
        .into_iter()
        .filter(|s| {
            let keep = s.is_plausible();
            if !keep {
                log::warn!("Skipping implausible semester code {s} from the CAGR dropdown");
            }
            keep
        })
        .take(n);

    // One semester at a time (campuses still in parallel): CAGR starts dropping
    // pages when 15 sessions (3 semesters x 5 campuses) hit it at once.
    let mut results = Vec::new();
    for semester in last_n_semesters {
        if !force && is_cache_valid(&semester, &campi) {
            log::info!("Cache valid for semester {}. Skipping scrape.", semester);
            // Return empty list to signal skipped/cached
            results.push((semester, vec![]));
            continue;
        }
        let campus_classes = scrape_semester(semester.clone(), &campi).await;
        results.push((semester, campus_classes));
    }

    Ok(results)
}
