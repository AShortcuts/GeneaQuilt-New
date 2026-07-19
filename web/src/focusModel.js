export function buildFocusModel({
  selectedId = null,
  pinnedIds = [],
  searchMatchIds = [],
  visibleIds = [],
  timelineFocus = null,
} = {}) {
  const primaryId = selectedId || null;
  const highlightIds = uniqueIds([primaryId, ...pinnedIds]);
  const searchIds = uniqueIds(searchMatchIds);
  const viewportIds = uniqueIds(visibleIds);
  const timelineIds = uniqueIds(timelineFocus?.vertex_ids ?? []);
  const timelineActiveIds = timelineFocus
    ? uniqueIds([...highlightIds, ...searchIds])
    : uniqueIds([...viewportIds, ...highlightIds, ...searchIds]);

  return {
    primaryId,
    highlightIds,
    searchIds,
    visibleIds: viewportIds,
    timelineIds,
    timelineActiveIds,
    timelineRange: timelineFocus
      ? {
          startYear: timelineFocus.start_year,
          endYear: timelineFocus.end_year,
        }
      : null,
    hasSelectionContext: Boolean(primaryId || highlightIds.length),
    hasTimelineContext: Boolean(timelineFocus),
  };
}

export function describeFocusModel(model) {
  const parts = [];
  if (model.primaryId) {
    parts.push("1 selected");
  }
  const pinnedCount = Math.max(0, model.highlightIds.length - (model.primaryId ? 1 : 0));
  if (pinnedCount) {
    parts.push(`${pinnedCount} pinned`);
  }
  if (model.searchIds.length) {
    parts.push(
      `${model.searchIds.length} search ${model.searchIds.length === 1 ? "match" : "matches"}`,
    );
  }
  if (model.timelineRange) {
    parts.push(`${model.timelineRange.startYear}-${model.timelineRange.endYear}`);
  }
  return parts.length ? parts.join(" · ") : "No active focus";
}

export function interpolateCamera(from, to, progress) {
  const t = Math.min(1, Math.max(0, Number(progress) || 0));
  return {
    scale: lerp(from.scale, to.scale, t),
    offsetX: lerp(from.offsetX, to.offsetX, t),
    offsetY: lerp(from.offsetY, to.offsetY, t),
  };
}

function uniqueIds(ids) {
  return [...new Set(ids.filter(Boolean))];
}

function lerp(from, to, progress) {
  return from + (to - from) * progress;
}
