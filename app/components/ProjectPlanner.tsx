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

interface StagedTask {
  id: string;
  phase_name: string;
  title: string;
  description: string;
  duration_minutes: number;
  completed?: boolean;
  start_date?: string;
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

interface ExistingProject {
  name: string;
  taskCount: number;
  completedCount: number;
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    duration_minutes: number;
    is_completed: boolean;
    start_date?: string;
  }>;
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
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [stagedTasks, setStagedTasks] = useState<StagedTask[]>([]);
  const [editingTask, setEditingTask] = useState<StagedTask | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [existingProjects, setExistingProjects] = useState<ExistingProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Load existing projects on mount
  React.useEffect(() => {
    loadExistingProjects();
  }, []);

  async function loadExistingProjects() {
    setLoadingProjects(true);
    try {
      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch all task templates that have PROJECT: prefix in notes field
      const { data: templates, error } = await supabase
        .from('task_templates')
        .select('id, title, description, duration_minutes, date, notes, is_deleted')
        .eq('user_id', user.id)
        .like('notes', 'PROJECT:%')
        .eq('is_deleted', false);

      if (error) throw error;

      // Group by project name stored in notes field (after PROJECT: prefix)
      const projectMap = new Map<string, ExistingProject>();
      
      for (const template of templates || []) {
        // Extract project name from notes (format: "PROJECT:ProjectName")
        const notes = template.notes?.trim();
        if (!notes || !notes.startsWith('PROJECT:')) continue;
        
        const projectName = notes.substring(8); // Remove "PROJECT:" prefix
        if (!projectName) continue;

        // Extract task title (remove project prefix if present)
        let taskTitle = template.title;
        const colonIndex = template.title.indexOf(':');
        if (colonIndex > 0 && template.title.substring(0, colonIndex).trim() === projectName) {
          taskTitle = template.title.substring(colonIndex + 1).trim();
        }

        if (!projectMap.has(projectName)) {
          projectMap.set(projectName, {
            name: projectName,
            taskCount: 0,
            completedCount: 0,
            tasks: [],
          });
        }

        const project = projectMap.get(projectName)!;
        
        // Check if task is completed in scheduled_tasks
        const { data: scheduledTasks } = await supabase
          .from('scheduled_tasks')
          .select('is_completed')
          .eq('template_id', template.id)
          .eq('is_completed', true)
          .limit(1);

        const isCompleted = scheduledTasks && scheduledTasks.length > 0;
        
        project.tasks.push({
          id: template.id,
          title: taskTitle,
          description: template.description || '',
          duration_minutes: template.duration_minutes || 30,
          is_completed: isCompleted,
          start_date: template.date,
        });
        project.taskCount++;
        if (isCompleted) project.completedCount++;
      }

      setExistingProjects(Array.from(projectMap.values()));
    } catch (err: any) {
      console.error('Error loading existing projects:', err);
    } finally {
      setLoadingProjects(false);
    }
  }

  function toggleProject(projectName: string) {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectName)) {
      newExpanded.delete(projectName);
    } else {
      newExpanded.add(projectName);
    }
    setExpandedProjects(newExpanded);
  }

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

  async function handleFileUpload(file: File) {
    setUploadingFile(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/extract-document', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || 'Failed to extract document content');
      }

      // Append extracted text to project description
      const extractedText = data.text;
      setProjectDescription(prev => {
        const separator = prev.trim() ? '\n\n--- Document Content ---\n\n' : '';
        return prev + separator + extractedText;
      });
      setUploadedFileName(file.name);
    } catch (err: any) {
      console.error('Error uploading file:', err);
      setError(err.message || 'Failed to upload document');
    } finally {
      setUploadingFile(false);
    }
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Check if it's actually a file being dragged
    if (e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Only accept file drops
    if (e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
      setIsDragging(true);
    } else {
      e.dataTransfer.dropEffect = 'none';
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Check if we're actually leaving the drop zone
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    console.log('Drop event triggered');
    console.log('Types:', e.dataTransfer.types);
    console.log('Files:', e.dataTransfer.files);

    // Get file directly from files
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      console.log('File dropped:', file.name, file.type, file.size);
      
      // Check file type
      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'text/plain',
        'text/markdown',
      ];
      
      if (!allowedTypes.includes(file.type) && !file.name.match(/\.(txt|md|doc|docx|pdf)$/i)) {
        setError('Please upload a PDF, Word document, or text file');
        return;
      }
      
      setError('');
      handleFileUpload(file);
    } else {
      console.log('No files in drop');
      setError('No file detected. Please use the Browse button instead.');
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      
      // Check file type
      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'text/plain',
        'text/markdown',
      ];
      
      if (!allowedTypes.includes(file.type) && !file.name.match(/\.(txt|md|doc|docx|pdf)$/i)) {
        setError('Please upload a PDF, Word document, or text file');
        return;
      }
      
      setError('');
      handleFileUpload(file);
    }
    // Reset input so same file can be selected again
    if (e.target) {
      e.target.value = '';
    }
  }

  function stageTasksForPhase(phaseIndex: number) {
    const phase = plan?.phases[phaseIndex];
    if (!phase) return;

    // Convert phase tasks to staged tasks for review
    const newStagedTasks: StagedTask[] = phase.tasks.map((task, idx) => ({
      id: `${phaseIndex}-${idx}-${Date.now()}`,
      phase_name: phase.phase_name,
      title: task.title,
      description: task.description,
      duration_minutes: task.duration_minutes,
    }));

    setStagedTasks(newStagedTasks);
  }

  function stageAllTasks() {
    if (!plan) return;

    // Convert all phase tasks to staged tasks for review
    const allStagedTasks: StagedTask[] = plan.phases.flatMap((phase, phaseIndex) =>
      phase.tasks.map((task, idx) => ({
        id: `${phaseIndex}-${idx}-${Date.now()}`,
        phase_name: phase.phase_name,
        title: task.title,
        description: task.description,
        duration_minutes: task.duration_minutes,
      }))
    );

    setStagedTasks(allStagedTasks);
  }

  async function createStagedTasks() {
    if (stagedTasks.length === 0) return;

    // Filter out completed tasks
    const tasksToCreate = stagedTasks.filter(task => !task.completed);

    // If all tasks are completed, just close the staged tasks modal
    if (tasksToCreate.length === 0) {
      setStagedTasks([]);
      return;
    }

    setIsCreating(true);
    try {
      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('You must be signed in to create tasks');
        return;
      }

      // Create tasks as templates (floating tasks)
      const templates = tasksToCreate.map((task) => ({
        user_id: user.id,
        title: `${projectTitle}: ${task.title}`,
        description: task.description,
        duration_minutes: task.duration_minutes,
        priority: 2, // Medium priority for project tasks
        kind: 'floating',
        is_fixed: false,
        repeat_unit: 'none',
        repeat_interval: 1,
        timezone: 'Europe/London',
        notes: `PROJECT:${projectTitle}`, // Mark as project task with PROJECT: prefix
        ...(task.start_date && { date: task.start_date }),
      }));

      const { error: insertError } = await supabase
        .from('task_templates')
        .insert(templates);

      if (insertError) {
        throw insertError;
      }

      const completedCount = stagedTasks.length - tasksToCreate.length;
      const message = completedCount > 0 
        ? `Created ${templates.length} tasks successfully! (${completedCount} marked as complete and skipped)`
        : `Created ${templates.length} tasks successfully!`;
      
      // Clear staged tasks but keep plan visible
      setStagedTasks([]);
      
      // Show success message after modal closes
      setTimeout(() => {
        alert(message);
      }, 100);
      
      // Reload existing projects to show the newly created one
      loadExistingProjects();
      
      onSuccess?.();
    } catch (err: any) {
      console.error('Error creating tasks:', err);
      alert(`Failed to create tasks: ${err.message}`);
    } finally {
      setIsCreating(false);
    }
  }

  function updateStagedTask(taskId: string, updates: Partial<StagedTask>) {
    setStagedTasks(prev =>
      prev.map(task => task.id === taskId ? { ...task, ...updates } : task)
    );
  }

  function deleteStagedTask(taskId: string) {
    setStagedTasks(prev => prev.filter(task => task.id !== taskId));
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
    <div className="space-y-6">
      {/* Existing Projects Section */}
      {existingProjects.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-gray-900">Your Projects</h3>
          <div className="space-y-2">
            {existingProjects.map((project) => (
              <div key={project.name} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <button
                  onClick={() => toggleProject(project.name)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition"
                >
                  <div className="flex items-center gap-3">
                    <svg 
                      className={`w-5 h-5 text-gray-500 transition-transform ${expandedProjects.has(project.name) ? 'rotate-90' : ''}`}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <div className="text-left">
                      <p className="font-medium text-gray-900">{project.name}</p>
                      <p className="text-xs text-gray-500">
                        {project.completedCount} of {project.taskCount} tasks completed
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {project.completedCount === project.taskCount && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                        Complete
                      </span>
                    )}
                    <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-purple-600 transition-all"
                        style={{ width: `${(project.completedCount / project.taskCount) * 100}%` }}
                      />
                    </div>
                  </div>
                </button>
                
                {expandedProjects.has(project.name) && (
                  <div className="border-t border-gray-200 px-4 py-3 bg-gray-50">
                    <div className="space-y-2">
                      {project.tasks.map((task) => (
                        <div 
                          key={task.id}
                          className={`flex items-start gap-3 p-3 rounded-lg bg-white border ${
                            task.is_completed ? 'border-green-200' : 'border-gray-200'
                          }`}
                        >
                          <div className="flex-shrink-0 mt-0.5">
                            {task.is_completed ? (
                              <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" strokeWidth="2" />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`font-medium text-sm ${task.is_completed ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                              {task.title}
                            </p>
                            {task.description && (
                              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.description}</p>
                            )}
                            <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                              <span>{task.duration_minutes} min</span>
                              {task.start_date && (
                                <span>Start: {new Date(task.start_date).toLocaleDateString()}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loadingProjects && existingProjects.length === 0 && (
        <div className="text-center py-4 text-gray-500 text-sm">
          Loading your projects...
        </div>
      )}

      {/* New Project Planner */}
      <div className="rounded-2xl border-2 border-purple-300 bg-purple-50 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-purple-900">📋 Plan New Project</h3>
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
            <div
              className={`relative ${isDragging ? 'ring-2 ring-purple-500' : ''}`}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <textarea
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                placeholder="Any additional context, requirements, or constraints..."
                rows={6}
                className="w-full rounded-lg border border-purple-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                disabled={uploadingFile}
              />
              {isDragging && (
                <div className="absolute inset-0 rounded-lg bg-purple-100 bg-opacity-90 flex items-center justify-center border-2 border-dashed border-purple-500 pointer-events-none">
                  <div className="text-center">
                    <span className="text-4xl mb-2 block">📄</span>
                    <p className="text-purple-900 font-medium">Drop document here</p>
                    <p className="text-purple-700 text-xs">PDF, Word, TXT, or Markdown</p>
                  </div>
                </div>
              )}
              {uploadingFile && (
                <div className="absolute inset-0 rounded-lg bg-white bg-opacity-90 flex items-center justify-center">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-2"></div>
                    <p className="text-purple-900 text-sm">Extracting document content...</p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt,.md"
                onChange={handleFileInputChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile}
                className="text-xs px-3 py-1.5 rounded-md border border-purple-300 text-purple-700 hover:bg-purple-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                📎 Browse for document
              </button>
              {uploadedFileName && (
                <p className="text-xs text-green-700">
                  ✓ {uploadedFileName}
                </p>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-100 border border-red-300 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          <button
            onClick={generatePlan}
            disabled={isLoading || !projectTitle.trim()}
            title={!projectTitle.trim() ? 'Project Title is required' : 'Generate an AI-powered project plan'}
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
                      onClick={() => stageTasksForPhase(phaseIndex)}
                      className="w-full rounded-md bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 transition"
                    >
                      Review & Create {phase.tasks.length} Tasks
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
              onClick={stageAllTasks}
              className="flex-1 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 transition"
            >
              Review All {plan.phases.reduce((sum, p) => sum + p.tasks.length, 0)} Tasks
            </button>
            <button
              onClick={() => {
                setPlan(null);
                setProjectTitle('');
                setProjectObjective('');
                setProjectDescription('');
                setUploadedFileName(null);
              }}
              className="rounded-lg border border-purple-300 px-4 py-2 text-sm font-medium text-purple-700 hover:bg-purple-100 transition"
            >
              Start Over
            </button>
            <button
              onClick={() => {
                setPlan(null);
                setProjectTitle('');
                setProjectObjective('');
                setProjectDescription('');
                setUploadedFileName(null);
              }}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition flex items-center gap-2"
              title="Close this plan and return to projects list"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Done Planning
            </button>
          </div>
        </>
      )}

      {/* Staged Tasks Review & Edit */}
      {stagedTasks.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Review & Edit Tasks</h3>
                <p className="text-sm text-gray-600">
                  <span className="text-purple-600 font-medium">{stagedTasks.filter(t => !t.completed).length}</span> to create
                  {stagedTasks.filter(t => t.completed).length > 0 && (
                    <span className="text-green-600 font-medium ml-2">
                      · {stagedTasks.filter(t => t.completed).length} completed
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={() => setStagedTasks([])}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Task List */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {stagedTasks.map((task) => (
                <div key={task.id} className={`rounded-lg border p-4 hover:bg-gray-100 transition cursor-pointer group ${task.completed ? 'bg-green-50 border-green-200 opacity-60' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-start gap-3" onClick={() => setEditingTask(task)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1">
                          <p className={`font-medium text-sm ${task.completed ? 'text-green-800 line-through' : 'text-gray-900'}`}>
                            {task.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-purple-600">Phase: {task.phase_name}</p>
                            {task.start_date && (
                              <p className="text-xs text-blue-600">
                                📅 Start: {new Date(task.start_date).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-700">{task.duration_minutes}</span>
                          <span className="text-xs text-gray-500">min</span>
                        </div>
                      </div>
                      <p className={`text-xs line-clamp-2 ${task.completed ? 'text-green-700' : 'text-gray-600'}`}>
                        {task.description}
                      </p>
                      {task.completed && (
                        <p className="text-xs text-green-700 font-medium mt-1">✓ Marked as complete</p>
                      )}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTask(task);
                        }}
                        className="text-purple-600 hover:text-purple-800 transition"
                        title="Edit task"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteStagedTask(task.id);
                        }}
                        className="text-red-500 hover:text-red-700 transition"
                        title="Delete task"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer Actions */}
            <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setStagedTasks([])}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={createStagedTasks}
                disabled={isCreating}
                className="flex-1 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:bg-purple-300 disabled:cursor-not-allowed transition"
              >
                {isCreating 
                  ? 'Creating Tasks...' 
                  : stagedTasks.filter(t => !t.completed).length === 0
                    ? 'Done (All Complete)'
                    : `Create ${stagedTasks.filter(t => !t.completed).length} Tasks`
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {editingTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Edit Task</h3>
              <button
                onClick={() => setEditingTask(null)}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Edit Form */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
                <input
                  type="checkbox"
                  id="task-completed"
                  checked={editingTask.completed || false}
                  onChange={(e) => setEditingTask({ ...editingTask, completed: e.target.checked })}
                  className="w-5 h-5 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                />
                <label htmlFor="task-completed" className="flex-1 text-sm font-medium text-gray-900 cursor-pointer">
                  Mark as already completed (will not create this task)
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  Task Title
                </label>
                <input
                  type="text"
                  value={editingTask.title}
                  onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">
                  Will be created as: <span className="font-medium">{projectTitle}: {editingTask.title}</span>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  Phase
                </label>
                <input
                  type="text"
                  value={editingTask.phase_name}
                  onChange={(e) => setEditingTask({ ...editingTask, phase_name: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  Start Date (optional)
                </label>
                <input
                  type="date"
                  value={editingTask.start_date || ''}
                  onChange={(e) => setEditingTask({ ...editingTask, start_date: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  When this task should start (leave empty for no specific start date)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  Duration (minutes)
                </label>
                <input
                  type="number"
                  value={editingTask.duration_minutes}
                  onChange={(e) => setEditingTask({ ...editingTask, duration_minutes: parseInt(e.target.value) || 30 })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  min="15"
                  max="240"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  Description
                </label>
                <textarea
                  value={editingTask.description}
                  onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                  rows={6}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                />
              </div>
            </div>

            {/* Footer Actions */}
            <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setEditingTask(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  updateStagedTask(editingTask.id, editingTask);
                  setEditingTask(null);
                }}
                className="flex-1 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 transition"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
