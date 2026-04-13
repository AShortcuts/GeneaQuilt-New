use std::collections::BTreeMap;

use crate::timeline::DateRange;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct VertexId(pub usize);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum VertexKind {
    Person,
    Family,
}

pub type PropertyMap = BTreeMap<String, Vec<String>>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Person {
    pub id: String,
    pub display_name: String,
    pub sex: Option<String>,
    pub famc: Vec<String>,
    pub fams: Vec<String>,
    pub properties: PropertyMap,
    pub date_range: Option<DateRange>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Family {
    pub id: String,
    pub husb: Option<String>,
    pub wife: Option<String>,
    pub children: Vec<String>,
    pub properties: PropertyMap,
    pub date_range: Option<DateRange>,
}

impl Person {
    pub fn new(id: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            display_name: String::new(),
            sex: None,
            famc: Vec::new(),
            fams: Vec::new(),
            properties: PropertyMap::new(),
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
            date_range: None,
        }
    }
}
