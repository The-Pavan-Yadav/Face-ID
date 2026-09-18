import React from 'react';
import { User } from '../types';
import { Button } from '../components/ui/Button';

interface DashboardProps {
  user: User;
  onSignOut: () => void;
}

export function Dashboard({ user, onSignOut }: DashboardProps) {
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      <header className="border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-900 rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-sm tracking-tighter">A</span>
            </div>
            <span className="font-semibold text-sm tracking-tight">Aura Identity</span>
          </div>
          <Button variant="ghost" className="text-sm" onClick={onSignOut}>Sign out</Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Welcome back, {user.name}
          </h1>
          <p className="mt-2 text-slate-500">
            You are securely signed in to the dashboard.
          </p>

          <div className="mt-12 border border-slate-200 rounded-xl p-8">
            <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-widest mb-6">Account Details</h3>
            <dl className="divide-y divide-slate-100 text-sm">
              <div className="py-4 flex justify-between">
                <dt className="text-slate-500 font-medium">Name</dt>
                <dd className="text-slate-900">{user.name}</dd>
              </div>
              <div className="py-4 flex justify-between">
                <dt className="text-slate-500 font-medium">Email address</dt>
                <dd className="text-slate-900">{user.email}</dd>
              </div>
              <div className="py-4 flex justify-between items-center">
                <dt className="text-slate-500 font-medium">Biometric profile</dt>
                <dd className="text-slate-900 flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${user.faceDescriptor ? 'bg-slate-900' : 'bg-slate-300'}`}></span>
                  {user.faceDescriptor ? 'Enrolled' : 'Not enrolled'}
                </dd>
              </div>
              <div className="py-4 flex justify-between">
                <dt className="text-slate-500 font-medium">Account created</dt>
                <dd className="text-slate-900">{new Date(user.createdAt).toLocaleDateString()}</dd>
              </div>
            </dl>
          </div>
        </div>
      </main>
    </div>
  );
}
