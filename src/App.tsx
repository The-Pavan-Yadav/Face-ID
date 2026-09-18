/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
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

  if (view === 'dashboard' && user) {
    return <Dashboard user={user} onSignOut={handleLogout} />;
  }

  if (view === 'register') {
    return <Register onSuccess={() => setView('login')} onNavigate={setView} />;
  }

  if (view === 'face-login') {
    return <FaceLogin onLogin={handleLogin} onNavigate={setView} />;
  }

  return <Login onLogin={handleLogin} onNavigate={setView} />;
}

