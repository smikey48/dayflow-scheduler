// app/components/ProjectPlanner.tsx
'use client';

import React, { useState } from 'react';
import { supabaseBrowser } from '../../lib/supabaseBrowser';

interface Task {
  title: string;
  description: string;
  duration_minutes: number;
  order: number;
}

interface Phase {
  phase_name: string;
  description: string;
  estimated_weeks: number;
  tasks: Task[];
}

interface ProjectPlan {
  approach: string;
  phases: Phase[];
  total_estimated_weeks: number;
  notes: string;
}

export default function ProjectPlanner({ onSuccess }: { onSuccess?: () => void }) {
  const [isOpen, setIsOpen] = useState(true);
  const [projectTitle, setProjectTitle] = useState('');
  const [projectObjective, setProjectObjective] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [plan, setPlan] = useState<ProjectPlan | null>(null);
  const [error, setError] = useState('');
  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(new Set());

  async function generatePlan() {
    if (!projectTitle.trim()) {
      setError('Please enter a project title');
      return;
    }

    setIsLoading(true);
    setError('');
    setPlan(null);

    try {
      const res = await fetch('/api/plan-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_title: projectTitle,
          project_objective: projectObjective,
          project_description: projectDescription,
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || 'Failed to generate plan');
      }

      setPlan({
        approach: data.approach,
        phases: data.phases,
        total_estimated_weeks: data.total_estimated_weeks,
        notes: data.notes,
      });
      
      // Expand first phase by default
      setExpandedPhases(new Set([0]));
    } catch (err: any) {
      console.error('Error generating project plan:', err);
      setError(err.message || 'Failed to generate plan');
    } finally {
      setIsLoading(false);
    }
  }

  async function createTasksForPhase(phaseIndex: number) {
    const phase = plan?.phases[phaseIndex];
    if (!phase) return;

    try {
      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('You must be signed in to create tasks');
        return;
      }

      // Create tasks as templates (floating tasks)
      const templates = phase.tasks.map((task) => ({
        user_id: user.id,
        title: `${phase.phase_name}: ${task.title}`,
        description: task.description,
        duration_minutes: task.duration_minutes,
        priority: 2, // Medium priority for project tasks
        kind: 'floating',
        is_fixed: false,
        repeat_unit: 'none',
        repeat_interval: 1,
        timezone: 'Europe/London',
      }));

      const { error: insertError } = await supabase
        .from('task_templates')
        .insert(templates);

      if (insertError) {
        throw insertError;
      }

      alert(`Created ${templates.length} tasks for ${phase.phase_name}`);
      onSuccess?.();
    } catch (err: any) {
      console.error('Error creating tasks:', err);
      alert(`Failed to create tasks: ${err.message}`);
    }
  }

  async function createAllTasks() {
    if (!plan) return;

    try {
      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('You must be signed in to create tasks');
        return;
      }

      // Create all tasks from all phases
      const allTemplates = plan.phases.flatMap((phase) =>
        phase.tasks.map((task) => ({
          user_id: user.id,
          title: `${phase.phase_name}: ${task.title}`,
          description: task.description,
          duration_minutes: task.duration_minutes,
          priority: 2,
          kind: 'floating',
          is_fixed: false,
          repeat_unit: 'none',
          repeat_interval: 1,
          timezone: 'Europe/London',
        }))
      );

      const { error: insertError } = await supabase
        .from('task_templates')
        .insert(allTemplates);

      if (insertError) {
        throw insertError;
      }

      alert(`Created ${allTemplates.length} tasks across ${plan.phases.length} phases`);
      setIsOpen(false);
      setPlan(null);
      setProjectTitle('');
      setProjectDescription('');
      onSuccess?.();
    } catch (err: any) {
      console.error('Error creating all tasks:', err);
      alert(`Failed to create tasks: ${err.message}`);
    }
  }

  function togglePhase(index: number) {
    const newExpanded = new Set(expandedPhases);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedPhases(newExpanded);
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-full rounded-lg border-2 border-dashed border-purple-300 bg-purple-50 px-4 py-3 text-left hover:bg-purple-100 transition"
      >
        <div className="flex items-center gap-2">
          <span className="text-2xl">📋</span>
          <div>
            <p className="font-medium text-purple-900">Plan Major Project</p>
            <p className="text-xs text-purple-700">AI-powered breakdown into phases & tasks</p>
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-purple-300 bg-purple-50 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-purple-900">📋 Major Project Planner</h3>
        <button
          onClick={() => {
            setIsOpen(false);
            setPlan(null);
            setError('');
          }}
          className="text-purple-600 hover:text-purple-800 text-sm"
        >
          Close
        </button>
      </div>

      {!plan ? (
        <>
          <div>
            <label className="block text-sm font-medium text-purple-900 mb-1">
              Project Title *
            </label>
            <input
              type="text"
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              placeholder="e.g., Write dissertation, Build mobile app, Launch online course"
              className="w-full rounded-lg border border-purple-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-purple-900 mb-1">
              Project Objective
            </label>
            <input
              type="text"
              value={projectObjective}
              onChange={(e) => setProjectObjective(e.target.value)}
              placeholder="What do you want to achieve with this project?"
              className="w-full rounded-lg border border-purple-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-purple-900 mb-1">
              Project Detail - to help the AI
            </label>
            <textarea
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
              placeholder="Any additional context, requirements, or constraints..."
              rows={3}
              className="w-full rounded-lg border border-purple-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-100 border border-red-300 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          <button
            onClick={generatePlan}
            disabled={isLoading || !projectTitle.trim()}
            className="w-full rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:bg-purple-300 disabled:cursor-not-allowed transition"
          >
            {isLoading ? 'Generating Plan...' : 'Generate Project Plan'}
          </button>
        </>
      ) : (
        <>
          {/* Approach Summary */}
          <div className="rounded-lg bg-white p-4 border border-purple-200">
            <h4 className="font-medium text-purple-900 mb-2">Approach</h4>
            <p className="text-sm text-gray-700">{plan.approach}</p>
            <p className="text-xs text-gray-500 mt-2">
              Total estimated time: {plan.total_estimated_weeks} weeks
            </p>
          </div>

          {/* Phases */}
          <div className="space-y-3">
            {plan.phases.map((phase, phaseIndex) => (
              <div key={phaseIndex} className="rounded-lg bg-white border border-purple-200 overflow-hidden">
                <button
                  onClick={() => togglePhase(phaseIndex)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-purple-50 transition"
                >
                  <div className="text-left">
                    <p className="font-medium text-purple-900">{phase.phase_name}</p>
                    <p className="text-xs text-gray-600">{phase.estimated_weeks} weeks · {phase.tasks.length} tasks</p>
                  </div>
                  <span className="text-purple-600 text-xl">
                    {expandedPhases.has(phaseIndex) ? '−' : '+'}
                  </span>
                </button>

                {expandedPhases.has(phaseIndex) && (
                  <div className="px-4 pb-4 space-y-3 border-t border-purple-100">
                    <p className="text-sm text-gray-700 pt-3">{phase.description}</p>
                    
                    <div className="space-y-2">
                      {phase.tasks.map((task, taskIndex) => (
                        <div key={taskIndex} className="rounded-md bg-purple-50 p-3 border border-purple-100">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm text-purple-900">{task.title}</p>
                              <p className="text-xs text-gray-600 mt-1">{task.description}</p>
                            </div>
                            <span className="text-xs text-gray-500 whitespace-nowrap">
                              {task.duration_minutes} min
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => createTasksForPhase(phaseIndex)}
                      className="w-full rounded-md bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 transition"
                    >
                      Create {phase.tasks.length} Tasks for This Phase
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Notes */}
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs font-medium text-amber-900 mb-1">💡 ADHD-Friendly Tips</p>
            <p className="text-xs text-amber-800">{plan.notes}</p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={createAllTasks}
              className="flex-1 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 transition"
            >
              Create All {plan.phases.reduce((sum, p) => sum + p.tasks.length, 0)} Tasks
            </button>
            <button
              onClick={() => {
                setPlan(null);
                setProjectTitle('');
                setProjectObjective('');
                setProjectDescription('');
              }}
              className="rounded-lg border border-purple-300 px-4 py-2 text-sm font-medium text-purple-700 hover:bg-purple-100 transition"
            >
              Start Over
            </button>
          </div>
        </>
      )}
    </div>
  );
}
