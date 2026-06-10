import { formatLocal, formatUTC } from '../astro/format'
import { useStore } from '../state/store'

const SPEEDS = [
  { label: '−1 wk/s', v: -604800 },
  { label: '−1 day/s', v: -86400 },
  { label: '−1 hr/s', v: -3600 },
  { label: '−1 min/s', v: -60 },
  { label: 'real time', v: 1 },
  { label: '1 min/s', v: 60 },
  { label: '1 hr/s', v: 3600 },
  { label: '6 hr/s', v: 21600 },
  { label: '1 day/s', v: 86400 },
  { label: '1 wk/s', v: 604800 },
]

const HOUR = 3600_000
const DAY = 24 * HOUR
const MONTH = 30.436875 * DAY
const YEAR = 365.25 * DAY

const STEPS: { label: string; ms: number }[] = [
  { label: '−1y', ms: -YEAR },
  { label: '−1m', ms: -MONTH },
  { label: '−1d', ms: -DAY },
  { label: '−1h', ms: -HOUR },
  { label: '+1h', ms: HOUR },
  { label: '+1d', ms: DAY },
  { label: '+1m', ms: MONTH },
  { label: '+1y', ms: YEAR },
]

function toLocalInputValue(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function TimeBar() {
  // Subscribe at 1 Hz granularity so the bar doesn't re-render every frame.
  const sec = useStore((s) => Math.floor(s.timeMs / 1000))
  const speed = useStore((s) => s.speed)
  const setSpeed = useStore((s) => s.setSpeed)
  const togglePlay = useStore((s) => s.togglePlay)
  const setTime = useStore((s) => s.setTime)
  const ms = sec * 1000
  const paused = speed === 0

  return (
    <footer className="timebar">
      <div className="time-readout">
        <span className="time-local">{formatLocal(ms)}</span>
        <span className="time-utc">{formatUTC(ms)}</span>
      </div>

      <div className="time-transport">
        {STEPS.slice(0, 4).map((s) => (
          <button key={s.label} className="tbtn" onClick={() => setTime(useStore.getState().timeMs + s.ms)}>
            {s.label}
          </button>
        ))}
        <button className={`tbtn play${paused ? '' : ' playing'}`} onClick={togglePlay}>
          {paused ? '▶' : '⏸'}
        </button>
        {STEPS.slice(4).map((s) => (
          <button key={s.label} className="tbtn" onClick={() => setTime(useStore.getState().timeMs + s.ms)}>
            {s.label}
          </button>
        ))}
        <button className="tbtn now" onClick={() => setTime(Date.now())}>
          NOW
        </button>
        <select
          className="speed-select"
          value={paused ? useStore.getState().lastSpeed : speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          aria-label="time rate"
        >
          {SPEEDS.map((s) => (
            <option key={s.v} value={s.v}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <input
        className="time-input"
        type="datetime-local"
        value={toLocalInputValue(ms)}
        onChange={(e) => {
          const t = new Date(e.target.value).getTime()
          if (isFinite(t)) setTime(t)
        }}
      />
    </footer>
  )
}
