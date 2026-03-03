(() => {
  "use strict";

  // ── DOM Elements ───────────────────────────────────────────────────
  const btnStart = document.getElementById("btnStart");
  const btnStop = document.getElementById("btnStop");
  const btnExport = document.getElementById("btnExport");
  const btnExportXLSX = document.getElementById("btnExportXLSX");
  const btnExportPDF = document.getElementById("btnExportPDF");
  const btnClear = document.getElementById("btnClear");
  const btnDashboard = document.getElementById("btnDashboard");
  const btnSync = document.getElementById("btnSync");
  const statusBadge = document.getElementById("statusBadge");
  const meetingInfo = document.getElementById("meetingLabel");
  const participantCount = document.getElementById("participantCount");
  const attendanceBody = document.getElementById("attendanceBody");
  const masterToggle = document.getElementById("masterToggle");
  const toggleDesc = document.getElementById("toggleDesc");
  const meetingSelectorWrap = document.getElementById("meetingSelectorWrap");
  const meetingSelect = document.getElementById("meetingSelect");
  const syncStatus = document.getElementById("syncStatus");

  let currentMeetingId = null;
  let isTracking = false;
  let refreshTimer = null;
  let lateThreshold = 5;

  // ── Init ────────────────────────────────────────────────────────────
  async function init() {
    chrome.storage.local.get(["trackingEnabled", "lateThreshold"], (result) => {
      masterToggle.checked = result.trackingEnabled !== false;
      updateToggleUI(masterToggle.checked);
      lateThreshold = result.lateThreshold || 5;
    });

    await checkContentScript();
    await loadMeetingList();

    refreshTimer = setInterval(() => {
      loadAttendanceData(currentMeetingId);
    }, 3000);
  }

  // ── Toggle UI ───────────────────────────────────────────────────────
  function updateToggleUI(enabled) {
    if (enabled) {
      toggleDesc.textContent = "Auto-track when you join a Meet";
      btnStart.disabled = false;
    } else {
      toggleDesc.textContent = "Tracking is turned off";
      btnStart.disabled = true;
    }
  }

  // ── Sync Status ─────────────────────────────────────────────────────
  function showSyncStatus(message, type) {
    syncStatus.textContent = message;
    syncStatus.className = `sync-status ${type}`;
    syncStatus.style.display = "block";
    if (type !== "syncing") {
      setTimeout(() => { syncStatus.style.display = "none"; }, 3000);
    }
  }

  async function checkContentScript() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url || !tab.url.startsWith("https://meet.google.com/")) {
        setNotOnMeet();
        return;
      }

      chrome.tabs.sendMessage(tab.id, { action: "getStatus" }, (response) => {
        if (chrome.runtime.lastError || !response) {
          setNotOnMeet();
          return;
        }

        if (response.tracking) {
          setTrackingActive(response.meetingId, response.participantCount);
        } else if (response.isMeeting) {
          setOnMeetReady();
          currentMeetingId = response.meetingId;
        } else {
          setNotOnMeet();
        }
      });
    } catch (e) {
      setNotOnMeet();
    }
  }

  // ── UI State Helpers ──────────────────────────────────────────────

  function setTrackingActive(meetingId, count) {
    isTracking = true;
    currentMeetingId = meetingId;
    statusBadge.textContent = "Tracking";
    statusBadge.classList.add("active");
    btnStart.disabled = true;
    btnStop.disabled = false;
    meetingInfo.textContent = `Meeting: ${meetingId}`;
    if (count !== undefined) {
      participantCount.textContent = `${count} participants`;
    }
    loadAttendanceData(meetingId);
  }

  function setOnMeetReady() {
    isTracking = false;
    statusBadge.textContent = "Ready";
    statusBadge.classList.remove("active");
    btnStart.disabled = !masterToggle.checked;
    btnStop.disabled = true;
    meetingInfo.textContent = "Meeting detected — click Start";
  }

  function setNotOnMeet() {
    isTracking = false;
    statusBadge.textContent = "Inactive";
    statusBadge.classList.remove("active");
    btnStart.disabled = true;
    btnStop.disabled = true;
    meetingInfo.textContent = "Open a Google Meet to start";
  }

  // ── Load Attendance Data ──────────────────────────────────────────

  function loadAttendanceData(meetingId) {
    if (!meetingId) return;

    const storageKey = `meeting_${meetingId}`;
    chrome.storage.local.get([storageKey], (result) => {
      const meeting = result[storageKey];
      if (!meeting || !meeting.participants) {
        renderEmptyTable();
        return;
      }
      renderTable(meeting);
    });
  }

  function renderTable(meeting) {
    const participants = meeting.participants;
    const entries = Object.values(participants);
    if (entries.length === 0) {
      renderEmptyTable();
      return;
    }

    const meetingStart = new Date(meeting.startedAt);
    const lateMs = lateThreshold * 60000;
    let rowNum = 0;
    const rows = [];

    for (const p of entries) {
      for (const session of p.sessions) {
        rowNum++;
        const joinDate = session.joinTime ? new Date(session.joinTime) : null;
        const leaveDate = session.leaveTime ? new Date(session.leaveTime) : null;

        const joinStr = joinDate
          ? joinDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
          : "N/A";
        const leaveStr = leaveDate
          ? leaveDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
          : "—";

        let duration = "—";
        if (joinDate && leaveDate) {
          const mins = Math.round(((leaveDate - joinDate) / 60000) * 100) / 100;
          duration = `${mins}m`;
        } else if (joinDate && !leaveDate) {
          const mins = Math.round(((Date.now() - joinDate) / 60000) * 100) / 100;
          duration = `~${mins}m`;
        }

        const isLate = joinDate && (joinDate - meetingStart) > lateMs;
        let statusClass, statusText;

        if (!leaveDate) {
          statusClass = "status-present"; statusText = "Present";
        } else if (isLate) {
          statusClass = "status-late"; statusText = "Late";
        } else {
          statusClass = "status-left"; statusText = "Left";
        }

        rows.push(`
          <tr>
            <td>${rowNum}</td>
            <td><strong>${escapeHtml(p.name)}</strong></td>
            <td>${joinStr}</td>
            <td>${leaveStr}</td>
            <td>${duration}</td>
            <td><span class="${statusClass}">${statusText}</span></td>
          </tr>
        `);
      }
    }

    attendanceBody.innerHTML = rows.join("");
    participantCount.textContent = `${entries.length} participants`;
  }

  function renderEmptyTable() {
    attendanceBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="6">No attendance data yet.</td>
      </tr>
    `;
    participantCount.textContent = "";
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Load Meeting List ──────────────────────────────────────────────

  async function loadMeetingList() {
    chrome.runtime.sendMessage({ action: "getAllMeetings" }, (response) => {
      if (chrome.runtime.lastError || !response || !response.meetings) return;

      const meetings = response.meetings;
      if (meetings.length === 0) {
        meetingSelectorWrap.style.display = "none";
        return;
      }

      meetingSelectorWrap.style.display = "flex";
      meetingSelect.innerHTML = "";

      meetings.forEach((m) => {
        const option = document.createElement("option");
        option.value = m.meetingId;
        const date = new Date(m.startedAt).toLocaleDateString([], {
          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
        });
        option.textContent = `${m.meetingId} (${date}) — ${m.participantCount} people`;
        if (m.meetingId === currentMeetingId) option.selected = true;
        meetingSelect.appendChild(option);
      });

      if (!currentMeetingId && meetings.length > 0) {
        currentMeetingId = meetings[0].meetingId;
        loadAttendanceData(currentMeetingId);
      }
    });
  }

  // ── Helper: get meeting data for export ────────────────────────────
  function getMeetingForExport(callback) {
    const mid = currentMeetingId || meetingSelect?.value;
    if (!mid) {
      meetingInfo.textContent = "No meeting selected.";
      return;
    }
    const key = `meeting_${mid}`;
    chrome.storage.local.get([key], (result) => {
      const meeting = result[key];
      if (!meeting || !meeting.participants) {
        meetingInfo.textContent = "No data to export.";
        return;
      }
      callback(meeting, mid);
    });
  }

  // ── Export: XLSX ───────────────────────────────────────────────────
  function exportXLSX(meeting, meetingId) {
    const meetingStart = new Date(meeting.startedAt);
    const lateMs = lateThreshold * 60000;
    let xmlRows = `<Row><Cell><Data ss:Type="String">Name</Data></Cell><Cell><Data ss:Type="String">Join Time</Data></Cell><Cell><Data ss:Type="String">Leave Time</Data></Cell><Cell><Data ss:Type="String">Duration (min)</Data></Cell><Cell><Data ss:Type="String">Status</Data></Cell></Row>`;

    for (const p of Object.values(meeting.participants)) {
      for (const s of p.sessions) {
        const joinDate = s.joinTime ? new Date(s.joinTime) : null;
        const leaveDate = s.leaveTime ? new Date(s.leaveTime) : null;
        const isLate = joinDate && (joinDate - meetingStart) > lateMs;
        const dur = joinDate && leaveDate ? Math.round(((leaveDate - joinDate) / 60000) * 100) / 100 : 0;
        const status = !leaveDate ? "Present" : isLate ? "Late" : "Left";
        xmlRows += `<Row><Cell><Data ss:Type="String">${xmlEsc(p.name)}</Data></Cell><Cell><Data ss:Type="String">${joinDate ? xmlEsc(joinDate.toLocaleString()) : "N/A"}</Data></Cell><Cell><Data ss:Type="String">${leaveDate ? xmlEsc(leaveDate.toLocaleString()) : "Still in meeting"}</Data></Cell><Cell><Data ss:Type="Number">${dur}</Data></Cell><Cell><Data ss:Type="String">${status}</Data></Cell></Row>`;
      }
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Attendance"><Table>${xmlRows}</Table></Worksheet></Workbook>`;
    downloadBlob(xml, `attendance_${meetingId}.xls`, "application/vnd.ms-excel");
    showFlash("XLSX exported!");
  }

  // ── Export: PDF ────────────────────────────────────────────────────
  function exportPDF(meeting, meetingId) {
    const meetingStart = new Date(meeting.startedAt);
    const lateMs = lateThreshold * 60000;
    let tableRows = "";
    let rowNum = 0;

    for (const p of Object.values(meeting.participants)) {
      for (const s of p.sessions) {
        rowNum++;
        const joinDate = s.joinTime ? new Date(s.joinTime) : null;
        const leaveDate = s.leaveTime ? new Date(s.leaveTime) : null;
        const isLate = joinDate && (joinDate - meetingStart) > lateMs;
        const dur = joinDate && leaveDate ? Math.round(((leaveDate - joinDate) / 60000) * 100) / 100 + " min" : "Ongoing";
        const status = !leaveDate ? "Present" : isLate ? "Late" : "Left";
        tableRows += `<tr><td>${rowNum}</td><td>${escapeHtml(p.name)}</td><td>${joinDate ? escapeHtml(joinDate.toLocaleString()) : "N/A"}</td><td>${leaveDate ? escapeHtml(leaveDate.toLocaleString()) : "\u2014"}</td><td>${dur}</td><td>${status}</td></tr>`;
      }
    }

    const pCount = Object.keys(meeting.participants).length;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Attendance \u2014 ${meetingId}</title><style>body{font-family:Arial,sans-serif;margin:40px;color:#333}h1{font-size:20px;color:#1a73e8}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#1a73e8;color:#fff;text-align:left;padding:8px 10px}td{padding:7px 10px;border-bottom:1px solid #e5e7eb}tr:nth-child(even) td{background:#f9fafb}@media print{body{margin:16px}}</style></head><body><h1>Meeting Attendance Report</h1><p>ID: <b>${meetingId}</b> | Date: <b>${new Date(meeting.startedAt).toLocaleString()}</b> | Participants: <b>${pCount}</b></p><table><thead><tr><th>#</th><th>Name</th><th>Join</th><th>Leave</th><th>Duration</th><th>Status</th></tr></thead><tbody>${tableRows}</tbody></table><script>window.onload=function(){window.print();}<\/script></body></html>`;
    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    showFlash("PDF print dialog opened!");
  }

  function xmlEsc(str) {
    return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename, saveAs: true }, () => {
      URL.revokeObjectURL(url);
    });
  }

  function showFlash(msg) {
    const prev = meetingInfo.textContent;
    meetingInfo.textContent = msg;
    setTimeout(() => { meetingInfo.textContent = prev; }, 2000);
  }

  // ── Event Listeners ────────────────────────────────────────────────

  // Master on/off toggle
  masterToggle.addEventListener("change", () => {
    const enabled = masterToggle.checked;
    chrome.runtime.sendMessage({ action: "setTrackingEnabled", enabled });
    chrome.storage.local.set({ autoStart: enabled });
    updateToggleUI(enabled);

    // If turning off while tracking, stop tracking
    if (!enabled && isTracking) {
      const doStop = async () => {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab) {
            chrome.tabs.sendMessage(tab.id, { action: "stopTracking" }, (response) => {
              if (response && response.success) {
                setOnMeetReady();
                loadAttendanceData(currentMeetingId);
              }
            });
          }
        } catch (e) {}
      };
      doStop();
    }
  });

  btnStart.addEventListener("click", async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      chrome.tabs.sendMessage(tab.id, { action: "startTracking" }, (response) => {
        if (chrome.runtime.lastError) {
          meetingInfo.textContent = "Error: Could not reach Meet page.";
          return;
        }
        if (response && response.success) setTrackingActive(response.meetingId, 0);
      });
    } catch (e) {
      meetingInfo.textContent = "Error starting tracker.";
    }
  });

  btnStop.addEventListener("click", async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      chrome.tabs.sendMessage(tab.id, { action: "stopTracking" }, (response) => {
        if (response && response.success) {
          setOnMeetReady();
          loadAttendanceData(currentMeetingId);
        }
      });
    } catch (e) {
      meetingInfo.textContent = "Error stopping tracker.";
    }
  });

  btnExport.addEventListener("click", () => {
    const mid = currentMeetingId || meetingSelect?.value;
    if (!mid) { meetingInfo.textContent = "No meeting selected."; return; }
    chrome.runtime.sendMessage({ action: "exportCSV", meetingId: mid }, (response) => {
      if (chrome.runtime.lastError) { meetingInfo.textContent = "Export error."; return; }
      if (response && response.success) showFlash("CSV exported!");
      else meetingInfo.textContent = response?.error || "Export failed.";
    });
  });

  btnExportXLSX.addEventListener("click", () => getMeetingForExport(exportXLSX));
  btnExportPDF.addEventListener("click", () => getMeetingForExport(exportPDF));

  btnDashboard.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "openDashboard" });
  });

  btnSync.addEventListener("click", () => {
    showSyncStatus("Syncing...", "syncing");
    btnSync.disabled = true;
    chrome.runtime.sendMessage({ action: "syncToServer" }, (response) => {
      btnSync.disabled = false;
      if (chrome.runtime.lastError || !response) {
        showSyncStatus("Sync failed.", "error");
        return;
      }
      if (response.success) {
        showSyncStatus(`Synced ${response.synced || 0} new, ${response.skipped || 0} updated`, "success");
      } else {
        showSyncStatus(response.error || "Sync failed.", "error");
      }
    });
  });

  btnClear.addEventListener("click", () => {
    const mid = currentMeetingId || meetingSelect?.value;
    if (!mid) return;
    if (!confirm(`Clear data for ${mid}?`)) return;
    chrome.runtime.sendMessage({ action: "clearData", meetingId: mid }, (response) => {
      if (response && response.success) {
        renderEmptyTable();
        meetingInfo.textContent = "Data cleared.";
        loadMeetingList();
      }
    });
  });

  meetingSelect.addEventListener("change", () => {
    currentMeetingId = meetingSelect.value;
    loadAttendanceData(currentMeetingId);
  });

  window.addEventListener("unload", () => {
    if (refreshTimer) clearInterval(refreshTimer);
  });

  // ── Go ──────────────────────────────────────────────────────────────
  init();
})();
