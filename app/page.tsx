'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';

import  { QuickAdd }  from './components/QuickAdd';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';

import Recorder from "./components/voice/Recorder";
import Calendar from "./components/Calendar";
import DailyAdhdTip from "./components/DailyAdhdTip";
import FeedbackButton from "./components/FeedbackButton";

// ---- Supabase client (module scope) ----
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(url, anon);

// ---- Types ----
type Task = {
  id: string;
  title: string;
  description: string | null;
  is_completed: boolean;
  date: string; // YYYY-MM-DD
};

// ---- Default export: Home page ----
export default function Home() {
  // Auth/session state
  const [session, setSession] = useState<Session | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  // Tasks state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);

  // --- auth session tracking ---
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session ?? null);
      setUserId(data.session?.user.id ?? null);
      setEmail(data.session?.user.email ?? null);

      // Check if new user needs to see intro
      if (data.session?.user.id) {
        const { data: userDetails } = await supabase
          .from('users')
          .select('has_seen_intro')
          .eq('id', data.session.user.id)
          .single();

        if (userDetails && !userDetails.has_seen_intro) {
          window.location.href = '/intro';
        }
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      console.log('[Landing] Auth state change:', event, !!s);
      setSession(s);
      setUserId(s?.user.id ?? null);
      setEmail(s?.user.email ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);
  {/* Quick Add (render when signed in) */}
  {session && (
    <QuickAdd userId={userId ?? 'debug-user'} onAdded={loadTasks} />
  )}

  // --- load today's tasks (define BEFORE using it in JSX) ---
  async function loadTasks() {
  
  setLoading(true);

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); // YYYY-MM-DD

  // 1) Try local_date first
  console.log('[Today] querying scheduled_tasks for', todayStr, 'local_date');
  let { data, error } = await supabase
    .from('scheduled_tasks')
    .select('id,title,description,is_completed,date,local_date,start_time,end_time')
    .eq('local_date', todayStr)
    .order('start_time', { ascending: true });
  console.log('[Today] result', { error: !!error, rows: Array.isArray(data) ? data.length : 'n/a' });


  // Need fallback if there was an error OR zero rows
  const needFallback = !!error || !Array.isArray(data) || data.length === 0;

  if (needFallback) {
    if (error) {
      console.warn('loadTasks: local_date query error; falling back to date:', error);
    } else {
      console.warn('loadTasks: local_date returned 0 rows; falling back to date.');
    }

    const res2 = await supabase
      .from('scheduled_tasks')
      .select('id,title,description,is_completed,date')
      .eq('date', todayStr)
      .order('created_at', { ascending: false });

    if (res2.error) {
      console.error('Fetch error (fallback):', res2.error);
    }

    setTasks((res2.data as Task[]) ?? []);
    setLoading(false);
    return;
  }

  setTasks((data as Task[]) ?? []);
  setLoading(false);
}


  // --- on session change: ensure instances + load tasks ---
  useEffect(() => {
    (async () => {
      if (!session) return;
      await fetch("/api/generate", { method: "POST" }).catch(() => {});
      await loadTasks();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // --- toggle completion (optimistic UI) ---
  const toggleComplete = async (task: Task) => {
    setTasks(prev =>
      prev.map(t => (t.id === task.id ? { ...t, is_completed: !t.is_completed } : t))
    );

    const { error } = await supabase
      .from('scheduled_tasks')
      .update({ is_completed: !task.is_completed })
      .eq('id', task.id);

    if (error) {
      console.error('Update error:', error);
      // revert on failure
      setTasks(prev =>
        prev.map(t => (t.id === task.id ? { ...t, is_completed: task.is_completed } : t))
      );
      alert('Failed to update task.');
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setTasks([]);
    // Force reload to clear state and show login
    window.location.href = '/auth/login';
  };

  // --- signed-out view ---
  if (!session) {
    return (
      <main className="max-w-sm mx-auto p-6 space-y-4">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          view="sign_in"
          providers={[]}
          onlyThirdPartyProviders={false}
        />
      </main>
    );
  }

  // --- signed-in view: landing page ---
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <FeedbackButton page="Landing Page" />
      
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-end">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{email}</span>
            <button 
              onClick={signOut}
              className="text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Welcome to DayFlow
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Your intelligent scheduling assistant. Choose where you'd like to start:
          </p>
          <div className="mt-6">
            <a
              href="/intro"
              className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg font-medium transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              View Introduction
            </a>
          </div>
        </div>

        {/* Daily ADHD Tip */}
        <div className="max-w-3xl mx-auto mb-8">
          <DailyAdhdTip />
        </div>

        {/* Navigation Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {/* Today's Schedule */}
          <a
            href="/today"
            className="group bg-white rounded-2xl p-8 shadow-sm hover:shadow-xl transition-all duration-200 border-2 border-transparent hover:border-blue-500"
          >
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-500 transition-colors">
              <svg className="w-6 h-6 text-blue-600 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Today's Schedule</h3>
            <p className="text-gray-600">
              View and manage your tasks and appointments for today
            </p>
          </a>

          {/* Routines */}
          <a
            href="/routines"
            className="group bg-white rounded-2xl p-8 shadow-sm hover:shadow-xl transition-all duration-200 border-2 border-transparent hover:border-green-500"
          >
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-green-500 transition-colors">
              <svg className="w-6 h-6 text-green-600 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Edit Tasks</h3>
            <p className="text-gray-600">
              Edit floating tasks, routines or appointments
            </p>
          </a>

          {/* Appointments */}
          <a
            href="/appointments"
            className="group bg-white rounded-2xl p-8 shadow-sm hover:shadow-xl transition-all duration-200 border-2 border-transparent hover:border-purple-500"
          >
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-purple-500 transition-colors">
              <svg className="w-6 h-6 text-purple-600 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Appointments</h3>
            <p className="text-gray-600">
              Schedule and view your upcoming appointments
            </p>
          </a>

          {/* Tasks */}
          <a
            href="/tasks"
            className="group bg-white rounded-2xl p-8 shadow-sm hover:shadow-xl transition-all duration-200 border-2 border-transparent hover:border-orange-500"
          >
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-orange-500 transition-colors">
              <svg className="w-6 h-6 text-orange-600 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Create Tasks</h3>
            <p className="text-gray-600">
              Create floating tasks, routines, or appointments
            </p>
          </a>

          {/* Projects */}
          <a
            href="/projects"
            className="group bg-white rounded-2xl p-8 shadow-sm hover:shadow-xl transition-all duration-200 border-2 border-transparent hover:border-red-500"
          >
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-red-500 transition-colors">
              <svg className="w-6 h-6 text-red-600 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Projects</h3>
            <p className="text-gray-600">
              Plan and manage multi-step projects with AI assistance
            </p>
          </a>

          {/* Voice Input */}
          <a
            href="/voice"
            className="group bg-white rounded-2xl p-8 shadow-sm hover:shadow-xl transition-all duration-200 border-2 border-transparent hover:border-indigo-500"
          >
            <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-indigo-500 transition-colors">
              <svg className="w-6 h-6 text-indigo-600 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Voice Input</h3>
            <p className="text-gray-600">
              Quickly add tasks and appointments using voice commands
            </p>
          </a>
        </div>
      </div>
    </main>
  );
}



