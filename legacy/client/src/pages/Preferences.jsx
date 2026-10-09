import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';

export default function Preferences() {
  const { authFetch } = useAuth();
  const [prefs, setPrefs] = useState({
    autoTrack: true,
    newTabReport: true,
    lateThresholdMinutes: 5,
    earlyThresholdMinutes: 5,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch('/api/preferences');
        const data = await res.json();
        setPrefs(data);
      } catch (e) { console.error(e); }
    })();
  }, []);

  const updatePref = async (key, value) => {
    const newPrefs = { ...prefs, [key]: value };
    setPrefs(newPrefs);
    setSaved(false);
    try {
      await authFetch('/api/preferences', {
        method: 'PUT',
        body: JSON.stringify(newPrefs),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error(e); }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="p-6 lg:p-8"
    >
      <h1 className="text-xl font-bold text-gray-900 mb-6">Browser Extension Preferences</h1>

      {saved && (
        <div className="mb-4 px-4 py-2 bg-green-50 text-green-600 text-sm rounded-lg inline-block">
          Settings saved!
        </div>
      )}

      <div className="space-y-4 max-w-2xl">
        {/* New Tab Report */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-900 mb-1">New Tab Report</h3>
              <p className="text-sm text-gray-400">Open a new tab with the attendance report as soon as your meeting ends.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={prefs.newTabReport} onChange={(e) => updatePref('newTabReport', e.target.checked)} className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-brand-100 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500"></div>
            </label>
          </div>
        </div>

        {/* Auto tracking */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-900 mb-1">Automatic Attendance Tracking</h3>
              <p className="text-sm text-gray-400">Automatically monitor meeting attendance as participants join or leave.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={prefs.autoTrack} onChange={(e) => updatePref('autoTrack', e.target.checked)} className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-brand-100 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500"></div>
            </label>
          </div>
        </div>

        {/* Late threshold */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-900 mb-1">Late Arrival Threshold</h3>
              <p className="text-sm text-gray-400">Participants joining after this many minutes are marked as "Late".</p>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" min="1" max="60" value={prefs.lateThresholdMinutes}
                onChange={(e) => updatePref('lateThresholdMinutes', parseInt(e.target.value) || 5)}
                className="w-16 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-brand-500 outline-none" />
              <span className="text-sm text-gray-400">min</span>
            </div>
          </div>
        </div>

        {/* Early threshold */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-900 mb-1">Early Departure Threshold</h3>
              <p className="text-sm text-gray-400">Participants leaving this many minutes before the end are marked as "Left Early".</p>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" min="1" max="60" value={prefs.earlyThresholdMinutes}
                onChange={(e) => updatePref('earlyThresholdMinutes', parseInt(e.target.value) || 5)}
                className="w-16 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-brand-500 outline-none" />
              <span className="text-sm text-gray-400">min</span>
            </div>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="mt-8 max-w-2xl bg-white rounded-2xl border border-gray-100 p-6">
        <h3 className="font-bold text-gray-900 mb-2">About</h3>
        <p className="text-sm text-gray-400 leading-relaxed">
          <strong className="text-gray-600">Meet Attendance Tracker v1.0.0</strong> — Free and open source.
          All features included, no paywalls. Your data is stored securely in your account.
          Privacy first: no tracking, no ads, no third-party data sharing.
        </p>
      </div>
    </motion.div>
  );
}
