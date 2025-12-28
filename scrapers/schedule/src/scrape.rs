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
            let response = self
                .client
                .post(CAGR_URL)
                .form(&form_data(semester, campus, page_index))
                .send()
                .await?;

            let contents = response.text().await?;

            if Some(&contents) == previous.as_ref() {
                log::warn!(
                    "Stopping at page {page_index} for {campus} on {semester} because of a page repeat"
                );
                break;
            }

            let parsed = crate::parse::classes_from_html(&contents).with_context(|| {
                format!("Parsing page {page_index} for {campus} on {semester}")
            })?;
            entries.extend(parsed);

            previous.replace(contents.clone());
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


fn is_cache_valid(semester: &Semester, _campi: &[Campus]) -> bool {
    // Check if any file for this semester exists and is recent (< 3 days)
    // We check for at least ONE campus file.
    // Ideally we should check for all requested campi, but simple check is:
    // if {semester}-FLO.json exists and is recent, we assume it's valid.
    
    let path_str = format!("../../data/schedule/{}-FLO.json", semester);
    let path = std::path::Path::new(&path_str);
    
    if !path.exists() {
        return false;
    }
    
    if let Ok(metadata) = std::fs::metadata(path) {
        if let Ok(modified) = metadata.modified() {
            if let Ok(duration) = std::time::SystemTime::now().duration_since(modified) {
                // 3 days = 3 * 24 * 60 * 60 seconds
                if duration.as_secs() < 3 * 24 * 60 * 60 {
                    return true;
                }
            }
        }
    }
    
    false
}

pub async fn scrape_last_n_semesters(
    n: usize,
    campi: impl Iterator<Item = Campus>,
    force: bool,
) -> Result<Vec<(Semester, Vec<(Campus, Result<Vec<Class>>)>)>> {
    let campi = campi.collect::<Vec<_>>();

    let semesters = available_semesters().await?;
    let last_n_semesters = semesters.into_iter().take(n);

    let tasks = last_n_semesters.map(|semester| {
        let campi = campi.clone();
        async move {
            if !force && is_cache_valid(&semester, &campi) {
                log::info!("Cache valid for semester {}. Skipping scrape.", semester);
                // Return empty list to signal skipped/cached
                return (semester, vec![]);
            }
            
            let campus_classes = scrape_semester(semester.clone(), &campi).await;
            (semester, campus_classes)
        }
    });

    Ok(join_all(tasks).await)
}
