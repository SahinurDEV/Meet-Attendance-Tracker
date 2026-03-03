import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';

export default function DashboardLayout() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
