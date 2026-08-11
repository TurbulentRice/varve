import type { Simulation } from '@varve/retirement';
import { money } from '../lib/format.js';

/**
 * The chart's table twin.
 *
 * Every value the fan encodes, reachable without a pointer. A tooltip is an
 * enhancement; it must never be the only route to a number.
 */
export function ProjectionTable({
  simulation,
  startYear,
}: {
  simulation: Simulation;
  startYear: number;
}) {
  return (
    <div className="table-scroll">
      <table>
        <caption className="table-caption">
          {simulation.runs.toLocaleString()} simulated runs · {simulation.model}
        </caption>
        <thead>
          <tr>
            <th scope="col">Year</th>
            <th scope="col">Worst tenth</th>
            <th scope="col">Lower quarter</th>
            <th scope="col">Median</th>
            <th scope="col">Upper quarter</th>
            <th scope="col">Best tenth</th>
          </tr>
        </thead>
        <tbody>
          {simulation.years.map((row) => (
            <tr key={row.year}>
              <th scope="row" className="year">
                {startYear + row.year}
              </th>
              <td className="num muted">{money(row.band.p10)}</td>
              <td className="num">{money(row.band.p25)}</td>
              <td className="num strong">{money(row.band.median)}</td>
              <td className="num">{money(row.band.p75)}</td>
              <td className="num muted">{money(row.band.p90)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="table-note">
        Each row is where the simulated runs stood at that year&rsquo;s end. Ten percent finished
        below the worst-tenth column and ten percent above the best-tenth one; half landed inside
        the two quarter columns.
      </p>
    </div>
  );
}
