#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DateRange {
    pub start_year: i32,
    pub end_year: i32,
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
        let index = usize::try_from(year - bounds.start_year).expect("year index should be non-negative");
        histogram[index] = histogram[index].saturating_add(1);
    }
}

#[cfg(test)]
mod tests {
    use super::{DateRange, accumulate_year_range, union_ranges};

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
