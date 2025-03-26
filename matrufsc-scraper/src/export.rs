use crate::{parse, scrape::Campus};

use std::{collections::HashMap, fs::File};

use anyhow::Result;
use chrono::{FixedOffset, Utc, Weekday};
use serde::Serialize;
use serde_tuple::Serialize_tuple;

#[derive(Serialize)]
struct MatrufscJson {
    #[serde(rename = "DATA")]
    timestamp: String,
    #[serde(flatten)]
    data: HashMap<Campus, Vec<Course>>,
}

#[derive(Serialize_tuple)]
struct Course {
    id: String,
    title_upper: String,
    title: String,
    classes: Vec<Class>,
}

#[derive(Serialize_tuple)]
struct Class {
    id: String,
    hours: u32,
    labels: Vec<String>,
    total_slots: u32,
    filled_slots: u32,
    special_students: i32,
    open_slots: u32,
    waiting_for_slot: u32,
    times: Vec<String>,
    teachers: Vec<String>,
}

const AMERICA_SAO_PAULO_TZ: Option<FixedOffset> = FixedOffset::west_opt(3 * 60 * 60);

fn formatted_timestamp() -> String {
    Utc::now()
        .with_timezone(&AMERICA_SAO_PAULO_TZ.unwrap())
        .format("%d/%m/%y - %H:%M")
        .to_string()
}

fn format_class_times(times: &[parse::Time]) -> Vec<String> {
    times
        .iter()
        .map(|time| {
            let weekday = match time.weekday {
                Weekday::Sun => 1,
                Weekday::Mon => 2,
                Weekday::Tue => 3,
                Weekday::Wed => 4,
                Weekday::Thu => 5,
                Weekday::Fri => 6,
                Weekday::Sat => 7,
            };
            format!(
                "{}.{}-{} / {}",
                weekday,
                time.time.format("%H%M"),
                time.credits,
                time.place
            )
        })
        .collect()
}

fn group_classes_for_matrufsc(mut classes: Vec<parse::Class>) -> Vec<Course> {
    classes.sort_by_key(|class| class.course.id.clone());
    classes
        .chunk_by(|class_a, class_b| class_a.course.id == class_b.course.id)
        .map(|classes_in_course| {
            let course = classes_in_course.first().unwrap().course.clone();

            let classes = classes_in_course
                .iter()
                .map(|class| Class {
                    id: class.id.clone(),
                    labels: class.labels.clone(),
                    hours: course.hours,
                    total_slots: class.total_slots,
                    filled_slots: class.filled_slots,
                    special_students: class.special_students,
                    open_slots: class.open_slots,
                    waiting_for_slot: class.waiting_for_slot,
                    times: format_class_times(&class.times),
                    teachers: class.teachers.clone(),
                })
                .collect();

            Course {
                id: course.id,
                title_upper: course.title.to_uppercase(),
                title: course.title,
                classes,
            }
        })
        .collect()
}

pub fn to_matrufsc_json(
    campus_classes_pairs: Vec<(Campus, Vec<parse::Class>)>,
    output_file: &File,
) -> Result<()> {
    let data = campus_classes_pairs
        .into_iter()
        .map(|(campus, classes)| (campus, group_classes_for_matrufsc(classes)))
        .collect();

    Ok(serde_json::to_writer(
        output_file,
        &MatrufscJson {
            timestamp: formatted_timestamp(),
            data,
        },
    )?)
}
