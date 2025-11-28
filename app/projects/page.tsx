'use client';

import ProjectPlanner from '../components/ProjectPlanner';
import { useState } from 'react';

export default function ProjectsPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleProjectSuccess = () => {
    // Trigger any refresh logic if needed
    setRefreshKey(prev => prev + 1);
  };

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a 
              href="/"
              className="text-gray-600 hover:text-gray-900 transition-colors"
              title="Back to home"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </a>
            <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          </div>
          <div className="text-sm text-gray-600">
            Plan multi-step projects with AI assistance
          </div>
        </div>
      </header>

      {/* Project Planner */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <ProjectPlanner key={refreshKey} onSuccess={handleProjectSuccess} />
        </div>
      </div>
    </main>
  );
}
