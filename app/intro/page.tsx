'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';

export default function IntroductionPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [userId, setUserId] = useState<string | null>(null);
  const totalSteps = 4;

  useEffect(() => {
    (async () => {
      const supabase = supabaseBrowser();
      const { data } = await supabase.auth.getSession();
      setUserId(data.session?.user.id ?? null);
    })();
  }, []);

  const markIntroComplete = async () => {
    if (!userId) return;
    
    const supabase = supabaseBrowser();
    await supabase
      .from('users')
      .update({ has_seen_intro: true })
      .eq('id', userId);
  };

  const nextStep = async () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    } else {
      await markIntroComplete();
      router.push('/');
    }
  };

  const skipIntro = async () => {
    await markIntroComplete();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl p-8">
        {/* Progress indicator */}
        <div className="flex justify-center mb-8">
          <div className="flex space-x-2">
            {[...Array(totalSteps)].map((_, i) => (
              <div
                key={i}
                className={`h-2 w-12 rounded-full transition-colors ${
                  i + 1 <= currentStep ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="text-center space-y-6">
          {currentStep === 1 && (
            <>
              <h1 className="text-4xl font-bold text-gray-900">Welcome to DayFlow! 🎉</h1>
              <p className="text-lg text-gray-600">
                DayFlow is your intelligent daily planner that helps you schedule tasks, manage routines, and stay productive.
              </p>
              <div className="pt-4">
                <div className="inline-block p-4 bg-blue-50 rounded-lg">
                  <p className="text-blue-900 font-semibold">Let's get you started with a quick tour</p>
                </div>
              </div>
            </>
          )}

          {currentStep === 2 && (
            <>
              <h2 className="text-3xl font-bold text-gray-900">📋 Task Templates</h2>
              <p className="text-lg text-gray-600">
                Create task templates with durations, priorities, and schedules. DayFlow will automatically fit them into your day.
              </p>
              <div className="bg-gray-50 rounded-lg p-6 text-left space-y-2">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">✅</span>
                  <span className="text-gray-700"><strong>One-off tasks:</strong> Single tasks to complete</span>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">🔄</span>
                  <span className="text-gray-700"><strong>Recurring tasks:</strong> Daily, weekly, or monthly</span>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">📅</span>
                  <span className="text-gray-700"><strong>Appointments:</strong> Fixed time events</span>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">🌅</span>
                  <span className="text-gray-700"><strong>Routines:</strong> Morning/evening activities</span>
                </div>
              </div>
            </>
          )}

          {currentStep === 3 && (
            <>
              <h2 className="text-3xl font-bold text-gray-900">🤖 Automatic Scheduling</h2>
              <p className="text-lg text-gray-600">
                Every morning at 7 AM, DayFlow automatically creates your daily schedule based on your templates.
              </p>
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 space-y-4">
                <div className="text-left space-y-3">
                  <p className="text-gray-700">
                    <strong className="text-blue-600">Smart scheduling:</strong> Tasks are arranged by priority and time constraints
                  </p>
                  <p className="text-gray-700">
                    <strong className="text-blue-600">Flexible tasks:</strong> Non-appointment tasks can be moved around
                  </p>
                  <p className="text-gray-700">
                    <strong className="text-blue-600">Carry forward:</strong> Incomplete tasks roll over to the next day
                  </p>
                </div>
              </div>
            </>
          )}

          {currentStep === 4 && (
            <>
              <h2 className="text-3xl font-bold text-gray-900">🎯 Ready to Start!</h2>
              <p className="text-lg text-gray-600">
                You're all set! Here's what to do next:
              </p>
              <div className="bg-gray-50 rounded-lg p-6 text-left space-y-4">
                <div className="flex items-start space-x-3">
                  <span className="text-2xl flex-shrink-0">1️⃣</span>
                  <div>
                    <p className="font-semibold text-gray-900">Create your first task template</p>
                    <p className="text-gray-600 text-sm">Go to Tasks and add activities you want to schedule</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <span className="text-2xl flex-shrink-0">2️⃣</span>
                  <div>
                    <p className="font-semibold text-gray-900">Check your Today view</p>
                    <p className="text-gray-600 text-sm">See your scheduled tasks for the day</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <span className="text-2xl flex-shrink-0">3️⃣</span>
                  <div>
                    <p className="font-semibold text-gray-900">Use "Recreate Schedule"</p>
                    <p className="text-gray-600 text-sm">Regenerate your schedule anytime you make changes</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Navigation buttons */}
        <div className="flex justify-between mt-8 pt-6 border-t">
          <button
            onClick={skipIntro}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            Skip intro
          </button>
          <button
            onClick={nextStep}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            {currentStep === totalSteps ? 'Get Started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
