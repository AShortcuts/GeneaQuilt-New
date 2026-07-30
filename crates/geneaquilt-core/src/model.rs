use std::collections::BTreeMap;

use crate::timeline::{DateRange, RecordedDate};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct VertexId(pub usize);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VertexKind {
    Person,
    Family,
}

pub type PropertyMap = BTreeMap<String, Vec<String>>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ParentFamilyLink {
    pub family_id: String,
    pub pedigree: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Person {
    pub id: String,
    pub display_name: String,
    pub sex: Option<String>,
    pub famc: Vec<String>,
    pub parent_family_links: Vec<ParentFamilyLink>,
    pub fams: Vec<String>,
    pub properties: PropertyMap,
    pub birth_date: Option<RecordedDate>,
    pub death_date: Option<RecordedDate>,
    pub date_range: Option<DateRange>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Family {
    pub id: String,
    pub husb: Option<String>,
    pub wife: Option<String>,
    pub children: Vec<String>,
    pub properties: PropertyMap,
    pub marriage_date: Option<RecordedDate>,
    pub divorce_date: Option<RecordedDate>,
    pub date_range: Option<DateRange>,
}

impl Person {
    pub fn new(id: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            display_name: String::new(),
            sex: None,
            famc: Vec::new(),
            parent_family_links: Vec::new(),
            fams: Vec::new(),
            properties: PropertyMap::new(),
            birth_date: None,
            death_date: None,
            date_range: None,
        }
    }
}

impl Family {
    pub fn new(id: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            husb: None,
            wife: None,
            children: Vec::new(),
            properties: PropertyMap::new(),
            marriage_date: None,
            divorce_date: None,
            date_range: None,
        }
    }
}
