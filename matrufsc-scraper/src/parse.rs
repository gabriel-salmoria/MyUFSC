use std::str::FromStr;

use anyhow::{Context, Result};
use chrono::{NaiveTime, Weekday};
use select::{
    document::Document,
    node::Node,
    predicate::{Attr, Name, Predicate},
};
use thiserror::Error;

#[derive(Clone)]
pub struct Course {
    pub id: String,
    pub title: String,
    pub hours: u32,
}

pub struct Class {
    pub id: String,
    pub course: Course,
    pub labels: Vec<String>,
    pub total_slots: u32,
    pub filled_slots: u32,
    pub special_students: i32,
    pub open_slots: u32,
    pub waiting_for_slot: u32,
    pub times: Vec<Time>,
    pub teachers: Vec<String>,
}

pub struct Time {
    pub weekday: Weekday,
    pub time: NaiveTime,
    pub credits: u32,
    pub place: String,
}

#[derive(Debug, Error)]
enum ParseError {
    #[error("<tbody id=\"formBusca:dataTable:tb\"> not found")]
    TableNotFound,
    #[error("invalid time")]
    InvalidTime,
    #[error("no course title")]
    NoCourseTitle,
}

impl FromStr for Time {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self> {
        fn split_once<'a>(s: &'a str, pat: &str) -> Result<(&'a str, &'a str)> {
            let mut parts = s.splitn(2, pat);
            match (parts.next(), parts.next()) {
                (Some(a), Some(b)) => Ok((a, b)),
                _ => Err(ParseError::InvalidTime.into()),
            }
        }

        let (time, place) = split_once(s, " / ")?;
        let place = place.to_owned();

        let (weekday, time) = split_once(time, ".")?;
        let weekday = match weekday.parse().with_context(|| format!("Parsing weekday"))? {
            1 => Weekday::Sun,
            2 => Weekday::Mon,
            3 => Weekday::Tue,
            4 => Weekday::Wed,
            5 => Weekday::Thu,
            6 => Weekday::Fri,
            7 => Weekday::Sat,
            _ => return Err(ParseError::InvalidTime.into()),
        };

        let (time, credits) = split_once(time, "-")?;
        let credits = credits.trim().parse().with_context(|| format!("Parsing credits"))?;

        let time = NaiveTime::parse_from_str(time, "%H%M")?;

        Ok(Time {
            weekday,
            time,
            credits,
            place,
        })
    }
}

impl Class {
    fn from_html(row: &Node) -> Result<Self> {
        let fields = row
            .find(Name("td"))
            .map(|node| node.text().trim().to_owned())
            // TODO: figure out how to preserve text after a <br>
            // https://github.com/utkarshkukreti/select.rs/issues/51
            .collect::<Vec<_>>();

        let course_id = &fields[3];
        let class_id = &fields[4];

        let mut l = fields[5].lines().map(str::trim);
        let course_title = l.next().ok_or(ParseError::NoCourseTitle)?;

        let labels = l
            .map(|label| {
                let brackets = ['[', ']'];
                label.trim_matches(brackets.as_ref()).to_owned()
            })
            .collect();

        let hours = fields[6].parse().with_context(|| format!("Parsing hours"))?;
        let total_slots = fields[7].parse().with_context(|| format!("Parsing total_slots"))?;
        let filled_slots = fields[8].parse().with_context(|| format!("Parsing filled_slots"))?;
        let special_students = fields[9].parse().with_context(|| format!("Parsing special_students"))?;

        let open_slots = if fields[10] == "LOTADA" {
            0
        } else {
            fields[10].parse().with_context(|| format!("Parsing open_slots"))?
        };

        let waiting_for_slot = if fields[11].is_empty() {
            0
        } else {
            fields[11].parse().with_context(|| format!("Parsing waiting_for_slot"))?
        };

        let course = Course {
            id: course_id.clone(),
            title: course_title.to_owned(),
            hours,
        };

        let times = fields[12]
            .lines()
            .map(str::trim)
            .map(str::parse)
            .collect::<Result<_>>()?;

        let teachers = fields[13]
            .lines()
            .map(str::trim)
            .map(str::to_owned)
            .collect();

        Ok(Class {
            id: class_id.clone(),
            course,
            labels,
            total_slots,
            filled_slots,
            special_students,
            open_slots,
            waiting_for_slot,
            times,
            teachers,
        })
    }
}

pub fn classes_from_html(source: &str) -> Result<Vec<Class>> {
    let document = Document::from(source);

    let table = document
        .find(Name("tbody").and(Attr("id", "formBusca:dataTable:tb")))
        .next()
        .ok_or(ParseError::TableNotFound)?;

    table
        .find(Name("tr"))
        .map(|row| Class::from_html(&row))
        .collect()
}
