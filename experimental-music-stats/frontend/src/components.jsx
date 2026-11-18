import React, { useMemo, useState } from "react";
import { ArrowDownUp, ChevronDown, Disc3 } from "lucide-react";
import { imageSrc } from "./api.js";
import { formatDuration, formatNumber } from "./utils.js";

export function Cover({ item, type = "album" }) {
  const src = imageSrc(item);
  const [failedSrc, setFailedSrc] = useState("");
  return (
    <div className={`cover ${type}`}>
      {src && src !== failedSrc ? <img src={src} alt="" loading="lazy" onError={() => setFailedSrc(src)} /> : <Disc3 size={22} />}
    </div>
  );
}

export function StatCard({ label, value, sub }) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub ? <small>{sub}</small> : null}
    </article>
  );
}

function ChartReadout({ rows, selected, onChange, label, duration = false }) {
  if (!rows.length) return <p className="muted">Sin actividad en este periodo</p>;
  const current = rows.find(row => row.key === selected) || rows.at(-1);
  return (
    <div className="chart-readout">
      <label className="select-field"><span className="sr-only">{label}</span>
        <select aria-label={label} value={current.key} onChange={event => onChange(event.target.value)}>
          {rows.map(row => <option key={row.key} value={row.key}>{row.key}</option>)}
        </select>
        <ChevronDown size={20} aria-hidden="true" />
      </label>
      <output aria-live="polite">{duration ? `${formatDuration(current.value)} estimados` : `${formatNumber(current.value)} reproducciones`}</output>
    </div>
  );
}

export function MiniBars({ data = [], metric = "plays" }) {
  const [selected, setSelected] = useState("");
  const rows = data.map(item => ({ key: item.day || item.week || item.month, value: Number(item[metric]) || 0 }));
  const current = rows.find(row => row.key === selected) || rows.at(-1);
  const label = data[0]?.week ? "Consultar semana" : "Consultar día";
  const max = Math.max(...data.map((item) => Number(item[metric]) || 0), 1);
  const labelStep = Math.max(1, Math.ceil(data.length / 8));
  return (
    <div>
      <ChartReadout rows={rows} selected={selected} onChange={setSelected} label={label} />
      <div className="chart bars" aria-hidden="true">
      {data.map((item, index) => (
        <div className={`bar ${current?.key === (item.day || item.week || item.month) ? "selected" : ""}`} key={item.day || item.week || item.month} title={`${item.day || item.week || item.month}: ${item[metric]}`}>
          <span style={{ height: `${Math.max(5, (Number(item[metric]) / max) * 100)}%` }} />
          <small>{index % labelStep === 0 || index === data.length - 1 ? String(item.day || item.week || item.month).slice(-2) : ""}</small>
        </div>
      ))}
      </div>
    </div>
  );
}

export function AreaLine({ data = [] }) {
  const [selected, setSelected] = useState("");
  const width = 640;
  const height = 180;
  let total = 0;
  const points = data.map((item, index) => {
    total += Number(item.seconds || 0);
    return { key: item.day, value: total, x: data.length > 1 ? (index / (data.length - 1)) * width : 0, yValue: total };
  });
  const max = Math.max(...points.map((point) => point.yValue), 1);
  const line = points.map((point) => `${point.x},${height - (point.yValue / max) * (height - 20) - 10}`).join(" ");
  const current = points.find(point => point.key === selected) || points.at(-1);

  return (
    <div>
      <ChartReadout rows={points} selected={selected} onChange={setSelected} label="Consultar tiempo acumulado por fecha" duration />
      <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tiempo acumulado estimado del periodo; valores disponibles en el selector de fecha">
        <polyline points={line} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        {current ? <circle cx={current.x} cy={height - (current.yValue / max) * (height - 20) - 10} r="5" fill="currentColor" /> : null}
      </svg>
    </div>
  );
}

export function TopList({ title, items = [], type = "tracks" }) {
  return (
    <section className={`panel ranking ${type}`}>
      <h2>{title}</h2>
      <div className="rank-list">
        {items.length ? items.map((item, index) => (
          <div className="rank-row" key={`${type}-${item.id}`}>
            <span className="rank">{index + 1}</span>
            <Cover item={item} type={type === "artists" ? "artist" : "album"} />
            <div>
              <strong>{item.name}</strong>
              <small>{item.artist || `${formatDuration(item.seconds || 0)} estimados`}</small>
            </div>
            <b>{formatNumber(item.plays)}</b>
          </div>
        )) : <p className="muted">Sin datos todavía</p>}
      </div>
    </section>
  );
}

export function SortableTable({ columns, rows }) {
  const sortable = columns.filter(column => column.key !== "cover");
  const [sort, setSort] = useState({ key: sortable[0]?.key, direction: sortable[0]?.key === "date" ? "desc" : "asc" });
  const sortedRows = useMemo(() => {
    const column = columns.find((item) => item.key === sort.key);
    const accessor = column?.sortValue || ((row) => row[sort.key]);
    return [...rows].sort((a, b) => {
      const left = accessor(a) ?? "";
      const right = accessor(b) ?? "";
      const result = typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right), "es", { numeric: true });
      return sort.direction === "asc" ? result : -result;
    });
  }, [columns, rows, sort]);

  function toggleSort(key) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  }

  return (
    <div className="table-wrap" tabIndex={0} aria-label="Tabla de reproducciones">
      <div className="mobile-sort">
        <label className="select-field">Ordenar por<select aria-label="Ordenar por" value={sort.key} onChange={event => setSort(current => ({ ...current, key: event.target.value }))}>
          {sortable.map(column => <option key={column.key} value={column.key}>{column.label}</option>)}
        </select><ChevronDown size={20} aria-hidden="true" /></label>
        <button className="sort-direction" title="Cambiar dirección del orden" aria-label={sort.direction === "asc" ? "Cambiar a orden descendente" : "Cambiar a orden ascendente"} onClick={() => toggleSort(sort.key)}><ArrowDownUp size={20} /></button>
        <small>{sort.direction === "asc" ? "Ascendente" : "Descendente"}</small>
      </div>
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} aria-sort={sort.key === column.key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                {column.key === "cover" ? column.label : <button className="table-sort" onClick={() => toggleSort(column.key)}>
                <span>{column.label}</span>
                <ArrowDownUp size={13} />
                </button>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.length ? sortedRows.map((row, index) => (
            <tr key={row.id || index}>
              {columns.map((column) => (
                <td data-label={column.label} key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>
              ))}
            </tr>
          )) : (
            <tr>
              <td colSpan={columns.length}>Sin datos todavía</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
