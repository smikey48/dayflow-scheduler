'use client';

import { useEffect, useRef, useState } from 'react';
import { usePomodoroStore } from './usePomodoroStore';

// Global flag to ensure only one instance renders
let globalInstance: boolean = false;

export default function PomodoroWidget() {
  const [mounted, setMounted] = useState(false);
  const [isFirstInstance, setIsFirstInstance] = useState(false);
  
  const {
    mode,
    state,
    secondsRemaining,
    settings,
    isVisible,
    isExpanded,
    start,
    pause,
    reset,
    skip,
    toggleMode,
    setSecondsRemaining,
    updateSettings,
    toggleVisibility,
    toggleExpanded,
  } = usePomodoroStore();

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Client-side only rendering + don't render inside iframes
  useEffect(() => {
    // Only show if we're in the top-level window (not inside an iframe)
    const isTopWindow = window.self === window.top;
    if (!globalInstance && isTopWindow) {
      globalInstance = true;
      setIsFirstInstance(true);
    }
    setMounted(true);
    
    return () => {
      if (isFirstInstance) {
        globalInstance = false;
      }
    };
  }, []);

  // Request notification permission on mount
  useEffect(() => {
    if (mounted && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [mounted]);

  // Timer countdown effect
  useEffect(() => {
    if (state === 'running') {
      intervalRef.current = setInterval(() => {
        setSecondsRemaining(secondsRemaining - 1);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [state, secondsRemaining, setSecondsRemaining]);

  if (!mounted || !isFirstInstance) return null;

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate progress percentage
  const totalSeconds = mode === 'work' ? settings.workMinutes * 60 : settings.breakMinutes * 60;
  const progressPercent = ((totalSeconds - secondsRemaining) / totalSeconds) * 100;

  if (!isVisible) {
    return (
      <button
        onClick={toggleVisibility}
        className="fixed bottom-4 right-4 w-12 h-12 rounded-full bg-gray-800 text-white shadow-lg hover:bg-gray-700 transition-all z-50 flex items-center justify-center text-xl"
        title="Show Pomodoro Timer - Work in focused 25-minute intervals with short breaks in between"
        data-pomodoro-instance={Math.random()}
      >
        🍅
      </button>
    );
  }

  if (!isExpanded) {
    return (
      <div className="fixed top-20 right-4 z-50" data-pomodoro-instance={Math.random()}>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-2">
          <button
            onClick={state === 'running' ? pause : start}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              mode === 'work' 
                ? 'bg-red-500 hover:bg-red-600 text-white' 
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
            title={state === 'running' ? 'Pause' : 'Start'}
          >
            {state === 'running' ? '⏸' : '▶'}
          </button>
          
          <button
            onClick={toggleExpanded}
            className="font-mono text-lg font-semibold min-w-[80px] text-gray-900 dark:text-gray-100 hover:text-gray-600 dark:hover:text-gray-300"
          >
            {formatTime(secondsRemaining)}
          </button>
          
          <div className={`text-xs px-2 py-1 rounded ${
            mode === 'work' 
              ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' 
              : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
          }`}>
            {mode === 'work' ? 'Work' : 'Break'}
          </div>
          
          <button
            onClick={toggleVisibility}
            className="w-6 h-6 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            title="Hide"
          >
            ✕
          </button>
        </div>
        
        {/* Progress bar */}
        <div className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-b-lg overflow-hidden">
          <div
            className={`h-full transition-all ${
              mode === 'work' ? 'bg-red-500' : 'bg-green-500'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed top-20 right-4 z-50" data-pomodoro-instance={Math.random()}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-4 w-80">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🍅</span>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Pomodoro Timer</h3>
          </div>
          <div className="flex gap-1">
            <button
              onClick={toggleExpanded}
              className="w-6 h-6 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              title="Minimize"
            >
              −
            </button>
            <button
              onClick={toggleVisibility}
              className="w-6 h-6 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              title="Hide"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Mode indicator */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={toggleMode}
            className={`flex-1 py-2 rounded transition-colors ${
              mode === 'work'
                ? 'bg-red-500 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
            disabled={state === 'running'}
          >
            Work
          </button>
          <button
            onClick={toggleMode}
            className={`flex-1 py-2 rounded transition-colors ${
              mode === 'break'
                ? 'bg-green-500 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
            disabled={state === 'running'}
          >
            Break
          </button>
        </div>

        {/* Timer display */}
        <div className="text-center mb-4">
          <div className="relative w-48 h-48 mx-auto">
            {/* Progress circle */}
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="96"
                cy="96"
                r="88"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                className="text-gray-200 dark:text-gray-700"
              />
              <circle
                cx="96"
                cy="96"
                r="88"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 88}`}
                strokeDashoffset={`${2 * Math.PI * 88 * (1 - progressPercent / 100)}`}
                className={`transition-all ${
                  mode === 'work' ? 'text-red-500' : 'text-green-500'
                }`}
                strokeLinecap="round"
              />
            </svg>
            
            {/* Time text */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-5xl font-mono font-bold text-gray-900 dark:text-gray-100">
                  {formatTime(secondsRemaining)}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {state === 'idle' && 'Ready'}
                  {state === 'running' && 'Running'}
                  {state === 'paused' && 'Paused'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={state === 'running' ? pause : start}
            className={`flex-1 py-3 rounded-lg font-semibold transition-colors ${
              mode === 'work'
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
          >
            {state === 'running' ? '⏸ Pause' : '▶ Start'}
          </button>
          <button
            onClick={reset}
            className="px-4 py-3 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            title="Reset"
          >
            ↻
          </button>
          <button
            onClick={skip}
            className="px-4 py-3 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            title="Skip to next"
          >
            ⏭
          </button>
        </div>

        {/* Settings */}
        <div className="space-y-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between text-sm">
            <label className="text-gray-700 dark:text-gray-300">Work</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateSettings({ workMinutes: Math.max(1, settings.workMinutes - 5) })}
                className="w-6 h-6 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                −
              </button>
              <span className="w-12 text-center font-mono text-gray-900 dark:text-gray-100">
                {settings.workMinutes}m
              </span>
              <button
                onClick={() => updateSettings({ workMinutes: settings.workMinutes + 5 })}
                className="w-6 h-6 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <label className="text-gray-700 dark:text-gray-300">Break</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateSettings({ breakMinutes: Math.max(1, settings.breakMinutes - 5) })}
                className="w-6 h-6 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                −
              </button>
              <span className="w-12 text-center font-mono text-gray-900 dark:text-gray-100">
                {settings.breakMinutes}m
              </span>
              <button
                onClick={() => updateSettings({ breakMinutes: settings.breakMinutes + 5 })}
                className="w-6 h-6 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <label className="text-gray-700 dark:text-gray-300">Auto-start breaks</label>
            <input
              type="checkbox"
              checked={settings.autoStartBreak}
              onChange={(e) => updateSettings({ autoStartBreak: e.target.checked })}
              className="w-4 h-4"
            />
          </div>

          <div className="flex items-center justify-between text-sm">
            <label className="text-gray-700 dark:text-gray-300">Auto-start work</label>
            <input
              type="checkbox"
              checked={settings.autoStartWork}
              onChange={(e) => updateSettings({ autoStartWork: e.target.checked })}
              className="w-4 h-4"
            />
          </div>

          <div className="flex items-center justify-between text-sm">
            <label className="text-gray-700 dark:text-gray-300">Sound</label>
            <input
              type="checkbox"
              checked={settings.soundEnabled}
              onChange={(e) => updateSettings({ soundEnabled: e.target.checked })}
              className="w-4 h-4"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
