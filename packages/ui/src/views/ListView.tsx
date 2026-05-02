import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useState } from "react";
import { DriveItemIcon } from "../icons/DriveItemIcon.js";
import { driveIconKind } from "../icons/driveIconKind.js";

/** Pre-formatted row for filesystem table + keyboard nav. */
export type DriveListDisplayRow = {
  id: string;
  name: string;
  /** file | folder | … */
  type: string;
  mime?: string | null;
  snippet?: string | null;
  locationPath?: string | null;
  sizeLabel: string;
  modifiedLabel: string;
  kindLabel: string;
};

export function DriveListView(props: {
  ariaLabel?: string;
  columnLabels: {
    name: string;
    modified: string;
    size: string;
  };
  rows: readonly DriveListDisplayRow[];
  onRowOpen?: (row: DriveListDisplayRow) => void;
}): ReactNode {
  const baseId = useId();
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const len = props.rows.length;
    if (len === 0) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex((i) => Math.min(Math.max(0, i), len - 1));
  }, [props.rows]);

  const openAt = useCallback(
    (i: number) => {
      const r = props.rows[i];
      if (r) props.onRowOpen?.(r);
    },
    [props.onRowOpen, props.rows],
  );

  const onGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!props.onRowOpen || props.rows.length === 0) return;
    const max = props.rows.length - 1;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(max, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(max);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openAt(activeIndex);
    }
  };

  if (props.rows.length === 0) return null;

  const activeRow = props.rows[activeIndex];
  const activeDescendant = activeRow ? `${baseId}-${activeRow.id}` : undefined;

  return (
    <div
      className="dri-drive-grid"
      role="grid"
      tabIndex={0}
      aria-label={props.ariaLabel}
      aria-rowcount={props.rows.length}
      aria-colcount={4}
      aria-activedescendant={activeDescendant}
      onKeyDown={onGridKeyDown}
    >
      <div role="row" className="dri-drive-header-row">
        <div className="dri-drive-icon-wrap invisible pointer-events-none" aria-hidden />
        <div role="columnheader" className="dri-drive-name-col">
          {props.columnLabels.name}
        </div>
        <div role="columnheader" className="dri-drive-meta-col-wide">
          {props.columnLabels.modified}
        </div>
        <div role="columnheader" className="dri-drive-meta-col">
          {props.columnLabels.size}
        </div>
      </div>
      {props.rows.map((r, i) => {
        const rowId = `${baseId}-${r.id}`;
        const active = i === activeIndex;
        return (
          <div
            key={r.id}
            id={rowId}
            role="row"
            aria-selected={active}
            className={`dri-drive-row dri-drive-row-focus ${active ? "dri-drive-row-active" : ""}`}
            onClick={() => {
              setActiveIndex(i);
              props.onRowOpen?.(r);
            }}
            onMouseEnter={() => setActiveIndex(i)}
          >
            <div
              role="gridcell"
              className={`dri-drive-icon-wrap dri-drive-icon-wrap--${driveIconKind(r)}`}
            >
              <DriveItemIcon name={r.name} type={r.type} mime={r.mime} size="sm" />
            </div>
            <div className="dri-drive-name-col" role="gridcell">
              <div className="dri-drive-name-primary">{r.name}</div>
              {r.snippet ? (
                <p className="dri-drive-name-secondary">{r.snippet}</p>
              ) : r.locationPath ? (
                <p className="dri-drive-name-secondary">{r.locationPath}</p>
              ) : null}
            </div>
            <div className="dri-drive-meta-col-wide" role="gridcell">
              {r.modifiedLabel}
            </div>
            <div className="dri-drive-meta-col" role="gridcell">
              {r.sizeLabel}
            </div>
          </div>
        );
      })}
    </div>
  );
}
