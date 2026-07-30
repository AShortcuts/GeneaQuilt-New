use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct DateRange {
    pub start_year: i32,
    pub end_year: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DatePrecision {
    Exact,
    Approximate,
    Calculated,
    Estimated,
    Before,
    After,
    Range,
    Period,
    Phrase,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecordedDate {
    pub original_text: String,
    pub start_year: Option<i32>,
    pub end_year: Option<i32>,
    pub precision: DatePrecision,
}

pub fn parse_recorded_date(value: &str) -> Option<RecordedDate> {
    let original_text = value.trim();
    if original_text.is_empty() {
        return None;
    }
    let upper = original_text.to_ascii_uppercase();
    let years = extract_years(original_text);
    let precision = if upper.starts_with("ABT ") || upper.starts_with("ABOUT ") {
        DatePrecision::Approximate
    } else if upper.starts_with("CAL ") {
        DatePrecision::Calculated
    } else if upper.starts_with("EST ") {
        DatePrecision::Estimated
    } else if upper.starts_with("BEF ") {
        DatePrecision::Before
    } else if upper.starts_with("AFT ") {
        DatePrecision::After
    } else if upper.starts_with("BET ") {
        DatePrecision::Range
    } else if upper.starts_with("FROM ") {
        DatePrecision::Period
    } else if years.len() > 1 {
        DatePrecision::Range
    } else if years.len() == 1 {
        DatePrecision::Exact
    } else {
        DatePrecision::Phrase
    };
    let (start_year, end_year) = match precision {
        DatePrecision::Before => (None, years.first().copied()),
        DatePrecision::After => (years.first().copied(), None),
        DatePrecision::Range | DatePrecision::Period => {
            let start = years.iter().copied().min();
            let end = years.iter().copied().max();
            (start, end)
        }
        _ => {
            let year = years.first().copied();
            (year, year)
        }
    };
    Some(RecordedDate {
        original_text: original_text.to_string(),
        start_year,
        end_year,
        precision,
    })
}

fn extract_years(value: &str) -> Vec<i32> {
    value
        .split(|ch: char| !ch.is_ascii_digit())
        .filter_map(|part| {
            if !(3..=4).contains(&part.len()) {
                return None;
            }
            let year = part.parse::<i32>().ok()?;
            (100..=9999).contains(&year).then_some(year)
        })
        .collect()
}

pub fn union_ranges<'a, I>(ranges: I) -> Option<DateRange>
where
    I: IntoIterator<Item = &'a DateRange>,
{
    let mut start_year = i32::MAX;
    let mut end_year = i32::MIN;
    let mut found = false;

    for range in ranges {
        found = true;
        start_year = start_year.min(range.start_year);
        end_year = end_year.max(range.end_year);
    }

    if found {
        Some(DateRange {
            start_year,
            end_year,
        })
    } else {
        None
    }
}

pub fn accumulate_year_range(histogram: &mut [u32], bounds: DateRange, range: DateRange) {
    let start = range.start_year.max(bounds.start_year);
    let end = range.end_year.min(bounds.end_year);
    if start > end {
        return;
    }

    for year in start..=end {
        let index =
            usize::try_from(year - bounds.start_year).expect("year index should be non-negative");
        histogram[index] = histogram[index].saturating_add(1);
    }
}

#[cfg(test)]
mod tests {
    use super::{
        DatePrecision, DateRange, accumulate_year_range, parse_recorded_date, union_ranges,
    };

    #[test]
    fn preserves_gedcom_date_qualifiers_and_open_bounds() {
        let before = parse_recorded_date("BEF 1900").expect("date should parse");
        let period = parse_recorded_date("FROM 1900 TO 1910").expect("date should parse");
        let phrase = parse_recorded_date("in the spring").expect("phrase should remain recorded");

        assert_eq!(before.precision, DatePrecision::Before);
        assert_eq!((before.start_year, before.end_year), (None, Some(1900)));
        assert_eq!(period.precision, DatePrecision::Period);
        assert_eq!(
            (period.start_year, period.end_year),
            (Some(1900), Some(1910))
        );
        assert_eq!(phrase.precision, DatePrecision::Phrase);
        assert_eq!((phrase.start_year, phrase.end_year), (None, None));
    }

    #[test]
    fn unions_ranges_across_dates() {
        let ranges = [
            DateRange {
                start_year: 1900,
                end_year: 1904,
            },
            DateRange {
                start_year: 1880,
                end_year: 1910,
            },
        ];

        assert_eq!(
            union_ranges(ranges.iter()),
            Some(DateRange {
                start_year: 1880,
                end_year: 1910,
            })
        );
    }

    #[test]
    fn accumulates_inclusive_year_bins() {
        let bounds = DateRange {
            start_year: 1900,
            end_year: 1904,
        };
        let mut histogram = vec![0u32; 5];
        accumulate_year_range(
            &mut histogram,
            bounds,
            DateRange {
                start_year: 1901,
                end_year: 1903,
            },
        );

        assert_eq!(histogram, vec![0, 1, 1, 1, 0]);
    }
}
