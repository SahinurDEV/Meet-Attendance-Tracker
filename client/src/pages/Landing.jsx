import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { useRef } from 'react';

const FEATURES = [
  { icon: '✓', title: 'Automatic Recording', desc: 'Attendance recorded automatically when you join a Google Meet. Zero setup required.' },
  { icon: '🔒', title: 'Safe & Private', desc: 'All data stored locally or in your account. Nothing shared with third parties.' },
  { icon: '↓', title: 'Export CSV, XLSX & PDF', desc: 'Download reports in CSV, Excel, or PDF. Perfect for record keeping.' },
  { icon: '🔍', title: 'Search & Analytics', desc: 'Search across meetings, view attendance analytics and trends over time.' },
  { icon: '⏱', title: 'Late Arrivals & Early Departures', desc: 'Track exact join/leave times. Identify late arrivals automatically.' },
  { icon: '📅', title: 'Recurring Meeting Support', desc: 'Each session tracked separately. Monitor attendance over time.' },
  { icon: '📊', title: 'Full Dashboard', desc: 'Powerful dashboard with meetings, reports, participant stats and history.' },
  { icon: '👥', title: 'Unlimited Participants', desc: 'No limit on participants. Handle meetings of any size.' },
  { icon: '📄', title: 'Detailed Reports', desc: 'Per-meeting and per-participant reports with duration and attendance %.' },
];

const TESTIMONIALS = [
  { name: 'Legarda S.', initials: 'LS', title: 'Excellent!', text: 'Excellent! So helpful. Thanks for sharing.' },
  { name: 'Prof Anil T.', initials: 'PA', title: "It's fantastic!", text: 'One of the fantastic extensions for keeping the meet record. I recommend to all those who use Google Meet.' },
  { name: 'Gracia G.', initials: 'GG', title: 'I love this extension', text: 'It allows me and the parents to monitor students attendance in the most accurate and simplest way possible.' },
  { name: 'Vernelle R.', initials: 'VR', title: 'Quite helpful', text: 'Excellent extension, quite helpful to track students attendance for each class.' },
];

const FAQS = [
  { q: 'Does it work automatically?', a: 'Yes! Once installed, it automatically detects when you join a Google Meet and starts tracking attendance without any setup.' },
  { q: 'Where is my attendance data stored?', a: 'Your data is stored locally in your browser and optionally backed up to your secure account dashboard.' },
  { q: 'Do you share or sell my data?', a: 'No. We never share or sell your data to third parties. Your privacy is our top priority.' },
  { q: 'How many participants can it track?', a: 'No limit on participants. Your Google Meet plan may have its own limits (e.g., 100 for free accounts).' },
  { q: 'Can I export to Excel/CSV?', a: 'Yes! Export in CSV, Excel (XLSX), and PDF formats — all completely free.' },
  { q: 'Does it track late arrivals?', a: 'Yes, it tracks exact join/leave times allowing you to monitor late arrivals and early departures automatically.' },
  { q: 'What browsers are supported?', a: 'Chrome and all Chromium-based browsers (Edge, Brave, Opera, etc.).' },
  { q: 'Can participants see tracking?', a: 'No. Attendance tracking is done discreetly. Participants are not notified.' },
];

const STATS = [
  { num: '350k+', label: 'Users Worldwide', desc: 'Trusted by over 350 thousand users.' },
  { num: '100+', label: 'Countries', desc: 'Used in over 100 countries.' },
  { num: '200k+', label: 'Meetings/Day', desc: 'Recording 200k+ meetings daily.' },
];

// Reusable scroll-triggered section wrapper
function FadeInSection({ children, className = '', delay = 0 }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const MOCKUP_ROWS = [
  ['Sarah Johnson', '09:00', '09:45', 'Present', 'bg-green-100 text-green-700'],
  ['James Wilson', '09:02', '09:45', 'Late', 'bg-yellow-100 text-yellow-700'],
  ['Emily Davis', '09:00', '09:30', 'Left Early', 'bg-red-100 text-red-700'],
  ['Michael Chen', '09:00', '09:45', 'Present', 'bg-green-100 text-green-700'],
];

export default function Landing() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Navbar */}
      <motion.nav
        initial={{ y: -80 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all ${scrolled ? 'bg-white/95 backdrop-blur-md shadow-md' : 'bg-white/80 backdrop-blur-sm'}`}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 font-bold text-gray-900 text-lg">
            <motion.div whileHover={{ rotate: 10, scale: 1.1 }} className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </motion.div>
            Meet Attendance
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-gray-500 hover:text-brand-500 transition">Features</a>
            <a href="#testimonials" className="text-sm font-medium text-gray-500 hover:text-brand-500 transition">Testimonials</a>
            <a href="#faq" className="text-sm font-medium text-gray-500 hover:text-brand-500 transition">FAQ</a>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link to="/dashboard" className="px-5 py-2 bg-brand-500 text-white text-sm font-semibold rounded-lg hover:bg-brand-600 transition">Dashboard</Link>
            </motion.div>
          </div>
          <button className="md:hidden p-1" onClick={() => setMobileMenu(!mobileMenu)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
        </div>
        <AnimatePresence>
          {mobileMenu && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="md:hidden bg-white border-t overflow-hidden"
            >
              <div className="px-6 py-4 flex flex-col gap-3">
                <a href="#features" className="text-sm font-medium text-gray-600" onClick={() => setMobileMenu(false)}>Features</a>
                <a href="#testimonials" className="text-sm font-medium text-gray-600" onClick={() => setMobileMenu(false)}>Testimonials</a>
                <a href="#faq" className="text-sm font-medium text-gray-600" onClick={() => setMobileMenu(false)}>FAQ</a>
                <Link to="/dashboard" className="px-5 py-2 bg-brand-500 text-white text-sm font-semibold rounded-lg text-center" onClick={() => setMobileMenu(false)}>
                  Dashboard
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>

      {/* Hero */}
      <section className="pt-28 pb-20 bg-gradient-to-br from-blue-50 via-brand-50 to-purple-50 overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="inline-block px-4 py-1.5 bg-green-100 text-green-800 text-xs font-semibold rounded-full mb-5"
            >
              100% Free — All Features Included
            </motion.span>
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight tracking-tight mb-5"
            >
              Attendance made simple for online meetings.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="text-lg text-gray-500 mb-8 max-w-lg leading-relaxed"
            >
              Your hub for taking attendance professionally and efficiently, eliminating the hassle of surveys or name-calling.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.7 }}
              className="flex flex-wrap gap-3 mb-7"
            >
              <motion.div whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.97 }}>
                <Link to="/dashboard" className="px-7 py-3.5 bg-brand-500 text-white font-semibold rounded-xl hover:bg-brand-600 transition shadow-lg shadow-brand-500/25 flex items-center gap-2">
                  Get Started Free
                </Link>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
                <a href="#features" className="px-7 py-3.5 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:border-brand-500 hover:text-brand-500 transition inline-block">
                  See Features
                </a>
              </motion.div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.9 }}
              className="flex items-center gap-2.5"
            >
              <div className="flex">{[...Array(5)].map((_, i) => (
                <motion.svg
                  key={i}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 1 + i * 0.1, type: 'spring', stiffness: 400 }}
                  width="18" height="18" viewBox="0 0 24 24" fill="#facc15"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </motion.svg>
              ))}</div>
              <span className="text-sm text-gray-400">Loved by thousands worldwide</span>
            </motion.div>
          </div>

          {/* Hero mockup */}
          <motion.div
            initial={{ opacity: 0, x: 60, rotate: 0 }}
            animate={{ opacity: 1, x: 0, rotate: -2 }}
            transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ rotate: 0, scale: 1.02 }}
            className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100"
          >
            <div className="flex items-center gap-2 px-5 py-3 bg-gray-50 border-b border-gray-100">
              <span className="w-3 h-3 rounded-full bg-red-400"></span>
              <span className="w-3 h-3 rounded-full bg-yellow-400"></span>
              <span className="w-3 h-3 rounded-full bg-green-400"></span>
              <span className="text-xs font-medium text-gray-400 ml-2">Meet Attendance Dashboard</span>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-3 gap-3 mb-5">
                {[['24', 'Participants'], ['98%', 'Attendance'], ['45m', 'Avg Duration']].map(([n, l], i) => (
                  <motion.div
                    key={l}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 + i * 0.15 }}
                    className="text-center p-3 bg-brand-50 rounded-xl"
                  >
                    <div className="text-2xl font-extrabold text-brand-500">{n}</div>
                    <div className="text-[10px] font-medium text-gray-400 mt-0.5">{l}</div>
                  </motion.div>
                ))}
              </div>
              <div className="border border-gray-100 rounded-xl overflow-hidden text-xs">
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr] px-3 py-2 bg-gray-50 font-semibold text-gray-400">
                  <span>Name</span><span>Join</span><span>Leave</span><span>Status</span>
                </div>
                {MOCKUP_ROWS.map(([name, join, leave, status, cls], i) => (
                  <motion.div
                    key={name}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.1 + i * 0.12, ease: 'easeOut' }}
                    className="grid grid-cols-[2fr_1fr_1fr_1fr] px-3 py-2.5 border-t border-gray-50 items-center"
                  >
                    <span className="font-medium text-gray-700">{name}</span>
                    <span className="text-gray-500">{join}</span>
                    <span className="text-gray-500">{leave}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls} inline-block w-fit`}>{status}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-3 gap-8">
          {STATS.map((s, i) => (
            <FadeInSection key={s.label} delay={i * 0.15}>
              <motion.div
                whileHover={{ y: -6, boxShadow: '0 20px 40px rgba(0,0,0,0.08)' }}
                className="text-center p-8 rounded-2xl border border-gray-100 transition-all"
              >
                <div className="text-4xl font-extrabold text-gray-900 mb-1">{s.num}</div>
                <div className="text-base font-semibold text-gray-700 mb-2">{s.label}</div>
                <div className="text-sm text-gray-400">{s.desc}</div>
              </motion.div>
            </FadeInSection>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6">
          <FadeInSection className="text-center mb-14">
            <h2 className="text-3xl lg:text-4xl font-extrabold text-gray-900 mb-3">Awesome features — all free</h2>
            <p className="text-lg text-gray-500 max-w-xl mx-auto">Every feature, no paywalls. Our goal is to help you focus on what matters.</p>
          </FadeInSection>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <FadeInSection key={f.title} delay={i * 0.08}>
                <motion.div
                  whileHover={{ y: -6, boxShadow: '0 20px 40px rgba(0,0,0,0.08)' }}
                  className="bg-white p-7 rounded-2xl border border-gray-100 h-full"
                >
                  <motion.div
                    whileHover={{ scale: 1.2, rotate: 5 }}
                    className="w-11 h-11 bg-brand-50 rounded-xl flex items-center justify-center text-xl mb-4"
                  >
                    {f.icon}
                  </motion.div>
                  <h3 className="font-bold text-gray-900 mb-2">{f.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
                </motion.div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-20 bg-gradient-to-r from-brand-500 to-brand-600 text-center overflow-hidden">
        <FadeInSection>
          <div className="max-w-3xl mx-auto px-6">
            <h2 className="text-3xl font-extrabold text-white mb-3">Automating your meeting attendance has never been so easy.</h2>
            <p className="text-lg text-white/80 mb-8">We take the work out of your meetings so you can accomplish more.</p>
            <motion.div whileHover={{ scale: 1.06, y: -2 }} whileTap={{ scale: 0.97 }}>
              <Link to="/dashboard" className="inline-block px-8 py-3.5 bg-white text-brand-500 font-bold rounded-xl shadow-lg hover:shadow-xl transition">
                Get Started — It's Free
              </Link>
            </motion.div>
          </div>
        </FadeInSection>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24">
        <div className="max-w-6xl mx-auto px-6">
          <FadeInSection className="text-center mb-14">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-3">What our users are saying</h2>
            <p className="text-lg text-gray-500">Trusted by educators, managers, and professionals worldwide.</p>
          </FadeInSection>
          <div className="grid md:grid-cols-2 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <FadeInSection key={t.name} delay={i * 0.12}>
                <motion.div
                  whileHover={{ y: -4, boxShadow: '0 16px 32px rgba(0,0,0,0.06)' }}
                  className="p-7 bg-gray-50 rounded-2xl border border-gray-100 h-full"
                >
                  <div className="flex gap-0.5 mb-3">{[...Array(5)].map((_, j) => <svg key={j} width="16" height="16" viewBox="0 0 24 24" fill="#facc15"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>)}</div>
                  <h4 className="font-bold text-gray-900 mb-1">{t.title}</h4>
                  <p className="text-sm text-gray-500 italic mb-4">"{t.text}"</p>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-brand-500 text-white flex items-center justify-center text-xs font-bold">{t.initials}</div>
                    <span className="text-sm font-semibold text-gray-700">{t.name}</span>
                  </div>
                </motion.div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6">
          <FadeInSection className="text-center mb-14">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-3">Everything free. No catches.</h2>
            <p className="text-lg text-gray-500">Unlike other tools, we believe attendance tracking should be free for everyone.</p>
          </FadeInSection>
          <FadeInSection delay={0.2}>
            <motion.div
              whileHover={{ y: -6 }}
              className="max-w-md mx-auto bg-white rounded-3xl shadow-2xl p-10 text-center border-2 border-brand-500 relative"
            >
              <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-brand-500 text-white px-5 py-1 rounded-full text-xs font-bold">All Features Included</span>
              <div className="my-6">
                <span className="text-6xl font-extrabold text-gray-900">$0</span>
                <span className="text-lg text-gray-400 ml-1">/ forever</span>
              </div>
              <ul className="text-left space-y-3 mb-8">
                {['Automatic attendance recording','Unlimited meetings & participants','No ads — distraction-free','Search & analytics dashboard','Export CSV, XLSX & PDF','Late arrival & early departure tracking','Detailed per-meeting reports','Recurring meeting support','100% local — complete privacy'].map((f, i) => (
                  <motion.li
                    key={f}
                    initial={{ opacity: 0, x: -15 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 + i * 0.06 }}
                    className="flex items-center gap-3 text-sm text-gray-700"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    {f}
                  </motion.li>
                ))}
              </ul>
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Link to="/dashboard" className="block w-full py-3.5 bg-brand-500 text-white font-bold rounded-xl hover:bg-brand-600 transition">
                  Get Started Free
                </Link>
              </motion.div>
            </motion.div>
          </FadeInSection>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24">
        <div className="max-w-3xl mx-auto px-6">
          <FadeInSection>
            <h2 className="text-3xl font-extrabold text-gray-900 text-center mb-14">Frequently asked questions</h2>
          </FadeInSection>
          <div className="divide-y divide-gray-100">
            {FAQS.map((f, i) => (
              <FadeInSection key={i} delay={i * 0.05}>
                <div>
                  <button className="w-full flex items-center justify-between py-5 text-left text-base font-semibold text-gray-800 hover:text-brand-500 transition" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                    <span>{f.q}</span>
                    <motion.svg
                      animate={{ rotate: openFaq === i ? 180 : 0 }}
                      transition={{ duration: 0.3 }}
                      className="w-5 h-5 text-gray-400 flex-shrink-0"
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    >
                      <polyline points="6 9 12 15 18 9"/>
                    </motion.svg>
                  </button>
                  <AnimatePresence initial={false}>
                    {openFaq === i && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <p className="text-sm text-gray-500 leading-relaxed pb-5">{f.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 bg-gray-900">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-6 border-b border-white/10">
            <div className="flex items-center gap-2.5 text-white font-bold">
              <div className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              Meet Attendance Tracker
            </div>
            <div className="flex gap-6">
              {['Features', 'Testimonials', 'FAQ'].map((l) => (
                <a key={l} href={`#${l.toLowerCase()}`} className="text-sm text-gray-400 hover:text-white transition">{l}</a>
              ))}
              <Link to="/dashboard" className="text-sm text-gray-400 hover:text-white transition">Dashboard</Link>
            </div>
          </div>
          <p className="text-center text-xs text-gray-500 pt-6">&copy; 2026 Meet Attendance Tracker. All rights reserved. Free & open source.</p>
        </div>
      </footer>
    </div>
  );
}
