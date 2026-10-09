import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';

function BarChart({ data, labelKey, valueKey, color = 'bg-brand-500', secondaryKey, secondaryColor = 'bg-green-400' }) {
  const maxVal = Math.max(...data.map(d => (d[valueKey] || 0) + (secondaryKey ? (d[secondaryKey] || 0) : 0)), 1);
  return (
    <div className="flex items-end gap-1.5 h-44 pt-4">
      {data.map((d, i) => {
        const val = d[valueKey] || 0;
        const val2 = secondaryKey ? (d[secondaryKey] || 0) : 0;
        const total = val + val2;
        const height = Math.max((total / maxVal) * 140, 2);
        const label = d[labelKey];
        const shortLabel = typeof label === 'string' && label.length > 6
          ? new Date(label + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : label;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, scaleY: 0 }}
            animate={{ opacity: 1, scaleY: 1 }}
            transition={{ duration: 0.5, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: 'bottom' }}
            className="flex flex-col items-center flex-1 gap-1"
          >
            <span className="text-[10px] font-semibold text-gray-600">{total || ''}</span>
            <div className="w-full flex flex-col items-center">
              {secondaryKey ? (
                <div className="w-full max-w-[32px] flex flex-col">
                  <div className={`${secondaryColor} rounded-t`} style={{ height: `${Math.max((val2/maxVal)*140, val2 ? 2 : 0)}px` }}></div>
                  <div className={`${color} ${val2 ? '' : 'rounded-t'}`} style={{ height: `${Math.max((val/maxVal)*140, val ? 2 : 0)}px` }}></div>
                </div>
              ) : (
                <div className={`w-full max-w-[32px] ${color} rounded-t`} style={{ height: `${height}px` }}></div>
              )}
            </div>
            <span className="text-[9px] text-gray-400 whitespace-nowrap">{shortLabel}</span>
          </motion.div>
        );
      })}
    </div>
  );
}

export default function Analytics() {
  const { authFetch } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await authFetch(`/api/analytics?days=${days}`);
        setData(await res.json());
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [days]);

  if (loading) return (
    <div className="p-8 flex justify-center">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full"
      />
    </div>
  );
  if (!data) return <div className="p-8 text-center text-gray-400">No data available.</div>;

  const cards = [
    { label: 'Total Meetings', value: data.totals.totalMeetings, color: 'text-brand-600' },
    { label: 'Total Participants', value: data.totals.totalParticipants, color: 'text-green-600' },
    { label: 'Avg Duration', value: `${data.totals.avgDuration}m`, color: 'text-purple-600' },
    { label: 'Avg Attendees', value: data.totals.avgAttendees, color: 'text-orange-600' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="p-6 lg:p-8"
    >
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
        <select value={days} onChange={(e) => setDays(parseInt(e.target.value))}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-brand-500 outline-none">
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      <p className="text-sm text-gray-400 mb-6">Explore your meeting patterns from the last {days} days.</p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.1 }}
            whileHover={{ y: -4, boxShadow: '0 12px 24px rgba(0,0,0,0.06)' }}
            className="bg-white rounded-xl border border-gray-100 p-5"
          >
            <motion.div
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, delay: 0.2 + i * 0.1 }}
              className={`text-2xl font-extrabold ${s.color}`}
            >
              {s.value}
            </motion.div>
            <div className="text-xs text-gray-400 mt-1">{s.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Meetings per day */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="bg-white rounded-2xl border border-gray-100 p-5"
        >
          <h3 className="font-bold text-gray-900 mb-4">Meetings per day</h3>
          {data.dailyData.length > 0 ? (
            <>
              <BarChart data={data.dailyData} labelKey="day" valueKey="scheduled" secondaryKey="adhoc" color="bg-brand-500" secondaryColor="bg-brand-200" />
              <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-400">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-brand-500 rounded-sm"></span> Scheduled</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-brand-200 rounded-sm"></span> Ad-hoc</span>
              </div>
            </>
          ) : <p className="text-sm text-gray-400 italic">No data for this period.</p>}
        </motion.div>

        {/* Avg duration */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="bg-white rounded-2xl border border-gray-100 p-5"
        >
          <h3 className="font-bold text-gray-900 mb-4">Avg. meeting duration (minutes)</h3>
          {data.durationStats.length > 0 ? (
            <BarChart data={data.durationStats.map(d => ({ ...d, avg_min: Math.round(d.avg_duration / 60) }))} labelKey="day" valueKey="avg_min" color="bg-green-500" />
          ) : <p className="text-sm text-gray-400 italic">No data for this period.</p>}
        </motion.div>

        {/* Top participants */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="bg-white rounded-2xl border border-gray-100 p-5"
        >
          <h3 className="font-bold text-gray-900 mb-4">Most Frequent Participants</h3>
          {data.topParticipants.length > 0 ? (
            <div className="space-y-3">
              {data.topParticipants.map((p, i) => {
                const maxCount = data.topParticipants[0].meeting_count;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: 0.5 + i * 0.06 }}
                    className="flex items-center gap-3"
                  >
                    <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-[10px] font-bold flex-shrink-0">{i + 1}</span>
                    <span className="text-sm font-medium text-gray-800 flex-shrink-0 min-w-[100px] truncate">{p.name}</span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(p.meeting_count / maxCount) * 100}%` }}
                        transition={{ duration: 0.8, delay: 0.6 + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                        className="h-full bg-brand-500 rounded-full"
                      />
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">{p.meeting_count} meetings</span>
                  </motion.div>
                );
              })}
            </div>
          ) : <p className="text-sm text-gray-400 italic">No data yet.</p>}
        </motion.div>

        {/* Punctuality */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="bg-white rounded-2xl border border-gray-100 p-5"
        >
          <h3 className="font-bold text-gray-900 mb-4">Late Arrivals</h3>
          {data.punctualityData.length > 0 ? (
            <div className="space-y-3">
              {data.punctualityData.map((p, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.6 + i * 0.06 }}
                  className="flex items-center gap-3"
                >
                  <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-[10px] font-bold flex-shrink-0">{i + 1}</span>
                  <span className="text-sm font-medium text-gray-800 flex-1 truncate">{p.name}</span>
                  <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-[10px] font-bold rounded-full">
                    Late {p.late_count}/{p.total_meetings}
                  </span>
                  <span className="text-xs text-gray-400">{Math.round((p.late_count / p.total_meetings) * 100)}%</span>
                </motion.div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400 italic">No late arrivals detected.</p>}
        </motion.div>

        {/* Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
          className="bg-white rounded-2xl border border-gray-100 p-5 lg:col-span-2"
        >
          <h3 className="font-bold text-gray-900 mb-4">Meetings Breakdown by Size</h3>
          {data.breakdown.length > 0 ? (
            <BarChart data={data.breakdown} labelKey="bucket" valueKey="count" color="bg-purple-500" />
          ) : <p className="text-sm text-gray-400 italic">No data yet.</p>}
        </motion.div>
      </div>
    </motion.div>
  );
}
