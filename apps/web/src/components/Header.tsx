import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth, DEMO_TENANTS } from '../context/AuthContext.js';
import { Building2, Shield, Users, BarChart3 } from 'lucide-react';

export function Header() {
  const { auth, switchTenant } = useAuth();
  const location = useLocation();

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* Brand & Nav */}
          <div className="flex items-center space-x-8">
            <Link to="/" className="flex items-center space-x-2 font-bold text-indigo-600 text-lg">
              <span className="bg-indigo-600 text-white p-1.5 rounded-lg">
                <Users className="w-5 h-5" />
              </span>
              <span>Student Readiness</span>
            </Link>

            <nav className="flex space-x-4">
              <Link
                to="/"
                className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                  location.pathname === '/'
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                Students
              </Link>
              <Link
                to="/admin/duplicates"
                className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                  location.pathname.startsWith('/admin')
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center">
                  <BarChart3 className="w-4 h-4 mr-1.5" />
                  Audit Events
                </span>
              </Link>
            </nav>
          </div>

          {/* Tenant Switcher & User Role */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 bg-slate-100 rounded-lg p-1.5 border border-slate-200">
              <Building2 className="w-4 h-4 text-slate-500 ml-1" />
              <label htmlFor="tenant-select" className="text-xs font-semibold text-slate-600">
                Tenant:
              </label>
              <select
                id="tenant-select"
                value={auth.tenantId}
                onChange={(e) => {
                  const target = DEMO_TENANTS.find((t) => t.tenantId === e.target.value);
                  if (target) {
                    switchTenant(target);
                  }
                }}
                className="bg-white text-xs font-medium text-slate-800 border border-slate-300 rounded px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {DEMO_TENANTS.map((t) => (
                  <option key={t.tenantId} value={t.tenantId}>
                    {t.tenantName}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-1.5 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full font-medium">
              <Shield className="w-3.5 h-3.5" />
              <span className="capitalize">{auth.role}</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
