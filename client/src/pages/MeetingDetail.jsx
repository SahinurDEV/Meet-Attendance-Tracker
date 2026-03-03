import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';

function AvatarImg({ name, url }) {
  const [failed, setFailed] = useState(false);

  const getInitials = (n) => {
    if (!n) return '?';
    const parts = n.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  };

  const colors = [
    'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500',
    'bg-indigo-500', 'bg-teal-500', 'bg-orange-500', 'bg-red-500',
    'bg-cyan-500', 'bg-emerald-500', 'bg-violet-500', 'bg-rose-500',
  ];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const color = colors[Math.abs(hash) % colors.length];

  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        className="w-9 h-9 rounded-full flex-shrink-0 object-cover ring-2 ring-white shadow-sm"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className={`w-9 h-9 rounded-full ${color} text-white flex items-center justify-center text-xs font-bold flex-shrink-0 ring-2 ring-white shadow-sm`}>
      {getInitials(name)}
    </div>
  );
}

export default function MeetingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { authFetch } = useAuth();
  const [meeting, setMeeting] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef(null);

  useEffect(() => {
    fetchMeeting();
  }, [id]);

  useEffect(() => {
    const handler = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchMeeting = async () => {
    try {
      const res = await authFetch(`/api/meetings/${id}`);
      const data = await res.json();
      setMeeting(data.meeting);
      setParticipants(data.participants || []);
      setNewName(data.meeting?.name || '');
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // ── Helpers ────────────────────────────────────────────────────
  const formatDuration = (seconds) => {
    if (!seconds) return '-';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const formatDurationFull = (seconds) => {
    if (!seconds) return '-';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const formatTimeShort = (iso) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const getDateParts = (iso) => {
    if (!iso) return { day: '-', month: '-' };
    const d = new Date(iso);
    return {
      day: d.getDate(),
      month: d.toLocaleString('en-US', { month: 'short' }),
      year: d.getFullYear(),
    };
  };

  const getAvgDuration = () => {
    if (participants.length === 0) return '-';
    const totalSec = participants.reduce((sum, p) => sum + (p.duration_seconds || 0), 0);
    const avg = Math.round(totalSec / participants.length);
    if (avg === 0) return '-';
    return formatDuration(avg);
  };

  const getAttendanceRate = () => {
    if (participants.length === 0) return '-';
    const present = participants.filter((p) => p.status === 'present').length;
    return `${Math.round((present / participants.length) * 100)}%`;
  };

  const getStatusInfo = (p) => {
    if (!meeting) return { label: 'Present', color: 'green' };

    const meetingStart = meeting.started_at ? new Date(meeting.started_at) : null;
    const meetingEnd = meeting.ended_at ? new Date(meeting.ended_at) : null;
    const joinTime = p.join_time ? new Date(p.join_time) : null;
    const leaveTime = p.leave_time ? new Date(p.leave_time) : null;

    // Late: joined more than 5 minutes after meeting start
    if (joinTime && meetingStart && (joinTime - meetingStart) > 5 * 60 * 1000) {
      return { label: 'Late', color: 'yellow' };
    }

    // Left Early: left before meeting ended (with 2 min buffer)
    if (leaveTime && meetingEnd && (meetingEnd - leaveTime) > 2 * 60 * 1000) {
      return { label: 'Left Early', color: 'red' };
    }

    // Present
    return { label: 'Present', color: 'green' };
  };

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const getAvatarColor = (name) => {
    const colors = [
      'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500',
      'bg-indigo-500', 'bg-teal-500', 'bg-orange-500', 'bg-red-500',
      'bg-cyan-500', 'bg-emerald-500', 'bg-violet-500', 'bg-rose-500',
    ];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  // ── Filtered participants ──────────────────────────────────────
  const filtered = participants.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  // ── Delete meeting ─────────────────────────────────────────────
  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this entire meeting and all its participants?')) return;
    try {
      await authFetch(`/api/meetings/${id}`, { method: 'DELETE' });
      navigate('/dashboard/meetings');
    } catch (e) { console.error(e); }
  };

  // ── Delete single participant ──────────────────────────────────
  const handleDeleteParticipant = async (participantId) => {
    if (!confirm('Remove this participant?')) return;
    setParticipants((prev) => prev.filter((p) => p.id !== participantId));
  };

  // ── Edit meeting name ──────────────────────────────────────────
  const handleSaveName = async () => {
    setEditingName(false);
    setMeeting((prev) => ({ ...prev, name: newName }));
  };

  // ── Exports ────────────────────────────────────────────────────
  const exportCSV = () => {
    const rows = [['Name', 'Email', 'Join Time', 'Leave Time', 'Duration (min)', 'Status']];
    participants.forEach((p) => {
      const status = getStatusInfo(p);
      rows.push([
        `"${(p.name || '').replace(/"/g, '""')}"`,
        `"${p.email || ''}"`,
        `"${p.join_time ? new Date(p.join_time).toLocaleString() : 'N/A'}"`,
        `"${p.leave_time ? new Date(p.leave_time).toLocaleString() : 'Still in meeting'}"`,
        Math.round((p.duration_seconds || 0) / 60 * 100) / 100,
        status.label,
      ]);
    });
    downloadFile(rows.map((r) => r.join(',')).join('\n'), `attendance_${meeting?.meeting_code || id}.csv`, 'text/csv');
    setExportOpen(false);
  };

  const exportXLSX = () => {
    let xmlRows = '<Row><Cell><Data ss:Type="String">Name</Data></Cell><Cell><Data ss:Type="String">Email</Data></Cell><Cell><Data ss:Type="String">Join Time</Data></Cell><Cell><Data ss:Type="String">Leave Time</Data></Cell><Cell><Data ss:Type="String">Duration (min)</Data></Cell><Cell><Data ss:Type="String">Status</Data></Cell></Row>';
    participants.forEach((p) => {
      const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const status = getStatusInfo(p);
      xmlRows += `<Row><Cell><Data ss:Type="String">${esc(p.name)}</Data></Cell><Cell><Data ss:Type="String">${esc(p.email || '')}</Data></Cell><Cell><Data ss:Type="String">${p.join_time ? esc(new Date(p.join_time).toLocaleString()) : 'N/A'}</Data></Cell><Cell><Data ss:Type="String">${p.leave_time ? esc(new Date(p.leave_time).toLocaleString()) : ''}</Data></Cell><Cell><Data ss:Type="Number">${Math.round((p.duration_seconds || 0) / 60 * 100) / 100}</Data></Cell><Cell><Data ss:Type="String">${status.label}</Data></Cell></Row>`;
    });
    const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#E8F0FE" ss:Pattern="Solid"/></Style></Styles><Worksheet ss:Name="Attendance"><Table>${xmlRows}</Table></Worksheet></Workbook>`;
    downloadFile(xml, `attendance_${meeting?.meeting_code || id}.xls`, 'application/vnd.ms-excel');
    setExportOpen(false);
  };

  const exportPDF = () => {
    let trs = '';
    participants.forEach((p, i) => {
      const status = getStatusInfo(p);
      const statusColor = status.color === 'green' ? '#065f46' : status.color === 'yellow' ? '#92400e' : '#991b1b';
      const statusBg = status.color === 'green' ? '#d1fae5' : status.color === 'yellow' ? '#fef3c7' : '#fee2e2';
      trs += `<tr><td>${i + 1}</td><td>${escHtml(p.name)}</td><td>${p.join_time ? escHtml(new Date(p.join_time).toLocaleString()) : 'N/A'}</td><td>${p.leave_time ? escHtml(new Date(p.leave_time).toLocaleString()) : '—'}</td><td>${formatDurationFull(p.duration_seconds)}</td><td><span style="background:${statusBg};color:${statusColor};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${status.label}</span></td></tr>`;
    });
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Attendance — ${meeting?.meeting_code}</title><style>body{font-family:Arial,sans-serif;margin:40px;color:#333}h1{font-size:20px;color:#1a73e8;margin-bottom:2px}.meta{color:#666;font-size:13px;margin-bottom:20px}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#1a73e8;color:#fff;text-align:left;padding:8px 10px}td{padding:7px 10px;border-bottom:1px solid #e5e7eb}tr:nth-child(even) td{background:#f9fafb}.footer{margin-top:24px;font-size:10px;color:#aaa;text-align:center}@media print{body{margin:16px}}</style></head><body><h1>Meeting Attendance Report</h1><div class="meta">Meeting: <b>${escHtml(meeting?.meeting_code)}</b> &middot; Date: <b>${meeting?.started_at ? new Date(meeting.started_at).toLocaleString() : ''}</b> &middot; Participants: <b>${participants.length}</b></div><table><thead><tr><th>#</th><th>Name</th><th>Join Time</th><th>Leave Time</th><th>Duration</th><th>Status</th></tr></thead><tbody>${trs}</tbody></table><div class="footer">Generated by Meet Attendance Tracker &middot; ${new Date().toLocaleString()}</div><script>window.onload=function(){window.print();}<\/script></body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    setExportOpen(false);
  };

  const escHtml = (s) => {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  };

  const downloadFile = (content, filename, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Status badge colors ────────────────────────────────────────
  const statusStyles = {
    green: 'bg-green-100 text-green-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    red: 'bg-red-100 text-red-700',
  };

  // ── Render ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-400 mb-4">Meeting not found.</p>
        <Link to="/dashboard/meetings" className="text-brand-500 font-medium hover:underline">Go back</Link>
      </div>
    );
  }

  const dateParts = getDateParts(meeting.started_at);
  const presentCount = participants.filter((p) => getStatusInfo(p).label === 'Present').length;
  const lateCount = participants.filter((p) => getStatusInfo(p).label === 'Late').length;
  const leftEarlyCount = participants.filter((p) => getStatusInfo(p).label === 'Left Early').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="p-6 lg:p-8 max-w-6xl"
    >

      {/* ── Back button ────────────────────────────────────────── */}
      <Link to="/dashboard/meetings" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-brand-500 transition mb-6 group">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="group-hover:-translate-x-0.5 transition-transform"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Meetings
      </Link>

      {/* ── Meeting Title Section ────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="text-2xl font-bold text-gray-900 border-b-2 border-brand-500 outline-none bg-transparent"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
              />
              <button onClick={handleSaveName} className="text-brand-500 text-sm font-medium hover:underline">Save</button>
              <button onClick={() => setEditingName(false)} className="text-gray-400 text-sm hover:underline">Cancel</button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900">{meeting.name || meeting.meeting_code}</h1>
              <button onClick={() => { setEditingName(true); setNewName(meeting.name || meeting.meeting_code); }}
                className="text-gray-300 hover:text-brand-500 transition flex-shrink-0" title="Edit name">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <span>{dateParts.month} {dateParts.day}, {dateParts.year}</span>
          <span className="text-gray-200">|</span>
          <span>{formatTimeShort(meeting.started_at)} - {formatTimeShort(meeting.ended_at)}</span>
          {meeting.meeting_url && (
            <>
              <span className="text-gray-200">|</span>
              <a href={meeting.meeting_url} target="_blank" rel="noopener noreferrer"
                className="text-brand-500 hover:underline truncate max-w-xs">{meeting.meeting_code}</a>
            </>
          )}
        </div>
      </div>

      {/* ── Stats Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Participants */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Participants</span>
          </div>
          <div className="text-3xl font-extrabold text-gray-900">{participants.length}</div>
        </motion.div>

        {/* Attendance Rate */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Attendance</span>
          </div>
          <div className="text-3xl font-extrabold text-gray-900">{getAttendanceRate()}</div>
        </motion.div>

        {/* Avg Duration */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Avg Duration</span>
          </div>
          <div className="text-3xl font-extrabold text-gray-900">{getAvgDuration()}</div>
        </motion.div>

        {/* Meeting Duration */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Time</span>
          </div>
          <div className="text-3xl font-extrabold text-gray-900">{formatDuration(meeting.duration_seconds)}</div>
        </motion.div>
      </div>

      {/* ── Status Summary Badges ──────────────────────────────── */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-2 px-4 py-2 bg-green-50 rounded-xl border border-green-100">
          <div className="w-2.5 h-2.5 bg-green-500 rounded-full"></div>
          <span className="text-sm font-semibold text-green-700">{presentCount} Present</span>
        </div>
        {lateCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 rounded-xl border border-yellow-100">
            <div className="w-2.5 h-2.5 bg-yellow-500 rounded-full"></div>
            <span className="text-sm font-semibold text-yellow-700">{lateCount} Late</span>
          </div>
        )}
        {leftEarlyCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-50 rounded-xl border border-red-100">
            <div className="w-2.5 h-2.5 bg-red-500 rounded-full"></div>
            <span className="text-sm font-semibold text-red-700">{leftEarlyCount} Left Early</span>
          </div>
        )}
      </div>

      {/* ── Toolbar ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 w-full sm:max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search participants..."
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Delete meeting */}
          <button onClick={handleDelete}
            className="px-3.5 py-2 text-xs font-semibold text-red-500 bg-red-50 border border-red-100 rounded-xl hover:bg-red-100 transition flex items-center gap-1.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Delete
          </button>

          {/* Export dropdown */}
          <div className="relative" ref={exportRef}>
            <button onClick={() => setExportOpen(!exportOpen)}
              className="px-3.5 py-2 text-xs font-semibold text-brand-600 bg-brand-50 border border-brand-100 rounded-xl hover:bg-brand-100 transition flex items-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>

            {exportOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20 min-w-[140px]">
                <button onClick={exportCSV} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-3 transition">
                  <span className="w-5 h-5 bg-green-100 text-green-600 rounded flex items-center justify-center text-[10px] font-bold">C</span>
                  CSV
                </button>
                <button onClick={exportXLSX} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-3 transition">
                  <span className="w-5 h-5 bg-emerald-100 text-emerald-600 rounded flex items-center justify-center text-[10px] font-bold">X</span>
                  XLSX
                </button>
                <button onClick={exportPDF} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-3 transition">
                  <span className="w-5 h-5 bg-red-100 text-red-600 rounded flex items-center justify-center text-[10px] font-bold">P</span>
                  PDF
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Participants Table ────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[2fr_1fr_1fr_100px_80px] px-5 py-3.5 border-b border-gray-100 bg-gray-50/70">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</span>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Join</span>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Leave</span>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Duration</span>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</span>
        </div>

        {/* Participant rows */}
        <div className="divide-y divide-gray-50">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400 italic text-sm">
              {search ? 'No participants match your search.' : 'No participants recorded.'}
            </div>
          ) : filtered.map((p, index) => {
            const status = getStatusInfo(p);
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.03 }}
                className="grid grid-cols-[2fr_1fr_1fr_100px_80px] px-5 py-3.5 items-center hover:bg-gray-50/60 transition group"
              >
                {/* Name + Avatar */}
                <div className="flex items-center gap-3 min-w-0">
                  <AvatarImg name={p.name} url={p.avatar_url} />
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-gray-800 truncate block">{p.name}</span>
                    {p.email && <span className="text-[11px] text-gray-400 truncate block">{p.email}</span>}
                  </div>
                </div>

                {/* Join time */}
                <span className="text-sm text-gray-600">{formatTimeShort(p.join_time)}</span>

                {/* Leave time */}
                <span className="text-sm text-gray-600">{p.leave_time ? formatTimeShort(p.leave_time) : '-'}</span>

                {/* Duration */}
                <span className="text-sm text-gray-600 font-medium">{formatDuration(p.duration_seconds)}</span>

                {/* Status badge */}
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${statusStyles[status.color]}`}>
                    {status.label}
                  </span>
                  {/* Delete (shows on hover) */}
                  <button
                    onClick={() => handleDeleteParticipant(p.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition p-0.5 -mr-2"
                    title="Remove"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Footer count */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/30 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            Showing {filtered.length} of {participants.length} participant{participants.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded-full"></span> Present</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-yellow-500 rounded-full"></span> Late</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-500 rounded-full"></span> Left Early</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
