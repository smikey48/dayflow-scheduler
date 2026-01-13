'use client';

import ProjectPlanner from '../components/ProjectPlanner';
import FeedbackButton from '../components/FeedbackButton';
import { useState } from 'react';

export default function ProjectsPage() {
  const [showNavMenu, setShowNavMenu] = useState<boolean>(false);
  
  const handleProjectSuccess = () => {
    // Don't remount component - let ProjectPlanner handle its own state
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <FeedbackButton page="Projects" />
      
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
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
              <div className="relative nav-menu-container">
                <button
                  onClick={() => setShowNavMenu(!showNavMenu)}
                  className="text-gray-600 hover:text-gray-900 transition-colors p-1"
                  title="Navigate to other pages"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
                {showNavMenu && (
                  <div className="absolute left-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                    <a
                      href="/today"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Today
                    </a>
                    <a
                      href="/routines"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Edit Tasks
                    </a>
                    <a
                      href="/appointments"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Appointments
                    </a>
                    <a
                      href="/tasks"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Create Tasks
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="text-sm text-gray-600">
            Plan multi-step projects with AI assistance
          </div>
        </div>
      </header>

      {/* Project Planner */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <ProjectPlanner onSuccess={handleProjectSuccess} />
        </div>
      </div>
    </main>
  );
}
