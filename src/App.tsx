/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Login } from './views/Login';
import { Register } from './views/Register';
import { FaceLogin } from './views/FaceLogin';
import { Dashboard } from './views/Dashboard';
import { User } from './types';
import { auth } from './lib/firebase';
import { signOut } from 'firebase/auth';

export type View = 'login' | 'register' | 'face-login' | 'dashboard';

export default function App() {
  const [view, setView] = useState<View>('login');
  const [user, setUser] = useState<User | null>(null);

  const handleLogin = (user: User) => {
    setUser(user);
    setView('dashboard');
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
    setUser(null);
    setView('login');
  };

  return (
    <div className="min-h-screen bg-[#080a12] text-slate-100 overflow-x-hidden selection:bg-indigo-500/30 selection:text-indigo-200">
      <AnimatePresence mode="wait">
        {view === 'dashboard' && user ? (
          <motion.div 
            key="view-dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Dashboard user={user} onSignOut={handleLogout} />
          </motion.div>
        ) : view === 'register' ? (
          <motion.div 
            key="view-register"
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.985 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <Register onSuccess={() => setView('login')} onNavigate={setView} />
          </motion.div>
        ) : view === 'face-login' ? (
          <motion.div 
            key="view-face-login"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <FaceLogin onLogin={handleLogin} onNavigate={setView} />
          </motion.div>
        ) : (
          <motion.div 
            key="view-login"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <Login onLogin={handleLogin} onNavigate={setView} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
