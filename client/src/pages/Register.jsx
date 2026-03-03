import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      await register(name, email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Navbar */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all ${scrolled ? 'bg-white/95 backdrop-blur-md shadow-md' : 'bg-white/80 backdrop-blur-sm'}`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 font-bold text-gray-900 text-lg">
            <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            Meet Attendance
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="text-sm font-medium text-gray-500 hover:text-brand-500 transition hidden sm:block">Dashboard</Link>
            <Link to="/login" className="px-5 py-2 bg-brand-500 text-white text-sm font-semibold rounded-lg hover:bg-brand-600 transition">Log in</Link>
          </div>
        </div>
      </nav>

      {/* Register form */}
      <div className="flex-1 flex items-center justify-center px-4 pt-24 pb-16">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
            <h1 className="text-2xl font-bold text-gray-900 text-center mb-1">Create your account</h1>
            <p className="text-sm text-gray-400 text-center mb-6">Free forever. All features included.</p>

            {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  placeholder="Your name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  placeholder="you@example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  placeholder="Min. 6 characters" />
              </div>
              <button type="submit" disabled={loading}
                className="w-full py-2.5 bg-brand-500 text-white font-semibold rounded-lg hover:bg-brand-600 transition disabled:opacity-50">
                {loading ? 'Creating account...' : 'Sign up free'}
              </button>
            </form>

            <p className="text-sm text-gray-400 text-center mt-5">
              Already have an account? <Link to="/login" className="text-brand-500 font-medium hover:underline">Log in</Link>
            </p>

            <div className="mt-4 pt-4 border-t border-gray-100 text-center">
              <Link to="/dashboard" className="text-sm text-gray-400 hover:text-brand-500 transition">
                Continue without account →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-8 bg-gray-900">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 pb-4 border-b border-white/10">
            <div className="flex items-center gap-2.5 text-white font-bold">
              <div className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              Meet Attendance Tracker
            </div>
            <div className="flex gap-6">
              <Link to="/" className="text-sm text-gray-400 hover:text-white transition">Home</Link>
              <Link to="/dashboard" className="text-sm text-gray-400 hover:text-white transition">Dashboard</Link>
              <Link to="/login" className="text-sm text-gray-400 hover:text-white transition">Log in</Link>
            </div>
          </div>
          <p className="text-center text-xs text-gray-500 pt-4">&copy; 2026 Meet Attendance Tracker. All rights reserved. Free & open source.</p>
        </div>
      </footer>
    </div>
  );
}
