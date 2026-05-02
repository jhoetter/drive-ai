import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useState } from "react";
import { DriveItemIcon } from "../icons/DriveItemIcon.js";
import { driveIconKind } from "../icons/driveIconKind.js";
import type { DriveListDisplayRow } from "./ListView.js";

export function DriveGridView(props: {
  ariaLabel?: string;
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

  const onContainerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!props.onRowOpen || props.rows.length === 0) return;
    const max = props.rows.length - 1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(max, i + 1));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
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
      className="dri-drive-grid w-full px-2"
      role="grid"
      tabIndex={0}
      aria-label={props.ariaLabel}
      aria-rowcount={Math.ceil(props.rows.length / 3)}
      aria-colcount={3}
      aria-activedescendant={activeDescendant}
      onKeyDown={onContainerKeyDown}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {props.rows.map((r, i) => {
          const cid = `${baseId}-${r.id}`;
          const active = i === activeIndex;
          return (
            <div
              key={r.id}
              id={cid}
              role="gridcell"
              className={`dri-drive-grid-card ${active ? "dri-drive-grid-card-active" : ""}`}
              aria-selected={active}
              onClick={() => {
                setActiveIndex(i);
                props.onRowOpen?.(r);
              }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <div
                className={`dri-drive-icon-wrap dri-drive-icon-wrap--lg dri-drive-icon-wrap--${driveIconKind(r)} shrink-0`}
              >
                <DriveItemIcon size="lg" name={r.name} type={r.type} mime={r.mime} />
              </div>
              <span className="dri-drive-grid-card-label" title={r.name}>
                {r.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
