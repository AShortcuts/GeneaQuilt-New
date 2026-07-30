# Use binary husband-and-wife Families

GeneaQuilt represents each Family with at most one `HUSB` role, at most one `WIFE` role, and any number of children. One role may be unknown, but a Family that links children must identify at least one parent; multiple or simultaneous spouses are separate Families, and birth, adoptive, foster, and step relationships remain distinct so half-sibling parentage is never inferred incorrectly.

The `HUSB` and `WIFE` positions are structural GEDCOM roles and do not override or supply a Person Record's independent `SEX` value, consistent with the [FamilySearch GEDCOM 7 specification](https://gedcom.io/specifications/FamilySearchGEDCOMv7.html). Source structures that do not fit the supported model are preserved and reported rather than silently rewritten or discarded.
