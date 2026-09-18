import React from 'react';

export function AuthLayout({ children, title, subtitle }: { children: React.ReactNode, title: string, subtitle?: string }) {
  return (
    <div className="min-h-screen bg-white flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans text-slate-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-8">
          <div className="w-8 h-8 bg-slate-900 rounded-md flex items-center justify-center">
            <span className="text-white font-bold text-sm tracking-tighter">A</span>
          </div>
        </div>
        <div className="bg-white px-4 sm:px-10">
          <h2 className="text-center text-xl font-semibold tracking-tight text-slate-900">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-2 text-center text-sm text-slate-500 mb-8">
              {subtitle}
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
