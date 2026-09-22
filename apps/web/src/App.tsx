import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext.js';
import { Header } from './components/Header.js';
import { StudentsListPage } from './pages/StudentsListPage.js';
import { StudentDetailPage } from './pages/StudentDetailPage.js';
import { AdminEventsPage } from './pages/AdminEventsPage.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
            <Header />
            <main className="flex-1">
              <Routes>
                <Route path="/" element={<StudentsListPage />} />
                <Route path="/students/:id" element={<StudentDetailPage />} />
                <Route path="/admin/duplicates" element={<AdminEventsPage />} />
              </Routes>
            </main>
          </div>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
export default App;
