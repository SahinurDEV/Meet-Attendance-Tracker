import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import DashboardLayout from './pages/DashboardLayout';
import Meetings from './pages/Meetings';
import Analytics from './pages/Analytics';
import Preferences from './pages/Preferences';
import MeetingDetail from './pages/MeetingDetail';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/dashboard" element={<DashboardLayout />}>
        <Route index element={<Meetings />} />
        <Route path="meetings" element={<Meetings />} />
        <Route path="meetings/:id" element={<MeetingDetail />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="preferences" element={<Preferences />} />
      </Route>
    </Routes>
  );
}
