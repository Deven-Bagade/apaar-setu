// India as a tile-grid cartogram: one square per state, no map files needed.
const TILES = [
  ['JK', 'Jammu & Kashmir', 3, 0], ['LA', 'Ladakh', 4, 0],
  ['PB', 'Punjab', 2, 1], ['HP', 'Himachal Pradesh', 3, 1], ['UK', 'Uttarakhand', 4, 1], ['SK', 'Sikkim', 6, 1], ['AR', 'Arunachal Pradesh', 8, 1],
  ['RJ', 'Rajasthan', 1, 2], ['HR', 'Haryana', 2, 2], ['DL', 'Delhi', 3, 2], ['UP', 'Uttar Pradesh', 4, 2], ['BR', 'Bihar', 5, 2], ['AS', 'Assam', 7, 2], ['NL', 'Nagaland', 8, 2],
  ['GJ', 'Gujarat', 0, 3], ['MP', 'Madhya Pradesh', 2, 3], ['CG', 'Chhattisgarh', 3, 3], ['JH', 'Jharkhand', 4, 3], ['WB', 'West Bengal', 5, 3], ['ML', 'Meghalaya', 6, 3], ['MN', 'Manipur', 8, 3],
  ['MH', 'Maharashtra', 1, 4], ['TS', 'Telangana', 2, 4], ['OD', 'Odisha', 4, 4], ['TR', 'Tripura', 6, 4], ['MZ', 'Mizoram', 7, 4],
  ['GA', 'Goa', 0, 5], ['KA', 'Karnataka', 1, 5], ['AP', 'Andhra Pradesh', 2, 5],
  ['KL', 'Kerala', 1, 6], ['TN', 'Tamil Nadu', 2, 6],
];

/** values: { [stateName]: { value, label, color } } */
export default function IndiaMap({ values, selected, onSelect, caption }) {
  return (
    <div>
      <div className="tilemap" role="group" aria-label="India state map">
        {Array.from({ length: 7 }).flatMap((_, row) =>
          Array.from({ length: 9 }).map((__, col) => {
            const tl = TILES.find((x) => x[2] === col && x[3] === row);
            if (!tl) return <div key={row + '-' + col} />;
            const v = values[tl[1]];
            return (
              <button
                type="button"
                key={tl[0]}
                className={`tile ${v ? 'has c-' + v.color : ''} ${selected === tl[1] ? 'sel' : ''}`}
                title={`${tl[1]}${v ? ': ' + v.label : ': no AICTE data in this demo'}`}
                onClick={() => v && onSelect?.(selected === tl[1] ? null : tl[1])}
                style={{ font: 'inherit', fontSize: 11, fontWeight: 700 }}
              >
                {tl[0]}
                {v && <span className="v">{v.value}</span>}
              </button>
            );
          }),
        )}
      </div>
      {caption && <div className="small muted mt-s">{caption}</div>}
    </div>
  );
}
